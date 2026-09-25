//! Plan 0017: the model files that Built-in AI downloads, and which of them this Mac runs well.
//!
//! The files are Qwen3 GGUF models quantised to Q4_K_M. Qwen publishes no Q4_K_M GGUF of these
//! two models itself, so they come from Unsloth's Hugging Face repositories, pinned to one
//! commit. They live in the same `models` folder as the speech models and use the same
//! download, resume and SHA-256 check (`stt::models::download_model`).

use std::path::Path;

use crate::stt::hardware::{self, Hardware, ModelOffer, ModelRule};
use crate::stt::models::{self, InstalledModel, KnownModel};

/// Id of the larger model ("Best quality").
pub const BEST_MODEL_ID: &str = "qwen3-4b";
/// Id of the smaller model ("Faster").
pub const FASTER_MODEL_ID: &str = "qwen3-1.7b";
/// The model setup picks when none is given.
pub const DEFAULT_MODEL_ID: &str = BEST_MODEL_ID;

const GB: u64 = 1024 * 1024 * 1024;

/// One downloadable AI model: the file (id, name, size, SHA-256), where it comes from, and what
/// it needs from the Mac.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AiModel {
    pub file: KnownModel,
    pub url: &'static str,
    pub min_memory_bytes: u64,
}

/// Largest first. The SHA-256 values and sizes are the `x-linked-etag` and `x-linked-size`
/// headers of the Hugging Face files (the LFS object id is the file's SHA-256).
pub const AI_MODELS: &[AiModel] = &[
    AiModel {
        file: KnownModel {
            id: BEST_MODEL_ID,
            file_name: "Qwen3-4B-Instruct-2507-Q4_K_M.gguf",
            size_bytes: 2_497_281_120,
            sha256: "3605803b982cb64aead44f6c1b2ae36e3acdb41d8e46c8a94c6533bc4c67e597",
        },
        url: "https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF/resolve/a06e946bb6b655725eafa393f4a9745d460374c9/Qwen3-4B-Instruct-2507-Q4_K_M.gguf",
        min_memory_bytes: 16 * GB,
    },
    AiModel {
        file: KnownModel {
            id: FASTER_MODEL_ID,
            file_name: "Qwen3-1.7B-Q4_K_M.gguf",
            size_bytes: 1_107_409_472,
            sha256: "b139949c5bd74937ad8ed8c8cf3d9ffb1e99c866c823204dc42c0d91fa181897",
        },
        url: "https://huggingface.co/unsloth/Qwen3-1.7B-GGUF/resolve/d7f544eead698dbd1f15126ef60b45a1e1933222/Qwen3-1.7B-Q4_K_M.gguf",
        min_memory_bytes: 8 * GB,
    },
];

pub fn ai_model(id: &str) -> Option<&'static AiModel> {
    AI_MODELS.iter().find(|model| model.file.id == id)
}

/// The file entries of [`AI_MODELS`], for the shared model-file helpers.
pub fn files() -> Vec<KnownModel> {
    AI_MODELS.iter().map(|model| model.file).collect()
}

/// The AI models whose file is fully in place.
pub fn installed(dir: &Path) -> Vec<InstalledModel> {
    models::installed_from(dir, &files())
}

/// `(id, file name)` of each installed AI model, for `AppConfig::reconcile_builtin_ai_models`.
pub fn installed_pairs(dir: &Path) -> Vec<(String, String)> {
    models::pairs(installed(dir))
}

/// The models this Mac is offered. Both need Apple Silicon (llama.cpp runs them on the GPU
/// through Metal); the 4B model needs 16 GB of memory, the 1.7B model 8 GB; both need free disk
/// of 1.1 × their size unless installed. An Intel Mac gets none.
pub fn offer_models(hardware: &Hardware, installed_ids: &[String]) -> ModelOffer {
    let rules: Vec<ModelRule> = AI_MODELS
        .iter()
        .map(|model| ModelRule {
            model: model.file,
            needs_apple_silicon: true,
            min_memory_bytes: model.min_memory_bytes,
        })
        .collect();
    hardware::offer_by_rules(hardware, &rules, installed_ids)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::stt::hardware::{ChipKind, LeftOutReason};

    const MB: u64 = 1_000_000;

    fn mac(chip_kind: ChipKind, memory_gb: u64, free_bytes: u64) -> Hardware {
        Hardware {
            chip_kind,
            chip_name: String::new(),
            memory_bytes: memory_gb * GB,
            free_bytes,
        }
    }

    fn ids(offer: &ModelOffer) -> Vec<&str> {
        offer.models.iter().map(|model| model.id.as_str()).collect()
    }

    #[test]
    fn the_model_table_is_well_formed() {
        assert_eq!(AI_MODELS.len(), 2);
        for model in AI_MODELS {
            assert_eq!(model.file.sha256.len(), 64);
            assert!(model
                .file
                .sha256
                .chars()
                .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()));
            assert!(model.file.file_name.ends_with("-Q4_K_M.gguf"));
            assert!(model.url.starts_with("https://huggingface.co/"));
            assert!(model.url.ends_with(model.file.file_name));
            // Never the same file name as a speech model.
            assert!(models::known_model_by_file(model.file.file_name).is_none());
        }
        assert!(ai_model(DEFAULT_MODEL_ID).is_some());
        assert_eq!(
            ai_model(BEST_MODEL_ID).unwrap().file.size_bytes,
            2_497_281_120
        );
        assert_eq!(
            ai_model(FASTER_MODEL_ID).unwrap().file.size_bytes,
            1_107_409_472
        );
        assert!(ai_model("large-v3-turbo").is_none());
    }

    #[test]
    fn a_16_gb_apple_silicon_mac_gets_both_best_first() {
        let offer = offer_models(&mac(ChipKind::AppleSilicon, 32, 50_000 * MB), &[]);
        assert_eq!(ids(&offer), ["qwen3-4b", "qwen3-1.7b"]);
        assert!(offer.models[0].recommended);
        assert_eq!(offer.left_out, None);
        let offer = offer_models(&mac(ChipKind::AppleSilicon, 16, 50_000 * MB), &[]);
        assert_eq!(ids(&offer), ["qwen3-4b", "qwen3-1.7b"]);
    }

    #[test]
    fn an_8_gb_mac_gets_only_the_faster_model() {
        let offer = offer_models(&mac(ChipKind::AppleSilicon, 8, 50_000 * MB), &[]);
        assert_eq!(ids(&offer), ["qwen3-1.7b"]);
        assert!(!offer.models[0].recommended);
        assert_eq!(offer.left_out, Some(LeftOutReason::NeedsMemory));
    }

    #[test]
    fn intel_and_small_macs_get_no_model() {
        let offer = offer_models(&mac(ChipKind::Intel, 64, 90_000 * MB), &[]);
        assert!(offer.models.is_empty());
        assert_eq!(offer.left_out, Some(LeftOutReason::NeedsAppleSilicon));
        assert_eq!(offer.needed_bytes, None);

        let offer = offer_models(&mac(ChipKind::AppleSilicon, 4, 90_000 * MB), &[]);
        assert!(offer.models.is_empty());
        assert_eq!(offer.left_out, Some(LeftOutReason::NeedsMemory));

        // Installed files do not bypass the chip rule.
        let offer = offer_models(
            &mac(ChipKind::Unknown, 64, 0),
            &["qwen3-4b".to_string(), "qwen3-1.7b".to_string()],
        );
        assert!(offer.models.is_empty());
    }

    #[test]
    fn free_disk_must_be_1_1_times_the_size_unless_installed() {
        let best = ai_model(BEST_MODEL_ID).unwrap().file.size_bytes;
        let faster = ai_model(FASTER_MODEL_ID).unwrap().file.size_bytes;
        let short = models::needed_free_bytes(best, 0) - 1;
        let offer = offer_models(&mac(ChipKind::AppleSilicon, 32, short), &[]);
        assert_eq!(ids(&offer), ["qwen3-1.7b"]);
        assert_eq!(offer.left_out, Some(LeftOutReason::NeedsDiskSpace));

        let offer = offer_models(&mac(ChipKind::AppleSilicon, 32, 500 * MB), &[]);
        assert!(offer.models.is_empty());
        assert_eq!(offer.left_out, None);
        assert_eq!(
            offer.needed_bytes,
            Some(models::needed_free_bytes(faster, 0))
        );

        let offer = offer_models(
            &mac(ChipKind::AppleSilicon, 32, 0),
            &["qwen3-4b".to_string()],
        );
        assert_eq!(ids(&offer), ["qwen3-4b"]);
    }

    #[test]
    fn installed_needs_the_full_file() {
        let dir = std::env::temp_dir().join(format!(
            "typelite-ai-models-{}-{}",
            std::process::id(),
            crate::storage::now_unix_ms()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let faster = ai_model(FASTER_MODEL_ID).unwrap().file;
        std::fs::write(dir.join(faster.file_name), b"short").unwrap();
        assert!(installed(&dir).is_empty());
        std::fs::File::create(dir.join(faster.file_name))
            .unwrap()
            .set_len(faster.size_bytes)
            .unwrap();
        assert_eq!(
            installed_pairs(&dir),
            vec![(faster.id.to_string(), faster.file_name.to_string())]
        );
        let _ = std::fs::remove_dir_all(&dir);
    }
}
