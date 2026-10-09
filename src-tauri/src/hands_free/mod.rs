//! Plan `hands-free-mode`: say "Hey Sam", then speak a request; no shortcut needed.
//!
//! Off by default. When on, a listener keeps the microphone open into a 3 s in-memory ring
//! (`ring.rs`), lets only voiced stretches through its own voice gate (`gate.rs`,
//! `segment.rs`), checks each short stretch for the wake phrase with a small Whisper model
//! (`wake.rs`, `matcher.rs`) and, on a match, starts an Ask run that stops by itself when the
//! speaker goes quiet. The request is then routed by meaning (`routing.rs`). No audio leaves the
//! Mac before the wake phrase, and nothing heard is logged or stored.

pub mod gate;
pub mod matcher;
pub mod ring;
pub mod routing;
pub mod runtime;
pub mod segment;
pub mod wake;

use serde::{Deserialize, Serialize};

/// Longest wake name kept.
pub const WAKE_NAME_MAX_CHARS: usize = 32;
pub const DEFAULT_WAKE_NAME: &str = "Sam";

/// Settings → General → Hands-free mode.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct HandsFreeConfig {
    /// Off by default: the microphone stays open while this is on.
    pub enabled: bool,
    /// The name after "Hey" ("Sam").
    pub wake_name: String,
    pub sensitivity: matcher::Sensitivity,
}

impl Default for HandsFreeConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            wake_name: DEFAULT_WAKE_NAME.to_string(),
            sensitivity: matcher::Sensitivity::Normal,
        }
    }
}

impl HandsFreeConfig {
    /// Trims the wake name and falls back to the default when it is empty.
    pub fn normalize(&mut self) {
        let name: String = self
            .wake_name
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
            .chars()
            .take(WAKE_NAME_MAX_CHARS)
            .collect();
        self.wake_name = if name.is_empty() {
            DEFAULT_WAKE_NAME.to_string()
        } else {
            name
        };
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn off_by_default_and_old_configs_load() {
        let config: HandsFreeConfig = serde_json::from_str("{}").unwrap();
        assert_eq!(config, HandsFreeConfig::default());
        assert!(!config.enabled);
        assert_eq!(config.wake_name, "Sam");
        let on: HandsFreeConfig =
            serde_json::from_str(r#"{"enabled":true,"wake_name":"Jarvis","sensitivity":"high"}"#)
                .unwrap();
        assert!(on.enabled);
        assert_eq!(on.sensitivity, matcher::Sensitivity::High);
    }

    #[test]
    fn wake_name_is_tidied() {
        let mut config = HandsFreeConfig {
            wake_name: "  Mary   Ann ".to_string(),
            ..HandsFreeConfig::default()
        };
        config.normalize();
        assert_eq!(config.wake_name, "Mary Ann");
        config.wake_name = "   ".to_string();
        config.normalize();
        assert_eq!(config.wake_name, "Sam");
        config.wake_name = "x".repeat(100);
        config.normalize();
        assert_eq!(config.wake_name.len(), WAKE_NAME_MAX_CHARS);
    }
}
