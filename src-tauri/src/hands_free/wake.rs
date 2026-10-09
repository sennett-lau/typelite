//! Plan `hands-free-mode` (wake-check.md): the wake check. Runs the whisper.cpp that Typelite
//! already ships on one short voiced segment with a small model, then matches the text against
//! the wake phrase (`matcher.rs`).
//!
//! The wake model has its own whisper context, separate from built-in speech's engine, so a
//! wake check never unloads the user's speech model and the two never wait on each other's
//! model loads. The text it produces is only compared, never logged or stored.

use std::path::Path;
use std::time::{Duration, Instant};

use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

use super::matcher::{Sensitivity, WakeMatch, WakePhrase};
use crate::stt::models::KnownModel;

/// The wake model: Whisper base, multilingual, 5-bit quantised (60 MB). Downloaded by the app
/// from the same official whisper.cpp repository as the speech models, and checked against
/// this SHA-256 (the file's `x-linked-etag` on Hugging Face). Chosen in the measurements
/// (measurements.md): tiny mishears "Sam" too often; base is still about 0.1 s per check.
pub const WAKE_MODEL: KnownModel = KnownModel {
    id: "wake-base",
    file_name: "ggml-base-q5_1.bin",
    size_bytes: 59_707_625,
    sha256: "422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898",
};

/// Encoder window for a wake check: 512 frames = 10.24 s, a third of the full 30 s window.
/// Measured (measurements.md): half the time of the full window with the same accuracy; 256
/// frames was no faster and misheard two more wake phrases.
pub const WAKE_AUDIO_CTX: i32 = 512;
/// The initial prompt: tells the decoder how the name is spelled. Only the name: with the whole
/// phrase as the prompt, Whisper treats a spoken "Hey Sam, what's ..." as a continuation of the
/// prompt and leaves "Hey Sam" out, and it turned "Hey Pam" into "Hey Sam" (measurements.md).
pub const WAKE_PROMPT: &str = "{name}.";
/// The decoder never needs more than a few words.
const WAKE_MAX_TOKENS: i32 = 12;
/// whisper.cpp skips input shorter than one second.
const MIN_SAMPLES: usize = 16_000 + 1_600;

/// How a wake check runs. The defaults are what the app uses; the benchmark varies them.
#[derive(Debug, Clone)]
pub struct WakeCheckOptions {
    pub audio_ctx: i32,
    /// Bias the decoder with the wake phrase as the initial prompt.
    pub use_prompt: bool,
    /// The prompt; `{name}` is replaced with the wake name ("Sam").
    pub prompt_template: String,
    pub threads: i32,
}

impl Default for WakeCheckOptions {
    fn default() -> Self {
        Self {
            audio_ctx: WAKE_AUDIO_CTX,
            use_prompt: true,
            prompt_template: WAKE_PROMPT.to_string(),
            threads: 4,
        }
    }
}

/// One wake check's result. `text` stays in memory; callers must not log it.
#[derive(Debug, Clone)]
pub struct WakeCheck {
    pub matched: Option<WakeMatch>,
    pub elapsed: Duration,
    pub text: String,
}

/// The loaded wake model.
pub struct WakeChecker {
    context: WhisperContext,
    state: whisper_rs::WhisperState,
    prompt_tokens: Vec<std::os::raw::c_int>,
    phrase: WakePhrase,
    /// The decode language: English for a Latin wake name ("嘿 Sam" still comes out as "Hey
    /// Sam"), automatic for a name in another script.
    language: Option<&'static str>,
    options: WakeCheckOptions,
}

impl WakeChecker {
    /// Loads the model (blocking, about 0.1 s for base). On macOS the GPU is used, as for
    /// built-in speech.
    pub fn load(model: &Path, wake_name: &str, options: WakeCheckOptions) -> Result<Self, String> {
        let mut params = WhisperContextParameters::default();
        params.use_gpu(cfg!(target_os = "macos"));
        params.flash_attn(true);
        let path = model
            .to_str()
            .ok_or_else(|| "the wake model path is not valid UTF-8".to_string())?;
        let context =
            WhisperContext::new_with_params(path, params).map_err(|error| error.to_string())?;
        let state = context.create_state().map_err(|error| error.to_string())?;
        let mut checker = Self {
            context,
            state,
            prompt_tokens: Vec::new(),
            phrase: WakePhrase::from_name(wake_name),
            language: None,
            options,
        };
        checker.set_wake_name(wake_name);
        Ok(checker)
    }

    /// Changes the wake name without reloading the model.
    pub fn set_wake_name(&mut self, wake_name: &str) {
        self.phrase = WakePhrase::from_name(wake_name);
        let spoken = self.phrase.spoken();
        self.language = spoken.is_ascii().then_some("en");
        // The prompt is passed as tokens: whisper-rs's text prompt leaks a C string per call.
        self.prompt_tokens = self
            .context
            .tokenize(
                &self
                    .options
                    .prompt_template
                    .replace("{name}", self.phrase.name()),
                32,
            )
            .map(|tokens| {
                tokens
                    .into_iter()
                    .map(|t| t as std::os::raw::c_int)
                    .collect()
            })
            .unwrap_or_default();
    }

    pub fn phrase(&self) -> &WakePhrase {
        &self.phrase
    }

    /// Transcribes one segment (16 kHz mono) and matches it (blocking).
    pub fn check(
        &mut self,
        samples: &[i16],
        sensitivity: Sensitivity,
    ) -> Result<WakeCheck, String> {
        let started = Instant::now();
        let mut audio: Vec<f32> = samples.iter().map(|&s| f32::from(s) / 32768.0).collect();
        if audio.len() < MIN_SAMPLES {
            audio.resize(MIN_SAMPLES, 0.0);
        }
        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
        params.set_n_threads(self.options.threads);
        params.set_language(self.language.or(Some("auto")));
        params.set_translate(false);
        params.set_no_context(true);
        params.set_single_segment(true);
        params.set_no_timestamps(true);
        params.set_max_tokens(WAKE_MAX_TOKENS);
        params.set_audio_ctx(self.options.audio_ctx);
        params.set_temperature_inc(0.0);
        params.set_suppress_blank(true);
        params.set_print_special(false);
        params.set_print_progress(false);
        params.set_print_realtime(false);
        params.set_print_timestamps(false);
        if self.options.use_prompt && !self.prompt_tokens.is_empty() {
            params.set_tokens(&self.prompt_tokens);
        }
        self.state
            .full(params, &audio)
            .map_err(|error| format!("wake check failed: {error}"))?;
        let mut text = String::new();
        for segment in self.state.as_iter() {
            let no_speech = segment.no_speech_probability();
            if no_speech > crate::stt::builtin::NO_SPEECH_THRESHOLD {
                continue;
            }
            if let Ok(piece) = segment.to_str_lossy() {
                text.push_str(&piece);
            }
        }
        let matched = self.phrase.matches(&text, sensitivity);
        Ok(WakeCheck {
            matched,
            elapsed: started.elapsed(),
            text,
        })
    }
}
