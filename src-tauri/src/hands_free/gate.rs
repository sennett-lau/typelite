//! Plan `hands-free-mode` (listening.md): Typelite's own voice-activity gate.
//!
//! A streaming version of the voice check in `stt/silence.rs`, so nothing heavier than a few
//! additions per 20 ms runs while the room is quiet. Each 20 ms frame is voiced when it is
//! louder than [`ABSOLUTE_FLOOR_DB`] and [`ABOVE_NOISE_DB`] above the tracked noise floor (the
//! same numbers as the voice check). The noise floor follows quiet frames down at once and drifts
//! up slowly, so a fan or air conditioner raises it within seconds while speech does not.
//!
//! Speech starts after [`START_VOICED_FRAMES`] voiced frames out of the last
//! [`START_WINDOW_FRAMES`] (a key click is one or two frames) and ends after a configurable
//! stretch of unvoiced frames (the hangover).

use crate::stt::silence::{ABOVE_NOISE_DB, ABSOLUTE_FLOOR_DB, WINDOW_MS};

/// Samples in one frame at 16 kHz.
pub const FRAME_SAMPLES: usize = 16_000 * WINDOW_MS as usize / 1000;
/// Speech starts when this many of the last [`START_WINDOW_FRAMES`] frames are voiced.
pub const START_VOICED_FRAMES: usize = 3;
pub const START_WINDOW_FRAMES: usize = 5;
/// How far the noise floor rises per unvoiced frame towards a louder level (dB per frame):
/// about 5 dB per second (half that during voiced frames), so it settles on a new steady noise
/// within a few seconds. Pauses between words pull it back down at once.
const FLOOR_RISE_DB_PER_FRAME: f64 = 0.1;
/// Lowest noise floor tracked; digital silence would otherwise pin it at -100 dB.
const FLOOR_MIN_DB: f64 = -90.0;
const SILENT_FRAME_DB: f64 = -100.0;

/// What a frame changed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GateEvent {
    /// Nothing changed.
    None,
    /// Speech started; `frames_ago` frames back (the first voiced frame of the start window).
    SpeechStarted { frames_ago: usize },
    /// Speech ended after the hangover; `voiced_ms` voiced audio in the stretch.
    SpeechEnded { voiced_ms: u32 },
}

/// The streaming voice gate.
#[derive(Debug, Clone)]
pub struct VoiceGate {
    hangover_frames: usize,
    noise_floor_db: Option<f64>,
    /// Voiced flags of the last [`START_WINDOW_FRAMES`] frames, newest last.
    recent: Vec<bool>,
    in_speech: bool,
    silent_frames: usize,
    voiced_frames: usize,
}

impl VoiceGate {
    /// A gate whose speech ends after `hangover_ms` without voice.
    pub fn new(hangover_ms: u32) -> Self {
        Self {
            hangover_frames: (hangover_ms / WINDOW_MS).max(1) as usize,
            noise_floor_db: None,
            recent: Vec::with_capacity(START_WINDOW_FRAMES),
            in_speech: false,
            silent_frames: 0,
            voiced_frames: 0,
        }
    }

    pub fn in_speech(&self) -> bool {
        self.in_speech
    }

    pub fn noise_floor_db(&self) -> Option<f64> {
        self.noise_floor_db
    }

    /// Voiced audio since speech started.
    pub fn voiced_ms(&self) -> u32 {
        self.voiced_frames as u32 * WINDOW_MS
    }

    /// Back to "no speech", keeping the learned noise floor.
    pub fn reset(&mut self) {
        self.recent.clear();
        self.in_speech = false;
        self.silent_frames = 0;
        self.voiced_frames = 0;
    }

    /// Feeds one frame (normally [`FRAME_SAMPLES`] samples).
    pub fn push_frame(&mut self, frame: &[i16]) -> GateEvent {
        let level = frame_level_db(frame);
        let floor = *self.noise_floor_db.get_or_insert(level.max(FLOOR_MIN_DB));
        let voiced = level >= ABSOLUTE_FLOOR_DB.max(floor + ABOVE_NOISE_DB);
        // Down at once on a quieter frame; up slowly otherwise, also while voiced (more
        // slowly), so a steady new noise such as a fan stops counting as speech after a few
        // seconds instead of holding the gate open.
        let next = if level < floor {
            level
        } else if voiced {
            floor + FLOOR_RISE_DB_PER_FRAME / 2.0
        } else {
            (floor + FLOOR_RISE_DB_PER_FRAME).min(level)
        };
        self.noise_floor_db = Some(next.max(FLOOR_MIN_DB));

        if self.recent.len() == START_WINDOW_FRAMES {
            self.recent.remove(0);
        }
        self.recent.push(voiced);

        if self.in_speech {
            if voiced {
                self.voiced_frames += 1;
                self.silent_frames = 0;
            } else {
                self.silent_frames += 1;
                if self.silent_frames >= self.hangover_frames {
                    let voiced_ms = self.voiced_ms();
                    self.reset();
                    return GateEvent::SpeechEnded { voiced_ms };
                }
            }
            return GateEvent::None;
        }

        let voiced_recent = self.recent.iter().filter(|&&v| v).count();
        if voiced_recent >= START_VOICED_FRAMES {
            let first = self.recent.iter().position(|&v| v).unwrap_or(0);
            let frames_ago = self.recent.len() - first;
            self.in_speech = true;
            self.silent_frames = 0;
            self.voiced_frames = voiced_recent;
            return GateEvent::SpeechStarted { frames_ago };
        }
        GateEvent::None
    }
}

/// RMS level of one frame in dBFS.
pub fn frame_level_db(frame: &[i16]) -> f64 {
    if frame.is_empty() {
        return SILENT_FRAME_DB;
    }
    let sum: f64 = frame
        .iter()
        .map(|&sample| {
            let value = f64::from(sample) / 32768.0;
            value * value
        })
        .sum();
    let rms = (sum / frame.len() as f64).sqrt();
    if rms <= 0.0 {
        SILENT_FRAME_DB
    } else {
        (20.0 * rms.log10()).max(SILENT_FRAME_DB)
    }
}

/// Test and benchmark helpers: synthetic frames at a given level.
pub mod synth {
    use super::FRAME_SAMPLES;

    /// A 200 Hz tone frame whose RMS level is about `db` dBFS.
    pub fn tone_frame(db: f64, phase: &mut f64) -> Vec<i16> {
        let amplitude = 10f64.powf(db / 20.0) * std::f64::consts::SQRT_2 * 32767.0;
        (0..FRAME_SAMPLES)
            .map(|_| {
                *phase += 2.0 * std::f64::consts::PI * 200.0 / 16_000.0;
                (amplitude * phase.sin()).round() as i16
            })
            .collect()
    }

    /// Deterministic noise frame at about `db` dBFS.
    pub fn noise_frame(db: f64, seed: &mut u32) -> Vec<i16> {
        // Uniform noise in [-a, a] has RMS a / sqrt(3).
        let amplitude = 10f64.powf(db / 20.0) * 3f64.sqrt() * 32767.0;
        (0..FRAME_SAMPLES)
            .map(|_| {
                *seed = seed.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
                let unit = f64::from(*seed >> 8) / f64::from(1u32 << 24) * 2.0 - 1.0;
                (amplitude * unit).round() as i16
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::synth::*;
    use super::*;

    fn feed(gate: &mut VoiceGate, frames: &[Vec<i16>]) -> Vec<GateEvent> {
        frames
            .iter()
            .map(|frame| gate.push_frame(frame))
            .filter(|event| *event != GateEvent::None)
            .collect()
    }

    #[test]
    fn frame_level_of_a_known_tone() {
        let mut phase = 0.0;
        let level = frame_level_db(&tone_frame(-20.0, &mut phase));
        assert!((level + 20.0).abs() < 0.5, "{level}");
        assert_eq!(frame_level_db(&[0; FRAME_SAMPLES]), -100.0);
    }

    #[test]
    fn silence_and_room_noise_never_start_speech() {
        let mut gate = VoiceGate::new(300);
        let mut seed = 1;
        let frames: Vec<_> = (0..500).map(|_| noise_frame(-60.0, &mut seed)).collect();
        assert!(feed(&mut gate, &frames).is_empty());
        let silence = vec![vec![0i16; FRAME_SAMPLES]; 100];
        assert!(feed(&mut gate, &silence).is_empty());
    }

    #[test]
    fn a_click_is_too_short_to_start_speech() {
        let mut gate = VoiceGate::new(300);
        let mut seed = 1;
        let mut phase = 0.0;
        let mut frames: Vec<_> = (0..50).map(|_| noise_frame(-65.0, &mut seed)).collect();
        frames.push(tone_frame(-10.0, &mut phase));
        frames.push(tone_frame(-10.0, &mut phase));
        frames.extend((0..50).map(|_| noise_frame(-65.0, &mut seed)));
        assert!(feed(&mut gate, &frames).is_empty());
    }

    #[test]
    fn speech_starts_and_ends_after_the_hangover() {
        let mut gate = VoiceGate::new(300);
        let mut seed = 7;
        let mut phase = 0.0;
        let mut events = Vec::new();
        for _ in 0..50 {
            events.push(gate.push_frame(&noise_frame(-65.0, &mut seed)));
        }
        // 600 ms of voice.
        for _ in 0..30 {
            events.push(gate.push_frame(&tone_frame(-25.0, &mut phase)));
        }
        let started = events
            .iter()
            .position(|event| matches!(event, GateEvent::SpeechStarted { .. }))
            .expect("speech started");
        assert_eq!(started, 50 + START_VOICED_FRAMES - 1);
        assert!(gate.in_speech());
        // 280 ms of quiet keeps speech going, 300 ms ends it.
        for _ in 0..14 {
            assert_eq!(
                gate.push_frame(&noise_frame(-65.0, &mut seed)),
                GateEvent::None
            );
        }
        assert_eq!(
            gate.push_frame(&noise_frame(-65.0, &mut seed)),
            GateEvent::SpeechEnded { voiced_ms: 600 }
        );
        assert!(!gate.in_speech());
    }

    #[test]
    fn noise_floor_rises_with_steady_noise_so_a_fan_is_not_speech() {
        let mut gate = VoiceGate::new(300);
        let mut seed = 3;
        // Quiet room, then a fan at -40 dB (above the absolute floor) for 10 s.
        for _ in 0..50 {
            gate.push_frame(&noise_frame(-70.0, &mut seed));
        }
        let fan: Vec<_> = (0..500).map(|_| noise_frame(-40.0, &mut seed)).collect();
        let events = feed(&mut gate, &fan);
        // The fan may look like speech at first, but the gate settles: the last 5 s are quiet.
        let tail = feed(&mut gate, &fan[..250]);
        assert!(tail.is_empty(), "{events:?} then {tail:?}");
        assert!(gate.noise_floor_db().unwrap() > -45.0);
    }
}
