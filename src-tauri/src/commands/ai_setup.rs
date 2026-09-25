//! Plan 0017: Built-in AI setup. Downloads a model, points the "Built-in (this Mac)" AI preset
//! at it, starts `llama-server`, sends one test request, and marks the preset ready. The
//! download, progress and cancel work as for speech (`model_setup`).

use serde::Serialize;
use serde_json::json;
use tauri::{Emitter, Manager};

use super::model_setup::{self, ModelSetupState, SetupPhase, SetupStatus};
use super::speech_setup::models_dir;
use crate::llm::builtin::{self, ServerError};
use crate::llm::models::{self as ai_models, AiModel};
use crate::storage;
use crate::stt::models::{self, DownloadError};

/// Event with a [`SetupStatus`] payload.
pub const AI_SETUP_EVENT: &str = "ai-setup:status";
const BUSY: &str = "An AI model download is already running";

/// Tauri state: the current status and the cancel switch of the running AI setup.
#[derive(Default)]
pub struct AiSetupState(pub ModelSetupState);

impl std::ops::Deref for AiSetupState {
    type Target = ModelSetupState;
    fn deref(&self) -> &ModelSetupState {
        &self.0
    }
}

fn emit(app: &tauri::AppHandle, status: &SetupStatus) {
    let _ = app.emit(AI_SETUP_EVENT, status);
}

fn emit_ai_presets(app: &tauri::AppHandle, config: &storage::AppConfig) {
    let _ = app.emit(
        "config:patch",
        json!({
            "ai_presets": config.ai_presets,
            "active_ai_preset_id": config.active_ai_preset_id,
        }),
    );
}

/// At startup: tells the server manager where models live (stopping a server a crashed run
/// left behind), makes the Built-in preset match the files on disk, and starts the server when
/// Built-in AI is the engine in use.
pub async fn init(app: &tauri::AppHandle) {
    let Ok(dir) = models_dir(app) else {
        return;
    };
    let pid_file = dir
        .parent()
        .map(|data| data.join("llama-server.pid"))
        .unwrap_or_else(|| dir.join("llama-server.pid"));
    builtin::server().set_paths(dir.clone(), pid_file);
    let state = app.state::<storage::ConfigManager>();
    let Ok(mut config) = state.load().await else {
        return;
    };
    if config.reconcile_builtin_ai_models(&ai_models::installed_pairs(&dir)) {
        tracing::info!("Built-in AI preset updated to match the installed models");
        if let Err(error) = state.save(&config).await {
            tracing::warn!("Failed to save the built-in AI preset: {error}");
        }
    }
    tracing::info!(
        "Built-in AI server program {}",
        if builtin::server().binary_available() {
            "found"
        } else {
            "missing"
        }
    );
    builtin::sync_with_config(&config);
}

#[tauri::command]
pub fn get_ai_setup_status(state: tauri::State<'_, AiSetupState>) -> SetupStatus {
    state.status()
}

/// One row of Settings → AI → Built-in models (same shape as the speech list).
#[tauri::command]
pub fn list_ai_models(
    app: tauri::AppHandle,
) -> Result<Vec<super::speech_setup::SpeechModelInfo>, String> {
    let dir = models_dir(&app)?;
    let installed = ai_models::installed(&dir);
    Ok(ai_models::AI_MODELS
        .iter()
        .map(|model| super::speech_setup::SpeechModelInfo {
            id: model.file.id.to_string(),
            file_name: model.file.file_name.to_string(),
            size_bytes: model.file.size_bytes,
            installed: installed.iter().any(|m| m.id == model.file.id),
        })
        .collect())
}

/// The result of `get_ai_hardware`: the speech check's fields plus whether this copy of
/// Typelite has the server program.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiHardwareCheck {
    pub hardware: crate::stt::hardware::Hardware,
    pub offer: crate::stt::hardware::ModelOffer,
    pub server_available: bool,
}

/// The chip, memory and free disk space of this Mac, and the AI models offered on it.
#[tauri::command]
pub async fn get_ai_hardware(app: tauri::AppHandle) -> Result<AiHardwareCheck, String> {
    let dir = models_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let hardware = crate::stt::hardware::detect(&dir);
        let installed: Vec<String> = ai_models::installed(&dir)
            .into_iter()
            .map(|model| model.id)
            .collect();
        let offer = ai_models::offer_models(&hardware, &installed);
        let server_available = builtin::server().binary_available();
        tracing::info!(
            "AI hardware check: offered {:?}, server program {}",
            offer
                .models
                .iter()
                .map(|m| m.id.as_str())
                .collect::<Vec<_>>(),
            if server_available { "found" } else { "missing" }
        );
        AiHardwareCheck {
            hardware,
            offer,
            server_available,
        }
    })
    .await
    .map_err(|error| error.to_string())
}

/// Deletes an AI model file (stopping the server first when it uses it). The Built-in preset
/// moves to another installed model or loses its model (see
/// `AppConfig::reconcile_builtin_ai_models`).
#[tauri::command]
pub async fn delete_ai_model(
    app: tauri::AppHandle,
    state: tauri::State<'_, storage::ConfigManager>,
    setup: tauri::State<'_, AiSetupState>,
    model_id: String,
) -> Result<(), String> {
    let model = ai_models::ai_model(&model_id).ok_or("Unknown AI model")?;
    let status = setup.status();
    if status.running() && status.model_id.as_deref() == Some(model.file.id) {
        return Err("This model is being set up right now".to_string());
    }
    let dir = models_dir(&app)?;
    if builtin::server().running_model_file().as_deref() == Some(model.file.file_name) {
        builtin::server().stop();
    }
    models::delete_model(&dir, &model.file).map_err(|error| error.to_string())?;

    let mut config = state.load().await.map_err(|e| e.to_string())?;
    if config.reconcile_builtin_ai_models(&ai_models::installed_pairs(&dir)) {
        state.save(&config).await.map_err(|e| e.to_string())?;
        emit_ai_presets(&app, &config);
    }
    if status.model_id.as_deref() == Some(model.file.id) && status.phase == SetupPhase::Ready {
        let cleared = setup.update(|status| *status = SetupStatus::default());
        emit(&app, &cleared);
    }
    Ok(())
}

/// Starts Built-in AI setup for a model (`qwen3-4b` when `model_id` is empty). Returns at once;
/// progress arrives as [`AI_SETUP_EVENT`].
#[tauri::command]
pub fn start_ai_setup(
    app: tauri::AppHandle,
    setup: tauri::State<'_, AiSetupState>,
    model_id: Option<String>,
) -> Result<(), String> {
    let model_id = model_id
        .filter(|id| !id.trim().is_empty())
        .unwrap_or_else(|| ai_models::DEFAULT_MODEL_ID.to_string());
    let model = *ai_models::ai_model(&model_id).ok_or("Unknown AI model")?;
    let dir = models_dir(&app)?;
    let cancel = setup.begin(&model.file, BUSY)?;
    emit(&app, &setup.status());
    tracing::info!("Built-in AI setup started for {}", model.file.id);

    tauri::async_runtime::spawn(async move {
        let result = run_setup(&app, &dir, model, cancel).await;
        let status = app.state::<AiSetupState>().finish(&result);
        match &result {
            Ok(ms) => tracing::info!(
                "Built-in AI setup finished: {} is ready (test {ms} ms)",
                model.file.id
            ),
            Err(error) => {
                tracing::warn!("Built-in AI setup for {} stopped: {error}", model.file.id)
            }
        }
        emit(&app, &status);
    });
    Ok(())
}

#[tauri::command]
pub fn cancel_ai_setup(setup: tauri::State<'_, AiSetupState>) -> bool {
    setup.cancel()
}

/// How a server error shows on the setup card.
fn setup_error(error: ServerError) -> DownloadError {
    match error {
        ServerError::BinaryMissing => DownloadError::ServerMissing,
        other => DownloadError::Load {
            reason: other.to_string(),
        },
    }
}

async fn run_setup(
    app: &tauri::AppHandle,
    dir: &std::path::Path,
    model: AiModel,
    cancel: tokio::sync::watch::Receiver<bool>,
) -> Result<u32, DownloadError> {
    // Without the server program there is nothing to run the model with; say so before a
    // download of gigabytes.
    if !builtin::server().binary_available() {
        return Err(DownloadError::ServerMissing);
    }
    model_setup::download_with_progress(
        app,
        |app| &app.state::<AiSetupState>().inner().0,
        AI_SETUP_EVENT,
        dir,
        model.file,
        model.url.to_string(),
        cancel,
    )
    .await?;

    let status = app.state::<AiSetupState>().testing(&model.file);
    emit(app, &status);

    // Point the preset at the model, start the server and test it; select the preset only
    // when the test passes.
    let config_state = app.state::<storage::ConfigManager>();
    let io = |error: String| DownloadError::Io { reason: error };
    let mut config = config_state
        .load()
        .await
        .map_err(|error| io(error.to_string()))?;
    let previous_active = config.active_ai_preset_id.clone();
    let preset = config.install_builtin_llama(model.file.id, model.file.file_name);
    let test = match builtin::server()
        .ensure(&preset.model_file, &preset.model)
        .await
    {
        Ok(endpoint) => builtin::test_request(&endpoint, &preset.model)
            .await
            .map_err(|reason| DownloadError::Load {
                reason: format!("The built-in AI model did not answer: {reason}"),
            }),
        Err(error) => Err(setup_error(error)),
    };
    match &test {
        Ok(ms) => {
            tracing::info!("Built-in AI preset passed its test in {ms} ms");
            config.mark_ai_verified(&preset, storage::now_unix_ms());
        }
        Err(_) => config.active_ai_preset_id = previous_active,
    }
    config_state
        .save(&config)
        .await
        .map_err(|error| io(error.to_string()))?;
    emit_ai_presets(app, &config);
    builtin::sync_with_config(&config);
    test
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_missing_server_program_has_its_own_error() {
        assert_eq!(
            setup_error(ServerError::BinaryMissing),
            DownloadError::ServerMissing
        );
        assert!(matches!(
            setup_error(ServerError::Timeout),
            DownloadError::Load { reason } if reason.contains("did not start")
        ));
    }

    #[test]
    fn the_hardware_check_serialises_for_the_frontend() {
        let check = AiHardwareCheck {
            hardware: crate::stt::hardware::Hardware {
                chip_kind: crate::stt::hardware::ChipKind::Intel,
                chip_name: "Intel".into(),
                memory_bytes: 1,
                free_bytes: 2,
            },
            offer: crate::stt::hardware::ModelOffer {
                models: Vec::new(),
                left_out: Some(crate::stt::hardware::LeftOutReason::NeedsAppleSilicon),
                needed_bytes: None,
            },
            server_available: false,
        };
        let value = serde_json::to_value(&check).unwrap();
        assert_eq!(value["serverAvailable"], false);
        assert_eq!(value["offer"]["leftOut"], "needs_apple_silicon");
        assert_eq!(value["hardware"]["chipKind"], "intel");
    }
}
