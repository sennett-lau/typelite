use async_trait::async_trait;

use crate::error::AppError;

use super::silence::{accept_transcript, log_decision, NoSpeechGuard, VoiceActivity};
use super::transcript::normalize_transcript;
use super::{SttConfig, SttProvider, TranscriptEvent};

/// Configuration for a Whisper-compatible HTTP file-upload STT provider.
#[derive(Debug)]
pub struct WhisperCompatConfig {
    /// Shown in logs; the speech preset name.
    pub provider_name: String,
    /// Full `.../audio/transcriptions` URL.
    pub endpoint: String,
    pub model: String,
}

/// Plan `language-prompt-library`: endpoints that refused `response_format=verbose_json` in this
/// session. They get plain JSON (no detected language) from then on.
static NO_VERBOSE_JSON: std::sync::Mutex<Vec<String>> = std::sync::Mutex::new(Vec::new());

fn verbose_json_refused(endpoint: &str) -> bool {
    NO_VERBOSE_JSON
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .iter()
        .any(|known| known == endpoint)
}

fn remember_verbose_json_refused(endpoint: &str) {
    let mut refused = NO_VERBOSE_JSON
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    if !refused.iter().any(|known| known == endpoint) {
        refused.push(endpoint.to_string());
    }
}

/// A transcription answer: the text, and the language when the server reported one.
#[derive(Debug, Clone, PartialEq)]
struct Answer {
    text: Option<String>,
    language: Option<String>,
}

/// Max audio buffer: ~24 MB PCM ≈ 12.5 min at 16kHz 16-bit mono.
/// Keeps the resulting WAV under 25 MB, the usual upload limit of OpenAI-compatible servers.
const MAX_AUDIO_BYTES: usize = 24 * 1024 * 1024;

/// Provider for any OpenAI Whisper-compatible transcription API
/// (whisper.cpp `whisper-server`, Speaches, and similar servers).
pub struct WhisperCompatProvider {
    provider_config: WhisperCompatConfig,
    stt_config: Option<SttConfig>,
    audio_buffer: Vec<u8>,
    client: reqwest::Client,
    upload_probe: Option<crate::timing::UploadProbe>,
    detected_language: Option<String>,
}

impl WhisperCompatProvider {
    pub fn new(provider_config: WhisperCompatConfig) -> Self {
        Self::with_client(provider_config, reqwest::Client::new())
    }

    pub fn with_client(provider_config: WhisperCompatConfig, client: reqwest::Client) -> Self {
        Self {
            provider_config,
            stt_config: None,
            audio_buffer: Vec::new(),
            client,
            upload_probe: None,
            detected_language: None,
        }
    }

    /// Build a WAV file from raw PCM 16-bit mono audio. Public so test helpers can reuse it.
    pub fn build_wav(pcm: &[u8], sample_rate: u32) -> Vec<u8> {
        let data_len = pcm.len() as u32;
        let channels: u16 = 1;
        let bits_per_sample: u16 = 16;
        let byte_rate = sample_rate * (channels as u32) * (bits_per_sample as u32) / 8;
        let block_align = channels * bits_per_sample / 8;
        let file_size = 36 + data_len;

        let mut wav = Vec::with_capacity(44 + pcm.len());
        wav.extend_from_slice(b"RIFF");
        wav.extend_from_slice(&file_size.to_le_bytes());
        wav.extend_from_slice(b"WAVE");
        wav.extend_from_slice(b"fmt ");
        wav.extend_from_slice(&16u32.to_le_bytes());
        wav.extend_from_slice(&1u16.to_le_bytes()); // PCM
        wav.extend_from_slice(&channels.to_le_bytes());
        wav.extend_from_slice(&sample_rate.to_le_bytes());
        wav.extend_from_slice(&byte_rate.to_le_bytes());
        wav.extend_from_slice(&block_align.to_le_bytes());
        wav.extend_from_slice(&bits_per_sample.to_le_bytes());
        wav.extend_from_slice(b"data");
        wav.extend_from_slice(&data_len.to_le_bytes());
        wav.extend_from_slice(pcm);
        wav
    }
}

#[async_trait]
impl SttProvider for WhisperCompatProvider {
    async fn connect(&mut self, config: &SttConfig) -> Result<(), AppError> {
        self.stt_config = Some(config.clone());
        self.audio_buffer.clear();
        tracing::info!(
            "{} provider ready (buffering mode)",
            self.provider_config.provider_name
        );
        Ok(())
    }

    async fn send_audio(&mut self, chunk: &[u8]) -> Result<(), AppError> {
        if self.audio_buffer.len() + chunk.len() > MAX_AUDIO_BYTES {
            return Err(AppError::Config(format!(
                "{}: audio exceeds maximum length (~12 min)",
                self.provider_config.provider_name
            )));
        }
        self.audio_buffer.extend_from_slice(chunk);
        Ok(())
    }

    async fn recv_transcript(&mut self) -> Result<Option<TranscriptEvent>, AppError> {
        // File-based providers transcribe in disconnect(); keep this future
        // pending so the pipeline select loop does not busy-spin while recording.
        std::future::pending().await
    }

    async fn disconnect(&mut self) -> Result<Option<String>, AppError> {
        self.detected_language = None;
        let config = match &self.stt_config {
            Some(c) => c.clone(),
            None => return Ok(None),
        };

        if self.audio_buffer.is_empty() {
            tracing::info!(
                "{}: no audio buffered, skipping",
                self.provider_config.provider_name
            );
            return Ok(None);
        }

        if let Some(probe) = &self.upload_probe {
            probe.note_audio(self.audio_buffer.len(), config.sample_rate);
        }
        let activity = VoiceActivity::measure(&self.audio_buffer, config.sample_rate);
        if !activity.has_speech() {
            log_decision(
                &self.provider_config.provider_name,
                &activity,
                Some(NoSpeechGuard::VoiceCheck),
            );
            self.audio_buffer.clear();
            return Ok(None);
        }

        let audio_len_secs = self.audio_buffer.len() as f64 / (config.sample_rate as f64 * 2.0);
        let wav_data = Self::build_wav(&self.audio_buffer, config.sample_rate);
        if let Some(probe) = &self.upload_probe {
            probe.mark_started(wav_data.len());
        }
        self.audio_buffer.clear();
        tracing::info!(
            "{}: sending {:.1}s of audio for transcription",
            self.provider_config.provider_name,
            audio_len_secs
        );

        // Plan `language-prompt-library`: with auto-detect, ask for `verbose_json`, which
        // carries the detected language; a server that refuses it gets plain JSON again.
        let verbose =
            config.language.is_none() && !verbose_json_refused(&self.provider_config.endpoint);
        let retry_copy = verbose.then(|| wav_data.clone());
        let mut result = self.upload_wav(&config, wav_data, verbose).await;
        if let Some(wav_data) = retry_copy {
            if let Err(AppError::Api { status, .. }) = &result {
                if matches!(status, 400 | 415 | 422) {
                    tracing::info!(
                        "{}: the server refused verbose_json (HTTP {status}); using plain JSON",
                        self.provider_config.provider_name
                    );
                    remember_verbose_json_refused(&self.provider_config.endpoint);
                    result = self.upload_wav(&config, wav_data, false).await;
                }
            }
        }
        if let Some(probe) = &self.upload_probe {
            probe.mark_finished();
        }
        let answer = result?;
        self.detected_language = answer.language.clone();
        if let Some(language) = &answer.language {
            tracing::info!(
                "{}: detected language {language}",
                self.provider_config.provider_name
            );
        }
        Ok(accept_transcript(
            &self.provider_config.provider_name,
            &activity,
            answer.text,
        ))
    }

    fn name(&self) -> &str {
        &self.provider_config.provider_name
    }

    fn set_upload_probe(&mut self, probe: crate::timing::UploadProbe) {
        self.upload_probe = Some(probe);
    }

    fn detected_language(&self) -> Option<String> {
        self.detected_language.clone()
    }
}

impl WhisperCompatProvider {
    /// Sends the WAV file, retrying server errors and timeouts up to two times. `verbose` asks
    /// for `verbose_json`, whose `language` field says what the server heard.
    async fn upload_wav(
        &self,
        config: &SttConfig,
        wav_data: Vec<u8>,
        verbose: bool,
    ) -> Result<Answer, AppError> {
        let mut attempt = 0u32;
        loop {
            let file_part = reqwest::multipart::Part::bytes(wav_data.clone())
                .file_name("audio.wav")
                .mime_str("audio/wav")
                .map_err(|e| AppError::Config(e.to_string()))?;

            let mut form = reqwest::multipart::Form::new()
                .text("model", self.provider_config.model.to_string())
                .part("file", file_part);

            // Language hint. `None` means auto-detect, so the field is left out.
            if let Some(ref lang) = config.language {
                form = form.text("language", lang.clone());
            }
            if verbose {
                form = form.text("response_format", "verbose_json");
            }

            let mut request = self
                .client
                .post(&self.provider_config.endpoint)
                .multipart(form)
                .timeout(std::time::Duration::from_secs(60));

            if !config.api_key.trim().is_empty() {
                request = request.header("Authorization", format!("Bearer {}", config.api_key));
            }

            let request_started = std::time::Instant::now();
            let resp_result = request.send().await;
            tracing::info!(
                "{}: POST {} answered after {} ms ({})",
                self.provider_config.provider_name,
                self.provider_config.endpoint,
                request_started.elapsed().as_millis(),
                match &resp_result {
                    Ok(resp) => format!("HTTP {}", resp.status().as_u16()),
                    Err(error) => format!("error: {error}"),
                }
            );

            match resp_result {
                Ok(resp) => {
                    let status = resp.status();
                    let body = resp.text().await.unwrap_or_default();

                    if status.is_success() {
                        let v: serde_json::Value = serde_json::from_str(&body)
                            .map_err(|e| AppError::Config(e.to_string()))?;
                        let text = normalize_transcript(v["text"].as_str().unwrap_or(""));
                        let language = v["language"]
                            .as_str()
                            .and_then(super::normalize_detected_language);

                        tracing::info!(
                            "{} transcription: {} chars",
                            self.provider_config.provider_name,
                            text.len()
                        );

                        return Ok(Answer {
                            text: (!text.is_empty()).then_some(text),
                            language,
                        });
                    } else if status.as_u16() >= 500 && attempt < 2 {
                        let truncate_at = body
                            .char_indices()
                            .take_while(|&(i, _)| i < 200)
                            .last()
                            .map(|(i, c)| i + c.len_utf8())
                            .unwrap_or(body.len());
                        tracing::warn!(
                            "{} server error {} (attempt {}/3): {}",
                            self.provider_config.provider_name,
                            status,
                            attempt + 1,
                            &body[..truncate_at]
                        );
                        attempt += 1;
                        tokio::time::sleep(std::time::Duration::from_millis(
                            1000 * 2u64.pow(attempt - 1),
                        ))
                        .await;
                        continue;
                    } else {
                        // Truncate at a valid UTF-8 char boundary to avoid panic on multi-byte chars
                        let truncate_at = body
                            .char_indices()
                            .take_while(|&(i, _)| i < 200)
                            .last()
                            .map(|(i, c)| i + c.len_utf8())
                            .unwrap_or(body.len());
                        let sanitized = &body[..truncate_at];
                        tracing::error!(
                            "{} HTTP {}: {}",
                            self.provider_config.provider_name,
                            status,
                            sanitized
                        );
                        return Err(AppError::Api {
                            status: status.as_u16(),
                            body: sanitized.to_string(),
                        });
                    }
                }
                Err(e) if e.is_timeout() && attempt < 2 => {
                    tracing::warn!(
                        "{} timeout (attempt {}/3)",
                        self.provider_config.provider_name,
                        attempt + 1
                    );
                    attempt += 1;
                    tokio::time::sleep(std::time::Duration::from_millis(
                        1000 * 2u64.pow(attempt - 1),
                    ))
                    .await;
                    continue;
                }
                Err(e) => return Err(e.into()),
            }
        }
    }
}

#[cfg(test)]
mod tests {

    use super::super::silence::pcm_tone;
    use super::*;

    #[tokio::test]
    async fn connect_allows_empty_api_key() {
        let mut provider = WhisperCompatProvider::new(WhisperCompatConfig {
            provider_name: "local-whisper".to_string(),
            endpoint: "http://localhost:8000/v1/audio/transcriptions".to_string(),
            model: "test-model".to_string(),
        });

        let result = provider
            .connect(&SttConfig {
                api_key: String::new(),
                language: None,
                sample_rate: 16000,
            })
            .await;

        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn disconnect_marks_the_upload_on_the_probe_even_when_it_fails() {
        let mut provider = WhisperCompatProvider::new(WhisperCompatConfig {
            provider_name: "test-whisper".to_string(),
            // Port 9 on localhost refuses the connection at once, so no retry wait.
            endpoint: "http://127.0.0.1:9/v1/audio/transcriptions".to_string(),
            model: "test-model".to_string(),
        });
        let probe = crate::timing::UploadProbe::default();
        provider.set_upload_probe(probe.clone());
        provider.connect(&SttConfig::default()).await.unwrap();
        // A tone between two quiet stretches passes the voice check.
        let mut audio = vec![0u8; 16_000];
        audio.extend(pcm_tone(0.3, 1.0, 16_000));
        audio.extend(vec![0u8; 16_000]);
        provider.send_audio(&audio).await.unwrap();

        assert!(provider.disconnect().await.is_err());

        let marks = probe.snapshot();
        assert!(marks.started_at.is_some());
        assert!(marks.finished_at.is_some());
        assert_eq!(marks.pcm_bytes, 64_000);
        assert_eq!(marks.wav_bytes, 64_044);
        assert!((marks.recording_secs() - 2.0).abs() < f64::EPSILON);
    }

    #[tokio::test]
    async fn disconnect_without_audio_leaves_the_probe_empty() {
        let mut provider = WhisperCompatProvider::new(WhisperCompatConfig {
            provider_name: "test-whisper".to_string(),
            endpoint: "http://127.0.0.1:9/v1/audio/transcriptions".to_string(),
            model: "test-model".to_string(),
        });
        let probe = crate::timing::UploadProbe::default();
        provider.set_upload_probe(probe.clone());
        provider.connect(&SttConfig::default()).await.unwrap();

        assert!(matches!(provider.disconnect().await, Ok(None)));
        assert_eq!(probe.snapshot(), crate::timing::UploadMarks::default());
    }

    #[tokio::test]
    async fn silent_recording_notes_its_length_but_no_upload() {
        let mut provider = WhisperCompatProvider::new(WhisperCompatConfig {
            provider_name: "test-whisper".to_string(),
            endpoint: "http://127.0.0.1:9/v1/audio/transcriptions".to_string(),
            model: "test-model".to_string(),
        });
        let probe = crate::timing::UploadProbe::default();
        provider.set_upload_probe(probe.clone());
        provider.connect(&SttConfig::default()).await.unwrap();
        provider.send_audio(&[0u8; 64_000]).await.unwrap();

        assert!(matches!(provider.disconnect().await, Ok(None)));
        let marks = probe.snapshot();
        assert!(marks.started_at.is_none());
        assert!(marks.finished_at.is_none());
        assert_eq!(marks.wav_bytes, 0);
        assert!((marks.recording_secs() - 2.0).abs() < f64::EPSILON);
    }

    /// A transcription server that answers `verbose_json` requests with `verbose` and others
    /// with `plain` (status, body). Returns the endpoint and how many requests asked for it.
    async fn language_server(
        verbose: (u16, &'static str),
        plain: (u16, &'static str),
    ) -> (String, std::sync::Arc<std::sync::atomic::AtomicUsize>) {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!(
            "http://{}/v1/audio/transcriptions",
            listener.local_addr().unwrap()
        );
        let verbose_hits = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let counter = verbose_hits.clone();
        tokio::spawn(async move {
            while let Ok((mut socket, _)) = listener.accept().await {
                let counter = counter.clone();
                tokio::spawn(async move {
                    let mut request = Vec::new();
                    let mut buf = [0u8; 65536];
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
                    let asks_verbose = request.windows(12).any(|w| w == b"verbose_json");
                    let (status, body) = if asks_verbose {
                        counter.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                        verbose
                    } else {
                        plain
                    };
                    let reply = format!(
                        "HTTP/1.1 {status} X\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}",
                        body.len()
                    );
                    let _ = socket.write_all(reply.as_bytes()).await;
                });
            }
        });
        (url, verbose_hits)
    }

    async fn transcribe_with(endpoint: &str, language: Option<&str>) -> WhisperCompatProvider {
        let mut provider = WhisperCompatProvider::new(WhisperCompatConfig {
            provider_name: "test-whisper".to_string(),
            endpoint: endpoint.to_string(),
            model: "test-model".to_string(),
        });
        provider
            .connect(&SttConfig {
                language: language.map(str::to_string),
                ..SttConfig::default()
            })
            .await
            .unwrap();
        let mut audio = vec![0u8; 16_000];
        audio.extend(pcm_tone(0.3, 1.0, 16_000));
        audio.extend(vec![0u8; 16_000]);
        provider.send_audio(&audio).await.unwrap();
        let text = provider.disconnect().await.unwrap();
        assert_eq!(text.as_deref(), Some("Hello there"));
        provider
    }

    /// Plan `language-prompt-library`: with auto-detect the provider asks for verbose_json and
    /// passes the language on; a full name becomes its code.
    #[tokio::test]
    async fn verbose_json_reports_the_detected_language() {
        let (url, verbose_hits) = language_server(
            (
                200,
                r#"{"text":"Hello there","language":"english","segments":[]}"#,
            ),
            (200, r#"{"text":"Hello there"}"#),
        )
        .await;
        let provider = transcribe_with(&url, None).await;
        assert_eq!(provider.detected_language().as_deref(), Some("en"));
        assert_eq!(verbose_hits.load(std::sync::atomic::Ordering::SeqCst), 1);

        // A fixed language needs no detection: plain JSON, no detected language.
        let provider = transcribe_with(&url, Some("en")).await;
        assert_eq!(provider.detected_language(), None);
        assert_eq!(verbose_hits.load(std::sync::atomic::Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn a_server_that_refuses_verbose_json_gets_plain_json_from_then_on() {
        let (url, verbose_hits) = language_server(
            (400, r#"{"error":"response_format not supported"}"#),
            (200, r#"{"text":"Hello there"}"#),
        )
        .await;
        let provider = transcribe_with(&url, None).await;
        assert_eq!(provider.detected_language(), None);
        assert_eq!(verbose_hits.load(std::sync::atomic::Ordering::SeqCst), 1);
        // The next recording does not ask again.
        transcribe_with(&url, None).await;
        assert_eq!(verbose_hits.load(std::sync::atomic::Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn recv_transcript_waits_for_file_based_provider() {
        let mut provider = WhisperCompatProvider::new(WhisperCompatConfig {
            provider_name: "test-whisper".to_string(),
            endpoint: "https://example.test/transcriptions".to_string(),
            model: "test-model".to_string(),
        });

        let result = tokio::time::timeout(
            std::time::Duration::from_millis(20),
            provider.recv_transcript(),
        )
        .await;

        assert!(result.is_err());
    }
}
