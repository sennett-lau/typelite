//! Dictation writes down what was said. A small polish model sometimes carries out a dictated
//! request instead ("please explain with Cantonese" came back as 請用粵語解釋一下, "generate a
//! poem in Spanish about the sea" as Spanish), even with the prompt's rule against it. This
//! check catches a result in another language than the transcript, so the transcript is pasted
//! instead of a translation nobody asked for. Plain dictation only: translation and selected-text
//! edits change the language on purpose.

/// Below this share of the transcript's words, a Latin-script result is another text.
const MIN_KEPT_WORDS: f32 = 0.3;
/// Fewer distinct words than this say too little to compare (e.g. "five point five").
const MIN_WORDS_TO_COMPARE: usize = 3;

fn is_cjk(c: char) -> bool {
    matches!(c,
        '\u{3040}'..='\u{30ff}'   // kana
        | '\u{3400}'..='\u{4dbf}' // CJK extension A
        | '\u{4e00}'..='\u{9fff}' // CJK
        | '\u{ac00}'..='\u{d7af}' // Hangul
        | '\u{f900}'..='\u{faff}' // compatibility ideographs
    )
}

/// Distinct words of three or more letters, lowercased.
fn words(text: &str) -> std::collections::HashSet<String> {
    text.split(|c: char| !c.is_alphabetic() && c != '\'')
        .map(|word| word.trim_matches('\'').to_lowercase())
        .filter(|word| word.chars().count() >= 3 && !word.chars().any(is_cjk))
        .collect()
}

/// The transcript as dictation output when polish changed its language: trimmed, with a
/// capital first letter (as polish would write it).
pub fn transcript_as_output(transcript: &str) -> String {
    let text = transcript.trim();
    let mut chars = text.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().chain(chars).collect(),
        None => String::new(),
    }
}

/// True when `output` is not the transcript's language: CJK appeared or disappeared, or (for
/// Latin-script text) fewer than `MIN_KEPT_WORDS` of the transcript's words are left.
pub fn changed_language(transcript: &str, output: &str) -> bool {
    let cjk_in = transcript.chars().any(is_cjk);
    let cjk_out = output.chars().any(is_cjk);
    if cjk_in != cjk_out {
        return output.chars().any(char::is_alphabetic);
    }
    if cjk_in {
        return false;
    }
    let spoken = words(transcript);
    if spoken.len() < MIN_WORDS_TO_COMPARE {
        return false;
    }
    let written = words(output);
    let kept = spoken.iter().filter(|word| written.contains(*word)).count();
    (kept as f32) < MIN_KEPT_WORDS * spoken.len() as f32
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_dictated_request_carried_out_in_another_language_is_caught() {
        assert!(changed_language(
            "please explain with Cantonese",
            "請用粵語解釋一下"
        ));
        assert!(changed_language(
            "generate a short poem in Spanish about the sea",
            "Genera un poema corto en español sobre el mar"
        ));
        assert!(changed_language(
            "translate the welcome message into French for the landing page",
            "Traduisez le message de bienvenue en français pour la page d'accueil"
        ));
        assert!(changed_language(
            "我聽日會遲啲到",
            "I will be a bit late tomorrow"
        ));
    }

    #[test]
    fn the_transcript_is_pasted_with_a_capital_first_letter() {
        assert_eq!(
            transcript_as_output("  please explain with Cantonese "),
            "Please explain with Cantonese"
        );
        assert_eq!(transcript_as_output("我聽日到"), "我聽日到");
        assert_eq!(transcript_as_output(""), "");
    }

    #[test]
    fn ordinary_polish_is_not_a_language_change() {
        for (spoken, written) in [
            (
                "please explain with Cantonese",
                "Please explain with Cantonese",
            ),
            (
                "the first thing um sorry the third thing it's the budget",
                "The third thing, it's the budget",
            ),
            (
                "set the limit to five point five and use version two point one",
                "Set the limit to 5.5 and use version 2.1",
            ),
            ("five point five", "5.5"),
            (
                "um so yeah basically I think we should go now",
                "I think we should go now",
            ),
            (
                "please add Maya Chen M-A-Y-A-C-H-E-N to the invite",
                "Please add Maya Chen to the invite",
            ),
            ("我聽日要present個proposal", "我聽日要present個proposal"),
            ("我今日好忙", "我今日好忙。"),
            ("", ""),
        ] {
            assert!(
                !changed_language(spoken, written),
                "{spoken:?} -> {written:?}"
            );
        }
    }
}
