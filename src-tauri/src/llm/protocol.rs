//! Request and response helpers for the one AI provider type: an OpenAI-compatible
//! `POST {base_url}/chat/completions` endpoint (Ollama, llama.cpp server, LM Studio, ...).

use reqwest::RequestBuilder;
use serde_json::{json, Map, Value};
use std::time::Duration;

/// Timeout for one chat request. Small local models answer in well under a second once
/// warm; the long timeout covers a cold model load on the server.
pub const REQUEST_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Debug, Default, PartialEq, Eq)]
pub struct StreamEvent {
    pub text: Option<String>,
    pub reasoning: Option<String>,
    pub error: Option<String>,
    pub done: bool,
}

fn parse_http_url(base_url: &str) -> Result<url::Url, String> {
    let mut url = url::Url::parse(base_url.trim())
        .map_err(|error| format!("Invalid AI base URL: {error}"))?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("AI base URL must use http or https scheme".to_string());
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("AI base URL must not include credentials".to_string());
    }
    if url.fragment().is_some() {
        return Err("AI base URL must not include a fragment".to_string());
    }
    url.set_fragment(None);
    Ok(url)
}

/// `{base_url}/chat/completions`, unless the user already entered the full endpoint.
pub fn chat_endpoint(base_url: &str) -> Result<String, String> {
    let mut url = parse_http_url(base_url)?;
    let path = url.path().trim_end_matches('/').to_string();
    if !path.ends_with("/chat/completions") {
        url.set_path(&format!("{path}/chat/completions"));
    }
    Ok(url.to_string())
}

/// `{base_url}/models`. A base URL that ends in `/chat/completions` is trimmed first.
pub fn models_endpoint(base_url: &str) -> Result<String, String> {
    let mut url = parse_http_url(base_url)?;
    let path = url.path().trim_end_matches('/');
    let root = path.strip_suffix("/chat/completions").unwrap_or(path);
    url.set_path(&format!("{root}/models"));
    Ok(url.to_string())
}

/// Builds the chat request body.
///
/// Every key of `extra` is copied into the body last, so extras win over the defaults.
/// For example `{"temperature": 0.7}` replaces the default temperature, and
/// `{"reasoning_effort": "none"}` turns off thinking for models that think by default.
pub fn build_chat_body(
    model: &str,
    messages: Vec<Value>,
    max_tokens: u32,
    temperature: f64,
    stream: bool,
    extra: &Map<String, Value>,
) -> Value {
    let mut body = json!({
        "model": model,
        "messages": messages,
        "stream": stream,
        "max_tokens": max_tokens,
        "temperature": temperature,
    });
    let object = body
        .as_object_mut()
        .expect("chat body is always a JSON object");
    for (key, value) in extra {
        object.insert(key.clone(), value.clone());
    }
    body
}

/// Adds `Authorization: Bearer <key>` only when a key is set. Local servers such as
/// Ollama need no key.
pub fn apply_auth_headers(request: RequestBuilder, api_key: &str) -> RequestBuilder {
    let api_key = api_key.trim();
    if api_key.is_empty() {
        request
    } else {
        request.header("Authorization", format!("Bearer {api_key}"))
    }
}

/// Text of a non-streaming chat response. Falls back to `reasoning_content` for servers
/// that put the whole answer there.
pub fn response_text(body: &Value) -> String {
    let message = &body["choices"][0]["message"];
    message["content"]
        .as_str()
        .filter(|content| !content.is_empty())
        .or_else(|| message["reasoning_content"].as_str())
        .unwrap_or("")
        .to_string()
}

/// One `data:` line of a streaming chat response.
pub fn parse_stream_event(body: &Value) -> StreamEvent {
    if let Some(message) = body["error"]["message"].as_str() {
        return StreamEvent {
            error: Some(message.to_string()),
            ..StreamEvent::default()
        };
    }
    let delta = &body["choices"][0]["delta"];
    StreamEvent {
        text: delta["content"].as_str().map(str::to_string),
        reasoning: delta["reasoning_content"].as_str().map(str::to_string),
        ..StreamEvent::default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn messages() -> Vec<Value> {
        vec![
            json!({"role": "system", "content": "Be concise."}),
            json!({"role": "user", "content": "Hello"}),
        ]
    }

    #[test]
    fn chat_endpoint_appends_path_once() {
        for base_url in [
            "http://100.90.208.26:11434/v1",
            "http://100.90.208.26:11434/v1/",
            "http://100.90.208.26:11434/v1/chat/completions",
        ] {
            assert_eq!(
                chat_endpoint(base_url).unwrap(),
                "http://100.90.208.26:11434/v1/chat/completions"
            );
        }
    }

    #[test]
    fn models_endpoint_replaces_chat_path() {
        assert_eq!(
            models_endpoint("http://localhost:11434/v1").unwrap(),
            "http://localhost:11434/v1/models"
        );
        assert_eq!(
            models_endpoint("http://localhost:11434/v1/chat/completions").unwrap(),
            "http://localhost:11434/v1/models"
        );
    }

    #[test]
    fn endpoints_reject_bad_urls() {
        assert!(chat_endpoint("ftp://example.com").is_err());
        assert!(chat_endpoint("https://user:pw@example.com/v1").is_err());
        assert!(models_endpoint("not a url").is_err());
    }

    #[test]
    fn chat_body_has_defaults_without_extras() {
        let body = build_chat_body("qwen3", messages(), 256, 0.3, true, &Map::new());

        assert_eq!(body["model"], "qwen3");
        assert_eq!(body["messages"].as_array().unwrap().len(), 2);
        assert_eq!(body["max_tokens"], 256);
        assert_eq!(body["temperature"], 0.3);
        assert_eq!(body["stream"], true);
    }

    #[test]
    fn chat_body_extras_are_added_and_override_defaults() {
        let extra = json!({"reasoning_effort": "none", "temperature": 0.7})
            .as_object()
            .unwrap()
            .clone();
        let body = build_chat_body("qwen3", messages(), 256, 0.3, false, &extra);

        assert_eq!(body["reasoning_effort"], "none");
        assert_eq!(body["temperature"], 0.7);
        assert_eq!(body["max_tokens"], 256);
    }

    #[test]
    fn auth_header_is_sent_only_with_a_key() {
        let with_key = apply_auth_headers(
            reqwest::Client::new().post("http://localhost:11434/v1/chat/completions"),
            " sk-test ",
        )
        .build()
        .unwrap();
        assert_eq!(with_key.headers()["Authorization"], "Bearer sk-test");

        let without_key = apply_auth_headers(
            reqwest::Client::new().post("http://localhost:11434/v1/chat/completions"),
            "  ",
        )
        .build()
        .unwrap();
        assert!(without_key.headers().get("Authorization").is_none());
    }

    #[test]
    fn response_text_falls_back_to_reasoning_content() {
        let body = json!({"choices": [{"message": {"content": "", "reasoning_content": "Hi"}}]});
        assert_eq!(response_text(&body), "Hi");

        let body = json!({"choices": [{"message": {"content": "Hello"}}]});
        assert_eq!(response_text(&body), "Hello");
    }

    #[test]
    fn stream_events_parse_content_reasoning_and_errors() {
        let event = parse_stream_event(&json!({"choices": [{"delta": {"content": "Hel"}}]}));
        assert_eq!(event.text.as_deref(), Some("Hel"));

        let event =
            parse_stream_event(&json!({"choices": [{"delta": {"reasoning_content": "hmm"}}]}));
        assert_eq!(event.reasoning.as_deref(), Some("hmm"));

        let event = parse_stream_event(&json!({"error": {"message": "model not found"}}));
        assert_eq!(event.error.as_deref(), Some("model not found"));
    }
}
