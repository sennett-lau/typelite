pub mod builtin;
pub mod capabilities;
pub mod config;
pub mod hallucination;
pub mod hardware;
pub mod models;
pub mod qwen_cloud;
pub mod silence;
pub mod transcript;
pub mod whisper_compat;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use crate::error::AppError;

use whisper_compat::{WhisperCompatConfig, WhisperCompatProvider};

/// Per-recording settings passed to the speech provider.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SttConfig {
    /// Optional API key. Empty means no `Authorization` header is sent.
    pub api_key: String,
    /// Language hint (ISO code). `None` lets the server auto-detect.
    pub language: Option<String>,
    pub sample_rate: u32,
}

impl Default for SttConfig {
    fn default() -> Self {
        Self {
            api_key: String::new(),
            language: None,
            sample_rate: 16000,
        }
    }
}

#[derive(Debug, Clone)]
pub enum TranscriptEvent {
    Partial { text: String },
    Final { text: String, confidence: f32 },
    SpeechStarted,
    SpeechEnded,
    Error { message: String },
}

#[async_trait]
pub trait SttProvider: Send + Sync {
    async fn connect(&mut self, config: &SttConfig) -> Result<(), AppError>;
    async fn send_audio(&mut self, chunk: &[u8]) -> Result<(), AppError>;
    async fn recv_transcript(&mut self) -> Result<Option<TranscriptEvent>, AppError>;
    /// Disconnect and optionally return a final transcript (for file-based providers).
    async fn disconnect(&mut self) -> Result<Option<String>, AppError>;
    fn name(&self) -> &str;
    /// Plan `speed-board`: gives the provider a slot to note when its upload starts and ends, for
    /// the Speed board. Providers that do not upload a file can ignore it.
    fn set_upload_probe(&mut self, _probe: crate::timing::UploadProbe) {}
    /// Plan `language-prompt-library`: the language code the last `disconnect` recognised
    /// (`en`, `zh`, `yue`), for the polish router. `None` when the provider does not say.
    fn detected_language(&self) -> Option<String> {
        None
    }
}

/// A language as a speech service reports it, as a lower-case code: `en`, `zh`, `yue`.
/// Whisper's full names (`english`, `cantonese`, as OpenAI's `verbose_json` returns them) are
/// turned into their codes with whisper.cpp's own table. Anything else gives `None`.
pub fn normalize_detected_language(raw: &str) -> Option<String> {
    let value = raw.replace('\0', "").trim().to_ascii_lowercase();
    let primary = value.split(['-', '_']).next().unwrap_or_default();
    if (2..=3).contains(&primary.len()) && primary.chars().all(|c| c.is_ascii_lowercase()) {
        return Some(primary.to_string());
    }
    if value.is_empty()
        || value.len() > 40
        || !value.chars().all(|c| c.is_ascii_lowercase() || c == ' ')
    {
        return None;
    }
    let id = whisper_rs::get_lang_id(&value)?;
    whisper_rs::get_lang_str(id).map(str::to_string)
}

/// Creates the provider for a speech preset: whisper.cpp in the app for built-in presets
/// (plan `quick-speech-setup`), Qwen Cloud's own API for `qwen_cloud` presets (plan
/// `qwen-cloud-speech`), otherwise an OpenAI-compatible transcription upload.
pub fn provider_for_preset(
    preset: &crate::storage::SpeechPreset,
    client: Option<reqwest::Client>,
) -> Result<Box<dyn SttProvider>, String> {
    if preset.is_builtin_whisper() {
        return Ok(Box::new(builtin::BuiltinProvider::new(
            config::build_builtin_config(preset)?,
        )));
    }
    if preset.is_qwen_cloud() {
        return Ok(Box::new(qwen_cloud::QwenCloudProvider::new(
            config::build_qwen_cloud_config(preset)?,
            client,
        )));
    }
    Ok(create_provider(
        config::build_whisper_config(preset)?,
        client,
    ))
}

/// Creates an OpenAI-compatible transcription upload provider.
pub fn create_provider(
    config: WhisperCompatConfig,
    client: Option<reqwest::Client>,
) -> Box<dyn SttProvider> {
    match client {
        Some(client) => Box::new(WhisperCompatProvider::with_client(config, client)),
        None => Box::new(WhisperCompatProvider::new(config)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detected_languages_become_codes() {
        assert_eq!(normalize_detected_language("en").as_deref(), Some("en"));
        assert_eq!(normalize_detected_language(" ZH ").as_deref(), Some("zh"));
        assert_eq!(normalize_detected_language("yue").as_deref(), Some("yue"));
        assert_eq!(normalize_detected_language("zh-HK").as_deref(), Some("zh"));
        assert_eq!(
            normalize_detected_language("english").as_deref(),
            Some("en")
        );
        assert_eq!(
            normalize_detected_language("Cantonese").as_deref(),
            Some("yue")
        );
        assert_eq!(
            normalize_detected_language("chinese").as_deref(),
            Some("zh")
        );
        assert_eq!(normalize_detected_language(""), None);
        assert_eq!(normalize_detected_language("klingonese"), None);
        assert_eq!(normalize_detected_language("x<script>"), None);
    }

    #[test]
    fn creates_provider_named_after_the_preset() {
        let preset = crate::storage::SpeechPreset {
            id: "p1".to_string(),
            name: "My whisper".to_string(),
            base_url: "http://localhost:8000/v1".to_string(),
            model: "large-v3-turbo".to_string(),
            language: "auto".to_string(),
            ..Default::default()
        };
        let cfg = config::build_whisper_config(&preset).unwrap();

        let provider = create_provider(cfg, None);
        assert_eq!(provider.name(), "My whisper");
        assert_eq!(
            provider_for_preset(&preset, None).unwrap().name(),
            "My whisper"
        );
    }

    #[test]
    fn qwen_cloud_presets_get_their_own_provider() {
        let preset = crate::storage::SpeechPreset::qwen_cloud(
            "qwen",
            "Qwen Cloud",
            qwen_cloud::DEFAULT_BASE_URL,
            qwen_cloud::DEFAULT_MODEL,
        );
        let provider = provider_for_preset(&preset, None).unwrap();
        assert_eq!(provider.name(), "Qwen Cloud");
        assert!(config::build_whisper_config(&preset).is_err());
    }

    #[test]
    fn built_in_presets_get_the_in_process_provider() {
        let preset = crate::storage::SpeechPreset::builtin_whisper("small", "ggml-small-q5_1.bin");
        let provider = provider_for_preset(&preset, None).unwrap();
        assert_eq!(provider.name(), "Built-in (on-device)");

        let mut no_file = preset.clone();
        no_file.model_file.clear();
        assert!(provider_for_preset(&no_file, None).is_err());
    }
}
