//! Clean-up applied to every transcript, whichever speech engine produced it.

/// Whisper returns its transcript as segments separated by line breaks, which are pauses, not
/// paragraphs. Join them into one line so they are never pasted as random line breaks; the AI
/// polish step adds structure where it belongs.
pub fn normalize_transcript(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for piece in text.split_whitespace() {
        let joins_without_space = match (out.chars().last(), piece.chars().next()) {
            (Some(prev), Some(next)) => is_cjk(prev) && is_cjk(next),
            _ => true,
        };
        if !out.is_empty() && !joins_without_space {
            out.push(' ');
        }
        out.push_str(piece);
    }
    out
}

/// Plan `qwen3-asr-support`: Qwen3-ASR servers (llama.cpp's `llama-server`, vLLM) start every
/// transcript with the language they heard, as `language Cantonese<asr_text>…`. Returns the text
/// after the tag and the language name in it; text without the tag comes back unchanged.
pub fn split_language_tag(text: &str) -> (&str, Option<&str>) {
    const MARKER: &str = "<asr_text>";
    let trimmed = text.trim_start();
    let Some(rest) = trimmed.strip_prefix("language") else {
        return (text, None);
    };
    let Some(end) = rest.find(MARKER) else {
        return (text, None);
    };
    let name = rest[..end].trim();
    if name.is_empty() || name.len() > 40 || !name.chars().all(|c| c.is_ascii_alphabetic()) {
        return (text, None);
    }
    (&rest[end + MARKER.len()..], Some(name))
}

/// Chinese, Japanese and Korean characters and their punctuation, which are written without
/// spaces between them.
fn is_cjk(c: char) -> bool {
    matches!(c as u32,
        0x3000..=0x303F     // CJK punctuation
        | 0x3040..=0x30FF   // Hiragana, Katakana
        | 0x3400..=0x4DBF   // CJK Extension A
        | 0x4E00..=0x9FFF   // CJK Unified Ideographs
        | 0xAC00..=0xD7AF   // Hangul
        | 0xF900..=0xFAFF   // CJK Compatibility Ideographs
        | 0xFF00..=0xFFEF) // Full-width forms
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn transcript_segments_are_joined_into_one_line() {
        assert_eq!(
            normalize_transcript(" Um, so let's meet on Monday.\n No wait, Tuesday at 3pm.\n"),
            "Um, so let's meet on Monday. No wait, Tuesday at 3pm."
        );
        assert_eq!(
            normalize_transcript("我们明天\n下午三点开会。"),
            "我们明天下午三点开会。"
        );
        assert_eq!(
            normalize_transcript("开会 at 3pm\n好的"),
            "开会 at 3pm 好的"
        );
    }

    #[test]
    fn qwen3_asr_language_tag_is_split_off() {
        assert_eq!(
            split_language_tag("language Cantonese<asr_text>我哋听日开会"),
            ("我哋听日开会", Some("Cantonese"))
        );
        assert_eq!(
            split_language_tag(" language English<asr_text>Hello there."),
            ("Hello there.", Some("English"))
        );
        assert_eq!(
            split_language_tag("language None<asr_text>"),
            ("", Some("None"))
        );
    }

    #[test]
    fn text_without_a_language_tag_is_unchanged() {
        for text in [
            "Hello there.",
            "language is hard to learn",
            "language two words<asr_text> here",
            "The <asr_text> tag",
        ] {
            assert_eq!(split_language_tag(text), (text, None));
        }
    }
}
