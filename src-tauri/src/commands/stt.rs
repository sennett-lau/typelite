use crate::credentials::{resolve_config_secret, SystemCredentialVault};
use crate::storage;
use crate::stt;

/// Recording limit for the given mode, used by Settings → Speech to show the limit.
#[tauri::command]
pub async fn get_stt_recording_capability(
    state: tauri::State<'_, storage::ConfigManager>,
    mode: stt::capabilities::RecordingLimitMode,
    custom_seconds: u32,
) -> Result<stt::capabilities::ResolvedRecordingLimit, String> {
    let mut config = state.load().await.map_err(|error| error.to_string())?;
    config.recording_limit_mode = mode;
    config.custom_recording_limit_seconds = custom_seconds;
    Ok(stt::capabilities::resolve_recording_limit(&config))
}

/// Builds the multipart form the Test button sends: 0.1 s of silence as a WAV file.
/// Uses the same field names (`model`, `file`, `language`) as a real recording.
fn silent_test_form(
    preset: &storage::SpeechPreset,
    model: &str,
) -> Result<reqwest::multipart::Form, String> {
    let silent_pcm = vec![0u8; 3200]; // 0.1 s at 16 kHz, 16-bit mono
    let wav = stt::whisper_compat::WhisperCompatProvider::build_wav(&silent_pcm, 16000);
    let file_part = reqwest::multipart::Part::bytes(wav)
        .file_name("test.wav")
        .mime_str("audio/wav")
        .map_err(|e| e.to_string())?;
    let mut form = reqwest::multipart::Form::new()
        .text("model", model.to_string())
        .part("file", file_part);
    let language = preset.language.trim();
    if !language.is_empty() && language != storage::SPEECH_LANGUAGE_AUTO {
        form = form.text("language", language.to_string());
    }
    Ok(form)
}

/// Sends a short silent clip to the preset's endpoint and returns the round-trip time in
/// milliseconds. Any 2xx answer counts as success (silence usually gives empty text).
///
/// `api_key` is the key typed in Settings; when it is empty the key stored in the
/// Keychain for this preset is used. A pass is saved as the preset's `verified_at` when the
/// stored preset has the tested connection (see `record_speech_test_passed`).
#[tauri::command]
pub async fn test_speech_preset(
    app: tauri::AppHandle,
    state: tauri::State<'_, storage::ConfigManager>,
    preset: storage::SpeechPreset,
    api_key: String,
    client: tauri::State<'_, reqwest::Client>,
) -> Result<u32, String> {
    if preset.is_builtin_whisper() {
        // Plan `quick-speech-setup`: load the model and run it on a short synthetic clip.
        let config = stt::config::build_builtin_config(&preset)?;
        let elapsed = stt::builtin::self_test(&config.model_file).await?;
        crate::commands::config::record_speech_test_passed(&app, &state, &preset).await;
        return Ok(elapsed);
    }
    if storage::base_url_has_placeholder(&preset.base_url) {
        return Err(storage::PLACEHOLDER_URL_ERROR.to_string());
    }
    let api_key = resolve_config_secret(&api_key, "stt", &preset.id, &SystemCredentialVault)
        .map_err(|e| e.to_string())?;
    let cfg = stt::config::build_whisper_config(&preset)?;
    let form = silent_test_form(&preset, &cfg.model)?;

    let started = std::time::Instant::now();
    let mut request = client
        .post(&cfg.endpoint)
        .multipart(form)
        .timeout(std::time::Duration::from_secs(15));
    if !api_key.trim().is_empty() {
        request = request.header("Authorization", format!("Bearer {}", api_key.trim()));
    }

    let resp = request.send().await.map_err(|e| e.to_string())?;
    let elapsed = started.elapsed().as_millis() as u32;
    let status = resp.status();
    if !status.is_success() {
        let details: String = resp
            .text()
            .await
            .unwrap_or_default()
            .chars()
            .take(200)
            .collect();
        return Err(if details.trim().is_empty() {
            format!("HTTP {status}")
        } else {
            format!("HTTP {status}: {details}")
        });
    }
    crate::commands::config::record_speech_test_passed(&app, &state, &preset).await;
    Ok(elapsed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn silent_test_form_builds_for_auto_and_explicit_language() {
        let mut preset = storage::SpeechPreset::server(
            "test",
            "Test",
            "http://127.0.0.1:8178/v1",
            "large-v3-turbo",
        );
        assert!(silent_test_form(&preset, "large-v3-turbo").is_ok());

        preset.language = "en".to_string();
        assert!(silent_test_form(&preset, "large-v3-turbo").is_ok());
    }
}
