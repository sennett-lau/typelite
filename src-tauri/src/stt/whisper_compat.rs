use async_trait::async_trait;

use crate::error::AppError;

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
}

impl WhisperCompatProvider {
    pub fn new(provider_config: WhisperCompatConfig) -> Self {
        Self {
            provider_config,
            stt_config: None,
            audio_buffer: Vec::new(),
            client: reqwest::Client::new(),
            upload_probe: None,
        }
    }

    pub fn with_client(provider_config: WhisperCompatConfig, client: reqwest::Client) -> Self {
        Self {
            provider_config,
            stt_config: None,
            audio_buffer: Vec::new(),
            client,
            upload_probe: None,
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
        let peak_db = peak_window_level_db(&self.audio_buffer, config.sample_rate);
        if peak_db < SILENCE_THRESHOLD_DB {
            tracing::info!(
                "{}: no speech detected (loudest 50 ms at {:.0} dBFS), skipping the request",
                self.provider_config.provider_name,
                peak_db
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

        let result = self.upload_wav(&config, wav_data).await;
        if let Some(probe) = &self.upload_probe {
            probe.mark_finished();
        }
        result
    }

    fn name(&self) -> &str {
        &self.provider_config.provider_name
    }

    fn set_upload_probe(&mut self, probe: crate::timing::UploadProbe) {
        self.upload_probe = Some(probe);
    }
}

impl WhisperCompatProvider {
    /// Sends the WAV file, retrying server errors and timeouts up to two times.
    async fn upload_wav(
        &self,
        config: &SttConfig,
        wav_data: Vec<u8>,
    ) -> Result<Option<String>, AppError> {
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

                        tracing::info!(
                            "{} transcription: {} chars",
                            self.provider_config.provider_name,
                            text.len()
                        );

                        return Ok(if text.is_empty() { None } else { Some(text) });
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

/// Whisper returns its transcript as segments separated by line breaks, which are pauses, not
/// paragraphs. Join them into one line so they are never pasted as random line breaks; the AI
/// polish step adds structure where it belongs.
pub fn normalize_transcript(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for piece in text.split_whitespace() {
        let joins_without_space = match (out.chars().last(), piece.chars().next()) {
            (Some(prev), Some(next)) => is_cjk(prev) && is_cjk(next),
            _ => true,
        };
        if !out.is_empty() && !joins_without_space {
            out.push(' ');
        }
        out.push_str(piece);
    }
    out
}

/// Chinese, Japanese and Korean characters and their punctuation, which are written without
/// spaces between them.
fn is_cjk(c: char) -> bool {
    matches!(c as u32,
        0x3000..=0x303F     // CJK punctuation
        | 0x3040..=0x30FF   // Hiragana, Katakana
        | 0x3400..=0x4DBF   // CJK Extension A
        | 0x4E00..=0x9FFF   // CJK Unified Ideographs
        | 0xAC00..=0xD7AF   // Hangul
        | 0xF900..=0xFAFF   // CJK Compatibility Ideographs
        | 0xFF00..=0xFFEF) // Full-width forms
}

/// Recordings whose loudest 50 ms window stays below this level are treated as silence.
/// Whisper tends to invent text ("Thank you.") for silent audio, so we never send it.
const SILENCE_THRESHOLD_DB: f64 = -45.0;

/// Loudest RMS level of any 50 ms window of 16-bit little-endian PCM, in dBFS.
fn peak_window_level_db(pcm: &[u8], sample_rate: u32) -> f64 {
    let window = (sample_rate as usize / 20).max(1);
    let samples: Vec<f64> = pcm
        .chunks_exact(2)
        .map(|b| i16::from_le_bytes([b[0], b[1]]) as f64 / 32768.0)
        .collect();
    let peak_rms = samples
        .chunks(window)
        .map(|w| (w.iter().map(|s| s * s).sum::<f64>() / w.len() as f64).sqrt())
        .fold(0.0_f64, f64::max);
    20.0 * peak_rms.max(1e-9).log10()
}

#[cfg(test)]
mod tests {

    #[test]
    fn transcript_segments_are_joined_into_one_line() {
        assert_eq!(
            normalize_transcript(" Um, so let's meet on Monday.\n No wait, Tuesday at 3pm.\n"),
            "Um, so let's meet on Monday. No wait, Tuesday at 3pm."
        );
        assert_eq!(
            normalize_transcript("我们明天\n下午三点开会。"),
            "我们明天下午三点开会。"
        );
        assert_eq!(
            normalize_transcript("开会 at 3pm\n好的"),
            "开会 at 3pm 好的"
        );
    }

    fn pcm_tone(amplitude: f64, seconds: f64, sample_rate: u32) -> Vec<u8> {
        (0..(seconds * sample_rate as f64) as usize)
            .flat_map(|n| {
                let v = amplitude
                    * (n as f64 * 440.0 * std::f64::consts::TAU / sample_rate as f64).sin();
                ((v * 32767.0) as i16).to_le_bytes()
            })
            .collect()
    }

    #[test]
    fn silence_is_below_the_speech_threshold() {
        let silence = vec![0u8; 32_000];
        assert!(peak_window_level_db(&silence, 16_000) < SILENCE_THRESHOLD_DB);
        let room_hiss = pcm_tone(0.002, 1.0, 16_000);
        assert!(peak_window_level_db(&room_hiss, 16_000) < SILENCE_THRESHOLD_DB);
    }

    #[test]
    fn quiet_speech_is_above_the_speech_threshold() {
        let quiet = pcm_tone(0.03, 1.0, 16_000);
        assert!(peak_window_level_db(&quiet, 16_000) > SILENCE_THRESHOLD_DB);
    }

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
        provider
            .send_audio(&pcm_tone(0.3, 1.0, 16_000))
            .await
            .unwrap();

        assert!(provider.disconnect().await.is_err());

        let marks = probe.snapshot();
        assert!(marks.started_at.is_some());
        assert!(marks.finished_at.is_some());
        assert_eq!(marks.pcm_bytes, 32_000);
        assert_eq!(marks.wav_bytes, 32_044);
        assert!((marks.recording_secs() - 1.0).abs() < f64::EPSILON);
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
