use serde::Serialize;
use std::time::Duration;
use tauri::Emitter;

/// Structured error sent to the frontend via Tauri events.
/// The frontend uses `code` to look up an i18n-translated message.
#[derive(Debug, Clone, Serialize)]
pub struct UserError {
    pub code: String,
    pub details: Option<String>,
    pub retry_count: u32,
}

/// Internal error type used throughout the Rust backend.
/// Provides `is_retryable()` for retry logic and `to_user_error()` for frontend display.
#[derive(Debug)]
pub enum AppError {
    Network(String),
    Timeout(Duration),
    Api { status: u16, body: String },
    Auth(String),
    Quota(String),
    LlmQuota(String),
    Output(String),
    Config(String),
}

/// "HTTP 500: <first line of the server's message>" so the user sees why a request failed.
fn api_error_details(status: u16, body: &str) -> String {
    let message = body
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .unwrap_or("");
    let short: String = message.chars().take(160).collect();
    if short.is_empty() {
        format!("HTTP {status}")
    } else {
        format!("HTTP {status}: {short}")
    }
}

impl AppError {
    pub fn is_retryable(&self) -> bool {
        match self {
            AppError::Network(_) => true,
            AppError::Timeout(_) => true,
            AppError::Api { status, .. } => *status >= 500,
            AppError::Auth(_) => false,
            AppError::Quota(_) => false,
            AppError::LlmQuota(_) => false,
            AppError::Output(_) => false,
            AppError::Config(_) => false,
        }
    }

    pub fn to_user_error(&self) -> UserError {
        let (code, details) = match self {
            AppError::Network(msg) => ("stt_unreachable".to_string(), Some(msg.clone())),
            AppError::Timeout(d) => (
                "stt_timeout".to_string(),
                Some(format!("{:.0} s", d.as_secs_f64())),
            ),
            AppError::Api { status, body } => {
                if *status == 401 || *status == 403 {
                    ("stt_invalid_key".to_string(), None)
                } else {
                    (
                        "stt_failed".to_string(),
                        Some(api_error_details(*status, body)),
                    )
                }
            }
            AppError::Auth(msg) => ("stt_invalid_key".to_string(), Some(msg.clone())),
            AppError::Quota(msg) => ("stt_quota_exceeded".to_string(), Some(msg.clone())),
            AppError::LlmQuota(msg) => ("llm_quota_exceeded".to_string(), Some(msg.clone())),
            AppError::Output(msg) => ("output_fallback_clipboard".to_string(), Some(msg.clone())),
            AppError::Config(msg) => ("stt_failed".to_string(), Some(msg.clone())),
        };
        UserError {
            code,
            details,
            retry_count: 0,
        }
    }

    pub fn with_retry_count(self, count: u32) -> UserError {
        let mut ue = self.to_user_error();
        ue.retry_count = count;
        ue
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AppError::Network(msg) => write!(f, "Network error: {}", msg),
            AppError::Timeout(d) => write!(f, "Timeout after {:.1}s", d.as_secs_f64()),
            AppError::Api { status, body } => write!(f, "API error {}: {}", status, body),
            AppError::Auth(msg) => write!(f, "Auth error: {}", msg),
            AppError::Quota(msg) => write!(f, "Quota error: {}", msg),
            AppError::LlmQuota(msg) => write!(f, "LLM quota error: {}", msg),
            AppError::Output(msg) => write!(f, "Output error: {}", msg),
            AppError::Config(msg) => write!(f, "Config error: {}", msg),
        }
    }
}

impl std::error::Error for AppError {}

impl From<reqwest::Error> for AppError {
    fn from(e: reqwest::Error) -> Self {
        if e.is_timeout() {
            AppError::Timeout(Duration::from_secs(30))
        } else if let Some(status) = e.status() {
            AppError::Api {
                status: status.as_u16(),
                body: e.to_string(),
            }
        } else {
            AppError::Network(e.to_string())
        }
    }
}

/// Retry an async operation with exponential backoff.
///
/// - `max_retries`: number of retries (0 = no retry)
/// - `f`: closure returning a Future that produces Result<T, AppError>
///
/// Emits a `pipeline:retry` event on each retry attempt.
pub async fn with_retry<F, Fut, T>(
    app_handle: &tauri::AppHandle,
    max_retries: u32,
    f: F,
) -> Result<T, AppError>
where
    F: Fn() -> Fut,
    Fut: std::future::Future<Output = Result<T, AppError>>,
{
    let mut last_error: Option<AppError> = None;
    for attempt in 0..=max_retries {
        match f().await {
            Ok(result) => return Ok(result),
            Err(e) if e.is_retryable() && attempt < max_retries => {
                let delay_ms = 1000 * 2u64.pow(attempt);
                tracing::warn!(
                    "Retryable error (attempt {}/{}): {}, retrying in {}ms",
                    attempt + 1,
                    max_retries,
                    e,
                    delay_ms
                );
                let _ = app_handle.emit(
                    "pipeline:retry",
                    serde_json::json!({
                        "attempt": attempt + 1,
                        "max": max_retries,
                        "error": e.to_string(),
                    }),
                );
                tokio::time::sleep(Duration::from_millis(delay_ms)).await;
                last_error = Some(e);
            }
            Err(e) => return Err(e),
        }
    }
    Err(last_error.unwrap())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn non_http_errors_keep_their_retry_policy_and_localizable_details() {
        for (error, retryable, code, details) in [
            (
                AppError::Network("connection refused".into()),
                true,
                "stt_unreachable",
                "connection refused",
            ),
            (
                AppError::Timeout(Duration::from_secs(10)),
                true,
                "stt_timeout",
                "10 s",
            ),
            (
                AppError::Auth("bad key".into()),
                false,
                "stt_invalid_key",
                "bad key",
            ),
            (
                AppError::Quota("quota exceeded".into()),
                false,
                "stt_quota_exceeded",
                "quota exceeded",
            ),
            (
                AppError::LlmQuota("quota exceeded".into()),
                false,
                "llm_quota_exceeded",
                "quota exceeded",
            ),
            (
                AppError::Output("keyboard failed".into()),
                false,
                "output_fallback_clipboard",
                "keyboard failed",
            ),
            (
                AppError::Config("bad config".into()),
                false,
                "stt_failed",
                "bad config",
            ),
        ] {
            assert_eq!(error.is_retryable(), retryable, "{error:?}");
            let user_error = error.to_user_error();
            assert_eq!(user_error.code, code, "{error:?}");
            assert_eq!(user_error.details.as_deref(), Some(details), "{error:?}");
            assert_eq!(user_error.retry_count, 0);
        }
    }

    #[test]
    fn http_errors_distinguish_auth_failures_and_the_server_retry_boundary() {
        for (status, retryable, code) in [
            (401, false, "stt_invalid_key"),
            (403, false, "stt_invalid_key"),
            (429, false, "stt_failed"),
            (499, false, "stt_failed"),
            (500, true, "stt_failed"),
            (503, true, "stt_failed"),
        ] {
            let error = AppError::Api {
                status,
                body: String::new(),
            };
            assert_eq!(error.is_retryable(), retryable, "HTTP {status}");
            let user_error = error.to_user_error();
            assert_eq!(user_error.code, code, "HTTP {status}");
            let details = if code == "stt_invalid_key" {
                None
            } else {
                Some(format!("HTTP {status}"))
            };
            assert_eq!(user_error.details, details, "HTTP {status}");
        }
    }

    #[test]
    fn api_details_use_the_first_nonempty_line_and_bound_unicode_characters() {
        let error = |body: String| AppError::Api { status: 500, body }.to_user_error();
        assert_eq!(
            error("\n  model not found: large-v9\nstack...".into())
                .details
                .as_deref(),
            Some("HTTP 500: model not found: large-v9")
        );
        assert_eq!(error(" \n ".into()).details.as_deref(), Some("HTTP 500"));
        assert_eq!(
            error("界".repeat(161)).details,
            Some(format!("HTTP 500: {}", "界".repeat(160)))
        );
    }

    #[test]
    fn test_with_retry_count() {
        let err = AppError::Timeout(Duration::from_secs(10));
        let ue = err.with_retry_count(2);
        assert_eq!(ue.retry_count, 2);
    }

    #[test]
    fn test_display_format() {
        let err = AppError::Network("timeout".to_string());
        assert!(err.to_string().contains("Network error"));

        let err = AppError::Timeout(Duration::from_secs(5));
        assert!(err.to_string().contains("Timeout"));

        let err = AppError::Api {
            status: 429,
            body: "rate limited".to_string(),
        };
        assert!(err.to_string().contains("429"));
    }
}
