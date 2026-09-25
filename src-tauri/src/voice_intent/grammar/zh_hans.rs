use super::{CommandMatch, SearchMatch};
use crate::voice_intent::normalize::{trim_command_payload, NormalizedUtterance};
use crate::voice_intent::SearchProvider;

pub(super) fn match_draft(view: &NormalizedUtterance<'_>) -> CommandMatch<String> {
    for prefix in ["写一封", "帮我写", "回复说", "写个", "起草"] {
        if !view.starts_with_prefix(prefix, false) {
            continue;
        }
        return view
            .payload_after_prefix(prefix)
            .map(CommandMatch::Matched)
            .unwrap_or(CommandMatch::MissingPayload);
    }
    for prefix in [
        "写一份",
        "我想写一份",
        "我想写一封",
        "帮我写一封邮件",
        "帮我写一份邮件",
    ] {
        if !view.starts_with_prefix(prefix, false) {
            continue;
        }
        let Some(payload) = view.payload_after_prefix(prefix) else {
            return CommandMatch::MissingPayload;
        };
        if looks_like_draft_artifact(&payload) {
            return CommandMatch::Matched(payload);
        }
    }
    CommandMatch::NoMatch
}

fn looks_like_draft_artifact(payload: &str) -> bool {
    ["邮件", "封信", "消息", "通知", "回复", "邀请"]
        .iter()
        .any(|marker| payload.contains(marker))
}

/// Openings before an edit instruction (see `starts_with_edit_verb`).
const EDIT_LEADS: &[&str] = &[
    "请你",
    "请",
    "帮我",
    "帮忙",
    "麻烦你",
    "麻烦",
    "你可以",
    "可以",
    "能不能",
    "可不可以",
    "把这段话",
    "把这段文字",
    "把这段",
    "把这句话",
    "把这句",
    "把这个",
    "把它",
    "把选中的文字",
    "将这段",
    "这段话",
    "这段",
    "这句话",
    "这句",
];

/// Edit instructions that replace the selection (plan 0011): shorten, rewrite, polish, fix,
/// change the tone or the format. Questions ("解释一下", "总结一下") are not here.
const EDIT_VERBS: &[&str] = &[
    "改写",
    "重写",
    "改短",
    "改长",
    "改成",
    "改为",
    "改得",
    "改简",
    "改正式",
    "改一下",
    "写得",
    "写短",
    "写长",
    "写成",
    "缩短",
    "精简",
    "简化",
    "扩写",
    "扩展",
    "润色",
    "修正",
    "修改",
    "改正",
    "纠正",
    "校对",
    "正式",
    "更正式",
    "随意",
    "轻松",
    "口语",
    "友好",
    "礼貌",
    "客气",
    "简洁",
    "语气",
    "整理成",
    "转成",
    "变成",
    "列成",
];

pub(super) fn matches_rewrite(view: &NormalizedUtterance<'_>) -> bool {
    super::starts_with_edit_verb(view, EDIT_LEADS, EDIT_VERBS)
}

pub(super) fn matches_translation(view: &NormalizedUtterance<'_>) -> bool {
    ["把这段翻译成", "翻译这段到", "将选中文字翻译成"]
        .iter()
        .any(|prefix| {
            view.starts_with_prefix(prefix, false) && view.payload_after_prefix(prefix).is_some()
        })
}

pub(super) fn matches_informational(view: &NormalizedUtterance<'_>) -> bool {
    [
        "总结这段",
        "解释这段",
        "比较这段",
        "这段是什么意思",
        "为什么",
        "怎么",
        "什么",
        "谁",
        "何时",
        "哪里",
    ]
    .iter()
    .any(|prefix| view.starts_with_prefix(prefix, false))
}

pub(super) fn match_search(view: &NormalizedUtterance<'_>) -> CommandMatch<SearchMatch> {
    match_search_with_verbs(view, &["搜索", "搜"])
}

fn match_search_with_verbs(
    view: &NormalizedUtterance<'_>,
    verbs: &[&str],
) -> CommandMatch<SearchMatch> {
    let text = view.match_text();
    for (name, provider) in provider_names() {
        for verb in verbs {
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
