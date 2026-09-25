//! Plan 0011: does an open Ask question need live information (news, prices, weather, ...)
//! that the model cannot know? Typelite cannot search the web yet, so such questions get an
//! honest reply instead of an invented answer.
//!
//! The AI decides with one short request (strict JSON, a few output tokens). When that request
//! fails or takes longer than `CLASSIFY_TIMEOUT`, a keyword list decides instead.

use std::time::Duration;

use serde_json::{json, Value};

use super::LlmConfig;

/// How long the classification request may take before the keyword list decides.
pub const CLASSIFY_TIMEOUT: Duration = Duration::from_secs(2);
/// Enough for `{"live": false, "reason": "none"}` and nothing more.
const CLASSIFY_MAX_TOKENS: u32 = 24;

/// Why a question is (or is not) live. Only these words are logged, never the question.
const REASONS: &[&str] = &[
    "news", "time", "price", "weather", "score", "schedule", "release", "other", "none",
];

const CLASSIFIER_PROMPT: &str = "You decide whether a question needs live information. A question is live when a correct answer depends on facts that change often or may be newer than your training data: news and current events; anything about today, now, this week, the latest or current state; prices, stock and exchange rates; weather; sports scores and results; schedules, opening hours and timetables; recent releases, versions or announcements. Timeless facts, definitions, history, science, maths, how-to and writing help are not live. Reply with JSON only, no other text: {\"live\": true or false, \"reason\": one of \"news\", \"time\", \"price\", \"weather\", \"score\", \"schedule\", \"release\", \"other\", \"none\"}.";

/// Who made the decision.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LiveCheckSource {
    Ai,
    /// The AI request failed or its reply could not be read.
    KeywordsAfterError,
    /// The AI request took longer than `CLASSIFY_TIMEOUT`.
    KeywordsAfterTimeout,
}

impl LiveCheckSource {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Ai => "ai",
            Self::KeywordsAfterError => "keywords_after_error",
            Self::KeywordsAfterTimeout => "keywords_after_timeout",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct LiveCheck {
    pub live: bool,
    /// One of `REASONS`.
    pub reason: &'static str,
    pub source: LiveCheckSource,
}

/// The chat request body for the classification, with the preset's extra fields.
pub fn build_classifier_body(config: &LlmConfig, question: &str) -> Value {
    super::protocol::build_chat_body(
        &config.model,
        vec![
            json!({ "role": "system", "content": CLASSIFIER_PROMPT }),
            json!({ "role": "user", "content": format!("Question: {question}") }),
        ],
        CLASSIFY_MAX_TOKENS,
        0.0,
        false,
        &config.extra_request_fields,
    )
}

fn known_reason(value: &str) -> &'static str {
    let value = value.trim().to_ascii_lowercase();
    REASONS
        .iter()
        .find(|reason| **reason == value)
        .copied()
        .unwrap_or("other")
}

/// Reads the classifier's reply: the JSON object (also inside a code fence or after stray
/// text), or a single word such as `live` / `yes` / `false`. `None` when it says neither.
pub fn parse_classifier_reply(text: &str) -> Option<(bool, &'static str)> {
    let trimmed = text.trim();
    if let (Some(start), Some(end)) = (trimmed.find('{'), trimmed.rfind('}')) {
        if start < end {
            if let Ok(value) = serde_json::from_str::<Value>(&trimmed[start..=end]) {
                let live = match value.get("live") {
                    Some(Value::Bool(live)) => Some(*live),
                    Some(Value::String(word)) => single_word(word),
                    _ => None,
                };
                if let Some(live) = live {
                    let reason = value
                        .get("reason")
                        .and_then(Value::as_str)
                        .map(known_reason)
                        .unwrap_or(if live { "other" } else { "none" });
                    let reason = match (live, reason) {
                        (true, "none") => "other",
                        (false, _) => "none",
                        (_, reason) => reason,
                    };
                    return Some((live, reason));
                }
            }
        }
    }
    let first_word: String = trimmed
        .trim_start_matches(|c: char| !c.is_alphanumeric())
        .chars()
        .take_while(|c| c.is_alphanumeric())
        .collect();
    single_word(&first_word).map(|live| (live, if live { "other" } else { "none" }))
}

fn single_word(word: &str) -> Option<bool> {
    match word.trim().to_ascii_lowercase().as_str() {
        "true" | "yes" | "live" => Some(true),
        "false" | "no" | "static" | "not" => Some(false),
        _ => None,
    }
}

/// English keywords, lowercase, matched as whole words or phrases.
const ENGLISH_KEYWORDS: &[(&str, &str)] = &[
    ("news", "news"),
    ("headlines", "news"),
    ("breaking", "news"),
    ("today", "time"),
    ("today's", "time"),
    ("tonight", "time"),
    ("yesterday", "time"),
    ("this week", "time"),
    ("this weekend", "time"),
    ("right now", "time"),
    ("latest", "time"),
    ("currently", "time"),
    ("current", "time"),
    ("recent", "time"),
    ("recently", "time"),
    ("price", "price"),
    ("prices", "price"),
    ("cost of", "price"),
    ("stock", "price"),
    ("stocks", "price"),
    ("exchange rate", "price"),
    ("bitcoin", "price"),
    ("crypto", "price"),
    ("weather", "weather"),
    ("forecast", "weather"),
    ("temperature", "weather"),
    ("score", "score"),
    ("scores", "score"),
    ("who won", "score"),
    ("standings", "score"),
    ("schedule", "schedule"),
    ("opening hours", "schedule"),
    ("what time does", "schedule"),
    ("timetable", "schedule"),
    ("released", "release"),
    ("release date", "release"),
    ("just announced", "release"),
    ("newest", "release"),
];

/// Chinese keywords, Simplified and Traditional.
const CHINESE_KEYWORDS: &[(&str, &str)] = &[
    ("新闻", "news"),
    ("新聞", "news"),
    ("头条", "news"),
    ("頭條", "news"),
    ("今天", "time"),
    ("今日", "time"),
    ("今晚", "time"),
    ("昨天", "time"),
    ("本周", "time"),
    ("本週", "time"),
    ("这周", "time"),
    ("這週", "time"),
    ("最新", "time"),
    ("目前", "time"),
    ("现在", "time"),
    ("現在", "time"),
    ("而家", "time"),
    ("最近", "time"),
    ("价格", "price"),
    ("價格", "price"),
    ("价钱", "price"),
    ("價錢", "price"),
    ("股价", "price"),
    ("股價", "price"),
    ("汇率", "price"),
    ("匯率", "price"),
    ("比特币", "price"),
    ("比特幣", "price"),
    ("天气", "weather"),
    ("天氣", "weather"),
    ("气温", "weather"),
    ("氣溫", "weather"),
    ("比分", "score"),
    ("赛果", "score"),
    ("賽果", "score"),
    ("谁赢", "score"),
    ("誰贏", "score"),
    ("边个赢", "score"),
    ("邊個贏", "score"),
    ("时间表", "schedule"),
    ("時間表", "schedule"),
    ("时刻表", "schedule"),
    ("時刻表", "schedule"),
    ("营业时间", "schedule"),
    ("營業時間", "schedule"),
    ("发布", "release"),
    ("發佈", "release"),
    ("發布", "release"),
    ("上映", "release"),
];

/// The keyword fallback: live when the question holds one of the keywords.
pub fn keyword_check(question: &str) -> (bool, &'static str) {
    let lower = question.to_lowercase();
    let words: Vec<&str> = lower
        .split(|c: char| !(c.is_alphanumeric() || c == '\''))
        .filter(|word| !word.is_empty())
        .collect();
    let joined = format!(" {} ", words.join(" "));
    for (keyword, reason) in ENGLISH_KEYWORDS {
        if joined.contains(&format!(" {keyword} ")) {
            return (true, reason);
        }
    }
    for (keyword, reason) in CHINESE_KEYWORDS {
        if question.contains(keyword) {
            return (true, reason);
        }
    }
    (false, "none")
}

fn keyword_decision(question: &str, source: LiveCheckSource) -> LiveCheck {
    let (live, reason) = keyword_check(question);
    LiveCheck {
        live,
        reason,
        source,
    }
}

async fn ask_classifier(
    client: &reqwest::Client,
    config: &LlmConfig,
    question: &str,
    timeout: Duration,
) -> Result<(bool, &'static str), String> {
    let url = super::protocol::chat_endpoint(&config.base_url)?;
    let request = client
        .post(url)
        .header("Content-Type", "application/json")
        .json(&build_classifier_body(config, question))
        .timeout(timeout);
    let response = super::protocol::apply_auth_headers(request, &config.api_key)
        .send()
        .await
        .map_err(|error| error.to_string())?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!("status {}", status.as_u16()));
    }
    let body: Value = response.json().await.map_err(|error| error.to_string())?;
    parse_classifier_reply(&super::protocol::response_text(&body))
        .ok_or_else(|| "unreadable reply".to_string())
}

/// Decides whether `question` needs live information, within `timeout`.
pub async fn classify_with_timeout(
    client: &reqwest::Client,
    config: &LlmConfig,
    question: &str,
    timeout: Duration,
) -> LiveCheck {
    match tokio::time::timeout(timeout, ask_classifier(client, config, question, timeout)).await {
        Ok(Ok((live, reason))) => LiveCheck {
            live,
            reason,
            source: LiveCheckSource::Ai,
        },
        Ok(Err(error)) => {
            // The error never contains the question: it is a status or a transport message.
            tracing::warn!("Live-question check failed ({error}); using keywords");
            keyword_decision(question, LiveCheckSource::KeywordsAfterError)
        }
        Err(_) => {
            tracing::warn!(
                "Live-question check took over {} ms; using keywords",
                timeout.as_millis()
            );
            keyword_decision(question, LiveCheckSource::KeywordsAfterTimeout)
        }
    }
}

/// Decides whether `question` needs live information, within `CLASSIFY_TIMEOUT`.
pub async fn classify(client: &reqwest::Client, config: &LlmConfig, question: &str) -> LiveCheck {
    classify_with_timeout(client, config, question, CLASSIFY_TIMEOUT).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config() -> LlmConfig {
        let mut extra = serde_json::Map::new();
        extra.insert("reasoning_effort".into(), json!("none"));
        LlmConfig {
            api_key: String::new(),
            model: "test-model".into(),
            base_url: "http://127.0.0.1:9/v1".into(),
            extra_request_fields: extra,
            max_tokens: 4096,
            temperature: 0.3,
        }
    }

    #[test]
    fn classifier_body_is_short_strict_and_keeps_preset_extras() {
        let body = build_classifier_body(&config(), "What's the AI news today?");
        assert_eq!(body["model"], "test-model");
        assert_eq!(body["max_tokens"], CLASSIFY_MAX_TOKENS);
        assert_eq!(body["temperature"], 0.0);
        assert_eq!(body["stream"], false);
        assert_eq!(body["reasoning_effort"], "none");
        let system = body["messages"][0]["content"].as_str().unwrap();
        assert!(system.contains("JSON only"));
        assert!(body["messages"][1]["content"]
            .as_str()
            .unwrap()
            .contains("AI news today"));
    }

    #[test]
    fn classifier_reply_parses_json_fences_and_single_words() {
        assert_eq!(
            parse_classifier_reply(r#"{"live": true, "reason": "news"}"#),
            Some((true, "news"))
        );
        assert_eq!(
            parse_classifier_reply("```json\n{\"live\": false, \"reason\": \"none\"}\n```"),
            Some((false, "none"))
        );
        assert_eq!(
            parse_classifier_reply(r#"Sure: {"live": "yes", "reason": "Weather"}"#),
            Some((true, "weather"))
        );
        // Unknown reasons are logged as "other"; "not live" never carries a live reason.
        assert_eq!(
            parse_classifier_reply(r#"{"live": true, "reason": "gossip"}"#),
            Some((true, "other"))
        );
        assert_eq!(
            parse_classifier_reply(r#"{"live": false, "reason": "news"}"#),
            Some((false, "none"))
        );
        assert_eq!(parse_classifier_reply("LIVE"), Some((true, "other")));
        assert_eq!(parse_classifier_reply(" no."), Some((false, "none")));
        assert_eq!(parse_classifier_reply("I think so"), None);
        assert_eq!(parse_classifier_reply(""), None);
        assert_eq!(parse_classifier_reply(r#"{"reason": "news"}"#), None);
    }

    #[test]
    fn keyword_fallback_catches_english_live_questions() {
        for (question, reason) in [
            ("What's the AI news today?", "news"),
            ("What is the Bitcoin price", "price"),
            ("weather in Tokyo", "weather"),
            ("Who won the match last night", "score"),
            ("latest iPhone model", "time"),
        ] {
            assert_eq!(keyword_check(question), (true, reason), "{question}");
        }
        for question in [
            "What is the capital of France?",
            "How do I boil an egg?",
            "Explain photosynthesis",
            "What does newsworthy mean", // whole words only
        ] {
            assert_eq!(keyword_check(question), (false, "none"), "{question}");
        }
    }

    #[test]
    fn keyword_fallback_catches_chinese_live_questions() {
        for (question, reason) in [
            ("今天有什么AI新闻", "news"),
            ("比特幣價格係幾多", "price"),
            ("東京天氣點樣", "weather"),
            ("昨晚球賽邊個贏", "score"),
            ("而家幾點", "time"),
        ] {
            assert_eq!(keyword_check(question), (true, reason), "{question}");
        }
        assert_eq!(keyword_check("法国的首都是哪里"), (false, "none"));
        assert_eq!(keyword_check("點樣煲蛋"), (false, "none"));
    }

    #[tokio::test]
    async fn unreachable_ai_falls_back_to_keywords() {
        let client = reqwest::Client::new();
        let check = classify_with_timeout(
            &client,
            &config(),
            "what's the weather today",
            Duration::from_millis(500),
        )
        .await;
        assert!(check.live);
        assert_ne!(check.source, LiveCheckSource::Ai);

        let check = classify_with_timeout(
            &client,
            &config(),
            "what is the capital of France",
            Duration::from_millis(500),
        )
        .await;
        assert!(!check.live);
        assert_eq!(check.reason, "none");
    }
}
