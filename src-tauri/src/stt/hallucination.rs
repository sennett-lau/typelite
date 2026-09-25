//! The hallucination guard shared by every speech provider.
//!
//! Given a short burst of noise that got past the voice check, Whisper tends to answer with a
//! phrase it saw often in its training data (video subtitles): "Thank you.", "Thanks for
//! watching!", "谢谢观看", a subtitle credit line. When the voiced audio is short and the whole
//! transcript is one of those phrases, the recording is treated as having no speech.
//!
//! The list is small on purpose: every entry is a phrase a person could also really say, so it
//! only applies below [`MAX_VOICED_MS`]. Longer speech is always kept.

/// Transcripts of recordings with less voiced audio than this are checked.
pub const MAX_VOICED_MS: u32 = 1500;

/// Known Whisper hallucinations, in normalised form (see [`normalise`]): lower case, letters
/// and digits only.
const KNOWN_HALLUCINATIONS: &[&str] = &[
    // English
    "thankyou",
    "thankyouverymuch",
    "thanks",
    "thanksforwatching",
    "thankyouforwatching",
    "thankyousomuchforwatching",
    "you",
    "bye",
    "byebye",
    // Chinese (simplified and traditional)
    "谢谢",
    "謝謝",
    "谢谢观看",
    "謝謝觀看",
    "谢谢大家",
    "字幕由amaraorg社区提供",
    "请不吝点赞订阅转发打赏支持明镜与点点栏目",
    "請不吝點贊訂閱轉發打賞支持明鏡與點點欄目",
    // Japanese
    "ご視聴ありがとうございました",
];

/// Lower case with everything but letters and digits removed, so "Thank you." and
/// " thank  you!" compare equal.
pub fn normalise(text: &str) -> String {
    text.chars()
        .filter(|c| c.is_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

/// True when `text` is probably invented: the voiced audio was short and the whole transcript
/// is a known hallucination.
pub fn is_likely_hallucination(text: &str, voiced_ms: u32) -> bool {
    voiced_ms < MAX_VOICED_MS && KNOWN_HALLUCINATIONS.contains(&normalise(text).as_str())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_list_is_stored_normalised() {
        for phrase in KNOWN_HALLUCINATIONS {
            assert_eq!(&normalise(phrase), phrase);
        }
    }

    #[test]
    fn known_phrases_from_short_audio_are_dropped() {
        for text in [
            "Thank you.",
            " thank you!",
            "Thanks for watching!",
            "Thank you for watching.",
            "you",
            "Bye.",
            "谢谢",
            "謝謝。",
            "谢谢观看！",
            "字幕由Amara.org社区提供",
            "請不吝點贊訂閱轉發打賞支持明鏡與點點欄目",
            "ご視聴ありがとうございました",
        ] {
            assert!(is_likely_hallucination(text, 300), "{text:?}");
        }
    }

    #[test]
    fn long_speech_is_kept_even_when_it_is_a_known_phrase() {
        assert!(!is_likely_hallucination("Thank you.", MAX_VOICED_MS));
        assert!(!is_likely_hallucination("谢谢", 4000));
    }

    #[test]
    fn real_short_dictation_is_kept() {
        for text in [
            "Thank you, John.",
            "Yes.",
            "OK",
            "See you tomorrow.",
            "谢谢你",
            "好的",
        ] {
            assert!(!is_likely_hallucination(text, 300), "{text:?}");
        }
    }
}
