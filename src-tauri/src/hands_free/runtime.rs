//! Plan `hands-free-mode` (listening.md): the listener that runs while Hands-free mode is on.
//!
//! One background thread owns the microphone stream, the segmenter and the wake model:
//!
//! ```text
//! mic (16 kHz) ─> Listening: WakeSegmenter ─candidate─> WakeChecker ─match─> start Ask
//!                 Request:   AutoStop ─stop reason─> stop Ask
//!                 Paused:    audio dropped while any other run is busy
//! ```
//!
//! The thread is started and stopped from the settings (`apply`), the tray item and app exit.
//! Stopping drops the capture explicitly (see the CoreAudio lesson in `audio/capture.rs`) and
//! joins the thread, so the wake model is freed before the process exits (GGML's Metal cleanup
//! aborts while a model is loaded).

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use tauri::Manager;

use super::matcher::Sensitivity;
use super::segment::{AutoStop, StopReason, WakeSegmenter};
use super::wake::{WakeCheckOptions, WakeChecker, WAKE_MODEL};
use crate::audio::{AudioCaptureHandle, AudioConfig};

/// What the listener needs to run; a change restarts it.
#[derive(Debug, Clone, PartialEq)]
struct ListenerSettings {
    model: PathBuf,
    wake_name: String,
    sensitivity: Sensitivity,
    input_device: Option<String>,
    max_request_ms: u32,
}

struct Running {
    settings: ListenerSettings,
    stop: Arc<AtomicBool>,
    capture: AudioCaptureHandle,
    thread: std::thread::JoinHandle<()>,
}

/// The Tauri state that owns the listener.
#[derive(Default)]
pub struct HandsFreeState {
    running: Mutex<Option<Running>>,
}

/// Why the listener is not running, for Settings.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ListenerStatus {
    Off,
    /// On, but the wake model is not downloaded yet.
    NeedsModel,
    Listening,
    /// On, but the microphone could not be opened.
    MicError,
}

impl HandsFreeState {
    pub fn is_running(&self) -> bool {
        self.lock().is_some()
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Option<Running>> {
        self.running.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Stops the listener and waits for its thread, which frees the wake model.
    pub fn stop(&self) {
        let running = self.lock().take();
        if let Some(mut running) = running {
            running.stop.store(true, Ordering::SeqCst);
            // Closing the stream ends the audio channel, which ends the thread's loop.
            running.capture.stop();
            drop(running.capture);
            if running.thread.join().is_err() {
                tracing::warn!("Hands-free: the listener thread panicked");
            }
            tracing::info!("Hands-free: stopped listening; microphone released");
        }
    }
}

/// The wake model's path when it is downloaded.
pub fn installed_model_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    let dir = crate::stt::builtin::engine().models_dir().or_else(|| {
        app.path()
            .app_data_dir()
            .ok()
            .map(|d| crate::stt::models::models_dir_in(&d))
    })?;
    crate::stt::models::installed_from(&dir, &[WAKE_MODEL])
        .first()
        .map(|installed| dir.join(&installed.file_name))
}

/// Starts, restarts or stops the listener to match the settings. Returns its status.
pub fn apply(app: &tauri::AppHandle, config: &crate::storage::AppConfig) -> ListenerStatus {
    let Some(state) = app.try_state::<HandsFreeState>() else {
        return ListenerStatus::Off;
    };
    if !config.hands_free.enabled {
        state.stop();
        return ListenerStatus::Off;
    }
    let Some(model) = installed_model_path(app) else {
        state.stop();
        return ListenerStatus::NeedsModel;
    };
    let settings = ListenerSettings {
        model,
        wake_name: config.hands_free.wake_name.clone(),
        sensitivity: config.hands_free.sensitivity,
        input_device: crate::audio::input_device_from_config(&config.input_device),
        max_request_ms: config.max_recording_seconds.clamp(5, 120) * 1000,
    };
    if state
        .lock()
        .as_ref()
        .is_some_and(|running| running.settings == settings)
    {
        return ListenerStatus::Listening;
    }
    state.stop();
    match start(app, settings) {
        Ok(running) => {
            *state.lock() = Some(running);
            ListenerStatus::Listening
        }
        Err(error) => {
            tracing::warn!("Hands-free: could not start listening: {error}");
            ListenerStatus::MicError
        }
    }
}

fn start(app: &tauri::AppHandle, settings: ListenerSettings) -> Result<Running, String> {
    let (mut capture, audio_rx) = AudioCaptureHandle::start(AudioConfig {
        input_device: settings.input_device.clone(),
        ..AudioConfig::default()
    })
    .map_err(|error| error.to_string())?;
    tauri::async_runtime::block_on(capture.wait_until_ready()).map_err(|e| e.to_string())?;
    let stop = Arc::new(AtomicBool::new(false));
    let thread_stop = stop.clone();
    let thread_app = app.clone();
    let thread_settings = settings.clone();
    let thread = std::thread::Builder::new()
        .name("hands-free".to_string())
        .spawn(move || listen(thread_app, thread_settings, audio_rx, thread_stop))
        .map_err(|error| error.to_string())?;
    tracing::info!(
        "Hands-free: listening (sensitivity {:?})",
        settings.sensitivity
    );
    Ok(Running {
        settings,
        stop,
        capture,
        thread,
    })
}

enum Phase {
    Listening(WakeSegmenter),
    /// A hands-free Ask run is recording; `AutoStop` decides when it ends.
    Request(AutoStop),
    /// Waiting for the hands-free run (or any other run) to finish.
    Paused,
}

fn other_run_busy(app: &tauri::AppHandle) -> bool {
    let pipeline_busy = app
        .try_state::<crate::pipeline::PipelineHandle>()
        .is_some_and(|p| p.current_state() != crate::pipeline::PipelineState::Idle);
    let ask_busy = app
        .try_state::<crate::commands::ask::AskDictationState>()
        .is_some_and(|ask| ask.is_busy());
    pipeline_busy || ask_busy
}

fn listen(
    app: tauri::AppHandle,
    settings: ListenerSettings,
    mut audio_rx: tokio::sync::mpsc::Receiver<Vec<u8>>,
    stop: Arc<AtomicBool>,
) {
    let mut checker = match WakeChecker::load(
        &settings.model,
        &settings.wake_name,
        WakeCheckOptions::default(),
    ) {
        Ok(checker) => checker,
        Err(error) => {
            tracing::warn!("Hands-free: could not load the wake model: {error}");
            return;
        }
    };
    let mut phase = Phase::Listening(WakeSegmenter::new());
    let mut samples: Vec<i16> = Vec::with_capacity(320);
    while let Some(chunk) = audio_rx.blocking_recv() {
        if stop.load(Ordering::SeqCst) {
            break;
        }
        samples.clear();
        samples.extend(
            chunk
                .chunks_exact(2)
                .map(|b| i16::from_le_bytes([b[0], b[1]])),
        );
        phase = match phase {
            Phase::Listening(mut segmenter) => {
                if other_run_busy(&app) {
                    Phase::Paused
                } else {
                    let mut next = None;
                    for candidate in segmenter.feed(&samples) {
                        match checker.check(&candidate.samples, settings.sensitivity) {
                            Ok(check) => {
                                if let Some(found) = check.matched {
                                    tracing::info!(
                                        "Hands-free: wake phrase heard (score {:.2}, check {} ms, voiced {} ms)",
                                        found.score,
                                        check.elapsed.as_millis(),
                                        candidate.voiced_ms
                                    );
                                    next = Some(on_wake(&app, settings.max_request_ms));
                                    break;
                                }
                                tracing::debug!(
                                    "Hands-free: wake check {} ms, no match",
                                    check.elapsed.as_millis()
                                );
                            }
                            Err(error) => tracing::warn!("Hands-free: {error}"),
                        }
                    }
                    next.unwrap_or(Phase::Listening(segmenter))
                }
            }
            Phase::Request(mut auto_stop) => match auto_stop.feed(&samples) {
                Some(reason) => {
                    on_stop(&app, reason);
                    Phase::Paused
                }
                None => Phase::Request(auto_stop),
            },
            Phase::Paused => {
                if other_run_busy(&app) {
                    Phase::Paused
                } else {
                    Phase::Listening(WakeSegmenter::new())
                }
            }
        };
    }
    drop(checker);
}

/// The wake phrase was heard: start Ask as the shortcut would, marked as hands-free.
fn on_wake(app: &tauri::AppHandle, max_request_ms: u32) -> Phase {
    if !crate::shortcut_gate::allows(app, crate::hotkey::HotkeyRole::Ask) {
        return Phase::Paused;
    }
    let started = Instant::now();
    crate::hotkey::start_ask_hands_free(app.clone());
    tracing::debug!(
        "Hands-free: Ask start requested in {} ms",
        started.elapsed().as_millis()
    );
    Phase::Request(AutoStop::new(max_request_ms))
}

fn on_stop(app: &tauri::AppHandle, reason: StopReason) {
    tracing::info!("Hands-free: request ended ({})", reason.label());
    let app = app.clone();
    // Also for "no speech": the stop runs the usual voice check, which ends the run with the
    // calm no-speech fade (plan `quiet-no-speech`) instead of an error.
    tauri::async_runtime::spawn(crate::hotkey::stop_ask_shortcut(app));
}

/// Turns Hands-free mode on or off from the tray and saves the setting.
pub async fn toggle_from_tray(app: tauri::AppHandle) {
    let manager = app.state::<crate::storage::ConfigManager>();
    let mut config = match manager.load().await {
        Ok(config) => config,
        Err(error) => {
            tracing::warn!("Hands-free: could not read settings: {error}");
            return;
        }
    };
    config.hands_free.enabled = !config.hands_free.enabled;
    if let Err(error) = manager.save(&config).await {
        tracing::warn!("Hands-free: could not save settings: {error}");
        return;
    }
    use tauri::Emitter;
    let _ = app.emit(
        "config:patch",
        serde_json::json!({ "hands_free": config.hands_free }),
    );
    let apply_app = app.clone();
    let _ = tauri::async_runtime::spawn_blocking(move || apply(&apply_app, &config)).await;
    crate::refresh_tray(&app);
}
