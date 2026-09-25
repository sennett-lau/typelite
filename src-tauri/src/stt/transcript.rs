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
}
