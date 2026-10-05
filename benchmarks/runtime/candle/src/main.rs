//! Pure-Rust Whisper worker (candle) for the runtime A/B benchmark (plan `rust-inference`).
//!
//! Speaks the same JSON-lines protocol as `src-tauri/examples/benchmark_speech.rs`, so
//! `benchmarks/runtime/cpp_speech_ab.py` can compare it with whisper.cpp:
//!
//!     whisper <model dir>          # config.json, tokenizer.json, model.safetensors
//!     → {"ready": true, "load_ms": …}
//!     ← {"pcm": "<16 kHz mono PCM16 file>", "language": null}
//!     → {"elapsed_ms": …, "text": …, "language": …, "dropped_segments": …}
//!
//! Decoding mirrors the app's built-in speech: one 30 s window, auto language, no timestamps,
//! greedy, and the same no-speech filter (no-speech > 0.6 and average log-prob < −1.0).

use std::io::{self, BufRead, Write};
use std::path::Path;
use std::time::Instant;

use candle_core::{DType, Device, IndexOp, Tensor, D};
use candle_nn::VarBuilder;
use candle_transformers::models::whisper::{self as m, audio, Config};
use serde_json::{json, Value};
use tokenizers::Tokenizer;

type Result<T> = std::result::Result<T, Box<dyn std::error::Error + Send + Sync>>;

/// Same limits as `stt/builtin.rs`.
const NO_SPEECH_THRESHOLD: f32 = 0.6;
const LOGPROB_THRESHOLD: f32 = -1.0;
/// Shortest clip the app sends to whisper (1.1 s, padded with silence).
const MIN_SAMPLES: usize = 16_000 + 1_600;
/// Longest transcript for one window, as whisper's text context allows.
const MAX_TOKENS: usize = 224;

struct SpecialTokens {
    sot: u32,
    eot: u32,
    transcribe: u32,
    no_timestamps: u32,
    no_speech: u32,
    /// `<|en|>` … `<|yue|>`: the ids between `<|startoftranscript|>` and `<|translate|>`.
    languages: Vec<(u32, String)>,
}

impl SpecialTokens {
    fn new(tokenizer: &Tokenizer) -> Result<Self> {
        let id = |token: &str| {
            tokenizer
                .token_to_id(token)
                .ok_or_else(|| format!("tokenizer has no {token}"))
        };
        let sot = id(m::SOT_TOKEN)?;
        let translate = id(m::TRANSLATE_TOKEN)?;
        let no_speech = m::NO_SPEECH_TOKENS
            .iter()
            .find_map(|token| tokenizer.token_to_id(token))
            .ok_or("tokenizer has no no-speech token")?;
        let languages = (sot + 1..translate)
            .filter_map(|token| {
                let text = tokenizer.id_to_token(token)?;
                let code = text.strip_prefix("<|")?.strip_suffix("|>")?.to_string();
                Some((token, code))
            })
            .collect();
        Ok(Self {
            sot,
            eot: id(m::EOT_TOKEN)?,
            transcribe: id(m::TRANSCRIBE_TOKEN)?,
            no_timestamps: id(m::NO_TIMESTAMPS_TOKEN)?,
            no_speech,
            languages,
        })
    }
}

struct Engine {
    model: m::model::Whisper,
    tokenizer: Tokenizer,
    special: SpecialTokens,
    mel_filters: Vec<f32>,
    /// Added to the logits while decoding text: −∞ for every special token except end-of-text,
    /// and for the model's `suppress_tokens`.
    text_mask: Tensor,
    device: Device,
    dtype: DType,
}

struct Transcription {
    text: String,
    language: String,
    dropped_segments: u32,
}

impl Engine {
    fn load(dir: &Path) -> Result<Self> {
        let device = Device::new_metal(0)?;
        // candle's Whisper builds its attention mask in F32 (`whisper::DTYPE`), so the weights
        // must be F32 too; F16 fails with a dtype mismatch.
        let dtype = m::DTYPE;
        let config: Config = serde_json::from_slice(&std::fs::read(dir.join("config.json"))?)?;
        let tokenizer = Tokenizer::from_file(dir.join("tokenizer.json"))?;
        let special = SpecialTokens::new(&tokenizer)?;
        // SAFETY: the weights file is not modified while it is mapped.
        let vb = unsafe {
            VarBuilder::from_mmaped_safetensors(&[dir.join("model.safetensors")], dtype, &device)?
        };
        let model = m::model::Whisper::load(&vb, config.clone())?;
        let mel_filters = mel_filters(config.num_mel_bins);
        let text_mask = text_mask(&config, &special, &device)?;
        Ok(Self {
            model,
            tokenizer,
            special,
            mel_filters,
            text_mask,
            device,
            dtype,
        })
    }

    fn transcribe(&mut self, pcm: &[u8], language: Option<&str>) -> Result<Transcription> {
        let mut samples: Vec<f32> = pcm
            .chunks_exact(2)
            .map(|b| f32::from(i16::from_le_bytes([b[0], b[1]])) / 32768.0)
            .collect();
        samples.resize(samples.len().max(MIN_SAMPLES), 0.0);

        // One 30 s window, as whisper.cpp does by default.
        let n_mels = self.model.config.num_mel_bins;
        let mel = audio::pcm_to_mel(&self.model.config, &samples, &self.mel_filters);
        let frames = mel.len() / n_mels;
        let mel = Tensor::from_vec(mel, (1, n_mels, frames), &self.device)?
            .narrow(2, 0, m::N_FRAMES.min(frames))?
            .to_dtype(self.dtype)?;
        let audio_features = self.model.encoder.forward(&mel, true)?;

        let language_token = match language {
            Some(code) => self
                .special
                .languages
                .iter()
                .find(|(_, name)| name == code)
                .map(|(token, _)| *token)
                .ok_or_else(|| format!("unknown language {code}"))?,
            None => self.detect_language(&audio_features)?,
        };
        let language = self
            .special
            .languages
            .iter()
            .find(|(token, _)| *token == language_token)
            .map(|(_, name)| name.clone())
            .unwrap_or_default();

        let mut tokens = vec![
            self.special.sot,
            language_token,
            self.special.transcribe,
            self.special.no_timestamps,
        ];
        let prompt_len = tokens.len();
        let mut sum_logprob = 0.0f32;
        let mut no_speech_prob = 0.0f32;
        for step in 0..MAX_TOKENS {
            // candle's Whisper caches only the cross-attention keys, so each step feeds the
            // whole sequence; `flush` on the first step drops the previous clip's cache.
            let input = Tensor::new(tokens.as_slice(), &self.device)?.unsqueeze(0)?;
            let hidden = self
                .model
                .decoder
                .forward(&input, &audio_features, step == 0)?;
            if step == 0 {
                // The no-speech probability is read at the start-of-transcript position.
                let first = self.model.decoder.final_linear(&hidden.i((.., 0..1))?)?;
                let probs =
                    candle_nn::ops::softmax(&first.i((0, 0))?.to_dtype(DType::F32)?, D::Minus1)?;
                no_speech_prob = probs
                    .i(self.special.no_speech as usize)?
                    .to_scalar::<f32>()?;
            }
            let last = hidden.i((.., hidden.dim(1)? - 1..))?;
            let logits = self
                .model
                .decoder
                .final_linear(&last)?
                .i((0, 0))?
                .to_dtype(DType::F32)?
                .broadcast_add(&self.text_mask)?;
            let log_probs = candle_nn::ops::log_softmax(&logits, D::Minus1)?;
            let next = log_probs.argmax(D::Minus1)?.to_scalar::<u32>()?;
            sum_logprob += log_probs.i(next as usize)?.to_scalar::<f32>()?;
            tokens.push(next);
            if next == self.special.eot {
                break;
            }
        }

        let generated = tokens.len() - prompt_len;
        let avg_logprob = sum_logprob / generated.max(1) as f32;
        let not_speech = no_speech_prob > NO_SPEECH_THRESHOLD && avg_logprob < LOGPROB_THRESHOLD;
        let text = if not_speech {
            String::new()
        } else {
            let text_tokens: Vec<u32> = tokens[prompt_len..]
                .iter()
                .copied()
                .filter(|token| *token != self.special.eot)
                .collect();
            self.tokenizer
                .decode(&text_tokens, true)?
                .trim()
                .to_string()
        };
        Ok(Transcription {
            text,
            language,
            dropped_segments: u32::from(not_speech),
        })
    }

    /// The most likely language token after `<|startoftranscript|>`.
    fn detect_language(&mut self, audio_features: &Tensor) -> Result<u32> {
        let input = Tensor::new(&[self.special.sot], &self.device)?.unsqueeze(0)?;
        let hidden = self.model.decoder.forward(&input, audio_features, true)?;
        let logits = self
            .model
            .decoder
            .final_linear(&hidden)?
            .i((0, 0))?
            .to_dtype(DType::F32)?
            .to_vec1::<f32>()?;
        self.special
            .languages
            .iter()
            .max_by(|(a, _), (b, _)| logits[*a as usize].total_cmp(&logits[*b as usize]))
            .map(|(token, _)| *token)
            .ok_or_else(|| "no language tokens".into())
    }
}

/// −∞ for tokens text decoding must not produce: every special token except end-of-text
/// (timestamps included, as the app runs without them) and the model's `suppress_tokens`.
fn text_mask(config: &Config, special: &SpecialTokens, device: &Device) -> Result<Tensor> {
    let mask: Vec<f32> = (0..config.vocab_size as u32)
        .map(|token| {
            let banned = token > special.eot || config.suppress_tokens.contains(&token);
            if banned {
                f32::NEG_INFINITY
            } else {
                0.0
            }
        })
        .collect();
    Ok(Tensor::new(mask.as_slice(), device)?)
}

/// Slaney-style mel filterbank for whisper (16 kHz, 400-point FFT, 0–8 kHz), as row-major
/// `n_mels × 201`, the same construction as librosa's default that whisper's filters come from.
fn mel_filters(n_mels: usize) -> Vec<f32> {
    let n_freqs = m::N_FFT / 2 + 1;
    let sample_rate = m::SAMPLE_RATE as f64;
    let hz_to_mel = |hz: f64| {
        let (f_sp, min_log_hz) = (200.0 / 3.0, 1000.0);
        let min_log_mel = min_log_hz / f_sp;
        let log_step = (6.4f64).ln() / 27.0;
        if hz >= min_log_hz {
            min_log_mel + (hz / min_log_hz).ln() / log_step
        } else {
            hz / f_sp
        }
    };
    let mel_to_hz = |mel: f64| {
        let (f_sp, min_log_hz) = (200.0 / 3.0, 1000.0);
        let min_log_mel = min_log_hz / f_sp;
        let log_step = (6.4f64).ln() / 27.0;
        if mel >= min_log_mel {
            min_log_hz * (log_step * (mel - min_log_mel)).exp()
        } else {
            f_sp * mel
        }
    };
    let (mel_min, mel_max) = (hz_to_mel(0.0), hz_to_mel(sample_rate / 2.0));
    let edges: Vec<f64> = (0..n_mels + 2)
        .map(|i| mel_to_hz(mel_min + (mel_max - mel_min) * i as f64 / (n_mels + 1) as f64))
        .collect();
    let fft_freqs: Vec<f64> = (0..n_freqs)
        .map(|i| i as f64 * sample_rate / m::N_FFT as f64)
        .collect();
    let mut filters = vec![0.0f32; n_mels * n_freqs];
    for band in 0..n_mels {
        let (lower, center, upper) = (edges[band], edges[band + 1], edges[band + 2]);
        let norm = 2.0 / (upper - lower);
        for (bin, &freq) in fft_freqs.iter().enumerate() {
            let rising = (freq - lower) / (center - lower);
            let falling = (upper - freq) / (upper - center);
            let weight = rising.min(falling).max(0.0) * norm;
            filters[band * n_freqs + bin] = weight as f32;
        }
    }
    filters
}

fn main() -> Result<()> {
    let dir = std::env::args().nth(1).ok_or("expected the model folder")?;
    let started = Instant::now();
    let mut engine = Engine::load(Path::new(&dir))?;
    let mut out = io::stdout().lock();
    writeln!(
        out,
        "{}",
        json!({"ready": true, "load_ms": started.elapsed().as_secs_f64() * 1000.0})
    )?;
    out.flush()?;
    for line in io::stdin().lock().lines() {
        let request: Value = serde_json::from_str(&line?)?;
        let pcm = std::fs::read(request["pcm"].as_str().ok_or("expected a pcm path")?)?;
        let started = Instant::now();
        let result = engine.transcribe(&pcm, request["language"].as_str())?;
        writeln!(
            out,
            "{}",
            json!({
                "elapsed_ms": started.elapsed().as_secs_f64() * 1000.0,
                "text": result.text,
                "language": result.language,
                "dropped_segments": result.dropped_segments,
            })
        )?;
        out.flush()?;
    }
    Ok(())
}
