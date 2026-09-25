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
    if storage::base_url_has_placeholder(&preset.base_url) {
        return Err(storage::PLACEHOLDER_URL_ERROR.to_string());
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
/// Keychain for this preset is used. A pass is saved as the preset's `verified_at` when the
/// stored preset has the tested connection.
#[tauri::command]
pub async fn test_ai_preset(
    app: tauri::AppHandle,
    state: tauri::State<'_, storage::ConfigManager>,
    preset: storage::AiPreset,
    api_key: String,
    client: tauri::State<'_, reqwest::Client>,
) -> Result<u32, String> {
    let api_key = resolve_config_secret(&api_key, "llm", &preset.id, &SystemCredentialVault)
        .map_err(|e| e.to_string())?;
    // Plan `ai-polish-setup`: the Built-in preset is tested against Typelite's own running server.
    let (target, api_key) = crate::llm::builtin::resolve_preset(&preset, api_key)
        .await
        .map_err(|e| e.to_string())?;
    let request = build_test_request(&client, &target, &api_key)?;

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

    crate::commands::config::record_ai_test_passed(&app, &state, &preset).await;
    Ok(elapsed)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn local_ollama() -> storage::AiPreset {
        storage::AiPreset::legacy_templates_v1()[0].clone()
    }

    #[test]
    fn test_request_applies_extras_and_optional_key() {
        let mut preset = local_ollama();
        preset
            .extra_request_fields
            .insert("reasoning_effort".to_string(), serde_json::json!("none"));

        let request = build_test_request(&reqwest::Client::new(), &preset, "")
            .unwrap()
            .build()
            .unwrap();
        assert_eq!(
            request.url().as_str(),
            "http://127.0.0.1:11434/v1/chat/completions"
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
    fn test_request_rejects_a_placeholder_url() {
        let mut preset = storage::AiPreset::legacy_templates_v1()[1].clone();
        assert!(preset.base_url.contains("<computer-ip>"));
        let error = build_test_request(&reqwest::Client::new(), &preset, "").unwrap_err();
        assert_eq!(error, storage::PLACEHOLDER_URL_ERROR);

        preset.base_url = "http://192.0.2.20:11434/v1".to_string();
        assert!(build_test_request(&reqwest::Client::new(), &preset, "").is_ok());
    }

    #[test]
    fn test_request_requires_model() {
        let mut preset = local_ollama();
        preset.model = " ".to_string();
        assert!(build_test_request(&reqwest::Client::new(), &preset, "").is_err());
    }
}
