//! Plan 0008: per-run step timings for the Speed board on Home.
//!
//! Every Dictate, Translate and Ask run records how long each step after "stop" took. The
//! records live only in this process's memory (the last [`RUN_TIMING_CAPACITY`] runs) and are
//! gone when the app quits. They hold durations, sizes and which preset/model was used, never
//! audio, transcripts or answers.

use std::collections::VecDeque;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{Emitter, Manager};

/// How many runs the board keeps.
pub const RUN_TIMING_CAPACITY: usize = 50;
/// Event sent to the frontend after each run, with one [`RunTiming`] as payload.
pub const RUN_TIMING_EVENT: &str = "timing:run";
/// Outcome of a run that ended normally.
pub const OUTCOME_OK: &str = "ok";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum RunMode {
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

/// One run as the Speed board sees it. All times are milliseconds after the user pressed stop.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
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

/// The last [`RUN_TIMING_CAPACITY`] runs, oldest first. Managed as Tauri state.
#[derive(Default)]
pub struct RunTimingBuffer(Mutex<BufferInner>);

impl RunTimingBuffer {
    /// Assembles the run, stores it (dropping the oldest when full) and returns it.
    pub fn record(&self, marks: &RunMarks, presets: RunPresets) -> RunTiming {
        let mut inner = self.0.lock().unwrap_or_else(|e| e.into_inner());
        inner.next_id += 1;
        let run = assemble_run_timing(inner.next_id, marks, presets);
        if inner.runs.len() >= RUN_TIMING_CAPACITY {
            inner.runs.pop_front();
        }
        inner.runs.push_back(run.clone());
        run
    }

    /// All kept runs, oldest first.
    pub fn list(&self) -> Vec<RunTiming> {
        let inner = self.0.lock().unwrap_or_else(|e| e.into_inner());
        inner.runs.iter().cloned().collect()
    }

    pub fn clear(&self) {
        self.0
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .runs
            .clear();
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
    fn buffer_keeps_only_the_last_fifty_runs_oldest_first() {
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
        buffer.clear();
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
}
