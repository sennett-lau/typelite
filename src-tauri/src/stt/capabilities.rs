use super::qwen_cloud;
use crate::storage::{AppConfig, SpeechPreset};
use serde::{Deserialize, Serialize};

pub const CAPABILITY_REGISTRY_VERSION: u32 = 1;
pub const CLIENT_FILE_BUFFER_BYTES: u64 = 24 * 1024 * 1024;
/// Suggested limit in "auto" mode.
const RECOMMENDED_MAX_SECONDS: u32 = 600;
/// About 12 minutes of 16 kHz 16-bit mono audio fills the 24 MB upload buffer in
/// `whisper_compat.rs`, so no recording may be longer than this.
const HARD_MAX_SECONDS: u32 = 720;
const MIN_CUSTOM_SECONDS: u32 = 30;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RecordingLimitMode {
    #[default]
    Auto,
    Custom,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SttTransport {
    FileUpload,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RecordingLimitSource {
    ClientBuffer,
    /// The speech service's own maximum audio length (plan `qwen-cloud-speech`).
    Provider,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SttRecordingCapability {
    pub registry_version: u32,
    pub provider_id: String,
    pub transport: SttTransport,
    pub recommended_max_seconds: u32,
    pub hard_max_seconds: u32,
    pub max_upload_bytes: Option<u64>,
    pub source: RecordingLimitSource,
    pub explanation_key: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedRecordingLimit {
    pub capability: SttRecordingCapability,
    pub mode: RecordingLimitMode,
    pub requested_seconds: u32,
    pub effective_max_seconds: u32,
}

/// Every speech preset uploads a WAV file after recording. The limit comes from the
/// client-side upload buffer, or from the service's own maximum for Qwen Cloud (plan
/// `qwen-cloud-speech`).
fn speech_capability(preset: &SpeechPreset) -> SttRecordingCapability {
    let preset_id = preset.id.as_str();
    if preset.is_qwen_cloud() {
        return SttRecordingCapability {
            registry_version: CAPABILITY_REGISTRY_VERSION,
            provider_id: preset_id.to_string(),
            transport: SttTransport::FileUpload,
            recommended_max_seconds: qwen_cloud::RECOMMENDED_MAX_SECONDS,
            hard_max_seconds: qwen_cloud::HARD_MAX_SECONDS,
            max_upload_bytes: None,
            source: RecordingLimitSource::Provider,
            explanation_key: "recordingLimits.reasons.provider".to_string(),
        };
    }
    SttRecordingCapability {
        registry_version: CAPABILITY_REGISTRY_VERSION,
        provider_id: preset_id.to_string(),
        transport: SttTransport::FileUpload,
        recommended_max_seconds: RECOMMENDED_MAX_SECONDS,
        hard_max_seconds: HARD_MAX_SECONDS,
        max_upload_bytes: Some(CLIENT_FILE_BUFFER_BYTES),
        source: RecordingLimitSource::ClientBuffer,
        explanation_key: "recordingLimits.reasons.clientBuffer".to_string(),
    }
}

/// A custom limit kept in the app's widest range, whatever the active preset allows. The
/// per-preset clamp happens when the limit is resolved, so switching to a service with a
/// shorter maximum (Qwen Cloud, plan `qwen-cloud-speech`) and back does not lose the user's choice.
pub fn clamp_custom_seconds_to_app_range(seconds: u32) -> u32 {
    seconds.clamp(MIN_CUSTOM_SECONDS, HARD_MAX_SECONDS)
}

pub fn resolve_recording_limit(config: &AppConfig) -> ResolvedRecordingLimit {
    resolve_recording_limit_for(config.active_speech_preset(), config)
}

/// The limit for `preset` with the mode and custom value from `config`. Settings passes the
/// preset on screen, which may not be saved yet (plan `qwen-cloud-speech`).
pub fn resolve_recording_limit_for(
    preset: &SpeechPreset,
    config: &AppConfig,
) -> ResolvedRecordingLimit {
    let capability = speech_capability(preset);
    let requested_seconds = match config.recording_limit_mode {
        RecordingLimitMode::Auto => capability.recommended_max_seconds,
        RecordingLimitMode::Custom => config.custom_recording_limit_seconds,
    };
    let effective_max_seconds = match config.recording_limit_mode {
        RecordingLimitMode::Auto => requested_seconds.min(capability.hard_max_seconds),
        RecordingLimitMode::Custom => requested_seconds
            .max(MIN_CUSTOM_SECONDS)
            .min(capability.hard_max_seconds),
    };

    ResolvedRecordingLimit {
        capability,
        mode: config.recording_limit_mode,
        requested_seconds,
        effective_max_seconds,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::AppConfig;

    fn config(mode: RecordingLimitMode, custom_seconds: u32) -> AppConfig {
        AppConfig {
            recording_limit_mode: mode,
            custom_recording_limit_seconds: custom_seconds,
            ..AppConfig::default()
        }
    }

    #[test]
    fn auto_mode_uses_the_client_buffer_capability() {
        let resolved = resolve_recording_limit(&config(RecordingLimitMode::Auto, 60));

        assert_eq!(resolved.capability.transport, SttTransport::FileUpload);
        assert_eq!(
            resolved.capability.source,
            RecordingLimitSource::ClientBuffer
        );
        assert_eq!(resolved.capability.recommended_max_seconds, 600);
        assert_eq!(resolved.capability.hard_max_seconds, 720);
        assert_eq!(resolved.capability.max_upload_bytes, Some(24 * 1024 * 1024));
        assert_eq!(
            resolved.capability.explanation_key,
            "recordingLimits.reasons.clientBuffer"
        );
        assert_eq!(resolved.capability.provider_id, "builtin-speech-this-mac");
        assert_eq!(resolved.effective_max_seconds, 600);
    }

    #[test]
    fn qwen_cloud_presets_use_the_service_limit() {
        let mut config = config(RecordingLimitMode::Auto, 60);
        config.speech_presets.push(SpeechPreset::qwen_cloud(
            "qwen",
            "Qwen Cloud",
            qwen_cloud::DEFAULT_BASE_URL,
            qwen_cloud::DEFAULT_MODEL,
        ));
        config.active_speech_preset_id = "qwen".to_string();

        let auto = resolve_recording_limit(&config);
        assert_eq!(auto.capability.source, RecordingLimitSource::Provider);
        assert_eq!(
            auto.capability.explanation_key,
            "recordingLimits.reasons.provider"
        );
        assert_eq!(auto.effective_max_seconds, 240);

        config.recording_limit_mode = RecordingLimitMode::Custom;
        config.custom_recording_limit_seconds = 600;
        assert_eq!(resolve_recording_limit(&config).effective_max_seconds, 290);
    }

    #[test]
    fn custom_mode_clamps_to_the_safe_range() {
        let too_low = resolve_recording_limit(&config(RecordingLimitMode::Custom, 1));
        let in_range = resolve_recording_limit(&config(RecordingLimitMode::Custom, 120));
        let too_high = resolve_recording_limit(&config(RecordingLimitMode::Custom, 9_999));

        assert_eq!(too_low.effective_max_seconds, 30);
        assert_eq!(in_range.effective_max_seconds, 120);
        assert_eq!(too_high.effective_max_seconds, 720);
        assert_eq!(too_high.requested_seconds, 9_999);
    }
}
