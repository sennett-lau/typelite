//! Turns a speech preset into the settings the Whisper-compatible uploader needs.
//!
//! Every speech preset talks to one OpenAI-compatible endpoint:
//! `POST {base_url}/audio/transcriptions` with a multipart WAV upload.

use super::whisper_compat::WhisperCompatConfig;
use crate::storage::SpeechPreset;

const TRANSCRIPTIONS_PATH: &str = "/audio/transcriptions";

/// Checks and tidies a user-entered base URL.
///
/// Accepts only `http://` and `https://`, rejects embedded credentials and fragments, and
/// removes trailing slashes from the path. The query string (for example `?api-version=...`)
/// is kept.
pub fn normalize_base_url(base_url: &str) -> Result<String, String> {
    let trimmed = base_url.trim();
    if trimmed.is_empty() {
        return Err("Base URL is required".to_string());
    }

    let mut parsed =
        url::Url::parse(trimmed).map_err(|_| "Base URL must be a valid URL".to_string())?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err("Base URL must start with http:// or https://".to_string());
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("Base URL must not include credentials".to_string());
    }
    if parsed.fragment().is_some() {
        return Err("Base URL must not include a fragment".to_string());
    }

    let path = parsed.path().trim_end_matches('/').to_string();
    parsed.set_path(&path);
    let mut normalized = parsed.to_string();
    // `Url` always prints at least "/" for the path of an http URL. Drop it so
    // "http://host:8178/" and "http://host:8178" are stored the same way.
    if path.is_empty() && parsed.query().is_none() && normalized.ends_with('/') {
        normalized.pop();
    }
    Ok(normalized)
}

/// Full transcription URL for a base URL. Appends `/audio/transcriptions` unless the user
/// already entered the full endpoint.
pub fn transcription_endpoint(base_url: &str) -> Result<String, String> {
    let normalized = normalize_base_url(base_url)?;
    let mut parsed = url::Url::parse(&normalized).map_err(|e| e.to_string())?;
    let path = parsed.path().trim_end_matches('/').to_string();
    if !path.ends_with(TRANSCRIPTIONS_PATH) {
        parsed.set_path(&format!("{path}{TRANSCRIPTIONS_PATH}"));
    }
    Ok(parsed.to_string())
}

/// Builds the uploader settings for a speech preset.
pub fn build_whisper_config(preset: &SpeechPreset) -> Result<WhisperCompatConfig, String> {
    let model = preset.model.trim();
    if model.is_empty() {
        return Err("Model is required for the speech preset".to_string());
    }

    Ok(WhisperCompatConfig {
        provider_name: preset.name.clone(),
        endpoint: transcription_endpoint(&preset.base_url)?,
        model: model.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn preset(base_url: &str, model: &str) -> SpeechPreset {
        SpeechPreset {
            id: "test".to_string(),
            name: "Test".to_string(),
            base_url: base_url.to_string(),
            model: model.to_string(),
            language: "auto".to_string(),
            builtin: false,
            verified_at: None,
        }
    }

    #[test]
    fn base_url_is_trimmed_and_loses_trailing_slashes() {
        assert_eq!(
            normalize_base_url("  http://127.0.0.1:8178/v1/  ").unwrap(),
            "http://127.0.0.1:8178/v1"
        );
        assert_eq!(
            normalize_base_url("http://127.0.0.1:8178/").unwrap(),
            "http://127.0.0.1:8178"
        );
    }

    #[test]
    fn base_url_keeps_query() {
        assert_eq!(
            normalize_base_url("https://example.com/openai/?api-version=2026-01-01").unwrap(),
            "https://example.com/openai?api-version=2026-01-01"
        );
    }

    #[test]
    fn base_url_rejects_bad_input() {
        assert!(normalize_base_url("   ")
            .unwrap_err()
            .contains("Base URL is required"));
        assert!(normalize_base_url("file:///tmp/server")
            .unwrap_err()
            .contains("http://"));
        assert!(normalize_base_url("https://user:secret@example.com/v1")
            .unwrap_err()
            .contains("credentials"));
        assert!(normalize_base_url("https://example.com/v1#section")
            .unwrap_err()
            .contains("fragment"));
        assert!(normalize_base_url("not a url").is_err());
    }

    #[test]
    fn transcription_endpoint_appends_path_once() {
        assert_eq!(
            transcription_endpoint("http://127.0.0.1:8178/v1").unwrap(),
            "http://127.0.0.1:8178/v1/audio/transcriptions"
        );
        assert_eq!(
            transcription_endpoint("http://127.0.0.1:8178/v1/audio/transcriptions/").unwrap(),
            "http://127.0.0.1:8178/v1/audio/transcriptions"
        );
    }

    #[test]
    fn transcription_endpoint_appends_path_before_query() {
        assert_eq!(
            transcription_endpoint("https://example.com/openai?api-version=2026-01-01").unwrap(),
            "https://example.com/openai/audio/transcriptions?api-version=2026-01-01"
        );
    }

    #[test]
    fn whisper_config_uses_preset_values() {
        let cfg =
            build_whisper_config(&preset("http://127.0.0.1:8178/v1", " large-v3-turbo ")).unwrap();
        assert_eq!(cfg.provider_name, "Test");
        assert_eq!(
            cfg.endpoint,
            "http://127.0.0.1:8178/v1/audio/transcriptions"
        );
        assert_eq!(cfg.model, "large-v3-turbo");
    }

    #[test]
    fn whisper_config_requires_model() {
        let err = build_whisper_config(&preset("http://127.0.0.1:8178/v1", "  ")).unwrap_err();
        assert!(err.contains("Model is required"));
    }
}
