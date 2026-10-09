//! Plan `voice-commands`: the AI fallback for phrasings the patterns miss ("could you get
//! Slack up for me"). One short request offers the actions as OpenAI-style tools; a server or
//! model without tool calls answers with strict JSON `{"action": ..., "target": ...}` instead,
//! which the same system prompt describes. The reply only names an action and a spoken target;
//! the target is still resolved against the installed apps, folders and Shortcuts.

use std::time::Duration;

use serde_json::{json, Value};

use super::{Action, Command};
use crate::llm::LlmConfig;

/// How long the AI may take before the command check gives up (Ask then answers normally).
pub const CLASSIFY_TIMEOUT: Duration = Duration::from_secs(4);
/// A tool call or a one-line JSON object.
const MAX_TOKENS: u32 = 80;

const SYSTEM_PROMPT: &str = r#"You decide whether the user's words are an instruction to operate their Mac. Never answer questions.
If they ask to open, switch to, hide or quit an app, open a web address, open a folder (downloads, desktop, documents, applications) or run a Shortcut, call the matching tool with the name as the user said it.
If it is anything else (a question, a request to write or explain something, or unclear), do not call a tool and reply {"action":"none"}.
If you cannot call tools, reply with JSON only: {"action":"open_app","target":"Safari"}. "action" is one of open_app, switch_to, hide_app, quit_app, open_url, open_folder, run_shortcut, none."#;

/// The AI's decision.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum AiDecision {
    Command(Command),
    NotCommand,
    /// The reply could not be read.
    Unreadable,
}

fn tool(name: &str, description: &str, parameter: &str, parameter_description: &str) -> Value {
    json!({
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": {
                "type": "object",
                "properties": {
                    parameter: { "type": "string", "description": parameter_description }
                },
                "required": [parameter]
            }
        }
    })
}

/// The tools offered to the model, one per action.
pub fn tools() -> Value {
    json!([
        tool(
            "open_app",
            "Open or launch an app",
            "name",
            "The app's name as spoken"
        ),
        tool(
            "switch_to",
            "Bring a running app to the front",
            "name",
            "The app's name as spoken"
        ),
        tool(
            "hide_app",
            "Hide an app",
            "name",
            "The app's name as spoken"
        ),
        tool(
            "quit_app",
            "Quit an app",
            "name",
            "The app's name as spoken"
        ),
        tool(
            "open_url",
            "Open a web address in the browser",
            "url",
            "The address, such as example.com"
        ),
        tool(
            "open_folder",
            "Open a folder in Finder",
            "folder",
            "downloads, desktop, documents or applications"
        ),
        tool(
            "run_shortcut",
            "Run a macOS Shortcut",
            "name",
            "The Shortcut's name"
        ),
    ])
}

/// The request body. With `with_tools` false (a server that rejected tools) it relies on the
/// JSON instruction alone.
pub fn build_body(config: &LlmConfig, utterance: &str, with_tools: bool) -> Value {
    let mut body = crate::llm::protocol::build_chat_body(
        &config.model,
        vec![
            json!({ "role": "system", "content": SYSTEM_PROMPT }),
            json!({ "role": "user", "content": utterance }),
        ],
        MAX_TOKENS,
        0.0,
        false,
        &config.extra_request_fields,
    );
    if with_tools {
        body["tools"] = tools();
        body["tool_choice"] = json!("auto");
    }
    body
}

fn command_from(action: &str, target: Option<&str>) -> AiDecision {
    let action = action.trim().to_ascii_lowercase();
    if matches!(action.as_str(), "none" | "") {
        return AiDecision::NotCommand;
    }
    let Some(action) = Action::from_name(&action) else {
        return AiDecision::Unreadable;
    };
    match target
        .map(str::trim)
        .filter(|t| !t.is_empty() && t.chars().count() <= 200)
    {
        Some(target) => AiDecision::Command(Command {
            action,
            target: target.to_string(),
        }),
        None => AiDecision::Unreadable,
    }
}

/// Reads the reply: the first tool call, else a JSON object in the content (also inside a code
/// fence), else "none"-like text.
pub fn parse_reply(body: &Value) -> AiDecision {
    let message = &body["choices"][0]["message"];
    if let Some(call) = message["tool_calls"]
        .as_array()
        .and_then(|calls| calls.first())
    {
        let name = call["function"]["name"].as_str().unwrap_or_default();
        // `arguments` is a JSON string in the OpenAI format; some servers send an object.
        let arguments = match &call["function"]["arguments"] {
            Value::String(text) => serde_json::from_str::<Value>(text).unwrap_or(Value::Null),
            other => other.clone(),
        };
        let target = ["name", "url", "folder", "target"]
            .iter()
            .find_map(|key| arguments[*key].as_str());
        return command_from(name, target);
    }
    parse_json_text(&crate::llm::protocol::response_text(body))
}

/// The JSON fallback: `{"action": "...", "target": "..."}` somewhere in the text.
pub fn parse_json_text(text: &str) -> AiDecision {
    let trimmed = text.trim();
    if let (Some(start), Some(end)) = (trimmed.find('{'), trimmed.rfind('}')) {
        if start < end {
            if let Ok(value) = serde_json::from_str::<Value>(&trimmed[start..=end]) {
                if let Some(action) = value["action"].as_str() {
                    return command_from(action, value["target"].as_str());
                }
            }
        }
    }
    let word = trimmed
        .trim_matches(|c: char| !c.is_alphanumeric())
        .to_ascii_lowercase();
    if matches!(word.as_str(), "none" | "no" | "null") {
        AiDecision::NotCommand
    } else {
        AiDecision::Unreadable
    }
}

async fn request(
    client: &reqwest::Client,
    config: &LlmConfig,
    utterance: &str,
    with_tools: bool,
) -> Result<Value, (Option<u16>, String)> {
    let url = crate::llm::protocol::chat_endpoint(&config.base_url).map_err(|e| (None, e))?;
    let request = client
        .post(url)
        .header("Content-Type", "application/json")
        .json(&build_body(config, utterance, with_tools))
        .timeout(CLASSIFY_TIMEOUT);
    let response = crate::llm::protocol::apply_auth_headers(request, &config.api_key)
        .send()
        .await
        .map_err(|e| (None, e.to_string()))?;
    let status = response.status();
    if !status.is_success() {
        return Err((Some(status.as_u16()), format!("status {}", status.as_u16())));
    }
    response.json().await.map_err(|e| (None, e.to_string()))
}

/// Asks the AI. A server that rejects the tools (status 400, 422 or 500) is asked again
/// without them. Errors never contain the utterance.
pub async fn classify(
    client: &reqwest::Client,
    config: &LlmConfig,
    utterance: &str,
) -> Result<AiDecision, String> {
    let work = async {
        let body = match request(client, config, utterance, true).await {
            Ok(body) => body,
            Err((Some(400 | 422 | 500), _)) => {
                tracing::info!("Voice command check: server rejected tools; asking for JSON");
                request(client, config, utterance, false)
                    .await
                    .map_err(|(_, e)| e)?
            }
            Err((_, error)) => return Err(error),
        };
        Ok(parse_reply(&body))
    };
    tokio::time::timeout(CLASSIFY_TIMEOUT, work)
        .await
        .map_err(|_| format!("took over {} ms", CLASSIFY_TIMEOUT.as_millis()))?
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
    fn body_offers_tools_and_keeps_preset_extras() {
        let body = build_body(&config(), "get Slack up", true);
        assert_eq!(body["max_tokens"], MAX_TOKENS);
        assert_eq!(body["temperature"], 0.0);
        assert_eq!(body["stream"], false);
        assert_eq!(body["reasoning_effort"], "none");
        assert_eq!(body["tool_choice"], "auto");
        let names: Vec<&str> = body["tools"]
            .as_array()
            .unwrap()
            .iter()
            .map(|t| t["function"]["name"].as_str().unwrap())
            .collect();
        assert_eq!(
            names,
            [
                "open_app",
                "switch_to",
                "hide_app",
                "quit_app",
                "open_url",
                "open_folder",
                "run_shortcut"
            ]
        );
        assert_eq!(body["messages"][1]["content"], "get Slack up");
        let without = build_body(&config(), "x", false);
        assert!(without.get("tools").is_none());
        assert!(without["messages"][0]["content"]
            .as_str()
            .unwrap()
            .contains("JSON only"));
    }

    #[test]
    fn tool_calls_are_read_with_string_or_object_arguments() {
        let reply = json!({"choices": [{"message": {"content": null, "tool_calls": [
            {"type": "function", "function": {"name": "switch_to", "arguments": "{\"name\":\"Slack\"}"}}
        ]}}]});
        assert_eq!(
            parse_reply(&reply),
            AiDecision::Command(Command {
                action: Action::SwitchTo,
                target: "Slack".into()
            })
        );
        let object_args = json!({"choices": [{"message": {"tool_calls": [
            {"function": {"name": "open_url", "arguments": {"url": "example.com"}}}
        ]}}]});
        assert_eq!(
            parse_reply(&object_args),
            AiDecision::Command(Command {
                action: Action::OpenUrl,
                target: "example.com".into()
            })
        );
        let unknown_tool = json!({"choices": [{"message": {"tool_calls": [
            {"function": {"name": "run_shell", "arguments": "{\"name\":\"rm -rf\"}"}}
        ]}}]});
        assert_eq!(parse_reply(&unknown_tool), AiDecision::Unreadable);
        let missing_target = json!({"choices": [{"message": {"tool_calls": [
            {"function": {"name": "quit_app", "arguments": "{}"}}
        ]}}]});
        assert_eq!(parse_reply(&missing_target), AiDecision::Unreadable);
    }

    #[test]
    fn json_content_is_the_fallback() {
        let reply = json!({"choices": [{"message": {"content": "```json\n{\"action\":\"open_app\",\"target\":\"Safari\"}\n```"}}]});
        assert_eq!(
            parse_reply(&reply),
            AiDecision::Command(Command {
                action: Action::OpenApp,
                target: "Safari".into()
            })
        );
        assert_eq!(
            parse_json_text("{\"action\":\"none\"}"),
            AiDecision::NotCommand
        );
        assert_eq!(parse_json_text("None."), AiDecision::NotCommand);
        assert_eq!(
            parse_json_text("Sure! Safari is a browser."),
            AiDecision::Unreadable
        );
        assert_eq!(
            parse_json_text("{\"action\":\"delete_files\",\"target\":\"~\"}"),
            AiDecision::Unreadable
        );
    }
}
