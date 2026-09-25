pub mod builtin;
pub mod capabilities;
pub mod config;
pub mod hallucination;
pub mod hardware;
pub mod models;
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
    /// Plan 0008: gives the provider a slot to note when its upload starts and ends, for the
    /// Speed board. Providers that do not upload a file can ignore it.
    fn set_upload_probe(&mut self, _probe: crate::timing::UploadProbe) {}
}

/// Creates the provider for a speech preset: whisper.cpp in the app for built-in presets
/// (plan 0012), otherwise an OpenAI-compatible transcription upload.
pub fn provider_for_preset(
    preset: &crate::storage::SpeechPreset,
    client: Option<reqwest::Client>,
) -> Result<Box<dyn SttProvider>, String> {
    if preset.is_builtin_whisper() {
        return Ok(Box::new(builtin::BuiltinProvider::new(
            config::build_builtin_config(preset)?,
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
    fn built_in_presets_get_the_in_process_provider() {
        let preset = crate::storage::SpeechPreset::builtin_whisper("small", "ggml-small-q5_1.bin");
        let provider = provider_for_preset(&preset, None).unwrap();
        assert_eq!(provider.name(), "Built-in (this Mac)");

        let mut no_file = preset.clone();
        no_file.model_file.clear();
        assert!(provider_for_preset(&no_file, None).is_err());
    }
}
