//! Qwen Cloud speech recognition (plan `qwen-cloud-speech`).
//!
//! `qwen-audio-3.0-asr-flash` only answers on Qwen's native multimodal endpoint, not on the
//! OpenAI-compatible `/audio/transcriptions`, so it has its own uploader. The recording is sent
//! as a base64 WAV data URI inside a JSON body:
//!
//! `POST {base}/services/aigc/multimodal-generation/generation`
//! with `{"model", "input": {"messages": [...input_audio...]}, "parameters": {...}}`.
//!
//! The endpoint answers audio without speech with a bare `400 {}`; that is "no speech", not an
//! error. See `docs/plans/2026-09-25-qwen-cloud-speech/api.md` for the probed behaviour.

use async_trait::async_trait;
use base64::engine::general_purpose::STANDARD;
use base64::Engine as _;

use crate::error::AppError;

use super::silence::{peak_window_level_db, SILENCE_THRESHOLD_DB};
use super::transcript::normalize_transcript;
use super::whisper_compat::WhisperCompatProvider;
use super::{SttConfig, SttProvider, TranscriptEvent};

/// The Token Plan address.
pub const DEFAULT_BASE_URL: &str = "https://token-plan.maas.qwencloudapi.com/api/v1";
pub const DEFAULT_MODEL: &str = "qwen-audio-3.0-asr-flash";

const GENERATION_PATH: &str = "/services/aigc/multimodal-generation/generation";
/// The address Qwen shows next to a key; the speech model does not work there.
const COMPATIBLE_MODE_PATH: &str = "/compatible-mode/v1";
const NATIVE_API_PATH: &str = "/api/v1";

/// Suggested recording limit in "auto" mode.
pub const RECOMMENDED_MAX_SECONDS: u32 = 240;
/// 300 s of audio still works; 330 s gets a `400` with an empty transcript that looks like
/// silence. Stay below 5 minutes.
pub const HARD_MAX_SECONDS: u32 = 290;
/// The provider buffers up to 300 s (the longest audio the service accepts), so the last
/// chunks after the recording limit still fit.
const MAX_BUFFER_SECONDS: usize = 300;

const REQUEST_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(60);
const TEST_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(15);

/// Settings for one Qwen Cloud speech preset.
#[derive(Debug, Clone)]
pub struct QwenCloudConfig {
    /// Shown in logs; the speech preset name.
    pub provider_name: String,
    /// Full `.../multimodal-generation/generation` URL.
    pub endpoint: String,
    pub model: String,
}

/// Full generation URL for a base URL. Accepts the host alone, `.../api/v1`, the full
/// endpoint, or the `.../compatible-mode/v1` address that Qwen shows for the key.
pub fn generation_endpoint(base_url: &str) -> Result<String, String> {
    let normalized = super::config::normalize_base_url(base_url)?;
    let mut parsed = url::Url::parse(&normalized).map_err(|e| e.to_string())?;
    let path = parsed.path().trim_end_matches('/').to_string();
    let path = if path.ends_with(GENERATION_PATH) {
        path
    } else if let Some(root) = path.strip_suffix(COMPATIBLE_MODE_PATH) {
        format!("{root}{NATIVE_API_PATH}{GENERATION_PATH}")
    } else if path.is_empty() {
        format!("{NATIVE_API_PATH}{GENERATION_PATH}")
    } else {
        format!("{path}{GENERATION_PATH}")
    };
    parsed.set_path(&path);
    Ok(parsed.to_string())
}

/// The JSON body for one recording. `language: None` lets the model detect the language.
pub fn build_request_body(
    model: &str,
    wav: &[u8],
    sample_rate: u32,
    language: Option<&str>,
) -> serde_json::Value {
    let mut parameters = serde_json::json!({
        "format": "wav",
        "sample_rate": sample_rate.to_string(),
    });
    if let Some(language) = language.map(str::trim).filter(|l| !l.is_empty()) {
        parameters["language"] = serde_json::Value::String(language.to_string());
    }
    serde_json::json!({
        "model": model,
        "input": {
            "messages": [{
                "role": "user",
                "content": [{
                    "type": "input_audio",
                    "input_audio": {
                        "data": format!("data:audio/wav;base64,{}", STANDARD.encode(wav)),
                    },
                }],
            }],
        },
        "parameters": parameters,
    })
}

/// The transcript from a success answer: `output.text`, else the top-level `text`, else the
/// sentence text (one object, or a list whose texts are joined).
pub fn parse_transcript(body: &serde_json::Value) -> String {
    let direct = [&body["output"]["text"], &body["text"]]
        .into_iter()
        .filter_map(serde_json::Value::as_str)
        .find(|text| !text.trim().is_empty());
    if let Some(text) = direct {
        return normalize_transcript(text);
    }
    let sentence = &body["output"]["sentence"];
    let joined = match sentence {
        serde_json::Value::Array(items) => items
            .iter()
            .filter_map(|item| item["text"].as_str())
            .collect::<Vec<_>>()
            .join(" "),
        _ => sentence["text"].as_str().unwrap_or("").to_string(),
    };
    normalize_transcript(&joined)
}

/// Keys a "no speech" answer may carry. Anything else (`code`, `message`, `error`, ...) means
/// a real error that must be shown, not taken for silence.
const NO_SPEECH_KEYS: [&str; 5] = ["output", "sentence", "text", "request_id", "usage"];

/// True for the endpoint's "no speech" answer: a `400` whose body is empty, `{}`, or a result
/// with an empty transcript and only result fields.
pub fn is_no_speech_answer(status: u16, body: &str) -> bool {
    if status != 400 {
        return false;
    }
    let trimmed = body.trim();
    if trimmed.is_empty() {
        return true;
    }
    match serde_json::from_str::<serde_json::Value>(trimmed) {
        Ok(serde_json::Value::Object(fields)) => {
            fields
                .keys()
                .all(|key| NO_SPEECH_KEYS.contains(&key.as_str()))
                && parse_transcript(&serde_json::Value::Object(fields)).is_empty()
        }
        _ => false,
    }
}

/// The first 200 characters of an error body, cut at a character boundary.
fn short_body(body: &str) -> String {
    body.chars().take(200).collect()
}

/// Sends 0.1 s of silence and returns the round-trip time in milliseconds. A `2xx` or the
/// "no speech" answer passes; anything else fails with the status and the service's message.
pub async fn check_connection(
    client: &reqwest::Client,
    config: &QwenCloudConfig,
    api_key: &str,
) -> Result<u32, String> {
    let api_key = api_key.trim();
    if api_key.is_empty() {
        return Err("Qwen Cloud needs an API key".to_string());
    }
    let wav = WhisperCompatProvider::build_wav(&[0u8; 3200], 16_000);
    let body = build_request_body(&config.model, &wav, 16_000, None);
    let started = std::time::Instant::now();
    let resp = client
        .post(&config.endpoint)
        .bearer_auth(api_key)
        .json(&body)
        .timeout(TEST_TIMEOUT)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let elapsed = started.elapsed().as_millis() as u32;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if status.is_success() || is_no_speech_answer(status.as_u16(), &text) {
        return Ok(elapsed);
    }
    let details = short_body(&text);
    Err(if details.trim().is_empty() {
        format!("HTTP {status}")
    } else {
        format!("HTTP {status}: {details}")
    })
}

/// The `SttProvider` for Qwen Cloud presets. Buffers the recording and uploads it in
/// `disconnect`, like the OpenAI-compatible uploader.
pub struct QwenCloudProvider {
    config: QwenCloudConfig,
    stt_config: Option<SttConfig>,
    audio_buffer: Vec<u8>,
    client: reqwest::Client,
    upload_probe: Option<crate::timing::UploadProbe>,
}

impl QwenCloudProvider {
    pub fn new(config: QwenCloudConfig, client: Option<reqwest::Client>) -> Self {
        Self {
            config,
            stt_config: None,
            audio_buffer: Vec::new(),
            client: client.unwrap_or_default(),
            upload_probe: None,
        }
    }

    fn max_audio_bytes(sample_rate: u32) -> usize {
        MAX_BUFFER_SECONDS * sample_rate as usize * 2
    }

    /// Sends the recording, retrying server errors and timeouts up to two times.
    async fn upload(&self, config: &SttConfig, wav: Vec<u8>) -> Result<Option<String>, AppError> {
        let body = build_request_body(
            &self.config.model,
            &wav,
            config.sample_rate,
            config.language.as_deref(),
        );
        // The body holds its own base64 copy; free the WAV for the retry loop.
        drop(wav);
        let name = &self.config.provider_name;
        let mut attempt = 0u32;
        loop {
            let started = std::time::Instant::now();
            let result = self
                .client
                .post(&self.config.endpoint)
                .bearer_auth(config.api_key.trim())
                .json(&body)
                .timeout(REQUEST_TIMEOUT)
                .send()
                .await;
            tracing::info!(
                "{name}: POST {} answered after {} ms ({})",
                self.config.endpoint,
                started.elapsed().as_millis(),
                match &result {
                    Ok(resp) => format!("HTTP {}", resp.status().as_u16()),
                    Err(error) => format!("error: {error}"),
                }
            );

            let retryable = match result {
                Ok(resp) => {
                    let status = resp.status().as_u16();
                    let text = resp.text().await.unwrap_or_default();
                    if (200..300).contains(&status) {
                        let value: serde_json::Value = serde_json::from_str(&text)
                            .map_err(|e| AppError::Config(e.to_string()))?;
                        let transcript = parse_transcript(&value);
                        tracing::info!("{name} transcription: {} chars", transcript.len());
                        return Ok((!transcript.is_empty()).then_some(transcript));
                    }
                    if is_no_speech_answer(status, &text) {
                        tracing::info!("{name}: the service heard no speech");
                        return Ok(None);
                    }
                    let details = short_body(&text);
                    if status < 500 || attempt >= 2 {
                        tracing::error!("{name} HTTP {status}: {details}");
                        return Err(AppError::Api {
                            status,
                            body: details,
                        });
                    }
                    format!("server error {status}: {details}")
                }
                Err(error) if error.is_timeout() && attempt < 2 => "timeout".to_string(),
                Err(error) if error.is_timeout() => {
                    tracing::error!("{name}: no answer within {} s", REQUEST_TIMEOUT.as_secs());
                    return Err(AppError::Timeout(REQUEST_TIMEOUT));
                }
                Err(error) => return Err(error.into()),
            };
            attempt += 1;
            tracing::warn!("{name} {retryable} (attempt {attempt}/3)");
            tokio::time::sleep(std::time::Duration::from_millis(
                1000 * 2u64.pow(attempt - 1),
            ))
            .await;
        }
    }
}

#[async_trait]
impl SttProvider for QwenCloudProvider {
    async fn connect(&mut self, config: &SttConfig) -> Result<(), AppError> {
        if config.api_key.trim().is_empty() {
            return Err(AppError::Auth(format!(
                "{}: enter your Qwen Cloud API key in Settings → Speech",
                self.config.provider_name
            )));
        }
        self.stt_config = Some(config.clone());
        self.audio_buffer.clear();
        tracing::info!(
            "{} provider ready (buffering mode)",
            self.config.provider_name
        );
        Ok(())
    }

    async fn send_audio(&mut self, chunk: &[u8]) -> Result<(), AppError> {
        let sample_rate = self
            .stt_config
            .as_ref()
            .map_or(16_000, |config| config.sample_rate);
        if self.audio_buffer.len() + chunk.len() > Self::max_audio_bytes(sample_rate) {
            return Err(AppError::Config(format!(
                "{}: audio exceeds Qwen Cloud's maximum length ({MAX_BUFFER_SECONDS} s)",
                self.config.provider_name
            )));
        }
        self.audio_buffer.extend_from_slice(chunk);
        Ok(())
    }

    async fn recv_transcript(&mut self) -> Result<Option<TranscriptEvent>, AppError> {
        // Transcribed in disconnect(); stay pending so the pipeline loop does not busy-spin.
        std::future::pending().await
    }

    async fn disconnect(&mut self) -> Result<Option<String>, AppError> {
        let Some(config) = self.stt_config.clone() else {
            return Ok(None);
        };
        if self.audio_buffer.is_empty() {
            tracing::info!("{}: no audio buffered, skipping", self.config.provider_name);
            return Ok(None);
        }
        if let Some(probe) = &self.upload_probe {
            probe.note_audio(self.audio_buffer.len(), config.sample_rate);
        }
        let peak_db = peak_window_level_db(&self.audio_buffer, config.sample_rate);
        if peak_db < SILENCE_THRESHOLD_DB {
            tracing::info!(
                "{}: no speech detected (loudest 50 ms at {:.0} dBFS), skipping the request",
                self.config.provider_name,
                peak_db
            );
            self.audio_buffer.clear();
            return Ok(None);
        }

        let audio_secs = self.audio_buffer.len() as f64 / (config.sample_rate as f64 * 2.0);
        let wav = WhisperCompatProvider::build_wav(&self.audio_buffer, config.sample_rate);
        self.audio_buffer.clear();
        if let Some(probe) = &self.upload_probe {
            probe.mark_started(wav.len());
        }
        tracing::info!(
            "{}: sending {:.1}s of audio for transcription",
            self.config.provider_name,
            audio_secs
        );
        let result = self.upload(&config, wav).await;
        if let Some(probe) = &self.upload_probe {
            probe.mark_finished();
        }
        result
    }

    fn name(&self) -> &str {
        &self.config.provider_name
    }

    fn set_upload_probe(&mut self, probe: crate::timing::UploadProbe) {
        self.upload_probe = Some(probe);
    }
}

#[cfg(test)]
mod tests {
    use super::super::silence::pcm_tone;
    use super::*;

    fn config(endpoint: &str) -> QwenCloudConfig {
        QwenCloudConfig {
            provider_name: "Qwen test".to_string(),
            endpoint: endpoint.to_string(),
            model: DEFAULT_MODEL.to_string(),
        }
    }

    fn stt_config() -> SttConfig {
        SttConfig {
            api_key: "sk-test".to_string(),
            ..SttConfig::default()
        }
    }

    #[test]
    fn endpoint_accepts_every_address_form() {
        let full = "https://token-plan.maas.qwencloudapi.com/api/v1/services/aigc/multimodal-generation/generation";
        for input in [
            "https://token-plan.maas.qwencloudapi.com",
            "https://token-plan.maas.qwencloudapi.com/api/v1/",
            "https://token-plan.maas.qwencloudapi.com/compatible-mode/v1",
            full,
        ] {
            assert_eq!(generation_endpoint(input).unwrap(), full, "{input}");
        }
        assert!(generation_endpoint("ftp://example.com").is_err());
    }

    #[test]
    fn request_body_embeds_the_wav_and_optional_language() {
        let body = build_request_body("m", b"RIFF", 16_000, Some("zh"));
        let audio = &body["input"]["messages"][0]["content"][0];
        assert_eq!(body["model"], "m");
        assert_eq!(audio["type"], "input_audio");
        assert_eq!(
            audio["input_audio"]["data"],
            "data:audio/wav;base64,UklGRg=="
        );
        assert_eq!(body["parameters"]["format"], "wav");
        assert_eq!(body["parameters"]["sample_rate"], "16000");
        assert_eq!(body["parameters"]["language"], "zh");

        let auto = build_request_body("m", b"RIFF", 16_000, None);
        assert!(auto["parameters"].get("language").is_none());
    }

    #[test]
    fn transcript_prefers_output_text_and_falls_back_to_sentences() {
        let full = serde_json::json!({
            "output": {"text": "Hello there. ", "sentence": {"text": "ignored"}},
            "text": "ignored too"
        });
        assert_eq!(parse_transcript(&full), "Hello there.");

        let sentence_only = serde_json::json!({"output": {"sentence": {"text": "你好 世界"}}});
        assert_eq!(parse_transcript(&sentence_only), "你好世界");

        let list =
            serde_json::json!({"output": {"sentence": [{"text": "One."}, {"text": "Two."}]}});
        assert_eq!(parse_transcript(&list), "One. Two.");

        assert_eq!(parse_transcript(&serde_json::json!({})), "");
    }

    #[test]
    fn only_an_empty_400_means_no_speech() {
        assert!(is_no_speech_answer(400, "{}"));
        assert!(is_no_speech_answer(400, "  "));
        assert!(is_no_speech_answer(
            400,
            r#"{"output": {"sentence": {"text": ""}}, "text": ""}"#
        ));
        assert!(!is_no_speech_answer(
            400,
            r#"{"code": "InvalidParameter", "message": "url error"}"#
        ));
        assert!(!is_no_speech_answer(401, "{}"));
        assert!(!is_no_speech_answer(
            404,
            r#"{"message": "Model not exist."}"#
        ));
        assert!(!is_no_speech_answer(400, "<html>bad gateway</html>"));
        assert!(!is_no_speech_answer(400, r#"{"message": "x"}"#));
        assert!(!is_no_speech_answer(400, r#"{"error": {"message": "x"}}"#));
        assert!(!is_no_speech_answer(400, "[]"));
    }

    #[tokio::test]
    async fn connect_requires_an_api_key() {
        let mut provider = QwenCloudProvider::new(config("http://127.0.0.1:9/x"), None);
        assert!(provider.connect(&SttConfig::default()).await.is_err());
        assert!(provider.connect(&stt_config()).await.is_ok());
    }

    #[tokio::test]
    async fn buffers_past_the_recording_limit_but_not_past_five_minutes() {
        let mut provider = QwenCloudProvider::new(config("http://127.0.0.1:9/x"), None);
        provider.connect(&stt_config()).await.unwrap();
        let limit = QwenCloudProvider::max_audio_bytes(16_000);
        assert!(limit > HARD_MAX_SECONDS as usize * 32_000);
        assert!(provider.send_audio(&vec![0u8; limit]).await.is_ok());
        assert!(provider.send_audio(&[0u8; 2]).await.is_err());
    }

    #[tokio::test]
    async fn silent_recording_is_not_uploaded() {
        let mut provider = QwenCloudProvider::new(config("http://127.0.0.1:9/x"), None);
        let probe = crate::timing::UploadProbe::default();
        provider.set_upload_probe(probe.clone());
        provider.connect(&stt_config()).await.unwrap();
        provider.send_audio(&[0u8; 32_000]).await.unwrap();

        assert!(matches!(provider.disconnect().await, Ok(None)));
        assert!(probe.snapshot().started_at.is_none());
    }

    #[tokio::test]
    async fn failed_upload_still_marks_the_probe() {
        // Port 9 on localhost refuses the connection at once, so there is no retry wait.
        let mut provider = QwenCloudProvider::new(config("http://127.0.0.1:9/x"), None);
        let probe = crate::timing::UploadProbe::default();
        provider.set_upload_probe(probe.clone());
        provider.connect(&stt_config()).await.unwrap();
        provider
            .send_audio(&pcm_tone(0.3, 1.0, 16_000))
            .await
            .unwrap();

        assert!(provider.disconnect().await.is_err());
        let marks = probe.snapshot();
        assert!(marks.started_at.is_some());
        assert!(marks.finished_at.is_some());
    }
}
