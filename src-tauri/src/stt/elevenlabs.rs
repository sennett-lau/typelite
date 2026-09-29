//! ElevenLabs Scribe speech recognition (plan `elevenlabs-speech`).
//!
//! ElevenLabs does not speak the OpenAI transcription API, so it has its own uploader:
//!
//! `POST {base}/v1/speech-to-text`, header `xi-api-key`, multipart fields `file`, `model_id`,
//! `tag_audio_events=false` and an optional `language_code`.
//!
//! The answer is JSON with `text`, `language_code` (ISO 639-3, such as `eng`, `cmn`, `yue`),
//! `language_probability` and `words`. The language code is turned into the short code the
//! polish router uses (`en`, `zh`, `yue`). See `docs/plans/2026-09-29-elevenlabs-speech/api.md`.

use async_trait::async_trait;

use crate::error::AppError;

use super::silence::{accept_transcript, log_decision, NoSpeechGuard, VoiceActivity};
use super::transcript::normalize_transcript;
use super::whisper_compat::WhisperCompatProvider;
use super::{SttConfig, SttProvider, TranscriptEvent};

pub const DEFAULT_BASE_URL: &str = "https://api.elevenlabs.io";
pub const DEFAULT_MODEL: &str = "scribe_v2";

const SPEECH_TO_TEXT_PATH: &str = "/v1/speech-to-text";
const VERSION_PATH: &str = "/v1";

/// The upload buffer is the same as for OpenAI-compatible uploads, so the app's usual recording
/// limit applies. ElevenLabs itself accepts much longer files.
const MAX_AUDIO_BYTES: usize = super::capabilities::CLIENT_FILE_BUFFER_BYTES as usize;

const REQUEST_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(60);
const TEST_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(15);

/// Settings for one ElevenLabs speech preset.
#[derive(Debug, Clone)]
pub struct ElevenLabsConfig {
    /// Shown in logs; the speech preset name.
    pub provider_name: String,
    /// Full `.../v1/speech-to-text` URL.
    pub endpoint: String,
    pub model: String,
}

/// Full speech-to-text URL for a base URL. Accepts the host alone, `.../v1`, or the full
/// endpoint.
pub fn speech_to_text_endpoint(base_url: &str) -> Result<String, String> {
    let normalized = super::config::normalize_base_url(base_url)?;
    let mut parsed = url::Url::parse(&normalized).map_err(|e| e.to_string())?;
    let path = parsed.path().trim_end_matches('/').to_string();
    let path = if path.ends_with(SPEECH_TO_TEXT_PATH) {
        path
    } else if let Some(root) = path.strip_suffix(VERSION_PATH) {
        format!("{root}{SPEECH_TO_TEXT_PATH}")
    } else {
        format!("{path}{SPEECH_TO_TEXT_PATH}")
    };
    parsed.set_path(&path);
    Ok(parsed.to_string())
}

/// The text fields of one request, in the order they are sent. `language: None` (or `auto`)
/// lets Scribe detect the language. Audio event tags such as "(laughter)" are turned off so
/// they are never pasted.
pub fn request_fields(model: &str, language: Option<&str>) -> Vec<(&'static str, String)> {
    let mut fields = vec![
        ("model_id", model.to_string()),
        ("tag_audio_events", "false".to_string()),
    ];
    if let Some(language) = language
        .map(str::trim)
        .filter(|l| !l.is_empty() && !l.eq_ignore_ascii_case("auto"))
    {
        fields.push(("language_code", language.to_string()));
    }
    fields
}

/// The multipart form for one WAV recording.
pub fn build_form(
    model: &str,
    wav: Vec<u8>,
    language: Option<&str>,
) -> Result<reqwest::multipart::Form, AppError> {
    let file = reqwest::multipart::Part::bytes(wav)
        .file_name("audio.wav")
        .mime_str("audio/wav")
        .map_err(|e| AppError::Config(e.to_string()))?;
    let mut form = reqwest::multipart::Form::new();
    for (name, value) in request_fields(model, language) {
        form = form.text(name, value);
    }
    Ok(form.part("file", file))
}

/// ISO 639-3 (and 639-2) codes Scribe reports, as the ISO 639-1 codes the rest of Typelite
/// uses. Chinese varieties other than Cantonese become `zh`, as whisper reports them.
const ISO_639_3_TO_1: &[(&str, &str)] = &[
    ("afr", "af"),
    ("ara", "ar"),
    ("bul", "bg"),
    ("ben", "bn"),
    ("cat", "ca"),
    ("ces", "cs"),
    ("cym", "cy"),
    ("dan", "da"),
    ("deu", "de"),
    ("ell", "el"),
    ("eng", "en"),
    ("spa", "es"),
    ("est", "et"),
    ("fas", "fa"),
    ("fin", "fi"),
    ("fil", "tl"),
    ("tgl", "tl"),
    ("fra", "fr"),
    ("gle", "ga"),
    ("glg", "gl"),
    ("guj", "gu"),
    ("heb", "he"),
    ("hin", "hi"),
    ("hrv", "hr"),
    ("hun", "hu"),
    ("hye", "hy"),
    ("ind", "id"),
    ("isl", "is"),
    ("ita", "it"),
    ("jpn", "ja"),
    ("kat", "ka"),
    ("kaz", "kk"),
    ("kan", "kn"),
    ("kor", "ko"),
    ("lit", "lt"),
    ("lav", "lv"),
    ("mkd", "mk"),
    ("mal", "ml"),
    ("mar", "mr"),
    ("msa", "ms"),
    ("zlm", "ms"),
    ("nld", "nl"),
    ("nor", "no"),
    ("nob", "no"),
    ("pan", "pa"),
    ("pol", "pl"),
    ("por", "pt"),
    ("ron", "ro"),
    ("rus", "ru"),
    ("slk", "sk"),
    ("slv", "sl"),
    ("srp", "sr"),
    ("swe", "sv"),
    ("swa", "sw"),
    ("tam", "ta"),
    ("tel", "te"),
    ("tha", "th"),
    ("tur", "tr"),
    ("ukr", "uk"),
    ("urd", "ur"),
    ("vie", "vi"),
    ("zho", "zh"),
    ("chi", "zh"),
    ("cmn", "zh"),
    ("yue", "yue"),
];

/// The language code of a Scribe answer as Typelite's short code: `eng` → `en`, `cmn` → `zh`,
/// `yue` stays `yue`. Two-letter codes pass through; other three-letter codes are kept as they
/// are. Anything that is not a language code gives `None`.
pub fn normalize_language_code(raw: &str) -> Option<String> {
    let code = super::normalize_detected_language(raw)?;
    if code.len() == 3 {
        if let Some((_, short)) = ISO_639_3_TO_1.iter().find(|(long, _)| *long == code) {
            return Some((*short).to_string());
        }
    }
    Some(code)
}

/// A success answer: the transcript and the detected language.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Answer {
    pub text: String,
    pub language: Option<String>,
}

/// Reads a success answer. `text` is the transcript; the language comes from `language_code`.
pub fn parse_answer(body: &serde_json::Value) -> Answer {
    Answer {
        text: normalize_transcript(body["text"].as_str().unwrap_or("")),
        language: body["language_code"]
            .as_str()
            .and_then(normalize_language_code),
    }
}

/// The service's own message from an error body: `detail.message`, `detail` as text, or the
/// first 200 characters of the body.
fn error_message(body: &str) -> String {
    let parsed: Option<serde_json::Value> = serde_json::from_str(body).ok();
    let detail = parsed.as_ref().map(|value| &value["detail"]);
    let message = detail.and_then(|detail| {
        detail["message"]
            .as_str()
            .or_else(|| detail.as_str())
            .map(str::to_string)
    });
    message
        .unwrap_or_else(|| body.to_string())
        .chars()
        .take(200)
        .collect()
}

/// The `detail.status` of an error body, such as `quota_exceeded` or `invalid_api_key`.
fn error_status(body: &str) -> Option<String> {
    let parsed: serde_json::Value = serde_json::from_str(body).ok()?;
    parsed["detail"]["status"].as_str().map(str::to_string)
}

/// Maps an error answer to the app's error kinds: a used-up quota or a rate limit (`429`) is
/// a quota error, a rejected key (`401`/`403`) an auth error, anything else an API error with
/// the service's message.
pub fn map_error(provider_name: &str, status: u16, body: &str) -> AppError {
    let message = error_message(body);
    let detail_status = error_status(body).unwrap_or_default();
    if detail_status == "quota_exceeded" || status == 429 {
        return AppError::Quota(format!("{provider_name}: {message}"));
    }
    if status == 401 || status == 403 {
        return AppError::Auth(format!(
            "{provider_name}: ElevenLabs rejected the API key ({message})"
        ));
    }
    AppError::Api {
        status,
        body: message,
    }
}

/// Sends 0.5 s of silence and returns the round-trip time in milliseconds. Any `2xx` passes
/// (silence gives empty text); anything else fails with the status and the service's message.
pub async fn check_connection(
    client: &reqwest::Client,
    config: &ElevenLabsConfig,
    api_key: &str,
) -> Result<u32, String> {
    let api_key = api_key.trim();
    if api_key.is_empty() {
        return Err("ElevenLabs needs an API key".to_string());
    }
    let wav = WhisperCompatProvider::build_wav(&[0u8; 16_000], 16_000);
    let form = build_form(&config.model, wav, None).map_err(|e| e.to_string())?;
    let started = std::time::Instant::now();
    let resp = client
        .post(&config.endpoint)
        .header("xi-api-key", api_key)
        .multipart(form)
        .timeout(TEST_TIMEOUT)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let elapsed = started.elapsed().as_millis() as u32;
    let status = resp.status();
    if status.is_success() {
        return Ok(elapsed);
    }
    let text = resp.text().await.unwrap_or_default();
    let details = error_message(&text);
    Err(if details.trim().is_empty() {
        format!("HTTP {status}")
    } else {
        format!("HTTP {status}: {details}")
    })
}

/// The `SttProvider` for ElevenLabs presets. Buffers the recording and uploads it in
/// `disconnect`, like the other uploaders.
pub struct ElevenLabsProvider {
    config: ElevenLabsConfig,
    stt_config: Option<SttConfig>,
    audio_buffer: Vec<u8>,
    client: reqwest::Client,
    upload_probe: Option<crate::timing::UploadProbe>,
    detected_language: Option<String>,
}

impl ElevenLabsProvider {
    pub fn new(config: ElevenLabsConfig, client: Option<reqwest::Client>) -> Self {
        Self {
            config,
            stt_config: None,
            audio_buffer: Vec::new(),
            client: client.unwrap_or_default(),
            upload_probe: None,
            detected_language: None,
        }
    }

    /// Sends the recording, retrying server errors and timeouts up to two times.
    async fn upload(&self, config: &SttConfig, wav: Vec<u8>) -> Result<Answer, AppError> {
        let name = &self.config.provider_name;
        let mut attempt = 0u32;
        loop {
            let form = build_form(&self.config.model, wav.clone(), config.language.as_deref())?;
            let started = std::time::Instant::now();
            let result = self
                .client
                .post(&self.config.endpoint)
                .header("xi-api-key", config.api_key.trim())
                .multipart(form)
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
                        let answer = parse_answer(&value);
                        tracing::info!(
                            "{name} transcription: {} chars, language {}",
                            answer.text.len(),
                            answer.language.as_deref().unwrap_or("unknown")
                        );
                        return Ok(answer);
                    }
                    if status < 500 || attempt >= 2 {
                        tracing::error!("{name} HTTP {status}: {}", error_message(&text));
                        return Err(map_error(name, status, &text));
                    }
                    format!("server error {status}: {}", error_message(&text))
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
impl SttProvider for ElevenLabsProvider {
    async fn connect(&mut self, config: &SttConfig) -> Result<(), AppError> {
        if config.api_key.trim().is_empty() {
            return Err(AppError::Auth(format!(
                "{}: enter your ElevenLabs API key in Settings → Speech",
                self.config.provider_name
            )));
        }
        self.stt_config = Some(config.clone());
        self.audio_buffer.clear();
        self.detected_language = None;
        tracing::info!(
            "{} provider ready (buffering mode)",
            self.config.provider_name
        );
        Ok(())
    }

    async fn send_audio(&mut self, chunk: &[u8]) -> Result<(), AppError> {
        if self.audio_buffer.len() + chunk.len() > MAX_AUDIO_BYTES {
            return Err(AppError::Config(format!(
                "{}: audio exceeds the upload limit",
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
        self.detected_language = None;
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
        // The shared voice check (`stt/silence.rs`): a key click or a mic bump is not speech,
        // so nothing is sent (and nothing is billed).
        let activity = VoiceActivity::measure(&self.audio_buffer, config.sample_rate);
        if !activity.has_speech() {
            log_decision(
                &self.config.provider_name,
                &activity,
                Some(NoSpeechGuard::VoiceCheck),
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
        let answer = result?;
        self.detected_language = answer.language;
        let text = (!answer.text.is_empty()).then_some(answer.text);
        // A short recording whose whole transcript is a known invented phrase is dropped by
        // the hallucination guard, as for every provider.
        Ok(accept_transcript(
            &self.config.provider_name,
            &activity,
            text,
        ))
    }

    fn name(&self) -> &str {
        &self.config.provider_name
    }

    fn set_upload_probe(&mut self, probe: crate::timing::UploadProbe) {
        self.upload_probe = Some(probe);
    }

    fn detected_language(&self) -> Option<String> {
        self.detected_language.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::super::silence::{pcm_tone, test_audio};
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::{Arc, Mutex};
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    /// What the fake service saw: the number of requests and the last request's raw bytes.
    #[derive(Clone, Default)]
    struct Seen {
        hits: Arc<AtomicUsize>,
        last: Arc<Mutex<Vec<u8>>>,
    }

    impl Seen {
        fn hits(&self) -> usize {
            self.hits.load(Ordering::SeqCst)
        }
        fn last_request(&self) -> String {
            String::from_utf8_lossy(&self.last.lock().unwrap()).to_string()
        }
    }

    /// A one-endpoint stand-in for ElevenLabs that answers every request with `status` and
    /// `body`. Returns its endpoint URL and what it received.
    async fn fake_service(status: u16, body: &'static str) -> (String, Seen) {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!(
            "http://{}/v1/speech-to-text",
            listener.local_addr().unwrap()
        );
        let seen = Seen::default();
        let shared = seen.clone();
        tokio::spawn(async move {
            while let Ok((mut socket, _)) = listener.accept().await {
                shared.hits.fetch_add(1, Ordering::SeqCst);
                let last = shared.last.clone();
                tokio::spawn(async move {
                    let mut request = Vec::new();
                    let mut buf = [0u8; 8192];
                    let header_end = loop {
                        let Ok(n) = socket.read(&mut buf).await else {
                            return;
                        };
                        if n == 0 {
                            return;
                        }
                        request.extend_from_slice(&buf[..n]);
                        if let Some(at) = request.windows(4).position(|w| w == b"\r\n\r\n") {
                            break at + 4;
                        }
                    };
                    let headers = String::from_utf8_lossy(&request[..header_end]).to_lowercase();
                    let length: usize = headers
                        .lines()
                        .find_map(|line| line.strip_prefix("content-length:"))
                        .and_then(|value| value.trim().parse().ok())
                        .unwrap_or(0);
                    while request.len() < header_end + length {
                        match socket.read(&mut buf).await {
                            Ok(0) | Err(_) => return,
                            Ok(n) => request.extend_from_slice(&buf[..n]),
                        }
                    }
                    *last.lock().unwrap() = request;
                    let reply = format!(
                        "HTTP/1.1 {status} X\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}",
                        body.len()
                    );
                    let _ = socket.write_all(reply.as_bytes()).await;
                });
            }
        });
        (url, seen)
    }

    /// Two seconds of a clear tone between quiet stretches: passes the voice check.
    fn speech_like() -> Vec<u8> {
        let mut audio = vec![0u8; 16_000];
        audio.extend(pcm_tone(0.3, 2.0, 16_000));
        audio.extend(vec![0u8; 16_000]);
        audio
    }

    fn config(endpoint: &str) -> ElevenLabsConfig {
        ElevenLabsConfig {
            provider_name: "ElevenLabs test".to_string(),
            endpoint: endpoint.to_string(),
            model: DEFAULT_MODEL.to_string(),
        }
    }

    fn stt_config(language: Option<&str>) -> SttConfig {
        SttConfig {
            api_key: "el-test-key".to_string(),
            language: language.map(str::to_string),
            ..SttConfig::default()
        }
    }

    async fn provider_after(
        endpoint: &str,
        audio: &[u8],
        language: Option<&str>,
    ) -> (ElevenLabsProvider, Result<Option<String>, AppError>) {
        let mut provider = ElevenLabsProvider::new(config(endpoint), None);
        provider.connect(&stt_config(language)).await.unwrap();
        provider.send_audio(audio).await.unwrap();
        let result = provider.disconnect().await;
        (provider, result)
    }

    #[test]
    fn endpoint_accepts_every_address_form() {
        let full = "https://api.elevenlabs.io/v1/speech-to-text";
        for input in [
            "https://api.elevenlabs.io",
            "https://api.elevenlabs.io/",
            "https://api.elevenlabs.io/v1",
            "https://api.elevenlabs.io/v1/",
            full,
        ] {
            assert_eq!(speech_to_text_endpoint(input).unwrap(), full, "{input}");
        }
        assert!(speech_to_text_endpoint("ftp://example.com").is_err());
    }

    #[test]
    fn request_fields_turn_off_audio_tags_and_send_a_language_only_when_set() {
        let auto = request_fields("scribe_v2", None);
        assert_eq!(
            auto,
            vec![
                ("model_id", "scribe_v2".to_string()),
                ("tag_audio_events", "false".to_string()),
            ]
        );
        assert_eq!(request_fields("scribe_v2", Some("auto")), auto);
        assert_eq!(request_fields("scribe_v2", Some("  ")), auto);
        let fixed = request_fields("my-model", Some("yue"));
        assert_eq!(fixed[0], ("model_id", "my-model".to_string()));
        assert_eq!(fixed[2], ("language_code", "yue".to_string()));
    }

    #[test]
    fn language_codes_become_short_codes() {
        assert_eq!(normalize_language_code("eng").as_deref(), Some("en"));
        assert_eq!(normalize_language_code("cmn").as_deref(), Some("zh"));
        assert_eq!(normalize_language_code("zho").as_deref(), Some("zh"));
        assert_eq!(normalize_language_code("yue").as_deref(), Some("yue"));
        assert_eq!(normalize_language_code("JPN").as_deref(), Some("ja"));
        assert_eq!(normalize_language_code("en").as_deref(), Some("en"));
        assert_eq!(normalize_language_code("zh-HK").as_deref(), Some("zh"));
        // An unknown three-letter code is kept as it is.
        assert_eq!(normalize_language_code("haw").as_deref(), Some("haw"));
        assert_eq!(normalize_language_code(""), None);
        assert_eq!(normalize_language_code("x<script>"), None);
    }

    #[test]
    fn answers_give_text_and_language() {
        let body = serde_json::json!({
            "language_code": "eng",
            "language_probability": 0.98,
            "text": " Send the notes\nby Friday. ",
            "words": [{"text": "Send", "type": "word"}]
        });
        assert_eq!(
            parse_answer(&body),
            Answer {
                text: "Send the notes by Friday.".to_string(),
                language: Some("en".to_string()),
            }
        );
        let empty = parse_answer(&serde_json::json!({}));
        assert_eq!(empty.text, "");
        assert_eq!(empty.language, None);
    }

    #[test]
    fn errors_map_to_the_app_error_kinds() {
        let bad_key = r#"{"detail":{"status":"invalid_api_key","message":"Invalid API key"}}"#;
        match map_error("EL", 401, bad_key) {
            AppError::Auth(message) => assert!(message.contains("Invalid API key"), "{message}"),
            other => panic!("expected Auth, got {other:?}"),
        }
        assert!(matches!(map_error("EL", 403, "{}"), AppError::Auth(_)));
        let quota = r#"{"detail":{"status":"quota_exceeded","message":"You have 0 credits"}}"#;
        match map_error("EL", 401, quota) {
            AppError::Quota(message) => assert!(message.contains("0 credits"), "{message}"),
            other => panic!("expected Quota, got {other:?}"),
        }
        assert!(matches!(
            map_error(
                "EL",
                429,
                r#"{"detail":{"status":"too_many_concurrent_requests"}}"#
            ),
            AppError::Quota(_)
        ));
        match map_error("EL", 422, r#"{"detail":"model_id is invalid"}"#) {
            AppError::Api { status, body } => {
                assert_eq!(status, 422);
                assert_eq!(body, "model_id is invalid");
            }
            other => panic!("expected Api, got {other:?}"),
        }
        match map_error("EL", 400, "<html>bad</html>") {
            AppError::Api { body, .. } => assert_eq!(body, "<html>bad</html>"),
            other => panic!("expected Api, got {other:?}"),
        }
        // The user sees "invalid key" for a rejected key, as for other services.
        assert_eq!(
            map_error("EL", 401, bad_key).to_user_error().code,
            "stt_invalid_key"
        );
    }

    #[tokio::test]
    async fn connect_requires_an_api_key() {
        let mut provider = ElevenLabsProvider::new(config("http://127.0.0.1:9/x"), None);
        assert!(provider.connect(&SttConfig::default()).await.is_err());
        assert!(provider.connect(&stt_config(None)).await.is_ok());
    }

    #[tokio::test]
    async fn silent_recording_is_not_uploaded() {
        let (endpoint, seen) = fake_service(200, r#"{"text":"Thank you."}"#).await;
        let (_, result) = provider_after(&endpoint, &[0u8; 32_000], None).await;
        assert!(matches!(result, Ok(None)));
        assert_eq!(seen.hits(), 0);
    }

    #[tokio::test]
    async fn a_key_click_in_a_quiet_room_is_not_uploaded() {
        let (endpoint, seen) = fake_service(200, r#"{"text":"Hello."}"#).await;
        let mut samples = test_audio::hiss(-60.0, 2.0);
        test_audio::add_click(&mut samples, 1000);
        let (_, result) = provider_after(&endpoint, &test_audio::to_pcm(&samples), None).await;
        assert!(matches!(result, Ok(None)));
        assert_eq!(seen.hits(), 0);
    }

    #[tokio::test]
    async fn speech_is_uploaded_with_the_key_and_fields_and_its_language_reported() {
        let (endpoint, seen) = fake_service(
            200,
            r#"{"language_code":"yue","language_probability":0.9,"text":"聽日開會","words":[]}"#,
        )
        .await;
        let (provider, result) = provider_after(&endpoint, &speech_like(), Some("yue")).await;
        assert_eq!(result.unwrap().as_deref(), Some("聽日開會"));
        assert_eq!(provider.detected_language().as_deref(), Some("yue"));
        assert_eq!(seen.hits(), 1);

        let request = seen.last_request();
        let lower = request.to_lowercase();
        assert!(request.starts_with("POST /v1/speech-to-text "), "{request}");
        assert!(lower.contains("xi-api-key: el-test-key"));
        assert!(!lower.contains("authorization:"));
        assert!(lower.contains("content-type: multipart/form-data"));
        assert!(request.contains("name=\"model_id\"\r\n\r\nscribe_v2"));
        assert!(request.contains("name=\"tag_audio_events\"\r\n\r\nfalse"));
        assert!(request.contains("name=\"language_code\"\r\n\r\nyue"));
        assert!(request.contains("name=\"file\"; filename=\"audio.wav\""));
        assert!(request.contains("RIFF"));
    }

    #[tokio::test]
    async fn auto_detect_sends_no_language() {
        let (endpoint, seen) =
            fake_service(200, r#"{"language_code":"eng","text":"Hello there."}"#).await;
        let (provider, result) = provider_after(&endpoint, &speech_like(), None).await;
        assert_eq!(result.unwrap().as_deref(), Some("Hello there."));
        assert_eq!(provider.detected_language().as_deref(), Some("en"));
        assert!(!seen.last_request().contains("language_code"));
    }

    #[tokio::test]
    async fn empty_text_is_no_speech() {
        let (endpoint, _) = fake_service(200, r#"{"language_code":"eng","text":""}"#).await;
        let (_, result) = provider_after(&endpoint, &speech_like(), None).await;
        assert!(matches!(result, Ok(None)));
    }

    #[tokio::test]
    async fn a_short_invented_phrase_is_dropped_by_the_hallucination_guard() {
        let mut audio = vec![0u8; 16_000];
        audio.extend(pcm_tone(0.3, 0.4, 16_000));
        audio.extend(vec![0u8; 16_000]);
        let (endpoint, seen) = fake_service(200, r#"{"text":"Thank you."}"#).await;
        let (_, result) = provider_after(&endpoint, &audio, None).await;
        assert!(matches!(result, Ok(None)));
        assert_eq!(seen.hits(), 1);
    }

    #[tokio::test]
    async fn a_wrong_key_is_an_auth_error_without_retries() {
        let (endpoint, seen) = fake_service(
            401,
            r#"{"detail":{"status":"invalid_api_key","message":"Invalid API key"}}"#,
        )
        .await;
        let (_, result) = provider_after(&endpoint, &speech_like(), None).await;
        assert!(matches!(result, Err(AppError::Auth(_))));
        assert_eq!(seen.hits(), 1);
    }

    #[tokio::test]
    async fn a_rate_limit_is_a_quota_error() {
        let (endpoint, seen) = fake_service(
            429,
            r#"{"detail":{"status":"too_many_concurrent_requests","message":"Too many"}}"#,
        )
        .await;
        let (_, result) = provider_after(&endpoint, &speech_like(), None).await;
        assert!(matches!(result, Err(AppError::Quota(_))));
        assert_eq!(seen.hits(), 1);
    }

    #[tokio::test]
    async fn the_connection_test_passes_on_success_and_shows_the_message_on_failure() {
        let client = reqwest::Client::new();
        let (endpoint, _) = fake_service(200, r#"{"text":""}"#).await;
        assert!(check_connection(&client, &config(&endpoint), "k")
            .await
            .is_ok());
        assert!(check_connection(&client, &config(&endpoint), " ")
            .await
            .is_err());

        let (endpoint, _) = fake_service(
            401,
            r#"{"detail":{"status":"invalid_api_key","message":"Invalid API key"}}"#,
        )
        .await;
        let error = check_connection(&client, &config(&endpoint), "k")
            .await
            .unwrap_err();
        assert!(
            error.contains("401") && error.contains("Invalid API key"),
            "{error}"
        );
    }

    #[tokio::test]
    async fn failed_upload_still_marks_the_probe() {
        let mut provider = ElevenLabsProvider::new(config("http://127.0.0.1:9/x"), None);
        let probe = crate::timing::UploadProbe::default();
        provider.set_upload_probe(probe.clone());
        provider.connect(&stt_config(None)).await.unwrap();
        provider.send_audio(&speech_like()).await.unwrap();

        assert!(provider.disconnect().await.is_err());
        let marks = probe.snapshot();
        assert!(marks.started_at.is_some());
        assert!(marks.finished_at.is_some());
    }
}
