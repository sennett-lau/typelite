//! Plan `polish-dashes-and-fillers`: small polish models often keep a hesitation sound ("um",
//! "uh", 呃, 嗯), most of all at the start of a dictation. Words with meaning (so, like, 那个,
//! 即係) stay the AI's job; this removes only a small closed set of sounds that are never words.
//!
//! A sound is removed only when it stands alone: at the start of the text or after a space or
//! punctuation, and before a space, punctuation or the end. So "umbrella", "Uhura", "hmmm-ish",
//! "https://x.com/um", "file_um" and anything inside `backticks` never change. Repeated letters
//! count ("ummm", "uhh", "hmmm"). Excluded on purpose: "er" (German "he"), "eh" (German
//! "anyway", Spanish "hey"), 啊 and 呀 (also sentence particles), and "mm" (agreement).
//!
//! After a removal, the comma or ellipsis that followed the sound goes too. A sound at the end
//! of a sentence takes the comma before it ("I think so, um." becomes "I think so."). A
//! capitalised sound passes its capital to the next word ("Um, so we" becomes "So we").
//!
//! For streaming, `stable_prefix` gives the part of a partial answer that later text cannot
//! change, so a cleaned prefix is always a prefix of the cleaned whole answer.

/// Latin sounds as (stem, letter that may repeat at its end).
const LATIN_SOUNDS: [(&str, char); 10] = [
    ("um", 'm'),
    ("uh", 'h'),
    ("uhm", 'm'),
    ("erm", 'm'),
    ("hm", 'm'),
    ("euh", 'h'),
    ("ehm", 'm'),
    ("äh", 'h'),
    ("ähm", 'm'),
    ("öhm", 'm'),
];

/// Chinese sounds (each may repeat: 嗯嗯).
const CJK_SOUNDS: [char; 2] = ['嗯', '呃'];

/// Commas and pauses that belong to the sound and go with it.
const PAUSES: [char; 4] = [',', '，', '、', '…'];

/// Sentence ends: a sound before one takes the comma before it.
const SENTENCE_ENDS: [char; 9] = ['.', '!', '?', '。', '！', '？', ';', '；', ':'];

/// What may stand right before a sound.
fn opens_token(c: char) -> bool {
    c.is_whitespace()
        || matches!(
            c,
            ',' | '，'
                | '、'
                | '.'
                | '!'
                | '?'
                | '。'
                | '！'
                | '？'
                | ';'
                | '；'
                | ':'
                | '：'
                | '('
                | '（'
                | '"'
                | '“'
                | '「'
                | '…'
        )
}

/// What may stand right after a sound.
fn closes_token(c: char) -> bool {
    c.is_whitespace()
        || PAUSES.contains(&c)
        || SENTENCE_ENDS.contains(&c)
        || matches!(c, '：' | ')' | '）' | '"' | '”' | '」')
}

fn is_latin_letter(c: char) -> bool {
    c.is_alphabetic() && (c as u32) < 0x2E80
}

fn is_latin_sound(word: &str) -> bool {
    let lower = word.to_lowercase();
    LATIN_SOUNDS.iter().any(|(stem, repeat)| {
        lower
            .strip_prefix(stem)
            .is_some_and(|rest| rest.chars().all(|c| c == *repeat))
    })
}

/// Length in bytes of a sound starting at `text[at..]`, if one starts there (boundaries are
/// checked by the caller for the left side and here for the right side).
fn sound_at(text: &str, at: usize) -> Option<usize> {
    let rest = &text[at..];
    let first = rest.chars().next()?;
    let len = if CJK_SOUNDS.contains(&first) {
        rest.chars()
            .take_while(|c| *c == first)
            .map(char::len_utf8)
            .sum()
    } else if is_latin_letter(first) {
        let len: usize = rest
            .chars()
            .take_while(|c| is_latin_letter(*c))
            .map(char::len_utf8)
            .sum();
        if !is_latin_sound(&rest[..len]) {
            return None;
        }
        len
    } else {
        return None;
    };
    let mut after = rest[len..].chars();
    match after.next() {
        None => Some(len),
        // "um.txt", "uh,b": ASCII punctuation glued to a letter or digit is code or a name.
        Some(next)
            if next.is_ascii_punctuation() && after.next().is_some_and(char::is_alphanumeric) =>
        {
            None
        }
        Some(next) if closes_token(next) => Some(len),
        // Chinese runs on without spaces: 呃我哋 is a sound before a word.
        Some(next) if CJK_SOUNDS.contains(&first) && !CJK_SOUNDS.contains(&next) => Some(len),
        _ => None,
    }
}

fn at_sentence_start(out: &str) -> bool {
    match out.trim_end_matches([' ', '\t']).chars().last() {
        None => true,
        Some(c) => matches!(c, '.' | '!' | '?' | '。' | '！' | '？' | '\n'),
    }
}

/// Removes standalone hesitation sounds (see the module comment).
pub fn remove_hesitation_sounds(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut in_code = false;
    let mut capitalise_next = false;
    let mut prev: Option<char> = None;
    let mut i = 0;
    while i < text.len() {
        let c = text[i..].chars().next().unwrap();
        if c == '`' {
            in_code = !in_code;
        }
        let left_ok = prev.is_none_or(opens_token);
        if !in_code && left_ok {
            if let Some(len) = sound_at(text, i) {
                let capital = c.is_uppercase();
                let mut j = i + len;
                // The pause that belongs to the sound: commas, an ellipsis or "...".
                loop {
                    let rest = &text[j..];
                    if let Some(p) = rest.chars().next().filter(|p| PAUSES.contains(p)) {
                        j += p.len_utf8();
                    } else if rest.starts_with("...") {
                        j += 3;
                    } else {
                        break;
                    }
                }
                let after = &text[j..];
                let next = after.trim_start_matches([' ', '\t']).chars().next();
                if at_sentence_start(&out) && next.is_some_and(|n| SENTENCE_ENDS.contains(&n)) {
                    // "Um. Okay": the sound is a sentence of its own; drop its period too.
                    let rest = after.trim_start_matches([' ', '\t']);
                    let rest = rest.trim_start_matches(SENTENCE_ENDS);
                    let rest = rest.trim_start_matches([' ', '\t']);
                    j = text.len() - rest.len();
                } else if next.is_none_or(|n| SENTENCE_ENDS.contains(&n) || n == '\n') {
                    // At a sentence end: drop the comma and spaces before the sound too.
                    let kept = out.trim_end_matches(|p: char| PAUSES.contains(&p) || p == ' ');
                    out.truncate(kept.len());
                    j += after.len() - after.trim_start_matches([' ', '\t']).len();
                } else {
                    j += after.len() - after.trim_start_matches([' ', '\t']).len();
                    if capital && at_sentence_start(&out) {
                        capitalise_next = true;
                    }
                }
                prev = out.chars().last();
                i = j;
                continue;
            }
        }
        if capitalise_next {
            capitalise_next = false;
            out.extend(c.to_uppercase());
        } else {
            out.push(c);
        }
        prev = Some(c);
        i += c.len_utf8();
    }
    out
}

/// The part of a streamed answer that text still to come cannot change: the trailing word
/// (it may still grow into or be a sound), and any sound with its pauses before it, are held.
/// `pending` says which trailing characters other clean-ups hold back.
pub fn stable_prefix(text: &str, pending: impl Fn(char) -> bool) -> &str {
    let hold = |c: char| pending(c) || PAUSES.contains(&c) || c.is_whitespace();
    let mut end = text.trim_end_matches(&hold).len();
    // The last word may be unfinished.
    end = text[..end].trim_end_matches(is_latin_letter).len();
    end = text[..end].trim_end_matches(CJK_SOUNDS).len();
    loop {
        let trimmed = text[..end].trim_end_matches(&hold).len();
        let word_start = text[..trimmed].trim_end_matches(is_latin_letter).len();
        let word_start = if word_start == trimmed {
            text[..trimmed].trim_end_matches(CJK_SOUNDS).len()
        } else {
            word_start
        };
        if word_start < trimmed
            && text[..word_start].chars().last().is_none_or(opens_token)
            && sound_at(&text[..trimmed], word_start).is_some()
        {
            end = word_start;
        } else {
            return &text[..trimmed.min(end)];
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn clean(text: &str) -> String {
        remove_hesitation_sounds(text)
    }

    #[test]
    fn english_sounds_go() {
        let cases = [
            (
                "Um, so we could move the meeting",
                "So we could move the meeting",
            ),
            ("Uh, can you review it", "Can you review it"),
            ("um so we could", "so we could"),
            ("Ummm... I think so", "I think so"),
            ("Hmm, let me think", "Let me think"),
            ("Hmmm let me think", "Let me think"),
            ("Erm, the build broke", "The build broke"),
            ("Uhm, yes", "Yes"),
            ("Well, um, I think so", "Well, I think so"),
            ("so um I think", "so I think"),
            ("I, uh, think so", "I, think so"),
            ("I think so, um.", "I think so."),
            ("I think so, um", "I think so"),
            ("Can you uh can you review", "Can you can you review"),
            ("It's fine. Um, see you then.", "It's fine. See you then."),
            ("Um. Okay.", "Okay."),
            ("Done, uh… right", "Done, right"),
            ("(um) fine", "() fine"),
            ("Um", ""),
            ("um um so", "so"),
            ("UH, fine", "Fine"),
        ];
        for (input, expected) in cases {
            assert_eq!(clean(input), expected, "{input:?}");
        }
    }

    #[test]
    fn other_latin_sounds_go() {
        assert_eq!(clean("Euh, je pense que oui"), "Je pense que oui");
        assert_eq!(clean("Je pense, euh, que oui"), "Je pense, que oui");
        assert_eq!(clean("Ehm, creo que sí"), "Creo que sí");
        assert_eq!(clean("Äh, ich glaube schon"), "Ich glaube schon");
        assert_eq!(clean("Ich glaube, ähm, schon"), "Ich glaube, schon");
    }

    #[test]
    fn chinese_sounds_go() {
        assert_eq!(clean("呃，我哋聽日開會"), "我哋聽日開會");
        assert_eq!(clean("呃我哋聽日開會"), "我哋聽日開會");
        assert_eq!(clean("嗯嗯，我觉得可以"), "我觉得可以");
        assert_eq!(clean("我哋，呃，聽日開會"), "我哋，聽日開會");
        assert_eq!(clean("我觉得嗯可以"), "我觉得嗯可以");
        assert_eq!(clean("好。嗯，下次再说。"), "好。下次再说。");
        assert_eq!(clean("Okay 呃 we go"), "Okay we go");
    }

    #[test]
    fn words_code_and_particles_stay() {
        for text in [
            "",
            "The umbrella is here",
            "Uhura said hi",
            "hummus and humming",
            "Er kommt morgen",
            "Das ist eh egal",
            "Eh, ¿qué tal?",
            "Mm, sounds good",
            "好啊",
            "係呀，冇問題",
            "see https://example.com/um/uh",
            "the file um.txt",
            "rename `um` to `uh`",
            "run `git commit -m \"um, fix\"`",
            "file_um and um-like",
            "the drum, the hum",
            "UMTS and UHF",
            "e-um",
            "我哋嗯",
        ] {
            assert_eq!(clean(text), text, "{text:?}");
        }
    }

    #[test]
    fn layout_is_kept() {
        assert_eq!(
            clean("Shopping:\n- um milk\n- eggs"),
            "Shopping:\n- milk\n- eggs"
        );
        assert_eq!(clean("Hi,\n\nUm, see you\nBye"), "Hi,\n\nSee you\nBye");
        assert_eq!(clean("First line, um\nsecond"), "First line\nsecond");
    }

    fn pending(c: char) -> bool {
        super::super::dashes::is_pending_tail(c)
    }

    #[test]
    fn a_cleaned_stable_prefix_is_a_prefix_of_the_cleaned_whole() {
        for whole in [
            "Um, so I think, um, we could move it, uh.",
            "Well, um. Okay umbrella, hmm… fine",
            "呃，我哋，嗯嗯，聽日開會。呃",
            "I think so, um",
            "Ummm... I uh, `um` x",
            "Euh, je pense, euh, que oui. Uh",
        ] {
            let cleaned = clean(whole);
            for end in (0..=whole.len()).filter(|e| whole.is_char_boundary(*e)) {
                let prefix = stable_prefix(&whole[..end], pending);
                assert!(
                    cleaned.starts_with(&clean(prefix)),
                    "prefix {prefix:?} -> {:?} vs {cleaned:?}",
                    clean(prefix)
                );
            }
        }
    }

    #[test]
    fn stable_prefix_holds_only_the_tail() {
        assert_eq!(stable_prefix("Hello there, um", pending), "Hello there");
        assert_eq!(stable_prefix("Hello there friend", pending), "Hello there");
        assert_eq!(stable_prefix("我哋聽日開會", pending), "我哋聽日開會");
        assert_eq!(stable_prefix("我哋，呃", pending), "我哋");
    }
}
