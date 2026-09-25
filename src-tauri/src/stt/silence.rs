//! The voice check shared by every speech provider.
//!
//! Whisper invents text ("Thank you.") for audio without speech, so a recording that does not
//! contain enough voice is never transcribed, whether it would be uploaded to a server or run
//! on this Mac.
//!
//! A single loud moment is not enough: the shortcut key's click, a bump on the desk or a USB
//! microphone's switch-on pop is loud for less than 100 ms. The check therefore:
//!
//! 1. ignores the first and last [`EDGE_IGNORE_MS`] (the key press and release clicks);
//! 2. measures the level of every [`WINDOW_MS`] window and takes the quiet end of them
//!    ([`NOISE_PERCENTILE`]) as the room's noise floor;
//! 3. counts a window as voiced when it is louder than [`ABSOLUTE_FLOOR_DB`] and at least
//!    [`ABOVE_NOISE_DB`] above the noise floor;
//! 4. needs at least [`MIN_VOICED_MS`] of voiced windows. That is more than two clicks can
//!    give, and less than one short word ("yes", "OK").

/// Length of one measuring window.
pub const WINDOW_MS: u32 = 20;
/// Ignored at the start and end of a recording: the shortcut key's press and release clicks.
pub const EDGE_IGNORE_MS: u32 = 80;
/// A voiced window must be louder than this, whatever the room noise.
pub const ABSOLUTE_FLOOR_DB: f64 = -45.0;
/// A voiced window must be this much louder than the noise floor.
pub const ABOVE_NOISE_DB: f64 = 12.0;
/// The noise floor is the level that this share of the windows stays below.
pub const NOISE_PERCENTILE: f64 = 0.10;
/// A recording needs this much voiced audio to count as speech. Measured: a key click gives
/// 20 ms, a mic bump 100 ms; "Yes." spoken 20 dB quieter than normal gives 300 ms.
pub const MIN_VOICED_MS: u32 = 200;
/// Level given to a window of digital silence, so the maths stays finite.
const SILENT_WINDOW_DB: f64 = -100.0;

/// The numbers the voice check measured. Safe to log: it holds levels, not audio or text.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct VoiceActivity {
    /// Length of the whole recording.
    pub duration_ms: u32,
    /// Loudest window, edges excluded (dBFS).
    pub peak_db: f64,
    /// Quiet end of the windows, edges excluded (dBFS).
    pub noise_floor_db: f64,
    /// Total length of the voiced windows.
    pub voiced_ms: u32,
}

impl VoiceActivity {
    /// Measures 16-bit little-endian mono PCM.
    pub fn measure(pcm: &[u8], sample_rate: u32) -> Self {
        let rate = sample_rate.max(1) as usize;
        let samples: Vec<f64> = pcm
            .chunks_exact(2)
            .map(|b| f64::from(i16::from_le_bytes([b[0], b[1]])) / 32768.0)
            .collect();
        let duration_ms = (samples.len() * 1000 / rate) as u32;
        let window = (rate * WINDOW_MS as usize / 1000).max(1);
        let edge = rate * EDGE_IGNORE_MS as usize / 1000;
        let inner = if samples.len() > 2 * edge {
            &samples[edge..samples.len() - edge]
        } else {
            &[][..]
        };
        let mut levels: Vec<f64> = inner.chunks_exact(window).map(window_level_db).collect();
        if levels.is_empty() {
            return Self {
                duration_ms,
                peak_db: SILENT_WINDOW_DB,
                noise_floor_db: SILENT_WINDOW_DB,
                voiced_ms: 0,
            };
        }
        let peak_db = levels.iter().copied().fold(SILENT_WINDOW_DB, f64::max);
        let voiced_windows = |noise_floor_db: f64, levels: &[f64]| {
            let threshold = ABSOLUTE_FLOOR_DB.max(noise_floor_db + ABOVE_NOISE_DB);
            levels.iter().filter(|&&db| db >= threshold).count()
        };
        let original = levels.clone();
        levels.sort_by(f64::total_cmp);
        let index = ((levels.len() as f64 * NOISE_PERCENTILE) as usize).min(levels.len() - 1);
        let noise_floor_db = levels[index];
        Self {
            duration_ms,
            peak_db,
            noise_floor_db,
            voiced_ms: (voiced_windows(noise_floor_db, &original) as u32) * WINDOW_MS,
        }
    }

    /// True when the recording holds enough voice to be worth transcribing.
    pub fn has_speech(&self) -> bool {
        self.voiced_ms >= MIN_VOICED_MS
    }
}

/// RMS level of one window in dBFS.
fn window_level_db(window: &[f64]) -> f64 {
    let rms = (window.iter().map(|s| s * s).sum::<f64>() / window.len() as f64).sqrt();
    if rms <= 0.0 {
        SILENT_WINDOW_DB
    } else {
        (20.0 * rms.log10()).max(SILENT_WINDOW_DB)
    }
}

/// Which check decided that a recording held no speech.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NoSpeechGuard {
    /// Not enough voiced audio ([`VoiceActivity::has_speech`]); nothing was transcribed.
    VoiceCheck,
    /// The built-in model marked every segment as probably not speech.
    WhisperNoSpeech,
}

impl NoSpeechGuard {
    fn label(self) -> &'static str {
        match self {
            Self::VoiceCheck => "voice check",
            Self::WhisperNoSpeech => "whisper no-speech",
        }
    }
}

/// Logs the voice check's numbers and the decision. Never logs the transcript.
pub fn log_decision(provider: &str, activity: &VoiceActivity, guard: Option<NoSpeechGuard>) {
    let decision = match guard {
        Some(guard) => format!("no speech ({})", guard.label()),
        None => "speech".to_string(),
    };
    tracing::info!(
        "{provider}: speech check: {:.1} s, peak {:.0} dBFS, noise floor {:.0} dBFS, voiced {} ms: {decision}",
        f64::from(activity.duration_ms) / 1000.0,
        activity.peak_db,
        activity.noise_floor_db,
        activity.voiced_ms,
    );
}

/// A 440 Hz tone as 16-bit little-endian PCM. Used by tests and by the built-in model's
/// automatic check after setup.
pub fn pcm_tone(amplitude: f64, seconds: f64, sample_rate: u32) -> Vec<u8> {
    (0..(seconds * sample_rate as f64) as usize)
        .flat_map(|n| {
            let v =
                amplitude * (n as f64 * 440.0 * std::f64::consts::TAU / sample_rate as f64).sin();
            ((v * 32767.0) as i16).to_le_bytes()
        })
        .collect()
}

#[cfg(test)]
pub(crate) mod test_audio {
    //! Synthetic recordings for the voice check tests.

    pub const RATE: u32 = 16_000;

    /// Deterministic white noise with the given RMS level in dBFS.
    pub fn hiss(level_db: f64, seconds: f64) -> Vec<f64> {
        let amplitude = 10f64.powf(level_db / 20.0) * 3f64.sqrt(); // uniform noise: rms = a/√3
        let mut state: u32 = 0x1234_5678;
        (0..(seconds * f64::from(RATE)) as usize)
            .map(|_| {
                state = state.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
                (f64::from(state >> 8) / f64::from(1u32 << 24) * 2.0 - 1.0) * amplitude
            })
            .collect()
    }

    /// Adds a key click at `at_ms`: 5 ms of full-scale noise that dies away over ~15 ms.
    pub fn add_click(samples: &mut [f64], at_ms: u32) {
        let start = (at_ms * RATE / 1000) as usize;
        let noise = hiss(-3.0, 0.03);
        for (i, n) in noise.iter().enumerate() {
            let decay = (-(i as f64) / (0.004 * f64::from(RATE))).exp();
            if let Some(s) = samples.get_mut(start + i) {
                *s = (*s + n * decay).clamp(-1.0, 1.0);
            }
        }
    }

    /// Adds a mic bump at `at_ms`: an 80 Hz thump that dies away over ~40 ms.
    pub fn add_bump(samples: &mut [f64], at_ms: u32) {
        let start = (at_ms * RATE / 1000) as usize;
        for i in 0..(RATE as usize / 10) {
            let t = i as f64 / f64::from(RATE);
            let v = 0.8 * (t * 80.0 * std::f64::consts::TAU).sin() * (-t / 0.02).exp();
            if let Some(s) = samples.get_mut(start + i) {
                *s = (*s + v).clamp(-1.0, 1.0);
            }
        }
    }

    pub fn to_pcm(samples: &[f64]) -> Vec<u8> {
        samples
            .iter()
            .flat_map(|s| ((s.clamp(-1.0, 1.0) * 32767.0) as i16).to_le_bytes())
            .collect()
    }

    pub fn from_pcm(pcm: &[u8]) -> Vec<f64> {
        pcm.chunks_exact(2)
            .map(|b| f64::from(i16::from_le_bytes([b[0], b[1]])) / 32768.0)
            .collect()
    }

    /// Speaks `text` with macOS `say` as 16 kHz mono. `None` where `say` is not available.
    pub fn say(text: &str) -> Option<Vec<f64>> {
        let say = std::path::Path::new("/usr/bin/say");
        if !say.exists() {
            return None;
        }
        let path = std::env::temp_dir().join(format!(
            "typelite-voice-{}-{}.wav",
            std::process::id(),
            text.len()
        ));
        let ok = std::process::Command::new(say)
            .arg("-o")
            .arg(&path)
            .args(["--data-format=LEI16@16000", text])
            .status()
            .ok()?
            .success();
        let wav = std::fs::read(&path).ok();
        let _ = std::fs::remove_file(&path);
        if !ok {
            return None;
        }
        let wav = wav?;
        let mut i = 12;
        while i + 8 <= wav.len() {
            let size = u32::from_le_bytes(wav[i + 4..i + 8].try_into().ok()?) as usize;
            if &wav[i..i + 4] == b"data" {
                return Some(from_pcm(&wav[i + 8..(i + 8 + size).min(wav.len())]));
            }
            i += 8 + size + (size & 1);
        }
        None
    }

    /// `speech` with half a second of `room` noise before and after, as a recording is.
    pub fn in_room(speech: &[f64], room_db: f64) -> Vec<f64> {
        let mut out = hiss(room_db, 0.5);
        let noise = hiss(room_db, speech.len() as f64 / f64::from(RATE));
        out.extend(speech.iter().zip(noise).map(|(s, n)| s + n));
        out.extend(hiss(room_db, 0.5));
        out
    }

    pub fn scaled(samples: &[f64], db: f64) -> Vec<f64> {
        let gain = 10f64.powf(db / 20.0);
        samples.iter().map(|s| s * gain).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::test_audio::*;
    use super::*;

    fn check(name: &str, samples: &[f64]) -> VoiceActivity {
        let activity = VoiceActivity::measure(&to_pcm(samples), RATE);
        println!(
            "{name}: {} ms, peak {:.1} dBFS, noise floor {:.1} dBFS, voiced {} ms",
            activity.duration_ms, activity.peak_db, activity.noise_floor_db, activity.voiced_ms
        );
        activity
    }

    #[test]
    fn pure_silence_has_no_speech() {
        let activity = VoiceActivity::measure(&[0u8; 32_000], RATE);
        assert_eq!(activity.voiced_ms, 0);
        assert_eq!(activity.duration_ms, 1000);
        assert!(!activity.has_speech());
    }

    #[test]
    fn empty_and_tiny_recordings_have_no_speech() {
        assert!(!VoiceActivity::measure(&[], RATE).has_speech());
        let tiny = to_pcm(&hiss(-10.0, 0.15));
        assert!(!VoiceActivity::measure(&tiny, RATE).has_speech());
    }

    #[test]
    fn room_hiss_has_no_speech() {
        assert!(!check("quiet hiss", &hiss(-60.0, 2.0)).has_speech());
        // A loud fan is above the absolute floor but never above its own noise floor.
        assert!(!check("loud hiss", &hiss(-35.0, 2.0)).has_speech());
    }

    #[test]
    fn a_single_click_has_no_speech() {
        let mut audio = hiss(-60.0, 0.7);
        add_click(&mut audio, 300);
        let activity = check("one click", &audio);
        assert!(activity.peak_db > -20.0, "the click is loud");
        assert!(!activity.has_speech());
    }

    #[test]
    fn two_clicks_have_no_speech() {
        let mut audio = hiss(-60.0, 1.5);
        add_click(&mut audio, 300);
        add_click(&mut audio, 1000);
        assert!(!check("two clicks", &audio).has_speech());
    }

    #[test]
    fn a_mic_bump_has_no_speech() {
        let mut audio = hiss(-60.0, 1.0);
        add_bump(&mut audio, 400);
        assert!(!check("mic bump", &audio).has_speech());
    }

    #[test]
    fn clicks_at_the_start_and_end_are_ignored() {
        let mut audio = hiss(-60.0, 0.7);
        add_click(&mut audio, 10);
        add_click(&mut audio, 660);
        let activity = check("edge clicks", &audio);
        assert!(activity.peak_db < -50.0, "edge clicks are not measured");
        assert!(!activity.has_speech());
    }

    #[test]
    fn a_steady_tone_counts_as_voice_above_a_quiet_room() {
        let mut audio = hiss(-60.0, 0.5);
        audio.extend(from_pcm(&pcm_tone(0.03, 1.0, RATE)));
        audio.extend(hiss(-60.0, 0.5));
        assert!(check("tone", &audio).has_speech());
    }

    #[test]
    fn spoken_words_pass_at_normal_and_low_volume() {
        let cases = [
            "Let's meet on Tuesday at three.",
            "Thank you.",
            "Yes.",
            "OK.",
        ];
        for text in cases {
            let Some(speech) = say(text) else {
                println!("`say` is not available; skipping");
                return;
            };
            let normal = check(&format!("say {text:?}"), &in_room(&speech, -60.0));
            assert!(normal.has_speech(), "{text:?} at normal volume");
            let quiet = check(
                &format!("say {text:?} -20 dB"),
                &in_room(&scaled(&speech, -20.0), -60.0),
            );
            assert!(quiet.has_speech(), "{text:?} 20 dB quieter");
            let fan = check(
                &format!("say {text:?} over a fan"),
                &in_room(&speech, -45.0),
            );
            assert!(fan.has_speech(), "{text:?} over a -45 dB fan");
        }
    }

    #[test]
    fn continuous_speech_without_pauses_passes() {
        let Some(speech) =
            say("Please send the quarterly report to the whole team before Friday afternoon.")
        else {
            return;
        };
        // No room noise around it: the whole recording is speech.
        assert!(check("speech only", &speech).has_speech());
    }
}
