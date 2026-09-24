pub mod capture;
pub mod output_mute;

pub use capture::{
    resolve_input_device, AudioCaptureHandle, AudioConfig, CaptureReady, CaptureState,
    ResolvedInputDevice,
};

use std::sync::atomic::{AtomicBool, Ordering};
use std::{future::Future, time::Duration};

/// Error code for the "saved microphone missing" notice. The frontend shows
/// `errors.mic_fallback_default` for it.
pub(crate) const MIC_FALLBACK_WARNING_CODE: &str = "mic_fallback_default";

/// Remembers whether the user has already been told that their saved microphone is missing,
/// so an unplugged USB mic produces one notice, not one per recording.
pub(crate) struct MicFallbackNotice {
    shown: AtomicBool,
}

impl MicFallbackNotice {
    pub(crate) const fn new() -> Self {
        Self {
            shown: AtomicBool::new(false),
        }
    }

    /// Returns `true` when this recording should show the notice. The notice is shown the first
    /// time the saved device is missing and again only after the device (or the system default
    /// setting) was used successfully in between.
    pub(crate) fn should_notify(&self, requested_device_missing: bool) -> bool {
        if requested_device_missing {
            !self.shown.swap(true, Ordering::SeqCst)
        } else {
            self.shown.store(false, Ordering::SeqCst);
            false
        }
    }
}

static MIC_FALLBACK_NOTICE: MicFallbackNotice = MicFallbackNotice::new();

/// Build the `pipeline:warning` payload for a recording that fell back to the system default,
/// or `None` if nothing should be shown. `requested_device` is the saved device name.
pub(crate) fn mic_fallback_warning(
    ready: &CaptureReady,
    requested_device: Option<&str>,
) -> Option<crate::error::UserError> {
    if !MIC_FALLBACK_NOTICE.should_notify(ready.requested_device_missing) {
        return None;
    }
    Some(crate::error::UserError {
        code: MIC_FALLBACK_WARNING_CODE.to_string(),
        details: requested_device.map(str::to_string),
        retry_count: 0,
    })
}

/// Turn the saved `input_device` setting into the capture option (`""` = system default).
pub(crate) fn input_device_from_config(input_device: &str) -> Option<String> {
    let trimmed = input_device.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_string())
}

pub(crate) const STARTUP_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum RecordingStartupError<AudioError, SttError> {
    Audio(AudioError),
    Stt(SttError),
    Timeout,
}

pub(crate) async fn await_recording_startup<
    AudioFuture,
    SttFuture,
    AudioReady,
    AudioError,
    SttError,
>(
    audio_ready: AudioFuture,
    stt_ready: SttFuture,
) -> Result<AudioReady, RecordingStartupError<AudioError, SttError>>
where
    AudioFuture: Future<Output = Result<AudioReady, AudioError>>,
    SttFuture: Future<Output = Result<(), SttError>>,
{
    await_recording_startup_with_timeout(audio_ready, stt_ready, STARTUP_TIMEOUT).await
}

async fn await_recording_startup_with_timeout<
    AudioFuture,
    SttFuture,
    AudioReady,
    AudioError,
    SttError,
>(
    audio_ready: AudioFuture,
    stt_ready: SttFuture,
    timeout: Duration,
) -> Result<AudioReady, RecordingStartupError<AudioError, SttError>>
where
    AudioFuture: Future<Output = Result<AudioReady, AudioError>>,
    SttFuture: Future<Output = Result<(), SttError>>,
{
    tokio::time::timeout(timeout, async {
        let (audio_ready, ()) = tokio::try_join!(
            async { audio_ready.await.map_err(RecordingStartupError::Audio) },
            async { stt_ready.await.map_err(RecordingStartupError::Stt) }
        )?;
        Ok(audio_ready)
    })
    .await
    .unwrap_or(Err(RecordingStartupError::Timeout))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use std::time::Duration;
    use tokio::sync::Notify;

    #[test]
    fn fallback_notice_is_shown_once_per_missing_episode() {
        let notice = MicFallbackNotice::new();
        assert!(notice.should_notify(true));
        assert!(!notice.should_notify(true));
        assert!(!notice.should_notify(true));
        // Device is back (or user switched to system default): arm the notice again.
        assert!(!notice.should_notify(false));
        assert!(notice.should_notify(true));
    }

    #[test]
    fn empty_input_device_setting_means_system_default() {
        assert_eq!(input_device_from_config(""), None);
        assert_eq!(input_device_from_config("  "), None);
        assert_eq!(
            input_device_from_config(" USB Mic "),
            Some("USB Mic".to_string())
        );
    }

    #[tokio::test]
    async fn audio_initialization_and_stt_connection_are_polled_concurrently() {
        let audio_started = Arc::new(Notify::new());
        let provider_connected = Arc::new(Notify::new());

        let audio_ready = {
            let audio_started = audio_started.clone();
            let provider_connected = provider_connected.clone();
            async move {
                audio_started.notify_one();
                provider_connected.notified().await;
                Ok::<u32, &'static str>(42)
            }
        };
        let stt_ready = async move {
            audio_started.notified().await;
            provider_connected.notify_one();
            Ok::<(), &'static str>(())
        };

        let result = tokio::time::timeout(
            Duration::from_millis(100),
            await_recording_startup(audio_ready, stt_ready),
        )
        .await;

        assert!(
            result.is_ok(),
            "audio initialization was not polled while STT was connecting"
        );
        assert_eq!(result.unwrap().unwrap(), 42);
    }

    #[tokio::test]
    async fn recording_startup_times_out_once() {
        let result = await_recording_startup_with_timeout(
            std::future::pending::<Result<u32, &'static str>>(),
            std::future::pending::<Result<(), &'static str>>(),
            Duration::from_millis(20),
        )
        .await;

        assert_eq!(result, Err(RecordingStartupError::Timeout));
    }

    #[tokio::test]
    async fn audio_error_wins_when_both_sides_are_ready_with_errors() {
        let result = await_recording_startup_with_timeout(
            async { Err::<u32, _>("audio") },
            async { Err::<(), _>("stt") },
            Duration::from_millis(20),
        )
        .await;

        assert_eq!(result, Err(RecordingStartupError::Audio("audio")));
    }
}
