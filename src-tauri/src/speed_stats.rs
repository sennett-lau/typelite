//! Plan `typing-speed-and-nudge`: speaking and typing speed for Insights, and the typing nudge.
//!
//! - **Speaking:** after a Dictate or Translate run pasted its result, the final text is split
//!   into words ([`count_words`]) and added, with the recording length, to running totals. The
//!   text is dropped at once.
//! - **Typing:** the native key listener (`native_hotkey.rs`) tells [`SpeedStats`] "one text
//!   keystroke now" for every key-down that typed text ([`counts_as_typing`]). Which key it was
//!   is never passed on, stored or logged. [`TypingTracker`] groups keystrokes into bursts and
//!   adds finished bursts to the totals.
//! - **Nudge:** the tracker also follows the current typing stretch. After about a minute of
//!   typing, a background thread checks [`nudge_allowed`] and shows the nudge in the pill.
//!
//! Only totals are kept, in `speed-stats.json` in the app data folder. The key listener thread
//! never touches the disk: a worker thread saves and sends events.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::time::{Duration, Instant};

/// File in the app data folder that holds the totals.
pub const STATS_FILE: &str = "speed-stats.json";
/// Event sent after the totals changed (payload: [`SpeedSummary`]).
pub const SPEED_STATS_EVENT: &str = "speed:stats";
/// Event that shows the typing nudge in the pill (no payload).
pub const TYPING_NUDGE_EVENT: &str = "typing:nudge";

/// A pause longer than this ends a typing burst.
pub const BURST_GAP: Duration = Duration::from_secs(2);
/// Bursts shorter than this (a quick reply, a stray key) are not counted.
pub const MIN_BURST: Duration = Duration::from_secs(5);
/// The usual convention: five keystrokes make one word.
pub const KEYSTROKES_PER_WORD: f64 = 5.0;
/// Speaking speed is shown once this much speech was measured.
pub const MIN_SPEAKING_SECS: f64 = 10.0;
/// Typing speed is shown once this much active typing was measured.
pub const MIN_TYPING_MINUTES: f64 = 1.0;
/// A typing stretch this long may show the nudge.
pub const NUDGE_STRETCH: Duration = Duration::from_secs(60);
/// A pause longer than this ends a typing stretch (the nudge wants mostly continuous typing).
pub const NUDGE_MAX_PAUSE: Duration = Duration::from_secs(5);
/// How often the worker looks at an open burst (to close it and to check the stretch).
const WORKER_POLL: Duration = Duration::from_secs(1);

// ─── Word counting ───

/// A token counts as a word when it holds a letter or a digit (in any script).
fn is_word_token(token: &str) -> bool {
    token.chars().any(char::is_alphanumeric)
}

/// True for characters that are written without spaces between words (Han, kana, Hangul).
fn is_cjk(c: char) -> bool {
    matches!(u32::from(c),
        0x3040..=0x30FF   // Hiragana, Katakana
        | 0x3400..=0x4DBF // CJK Extension A
        | 0x4E00..=0x9FFF // CJK Unified Ideographs
        | 0xAC00..=0xD7AF // Hangul syllables
        | 0xF900..=0xFAFF // CJK Compatibility Ideographs
        | 0x20000..=0x2FA1F)
}

/// Words without the macOS tokenizer: whitespace-separated runs that hold a letter or digit,
/// where every CJK character counts as a word of its own.
pub fn count_words_fallback(text: &str) -> u32 {
    let mut count = 0u32;
    for chunk in text.split_whitespace() {
        let mut in_word = false;
        for c in chunk.chars() {
            if is_cjk(c) {
                count += 1;
                in_word = false;
            } else if c.is_alphanumeric() {
                if !in_word {
                    count += 1;
                    in_word = true;
                }
            } else if c != '\'' && c != '’' && c != '-' {
                in_word = false;
            }
        }
    }
    count
}

/// Number of words in `text`. On macOS this uses the system word segmentation, which also
/// splits Chinese into words; elsewhere [`count_words_fallback`].
pub fn count_words(text: &str) -> u32 {
    #[cfg(target_os = "macos")]
    {
        mac_words::count(text).unwrap_or_else(|| count_words_fallback(text))
    }
    #[cfg(not(target_os = "macos"))]
    {
        count_words_fallback(text)
    }
}

/// `CFStringTokenizer` from CoreFoundation. With the word unit it walks the text word by word
/// using the system's language rules (dictionary-based for Chinese and Japanese). Each token
/// comes back as a range in UTF-16 code units, the same units Rust's `encode_utf16` gives.
#[cfg(target_os = "macos")]
mod mac_words {
    use std::ffi::c_void;

    type CfIndex = isize;
    type CfOptionFlags = usize;
    type CfRef = *const c_void;

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct CfRange {
        location: CfIndex,
        length: CfIndex,
    }

    /// `kCFStringTokenizerUnitWord`.
    const UNIT_WORD: CfOptionFlags = 0;
    /// `kCFStringTokenizerTokenNone`: no more tokens.
    const TOKEN_NONE: CfOptionFlags = 0;

    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        fn CFStringCreateWithCharacters(alloc: CfRef, chars: *const u16, len: CfIndex) -> CfRef;
        fn CFStringTokenizerCreate(
            alloc: CfRef,
            string: CfRef,
            range: CfRange,
            options: CfOptionFlags,
            locale: CfRef,
        ) -> CfRef;
        fn CFStringTokenizerAdvanceToNextToken(tokenizer: CfRef) -> CfOptionFlags;
        fn CFStringTokenizerGetCurrentTokenRange(tokenizer: CfRef) -> CfRange;
        fn CFRelease(cf: CfRef);
    }

    /// Counts the word tokens of `text`; `None` when CoreFoundation could not be used.
    pub fn count(text: &str) -> Option<u32> {
        let units: Vec<u16> = text.encode_utf16().collect();
        if units.is_empty() {
            return Some(0);
        }
        let len = CfIndex::try_from(units.len()).ok()?;
        // SAFETY: plain CoreFoundation calls on objects created here and released below; the
        // string copies `units`, so the buffer only has to live for the create call.
        unsafe {
            let string = CFStringCreateWithCharacters(std::ptr::null(), units.as_ptr(), len);
            if string.is_null() {
                return None;
            }
            let range = CfRange {
                location: 0,
                length: len,
            };
            let tokenizer = CFStringTokenizerCreate(
                std::ptr::null(),
                string,
                range,
                UNIT_WORD,
                std::ptr::null(),
            );
            if tokenizer.is_null() {
                CFRelease(string);
                return None;
            }
            let mut words = 0u32;
            while CFStringTokenizerAdvanceToNextToken(tokenizer) != TOKEN_NONE {
                let token = CFStringTokenizerGetCurrentTokenRange(tokenizer);
                let start = usize::try_from(token.location)
                    .unwrap_or(0)
                    .min(units.len());
                let end = start
                    .saturating_add(usize::try_from(token.length).unwrap_or(0))
                    .min(units.len());
                if super::is_word_token(&String::from_utf16_lossy(&units[start..end])) {
                    words += 1;
                }
            }
            CFRelease(tokenizer);
            CFRelease(string);
            Some(words)
        }
    }
}

// ─── Which keystrokes count ───

/// macOS virtual keycodes of keys that type text: letters, digits, punctuation and Space on the
/// ANSI layout, the extra ISO and JIS keys, and the keypad digits and operators. Keycodes name
/// the key position, so this works for every keyboard layout and input method.
const TEXT_KEYCODES: &[u16] = &[
    // Letters.
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17, 31, 32, 34, 35, 37, 38, 40, 45, 46,
    // Digits.
    18, 19, 20, 21, 22, 23, 25, 26, 28, 29, // Punctuation: = - ] [ ' ; \ , / . `
    24, 27, 30, 33, 39, 41, 42, 43, 44, 47, 50, // Space.
    49, // ISO § key, JIS ¥ and _ keys.
    10, 93, 94, // Keypad: . * + / - = and 0–9.
    65, 67, 69, 75, 78, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92,
];

/// `kCGEventFlagMaskCommand`.
const FLAG_COMMAND: u64 = 0x0010_0000;
/// `kCGEventFlagMaskControl`.
const FLAG_CONTROL: u64 = 0x0004_0000;

/// True when `code` is a key that types text.
pub fn is_text_keycode(code: u16) -> bool {
    TEXT_KEYCODES.contains(&code)
}

/// Whether a macOS key event is one typed keystroke: a first key-down (not a repeat) of a text
/// key, without ⌘ or ⌃ (shortcuts), that Typelite did not swallow (its own shortcuts).
pub fn counts_as_typing(event: &crate::native_hotkey::MacKeyEvent, swallowed: bool) -> bool {
    event.kind == crate::native_hotkey::MacEventKind::KeyDown
        && !event.autorepeat
        && !swallowed
        && event.flags & (FLAG_COMMAND | FLAG_CONTROL) == 0
        && is_text_keycode(event.keycode)
}

// ─── Bursts and stretches ───

/// A typing burst that ended and was long enough to count.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct FinishedBurst {
    pub keystrokes: u64,
    pub secs: f64,
}

#[derive(Debug, Clone, Copy)]
struct Burst {
    start: Instant,
    last: Instant,
    keystrokes: u64,
}

impl Burst {
    /// The burst as counted, or `None` when it was shorter than [`MIN_BURST`].
    fn finish(self) -> Option<FinishedBurst> {
        let length = self.last.saturating_duration_since(self.start);
        (length >= MIN_BURST).then(|| FinishedBurst {
            keystrokes: self.keystrokes,
            secs: length.as_secs_f64(),
        })
    }
}

/// Groups keystroke times into bursts (for typing speed) and stretches (for the nudge). Holds
/// only times and a count, never keys.
#[derive(Debug, Default)]
pub struct TypingTracker {
    burst: Option<Burst>,
    stretch_start: Option<Instant>,
    last_key: Option<Instant>,
}

/// What one keystroke did to the tracker.
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct KeyOutcome {
    /// The previous burst ended (a gap over [`BURST_GAP`]) and counted.
    pub finished: Option<FinishedBurst>,
    /// This keystroke started a new burst.
    pub new_burst: bool,
}

impl TypingTracker {
    /// One text keystroke at `now`.
    pub fn key(&mut self, now: Instant) -> KeyOutcome {
        let continues_stretch = self
            .last_key
            .is_some_and(|last| now.saturating_duration_since(last) <= NUDGE_MAX_PAUSE);
        if !continues_stretch {
            self.stretch_start = Some(now);
        }
        self.last_key = Some(now);

        match self.burst.as_mut() {
            Some(burst) if now.saturating_duration_since(burst.last) <= BURST_GAP => {
                burst.keystrokes += 1;
                burst.last = now;
                KeyOutcome::default()
            }
            _ => {
                let finished = self.burst.take().and_then(Burst::finish);
                self.burst = Some(Burst {
                    start: now,
                    last: now,
                    keystrokes: 1,
                });
                KeyOutcome {
                    finished,
                    new_burst: true,
                }
            }
        }
    }

    /// Ends the open burst when no key came for longer than [`BURST_GAP`].
    pub fn flush(&mut self, now: Instant) -> Option<FinishedBurst> {
        let idle = self
            .burst
            .is_some_and(|burst| now.saturating_duration_since(burst.last) > BURST_GAP);
        if idle {
            self.burst.take().and_then(Burst::finish)
        } else {
            None
        }
    }

    /// Ends the open burst now (the app quits).
    pub fn finish(&mut self) -> Option<FinishedBurst> {
        self.burst.take().and_then(Burst::finish)
    }

    pub fn has_open_burst(&self) -> bool {
        self.burst.is_some()
    }

    /// How long the current typing stretch has lasted; zero when the last key is older than
    /// [`NUDGE_MAX_PAUSE`].
    pub fn stretch(&self, now: Instant) -> Duration {
        match (self.stretch_start, self.last_key) {
            (Some(start), Some(last)) if now.saturating_duration_since(last) <= NUDGE_MAX_PAUSE => {
                last.saturating_duration_since(start)
            }
            _ => Duration::ZERO,
        }
    }

    /// Starts the stretch over (after the nudge was considered), keeping the open burst.
    pub fn restart_stretch(&mut self) {
        self.stretch_start = None;
        self.last_key = None;
    }

    /// Forgets everything that is not yet counted.
    pub fn clear(&mut self) {
        *self = Self::default();
    }
}

// ─── Totals and the file ───

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct SpeakingTotals {
    pub runs: u64,
    pub words: u64,
    pub minutes: f64,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct TypingTotals {
    pub keystrokes: u64,
    pub minutes: f64,
    pub bursts: u64,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct NudgeRecord {
    /// Local calendar day (`YYYY-MM-DD`) the nudge last showed.
    pub last_shown_day: Option<String>,
    /// The user chose "Don't show again".
    pub dismissed: bool,
}

/// Everything in `speed-stats.json`: totals only.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct StatsFile {
    pub version: u32,
    pub speaking: SpeakingTotals,
    pub typing: TypingTotals,
    pub nudge: NudgeRecord,
}

impl Default for StatsFile {
    fn default() -> Self {
        Self {
            version: 1,
            speaking: SpeakingTotals::default(),
            typing: TypingTotals::default(),
            nudge: NudgeRecord::default(),
        }
    }
}

impl StatsFile {
    /// Adds one pasted run. Runs without words or without audio are ignored.
    pub fn add_speaking(&mut self, words: u32, recording_secs: f64) {
        if words == 0 || !recording_secs.is_finite() || recording_secs <= 0.0 {
            return;
        }
        self.speaking.runs += 1;
        self.speaking.words += u64::from(words);
        self.speaking.minutes += recording_secs / 60.0;
    }

    pub fn add_burst(&mut self, burst: FinishedBurst) {
        self.typing.bursts += 1;
        self.typing.keystrokes += burst.keystrokes;
        self.typing.minutes += burst.secs / 60.0;
    }

    /// Words per minute of speech, once at least [`MIN_SPEAKING_SECS`] were measured.
    pub fn speaking_wpm(&self) -> Option<f64> {
        (self.speaking.minutes * 60.0 >= MIN_SPEAKING_SECS)
            .then(|| self.speaking.words as f64 / self.speaking.minutes)
    }

    /// Typing words per minute (five keystrokes a word), once at least [`MIN_TYPING_MINUTES`]
    /// of active typing were measured.
    pub fn typing_wpm(&self) -> Option<f64> {
        (self.typing.minutes >= MIN_TYPING_MINUTES)
            .then(|| self.typing.keystrokes as f64 / KEYSTROKES_PER_WORD / self.typing.minutes)
    }

    pub fn summary(&self) -> SpeedSummary {
        let speaking_wpm = self.speaking_wpm();
        let typing_wpm = self.typing_wpm();
        let times_faster = match (speaking_wpm, typing_wpm) {
            (Some(speaking), Some(typing)) if typing > 0.0 => Some(speaking / typing),
            _ => None,
        };
        SpeedSummary {
            speaking_wpm,
            typing_wpm,
            times_faster,
        }
    }

    /// "Reset speed stats": clears speaking and typing, keeps the nudge record.
    pub fn reset_totals(&mut self) {
        self.speaking = SpeakingTotals::default();
        self.typing = TypingTotals::default();
    }
}

/// What Insights shows. `None` means "not enough data yet" (shown as "—").
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeedSummary {
    pub speaking_wpm: Option<f64>,
    pub typing_wpm: Option<f64>,
    pub times_faster: Option<f64>,
}

/// Reads the file; a missing or unreadable file starts from zero.
pub fn load_file(path: &Path) -> StatsFile {
    std::fs::read(path)
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default()
}

/// Writes the file through a temporary file, so a crash never leaves half a file.
pub fn save_file(path: &Path, file: &StatsFile) -> std::io::Result<()> {
    let json = serde_json::to_vec_pretty(file).map_err(std::io::Error::other)?;
    let temp = path.with_extension("json.tmp");
    std::fs::write(&temp, json)?;
    std::fs::rename(&temp, path)
}

// ─── Nudge rules ───

/// Everything the nudge decision depends on, read when a typing stretch reached a minute.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct NudgeContext {
    /// "Measure typing speed" is on.
    pub enabled: bool,
    /// "Don't show again" was chosen.
    pub dismissed: bool,
    /// The nudge already showed today.
    pub shown_today: bool,
    /// Onboarding is finished (the shortcut gate allows every role).
    pub onboarding_done: bool,
    /// A run is active, or the Copy pill or Ask is up.
    pub busy: bool,
    /// Typelite's own window has focus (the user types in Typelite, not another app).
    pub typelite_focused: bool,
}

pub fn nudge_allowed(context: NudgeContext) -> bool {
    context.enabled
        && !context.dismissed
        && !context.shown_today
        && context.onboarding_done
        && !context.busy
        && !context.typelite_focused
}

/// Today's local calendar day as `YYYY-MM-DD`.
pub fn local_day() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}

// ─── Shared state ───

struct Inner {
    file: StatsFile,
    tracker: TypingTracker,
    /// The file changed since it was last saved.
    dirty: bool,
}

/// What the worker thread should do after a tick.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct TickResult {
    /// The totals changed: save them and tell the frontend.
    pub changed: bool,
    /// A typing stretch reached [`NUDGE_STRETCH`]: consider the nudge.
    pub nudge_due: bool,
}

/// The speed totals and the typing tracker, managed as Tauri state. Cloned handles share one
/// state. Called from the key listener thread, so every method only takes a short lock.
#[derive(Clone)]
pub struct SpeedStats {
    inner: Arc<Mutex<Inner>>,
    enabled: Arc<AtomicBool>,
    path: Option<PathBuf>,
    wake: Arc<Mutex<Option<mpsc::Sender<()>>>>,
}

impl SpeedStats {
    /// Loads the totals from `path` (`None`: memory only, for tests).
    pub fn load(path: Option<PathBuf>) -> Self {
        let file = path.as_deref().map(load_file).unwrap_or_default();
        Self {
            inner: Arc::new(Mutex::new(Inner {
                file,
                tracker: TypingTracker::default(),
                dirty: false,
            })),
            enabled: Arc::new(AtomicBool::new(true)),
            path,
            wake: Arc::new(Mutex::new(None)),
        }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Inner> {
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
    }

    fn wake_worker(&self) {
        if let Some(sender) = self.wake.lock().unwrap_or_else(|e| e.into_inner()).as_ref() {
            let _ = sender.send(());
        }
    }

    /// "Measure typing speed". Turning it off drops the burst in progress.
    pub fn set_enabled(&self, enabled: bool) {
        self.enabled.store(enabled, Ordering::SeqCst);
        if !enabled {
            self.lock().tracker.clear();
        }
    }

    pub fn enabled(&self) -> bool {
        self.enabled.load(Ordering::SeqCst)
    }

    /// One text keystroke (key listener thread). Does nothing when measuring is off.
    pub fn note_keystroke(&self, now: Instant) {
        if !self.enabled() {
            return;
        }
        let outcome = {
            let mut inner = self.lock();
            let outcome = inner.tracker.key(now);
            if let Some(burst) = outcome.finished {
                inner.file.add_burst(burst);
                inner.dirty = true;
            }
            outcome
        };
        // Only a new burst needs the worker: it then polls until the burst ends.
        if outcome.new_burst {
            self.wake_worker();
        }
    }

    /// Adds a pasted Dictate or Translate run. `text` is counted and not kept.
    pub fn record_speaking(&self, text: &str, recording_secs: f64) {
        let words = count_words(text);
        {
            let mut inner = self.lock();
            let before = inner.file.speaking.runs;
            inner.file.add_speaking(words, recording_secs);
            if inner.file.speaking.runs == before {
                return;
            }
            inner.dirty = true;
        }
        tracing::info!(
            "Speaking speed: {} words in {:.1}s added",
            words,
            recording_secs
        );
        self.wake_worker();
    }

    /// Closes an idle burst and checks the typing stretch.
    pub fn tick(&self, now: Instant) -> TickResult {
        let mut inner = self.lock();
        if let Some(burst) = inner.tracker.flush(now) {
            inner.file.add_burst(burst);
            inner.dirty = true;
        }
        let nudge_due = self.enabled()
            && !inner.file.nudge.dismissed
            && inner.tracker.stretch(now) >= NUDGE_STRETCH;
        if nudge_due {
            inner.tracker.restart_stretch();
        }
        TickResult {
            changed: std::mem::take(&mut inner.dirty),
            nudge_due,
        }
    }

    pub fn has_open_burst(&self) -> bool {
        self.lock().tracker.has_open_burst()
    }

    pub fn summary(&self) -> SpeedSummary {
        self.lock().file.summary()
    }

    pub fn file(&self) -> StatsFile {
        self.lock().file.clone()
    }

    /// "Reset speed stats".
    pub fn reset(&self) {
        let mut inner = self.lock();
        inner.file.reset_totals();
        inner.tracker.clear();
        inner.dirty = false;
    }

    /// Whether the nudge already showed on `day`, and whether it was dismissed for good.
    pub fn nudge_record(&self) -> NudgeRecord {
        self.lock().file.nudge.clone()
    }

    pub fn mark_nudge_shown(&self, day: &str) {
        self.lock().file.nudge.last_shown_day = Some(day.to_string());
    }

    /// "Don't show again".
    pub fn dismiss_nudge_forever(&self) {
        self.lock().file.nudge.dismissed = true;
    }

    /// Ends the open burst (the app quits).
    pub fn finish(&self) {
        let mut inner = self.lock();
        if let Some(burst) = inner.tracker.finish() {
            inner.file.add_burst(burst);
        }
    }

    /// Writes the totals to disk (no-op without a path).
    pub fn save(&self) {
        let Some(path) = self.path.as_deref() else {
            return;
        };
        let file = self.file();
        if let Err(error) = save_file(path, &file) {
            tracing::warn!("Could not save speed stats: {error}");
        }
    }
}

// ─── Worker thread and app glue ───

fn emit_summary(app: &tauri::AppHandle, stats: &SpeedStats) {
    use tauri::Emitter;
    let _ = app.emit(SPEED_STATS_EVENT, stats.summary());
}

/// Whether the app is busy in a way that rules out the nudge: a run, Ask, or the Copy pill.
fn app_busy(app: &tauri::AppHandle) -> bool {
    use tauri::Manager;
    let ask_busy = app
        .try_state::<crate::commands::ask::AskDictationState>()
        .is_some_and(|ask| ask.is_busy());
    let pipeline_busy = app
        .try_state::<crate::pipeline::PipelineHandle>()
        .is_some_and(|pipeline| {
            pipeline.current_state() != crate::pipeline::PipelineState::Idle
                || pipeline.has_copy_offer()
        });
    ask_busy || pipeline_busy || crate::ask_panel::is_open(app)
}

fn consider_nudge(app: &tauri::AppHandle, stats: &SpeedStats) {
    use tauri::{Emitter, Manager};
    let record = stats.nudge_record();
    let today = local_day();
    let context = NudgeContext {
        enabled: stats.enabled(),
        dismissed: record.dismissed,
        shown_today: record.last_shown_day.as_deref() == Some(today.as_str()),
        onboarding_done: app
            .try_state::<crate::shortcut_gate::ShortcutGateState>()
            .is_none_or(|gate| gate.get() == crate::shortcut_gate::ShortcutGate::All),
        busy: app_busy(app),
        typelite_focused: app
            .get_webview_window("main")
            .and_then(|window| window.is_focused().ok())
            .unwrap_or(false),
    };
    if !nudge_allowed(context) {
        tracing::debug!(?context, "typing nudge not shown");
        return;
    }
    tracing::info!("Typing nudge shown");
    stats.mark_nudge_shown(&today);
    stats.save();
    let _ = app.emit(TYPING_NUDGE_EVENT, ());
}

/// Starts the worker thread that closes bursts, saves the totals, sends [`SPEED_STATS_EVENT`]
/// and shows the nudge. It sleeps while nobody types.
pub fn start_worker(app: tauri::AppHandle, stats: SpeedStats) {
    let (sender, receiver) = mpsc::channel::<()>();
    *stats.wake.lock().unwrap_or_else(|e| e.into_inner()) = Some(sender);
    let spawned = std::thread::Builder::new()
        .name("typelite-speed-stats".to_string())
        .spawn(move || loop {
            let received = if stats.has_open_burst() {
                match receiver.recv_timeout(WORKER_POLL) {
                    Ok(()) | Err(mpsc::RecvTimeoutError::Timeout) => true,
                    Err(mpsc::RecvTimeoutError::Disconnected) => false,
                }
            } else {
                receiver.recv().is_ok()
            };
            if !received {
                break;
            }
            let result = stats.tick(Instant::now());
            if result.changed {
                stats.save();
                emit_summary(&app, &stats);
            }
            if result.nudge_due {
                consider_nudge(&app, &stats);
            }
        });
    if let Err(error) = spawned {
        tracing::warn!("Could not start the speed stats thread: {error}");
    }
}

/// The observer the key listener calls for each typed keystroke.
pub fn keystroke_observer(stats: SpeedStats) -> crate::native_hotkey::KeystrokeObserver {
    Arc::new(move || stats.note_keystroke(Instant::now()))
}

#[tauri::command]
pub fn get_speed_stats(stats: tauri::State<'_, SpeedStats>) -> SpeedSummary {
    stats.summary()
}

#[tauri::command]
pub fn reset_speed_stats(app: tauri::AppHandle, stats: tauri::State<'_, SpeedStats>) {
    stats.reset();
    stats.save();
    tracing::info!("Speed stats reset");
    emit_summary(&app, &stats);
}

/// The nudge was closed. With `forever` ("Don't show again") it never shows again.
#[tauri::command]
pub fn dismiss_typing_nudge(stats: tauri::State<'_, SpeedStats>, forever: bool) {
    if forever {
        stats.dismiss_nudge_forever();
        stats.save();
        tracing::info!("Typing nudge turned off (Don't show again)");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::native_hotkey::{MacEventKind, MacKeyEvent};

    fn key_down(keycode: u16, flags: u64) -> MacKeyEvent {
        MacKeyEvent {
            kind: MacEventKind::KeyDown,
            keycode,
            flags,
            autorepeat: false,
        }
    }

    #[test]
    fn counts_english_words_without_punctuation() {
        assert_eq!(count_words("Hello, world! This is a test."), 6);
        assert_eq!(count_words("  "), 0);
        assert_eq!(count_words(""), 0);
        assert_eq!(count_words("— … !!"), 0);
        assert_eq!(count_words("It's 3 o'clock."), 3);
    }

    #[test]
    fn segments_chinese_into_words() {
        // Nine characters; the system splits them into words, not one per character.
        let words = count_words("我今天去市場買東西");
        assert!(
            (2..=8).contains(&words),
            "expected word segmentation, got {words}"
        );
        assert_eq!(count_words("。，！"), 0);
    }

    #[test]
    fn counts_mixed_cantonese_and_english() {
        let words = count_words("我聽日要開meeting，同埋send個email俾佢。");
        let chinese_only = count_words("我聽日要開，同埋個俾佢。");
        // The English words count on top of the Chinese ones.
        assert!(words >= chinese_only + 3, "{words} vs {chinese_only}");
    }

    #[test]
    fn the_fallback_counts_words_and_each_cjk_character() {
        assert_eq!(count_words_fallback("Hello, world!"), 2);
        assert_eq!(count_words_fallback("don't stop-gap"), 2);
        assert_eq!(count_words_fallback("我去meeting"), 3);
        assert_eq!(count_words_fallback("。 ！"), 0);
    }

    #[test]
    fn only_text_keys_without_command_or_control_count() {
        // Letters, digits, punctuation and Space.
        for code in [0u16, 29, 47, 49, 10] {
            assert!(counts_as_typing(&key_down(code, 0), false), "{code}");
        }
        // Shift and Option still type text.
        assert!(counts_as_typing(&key_down(0, 0x2_0000), false));
        assert!(counts_as_typing(&key_down(0, 0x8_0000), false));
        // Command and Control make it a shortcut.
        assert!(!counts_as_typing(&key_down(9, FLAG_COMMAND), false));
        assert!(!counts_as_typing(&key_down(8, FLAG_CONTROL), false));
        // Arrows, Return, Tab, Delete, Escape, End, F-keys.
        for code in [123u16, 124, 125, 126, 36, 48, 51, 117, 53, 119, 122, 105] {
            assert!(!counts_as_typing(&key_down(code, 0), false), "{code}");
        }
    }

    #[test]
    fn repeats_key_ups_modifiers_and_swallowed_keys_do_not_count() {
        let mut repeat = key_down(0, 0);
        repeat.autorepeat = true;
        assert!(!counts_as_typing(&repeat, false));
        let mut up = key_down(0, 0);
        up.kind = MacEventKind::KeyUp;
        assert!(!counts_as_typing(&up, false));
        let flags = MacKeyEvent {
            kind: MacEventKind::FlagsChanged,
            keycode: 56,
            flags: 0x2_0002,
            autorepeat: false,
        };
        assert!(!counts_as_typing(&flags, false));
        assert!(!counts_as_typing(&key_down(0, 0), true));
    }

    /// Types `count` keys `every` apart starting at `start`; returns the time of the last key.
    fn type_keys(
        tracker: &mut TypingTracker,
        start: Instant,
        count: u32,
        every: Duration,
        finished: &mut Vec<FinishedBurst>,
    ) -> Instant {
        let mut now = start;
        for i in 0..count {
            now = start + every * i;
            finished.extend(tracker.key(now).finished);
        }
        now
    }

    #[test]
    fn a_long_gap_ends_a_burst_and_short_bursts_are_ignored() {
        let mut tracker = TypingTracker::default();
        let mut finished = Vec::new();
        let t0 = Instant::now();
        // 3 s burst: too short.
        let last = type_keys(
            &mut tracker,
            t0,
            16,
            Duration::from_millis(200),
            &mut finished,
        );
        // 10 s burst after a 3 s gap.
        let second = last + Duration::from_secs(3);
        let last = type_keys(
            &mut tracker,
            second,
            51,
            Duration::from_millis(200),
            &mut finished,
        );
        assert!(finished.is_empty(), "the short burst must not count");
        // Still open until the next gap.
        assert_eq!(tracker.flush(last + Duration::from_secs(1)), None);
        let burst = tracker.flush(last + Duration::from_secs(3)).expect("burst");
        assert_eq!(burst.keystrokes, 51);
        assert!((burst.secs - 10.0).abs() < 1e-6);
        assert!(!tracker.has_open_burst());
    }

    #[test]
    fn typing_wpm_is_keystrokes_over_five_per_active_minute() {
        let mut file = StatsFile::default();
        // 30 s of typing: not enough yet.
        file.add_burst(FinishedBurst {
            keystrokes: 150,
            secs: 30.0,
        });
        assert_eq!(file.typing_wpm(), None);
        file.add_burst(FinishedBurst {
            keystrokes: 250,
            secs: 30.0,
        });
        // 400 keystrokes = 80 words in one minute.
        assert!((file.typing_wpm().unwrap() - 80.0).abs() < 1e-9);
        assert_eq!(file.typing.bursts, 2);
    }

    #[test]
    fn speaking_wpm_is_a_running_average_and_needs_ten_seconds() {
        let mut file = StatsFile::default();
        file.add_speaking(20, 6.0);
        assert_eq!(file.speaking_wpm(), None);
        file.add_speaking(0, 4.0); // No words: ignored.
        file.add_speaking(5, 0.0); // No audio: ignored.
        assert_eq!(file.speaking.runs, 1);
        file.add_speaking(20, 6.0);
        // 40 words in 12 s = 200 WPM.
        assert!((file.speaking_wpm().unwrap() - 200.0).abs() < 1e-9);
    }

    #[test]
    fn the_summary_compares_both_speeds_only_when_both_exist() {
        let mut file = StatsFile::default();
        assert_eq!(
            file.summary(),
            SpeedSummary {
                speaking_wpm: None,
                typing_wpm: None,
                times_faster: None
            }
        );
        file.add_speaking(150, 60.0);
        assert_eq!(file.summary().times_faster, None);
        file.add_burst(FinishedBurst {
            keystrokes: 250,
            secs: 60.0,
        });
        let summary = file.summary();
        assert_eq!(summary.typing_wpm, Some(50.0));
        assert_eq!(summary.times_faster, Some(3.0));
        let json = serde_json::to_value(summary).unwrap();
        assert_eq!(json["speakingWpm"], 150.0);
        assert_eq!(json["timesFaster"], 3.0);
    }

    #[test]
    fn totals_survive_a_save_and_load_and_hold_no_text() {
        let dir = std::env::temp_dir().join(format!("typelite-speed-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(STATS_FILE);
        assert_eq!(load_file(&path), StatsFile::default());

        let stats = SpeedStats::load(Some(path.clone()));
        stats.record_speaking("secret words here", 3.0);
        stats.mark_nudge_shown("2026-09-26");
        stats.save();

        let raw = std::fs::read_to_string(&path).unwrap();
        assert!(!raw.contains("secret"), "the text must never be stored");
        let loaded = SpeedStats::load(Some(path.clone())).file();
        assert_eq!(loaded.speaking.words, 3);
        assert_eq!(loaded.speaking.runs, 1);
        assert_eq!(loaded.nudge.last_shown_day.as_deref(), Some("2026-09-26"));

        // A broken file starts from zero instead of failing.
        std::fs::write(&path, b"{not json").unwrap();
        assert_eq!(load_file(&path), StatsFile::default());
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn reset_clears_the_totals_but_keeps_the_nudge_choice() {
        let stats = SpeedStats::load(None);
        stats.record_speaking("one two three", 12.0);
        stats.dismiss_nudge_forever();
        stats.reset();
        let file = stats.file();
        assert_eq!(file.speaking, SpeakingTotals::default());
        assert!(file.nudge.dismissed);
    }

    #[test]
    fn nothing_is_counted_while_measuring_is_off() {
        let stats = SpeedStats::load(None);
        stats.set_enabled(false);
        let t0 = Instant::now();
        for i in 0..100 {
            stats.note_keystroke(t0 + Duration::from_millis(100 * i));
        }
        assert!(!stats.has_open_burst());
        assert_eq!(
            stats.tick(t0 + Duration::from_secs(30)),
            TickResult::default()
        );
        assert_eq!(stats.file().typing, TypingTotals::default());
    }

    #[test]
    fn keystrokes_are_counted_through_the_shared_state() {
        let stats = SpeedStats::load(None);
        let t0 = Instant::now();
        for i in 0..60 {
            stats.note_keystroke(t0 + Duration::from_millis(100 * i));
        }
        let result = stats.tick(t0 + Duration::from_secs(10));
        assert!(result.changed);
        assert!(!result.nudge_due);
        assert_eq!(stats.file().typing.keystrokes, 60);
    }

    #[test]
    fn a_minute_of_mostly_continuous_typing_makes_the_nudge_due_once() {
        let stats = SpeedStats::load(None);
        let t0 = Instant::now();
        // Typing with 3 s pauses every 10 s: still one stretch.
        let mut now = t0;
        let mut due = 0;
        for second in 0..70u64 {
            if second % 10 >= 7 {
                continue;
            }
            for tenth in 0..5u64 {
                now = t0 + Duration::from_millis(second * 1000 + tenth * 200);
                stats.note_keystroke(now);
            }
            if stats.tick(now).nudge_due {
                due += 1;
            }
        }
        assert_eq!(
            due, 1,
            "the stretch starts over after the nudge was considered"
        );
    }

    #[test]
    fn a_long_pause_starts_the_stretch_over() {
        let mut tracker = TypingTracker::default();
        let t0 = Instant::now();
        let mut finished = Vec::new();
        let last = type_keys(
            &mut tracker,
            t0,
            200,
            Duration::from_millis(200),
            &mut finished,
        );
        assert!(tracker.stretch(last) >= Duration::from_secs(39));
        tracker.key(last + Duration::from_secs(6));
        assert_eq!(
            tracker.stretch(last + Duration::from_secs(6)),
            Duration::ZERO
        );
        assert_eq!(
            tracker.stretch(last + Duration::from_secs(20)),
            Duration::ZERO
        );
    }

    #[test]
    fn no_nudge_after_dont_show_again_or_when_off() {
        let t0 = Instant::now();
        for setup in [
            |stats: &SpeedStats| stats.dismiss_nudge_forever(),
            |stats: &SpeedStats| stats.set_enabled(false),
        ] {
            let stats = SpeedStats::load(None);
            setup(&stats);
            let mut now = t0;
            for i in 0..400u64 {
                now = t0 + Duration::from_millis(200 * i);
                stats.note_keystroke(now);
            }
            assert!(!stats.tick(now).nudge_due);
        }
    }

    fn ready() -> NudgeContext {
        NudgeContext {
            enabled: true,
            dismissed: false,
            shown_today: false,
            onboarding_done: true,
            busy: false,
            typelite_focused: false,
        }
    }

    #[test]
    fn nudge_rules() {
        assert!(nudge_allowed(ready()));
        let refused = [
            NudgeContext {
                enabled: false,
                ..ready()
            },
            NudgeContext {
                dismissed: true,
                ..ready()
            },
            NudgeContext {
                shown_today: true,
                ..ready()
            },
            NudgeContext {
                onboarding_done: false,
                ..ready()
            },
            NudgeContext {
                busy: true,
                ..ready()
            },
            NudgeContext {
                typelite_focused: true,
                ..ready()
            },
        ];
        for context in refused {
            assert!(!nudge_allowed(context), "{context:?}");
        }
    }

    #[test]
    fn the_nudge_shows_at_most_once_per_day() {
        let stats = SpeedStats::load(None);
        let today = local_day();
        let shown_today = |stats: &SpeedStats| {
            stats.nudge_record().last_shown_day.as_deref() == Some(today.as_str())
        };
        assert!(!shown_today(&stats));
        stats.mark_nudge_shown(&today);
        assert!(shown_today(&stats));
        assert!(!nudge_allowed(NudgeContext {
            shown_today: shown_today(&stats),
            ..ready()
        }));
        stats.mark_nudge_shown("2000-01-01");
        assert!(!shown_today(&stats));
        assert_eq!(today.len(), 10);
    }
}
