//! Plan `quick-speech-setup`: the "Built-in (this Mac)" speech provider. Runs whisper.cpp inside
//! the app through the `whisper-rs` binding (GPU through Metal on macOS), so no speech server or
//! Homebrew install is needed.
//!
//! The model is loaded on first use (a recording start begins loading it while the user
//! speaks), kept in memory, and freed after [`IDLE_UNLOAD_AFTER`] without use. Only one
//! model is loaded at a time, and transcriptions run one after another.

use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard, OnceLock};
use std::time::{Duration, Instant};

use async_trait::async_trait;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

use super::silence::{peak_window_level_db, SILENCE_THRESHOLD_DB};
use super::{SttConfig, SttProvider, TranscriptEvent};
use crate::error::AppError;

/// A loaded model is freed after this long without a transcription.
pub const IDLE_UNLOAD_AFTER: Duration = Duration::from_secs(10 * 60);
/// How often the idle check runs.
const IDLE_CHECK_EVERY: Duration = Duration::from_secs(30);
/// Same cap as the server provider: about 12 minutes of 16 kHz 16-bit mono audio.
const MAX_AUDIO_BYTES: usize = 24 * 1024 * 1024;
/// whisper.cpp skips input shorter than one second, so shorter clips are padded with silence.
const MIN_SAMPLES: usize = 16_000 + 1_600;

struct Loaded {
    path: PathBuf,
    state: whisper_rs::WhisperState,
    last_used: Instant,
}

/// The process-wide whisper.cpp engine: the models folder and the one loaded model.
pub struct LocalWhisper {
    models_dir: Mutex<Option<PathBuf>>,
    loaded: Mutex<Option<Loaded>>,
    idle_watch: std::sync::Once,
}

/// Result of one in-process transcription.
#[derive(Debug, Clone, PartialEq)]
pub struct Transcription {
    pub text: String,
    /// Set when this call had to load the model first.
    pub load_ms: Option<u64>,
    pub transcribe_ms: u64,
}

/// The shared engine.
pub fn engine() -> &'static LocalWhisper {
    static ENGINE: OnceLock<LocalWhisper> = OnceLock::new();
    ENGINE.get_or_init(|| {
        // whisper.cpp and GGML log through `tracing` instead of printing to stderr.
        whisper_rs::install_logging_hooks();
        LocalWhisper {
            models_dir: Mutex::new(None),
            loaded: Mutex::new(None),
            idle_watch: std::sync::Once::new(),
        }
    })
}

/// "Could not load the speech model: <reason>. Try the smaller model." (behaviour.md).
pub fn load_error_message(reason: &str) -> String {
    format!("Could not load the speech model: {reason}. Try the smaller model.")
}

/// The message for a built-in preset whose model file is gone.
pub const MODEL_MISSING_MESSAGE: &str =
    "The speech model file is missing. Set up speech recognition again (Settings → Speech).";

impl LocalWhisper {
    /// Set once at startup to `<app data>/models`.
    pub fn set_models_dir(&self, dir: PathBuf) {
        *self.models_dir.lock().unwrap_or_else(|e| e.into_inner()) = Some(dir);
    }

    pub fn models_dir(&self) -> Option<PathBuf> {
        self.models_dir
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }

    /// Full path of an installed model file, or [`MODEL_MISSING_MESSAGE`].
    pub fn model_path(&self, model_file: &str) -> Result<PathBuf, String> {
        let file = model_file.trim();
        // Only a plain file name inside the models folder.
        if file.is_empty() || file.contains('/') || file.contains('\\') || file.starts_with('.') {
            return Err(MODEL_MISSING_MESSAGE.to_string());
        }
        let dir = self
            .models_dir()
            .ok_or_else(|| MODEL_MISSING_MESSAGE.to_string())?;
        let path = dir.join(file);
        if path.is_file() {
            Ok(path)
        } else {
            Err(MODEL_MISSING_MESSAGE.to_string())
        }
    }

    fn lock(&self) -> MutexGuard<'_, Option<Loaded>> {
        self.loaded.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Makes sure `path` is the loaded model. Returns the load time when it had to load.
    fn ensure_loaded(
        &'static self,
        slot: &mut Option<Loaded>,
        path: &Path,
    ) -> Result<Option<Duration>, String> {
        if slot.as_ref().is_some_and(|loaded| loaded.path == path) {
            return Ok(None);
        }
        // Free the old model before loading another one.
        *slot = None;
        let started = Instant::now();
        let mut params = WhisperContextParameters::default();
        params.use_gpu(cfg!(target_os = "macos"));
        params.flash_attn(true);
        let path_str = path
            .to_str()
            .ok_or_else(|| load_error_message("the model path is not valid UTF-8"))?;
        let context = WhisperContext::new_with_params(path_str, params)
            .map_err(|error| load_error_message(&error.to_string()))?;
        let state = context
            .create_state()
            .map_err(|error| load_error_message(&error.to_string()))?;
        let took = started.elapsed();
        tracing::info!(
            "Built-in speech: loaded {} in {} ms",
            path.file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default(),
            took.as_millis()
        );
        *slot = Some(Loaded {
            path: path.to_path_buf(),
            state,
            last_used: Instant::now(),
        });
        self.start_idle_watch();
        Ok(Some(took))
    }

    /// Loads the model now (blocking) so the next transcription does not wait for it.
    pub fn preload(&'static self, path: &Path) -> Result<Option<Duration>, String> {
        let mut slot = self.lock();
        let took = self.ensure_loaded(&mut slot, path)?;
        if let Some(loaded) = slot.as_mut() {
            loaded.last_used = Instant::now();
        }
        Ok(took)
    }

    /// Transcribes 16 kHz 16-bit mono PCM (blocking). `language` `None` means auto-detect.
    /// Greedy decoding. Does not apply the silence gate; the provider does.
    pub fn transcribe(
        &'static self,
        path: &Path,
        pcm: &[u8],
        language: Option<&str>,
    ) -> Result<Transcription, String> {
        let mut slot = self.lock();
        let load = self.ensure_loaded(&mut slot, path)?;
        let loaded = slot
            .as_mut()
            .ok_or_else(|| load_error_message("the model is not loaded"))?;

        let mut samples: Vec<f32> = pcm
            .chunks_exact(2)
            .map(|b| f32::from(i16::from_le_bytes([b[0], b[1]])) / 32768.0)
            .collect();
        if samples.len() < MIN_SAMPLES {
            samples.resize(MIN_SAMPLES, 0.0);
        }

        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
        let threads = std::thread::available_parallelism()
            .map(|n| n.get().min(8))
            .unwrap_or(4) as i32;
        params.set_n_threads(threads);
        params.set_language(language.or(Some("auto")));
        params.set_translate(false);
        params.set_no_context(true);
        params.set_no_timestamps(true);
        params.set_print_special(false);
        params.set_print_progress(false);
        params.set_print_realtime(false);
        params.set_print_timestamps(false);
        params.set_suppress_blank(true);

        let started = Instant::now();
        loaded
            .state
            .full(params, &samples)
            .map_err(|error| format!("Built-in speech recognition failed: {error}"))?;
        let mut text = String::new();
        for segment in loaded.state.as_iter() {
            if let Ok(piece) = segment.to_str_lossy() {
                text.push_str(&piece);
            }
        }
        let transcribe_ms = started.elapsed().as_millis() as u64;
        loaded.last_used = Instant::now();
        let text = super::transcript::normalize_transcript(&text);
        tracing::info!(
            "Built-in speech: transcribed {:.1}s of audio in {} ms{} ({} chars)",
            pcm.len() as f64 / 32_000.0,
            transcribe_ms,
            load.map(|d| format!(" after loading the model in {} ms", d.as_millis()))
                .unwrap_or_default(),
            text.len()
        );
        Ok(Transcription {
            text,
            load_ms: load.map(|d| d.as_millis() as u64),
            transcribe_ms,
        })
    }

    /// True when a model is in memory.
    pub fn is_loaded(&self) -> bool {
        self.lock().is_some()
    }

    /// Frees the model if it has not been used for [`IDLE_UNLOAD_AFTER`]. Skips the check
    /// while a transcription holds the model. Returns true when it freed the model.
    pub fn unload_if_idle(&self, now: Instant) -> bool {
        let Ok(mut slot) = self.loaded.try_lock() else {
            return false;
        };
        match slot.as_ref() {
            Some(loaded) if should_unload(loaded.last_used, now) => {
                tracing::info!("Built-in speech: model unused for 10 minutes, freeing it");
                *slot = None;
                true
            }
            _ => false,
        }
    }

    /// Frees the model. Must run before the process exits: GGML's Metal backend aborts in its
    /// exit-time cleanup while a model's GPU buffers are still alive.
    pub fn unload(&self) {
        let mut slot = self.lock();
        if slot.take().is_some() {
            tracing::info!("Built-in speech: model freed");
        }
    }

    /// Frees the model if `path` is the loaded one (before its file is deleted).
    pub fn unload_path(&self, path: &Path) {
        let mut slot = self.lock();
        if slot.as_ref().is_some_and(|loaded| loaded.path == path) {
            *slot = None;
        }
    }

    fn start_idle_watch(&'static self) {
        self.idle_watch.call_once(|| {
            let spawned = std::thread::Builder::new()
                .name("whisper-idle".to_string())
                .spawn(move || loop {
                    std::thread::sleep(IDLE_CHECK_EVERY);
                    self.unload_if_idle(Instant::now());
                });
            if let Err(error) = spawned {
                tracing::warn!("Built-in speech: could not start the idle check: {error}");
            }
        });
    }
}

/// True when a model last used at `last_used` should be freed at `now`.
pub fn should_unload(last_used: Instant, now: Instant) -> bool {
    now.saturating_duration_since(last_used) >= IDLE_UNLOAD_AFTER
}

/// The automatic check after Quick setup and the Test button of a built-in preset: loads the
/// model and runs it on half a second of tone followed by silence. The text does not matter
/// (it is usually empty); the model must load and run. Returns the time it took in ms.
pub async fn self_test(model_file: &str) -> Result<u32, String> {
    let path = engine().model_path(model_file)?;
    let mut clip = super::silence::pcm_tone(0.2, 0.5, 16_000);
    clip.extend(std::iter::repeat_n(0u8, 32_000));
    let started = Instant::now();
    tokio::task::spawn_blocking(move || engine().transcribe(&path, &clip, Some("en")))
        .await
        .map_err(|error| load_error_message(&error.to_string()))??;
    Ok(started.elapsed().as_millis() as u32)
}

/// Settings for one built-in provider instance, taken from the preset.
#[derive(Debug, Clone)]
pub struct BuiltinConfig {
    pub provider_name: String,
    pub model_file: String,
}

/// The `SttProvider` for built-in presets. Buffers the recording like the server provider and
/// transcribes it in `disconnect`.
pub struct BuiltinProvider {
    config: BuiltinConfig,
    stt_config: Option<SttConfig>,
    audio_buffer: Vec<u8>,
    upload_probe: Option<crate::timing::UploadProbe>,
    preload: Option<tokio::task::JoinHandle<Result<Option<Duration>, String>>>,
}

impl BuiltinProvider {
    pub fn new(config: BuiltinConfig) -> Self {
        Self {
            config,
            stt_config: None,
            audio_buffer: Vec::new(),
            upload_probe: None,
            preload: None,
        }
    }
}

#[async_trait]
impl SttProvider for BuiltinProvider {
    async fn connect(&mut self, config: &SttConfig) -> Result<(), AppError> {
        let path = engine()
            .model_path(&self.config.model_file)
            .map_err(AppError::Config)?;
        self.stt_config = Some(config.clone());
        self.audio_buffer.clear();
        // Load while the user speaks, so stop → text does not include the load.
        self.preload = Some(tokio::task::spawn_blocking(move || engine().preload(&path)));
        tracing::info!("{} provider ready (in-process)", self.config.provider_name);
        Ok(())
    }

    async fn send_audio(&mut self, chunk: &[u8]) -> Result<(), AppError> {
        if self.audio_buffer.len() + chunk.len() > MAX_AUDIO_BYTES {
            return Err(AppError::Config(format!(
                "{}: audio exceeds maximum length (~12 min)",
                self.config.provider_name
            )));
        }
        self.audio_buffer.extend_from_slice(chunk);
        Ok(())
    }

    async fn recv_transcript(&mut self) -> Result<Option<TranscriptEvent>, AppError> {
        // Transcribes in disconnect(); stay pending so the pipeline loop does not spin.
        std::future::pending().await
    }

    async fn disconnect(&mut self) -> Result<Option<String>, AppError> {
        let Some(config) = self.stt_config.clone() else {
            return Ok(None);
        };
        let preload = self.preload.take();
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
                "{}: no speech detected (loudest 50 ms at {:.0} dBFS), skipping recognition",
                self.config.provider_name,
                peak_db
            );
            self.audio_buffer.clear();
            return Ok(None);
        }

        let pcm = std::mem::take(&mut self.audio_buffer);
        if let Some(probe) = &self.upload_probe {
            probe.mark_started(pcm.len());
        }
        if let Some(preload) = preload {
            match preload.await {
                Ok(Ok(Some(took))) => tracing::info!(
                    "{}: model loaded during the recording in {} ms",
                    self.config.provider_name,
                    took.as_millis()
                ),
                Ok(Ok(None)) => {}
                // transcribe() tries again and reports the error.
                Ok(Err(error)) => tracing::warn!("{}: {error}", self.config.provider_name),
                Err(error) => tracing::warn!(
                    "{}: preload task failed: {error}",
                    self.config.provider_name
                ),
            }
        }
        let path = engine().model_path(&self.config.model_file);
        let language = config.language.clone();
        let result = match path {
            Ok(path) => tokio::task::spawn_blocking(move || {
                engine().transcribe(&path, &pcm, language.as_deref())
            })
            .await
            .map_err(|error| format!("Built-in speech recognition failed: {error}"))
            .and_then(|result| result),
            Err(error) => Err(error),
        };
        if let Some(probe) = &self.upload_probe {
            probe.mark_finished();
        }
        let transcription = result.map_err(AppError::Config)?;
        Ok((!transcription.text.is_empty()).then_some(transcription.text))
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
    use super::*;

    #[test]
    fn a_model_is_freed_after_ten_idle_minutes() {
        let used = Instant::now();
        assert!(!should_unload(used, used));
        assert!(!should_unload(
            used,
            used + Duration::from_secs(9 * 60 + 59)
        ));
        assert!(should_unload(used, used + Duration::from_secs(10 * 60)));
        // A clock that looks backwards never unloads.
        assert!(!should_unload(used + Duration::from_secs(5), used));
    }

    #[test]
    fn model_paths_stay_inside_the_models_folder() {
        let engine = engine();
        let dir = std::env::temp_dir().join(format!("typelite-builtin-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("ggml-x.bin"), b"x").unwrap();
        engine.set_models_dir(dir.clone());

        assert_eq!(
            engine.model_path("ggml-x.bin").unwrap(),
            dir.join("ggml-x.bin")
        );
        for bad in ["", "../ggml-x.bin", "/etc/passwd", ".hidden", "missing.bin"] {
            assert_eq!(
                engine.model_path(bad).unwrap_err(),
                MODEL_MISSING_MESSAGE,
                "{bad:?}"
            );
        }
        // Nothing is loaded, so the idle check has nothing to free.
        assert!(!engine.unload_if_idle(Instant::now() + IDLE_UNLOAD_AFTER));
    }

    #[test]
    fn a_broken_model_file_gives_the_load_error() {
        let engine = engine();
        let dir = std::env::temp_dir().join(format!("typelite-broken-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("ggml-broken.bin");
        std::fs::write(&path, b"not a model").unwrap();

        let error = engine.transcribe(&path, &[0u8; 3200], None).unwrap_err();
        assert!(
            error.starts_with("Could not load the speech model:"),
            "{error}"
        );
        assert!(error.ends_with("Try the smaller model."), "{error}");
        assert!(!engine.is_loaded());
    }

    #[tokio::test]
    async fn connect_fails_clearly_without_the_model_file() {
        let mut provider = BuiltinProvider::new(BuiltinConfig {
            provider_name: "Built-in (this Mac)".into(),
            model_file: "ggml-not-installed.bin".into(),
        });
        let error = provider.connect(&SttConfig::default()).await.unwrap_err();
        assert!(
            error.to_string().contains("model file is missing"),
            "{error}"
        );
    }

    #[tokio::test]
    async fn silence_is_skipped_without_running_the_model() {
        let mut provider = BuiltinProvider::new(BuiltinConfig {
            provider_name: "Built-in (this Mac)".into(),
            model_file: "ggml-not-installed.bin".into(),
        });
        // Skip connect (no model file); give the provider its settings directly.
        provider.stt_config = Some(SttConfig::default());
        let probe = crate::timing::UploadProbe::default();
        provider.set_upload_probe(probe.clone());
        provider.send_audio(&[0u8; 32_000]).await.unwrap();

        assert!(matches!(provider.disconnect().await, Ok(None)));
        let marks = probe.snapshot();
        assert!(marks.started_at.is_none());
        assert!((marks.recording_secs() - 1.0).abs() < f64::EPSILON);
    }

    #[tokio::test]
    async fn recv_transcript_stays_pending() {
        let mut provider = BuiltinProvider::new(BuiltinConfig {
            provider_name: "b".into(),
            model_file: "f".into(),
        });
        let waited =
            tokio::time::timeout(Duration::from_millis(20), provider.recv_transcript()).await;
        assert!(waited.is_err());
    }
}
