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

/// Incremental decoder for the provider's newline-delimited SSE data lines.
/// Keep bytes until a complete line arrives: network chunks may split a UTF-8 character.
#[derive(Default)]
pub(super) struct ChatStreamDecoder {
    buffer: Vec<u8>,
    consumed: usize,
    scanned: usize,
}

impl ChatStreamDecoder {
    pub(super) fn push(&mut self, bytes: &[u8]) {
        // Compact once per network chunk, rather than copying the remaining response for
        // every line. Retain the allocation for subsequent chunks.
        if self.consumed > 0 {
            self.buffer.drain(..self.consumed);
            self.scanned -= self.consumed;
            self.consumed = 0;
        }
        self.buffer.extend_from_slice(bytes);
    }

    pub(super) fn next_event(&mut self) -> Option<StreamEvent> {
        loop {
            let Some(offset) = self.buffer[self.scanned..].iter().position(|&b| b == b'\n') else {
                // Do not rescan an incomplete line when another small chunk arrives.
                self.scanned = self.buffer.len();
                return None;
            };
            let end = self.scanned + offset;
            let line = &self.buffer[self.consumed..end];
            self.consumed = end + 1;
            self.scanned = self.consumed;
            // Valid lines are borrowed. Malformed bytes retain the provider's previous
            // replacement-character behavior, without corrupting split valid characters.
            let line = String::from_utf8_lossy(line);
            let Some(data) = line.trim().strip_prefix("data: ") else {
                continue;
            };
            if data == "[DONE]" {
                return Some(StreamEvent {
                    done: true,
                    ..StreamEvent::default()
                });
            }
            if let Ok(value) = serde_json::from_str(data) {
                return Some(parse_stream_event(&value));
            }
        }
    }
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

    fn decode_chunks(chunks: &[&[u8]]) -> Vec<StreamEvent> {
        let mut decoder = ChatStreamDecoder::default();
        let mut events = Vec::new();
        for chunk in chunks {
            decoder.push(chunk);
            while let Some(event) = decoder.next_event() {
                events.push(event);
            }
        }
        events
    }

    #[test]
    fn streaming_preserves_unicode_at_every_byte_boundary() {
        let text = "你好、こんにちは café 🎤";
        let response = format!(
            "data: {}\r\n\r\ndata: [DONE]\r\n\r\n",
            json!({"choices": [{"delta": {"content": text}}]})
        );
        let bytes = response.as_bytes();
        let expected = vec![
            StreamEvent {
                text: Some(text.into()),
                ..StreamEvent::default()
            },
            StreamEvent {
                done: true,
                ..StreamEvent::default()
            },
        ];
        for split in 0..=bytes.len() {
            assert_eq!(
                decode_chunks(&[&bytes[..split], &bytes[split..]]),
                expected,
                "split {split}"
            );
        }
        let byte_chunks: Vec<_> = bytes.chunks(1).collect();
        assert_eq!(decode_chunks(&byte_chunks), expected);
    }

    #[test]
    fn streaming_keeps_partial_lines_after_complete_events() {
        let events = decode_chunks(&[
            b"data: {\"choices\":[{\"delta\":{\"content\":\"one\"}}]}\n\ndata: {\"cho",
            b"ices\":[{\"delta\":{\"content\":\"two\"}}]}\n\ndata: [DONE]\n",
        ]);
        assert_eq!(events.len(), 3);
        assert_eq!(events[0].text.as_deref(), Some("one"));
        assert_eq!(events[1].text.as_deref(), Some("two"));
        assert!(events[2].done);
    }

    #[test]
    fn streaming_replaces_invalid_bytes_inside_json_strings() {
        let events =
            decode_chunks(&[b"data: {\"choices\":[{\"delta\":{\"content\":\"a\xffb\"}}]}\n"]);
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].text.as_deref(), Some("a\u{fffd}b"));
    }

    #[test]
    fn streaming_skips_malformed_lines_and_preserves_reasoning_and_errors() {
        let events = decode_chunks(&[
            b": keepalive\nevent: message\ndata: bad json\ndata: \xff\n\n",
            b"data: {\"choices\":[{\"delta\":{\"reasoning_content\":\"thinking\"}}]}\n",
            b"data: {\"error\":{\"message\":\"model unavailable\"}}\n\ndata: [DONE]\n",
        ]);
        assert_eq!(events.len(), 3);
        assert_eq!(events[0].reasoning.as_deref(), Some("thinking"));
        assert_eq!(events[1].error.as_deref(), Some("model unavailable"));
        assert!(events[2].done);
        // As before, an unterminated line is not a complete event.
        assert!(decode_chunks(&[b"data: [DONE]"]).is_empty());
    }

    fn messages() -> Vec<Value> {
        vec![
            json!({"role": "system", "content": "Be concise."}),
            json!({"role": "user", "content": "Hello"}),
        ]
    }

    #[test]
    fn chat_endpoint_appends_path_once() {
        for base_url in [
            "http://127.0.0.1:11434/v1",
            "http://127.0.0.1:11434/v1/",
            "http://127.0.0.1:11434/v1/chat/completions",
        ] {
            assert_eq!(
                chat_endpoint(base_url).unwrap(),
                "http://127.0.0.1:11434/v1/chat/completions"
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
