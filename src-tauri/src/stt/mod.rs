pub mod capabilities;
pub mod config;
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

/// Creates the one speech provider type: an OpenAI-compatible transcription upload.
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
            builtin: false,
            verified_at: None,
        };
        let cfg = config::build_whisper_config(&preset).unwrap();

        let provider = create_provider(cfg, None);
        assert_eq!(provider.name(), "My whisper");
    }
}
