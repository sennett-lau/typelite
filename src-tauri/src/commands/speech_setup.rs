//! Plan `quick-speech-setup`: Quick speech setup. Downloads a Whisper model, creates and selects
//! the "Built-in (this Mac)" preset, tests it, and marks it ready.
//!
//! The work runs in a background task owned by the backend, so it keeps going when the user
//! leaves the onboarding step or Settings. Every change of the status is sent to all windows
//! as [`SPEECH_SETUP_EVENT`]; a window that opens later asks for the current status with
//! `get_speech_setup_status`.

use serde::Serialize;
use serde_json::json;
use tauri::{Emitter, Manager};

use super::model_setup::{self, ModelSetupState, SetupPhase, SetupStatus};
use crate::storage;
use crate::stt::models::{self, DownloadError, KnownModel};

/// Event with a [`SpeechSetupStatus`] payload.
pub const SPEECH_SETUP_EVENT: &str = "speech-setup:status";

/// What the Quick setup card shows (shared with Built-in AI, see `model_setup`).
pub type SpeechSetupStatus = SetupStatus;

/// Tauri state: the current status and the cancel switch of the running speech setup.
#[derive(Default)]
pub struct SpeechSetupState(pub ModelSetupState);

impl std::ops::Deref for SpeechSetupState {
    type Target = ModelSetupState;
    fn deref(&self) -> &ModelSetupState {
        &self.0
    }
}

const BUSY: &str = "A speech model download is already running";

fn emit(app: &tauri::AppHandle, status: &SpeechSetupStatus) {
    let _ = app.emit(SPEECH_SETUP_EVENT, status);
}

pub(crate) fn models_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|dir| models::models_dir_in(&dir))
        .map_err(|error| error.to_string())
}

/// Sets the models folder for the in-process engine and makes built-in presets match the
/// files on disk (called once at startup).
pub async fn init(app: &tauri::AppHandle) {
    let Ok(dir) = models_dir(app) else {
        return;
    };
    crate::stt::builtin::engine().set_models_dir(dir.clone());
    let installed = models::installed_pairs(&dir);
    let state = app.state::<storage::ConfigManager>();
    let Ok(mut config) = state.load().await else {
        return;
    };
    if config.reconcile_builtin_models(&installed) {
        tracing::info!("Built-in speech presets updated to match the installed models");
        if let Err(error) = state.save(&config).await {
            tracing::warn!("Failed to save the built-in speech presets: {error}");
        }
    }
}

#[tauri::command]
pub fn get_speech_setup_status(state: tauri::State<'_, SpeechSetupState>) -> SpeechSetupStatus {
    state.status()
}

/// One row of Settings → Speech → Built-in models.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeechModelInfo {
    pub id: String,
    pub file_name: String,
    pub size_bytes: u64,
    pub installed: bool,
}

#[tauri::command]
pub fn list_speech_models(app: tauri::AppHandle) -> Result<Vec<SpeechModelInfo>, String> {
    let dir = models_dir(&app)?;
    let installed = models::installed_models(&dir);
    Ok(models::KNOWN_MODELS
        .iter()
        .map(|model| SpeechModelInfo {
            id: model.id.to_string(),
            file_name: model.file_name.to_string(),
            size_bytes: model.size_bytes,
            installed: installed.iter().any(|m| m.id == model.id),
        })
        .collect())
}

/// Plan `two-tab-speech`: the chip, memory and free disk space of this Mac, and the built-in models
/// the speech screens offer on it (see `stt::hardware::offer_models`).
#[tauri::command]
pub async fn get_speech_hardware(
    app: tauri::AppHandle,
) -> Result<crate::stt::hardware::HardwareCheck, String> {
    let dir = models_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let hardware = crate::stt::hardware::detect(&dir);
        let installed: Vec<String> = models::installed_models(&dir)
            .into_iter()
            .map(|model| model.id)
            .collect();
        let offer = crate::stt::hardware::offer_models(&hardware, &installed);
        tracing::info!(
            "Speech hardware check: {:?} '{}', {} GB memory, {} MB free, offered {:?}",
            hardware.chip_kind,
            hardware.chip_name,
            hardware.memory_bytes / (1024 * 1024 * 1024),
            hardware.free_bytes / 1_000_000,
            offer
                .models
                .iter()
                .map(|m| m.id.as_str())
                .collect::<Vec<_>>()
        );
        crate::stt::hardware::HardwareCheck { hardware, offer }
    })
    .await
    .map_err(|error| error.to_string())
}

/// Deletes a model file. Built-in presets that used it move to another installed model or
/// are removed (see `AppConfig::reconcile_builtin_models`).
#[tauri::command]
pub async fn delete_speech_model(
    app: tauri::AppHandle,
    state: tauri::State<'_, storage::ConfigManager>,
    setup: tauri::State<'_, SpeechSetupState>,
    model_id: String,
) -> Result<(), String> {
    let model = models::known_model(&model_id).ok_or("Unknown speech model")?;
    let status = setup.status();
    if status.running() && status.model_id.as_deref() == Some(model.id) {
        return Err("This model is being set up right now".to_string());
    }
    let dir = models_dir(&app)?;
    crate::stt::builtin::engine().unload_path(&dir.join(model.file_name));
    models::delete_model(&dir, model).map_err(|error| error.to_string())?;

    let mut config = state.load().await.map_err(|e| e.to_string())?;
    if config.reconcile_builtin_models(&models::installed_pairs(&dir)) {
        state.save(&config).await.map_err(|e| e.to_string())?;
        emit_speech_presets(&app, &config);
    }
    if status.model_id.as_deref() == Some(model.id) && status.phase == SetupPhase::Ready {
        let cleared = setup.update(|status| *status = SpeechSetupStatus::default());
        emit(&app, &cleared);
    }
    Ok(())
}

fn emit_speech_presets(app: &tauri::AppHandle, config: &storage::AppConfig) {
    let _ = app.emit(
        "config:patch",
        json!({
            "speech_presets": config.speech_presets,
            "active_speech_preset_id": config.active_speech_preset_id,
        }),
    );
}

/// Starts Quick setup for a model (`large-v3-turbo` when `model_id` is empty). Returns at
/// once; progress arrives as [`SPEECH_SETUP_EVENT`].
#[tauri::command]
pub fn start_speech_setup(
    app: tauri::AppHandle,
    setup: tauri::State<'_, SpeechSetupState>,
    model_id: Option<String>,
) -> Result<(), String> {
    let model_id = model_id
        .filter(|id| !id.trim().is_empty())
        .unwrap_or_else(|| models::DEFAULT_MODEL_ID.to_string());
    let model = *models::known_model(&model_id).ok_or("Unknown speech model")?;
    let dir = models_dir(&app)?;
    let cancel = setup.begin(&model, BUSY)?;
    emit(&app, &setup.status());
    tracing::info!("Quick speech setup started for {}", model.id);

    tauri::async_runtime::spawn(async move {
        let result = run_setup(&app, &dir, model, cancel).await;
        let status = app.state::<SpeechSetupState>().finish(&result);
        match &result {
            Ok(_) => tracing::info!("Quick speech setup finished: {} is ready", model.id),
            Err(error) => tracing::warn!("Quick speech setup for {} stopped: {error}", model.id),
        }
        emit(&app, &status);
    });
    Ok(())
}

#[tauri::command]
pub fn cancel_speech_setup(setup: tauri::State<'_, SpeechSetupState>) -> bool {
    setup.cancel()
}

async fn run_setup(
    app: &tauri::AppHandle,
    dir: &std::path::Path,
    model: KnownModel,
    cancel: tokio::sync::watch::Receiver<bool>,
) -> Result<u32, DownloadError> {
    model_setup::download_with_progress(
        app,
        |app| &app.state::<SpeechSetupState>().inner().0,
        SPEECH_SETUP_EVENT,
        dir,
        model,
        format!("{}/{}", models::MODEL_BASE_URL, model.file_name),
        cancel,
    )
    .await?;

    let status = app.state::<SpeechSetupState>().testing(&model);
    emit(app, &status);

    // Create the preset, then test it; select it only when the test passes.
    let config_state = app.state::<storage::ConfigManager>();
    let mut config = config_state
        .load()
        .await
        .map_err(|error| DownloadError::Io {
            reason: error.to_string(),
        })?;
    let previous_active = config.active_speech_preset_id.clone();
    let preset = config.install_builtin_whisper(model.id, model.file_name);
    let test = crate::stt::builtin::self_test(&preset.model_file).await;
    match &test {
        Ok(ms) => {
            tracing::info!("Built-in speech preset passed its test in {ms} ms");
            config.mark_speech_verified(&preset, storage::now_unix_ms());
        }
        Err(_) => config.active_speech_preset_id = previous_active,
    }
    config_state
        .save(&config)
        .await
        .map_err(|error| DownloadError::Io {
            reason: error.to_string(),
        })?;
    emit_speech_presets(app, &config);
    test.map_err(|reason| DownloadError::Load { reason })
}
