//! The silence gate shared by every speech provider.
//!
//! Whisper invents text ("Thank you.") for silent audio, so a recording whose loudest 50 ms
//! window stays below [`SILENCE_THRESHOLD_DB`] is never transcribed, whether it would be
//! uploaded to a server or run on this Mac.

/// Recordings whose loudest 50 ms window stays below this level are treated as silence.
pub const SILENCE_THRESHOLD_DB: f64 = -45.0;

/// Loudest RMS level of any 50 ms window of 16-bit little-endian PCM, in dBFS.
pub fn peak_window_level_db(pcm: &[u8], sample_rate: u32) -> f64 {
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
mod tests {
    use super::*;

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
}
