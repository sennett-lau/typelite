use super::{CommandMatch, SearchMatch};
use crate::voice_intent::normalize::{trim_command_payload, NormalizedUtterance};
use crate::voice_intent::SearchProvider;

pub(super) fn match_draft(view: &NormalizedUtterance<'_>) -> CommandMatch<String> {
    for prefix in ["reply with", "compose", "draft", "write"] {
        if !view.starts_with_prefix(prefix, true) {
            continue;
        }
        return view
            .payload_after_prefix(prefix)
            .map(CommandMatch::Matched)
            .unwrap_or(CommandMatch::MissingPayload);
    }
    CommandMatch::NoMatch
}

/// Polite openings that may come before an edit instruction ("can you make this shorter").
const EDIT_LEADS: [&str; 7] = [
    "",
    "please ",
    "can you ",
    "could you ",
    "can you please ",
    "could you please ",
    "now ",
];

/// Edit instructions on the selection. A match replaces the selection (plan 0011), so each
/// entry is anchored at the start and ends at a word boundary.
const EDIT_PHRASES: &[&str] = &[
    "rewrite",
    "rephrase",
    "reword",
    "shorten",
    "lengthen",
    "condense",
    "simplify",
    "proofread",
    "polish",
    "tidy up",
    "tidy this up",
    "tidy it up",
    "clean up",
    "clean this up",
    "clean it up",
    "improve this",
    "improve it",
    "improve the wording",
    "expand this",
    "expand it",
    "fix the grammar",
    "fix the spelling",
    "fix the typos",
    "fix the punctuation",
    "fix any typos",
    "fix typos",
    "fix grammar",
    "fix spelling",
    "fix this",
    "fix it",
    "correct the grammar",
    "correct the spelling",
    "correct the typos",
    "correct this",
    "format this as",
    "format this into",
    "format it as",
    "format as",
    "turn this into",
    "turn it into",
    "turn into",
    "convert this into",
    "convert this to",
    "convert it into",
    "convert it to",
    "put this into",
    "put this in",
    "put it into",
    "put it in",
];

/// "make this …" / "make it …" edits: comparatives, "more …", "less …", "sound …", "into …".
const MAKE_OBJECTS: [&str; 4] = [
    "make this",
    "make it",
    "make the text",
    "make the selection",
];
const MAKE_COMPLEMENTS: &[&str] = &[
    "shorter",
    "longer",
    "briefer",
    "tighter",
    "simpler",
    "clearer",
    "warmer",
    "friendlier",
    "nicer",
    "politer",
    "punchier",
    "better",
    "formal",
    "casual",
    "friendly",
    "polite",
    "professional",
    "concise",
    "more",
    "less",
    "sound",
    "into",
    "a bulleted",
    "a bullet",
    "a numbered",
    "a list",
    "bullet points",
];

pub(super) fn matches_rewrite(view: &NormalizedUtterance<'_>) -> bool {
    EDIT_LEADS.iter().any(|lead| {
        EDIT_PHRASES
            .iter()
            .any(|phrase| view.starts_with_prefix(&format!("{lead}{phrase}"), true))
            || MAKE_OBJECTS.iter().any(|object| {
                MAKE_COMPLEMENTS.iter().any(|complement| {
                    view.starts_with_prefix(&format!("{lead}{object} {complement}"), true)
                })
            })
    })
}

pub(super) fn matches_translation(view: &NormalizedUtterance<'_>) -> bool {
    [
        "translate this to",
        "translate this into",
        "translate the selection to",
        "translate the selection into",
    ]
    .iter()
    .any(|prefix| {
        view.starts_with_prefix(prefix, true) && view.payload_after_prefix(prefix).is_some()
    })
}

pub(super) fn matches_informational(view: &NormalizedUtterance<'_>) -> bool {
    [
        "summarize",
        "summarise",
        "explain",
        "compare this",
        "what ",
        "why ",
        "how ",
        "who ",
        "when ",
        "where ",
    ]
    .iter()
    .any(|prefix| view.match_text().starts_with(prefix))
}

pub(super) fn match_search(view: &NormalizedUtterance<'_>) -> CommandMatch<SearchMatch> {
    for command in ["search", "find"] {
        let Some(rest) = view.payload_after_prefix(command) else {
            if view.starts_with_prefix(command, true) {
                return CommandMatch::MissingPayload;
            }
            continue;
        };

        for (name, provider) in provider_names() {
            let normalized = rest.to_ascii_lowercase();
            let suffix = format!(" on {name}");
            if normalized.ends_with(&suffix) {
                let query_end = rest.len() - suffix.len();
                return trim_command_payload(&rest[..query_end])
                    .map(|query| {
                        CommandMatch::Matched(SearchMatch {
                            provider,
                            query: query.to_string(),
                        })
                    })
                    .unwrap_or(CommandMatch::MissingPayload);
            }

            if command == "search" {
                let prefix = format!("{name} for ");
                if normalized.starts_with(&prefix) {
                    return trim_command_payload(&rest[prefix.len()..])
                        .map(|query| {
                            CommandMatch::Matched(SearchMatch {
                                provider,
                                query: query.to_string(),
                            })
                        })
                        .unwrap_or(CommandMatch::MissingPayload);
                }
            }
        }
    }
    CommandMatch::NoMatch
}

fn provider_names() -> [(&'static str, SearchProvider); 4] {
    [
        ("google", SearchProvider::Google),
        ("youtube", SearchProvider::YouTube),
        ("amazon", SearchProvider::Amazon),
        ("github", SearchProvider::GitHub),
    ]
}
