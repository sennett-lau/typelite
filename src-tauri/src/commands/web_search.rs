//! Plan `ask-web-search`: Settings → AI polish → Web search for Ask, and the optional card in
//! onboarding. Sets, tests, changes or removes the search provider. The address is saved in the
//! settings file; the optional key in the Keychain (namespace `search`). The settings window
//! applies the returned config to its store, so saving here never leaves Settings "unsaved".

use serde::Serialize;
use tauri::Window;

use crate::credentials::{CredentialSecretReader, CredentialVault, SystemCredentialVault};
use crate::storage;
use crate::web_search::{self, SearchProviderKind, WebSearchConfig, CREDENTIAL_NAMESPACE};

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WebSearchStatus {
    pub config: WebSearchConfig,
    /// A key is stored for the provider (never the key itself).
    pub has_key: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WebSearchTestResult {
    pub results: usize,
    pub ms: u64,
}

fn ensure_main_window(window: &Window) -> Result<(), String> {
    if window.label() == "main" {
        Ok(())
    } else {
        Err("web search settings are only available in the main window".to_string())
    }
}

fn stored_key(provider: SearchProviderKind) -> String {
    if provider == SearchProviderKind::None {
        return String::new();
    }
    SystemCredentialVault
        .get_secret(CREDENTIAL_NAMESPACE, provider.id())
        .ok()
        .flatten()
        .unwrap_or_default()
}

/// The config a save would store: the address checked for every provider but None.
fn validated_config(
    provider: SearchProviderKind,
    base_url: &str,
) -> Result<WebSearchConfig, String> {
    let mut config = WebSearchConfig {
        provider,
        base_url: base_url.trim().to_string(),
    };
    if provider != SearchProviderKind::None {
        web_search::search_endpoint(&config.base_url).map_err(|error| error.user_message())?;
    }
    config.normalize();
    Ok(config)
}

#[tauri::command]
pub async fn get_web_search_status(
    state: tauri::State<'_, storage::ConfigManager>,
) -> Result<WebSearchStatus, String> {
    let config = state.load().await.map_err(|e| e.to_string())?;
    let has_key = !stored_key(config.web_search.provider).trim().is_empty();
    Ok(WebSearchStatus {
        config: config.web_search,
        has_key,
    })
}

/// Saves the provider and address. `api_key`: `None` keeps the stored key, an empty string
/// removes it, anything else replaces it.
#[tauri::command]
pub async fn save_web_search(
    window: Window,
    state: tauri::State<'_, storage::ConfigManager>,
    provider: SearchProviderKind,
    base_url: String,
    api_key: Option<String>,
) -> Result<WebSearchStatus, String> {
    ensure_main_window(&window)?;
    let next = validated_config(provider, &base_url)?;
    let mut config = state.load().await.map_err(|e| e.to_string())?;
    let previous_provider = config.web_search.provider;
    if let Some(key) = api_key {
        if provider != SearchProviderKind::None {
            let vault = SystemCredentialVault;
            if key.trim().is_empty() {
                vault
                    .remove_secret(CREDENTIAL_NAMESPACE, provider.id())
                    .map_err(|e| e.to_string())?;
            } else {
                vault
                    .set_secret(CREDENTIAL_NAMESPACE, provider.id(), key.trim())
                    .map_err(|e| e.to_string())?;
            }
        }
    }
    if previous_provider != provider && previous_provider != SearchProviderKind::None {
        let _ = SystemCredentialVault.remove_secret(CREDENTIAL_NAMESPACE, previous_provider.id());
    }
    config.web_search = next;
    state.save(&config).await.map_err(|e| e.to_string())?;
    tracing::info!(
        "Web search settings saved: provider={}",
        config.web_search.provider.id()
    );
    let has_key = !stored_key(config.web_search.provider).trim().is_empty();
    Ok(WebSearchStatus {
        config: config.web_search,
        has_key,
    })
}

/// Turns web search off and forgets the address and key.
#[tauri::command]
pub async fn remove_web_search(
    window: Window,
    state: tauri::State<'_, storage::ConfigManager>,
) -> Result<WebSearchStatus, String> {
    ensure_main_window(&window)?;
    let mut config = state.load().await.map_err(|e| e.to_string())?;
    let provider = config.web_search.provider;
    if provider != SearchProviderKind::None {
        SystemCredentialVault
            .remove_secret(CREDENTIAL_NAMESPACE, provider.id())
            .map_err(|e| e.to_string())?;
    }
    config.web_search = WebSearchConfig::default();
    state.save(&config).await.map_err(|e| e.to_string())?;
    tracing::info!("Web search settings removed");
    Ok(WebSearchStatus {
        config: config.web_search,
        has_key: false,
    })
}

/// Settings → Test: one search for a fixed word (never the user's own words). `api_key`: `None`
/// uses the stored key.
#[tauri::command]
pub async fn test_web_search(
    window: Window,
    client: tauri::State<'_, reqwest::Client>,
    provider: SearchProviderKind,
    base_url: String,
    api_key: Option<String>,
) -> Result<WebSearchTestResult, String> {
    ensure_main_window(&window)?;
    let config = validated_config(provider, &base_url)?;
    if !config.is_configured() {
        return Err(web_search::SearchError::BadAddress.user_message());
    }
    let key = api_key.unwrap_or_else(|| stored_key(provider));
    match web_search::test_provider(&client, &config, &key).await {
        Ok((results, elapsed)) => {
            tracing::info!(
                "Web search test: {results} results ({} ms)",
                elapsed.as_millis()
            );
            Ok(WebSearchTestResult {
                results,
                ms: elapsed.as_millis() as u64,
            })
        }
        Err(error) => {
            tracing::warn!("Web search test failed ({})", error.code());
            Err(error.user_message())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn saving_checks_the_address_and_clears_it_when_off() {
        let config =
            validated_config(SearchProviderKind::Searxng, " http://127.0.0.1:8888/ ").unwrap();
        assert_eq!(config.base_url, "http://127.0.0.1:8888/");
        assert!(config.is_configured());
        assert!(
            validated_config(SearchProviderKind::Searxng, "localhost:8888")
                .unwrap_err()
                .contains("http://")
        );
        let off = validated_config(SearchProviderKind::None, "http://x").unwrap();
        assert_eq!(off, WebSearchConfig::default());
    }
}
