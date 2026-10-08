//! Upcoming-event questions: detection and date reading. Search ranks results with a future
//! date first, and `pages::unsupported_dates` checks an answer's dates (plan `ask-read-pages`).
//! A small model must not turn a publication date or an undated calendar page into a
//! confidently invented schedule.

use chrono::NaiveDate;

use super::SearchResult;

pub fn is_upcoming_question(question: &str) -> bool {
    let lower = question.to_lowercase();
    lower
        .split(|c: char| !c.is_alphabetic())
        .any(|word| matches!(word, "next" | "upcoming"))
        || [
            "下場",
            "下场",
            "下一",
            "下次",
            "下個",
            "下个",
            "接下來",
            "接下来",
        ]
        .iter()
        .any(|word| question.contains(word))
}

/// Find date-bearing snippets before the result cap removes them. This only ranks evidence;
/// the answer's dates are checked later against the text the AI was given.
pub fn first_future_date(result: &SearchResult, today: NaiveDate) -> Option<NaiveDate> {
    let snippet = result
        .snippet
        .split_once(" · ")
        .filter(|(prefix, _)| prefix.chars().count() < 50)
        .map_or(result.snippet.as_str(), |(_, rest)| rest);
    first_future_date_in(snippet, &result.title, today)
}

/// The earliest date on or after `today` in `snippet`. A year-less date counts only when
/// `title` names one year (see `event_date`). Plan `ask-read-pages` uses it to rank passages.
pub fn first_future_date_in(snippet: &str, title: &str, today: NaiveDate) -> Option<NaiveDate> {
    let mut previous = ' ';
    let mut earliest = None;
    for (index, c) in snippet.char_indices() {
        let text = &snippet[index..];
        let starts_date = (c.is_ascii_digit() && !previous.is_ascii_digit())
            || (c.is_ascii_alphabetic()
                && !previous.is_ascii_alphabetic()
                && [
                    "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov",
                    "dec",
                ]
                .iter()
                .any(|month| text.get(..3).is_some_and(|s| s.eq_ignore_ascii_case(month))));
        if starts_date {
            if let Some(date) = event_date(text, title).filter(|date| *date >= today) {
                earliest = Some(earliest.map_or(date, |old: NaiveDate| old.min(date)));
            }
        }
        previous = c;
    }
    earliest
}

/// Read an actual date at the start of the copied date text. Never use today's year to repair
/// an old result: a missing year is accepted only when the result title names one season.
fn event_date(text: &str, title: &str) -> Option<NaiveDate> {
    // European day ranges: "2–4 October 2026" / "02 - 04 OCT". Keep the quoted range in
    // the answer, but compare its first day. ISO dates have a four-digit prefix, so skip them.
    let range = text.replace(['–', '—'], "-");
    if let Some((start, rest)) = range.split_once('-') {
        let start = start.trim();
        let rest = rest.trim_start();
        if (1..=2).contains(&start.len()) && start.chars().all(|c| c.is_ascii_digit()) {
            let month = rest
                .trim_start_matches(|c: char| c.is_ascii_digit())
                .trim_start();
            if month.len() < rest.len() && month.starts_with(|c: char| c.is_ascii_alphabetic()) {
                return event_date(&format!("{start} {month}"), title);
            }
        }
    }
    let prefixes: Vec<_> = text
        .char_indices()
        // Never rescue an invalid day/year by truncating its last digit.
        .filter(|(i, c)| !text[i + c.len_utf8()..].starts_with(|next: char| next.is_ascii_digit()))
        .map(|(i, c)| &text[..i + c.len_utf8()])
        .take(60)
        .collect();
    for prefix in prefixes.iter().rev() {
        for format in [
            "%Y-%m-%d",
            "%Y/%m/%d",
            "%Y年%m月%d日",
            "%b %e, %Y",
            "%B %e, %Y",
            "%b %e %Y",
            "%B %e %Y",
            "%e %b %Y",
            "%e %B %Y",
        ] {
            if let Ok(date) = NaiveDate::parse_from_str(prefix.trim(), format) {
                return Some(date);
            }
        }
    }
    let mut years: Vec<_> = title
        .split(|c: char| !c.is_ascii_digit())
        .filter(|part| part.len() == 4)
        .filter_map(|part| part.parse::<i32>().ok())
        .filter(|year| (1900..=2199).contains(year))
        .collect();
    years.sort_unstable();
    years.dedup();
    if years.len() != 1 {
        return None;
    }
    for prefix in prefixes.iter().rev() {
        for format in [
            "%m/%d %Y",
            "%m月%d日 %Y",
            "%b %e %Y",
            "%B %e %Y",
            "%e %b %Y",
            "%e %B %Y",
        ] {
            if let Ok(date) =
                NaiveDate::parse_from_str(&format!("{} {}", prefix.trim(), years[0]), format)
            {
                return Some(date);
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn result(title: &str, snippet: &str) -> SearchResult {
        SearchResult {
            title: title.into(),
            snippet: snippet.into(),
            url: "https://example.com/calendar".into(),
            published_date: None,
        }
    }

    fn today() -> NaiveDate {
        NaiveDate::from_ymd_opt(2026, 10, 1).unwrap()
    }

    #[test]
    fn first_future_date_skips_the_publication_prefix_and_past_dates() {
        let r = result(
            "2026 calendar",
            "Oct 1, 2004 · Italian GP Sep 19, 2026. Singapore GP Oct 11, 2026.",
        );
        assert_eq!(
            first_future_date(&r, today()),
            NaiveDate::from_ymd_opt(2026, 10, 11)
        );
        assert_eq!(
            first_future_date(&result("2026", "Old GP Sep 2, 2026"), today()),
            None
        );
    }

    #[test]
    fn parses_copied_dates_without_inventing_a_year() {
        for text in [
            "2026-10-02",
            "2026年10月2日至4日",
            "October 2, 2026",
            "2 October 2026",
            "10/2",
            "Oct 2 – 4",
            "10月2日",
            "2–4 October 2026",
            "02 - 04 OCT",
        ] {
            assert_eq!(
                event_date(text, "2026 calendar"),
                NaiveDate::from_ymd_opt(2026, 10, 2),
                "{text}"
            );
        }
        assert_eq!(event_date("10/2", "Calendar"), None);
        assert_eq!(event_date("10/2", "2025 and 2026 calendars"), None);
        assert_eq!(event_date("2026 calendar", "2026"), None);
        assert_eq!(event_date("2026-10-39", "2026"), None);
    }

    #[test]
    fn upcoming_detection_handles_spoken_english_and_chinese() {
        for question in [
            "When is the next F1 race?",
            "Upcoming races",
            "幾時下場F1?",
            "下一场比赛是什么时候？",
        ] {
            assert!(is_upcoming_question(question));
        }
        for question in ["Who won yesterday?", "F1 2025 results"] {
            assert!(!is_upcoming_question(question));
        }
    }
}
