use anyhow::{anyhow, Context, Result};
use chrono::SecondsFormat;
use serde::{Deserialize, Serialize};

use crate::storage::AppConfig;

const SERVICE_NAME: &str = "Typelite";
const API_KEY_ACCOUNT_SUFFIX: &str = "api_key";
const STORED_CREDENTIAL_VERSION: u8 = 1;

pub trait CredentialVault {
    fn set_secret(&self, namespace: &str, provider: &str, secret: &str) -> Result<()>;
}

pub trait CredentialSecretReader {
    fn get_secret(&self, namespace: &str, provider: &str) -> Result<Option<String>>;

    fn get_secret_updated_at(&self, _namespace: &str, _provider: &str) -> Result<Option<String>> {
        Ok(None)
    }
}

pub trait CredentialSecretRemover {
    fn remove_secret(&self, namespace: &str, provider: &str) -> Result<()>;
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StoredCredential {
    pub value: String,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredCredentialPayload {
    version: u8,
    secret_kind: String,
    value: String,
    updated_at: String,
}

#[derive(Debug, Clone, Copy, Default)]
pub struct SystemCredentialVault;

impl SystemCredentialVault {
    fn account(namespace: &str, provider: &str) -> String {
        format!(
            "{}.{}.{}",
            namespace.trim(),
            provider.trim(),
            API_KEY_ACCOUNT_SUFFIX
        )
    }

    pub fn has_secret(&self, namespace: &str, provider: &str) -> Result<bool> {
        Ok(self.get_secret(namespace, provider)?.is_some())
    }

    pub fn remove_secret(&self, namespace: &str, provider: &str) -> Result<()> {
        delete_system_secret(&Self::account(namespace, provider))
    }
}

impl CredentialVault for SystemCredentialVault {
    fn set_secret(&self, namespace: &str, provider: &str, secret: &str) -> Result<()> {
        let stored = encode_stored_credential(secret, &current_credential_timestamp())
            .map_err(|e| anyhow!("encode credential payload for {namespace}.{provider}: {e}"))?;
        write_system_secret(&Self::account(namespace, provider), &stored)
    }
}

impl CredentialSecretReader for SystemCredentialVault {
    fn get_secret(&self, namespace: &str, provider: &str) -> Result<Option<String>> {
        read_system_secret(&Self::account(namespace, provider))?
            .map(|stored| decode_stored_credential(&stored).map(|credential| credential.value))
            .transpose()
    }

    fn get_secret_updated_at(&self, namespace: &str, provider: &str) -> Result<Option<String>> {
        read_system_secret(&Self::account(namespace, provider))?
            .map(|stored| decode_stored_credential(&stored).map(|credential| credential.updated_at))
            .transpose()
            .map(Option::flatten)
    }
}

impl CredentialSecretRemover for SystemCredentialVault {
    fn remove_secret(&self, namespace: &str, provider: &str) -> Result<()> {
        Self::remove_secret(self, namespace, provider)
    }
}

#[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
fn system_entry(account: &str) -> Result<keyring::Entry> {
    keyring::Entry::new(SERVICE_NAME, account).context("open system credential vault")
}

#[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
fn write_system_secret(account: &str, secret: &str) -> Result<()> {
    system_entry(account)?
        .set_password(secret)
        .with_context(|| format!("write system credential vault {account}"))
}

#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
fn write_system_secret(_account: &str, _secret: &str) -> Result<()> {
    Err(anyhow!(
        "system credential vault is not supported on this platform"
    ))
}

#[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
fn read_system_secret(account: &str) -> Result<Option<String>> {
    match system_entry(account)?.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(anyhow!("read system credential vault {account}: {error}")),
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
fn read_system_secret(_account: &str) -> Result<Option<String>> {
    Err(anyhow!(
        "system credential vault is not supported on this platform"
    ))
}

#[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
fn delete_system_secret(account: &str) -> Result<()> {
    match system_entry(account)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(anyhow!("delete system credential vault {account}: {error}")),
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
fn delete_system_secret(_account: &str) -> Result<()> {
    Err(anyhow!(
        "system credential vault is not supported on this platform"
    ))
}

fn current_credential_timestamp() -> String {
    chrono::Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true)
}

fn encode_stored_credential(secret: &str, updated_at: &str) -> Result<String> {
    serde_json::to_string(&StoredCredentialPayload {
        version: STORED_CREDENTIAL_VERSION,
        secret_kind: "apiKey".to_string(),
        value: secret.to_string(),
        updated_at: updated_at.to_string(),
    })
    .context("serialize credential payload")
}

fn decode_stored_credential(stored: &str) -> Result<StoredCredential> {
    match serde_json::from_str::<StoredCredentialPayload>(stored) {
        Ok(payload) if payload.version == STORED_CREDENTIAL_VERSION => Ok(StoredCredential {
            value: payload.value,
            updated_at: Some(payload.updated_at),
        }),
        _ => Ok(StoredCredential {
            value: stored.to_string(),
            updated_at: None,
        }),
    }
}

pub fn resolve_config_secret<V: CredentialSecretReader>(
    legacy_secret: &str,
    namespace: &str,
    provider: &str,
    vault: &V,
) -> Result<String> {
    if !legacy_secret.trim().is_empty() {
        return Ok(legacy_secret.to_string());
    }
    Ok(vault.get_secret(namespace, provider)?.unwrap_or_default())
}

/// Keychain account for the active speech preset's API key.
pub fn stt_credential_provider(config: &AppConfig) -> &str {
    &config.active_speech_preset().id
}

/// Keychain account for the active AI preset's API key.
pub fn llm_credential_provider(config: &AppConfig) -> &str {
    &config.active_ai_preset().id
}

/// API key of the active speech preset, or an empty string when none is stored.
pub fn resolve_stt_config_secret<V: CredentialSecretReader>(
    config: &AppConfig,
    vault: &V,
) -> Result<String> {
    Ok(vault
        .get_secret("stt", stt_credential_provider(config))?
        .unwrap_or_default())
}

/// API key of the active AI preset, or an empty string when none is stored.
pub fn resolve_llm_config_secret<V: CredentialSecretReader>(
    config: &AppConfig,
    vault: &V,
) -> Result<String> {
    Ok(vault
        .get_secret("llm", llm_credential_provider(config))?
        .unwrap_or_default())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    #[derive(Default)]
    struct MemoryVault {
        records: Mutex<Vec<(String, String, String)>>,
    }

    impl CredentialVault for MemoryVault {
        fn set_secret(&self, namespace: &str, provider: &str, secret: &str) -> Result<()> {
            self.records.lock().unwrap().push((
                namespace.to_string(),
                provider.to_string(),
                secret.to_string(),
            ));
            Ok(())
        }
    }

    impl CredentialSecretReader for MemoryVault {
        fn get_secret(&self, namespace: &str, provider: &str) -> Result<Option<String>> {
            Ok(self
                .records
                .lock()
                .unwrap()
                .iter()
                .rev()
                .find(|(record_namespace, record_provider, _)| {
                    record_namespace == namespace && record_provider == provider
                })
                .map(|(_, _, secret)| secret.clone()))
        }
    }

    #[test]
    fn resolves_missing_config_secret_from_vault() {
        struct ReadVault;

        impl CredentialSecretReader for ReadVault {
            fn get_secret(&self, namespace: &str, provider: &str) -> Result<Option<String>> {
                assert_eq!(namespace, "llm");
                assert_eq!(provider, "openai");
                Ok(Some("vault-secret".to_string()))
            }
        }

        let secret = resolve_config_secret("", "llm", "openai", &ReadVault).unwrap();

        assert_eq!(secret, "vault-secret");
    }

    #[test]
    fn resolves_in_memory_secret_before_vault() {
        struct PanicVault;

        impl CredentialSecretReader for PanicVault {
            fn get_secret(&self, _namespace: &str, _provider: &str) -> Result<Option<String>> {
                panic!("vault should not be read when legacy secret is present");
            }
        }

        let secret = resolve_config_secret("typed-secret", "llm", "openai", &PanicVault).unwrap();

        assert_eq!(secret, "typed-secret");
    }

    #[test]
    fn stored_credential_payload_round_trips_secret_and_metadata() {
        let stored = encode_stored_credential("vault-secret", "2026-07-06T00:00:00Z").unwrap();

        assert_ne!(stored, "vault-secret");

        let decoded = decode_stored_credential(&stored).unwrap();

        assert_eq!(decoded.value, "vault-secret");
        assert_eq!(decoded.updated_at.as_deref(), Some("2026-07-06T00:00:00Z"));
    }

    #[test]
    fn stored_credential_decoder_preserves_legacy_plaintext_secret() {
        let decoded = decode_stored_credential("legacy-secret").unwrap();

        assert_eq!(decoded.value, "legacy-secret");
        assert_eq!(decoded.updated_at, None);
    }

    #[test]
    fn resolves_stt_secret_from_active_speech_preset() {
        let mut config = AppConfig::default();
        let mut second = config.speech_presets[0].clone();
        second.id = "second".to_string();
        config.speech_presets.push(second);
        config.active_speech_preset_id = "second".to_string();
        let vault = MemoryVault::default();
        vault.set_secret("stt", "second", "second-secret").unwrap();

        assert_eq!(stt_credential_provider(&config), "second");
        assert_eq!(
            resolve_stt_config_secret(&config, &vault).unwrap(),
            "second-secret"
        );
    }

    #[test]
    fn resolves_llm_secret_from_active_ai_preset() {
        let config = AppConfig::default();
        let vault = MemoryVault::default();
        vault
            .set_secret("llm", crate::storage::BUILTIN_AI_PRESET_ID, "llm-secret")
            .unwrap();

        assert_eq!(
            llm_credential_provider(&config),
            crate::storage::BUILTIN_AI_PRESET_ID
        );
        assert_eq!(
            resolve_llm_config_secret(&config, &vault).unwrap(),
            "llm-secret"
        );
    }

    #[test]
    fn missing_secret_resolves_to_empty_key() {
        let config = AppConfig::default();
        let vault = MemoryVault::default();

        assert_eq!(resolve_stt_config_secret(&config, &vault).unwrap(), "");
        assert_eq!(resolve_llm_config_secret(&config, &vault).unwrap(), "");
    }
}
