//! Plans `speed-board` and `speed-by-preset`: per-run step timings for Insights on Home.
//!
//! Every Dictate, Translate and Ask run records how long each step after "stop" took. The last
//! [`RUN_TIMING_CAPACITY`] records are kept in memory and in a small JSON file in the app data
//! folder ([`RUN_TIMINGS_FILE`]), so the preset comparison survives a restart. A record holds
//! durations, sizes, the mode, the outcome, the speech language and which preset/model was used;
//! never audio, transcripts, answers or any other dictated content. "Clear insights data" in
//! Settings → System deletes the file ([`clear_run_timings`]).

use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager};

/// How many runs are kept (plan `speed-by-preset`).
pub const RUN_TIMING_CAPACITY: usize = 200;
/// File in the app data folder that holds the kept runs.
pub const RUN_TIMINGS_FILE: &str = "run-timings.json";
/// Format version of [`RUN_TIMINGS_FILE`].
const RUN_TIMINGS_FILE_VERSION: u32 = 1;
/// Event sent to the frontend after each run, with one [`RunTiming`] as payload.
pub const RUN_TIMING_EVENT: &str = "timing:run";
/// Outcome of a run that ended normally.
pub const OUTCOME_OK: &str = "ok";

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RunMode {
    #[default]
    Dictate,
    Translate,
    Ask,
}

impl RunMode {
    fn as_str(self) -> &'static str {
        match self {
            RunMode::Dictate => "dictate",
            RunMode::Translate => "translate",
            RunMode::Ask => "ask",
        }
    }
}

/// One run as Insights sees it. All times are milliseconds after the user pressed stop.
///
/// Missing fields read as their default, so a file written by an older or newer version still
/// loads.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct RunTiming {
    /// Increases by one per run; lets the frontend drop an event it already has.
    pub id: u64,
    pub mode: RunMode,
    /// Seconds of audio that were sent for recognition.
    pub recording_secs: f64,
    /// Size of the uploaded audio file.
    pub audio_bytes: u64,
    /// Stop pressed → audio encoded and ready to send.
    pub finish_recording_ms: u64,
    /// Request sent → transcript received (upload, server work and reply).
    pub speech_ms: u64,
    /// Request sent → full AI response. `None` when AI did not run (polish off, AI not ready,
    /// or an Ask search).
    pub ai_ms: Option<u64>,
    /// Response ready → text inserted. `None` when nothing is pasted (an Ask answer window).
    pub paste_ms: Option<u64>,
    /// Stop pressed → text inserted (or, for Ask, → answer ready to show).
    pub total_ms: u64,
    pub speech_preset_id: String,
    pub speech_model: String,
    pub ai_preset_id: String,
    pub ai_model: String,
    /// Speech language setting of the active speech preset (`auto` or a language code).
    pub language: String,
    /// [`OUTCOME_OK`] or the error code of the step that failed.
    pub outcome: String,
}

/// Which presets a run used, copied from the config when the run is recorded.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct RunPresets {
    pub speech_preset_id: String,
    pub speech_model: String,
    pub ai_preset_id: String,
    pub ai_model: String,
    pub language: String,
}

impl RunPresets {
    pub fn from_config(config: &crate::storage::AppConfig) -> Self {
        let speech = config.active_speech_preset();
        let ai = config.active_ai_preset();
        Self {
            speech_preset_id: speech.id.clone(),
            speech_model: speech.model.clone(),
            ai_preset_id: ai.id.clone(),
            ai_model: ai.model.clone(),
            language: config
                .speech_language()
                .unwrap_or(crate::storage::SPEECH_LANGUAGE_AUTO)
                .to_string(),
        }
    }
}

/// What the speech provider saw of one upload: when the audio was ready to send, when the
/// reply came back, and how big the audio was.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct UploadMarks {
    pub started_at: Option<Instant>,
    pub finished_at: Option<Instant>,
    /// Raw 16-bit mono PCM bytes that were recorded.
    pub pcm_bytes: u64,
    /// Size of the WAV file that was uploaded.
    pub wav_bytes: u64,
    pub sample_rate: u32,
}

impl UploadMarks {
    /// Seconds of audio in the upload (16-bit mono, so two bytes per sample).
    pub fn recording_secs(&self) -> f64 {
        if self.sample_rate == 0 {
            return 0.0;
        }
        self.pcm_bytes as f64 / (f64::from(self.sample_rate) * 2.0)
    }
}

/// Shared slot the speech provider writes its [`UploadMarks`] into. One probe per run.
#[derive(Clone, Debug, Default)]
pub struct UploadProbe(Arc<Mutex<UploadMarks>>);

impl UploadProbe {
    /// Called when recording has ended, with the size of the recorded audio (also for a
    /// silent recording that is never sent).
    pub fn note_audio(&self, pcm_bytes: usize, sample_rate: u32) {
        let mut marks = self.0.lock().unwrap_or_else(|e| e.into_inner());
        marks.pcm_bytes = pcm_bytes as u64;
        marks.sample_rate = sample_rate;
    }

    /// Called once the audio is encoded, right before the first request is sent.
    pub fn mark_started(&self, wav_bytes: usize) {
        let mut marks = self.0.lock().unwrap_or_else(|e| e.into_inner());
        marks.started_at = Some(Instant::now());
        marks.wav_bytes = wav_bytes as u64;
    }

    /// Called when the server's final reply (or final error) has arrived.
    pub fn mark_finished(&self) {
        self.0.lock().unwrap_or_else(|e| e.into_inner()).finished_at = Some(Instant::now());
    }

    pub fn snapshot(&self) -> UploadMarks {
        *self.0.lock().unwrap_or_else(|e| e.into_inner())
    }
}

/// The moments of one run, collected by the pipeline or the Ask flow.
#[derive(Clone, Debug)]
pub struct RunMarks {
    pub mode: RunMode,
    /// When the user pressed stop (or released the hold key).
    pub stop_at: Instant,
    pub upload: UploadMarks,
    /// When the transcript was in hand. `None` when the run ended before that.
    pub transcript_at: Option<Instant>,
    /// How long the AI request took. `None` when AI did not run.
    pub ai: Option<Duration>,
    /// Whether the run ends by inserting text into the focused app.
    pub pastes: bool,
    /// When the text was inserted (or the answer was ready, or the run failed).
    pub end_at: Instant,
    /// [`OUTCOME_OK`] or an error code.
    pub outcome: String,
}

fn ms_between(from: Instant, to: Instant) -> u64 {
    to.saturating_duration_since(from).as_millis() as u64
}

/// Turns the moments of a run into step durations.
///
/// Steps follow each other: finish recording ends when the upload starts, speech ends when
/// the transcript is in hand, and paste is what is left of the time after the transcript once
/// the AI time is taken out (so for a pasted run the steps add up to the total).
pub fn assemble_run_timing(id: u64, marks: &RunMarks, presets: RunPresets) -> RunTiming {
    let speech_end = marks
        .transcript_at
        .or(marks.upload.finished_at)
        .unwrap_or(marks.end_at);
    let speech_start = marks.upload.started_at.unwrap_or(speech_end);
    let ai_ms = marks.ai.map(|ai| ai.as_millis() as u64);
    let paste_ms = (marks.pastes && marks.transcript_at.is_some())
        .then(|| ms_between(speech_end, marks.end_at).saturating_sub(ai_ms.unwrap_or(0)));

    RunTiming {
        id,
        mode: marks.mode,
        recording_secs: marks.upload.recording_secs(),
        audio_bytes: marks.upload.wav_bytes,
        finish_recording_ms: ms_between(marks.stop_at, speech_start),
        speech_ms: ms_between(speech_start, speech_end),
        ai_ms,
        paste_ms,
        total_ms: ms_between(marks.stop_at, marks.end_at),
        speech_preset_id: presets.speech_preset_id,
        speech_model: presets.speech_model,
        ai_preset_id: presets.ai_preset_id,
        ai_model: presets.ai_model,
        language: presets.language,
        outcome: marks.outcome.clone(),
    }
}

#[derive(Default)]
struct BufferInner {
    runs: VecDeque<RunTiming>,
    next_id: u64,
}

/// The contents of [`RUN_TIMINGS_FILE`].
#[derive(Serialize, Deserialize)]
struct RunTimingsFile {
    version: u32,
    runs: Vec<RunTiming>,
}

/// Reads the kept runs from `path`, oldest first and at most [`RUN_TIMING_CAPACITY`]. A missing
/// file is an empty list; an unreadable or corrupt file is ignored (and replaced by the next
/// run that is recorded).
fn read_runs(path: &Path) -> Vec<RunTiming> {
    let text = match std::fs::read_to_string(path) {
        Ok(text) => text,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Vec::new(),
        Err(error) => {
            tracing::warn!("Insights: could not read {}: {error}", path.display());
            return Vec::new();
        }
    };
    match serde_json::from_str::<RunTimingsFile>(&text) {
        Ok(file) => {
            let mut runs = file.runs;
            if runs.len() > RUN_TIMING_CAPACITY {
                runs.drain(..runs.len() - RUN_TIMING_CAPACITY);
            }
            runs
        }
        Err(error) => {
            tracing::warn!(
                "Insights: ignoring an unreadable {}: {error}",
                path.display()
            );
            Vec::new()
        }
    }
}

/// Writes the runs to `path` through a temporary file, so a crash never leaves half a file.
fn write_runs(path: &Path, runs: &VecDeque<RunTiming>) -> std::io::Result<()> {
    let file = RunTimingsFile {
        version: RUN_TIMINGS_FILE_VERSION,
        runs: runs.iter().cloned().collect(),
    };
    let json = serde_json::to_vec(&file).map_err(std::io::Error::other)?;
    let temp = path.with_extension("json.tmp");
    std::fs::write(&temp, json)?;
    std::fs::rename(&temp, path)
}

/// The last [`RUN_TIMING_CAPACITY`] runs, oldest first. Managed as Tauri state.
///
/// Made with [`RunTimingBuffer::load`] it also keeps the runs in a file; `Default` keeps them in
/// memory only (tests).
#[derive(Default)]
pub struct RunTimingBuffer {
    inner: Mutex<BufferInner>,
    path: Option<PathBuf>,
}

impl RunTimingBuffer {
    /// Loads the runs kept in `path` and keeps writing new runs there.
    pub fn load(path: PathBuf) -> Self {
        let runs: VecDeque<RunTiming> = read_runs(&path).into();
        let next_id = runs.iter().map(|run| run.id).max().unwrap_or(0);
        Self {
            inner: Mutex::new(BufferInner { runs, next_id }),
            path: Some(path),
        }
    }

    /// Assembles the run, stores it (dropping the oldest when full) and returns it.
    pub fn record(&self, marks: &RunMarks, presets: RunPresets) -> RunTiming {
        let mut inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        inner.next_id += 1;
        let run = assemble_run_timing(inner.next_id, marks, presets);
        while inner.runs.len() >= RUN_TIMING_CAPACITY {
            inner.runs.pop_front();
        }
        inner.runs.push_back(run.clone());
        if let Some(path) = &self.path {
            if let Err(error) = write_runs(path, &inner.runs) {
                tracing::warn!("Insights: could not save {}: {error}", path.display());
            }
        }
        run
    }

    /// All kept runs, oldest first.
    pub fn list(&self) -> Vec<RunTiming> {
        let inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        inner.runs.iter().cloned().collect()
    }

    /// Forgets every run and deletes the file. Ids keep increasing.
    pub fn clear(&self) -> std::io::Result<()> {
        let mut inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        inner.runs.clear();
        match &self.path {
            Some(path) => match std::fs::remove_file(path) {
                Err(error) if error.kind() != std::io::ErrorKind::NotFound => Err(error),
                _ => Ok(()),
            },
            None => Ok(()),
        }
    }
}

fn format_optional_ms(value: Option<u64>) -> String {
    value.map_or_else(|| "skipped".to_string(), |ms| format!("{ms}ms"))
}

/// Records a finished run, logs one `[Pipeline Timing]` line and tells the frontend.
pub fn record_run(app: &tauri::AppHandle, marks: &RunMarks, config: &crate::storage::AppConfig) {
    let Some(buffer) = app.try_state::<RunTimingBuffer>() else {
        return;
    };
    let run = buffer.record(marks, RunPresets::from_config(config));
    tracing::info!(
        "[Pipeline Timing] Run {}: finish recording {}ms, speech {}ms, AI {}, paste {}, total {}ms ({:.1}s of audio, {} bytes, {})",
        run.mode.as_str(),
        run.finish_recording_ms,
        run.speech_ms,
        format_optional_ms(run.ai_ms),
        format_optional_ms(run.paste_ms),
        run.total_ms,
        run.recording_secs,
        run.audio_bytes,
        run.outcome,
    );
    let _ = app.emit(RUN_TIMING_EVENT, &run);
}

/// The kept runs, oldest first, so Home can draw the board when it opens.
#[tauri::command]
pub fn get_run_timings(buffer: tauri::State<'_, RunTimingBuffer>) -> Vec<RunTiming> {
    buffer.list()
}

/// Settings → System → "Clear insights data": forgets every kept run and deletes the file.
#[tauri::command]
pub fn clear_run_timings(buffer: tauri::State<'_, RunTimingBuffer>) -> Result<(), String> {
    buffer.clear().map_err(|error| {
        tracing::warn!("Insights: could not delete the timings file: {error}");
        error.to_string()
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(base: Instant, ms: u64) -> Instant {
        base + Duration::from_millis(ms)
    }

    fn presets() -> RunPresets {
        RunPresets {
            speech_preset_id: "speech-1".to_string(),
            speech_model: "large-v3-turbo".to_string(),
            ai_preset_id: "ai-1".to_string(),
            ai_model: "qwen3:4b".to_string(),
            language: "auto".to_string(),
        }
    }

    fn upload(base: Instant, started: u64, finished: u64) -> UploadMarks {
        UploadMarks {
            started_at: Some(at(base, started)),
            finished_at: Some(at(base, finished)),
            pcm_bytes: 4 * 32_000,
            wav_bytes: 4 * 32_000 + 44,
            sample_rate: 16_000,
        }
    }

    fn marks(mode: RunMode, base: Instant) -> RunMarks {
        RunMarks {
            mode,
            stop_at: base,
            upload: upload(base, 120, 1_300),
            transcript_at: Some(at(base, 1_310)),
            ai: Some(Duration::from_millis(400)),
            pastes: true,
            end_at: at(base, 1_900),
            outcome: OUTCOME_OK.to_string(),
        }
    }

    #[test]
    fn dictate_run_splits_into_steps_that_add_up_to_the_total() {
        let base = Instant::now();
        let run = assemble_run_timing(7, &marks(RunMode::Dictate, base), presets());

        assert_eq!(run.id, 7);
        assert_eq!(run.mode, RunMode::Dictate);
        assert_eq!(run.finish_recording_ms, 120);
        assert_eq!(run.speech_ms, 1_190);
        assert_eq!(run.ai_ms, Some(400));
        assert_eq!(run.paste_ms, Some(190));
        assert_eq!(run.total_ms, 1_900);
        assert_eq!(
            run.finish_recording_ms + run.speech_ms + run.ai_ms.unwrap() + run.paste_ms.unwrap(),
            run.total_ms
        );
        assert!((run.recording_secs - 4.0).abs() < f64::EPSILON);
        assert_eq!(run.audio_bytes, 128_044);
        assert_eq!(run.speech_preset_id, "speech-1");
        assert_eq!(run.speech_model, "large-v3-turbo");
        assert_eq!(run.ai_preset_id, "ai-1");
        assert_eq!(run.ai_model, "qwen3:4b");
        assert_eq!(run.language, "auto");
        assert_eq!(run.outcome, "ok");
    }

    #[test]
    fn dictate_run_with_polish_off_marks_ai_as_skipped() {
        let base = Instant::now();
        let mut run_marks = marks(RunMode::Dictate, base);
        run_marks.ai = None;
        let run = assemble_run_timing(1, &run_marks, presets());

        assert_eq!(run.ai_ms, None);
        assert_eq!(run.paste_ms, Some(590));
        assert_eq!(run.total_ms, 1_900);
    }

    #[test]
    fn translate_run_keeps_its_mode() {
        let base = Instant::now();
        let run = assemble_run_timing(1, &marks(RunMode::Translate, base), presets());

        assert_eq!(run.mode, RunMode::Translate);
        assert_eq!(run.ai_ms, Some(400));
        assert_eq!(run.paste_ms, Some(190));
    }

    #[test]
    fn ask_run_ends_at_the_answer_without_a_paste_step() {
        let base = Instant::now();
        let mut run_marks = marks(RunMode::Ask, base);
        run_marks.pastes = false;
        run_marks.ai = Some(Duration::from_millis(580));
        let run = assemble_run_timing(1, &run_marks, presets());

        assert_eq!(run.mode, RunMode::Ask);
        assert_eq!(run.ai_ms, Some(580));
        assert_eq!(run.paste_ms, None);
        assert_eq!(run.total_ms, 1_900);
    }

    #[test]
    fn speech_error_run_stops_at_the_failed_step() {
        let base = Instant::now();
        let mut run_marks = marks(RunMode::Dictate, base);
        run_marks.transcript_at = None;
        run_marks.ai = None;
        run_marks.pastes = false;
        run_marks.end_at = at(base, 1_320);
        run_marks.outcome = "stt_unreachable".to_string();
        let run = assemble_run_timing(1, &run_marks, presets());

        assert_eq!(run.finish_recording_ms, 120);
        assert_eq!(run.speech_ms, 1_180);
        assert_eq!(run.ai_ms, None);
        assert_eq!(run.paste_ms, None);
        assert_eq!(run.total_ms, 1_320);
        assert_eq!(run.outcome, "stt_unreachable");
    }

    #[test]
    fn run_without_an_upload_counts_all_time_before_the_end_as_finishing() {
        let base = Instant::now();
        let mut run_marks = marks(RunMode::Dictate, base);
        run_marks.upload = UploadMarks::default();
        run_marks.transcript_at = None;
        run_marks.ai = None;
        run_marks.pastes = false;
        run_marks.end_at = at(base, 80);
        run_marks.outcome = "stt_no_speech_detected".to_string();
        let run = assemble_run_timing(1, &run_marks, presets());

        assert_eq!(run.finish_recording_ms, 80);
        assert_eq!(run.speech_ms, 0);
        assert_eq!(run.recording_secs, 0.0);
        assert_eq!(run.audio_bytes, 0);
    }

    #[test]
    fn ai_error_run_keeps_the_ai_time_and_the_raw_paste() {
        let base = Instant::now();
        let mut run_marks = marks(RunMode::Dictate, base);
        run_marks.outcome = "llm_failed".to_string();
        let run = assemble_run_timing(1, &run_marks, presets());

        assert_eq!(run.ai_ms, Some(400));
        assert_eq!(run.paste_ms, Some(190));
        assert_eq!(run.outcome, "llm_failed");
    }

    #[test]
    fn upload_probe_records_sizes_and_moments() {
        let probe = UploadProbe::default();
        assert_eq!(probe.snapshot(), UploadMarks::default());

        probe.note_audio(64_000, 16_000);
        probe.mark_started(64_044);
        probe.mark_finished();
        let marks = probe.snapshot();
        assert!(marks.started_at.is_some());
        assert!(marks.finished_at.unwrap() >= marks.started_at.unwrap());
        assert_eq!(marks.pcm_bytes, 64_000);
        assert_eq!(marks.wav_bytes, 64_044);
        assert!((marks.recording_secs() - 2.0).abs() < f64::EPSILON);
    }

    #[test]
    fn buffer_keeps_only_the_last_runs_up_to_the_capacity_oldest_first() {
        let buffer = RunTimingBuffer::default();
        let base = Instant::now();
        for _ in 0..(RUN_TIMING_CAPACITY + 5) {
            buffer.record(&marks(RunMode::Dictate, base), presets());
        }

        let runs = buffer.list();
        assert_eq!(runs.len(), RUN_TIMING_CAPACITY);
        assert_eq!(runs.first().unwrap().id, 6);
        assert_eq!(runs.last().unwrap().id, (RUN_TIMING_CAPACITY + 5) as u64);
    }

    #[test]
    fn buffer_clear_empties_it_and_ids_keep_increasing() {
        let buffer = RunTimingBuffer::default();
        let base = Instant::now();
        buffer.record(&marks(RunMode::Dictate, base), presets());
        buffer.record(&marks(RunMode::Ask, base), presets());
        buffer.clear().unwrap();
        assert!(buffer.list().is_empty());

        let next = buffer.record(&marks(RunMode::Translate, base), presets());
        assert_eq!(next.id, 3);
        assert_eq!(buffer.list().len(), 1);
    }

    #[test]
    fn run_serializes_for_the_frontend_without_any_text() {
        let base = Instant::now();
        let mut run_marks = marks(RunMode::Translate, base);
        run_marks.ai = None;
        let run = assemble_run_timing(3, &run_marks, presets());
        let json = serde_json::to_value(&run).unwrap();

        assert_eq!(json["mode"], "translate");
        assert_eq!(json["finishRecordingMs"], 120);
        assert_eq!(json["speechMs"], 1_190);
        assert!(json["aiMs"].is_null());
        assert_eq!(json["pasteMs"], 590);
        assert_eq!(json["totalMs"], 1_900);
        assert_eq!(json["speechPresetId"], "speech-1");
        assert_eq!(json["outcome"], "ok");
        let keys: Vec<&String> = json.as_object().unwrap().keys().collect();
        assert!(!keys
            .iter()
            .any(|key| key.contains("text") || key.contains("answer")));
    }

    /// A fresh, empty folder for one test.
    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "typelite-timing-{name}-{}-{:?}",
            std::process::id(),
            Instant::now()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn runs_survive_a_restart_through_the_file() {
        let dir = temp_dir("roundtrip");
        let path = dir.join(RUN_TIMINGS_FILE);
        let base = Instant::now();
        let buffer = RunTimingBuffer::load(path.clone());
        let first = buffer.record(&marks(RunMode::Dictate, base), presets());
        let second = buffer.record(&marks(RunMode::Ask, base), presets());
        drop(buffer);

        let reloaded = RunTimingBuffer::load(path.clone());
        assert_eq!(reloaded.list(), vec![first, second]);
        // Ids go on from the highest kept id.
        let third = reloaded.record(&marks(RunMode::Translate, base), presets());
        assert_eq!(third.id, 3);
        assert_eq!(RunTimingBuffer::load(path).list().len(), 3);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn file_keeps_at_most_the_capacity() {
        let dir = temp_dir("cap");
        let path = dir.join(RUN_TIMINGS_FILE);
        let base = Instant::now();
        let buffer = RunTimingBuffer::load(path.clone());
        for _ in 0..(RUN_TIMING_CAPACITY + 3) {
            buffer.record(&marks(RunMode::Dictate, base), presets());
        }

        let reloaded = RunTimingBuffer::load(path.clone()).list();
        assert_eq!(reloaded.len(), RUN_TIMING_CAPACITY);
        assert_eq!(reloaded.first().unwrap().id, 4);

        // A file with too many runs (written by hand or another version) is cut on load.
        let too_many: Vec<RunTiming> = (1..=(RUN_TIMING_CAPACITY as u64 + 10))
            .map(|id| RunTiming {
                id,
                ..RunTiming::default()
            })
            .collect();
        let json = serde_json::json!({ "version": 1, "runs": too_many });
        std::fs::write(&path, json.to_string()).unwrap();
        let cut = RunTimingBuffer::load(path).list();
        assert_eq!(cut.len(), RUN_TIMING_CAPACITY);
        assert_eq!(cut.first().unwrap().id, 11);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn corrupt_or_missing_file_starts_empty_and_is_replaced() {
        let dir = temp_dir("corrupt");
        let path = dir.join(RUN_TIMINGS_FILE);
        assert!(RunTimingBuffer::load(path.clone()).list().is_empty());

        std::fs::write(&path, "{ not json").unwrap();
        let buffer = RunTimingBuffer::load(path.clone());
        assert!(buffer.list().is_empty());
        buffer.record(&marks(RunMode::Dictate, Instant::now()), presets());
        assert_eq!(RunTimingBuffer::load(path).list().len(), 1);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn a_run_with_missing_or_extra_fields_still_loads() {
        let dir = temp_dir("fields");
        let path = dir.join(RUN_TIMINGS_FILE);
        let json = r#"{"version":1,"runs":[{"id":5,"mode":"ask","speechMs":900,"outcome":"ok","someFutureField":3}]}"#;
        std::fs::write(&path, json).unwrap();

        let runs = RunTimingBuffer::load(path).list();
        assert_eq!(runs.len(), 1);
        assert_eq!(runs[0].id, 5);
        assert_eq!(runs[0].mode, RunMode::Ask);
        assert_eq!(runs[0].speech_ms, 900);
        assert_eq!(runs[0].ai_ms, None);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn clear_deletes_the_file() {
        let dir = temp_dir("clear");
        let path = dir.join(RUN_TIMINGS_FILE);
        let buffer = RunTimingBuffer::load(path.clone());
        buffer.record(&marks(RunMode::Dictate, Instant::now()), presets());
        assert!(path.exists());

        buffer.clear().unwrap();
        assert!(buffer.list().is_empty());
        assert!(!path.exists());
        // Clearing again (no file) is fine.
        buffer.clear().unwrap();
        assert!(RunTimingBuffer::load(path).list().is_empty());
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn the_file_holds_no_text() {
        let dir = temp_dir("notext");
        let path = dir.join(RUN_TIMINGS_FILE);
        RunTimingBuffer::load(path.clone())
            .record(&marks(RunMode::Dictate, Instant::now()), presets());
        let json: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        let run = json["runs"][0].as_object().unwrap();
        assert!(!run.keys().any(|key| key.contains("text")
            || key.contains("answer")
            || key.contains("transcript")));
        let _ = std::fs::remove_dir_all(dir);
    }
}
