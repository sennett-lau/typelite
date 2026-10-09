//! Plan `hands-free-mode` (settings.md): the commands behind Settings → General → Hands-free mode.
//!
//! The wake model is downloaded by the app (like the built-in speech models), never installed by
//! the user. Download progress goes to all windows as [`HANDS_FREE_SETUP_EVENT`].

use serde::Serialize;
use tauri::{Emitter, Manager};

use super::model_setup::{self, ModelSetupState, SetupStatus};
use crate::hands_free::runtime::{self, HandsFreeState, ListenerStatus};
use crate::hands_free::wake::WAKE_MODEL;
use crate::storage;
use crate::stt::models;

/// Event with a [`SetupStatus`] payload while the wake model downloads.
pub const HANDS_FREE_SETUP_EVENT: &str = "hands-free:setup";

/// Tauri state: the wake model download.
#[derive(Default)]
pub struct HandsFreeSetupState(pub ModelSetupState);

/// What the Settings row shows.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HandsFreeStatus {
    pub listener: ListenerStatus,
    pub model_installed: bool,
    pub model_size_bytes: u64,
    pub setup: SetupStatus,
}

fn status(app: &tauri::AppHandle, listener: ListenerStatus) -> HandsFreeStatus {
    HandsFreeStatus {
        listener,
        model_installed: runtime::installed_model_path(app).is_some(),
        model_size_bytes: WAKE_MODEL.size_bytes,
        setup: app.state::<HandsFreeSetupState>().0.status(),
    }
}

/// Applies the saved settings off the async runtime (opening the microphone blocks briefly).
pub async fn apply_saved(app: &tauri::AppHandle) -> ListenerStatus {
    let config = match app.state::<storage::ConfigManager>().load().await {
        Ok(config) => config,
        Err(_) => return ListenerStatus::Off,
    };
    let apply_app = app.clone();
    tauri::async_runtime::spawn_blocking(move || runtime::apply(&apply_app, &config))
        .await
        .unwrap_or(ListenerStatus::Off)
}

#[tauri::command]
pub async fn get_hands_free_status(app: tauri::AppHandle) -> Result<HandsFreeStatus, String> {
    let config = app
        .state::<storage::ConfigManager>()
        .load()
        .await
        .map_err(|e| e.to_string())?;
    let listener = if !config.hands_free.enabled {
        ListenerStatus::Off
    } else if app.state::<HandsFreeState>().is_running() {
        ListenerStatus::Listening
    } else if runtime::installed_model_path(&app).is_none() {
        ListenerStatus::NeedsModel
    } else {
        ListenerStatus::MicError
    };
    Ok(status(&app, listener))
}

/// Downloads the wake model in the background, then starts listening if Hands-free is on.
#[tauri::command]
pub async fn download_hands_free_model(app: tauri::AppHandle) -> Result<(), String> {
    let cancel = app
        .state::<HandsFreeSetupState>()
        .0
        .begin(&WAKE_MODEL, "The wake model is already downloading")?;
    let dir = super::speech_setup::models_dir(&app)?;
    let task_app = app.clone();
    tauri::async_runtime::spawn(async move {
        let result = model_setup::download_with_progress(
            &task_app,
            |app| &app.state::<HandsFreeSetupState>().inner().0,
            HANDS_FREE_SETUP_EVENT,
            &dir,
            WAKE_MODEL,
            format!("{}/{}", models::MODEL_BASE_URL, WAKE_MODEL.file_name),
            cancel,
        )
        .await
        .map(|()| 0);
        let final_status = task_app.state::<HandsFreeSetupState>().0.finish(&result);
        let _ = task_app.emit(HANDS_FREE_SETUP_EVENT, &final_status);
        if result.is_ok() {
            apply_saved(&task_app).await;
        }
    });
    Ok(())
}

#[tauri::command]
pub fn cancel_hands_free_model_download(state: tauri::State<'_, HandsFreeSetupState>) -> bool {
    state.0.cancel()
}
