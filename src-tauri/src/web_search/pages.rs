//! Plan `ask-read-pages`: reads the top search results' pages, so Ask anything can answer from
//! more than a search engine's ~200-character snippets.
//!
//! The flow, all topic-independent (no per-sport or per-site code):
//! 1. `fetch_pages`: the first `MAX_PAGES` result pages, in parallel, within `FETCH_BUDGET`.
//!    Only http(s) links from the search results; failures and non-HTML pages are skipped.
//! 2. `extract_blocks`: reader-mode style text. Scripts, styles, navigation, headers, footers and
//!    side bars are dropped; paragraphs, list items and table rows become blocks.
//! 3. `select_passages`: the blocks that share words with the question (or hold a date on or
//!    after today) are kept, best first, within `MAX_PASSAGE_CHARS`, so a small local model with
//!    a ~4k-token context still has room.
//! 4. After the AI answers, `unsupported_dates` checks every explicit date in the answer against
//!    the text the AI was given.
//!
//! Page text is untrusted, like snippets. Nothing here logs page text; callers log counts only.

use std::collections::HashSet;
use std::sync::LazyLock;
use std::time::Duration;

use chrono::NaiveDate;
use regex::Regex;

use super::{is_openable_link, schedule, strip_html, SearchResult};

/// How long reading the pages may take in all (they are read at the same time).
pub const FETCH_BUDGET: Duration = Duration::from_millis(2500);
/// How many of the top results are read.
pub const MAX_PAGES: usize = 3;
/// Bytes read from one page; the rest is ignored (the main text is usually near the top).
const MAX_PAGE_BYTES: usize = 1_500_000;
/// Characters of page text given to the AI in all.
pub const MAX_PASSAGE_CHARS: usize = 2400;
/// Characters from one page, so one long page cannot crowd out the others.
const MAX_PAGE_PASSAGE_CHARS: usize = 1200;
/// A longer block (a long paragraph) is split into pieces of about this size.
const MAX_BLOCK_CHARS: usize = 300;
/// Shorter blocks ("Home", "Share") are dropped.
const MIN_BLOCK_CHARS: usize = 8;

/// Elements whose content is never text for a reader: skipped up to their closing tag.
const SKIP_CONTENT: [&str; 11] = [
    "script", "style", "noscript", "svg", "template", "iframe", "textarea", "head", "select",
    "button", "canvas",
];
/// Page furniture around the main text: hidden until the element closes.
const SKIP_SECTION: [&str; 5] = ["nav", "header", "footer", "aside", "menu"];
/// Elements that end one block of text and start the next.
const BLOCK_TAGS: [&str; 24] = [
    "p",
    "div",
    "li",
    "tr",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "br",
    "section",
    "article",
    "main",
    "table",
    "ul",
    "ol",
    "dl",
    "dt",
    "dd",
    "blockquote",
    "pre",
    "hr",
    "caption",
];

/// Reads the first `MAX_PAGES` results' pages at the same time, within `FETCH_BUDGET`.
/// Returns one entry per result: the page's text blocks, or nothing when it was not read.
pub async fn fetch_pages(client: &reqwest::Client, results: &[SearchResult]) -> Vec<Vec<String>> {
    let fetches = results.iter().take(MAX_PAGES).map(|result| async move {
        match tokio::time::timeout(FETCH_BUDGET, fetch_html(client, &result.url)).await {
            Ok(Some(html)) => extract_blocks(&html),
            _ => Vec::new(),
        }
    });
    let mut pages = futures_util::future::join_all(fetches).await;
    pages.resize(results.len(), Vec::new());
    pages
}

/// One page's HTML, or `None` for anything but a successful HTML answer.
async fn fetch_html(client: &reqwest::Client, url: &str) -> Option<String> {
    if !is_openable_link(url) {
        return None;
    }
    let mut response = client
        .get(url)
        .header(
            reqwest::header::ACCEPT,
            "text/html,application/xhtml+xml;q=0.9",
        )
        // Some sites refuse requests without a browser-like user agent. It names no user.
        .header(
            reqwest::header::USER_AGENT,
            "Mozilla/5.0 (Macintosh) Typelite",
        )
        .timeout(FETCH_BUDGET)
        .send()
        .await
        .ok()?;
    if !response.status().is_success() {
        return None;
    }
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !content_type.is_empty() && !content_type.contains("html") {
        return None;
    }
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.ok()? {
        body.extend_from_slice(&chunk);
        if body.len() >= MAX_PAGE_BYTES {
            body.truncate(MAX_PAGE_BYTES);
            break;
        }
    }
    Some(String::from_utf8_lossy(&body).into_owned())
}

/// Reader-mode text of an HTML page: one string per paragraph, list item, heading or table row
/// (table cells joined with " | "). A small scanner, not a full HTML parser: it only has to find
/// text, and a broken page gives less text, never an error.
pub fn extract_blocks(html: &str) -> Vec<String> {
    // ASCII lowercasing keeps every byte offset, so `lower` and `html` index the same way.
    let lower = html.to_ascii_lowercase();
    let mut blocks = Vec::new();
    let mut current = String::new();
    // Depth inside navigation, headers, footers and side bars.
    let mut hidden = 0usize;
    let mut i = 0;
    while let Some(offset) = html[i..].find('<') {
        let start = i + offset;
        if hidden == 0 {
            current.push_str(&html[i..start]);
        }
        if lower[start..].starts_with("<!--") {
            i = lower[start..]
                .find("-->")
                .map_or(html.len(), |end| start + end + 3);
            continue;
        }
        let Some(end) = html[start..].find('>').map(|end| start + end) else {
            i = html.len();
            break;
        };
        let tag = &lower[start + 1..end];
        let closing = tag.starts_with('/');
        let name: String = tag
            .trim_start_matches('/')
            .chars()
            .take_while(char::is_ascii_alphanumeric)
            .collect();
        i = end + 1;
        if !closing && !tag.ends_with('/') && SKIP_CONTENT.contains(&name.as_str()) {
            // Jump to the closing tag; a script may hold "<p>" in a string.
            let close = format!("</{name}");
            i = lower[i..].find(&close).map_or(html.len(), |pos| i + pos);
            continue;
        }
        if SKIP_SECTION.contains(&name.as_str()) {
            flush_block(&mut current, &mut blocks);
            if closing {
                hidden = hidden.saturating_sub(1);
            } else if !tag.ends_with('/') {
                hidden += 1;
            }
        } else if matches!(name.as_str(), "td" | "th") && !closing {
            current.push_str(" | ");
        } else if BLOCK_TAGS.contains(&name.as_str()) {
            flush_block(&mut current, &mut blocks);
        }
    }
    if hidden == 0 && i < html.len() {
        current.push_str(&html[i..]);
    }
    flush_block(&mut current, &mut blocks);
    blocks
}

/// Ends the current block: entities decoded, spaces folded, long text split.
fn flush_block(current: &mut String, blocks: &mut Vec<String>) {
    let text = decode_numeric_entities(&strip_html(current));
    current.clear();
    let text = text.trim_matches(|c: char| c == '|' || c.is_whitespace());
    if text.chars().count() < MIN_BLOCK_CHARS {
        return;
    }
    blocks.extend(split_long(text));
}

/// `&#8211;` and `&#x2013;` (named entities are decoded by `strip_html`).
fn decode_numeric_entities(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(start) = rest.find("&#") {
        out.push_str(&rest[..start]);
        let after = &rest[start + 2..];
        let decoded = after.find(';').filter(|end| *end <= 8).and_then(|end| {
            let digits = &after[..end];
            let code = match digits.strip_prefix(['x', 'X']) {
                Some(hex) => u32::from_str_radix(hex, 16).ok()?,
                None => digits.parse().ok()?,
            };
            Some((char::from_u32(code)?, end))
        });
        match decoded {
            Some((c, end)) => {
                // A non-breaking space is a space.
                out.push(if c == '\u{a0}' { ' ' } else { c });
                rest = &after[end + 1..];
            }
            None => {
                out.push_str("&#");
                rest = after;
            }
        }
    }
    out.push_str(rest);
    out
}

/// Splits a long block at a space or sentence end near `MAX_BLOCK_CHARS`, so a date is never cut.
fn split_long(text: &str) -> Vec<String> {
    let mut pieces = Vec::new();
    let mut piece = String::new();
    let mut count = 0;
    for c in text.chars() {
        piece.push(c);
        count += 1;
        let boundary = c.is_whitespace() || matches!(c, '。' | '！' | '？' | '；');
        if (count >= MAX_BLOCK_CHARS && boundary) || count >= MAX_BLOCK_CHARS * 2 {
            pieces.push(piece.trim().to_string());
            piece.clear();
            count = 0;
        }
    }
    if !piece.trim().is_empty() {
        pieces.push(piece.trim().to_string());
    }
    pieces
}

/// Words that say nothing about a question's topic.
const STOP_WORDS: [&str; 32] = [
    "the", "and", "when", "what", "where", "which", "who", "whom", "why", "how", "are", "was",
    "were", "will", "does", "did", "has", "have", "for", "with", "from", "that", "this", "there",
    "about", "into", "its", "can", "could", "would", "should", "please",
];

/// Characters of scripts written without spaces (Chinese, Japanese, Korean).
fn is_cjk(c: char) -> bool {
    matches!(c,
        '\u{3040}'..='\u{30ff}'
        | '\u{3400}'..='\u{4dbf}'
        | '\u{4e00}'..='\u{9fff}'
        | '\u{ac00}'..='\u{d7af}'
        | '\u{f900}'..='\u{faff}')
}

/// The comparable words of `text`: lowercase words of three or more letters (or two with a
/// digit, like "f1"), and pairs of neighbouring characters for scripts without spaces.
fn terms(text: &str) -> HashSet<String> {
    let mut out = HashSet::new();
    let mut word = String::new();
    let mut previous_cjk: Option<char> = None;
    let push_word = |word: &mut String, out: &mut HashSet<String>| {
        let long_enough = word.chars().count() >= 3
            || (word.chars().count() == 2 && word.chars().any(|c| c.is_ascii_digit()));
        if long_enough && !STOP_WORDS.contains(&word.as_str()) {
            out.insert(word.clone());
        }
        word.clear();
    };
    for c in text.chars().flat_map(char::to_lowercase) {
        if is_cjk(c) {
            push_word(&mut word, &mut out);
            if let Some(previous) = previous_cjk {
                out.insert(format!("{previous}{c}"));
            }
            previous_cjk = Some(c);
        } else if c.is_alphanumeric() {
            word.push(c);
            previous_cjk = None;
        } else {
            push_word(&mut word, &mut out);
            previous_cjk = None;
        }
    }
    push_word(&mut word, &mut out);
    out
}

/// Picks the page text worth giving the AI. Each block scores one point per question or query
/// word it shares, plus two when it holds a date on or after `today` and the question is about
/// something upcoming or the block shares a word (schedules are tables of dates that rarely
/// repeat the question's words). For an upcoming question, a block whose dates are all past
/// loses a point. Blocks scoring nothing are dropped; the rest go in best
/// first, within `MAX_PASSAGE_CHARS` (and `MAX_PAGE_PASSAGE_CHARS` per page), then back in page
/// order. Returns one string per result (empty when nothing was kept).
pub fn select_passages(
    pages: &[Vec<String>],
    results: &[SearchResult],
    question: &str,
    query: &str,
    today: NaiveDate,
    upcoming: bool,
) -> Vec<String> {
    let mut wanted = terms(question);
    wanted.extend(terms(query));
    let mut candidates = Vec::new();
    for (page, blocks) in pages.iter().enumerate() {
        let title = results.get(page).map_or("", |result| result.title.as_str());
        for (index, block) in blocks.iter().enumerate() {
            let overlap = terms(block).intersection(&wanted).count();
            let future = schedule::first_future_date_in(block, title, today).is_some();
            // A future date counts for an upcoming question, or next to the question's words.
            let date_bonus = if future && (upcoming || overlap > 0) {
                2
            } else {
                0
            };
            let mut score = overlap + date_bonus;
            if upcoming && !future && !date_mentions(block).is_empty() {
                score = score.saturating_sub(1);
            }
            if score > 0 {
                candidates.push((score, page, index));
            }
        }
    }
    candidates.sort_by_key(|&(score, page, index)| (std::cmp::Reverse(score), page, index));
    let mut total = 0;
    let mut per_page = vec![0usize; pages.len()];
    let mut seen = HashSet::new();
    let mut chosen: Vec<(usize, usize)> = Vec::new();
    for (_, page, index) in candidates {
        let block = &pages[page][index];
        let length = block.chars().count() + 1;
        if total + length > MAX_PASSAGE_CHARS
            || per_page[page] + length > MAX_PAGE_PASSAGE_CHARS
            || !seen.insert(block.as_str())
        {
            continue;
        }
        total += length;
        per_page[page] += length;
        chosen.push((page, index));
    }
    chosen.sort_unstable();
    let mut passages = vec![String::new(); results.len().max(pages.len())];
    for (page, index) in chosen {
        let passage = &mut passages[page];
        if !passage.is_empty() {
            passage.push('\n');
        }
        passage.push_str(&pages[page][index]);
    }
    passages
}

/// The text the AI was given to answer from: titles, snippets, page passages, and today's date
/// (the prompt states it). Not the publish dates: a publish date is not an event's date.
pub fn evidence_text(results: &[SearchResult], passages: &[String], today: NaiveDate) -> String {
    let mut evidence = today.format("%-d %B %Y").to_string();
    for (index, result) in results.iter().enumerate() {
        evidence.push('\n');
        evidence.push_str(&result.title);
        evidence.push('\n');
        evidence.push_str(&result.snippet);
        if let Some(passage) = passages.get(index) {
            evidence.push('\n');
            evidence.push_str(passage);
        }
    }
    evidence
}

/// A calendar date written in a text. The year is `None` when the text leaves it out.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct DateMention {
    pub year: Option<i32>,
    pub month: u32,
    pub day: u32,
}

const MONTHS: &str = "january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec";

/// 2026-10-11, 2026/10/11, 2026.10.11
static ISO_DATE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b").unwrap());
/// 2026年10月11日, 10月11日, 10月11号
static CJK_DATE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?:(\d{4})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*[日号號]").unwrap()
});
/// October 11, 2026; Oct 11; Oct 2–4 2026
static MONTH_DAY: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(&format!(
        r"(?i)\b({MONTHS})\.?\s+(\d{{1,2}})(?:st|nd|rd|th)?\b(?:\s*[-–—]\s*\d{{1,2}}(?:st|nd|rd|th)?\b)?(?:,?\s+(\d{{4}})\b)?"
    ))
    .unwrap()
});
/// 11 October 2026; 2–4 Oct; 11th of October
static DAY_MONTH: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(&format!(
        r"(?i)\b(\d{{1,2}})(?:st|nd|rd|th)?(?:\s*[-–—]\s*\d{{1,2}}(?:st|nd|rd|th)?)?\s+(?:of\s+)?({MONTHS})\b\.?(?:,?\s+(\d{{4}})\b)?"
    ))
    .unwrap()
});

fn month_number(name: &str) -> Option<u32> {
    let prefix = name.get(..3)?.to_ascii_lowercase();
    let months = [
        "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
    ];
    months
        .iter()
        .position(|month| *month == prefix)
        .map(|index| index as u32 + 1)
}

/// Every explicit calendar date in `text` (English month names, ISO and CJK forms). A range
/// counts as its first day. Weekdays and relative words ("tomorrow") are not dates here.
pub fn date_mentions(text: &str) -> Vec<DateMention> {
    let mut mentions = Vec::new();
    let mut push = |year: Option<&str>, month: Option<u32>, day: Option<&str>| {
        let year = match year {
            Some(year) => match year.parse::<i32>() {
                Ok(year) if (1900..=2199).contains(&year) => Some(year),
                _ => return,
            },
            None => None,
        };
        let (Some(month), Some(day)) = (month, day.and_then(|day| day.parse::<u32>().ok())) else {
            return;
        };
        // 2028 is a leap year, so 29 February passes when the year is unknown.
        if NaiveDate::from_ymd_opt(year.unwrap_or(2028), month, day).is_some() {
            mentions.push(DateMention { year, month, day });
        }
    };
    for caps in ISO_DATE.captures_iter(text) {
        push(
            caps.get(1).map(|m| m.as_str()),
            caps.get(2).and_then(|m| m.as_str().parse().ok()),
            caps.get(3).map(|m| m.as_str()),
        );
    }
    for caps in CJK_DATE.captures_iter(text) {
        push(
            caps.get(1).map(|m| m.as_str()),
            caps.get(2).and_then(|m| m.as_str().parse().ok()),
            caps.get(3).map(|m| m.as_str()),
        );
    }
    for caps in MONTH_DAY.captures_iter(text) {
        push(
            caps.get(3).map(|m| m.as_str()),
            caps.get(1).and_then(|m| month_number(m.as_str())),
            caps.get(2).map(|m| m.as_str()),
        );
    }
    for caps in DAY_MONTH.captures_iter(text) {
        push(
            caps.get(3).map(|m| m.as_str()),
            caps.get(2).and_then(|m| month_number(m.as_str())),
            caps.get(1).map(|m| m.as_str()),
        );
    }
    mentions
}

/// How many explicit dates in `answer` the sources do not back. A date is backed when the
/// evidence (the text the AI was given) names the same day and month, with the same year when
/// both give one; the wording may differ ("11 Oct" backs "October 11, 2026"). For an upcoming
/// question a date before `today` is not backed, and neither is a year-less date whose only
/// match in the evidence is a past one.
pub fn unsupported_dates(answer: &str, evidence: &str, today: NaiveDate, upcoming: bool) -> usize {
    let known = date_mentions(evidence);
    let is_past = |mention: &DateMention| {
        mention
            .year
            .and_then(|year| NaiveDate::from_ymd_opt(year, mention.month, mention.day))
            .is_some_and(|date| date < today)
    };
    date_mentions(answer)
        .iter()
        .filter(|mention| {
            if upcoming && is_past(mention) {
                return true;
            }
            !known.iter().any(|source| {
                source.month == mention.month
                    && source.day == mention.day
                    && (mention.year.is_none()
                        || source.year.is_none()
                        || source.year == mention.year)
                    && !(upcoming && is_past(source))
            })
        })
        .count()
}

#[cfg(test)]
mod tests {
    use super::*;

    const RACE_CALENDAR: &str = include_str!("../../tests/fixtures/ask_pages/race_calendar.html");
    const LEAGUE_FIXTURES: &str =
        include_str!("../../tests/fixtures/ask_pages/league_fixtures_zh.html");

    fn result(title: &str, url: &str, snippet: &str) -> SearchResult {
        SearchResult {
            title: title.into(),
            url: url.into(),
            snippet: snippet.into(),
            published_date: None,
        }
    }

    fn today() -> NaiveDate {
        NaiveDate::from_ymd_opt(2026, 10, 8).unwrap()
    }

    #[test]
    fn extraction_keeps_main_text_and_table_rows_and_drops_page_furniture() {
        let blocks = extract_blocks(RACE_CALENDAR);
        let text = blocks.join("\n");
        assert!(blocks.contains(&"19 | Singapore Grand Prix | 11 October 2026".to_string()));
        assert!(blocks.contains(&"18 | Malaysian Grand Prix | 2–4 October 2026".to_string()));
        assert!(text.contains("Updated & confirmed by the organisers on 2 March 2026."));
        for hidden in [
            "tracker",
            "console",
            "font-weight",
            "Shop",
            "Commented out",
            "Sponsored",
            "Copyright",
            "enable JavaScript",
            "Example Motorsport",
        ] {
            assert!(!text.contains(hidden), "{hidden}");
        }
        let chinese = extract_blocks(LEAGUE_FIXTURES);
        assert!(
            chinese.contains(&"第4輪：東方對理文，2026年10月18日 16:00，香港大球場。".to_string())
        );
    }

    #[test]
    fn extraction_survives_broken_html_and_splits_long_paragraphs() {
        assert_eq!(
            extract_blocks("<p>Unclosed paragraph text"),
            ["Unclosed paragraph text"]
        );
        assert_eq!(extract_blocks("<p>Cut off here <b"), ["Cut off here"]);
        assert!(extract_blocks("<script>never closed").is_empty());
        let long = format!("<p>{}</p>", "word ".repeat(200));
        let blocks = extract_blocks(&long);
        assert!(blocks.len() > 2);
        assert!(blocks
            .iter()
            .all(|block| block.chars().count() <= MAX_BLOCK_CHARS * 2));
        assert_eq!(
            decode_numeric_entities("a&#8211;b&#x2014;c&#bad;"),
            "a–b—c&#bad;"
        );
    }

    #[test]
    fn passages_prefer_question_words_and_future_dates_within_the_cap() {
        let results = vec![
            result("2026 Racing Calendar", "https://a.example/", "Calendar."),
            result("香港超級聯賽 賽程", "https://b.example/", "賽程。"),
        ];
        let pages = vec![
            extract_blocks(RACE_CALENDAR),
            extract_blocks(LEAGUE_FIXTURES),
        ];
        let passages = select_passages(
            &pages,
            &results,
            "When is the next grand prix?",
            "next grand prix 2026",
            today(),
            true,
        );
        assert_eq!(passages.len(), 2);
        assert!(passages[0].contains("Singapore Grand Prix | 11 October 2026"));
        assert!(passages[0].contains("Japanese Grand Prix | 25 October 2026"));
        // Past rows share the question's words but rank below the future ones; the ad and the
        // furniture never made it into the blocks.
        let singapore = passages[0].find("Singapore").unwrap();
        assert!(!passages[0].contains("Sponsored"));
        assert!(passages[0]
            .find("Round")
            .is_none_or(|round| round < singapore));
        // The Chinese page: only its future fixture holds a date after today.
        assert!(passages[1].contains("2026年10月18日"));
        assert!(!passages[1].contains("網站使用條款"));

        // The cap holds even with many matching blocks.
        let many = vec![(0..200)
            .map(|n| format!("Grand prix news item {n} on 20 October 2026"))
            .collect::<Vec<_>>()];
        let passages = select_passages(&many, &results[..1], "grand prix", "", today(), true);
        assert!(passages[0].chars().count() <= MAX_PAGE_PASSAGE_CHARS);
        assert!(passages.iter().map(|p| p.chars().count()).sum::<usize>() <= MAX_PASSAGE_CHARS);
        // Nothing relevant: nothing kept.
        let passages = select_passages(&pages, &results, "weather in Oslo", "", today(), false);
        assert!(passages.iter().all(String::is_empty));
    }

    #[test]
    fn date_mentions_read_english_iso_and_cjk_forms() {
        let d = |year: Option<i32>, month, day| DateMention { year, month, day };
        assert_eq!(
            date_mentions("Oct 11, 2026; 2–4 October 2026; 2026-10-25; 2026年10月18日; 10月4日; the 3rd of May"),
            vec![
                d(Some(2026), 10, 25),
                d(Some(2026), 10, 18),
                d(None, 10, 4),
                d(Some(2026), 10, 11),
                d(Some(2026), 10, 2),
                d(None, 5, 3),
            ]
        );
        assert!(date_mentions("Round 19, 2026 season, 16:00, Sunday").is_empty());
        assert!(date_mentions("October 39, 2026 and 2026-13-01").is_empty());
    }

    #[test]
    fn date_check_accepts_reworded_dates_and_rejects_invented_or_past_ones() {
        let evidence = "Singapore Grand Prix | 11 October 2026\nItalian GP Sep 19, 2026\n東方對理文，2026年10月18日";
        for answer in [
            "The next race is the Singapore Grand Prix on October 11, 2026 [1].",
            "Singapore GP: Oct 11 [1].",
            "下一場是2026年10月18日 [2]。",
            "No dates here, see the sources [1].",
        ] {
            assert_eq!(
                unsupported_dates(answer, evidence, today(), true),
                0,
                "{answer}"
            );
        }
        for answer in [
            "The next race is on October 12, 2026 [1].",
            "The next race is the Italian GP on 19 September 2026 [1].",
            "It is on 19 September [1].",
            "Singapore on 11 October 2027 [1].",
        ] {
            assert_eq!(
                unsupported_dates(answer, evidence, today(), true),
                1,
                "{answer}"
            );
        }
        // Not an upcoming question: a past date from the sources is fine.
        assert_eq!(
            unsupported_dates(
                "The Italian GP was on 19 September 2026 [1].",
                evidence,
                today(),
                false
            ),
            0
        );
    }

    /// The case from the log: five thin snippets, none with an event name next to its date,
    /// so the old verbatim extraction accepted nothing. With page passages the answer is
    /// written by the normal path, and its reworded date passes the check with a citation.
    #[test]
    fn thin_snippets_with_a_read_page_give_a_cited_checked_answer() {
        let results = vec![
            result(
                "F1 Schedule 2026 - Official Calendar",
                "https://a.example/schedule",
                "Oct 1, 2026 · Find out the dates of every race of the 2026 season.",
            ),
            result(
                "2026 Racing Calendar",
                "https://b.example/calendar",
                "The 2026 season has 22 rounds. See the full calendar.",
            ),
            result(
                "Next race preview",
                "https://c.example/preview",
                "Everything you need to know before the next race weekend.",
            ),
            result(
                "F1 TV schedule",
                "https://d.example/tv",
                "How to watch every session live.",
            ),
            result(
                "Italian GP results",
                "https://e.example/italy",
                "Sep 19, 2026 · Results of the Italian Grand Prix.",
            ),
        ];
        let mut pages = vec![Vec::new(); results.len()];
        pages[1] = extract_blocks(RACE_CALENDAR);
        let passages = select_passages(
            &pages,
            &results,
            "When is the next F1 race?",
            "next F1 race 2026",
            today(),
            true,
        );
        assert!(passages[1].contains("Singapore Grand Prix | 11 October 2026"));

        let messages = super::super::answer_messages_with_pages(
            "When is the next F1 race?",
            &results,
            &passages,
            "Thursday 8 October 2026",
            Some("en"),
        );
        let user = messages[1]["content"].as_str().unwrap();
        assert!(user.contains("Page text:\n"));
        assert!(user.contains("11 October 2026"));
        let system = messages[0]["content"].as_str().unwrap();
        assert!(system.contains("Only state dates and times that appear in the results"));

        // What a small model writes: reworded, not copied.
        let answer = "The next F1 race is the Singapore Grand Prix on October 11, 2026 [2].";
        let evidence = evidence_text(&results, &passages, today());
        assert_eq!(unsupported_dates(answer, &evidence, today(), true), 0);
        let sources = super::super::answer_sources(answer, &results);
        assert_eq!(sources.len(), 1);
        assert_eq!(sources[0].number, 2);
        // The snippets alone would not back it.
        let snippets_only = evidence_text(&results, &[], today());
        assert_eq!(unsupported_dates(answer, &snippets_only, today(), true), 1);
        // The publication date in a snippet prefix is past, so it cannot be "the next race".
        assert_eq!(
            unsupported_dates(
                "The next race is on Oct 1, 2026 [1].",
                &evidence,
                today(),
                true
            ),
            1
        );
    }
}
