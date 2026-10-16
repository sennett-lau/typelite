//! Plan `hands-free-mode` (listening.md): the short audio history the listener keeps in memory.
//!
//! A fixed-size ring of 16 kHz mono samples. Positions are absolute sample counts since the
//! listener started, so the voice gate can say "speech started at sample N" and the wake check
//! can take the audio from there, as long as it is still inside the ring. Nothing here is ever
//! written to disk or logged.

/// A ring buffer of the most recent samples.
pub struct SampleRing {
    buffer: Vec<i16>,
    /// Total samples ever pushed; the next sample's absolute position.
    written: u64,
}

impl SampleRing {
    /// A ring that holds `capacity` samples (at least one).
    pub fn new(capacity: usize) -> Self {
        Self {
            buffer: vec![0; capacity.max(1)],
            written: 0,
        }
    }

    pub fn capacity(&self) -> usize {
        self.buffer.len()
    }

    /// Absolute position of the next sample (the number of samples pushed so far).
    pub fn position(&self) -> u64 {
        self.written
    }

    /// Absolute position of the oldest sample still held.
    pub fn oldest(&self) -> u64 {
        self.written.saturating_sub(self.buffer.len() as u64)
    }

    pub fn push(&mut self, samples: &[i16]) {
        let capacity = self.buffer.len();
        // Only the last `capacity` samples of a long push can survive.
        let skip = samples.len().saturating_sub(capacity);
        self.written += skip as u64;
        for &sample in &samples[skip..] {
            let index = (self.written % capacity as u64) as usize;
            self.buffer[index] = sample;
            self.written += 1;
        }
    }

    /// The samples from absolute position `from` (clamped to the oldest held) up to `to`
    /// (clamped to the newest), in order.
    pub fn range(&self, from: u64, to: u64) -> Vec<i16> {
        let from = from.max(self.oldest());
        let to = to.min(self.written);
        let capacity = self.buffer.len() as u64;
        (from..to)
            .map(|position| self.buffer[(position % capacity) as usize])
            .collect()
    }

    /// Forgets everything (used when the listener pauses, so old audio is never checked later).
    pub fn clear(&mut self) {
        self.buffer.iter_mut().for_each(|sample| *sample = 0);
        self.written = 0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_only_the_last_capacity_samples_in_order() {
        let mut ring = SampleRing::new(4);
        ring.push(&[1, 2, 3]);
        assert_eq!(ring.range(0, 3), vec![1, 2, 3]);
        ring.push(&[4, 5, 6]);
        assert_eq!(ring.position(), 6);
        assert_eq!(ring.oldest(), 2);
        // Positions before the oldest are clamped away.
        assert_eq!(ring.range(0, 6), vec![3, 4, 5, 6]);
        assert_eq!(ring.range(3, 5), vec![4, 5]);
        // Positions past the newest are clamped too.
        assert_eq!(ring.range(5, 100), vec![6]);
    }

    #[test]
    fn a_push_longer_than_the_ring_keeps_its_tail() {
        let mut ring = SampleRing::new(3);
        ring.push(&[1, 2, 3, 4, 5, 6, 7]);
        assert_eq!(ring.position(), 7);
        assert_eq!(ring.range(0, 7), vec![5, 6, 7]);
    }

    #[test]
    fn clear_forgets_old_audio() {
        let mut ring = SampleRing::new(3);
        ring.push(&[1, 2, 3]);
        ring.clear();
        assert_eq!(ring.position(), 0);
        assert!(ring.range(0, 10).is_empty());
        assert_eq!(ring.capacity(), 3);
    }
}
