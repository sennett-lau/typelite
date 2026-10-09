//! Plan `polish-dashes-and-fillers`: small polish models join clauses with a spaced dash
//! ("I checked the logs - nothing there", "the plan — the new one — is ready"), which reads as
//! broken fragments in a typed message. This turns such a clause dash into a comma.
//!
//! It is deliberately narrow. A dash changes only when it stands between two words of Latin
//! script on one line: a word of two or more letters, then " - ", " – " or " — " (or "—" with
//! no spaces), then a letter. So these never change: hyphenated words ("well-known"), number
//! ranges ("3 - 5", "9—5"), list items ("- milk"), single-letter maths or code ("x - y"),
//! flags ("--force"), URLs and paths (no spaces), Chinese dashes (——), and a dash after
//! punctuation (", - ").
//!
//! The decision looks only at the text before the dash and the first character after it, so a
//! cleaned prefix of a streamed answer is also a prefix of the cleaned whole answer.

const DASHES: [char; 3] = ['-', '\u{2013}', '\u{2014}'];
const EM_DASH: char = '\u{2014}';

/// A letter of an alphabetic, non-CJK script (Latin, Greek, Cyrillic and so on).
fn is_word_letter(c: char) -> bool {
    c.is_alphabetic() && (c as u32) < 0x2E80
}

/// True when the text ends with a word of at least two letters (not a single "x").
fn ends_with_long_word(before: &str) -> bool {
    before
        .chars()
        .rev()
        .take_while(|c| is_word_letter(*c) || *c == '\'')
        .filter(|c| is_word_letter(*c))
        .count()
        >= 2
}

/// Replaces clause dashes between words with a comma (see the module comment).
pub fn clause_dashes_to_commas(text: &str) -> String {
    let chars: Vec<(usize, char)> = text.char_indices().collect();
    let mut out = String::with_capacity(text.len());
    let mut i = 0;
    while i < chars.len() {
        let (at, c) = chars[i];
        // " - x": a space, one dash, a space, a letter.
        if c == ' '
            && i + 3 < chars.len()
            && DASHES.contains(&chars[i + 1].1)
            && chars[i + 2].1 == ' '
            && is_word_letter(chars[i + 3].1)
            && ends_with_long_word(&text[..at])
        {
            out.push_str(", ");
            i += 3;
            continue;
        }
        // "word—word": an unspaced em dash between letters.
        if c == EM_DASH
            && i + 1 < chars.len()
            && is_word_letter(chars[i + 1].1)
            && ends_with_long_word(&text[..at])
        {
            out.push_str(", ");
            i += 1;
            continue;
        }
        out.push(c);
        i += 1;
    }
    out
}

/// True for characters a streamed answer holds back at its end: they may start a dash pattern
/// or be the final period that is removed.
pub fn is_pending_tail(c: char) -> bool {
    c.is_whitespace() || DASHES.contains(&c) || matches!(c, '.' | '。' | '．')
}

#[cfg(test)]
mod tests {
    use super::*;

    fn clean(text: &str) -> String {
        clause_dashes_to_commas(text)
    }

    #[test]
    fn clause_dashes_become_commas() {
        assert_eq!(
            clean("I checked the logs - nothing there"),
            "I checked the logs, nothing there"
        );
        assert_eq!(
            clean("I checked the logs — nothing there"),
            "I checked the logs, nothing there"
        );
        assert_eq!(
            clean("I checked the logs – nothing there"),
            "I checked the logs, nothing there"
        );
        assert_eq!(
            clean("the plan — the new one — is ready"),
            "the plan, the new one, is ready"
        );
        assert_eq!(clean("it works—mostly"), "it works, mostly");
        assert_eq!(
            clean("Sounds good - I'll send it tonight"),
            "Sounds good, I'll send it tonight"
        );
        assert_eq!(clean("Café — ouvert"), "Café, ouvert");
    }

    #[test]
    fn hyphens_ranges_lists_and_code_stay() {
        for text in [
            "a well-known fact",
            "state-of-the-art tools",
            "pages 3 - 5",
            "pages 3-5",
            "open 9—5",
            "from 2020 – 2024",
            "- milk\n- eggs",
            "Shopping:\n- milk\n- eggs",
            "set x - y to zero",
            "run git push --force",
            "see https://example.com/a-b-c",
            "the file my-notes.md",
            "Yes, - maybe",
            "wait -- really",
            "price is -5 degrees",
            "temperature - 5 degrees",
            "我覺得——算了",
            "我覺得 - 算了",
            "end of line -",
            "word -\nnext",
            "",
        ] {
            assert_eq!(clean(text), text, "{text:?}");
        }
    }

    #[test]
    fn a_dash_before_a_number_or_symbol_stays() {
        assert_eq!(clean("the total - 40 dollars"), "the total - 40 dollars");
        assert_eq!(clean("the total - $40"), "the total - $40");
        assert_eq!(clean("note - \"quoted\""), "note - \"quoted\"");
    }

    #[test]
    fn cleaning_a_prefix_is_a_prefix_of_cleaning_the_whole() {
        let whole = "I checked the logs - nothing there — and x - y stays—right";
        let cleaned = clean(whole);
        for end in (0..=whole.len()).filter(|end| whole.is_char_boundary(*end)) {
            let prefix = whole[..end].trim_end_matches(is_pending_tail);
            assert!(
                cleaned.starts_with(&clean(prefix)),
                "prefix {prefix:?} -> {:?} vs {cleaned:?}",
                clean(prefix)
            );
        }
    }
}
