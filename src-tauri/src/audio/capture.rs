//! Microphone capture through `cpal`.
//!
//! `cpal` is a cross-platform audio library. On macOS it wraps CoreAudio, Apple's low-level audio
//! API. A few CoreAudio facts that matter here:
//!
//! - Every microphone (built-in, USB, Bluetooth, virtual devices such as Zoom's) is an
//!   "input device" with a human-readable name, for example "MacBook Pro Microphone". cpal lists
//!   them with `host.input_devices()` and reports the one chosen in System Settings → Sound →
//!   Input with `host.default_input_device()`.
//! - Opening an input stream on any device is what makes macOS ask for the Microphone permission
//!   (the text comes from `NSMicrophoneUsageDescription` in `Info.plist`). Listing devices does
//!   not trigger the prompt.
//! - CoreAudio lets several streams read the same device at once, so a level meter and a
//!   recording do not break each other; we still avoid running both to save CPU.
//! - cpal exposes no stable device id, so the user's choice is stored by name.

use anyhow::Result;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::sync::{Arc, Mutex};
use tokio::sync::{mpsc, oneshot};

/// What the capture thread reports once the input stream is running.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CaptureReady {
    /// When the stream started delivering audio; used for recording deadlines.
    pub ready_at: crate::recording_deadline::CaptureReadyAt,
    /// Name of the device actually opened.
    pub device_name: String,
    /// The user picked a device that is not connected, so the system default was used.
    pub requested_device_missing: bool,
}

type CaptureStartupResult = std::result::Result<CaptureReady, String>;

struct CaptureStartupNotifier {
    sender: Option<oneshot::Sender<CaptureStartupResult>>,
}

struct CaptureStartupWaiter {
    receiver: oneshot::Receiver<CaptureStartupResult>,
}

fn capture_startup_channel() -> (CaptureStartupNotifier, CaptureStartupWaiter) {
    let (sender, receiver) = oneshot::channel();
    (
        CaptureStartupNotifier {
            sender: Some(sender),
        },
        CaptureStartupWaiter { receiver },
    )
}

impl CaptureStartupNotifier {
    fn ready(&mut self, ready: CaptureReady) {
        if let Some(sender) = self.sender.take() {
            let _ = sender.send(Ok(ready));
        }
    }

    fn failed(&mut self, message: String) {
        if let Some(sender) = self.sender.take() {
            let _ = sender.send(Err(message));
        }
    }
}

impl CaptureStartupWaiter {
    async fn wait(self) -> CaptureStartupResult {
        self.receiver.await.unwrap_or_else(|_| {
            Err("Audio capture thread ended before reporting readiness".to_string())
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum CaptureState {
    Idle,
    Starting,
    Recording,
}

fn initial_capture_state() -> CaptureState {
    CaptureState::Starting
}

#[derive(Debug, Clone)]
pub struct AudioConfig {
    pub sample_rate: u32,
    pub channels: u16,
    pub chunk_duration_ms: u32,
    /// Name of the microphone to open. `None` means "follow the macOS system default".
    pub input_device: Option<String>,
    /// Mute the system output while this capture runs (see `audio::output_mute`). Only real
    /// recordings set this; the Settings level meter does not.
    pub mute_output_while_recording: bool,
}

impl Default for AudioConfig {
    fn default() -> Self {
        Self {
            sample_rate: 16000,
            channels: 1,
            chunk_duration_ms: 20,
            input_device: None,
            mute_output_while_recording: false,
        }
    }
}

/// Maximum audio buffer size in samples before we stop accumulating.
/// ~24 MB of i16 samples ≈ 12.5 min at 16kHz mono, matching the STT provider limits.
const MAX_BUFFER_SAMPLES: usize = 12 * 1024 * 1024;
const AUDIO_CHANNEL_BUFFER_DURATION_MS: u32 = 60_000;

fn audio_channel_capacity(config: &AudioConfig) -> usize {
    let chunk_duration_ms = config.chunk_duration_ms.max(1);
    AUDIO_CHANNEL_BUFFER_DURATION_MS.div_ceil(chunk_duration_ms) as usize
}

/// Handle to control audio capture running on a dedicated thread.
/// This is Send + Sync safe because it only holds channels and atomic state.
pub struct AudioCaptureHandle {
    stop_tx: Option<std::sync::mpsc::Sender<()>>,
    startup_waiter: Option<CaptureStartupWaiter>,
    volume: Arc<Mutex<f32>>,
    state: Arc<Mutex<CaptureState>>,
}

impl AudioCaptureHandle {
    /// Start audio capture on a dedicated thread. Returns a handle and a receiver for audio chunks.
    pub fn start(config: AudioConfig) -> Result<(Self, mpsc::Receiver<Vec<u8>>)> {
        let (audio_tx, audio_rx) = mpsc::channel::<Vec<u8>>(audio_channel_capacity(&config));
        let (stop_tx, stop_rx) = std::sync::mpsc::channel::<()>();
        let volume = Arc::new(Mutex::new(0.0f32));
        let state = Arc::new(Mutex::new(initial_capture_state()));
        let (mut startup_notifier, startup_waiter) = capture_startup_channel();

        let vol_clone = volume.clone();
        let state_clone = state.clone();
        let failed_state = state.clone();

        // Audio capture must run on a dedicated OS thread because cpal::Stream is !Send
        std::thread::spawn(move || {
            if let Err(e) = run_capture(
                config,
                audio_tx,
                stop_rx,
                vol_clone,
                state_clone,
                &mut startup_notifier,
            ) {
                *failed_state
                    .lock()
                    .unwrap_or_else(|error| error.into_inner()) = CaptureState::Idle;
                startup_notifier.failed(e.to_string());
                tracing::error!("Audio capture thread error: {}", e);
            }
        });

        Ok((
            Self {
                stop_tx: Some(stop_tx),
                startup_waiter: Some(startup_waiter),
                volume,
                state,
            },
            audio_rx,
        ))
    }

    /// Wait until the platform backend has opened the input stream and
    /// `play()` has succeeded. The CPAL boundary is shared by CoreAudio,
    /// WASAPI, ALSA and PipeWire, so callers do not need platform delays.
    pub async fn wait_until_ready(&mut self) -> Result<CaptureReady> {
        let waiter = self
            .startup_waiter
            .take()
            .ok_or_else(|| anyhow::anyhow!("Audio capture readiness was already consumed"))?;
        waiter.wait().await.map_err(anyhow::Error::msg)
    }

    pub fn stop(&mut self) {
        // Signal the capture thread to stop
        self.stop_tx = None;
        *self.volume.lock().unwrap_or_else(|e| e.into_inner()) = 0.0;
        *self.state.lock().unwrap_or_else(|e| e.into_inner()) = CaptureState::Idle;
    }

    pub fn get_volume(&self) -> f32 {
        *self.volume.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn state(&self) -> CaptureState {
        *self.state.lock().unwrap_or_else(|e| e.into_inner())
    }
}

/// Downsample audio from `from_rate` to `to_rate` (simple linear interpolation, mono).
fn downsample(samples: &[f32], from_rate: u32, to_rate: u32) -> Vec<f32> {
    if from_rate == to_rate {
        return samples.to_vec();
    }
    let ratio = from_rate as f64 / to_rate as f64;
    let out_len = (samples.len() as f64 / ratio) as usize;
    let mut out = Vec::with_capacity(out_len);
    for i in 0..out_len {
        let src_idx = i as f64 * ratio;
        let idx = src_idx as usize;
        let frac = src_idx - idx as f64;
        let s = if idx + 1 < samples.len() {
            samples[idx] as f64 * (1.0 - frac) + samples[idx + 1] as f64 * frac
        } else {
            samples[idx.min(samples.len() - 1)] as f64
        };
        out.push(s as f32);
    }
    out
}

/// Mix multi-channel audio down to mono by averaging channels.
fn to_mono(samples: &[f32], channels: u16) -> Vec<f32> {
    if channels <= 1 {
        return samples.to_vec();
    }
    let ch = channels as usize;
    samples
        .chunks(ch)
        .map(|frame| frame.iter().sum::<f32>() / ch as f32)
        .collect()
}

/// Treat an empty or whitespace-only name as "system default".
pub(crate) fn normalize_requested_device(requested: Option<&str>) -> Option<&str> {
    requested.map(str::trim).filter(|name| !name.is_empty())
}

/// Outcome of [`select_input_device`].
#[derive(Debug, PartialEq, Eq)]
pub(crate) struct DeviceSelection<D> {
    pub device: D,
    pub requested_device_missing: bool,
}

/// Pick the device to record from.
///
/// - No request (or an empty one): the system default.
/// - A request that matches a connected device's name: that device.
/// - A request that matches nothing (for example an unplugged USB mic): the system default,
///   with `requested_device_missing` set so the caller can tell the user.
///
/// Returns `None` only when no device can be used at all. The logic is generic over the device
/// type so it can be tested without real audio hardware.
pub(crate) fn select_input_device<D>(
    requested: Option<&str>,
    candidates: impl IntoIterator<Item = (Option<String>, D)>,
    system_default: impl FnOnce() -> Option<D>,
) -> Option<DeviceSelection<D>> {
    let Some(requested) = normalize_requested_device(requested) else {
        return system_default().map(|device| DeviceSelection {
            device,
            requested_device_missing: false,
        });
    };
    let found = candidates
        .into_iter()
        .find(|(name, _)| name.as_deref().map(str::trim) == Some(requested))
        .map(|(_, device)| device);
    match found {
        Some(device) => Some(DeviceSelection {
            device,
            requested_device_missing: false,
        }),
        None => system_default().map(|device| DeviceSelection {
            device,
            requested_device_missing: true,
        }),
    }
}

/// A cpal input device plus how it was chosen.
pub struct ResolvedInputDevice {
    pub device: cpal::Device,
    pub name: String,
    pub requested_device_missing: bool,
}

/// Find the requested microphone on `host`, falling back to the system default.
///
/// `host.input_devices()` asks CoreAudio for every device that has input channels. The first call
/// after launch can take a few hundred milliseconds, so call this off the UI thread.
pub fn resolve_input_device(
    host: &cpal::Host,
    requested: Option<&str>,
) -> Result<ResolvedInputDevice> {
    let requested = normalize_requested_device(requested);
    let candidates: Vec<(Option<String>, cpal::Device)> = match requested {
        Some(_) => match host.input_devices() {
            Ok(devices) => devices.map(|device| (device.name().ok(), device)).collect(),
            Err(error) => {
                tracing::warn!("Could not list input devices: {}", error);
                Vec::new()
            }
        },
        None => Vec::new(),
    };
    let selection = select_input_device(requested, candidates, || host.default_input_device())
        .ok_or_else(|| anyhow::anyhow!("No input device available"))?;
    if selection.requested_device_missing {
        tracing::warn!(
            "Input device {:?} not found; falling back to the system default",
            requested.unwrap_or_default()
        );
    }
    let name = selection
        .device
        .name()
        .unwrap_or_else(|_| "Unknown microphone".to_string());
    Ok(ResolvedInputDevice {
        device: selection.device,
        name,
        requested_device_missing: selection.requested_device_missing,
    })
}

fn run_capture(
    config: AudioConfig,
    sender: mpsc::Sender<Vec<u8>>,
    stop_rx: std::sync::mpsc::Receiver<()>,
    volume: Arc<Mutex<f32>>,
    state: Arc<Mutex<CaptureState>>,
    startup_notifier: &mut CaptureStartupNotifier,
) -> Result<()> {
    let host = cpal::default_host();
    let ResolvedInputDevice {
        device,
        name: device_name,
        requested_device_missing,
    } = resolve_input_device(&host, config.input_device.as_deref())?;

    tracing::info!("Using input device: {:?}", device_name);

    // Use the device's default config instead of forcing 16kHz mono
    let default_config = device.default_input_config()?;
    let device_sample_rate = default_config.sample_rate().0;
    let device_channels = default_config.channels();

    tracing::info!(
        "Device default config: {}Hz, {} channels, format: {:?}",
        device_sample_rate,
        device_channels,
        default_config.sample_format()
    );

    let stream_config = cpal::StreamConfig {
        channels: device_channels,
        sample_rate: cpal::SampleRate(device_sample_rate),
        buffer_size: cpal::BufferSize::Default,
    };

    let target_rate = config.sample_rate;
    let target_channels = config.channels;
    let samples_per_chunk = (target_rate * config.chunk_duration_ms / 1000) as usize;
    let buffer: Arc<Mutex<Vec<i16>>> = Arc::new(Mutex::new(Vec::with_capacity(samples_per_chunk)));

    let stream = device.build_input_stream(
        &stream_config,
        move |data: &[f32], _: &cpal::InputCallbackInfo| {
            // Calculate RMS volume from raw data
            let rms = (data.iter().map(|s| s * s).sum::<f32>() / data.len() as f32).sqrt();
            if let Ok(mut v) = volume.lock() {
                *v = rms.min(1.0);
            }

            // Convert to mono if needed
            let mono = if device_channels > target_channels {
                to_mono(data, device_channels)
            } else {
                data.to_vec()
            };

            // Downsample to target rate if needed
            let resampled = if device_sample_rate != target_rate {
                downsample(&mono, device_sample_rate, target_rate)
            } else {
                mono
            };

            // Convert f32 to i16 PCM and buffer
            let mut buf = buffer.lock().unwrap_or_else(|e| e.into_inner());
            for &sample in &resampled {
                if buf.len() >= MAX_BUFFER_SAMPLES {
                    break;
                }
                let s = (sample * 32767.0).clamp(-32768.0, 32767.0) as i16;
                buf.push(s);
            }

            // Send complete chunks
            while buf.len() >= samples_per_chunk {
                let chunk: Vec<i16> = buf.drain(..samples_per_chunk).collect();
                let bytes: Vec<u8> = chunk.iter().flat_map(|s| s.to_le_bytes()).collect();
                let _ = sender.try_send(bytes);
            }
        },
        |err| {
            tracing::error!("Audio capture error: {}", err);
        },
        None,
    )?;

    stream.play()?;
    let capture_ready_at = crate::recording_deadline::CaptureReadyAt::now();
    *state.lock().unwrap_or_else(|e| e.into_inner()) = CaptureState::Recording;
    startup_notifier.ready(CaptureReady {
        ready_at: capture_ready_at,
        device_name,
        requested_device_missing,
    });
    tracing::info!(
        "Audio capture started (device: {}Hz {}ch -> target: {}Hz {}ch)",
        device_sample_rate,
        device_channels,
        target_rate,
        target_channels
    );

    // The stream is running: mute other audio if asked. The guard unmutes when this
    // function returns, whatever ended the recording.
    let output_mute = config
        .mute_output_while_recording
        .then(super::output_mute::RecordingMute::begin);

    // Block until stop signal (sender dropped)
    let _ = stop_rx.recv();
    drop(output_mute);

    // Stream is dropped here, stopping capture
    drop(stream);
    *state.lock().unwrap_or_else(|e| e.into_inner()) = CaptureState::Idle;
    tracing::info!("Audio capture stopped");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn capture_does_not_report_recording_before_the_backend_is_ready() {
        assert_eq!(initial_capture_state(), CaptureState::Starting);
    }

    #[test]
    fn audio_queue_preserves_a_minute_while_the_provider_connects() {
        assert_eq!(audio_channel_capacity(&AudioConfig::default()), 3_000);
    }

    #[tokio::test]
    async fn capture_startup_waits_for_the_backend_ready_signal() {
        let (_notifier, waiter) = capture_startup_channel();

        assert!(
            tokio::time::timeout(Duration::from_millis(20), waiter.wait())
                .await
                .is_err(),
            "capture startup completed before the backend reported readiness"
        );
    }

    #[tokio::test]
    async fn capture_startup_completes_after_the_backend_is_ready() {
        let (mut notifier, waiter) = capture_startup_channel();
        let ready_at = crate::recording_deadline::CaptureReadyAt::now();
        notifier.ready(CaptureReady {
            ready_at,
            device_name: "USB Mic".to_string(),
            requested_device_missing: true,
        });

        let observed = waiter.wait().await.unwrap();
        assert_eq!(observed.ready_at.unix_millis, ready_at.unix_millis);
        assert_eq!(observed.ready_at.monotonic, ready_at.monotonic);
        assert_eq!(observed.device_name, "USB Mic");
        assert!(observed.requested_device_missing);
    }

    #[tokio::test]
    async fn capture_startup_propagates_backend_failure() {
        let (mut notifier, waiter) = capture_startup_channel();
        notifier.failed("input device unavailable".to_string());

        assert_eq!(
            waiter.wait().await,
            Err("input device unavailable".to_string())
        );
    }

    fn devices(names: &[&'static str]) -> Vec<(Option<String>, &'static str)> {
        names
            .iter()
            .map(|name| (Some(name.to_string()), *name))
            .collect()
    }

    #[test]
    fn no_requested_device_uses_the_system_default() {
        let selection = select_input_device(None, devices(&["USB Mic"]), || Some("Default"));
        assert_eq!(
            selection,
            Some(DeviceSelection {
                device: "Default",
                requested_device_missing: false
            })
        );
    }

    #[test]
    fn blank_requested_device_uses_the_system_default() {
        let selection = select_input_device(Some("   "), devices(&["USB Mic"]), || Some("Default"));
        assert_eq!(selection.unwrap().device, "Default");
    }

    #[test]
    fn connected_requested_device_is_used() {
        let selection = select_input_device(
            Some("USB Mic"),
            devices(&["MacBook Pro Microphone", "USB Mic"]),
            || Some("MacBook Pro Microphone"),
        );
        assert_eq!(
            selection,
            Some(DeviceSelection {
                device: "USB Mic",
                requested_device_missing: false
            })
        );
    }

    #[test]
    fn requested_device_name_is_trimmed_before_matching() {
        let selection =
            select_input_device(Some(" USB Mic "), devices(&["USB Mic"]), || Some("Default"));
        assert_eq!(selection.unwrap().device, "USB Mic");
    }

    #[test]
    fn missing_requested_device_falls_back_to_the_system_default() {
        let selection = select_input_device(
            Some("Unplugged Mic"),
            devices(&["MacBook Pro Microphone"]),
            || Some("MacBook Pro Microphone"),
        );
        assert_eq!(
            selection,
            Some(DeviceSelection {
                device: "MacBook Pro Microphone",
                requested_device_missing: true
            })
        );
    }

    #[test]
    fn devices_without_a_readable_name_never_match() {
        let candidates = vec![(None, "Nameless")];
        let selection = select_input_device(Some("USB Mic"), candidates, || Some("Default"));
        assert_eq!(selection.unwrap().device, "Default");
    }

    #[test]
    fn no_device_at_all_is_reported() {
        let selection = select_input_device(
            Some("USB Mic"),
            Vec::<(Option<String>, &str)>::new(),
            || None,
        );
        assert_eq!(selection, None);
        let selection =
            select_input_device(None, Vec::<(Option<String>, &str)>::new(), || None::<&str>);
        assert_eq!(selection, None);
    }

    #[test]
    fn default_audio_config_follows_the_system_default() {
        assert_eq!(AudioConfig::default().input_device, None);
    }
}
