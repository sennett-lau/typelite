use super::{CommandMatch, SearchMatch};
use crate::voice_intent::normalize::{trim_command_payload, NormalizedUtterance};
use crate::voice_intent::SearchProvider;

pub(super) fn match_draft(view: &NormalizedUtterance<'_>) -> CommandMatch<String> {
    for prefix in ["寫一封", "幫我寫", "回覆說", "寫個", "起草"] {
        if !view.starts_with_prefix(prefix, false) {
            continue;
        }
        return view
            .payload_after_prefix(prefix)
            .map(CommandMatch::Matched)
            .unwrap_or(CommandMatch::MissingPayload);
    }
    CommandMatch::NoMatch
}

/// Openings before an edit instruction (see `starts_with_edit_verb`), with Cantonese forms.
const EDIT_LEADS: &[&str] = &[
    "請你",
    "請",
    "幫我",
    "幫忙",
    "麻煩你",
    "麻煩",
    "你可以",
    "可以",
    "能不能",
    "可不可以",
    "把這段話",
    "把這段文字",
    "把這段",
    "把這句話",
    "把這句",
    "把這個",
    "把它",
    "把佢",
    "將這段",
    "將呢段",
    "這段話",
    "這段",
    "這句話",
    "這句",
    "呢段",
];

/// Edit instructions that replace the selection (plan 0011): shorten, rewrite, polish, fix,
/// change the tone or the format. Questions ("解釋一下", "總結一下") are not here.
const EDIT_VERBS: &[&str] = &[
    "改寫",
    "重寫",
    "改短",
    "改長",
    "改成",
    "改為",
    "改得",
    "改簡",
    "改正式",
    "改一下",
    "寫得",
    "寫短",
    "寫長",
    "寫成",
    "縮短",
    "精簡",
    "簡化",
    "擴寫",
    "擴展",
    "潤色",
    "修正",
    "修改",
    "改正",
    "糾正",
    "校對",
    "正式",
    "更正式",
    "隨意",
    "輕鬆",
    "口語",
    "友善",
    "友好",
    "禮貌",
    "客氣",
    "簡潔",
    "語氣",
    "整理成",
    "轉成",
    "變成",
    "列成",
];

pub(super) fn matches_rewrite(view: &NormalizedUtterance<'_>) -> bool {
    super::starts_with_edit_verb(view, EDIT_LEADS, EDIT_VERBS)
}

pub(super) fn matches_translation(view: &NormalizedUtterance<'_>) -> bool {
    ["把這段翻譯成", "翻譯這段到", "將選取文字翻譯成"]
        .iter()
        .any(|prefix| {
            view.starts_with_prefix(prefix, false) && view.payload_after_prefix(prefix).is_some()
        })
}

pub(super) fn matches_informational(view: &NormalizedUtterance<'_>) -> bool {
    [
        "總結這段",
        "解釋這段",
        "比較這段",
        "這段是什麼意思",
        "為什麼",
        "怎麼",
        "什麼",
        "誰",
        "何時",
        "哪裡",
    ]
    .iter()
    .any(|prefix| view.starts_with_prefix(prefix, false))
}

pub(super) fn match_search(view: &NormalizedUtterance<'_>) -> CommandMatch<SearchMatch> {
    let text = view.match_text();
    for (name, provider) in provider_names() {
        for verb in ["搜尋", "搜"] {
            let leading = format!("在 {name} {verb}");
            if view.starts_with_prefix(&leading, false) {
                return view
                    .payload_after_prefix(&leading)
                    .map(|query| CommandMatch::Matched(SearchMatch { provider, query }))
                    .unwrap_or(CommandMatch::MissingPayload);
            }

            let start = format!("{verb} ");
            let suffix = format!(" 在 {name}");
            if text.starts_with(&start) && text.ends_with(&suffix) {
                let query_start = start.len();
                let query_end = text.len() - suffix.len();
                return view
                    .original_for_match_range(query_start, query_end)
                    .as_deref()
                    .and_then(trim_command_payload)
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
