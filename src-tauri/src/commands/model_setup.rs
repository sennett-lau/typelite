//! The part of a built-in model setup that speech (plan 0012) and AI (plan 0017) share: the
//! status the setup card shows, the state that holds it with the cancel switch, and the
//! download with progress events.
//!
//! The work runs in a background task owned by the backend, so it keeps going when the user
//! leaves the onboarding step or Settings. Every change of the status is sent to all windows as
//! one event (`speech-setup:status` or `ai-setup:status`); a window that opens later asks for
//! the current status.

use std::sync::Mutex;

use serde::Serialize;
use tauri::Emitter;

use crate::stt::models::{self, DownloadError, DownloadProgress, KnownModel};

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

/// What the setup card shows.
#[derive(Debug, Clone, PartialEq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SetupStatus {
    pub model_id: Option<String>,
    pub phase: SetupPhase,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub bytes_per_second: u64,
    pub error: Option<DownloadError>,
    /// How long the automatic test took once the model was ready (milliseconds).
    pub test_ms: Option<u32>,
}

impl SetupStatus {
    pub fn running(&self) -> bool {
        matches!(
            self.phase,
            SetupPhase::Downloading | SetupPhase::Verifying | SetupPhase::Testing
        )
    }
}

/// The current status and the cancel switch of the running setup. Speech and AI each keep one
/// (wrapped in their own Tauri state type).
#[derive(Default)]
pub struct ModelSetupState {
    inner: Mutex<SetupInner>,
}

#[derive(Default)]
struct SetupInner {
    status: SetupStatus,
    cancel: Option<tokio::sync::watch::Sender<bool>>,
}

impl ModelSetupState {
    pub fn status(&self) -> SetupStatus {
        self.lock().status.clone()
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, SetupInner> {
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Starts a setup for `model` unless one is running (then `busy` is the error). Returns
    /// the cancel receiver.
    pub fn begin(
        &self,
        model: &KnownModel,
        busy: &str,
    ) -> Result<tokio::sync::watch::Receiver<bool>, String> {
        let mut inner = self.lock();
        if inner.status.running() {
            return Err(busy.to_string());
        }
        let (tx, rx) = tokio::sync::watch::channel(false);
        inner.cancel = Some(tx);
        inner.status = SetupStatus {
            model_id: Some(model.id.to_string()),
            phase: SetupPhase::Downloading,
            total_bytes: model.size_bytes,
            ..SetupStatus::default()
        };
        Ok(rx)
    }

    /// Changes the status and returns the new one.
    pub fn update(&self, change: impl FnOnce(&mut SetupStatus)) -> SetupStatus {
        let mut inner = self.lock();
        change(&mut inner.status);
        if !inner.status.running() {
            inner.cancel = None;
        }
        inner.status.clone()
    }

    /// Asks the running setup to stop. Only the download can be cancelled; later steps are
    /// short and finish.
    pub fn cancel(&self) -> bool {
        let inner = self.lock();
        match (&inner.cancel, inner.status.phase) {
            (Some(tx), SetupPhase::Downloading) => tx.send(true).is_ok(),
            _ => false,
        }
    }

    /// Records how a setup ended and returns the final status.
    pub fn finish(&self, result: &Result<u32, DownloadError>) -> SetupStatus {
        self.update(|status| match result {
            Ok(ms) => {
                status.phase = SetupPhase::Ready;
                status.test_ms = Some(*ms);
            }
            Err(error) => {
                status.phase = SetupPhase::Error;
                status.error = Some(error.clone());
            }
        })
    }

    /// Moves to the Testing phase after the file is in place.
    pub fn testing(&self, model: &KnownModel) -> SetupStatus {
        self.update(|status| {
            status.phase = SetupPhase::Testing;
            status.downloaded_bytes = model.size_bytes;
            status.bytes_per_second = 0;
        })
    }
}

/// Downloads `model` from `url` into `dir` unless it is installed, sending every progress
/// change as `event`. `state` is looked up again for each progress report.
pub async fn download_with_progress(
    app: &tauri::AppHandle,
    state: impl Fn(&tauri::AppHandle) -> &ModelSetupState + Send + Sync + Clone + 'static,
    event: &'static str,
    dir: &std::path::Path,
    model: KnownModel,
    url: String,
    cancel: tokio::sync::watch::Receiver<bool>,
) -> Result<(), DownloadError> {
    if models::installed_from(dir, &[model])
        .iter()
        .any(|installed| installed.id == model.id)
    {
        return Ok(());
    }
    let started = std::time::Instant::now();
    // Not the shared client: its 30 s request timeout would cut a large download short. A
    // stalled transfer is caught by the download's own stall timeout instead.
    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|error| DownloadError::Network {
            reason: error.to_string(),
        })?;
    let progress_app = app.clone();
    let on_progress = move |progress: DownloadProgress| {
        let status = state(&progress_app).update(|status| {
            status.downloaded_bytes = progress.downloaded_bytes;
            status.total_bytes = progress.total_bytes;
            status.bytes_per_second = progress.bytes_per_second;
            if progress.downloaded_bytes >= progress.total_bytes {
                status.phase = SetupPhase::Verifying;
            }
        });
        let _ = progress_app.emit(event, &status);
    };
    models::download_model(
        models::DownloadRequest {
            client: &client,
            url,
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
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn model() -> KnownModel {
        *models::known_model("small").unwrap()
    }

    #[test]
    fn a_second_setup_cannot_start_while_one_runs() {
        let state = ModelSetupState::default();
        let model = model();
        let _rx = state.begin(&model, "busy").unwrap();
        let status = state.status();
        assert_eq!(status.phase, SetupPhase::Downloading);
        assert_eq!(status.model_id.as_deref(), Some("small"));
        assert_eq!(status.total_bytes, model.size_bytes);
        assert_eq!(state.begin(&model, "busy").unwrap_err(), "busy");

        // Once it stopped, a retry may start and clears the old error.
        state.finish(&Err(DownloadError::Checksum));
        let _rx = state.begin(&model, "busy").unwrap();
        assert_eq!(state.status().error, None);
    }

    #[test]
    fn cancel_reaches_the_download_only_while_downloading() {
        let state = ModelSetupState::default();
        assert!(!state.cancel());
        let model = model();
        let rx = state.begin(&model, "busy").unwrap();
        assert!(state.cancel());
        assert!(*rx.borrow());

        state.update(|s| s.phase = SetupPhase::Error);
        let _rx = state.begin(&model, "busy").unwrap();
        state.testing(&model);
        assert!(!state.cancel());
        assert_eq!(state.status().downloaded_bytes, model.size_bytes);
        let done = state.finish(&Ok(640));
        assert_eq!(done.phase, SetupPhase::Ready);
        assert_eq!(done.test_ms, Some(640));
    }

    #[test]
    fn status_serialises_for_the_frontend() {
        let status = SetupStatus {
            model_id: Some("large-v3-turbo".into()),
            phase: SetupPhase::Error,
            downloaded_bytes: 10,
            total_bytes: 20,
            bytes_per_second: 5,
            error: Some(DownloadError::DiskSpace {
                needed_bytes: 100,
                available_bytes: 50,
            }),
            test_ms: None,
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
                "testMs": null,
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
        assert_eq!(
            serde_json::to_value(DownloadError::ServerMissing).unwrap(),
            json!({"code": "server_missing"})
        );
    }
}
