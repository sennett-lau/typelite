//! Plan 0012: Quick speech setup. Downloads a Whisper model, creates and selects the
//! "Built-in (this Mac)" preset, tests it, and marks it ready.
//!
//! The work runs in a background task owned by the backend, so it keeps going when the user
//! leaves the onboarding step or Settings. Every change of the status is sent to all windows
//! as [`SPEECH_SETUP_EVENT`]; a window that opens later asks for the current status with
//! `get_speech_setup_status`.

use std::sync::Mutex;

use serde::Serialize;
use serde_json::json;
use tauri::{Emitter, Manager};

use crate::storage;
use crate::stt::models::{self, DownloadError, DownloadProgress, KnownModel};

/// Event with a [`SpeechSetupStatus`] payload.
pub const SPEECH_SETUP_EVENT: &str = "speech-setup:status";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum SetupPhase {
    /// Nothing running.
    #[default]
    Idle,
    Downloading,
    /// Checking the SHA-256.
    Verifying,
    /// Loading the model and running the automatic test.
    Testing,
    /// Done: the built-in preset is selected and ready.
    Ready,
    /// Stopped with `error` (a cancel is an error with code `cancelled`).
    Error,
}

/// What the Quick setup card shows.
#[derive(Debug, Clone, PartialEq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SpeechSetupStatus {
    pub model_id: Option<String>,
    pub phase: SetupPhase,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub bytes_per_second: u64,
    pub error: Option<DownloadError>,
}

impl SpeechSetupStatus {
    fn running(&self) -> bool {
        matches!(
            self.phase,
            SetupPhase::Downloading | SetupPhase::Verifying | SetupPhase::Testing
        )
    }
}

/// Tauri state: the current status and the cancel switch of the running setup.
#[derive(Default)]
pub struct SpeechSetupState {
    inner: Mutex<SetupInner>,
}

#[derive(Default)]
struct SetupInner {
    status: SpeechSetupStatus,
    cancel: Option<tokio::sync::watch::Sender<bool>>,
}

impl SpeechSetupState {
    pub fn status(&self) -> SpeechSetupStatus {
        self.lock().status.clone()
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, SetupInner> {
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Starts a setup for `model` unless one is running. Returns the cancel receiver.
    fn begin(&self, model: &KnownModel) -> Result<tokio::sync::watch::Receiver<bool>, String> {
        let mut inner = self.lock();
        if inner.status.running() {
            return Err("A speech model download is already running".to_string());
        }
        let (tx, rx) = tokio::sync::watch::channel(false);
        inner.cancel = Some(tx);
        inner.status = SpeechSetupStatus {
            model_id: Some(model.id.to_string()),
            phase: SetupPhase::Downloading,
            total_bytes: model.size_bytes,
            ..SpeechSetupStatus::default()
        };
        Ok(rx)
    }

    /// Changes the status and returns the new one.
    fn update(&self, change: impl FnOnce(&mut SpeechSetupStatus)) -> SpeechSetupStatus {
        let mut inner = self.lock();
        change(&mut inner.status);
        if !inner.status.running() {
            inner.cancel = None;
        }
        inner.status.clone()
    }

    /// Asks the running setup to stop. Only the download can be cancelled; later steps are
    /// short and finish.
    fn cancel(&self) -> bool {
        let inner = self.lock();
        match (&inner.cancel, inner.status.phase) {
            (Some(tx), SetupPhase::Downloading) => tx.send(true).is_ok(),
            _ => false,
        }
    }
}

fn emit(app: &tauri::AppHandle, status: &SpeechSetupStatus) {
    let _ = app.emit(SPEECH_SETUP_EVENT, status);
}

fn models_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
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
    let cancel = setup.begin(&model)?;
    emit(&app, &setup.status());
    tracing::info!("Quick speech setup started for {}", model.id);

    tauri::async_runtime::spawn(async move {
        let result = run_setup(&app, &dir, model, cancel).await;
        let state = app.state::<SpeechSetupState>();
        let status = state.update(|status| match &result {
            Ok(()) => status.phase = SetupPhase::Ready,
            Err(error) => {
                status.phase = SetupPhase::Error;
                status.error = Some(error.clone());
            }
        });
        match &result {
            Ok(()) => tracing::info!("Quick speech setup finished: {} is ready", model.id),
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
) -> Result<(), DownloadError> {
    let started = std::time::Instant::now();
    // Not the shared client: its 30 s request timeout would cut a large download short. A
    // stalled transfer is caught by the download's own stall timeout instead.
    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|error| DownloadError::Network {
            reason: error.to_string(),
        })?;
    let setup = app.state::<SpeechSetupState>();
    let already_installed = models::installed_models(dir)
        .iter()
        .any(|installed| installed.id == model.id);

    if !already_installed {
        let progress_app = app.clone();
        let on_progress = move |progress: DownloadProgress| {
            let state = progress_app.state::<SpeechSetupState>();
            let status = state.update(|status| {
                status.downloaded_bytes = progress.downloaded_bytes;
                status.total_bytes = progress.total_bytes;
                status.bytes_per_second = progress.bytes_per_second;
                if progress.downloaded_bytes >= progress.total_bytes {
                    status.phase = SetupPhase::Verifying;
                }
            });
            emit(&progress_app, &status);
        };
        models::download_model(
            models::DownloadRequest {
                client: &client,
                url: format!("{}/{}", models::MODEL_BASE_URL, model.file_name),
                dir,
                model,
                cancel,
                available_space: &models::disk_available_space,
            },
            on_progress,
        )
        .await?;
        tracing::info!(
            "Model {} downloaded and verified in {:.1} s",
            model.file_name,
            started.elapsed().as_secs_f64()
        );
    }

    let status = setup.update(|status| {
        status.phase = SetupPhase::Testing;
        status.downloaded_bytes = model.size_bytes;
        status.bytes_per_second = 0;
    });
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
    test.map(|_| ())
        .map_err(|reason| DownloadError::Load { reason })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_second_setup_cannot_start_while_one_runs() {
        let state = SpeechSetupState::default();
        let model = models::known_model("small").unwrap();
        let _rx = state.begin(model).unwrap();
        let status = state.status();
        assert_eq!(status.phase, SetupPhase::Downloading);
        assert_eq!(status.model_id.as_deref(), Some("small"));
        assert_eq!(status.total_bytes, model.size_bytes);
        assert!(state.begin(model).is_err());

        // Once it stopped, a retry may start and clears the old error.
        state.update(|s| {
            s.phase = SetupPhase::Error;
            s.error = Some(DownloadError::Checksum);
        });
        let _rx = state.begin(model).unwrap();
        assert_eq!(state.status().error, None);
    }

    #[test]
    fn cancel_reaches_the_download_only_while_downloading() {
        let state = SpeechSetupState::default();
        assert!(!state.cancel());
        let model = models::known_model("small").unwrap();
        let rx = state.begin(model).unwrap();
        assert!(state.cancel());
        assert!(*rx.borrow());

        let _rx = {
            state.update(|s| s.phase = SetupPhase::Error);
            state.begin(model).unwrap()
        };
        state.update(|s| s.phase = SetupPhase::Testing);
        assert!(!state.cancel());
    }

    #[test]
    fn status_serialises_for_the_frontend() {
        let status = SpeechSetupStatus {
            model_id: Some("large-v3-turbo".into()),
            phase: SetupPhase::Error,
            downloaded_bytes: 10,
            total_bytes: 20,
            bytes_per_second: 5,
            error: Some(DownloadError::DiskSpace {
                needed_bytes: 100,
                available_bytes: 50,
            }),
        };
        assert_eq!(
            serde_json::to_value(&status).unwrap(),
            json!({
                "modelId": "large-v3-turbo",
                "phase": "error",
                "downloadedBytes": 10,
                "totalBytes": 20,
                "bytesPerSecond": 5,
                "error": {"code": "disk_space", "neededBytes": 100, "availableBytes": 50},
            })
        );
        assert_eq!(
            serde_json::to_value(DownloadError::Network {
                reason: "offline".into()
            })
            .unwrap(),
            json!({"code": "network", "reason": "offline"})
        );
        assert_eq!(
            serde_json::to_value(DownloadError::Checksum).unwrap(),
            json!({"code": "checksum"})
        );
    }
}
