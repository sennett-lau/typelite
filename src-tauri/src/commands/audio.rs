//! Microphone commands for Settings → General: list input devices and run a live level meter.
//!
//! `cpal` wraps CoreAudio on macOS (see `audio/capture.rs` for the background). Listing devices
//! only reads CoreAudio's device list. Starting the level meter opens a real input stream, which
//! is what makes macOS show the Microphone permission prompt the first time, and turns on the
//! orange "mic in use" dot in the menu bar while the meter runs.

use crate::audio::{AudioCaptureHandle, AudioConfig};
use crate::pipeline::{PipelineHandle, PipelineState};
use serde::Serialize;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::Emitter;

/// Event with the current input level (RMS, 0.0–1.0) sent to the `main` window.
pub const MIC_LEVEL_EVENT: &str = "mic:level";
/// How often the level meter sends `mic:level` (about 30 frames per second).
const MIC_LEVEL_INTERVAL_MS: u64 = 33;
/// How long to wait for CoreAudio to start the stream before giving up.
const MIC_MONITOR_START_TIMEOUT: Duration = Duration::from_secs(10);

/// One entry in the microphone picker.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct InputDeviceInfo {
    pub name: String,
    /// This is the device macOS currently uses as its default input.
    pub is_default: bool,
}

/// What the level meter actually opened.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct MicMonitorInfo {
    pub device_name: String,
    /// The requested device was not found, so the meter shows the system default instead.
    pub requested_device_missing: bool,
}

struct MicMonitorSession {
    id: u64,
    handle: AudioCaptureHandle,
}

/// The running level meter, if any. At most one meter runs at a time.
#[derive(Default)]
pub struct MicMonitorState {
    session: Arc<Mutex<Option<MicMonitorSession>>>,
    next_id: AtomicU64,
}

impl MicMonitorState {
    /// Stop the meter. Dropping the capture handle closes the CoreAudio stream.
    fn stop(&self) {
        let previous = self
            .session
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .take();
        if let Some(mut session) = previous {
            session.handle.stop();
        }
    }
}

/// Turn cpal's device names into picker entries: skip blank names, drop duplicates (aggregate
/// devices can repeat a name), and mark the system default.
fn build_device_list(
    names: impl IntoIterator<Item = String>,
    default_name: Option<&str>,
) -> Vec<InputDeviceInfo> {
    let mut devices: Vec<InputDeviceInfo> = Vec::new();
    for name in names {
        let name = name.trim().to_string();
        if name.is_empty() || devices.iter().any(|device| device.name == name) {
            continue;
        }
        let is_default = default_name.map(str::trim) == Some(name.as_str());
        devices.push(InputDeviceInfo { name, is_default });
    }
    devices
}

fn list_input_devices_blocking() -> Result<Vec<InputDeviceInfo>, String> {
    use cpal::traits::{DeviceTrait, HostTrait};

    let host = cpal::default_host();
    let default_name = host
        .default_input_device()
        .and_then(|device| device.name().ok());
    let names = host
        .input_devices()
        .map_err(|error| format!("Could not list microphones: {error}"))?
        .filter_map(|device| device.name().ok());
    Ok(build_device_list(names, default_name.as_deref()))
}

/// List every input device by name. `async` so the CoreAudio query (which can take a few hundred
/// milliseconds the first time) runs off the main thread.
#[tauri::command]
pub async fn list_input_devices() -> Result<Vec<InputDeviceInfo>, String> {
    tauri::async_runtime::spawn_blocking(list_input_devices_blocking)
        .await
        .map_err(|error| error.to_string())?
}

/// Start the live level meter on `device` (`None` or `""` = system default). Any running meter
/// is stopped first. Refuses with `"recording_active"` while dictation or Ask is running, so the
/// meter never holds a second stream during a recording.
#[tauri::command]
pub async fn start_mic_level_monitor(
    app: tauri::AppHandle,
    device: Option<String>,
    state: tauri::State<'_, MicMonitorState>,
    pipeline: tauri::State<'_, PipelineHandle>,
) -> Result<MicMonitorInfo, String> {
    if pipeline.current_state() != PipelineState::Idle {
        return Err("recording_active".to_string());
    }
    state.stop();

    let input_device = device
        .as_deref()
        .and_then(crate::audio::input_device_from_config);
    let (mut handle, audio_rx) = AudioCaptureHandle::start(AudioConfig {
        input_device,
        ..AudioConfig::default()
    })
    .map_err(|error| error.to_string())?;
    // The meter only needs the level, not the audio itself.
    drop(audio_rx);

    let ready =
        match tokio::time::timeout(MIC_MONITOR_START_TIMEOUT, handle.wait_until_ready()).await {
            Ok(Ok(ready)) => ready,
            Ok(Err(error)) => {
                handle.stop();
                return Err(error.to_string());
            }
            Err(_) => {
                handle.stop();
                return Err("Microphone did not start in time".to_string());
            }
        };

    let id = state.next_id.fetch_add(1, Ordering::SeqCst);
    {
        let mut session = state.session.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(mut previous) = session.take() {
            previous.handle.stop();
        }
        *session = Some(MicMonitorSession { id, handle });
    }

    let session_ref = state.session.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_millis(MIC_LEVEL_INTERVAL_MS)).await;
            let level = {
                let session = session_ref.lock().unwrap_or_else(|e| e.into_inner());
                match session.as_ref() {
                    Some(session) if session.id == id => session.handle.get_volume(),
                    // Stopped or replaced by a newer meter.
                    _ => break,
                }
            };
            let _ = app.emit_to("main", MIC_LEVEL_EVENT, level);
        }
    });

    Ok(MicMonitorInfo {
        device_name: ready.device_name,
        requested_device_missing: ready.requested_device_missing,
    })
}

/// Stop the live level meter and release the microphone.
#[tauri::command]
pub fn stop_mic_level_monitor(state: tauri::State<'_, MicMonitorState>) -> Result<(), String> {
    state.stop();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn names(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| value.to_string()).collect()
    }

    #[test]
    fn device_list_marks_the_system_default() {
        let devices = build_device_list(
            names(&["MacBook Pro Microphone", "USB Mic"]),
            Some("USB Mic"),
        );
        assert_eq!(
            devices,
            vec![
                InputDeviceInfo {
                    name: "MacBook Pro Microphone".to_string(),
                    is_default: false
                },
                InputDeviceInfo {
                    name: "USB Mic".to_string(),
                    is_default: true
                },
            ]
        );
    }

    #[test]
    fn device_list_drops_blank_and_duplicate_names() {
        let devices = build_device_list(names(&["USB Mic", " ", "USB Mic", "Aggregate"]), None);
        let listed: Vec<&str> = devices.iter().map(|device| device.name.as_str()).collect();
        assert_eq!(listed, vec!["USB Mic", "Aggregate"]);
        assert!(devices.iter().all(|device| !device.is_default));
    }

    #[test]
    fn stopping_an_idle_monitor_is_harmless() {
        let state = MicMonitorState::default();
        state.stop();
        assert!(state.session.lock().unwrap().is_none());
    }
}
