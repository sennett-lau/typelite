use crate::credentials::{resolve_config_secret, SystemCredentialVault};
use crate::llm::protocol;
use crate::storage;

/// The Test button's request: a one-token "hi" completion with the preset's extra
/// request fields applied, so a bad extra field shows up here too.
fn build_test_request(
    client: &reqwest::Client,
    preset: &storage::AiPreset,
    api_key: &str,
) -> Result<reqwest::RequestBuilder, String> {
    if preset.model.trim().is_empty() {
        return Err("Model is required for the AI preset".to_string());
    }
    let url = protocol::chat_endpoint(&preset.base_url)?;
    let body = protocol::build_chat_body(
        preset.model.trim(),
        vec![serde_json::json!({"role": "user", "content": "hi"})],
        1,
        0.3,
        false,
        &preset.extra_request_fields,
    );
    let request = client.post(&url).header("Content-Type", "application/json");
    Ok(protocol::apply_auth_headers(request, api_key)
        .json(&body)
        .timeout(protocol::REQUEST_TIMEOUT))
}

/// Sends a one-token completion to the preset's endpoint and returns the round-trip time
/// in milliseconds.
///
/// `api_key` is the key typed in Settings; when it is empty the key stored in the
/// Keychain for this preset is used.
#[tauri::command]
pub async fn test_ai_preset(
    preset: storage::AiPreset,
    api_key: String,
    client: tauri::State<'_, reqwest::Client>,
) -> Result<u32, String> {
    let api_key = resolve_config_secret(&api_key, "llm", &preset.id, &SystemCredentialVault)
        .map_err(|e| e.to_string())?;
    let request = build_test_request(&client, &preset, &api_key)?;

    let started = std::time::Instant::now();
    let resp = request.send().await.map_err(|e| e.to_string())?;
    let elapsed = started.elapsed().as_millis() as u32;

    if !resp.status().is_success() {
        let status = resp.status();
        let details: String = resp
            .text()
            .await
            .unwrap_or_default()
            .chars()
            .take(200)
            .collect();
        return Err(if details.trim().is_empty() {
            format!("HTTP {status}")
        } else {
            format!("HTTP {status}: {details}")
        });
    }

    Ok(elapsed)
}

/// Lists the model names the server offers (`GET {base_url}/models`). Returns an empty
/// list when the server does not answer with a known shape.
#[tauri::command]
pub async fn fetch_ai_models(
    base_url: String,
    api_key: String,
    client: tauri::State<'_, reqwest::Client>,
) -> Result<Vec<String>, String> {
    if base_url.trim().is_empty() {
        return Ok(vec![]);
    }

    let url = protocol::models_endpoint(&base_url)?;
    let resp = protocol::apply_auth_headers(client.get(&url), &api_key)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Ok(vec![]);
    }

    let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    Ok(model_names(&body))
}

/// Reads model names from either the OpenAI shape `{ data: [{ id }] }` or the Ollama
/// shape `{ models: [{ name }] }`.
fn model_names(body: &serde_json::Value) -> Vec<String> {
    let mut models: Vec<String> = Vec::new();

    if let Some(data) = body.get("data").and_then(|d| d.as_array()) {
        for item in data {
            if let Some(id) = item.get("id").and_then(|v| v.as_str()) {
                models.push(id.to_string());
            }
        }
    } else if let Some(data) = body.get("models").and_then(|d| d.as_array()) {
        for item in data {
            if let Some(name) = item.get("name").and_then(|v| v.as_str()) {
                models.push(name.to_string());
            }
        }
    }

    models.sort();
    models
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_request_applies_extras_and_optional_key() {
        let mut preset = storage::AiPreset::builtin_ollama_pc();
        preset
            .extra_request_fields
            .insert("reasoning_effort".to_string(), serde_json::json!("none"));

        let request = build_test_request(&reqwest::Client::new(), &preset, "")
            .unwrap()
            .build()
            .unwrap();
        assert_eq!(
            request.url().as_str(),
            "http://100.90.208.26:11434/v1/chat/completions"
        );
        assert!(request.headers().get("Authorization").is_none());
        let body: serde_json::Value =
            serde_json::from_slice(request.body().unwrap().as_bytes().unwrap()).unwrap();
        assert_eq!(body["reasoning_effort"], "none");
        assert_eq!(body["max_tokens"], 1);

        let request = build_test_request(&reqwest::Client::new(), &preset, "sk-test")
            .unwrap()
            .build()
            .unwrap();
        assert_eq!(request.headers()["Authorization"], "Bearer sk-test");
    }

    #[test]
    fn test_request_requires_model() {
        let mut preset = storage::AiPreset::builtin_ollama_pc();
        preset.model = " ".to_string();
        assert!(build_test_request(&reqwest::Client::new(), &preset, "").is_err());
    }

    #[test]
    fn model_names_reads_openai_and_ollama_shapes() {
        let openai = serde_json::json!({"data": [{"id": "b"}, {"id": "a"}]});
        assert_eq!(model_names(&openai), vec!["a", "b"]);

        let ollama = serde_json::json!({"models": [{"name": "qwen3:4b"}]});
        assert_eq!(model_names(&ollama), vec!["qwen3:4b"]);

        assert!(model_names(&serde_json::json!({})).is_empty());
    }
}
