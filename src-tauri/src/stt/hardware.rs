//! Plan `two-tab-speech`: which built-in Whisper models this Mac runs well.
//!
//! [`detect`] reads the chip, the memory and the free disk space; [`offer_models`] applies the
//! table in `docs/plans/2026-09-25-two-tab-speech/layout.md` to decide which models the speech
//! screens offer, and why the larger one is left out. The rule is a pure function so it is
//! unit-tested.

use std::path::Path;

use serde::Serialize;

use super::models::{self, KnownModel};

/// Id of the larger, more accurate model ("Best accuracy").
pub const BEST_MODEL_ID: &str = "large-v3-turbo";
/// Id of the smaller model ("Faster").
pub const FASTER_MODEL_ID: &str = "small";

/// The larger model needs at least this much memory (8 GB).
pub const MIN_MEMORY_FOR_BEST: u64 = 8 * 1024 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ChipKind {
    /// An Apple M-series chip. Metal makes whisper.cpp fast on it.
    AppleSilicon,
    /// An Intel Mac. It has no Apple GPU that whisper.cpp can use well.
    Intel,
    /// The check could not tell (for example on another operating system).
    Unknown,
}

/// What [`detect`] found.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Hardware {
    pub chip_kind: ChipKind,
    /// For example "Apple M1 Pro" or "Intel(R) Core(TM) i7-9750H CPU @ 2.60GHz". Can be empty.
    pub chip_name: String,
    /// Installed memory in bytes; 0 when unknown.
    pub memory_bytes: u64,
    /// Free bytes on the disk that holds the models folder.
    pub free_bytes: u64,
}

/// Why the larger model is not offered.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum LeftOutReason {
    NeedsAppleSilicon,
    NeedsMemory,
    NeedsDiskSpace,
}

/// One model the speech screens show as an option card.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OfferedModel {
    pub id: String,
    pub size_bytes: u64,
    /// The first card when there are two; it is selected by default.
    pub recommended: bool,
}

/// The models to offer, in display order, and what the hardware note says.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelOffer {
    pub models: Vec<OfferedModel>,
    /// Set when the larger model is left out but another one is offered.
    pub left_out: Option<LeftOutReason>,
    /// Set when no model fits on the disk: the free space the smallest model needs.
    pub needed_bytes: Option<u64>,
}

/// The result of the `get_speech_hardware` command.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HardwareCheck {
    pub hardware: Hardware,
    pub offer: ModelOffer,
}

/// Applies the table of layout.md. A model that is already installed needs no free space.
///
/// | Condition | Best accuracy | Faster |
/// |---|---|---|
/// | Apple Silicon, ≥ 8 GB memory, free disk ≥ 1.1 × size | offered, recommended | offered |
/// | Apple Silicon < 8 GB, or Intel | not offered | offered |
/// | Free disk < 1.1 × large but ≥ 1.1 × small | not offered | offered |
/// | Not enough disk for either | none; say how much space is needed | |
pub fn offer_models(hardware: &Hardware, installed_ids: &[String]) -> ModelOffer {
    let fits = |model: &KnownModel| {
        installed_ids.iter().any(|id| id == model.id)
            || hardware.free_bytes >= models::needed_free_bytes(model.size_bytes, 0)
    };
    let (Some(best), Some(faster)) = (
        models::known_model(BEST_MODEL_ID),
        models::known_model(FASTER_MODEL_ID),
    ) else {
        return ModelOffer {
            models: Vec::new(),
            left_out: None,
            needed_bytes: None,
        };
    };

    let chip_ok = hardware.chip_kind == ChipKind::AppleSilicon;
    let memory_ok = hardware.memory_bytes >= MIN_MEMORY_FOR_BEST;
    let best_ok = chip_ok && memory_ok && fits(best);
    let faster_ok = fits(faster);

    let mut offered = Vec::new();
    if best_ok {
        offered.push(best);
    }
    if faster_ok {
        offered.push(faster);
    }
    let count = offered.len();
    let models = offered
        .into_iter()
        .enumerate()
        .map(|(index, model)| OfferedModel {
            id: model.id.to_string(),
            size_bytes: model.size_bytes,
            recommended: index == 0 && count > 1,
        })
        .collect::<Vec<_>>();

    if models.is_empty() {
        return ModelOffer {
            models,
            left_out: None,
            needed_bytes: Some(models::needed_free_bytes(faster.size_bytes, 0)),
        };
    }
    let left_out = (!best_ok).then(|| {
        if !chip_ok {
            LeftOutReason::NeedsAppleSilicon
        } else if !memory_ok {
            LeftOutReason::NeedsMemory
        } else {
            LeftOutReason::NeedsDiskSpace
        }
    });
    ModelOffer {
        models,
        left_out,
        needed_bytes: None,
    }
}

/// Reads the chip, memory and free space of the disk that holds `models_dir` (or of its
/// nearest existing parent, when the folder does not exist yet).
pub fn detect(models_dir: &Path) -> Hardware {
    let (chip_kind, chip_name, memory_bytes) = chip_and_memory();
    let mut dir = models_dir;
    while !dir.exists() {
        match dir.parent() {
            Some(parent) => dir = parent,
            None => break,
        }
    }
    let free_bytes = models::disk_available_space(dir).unwrap_or(0);
    Hardware {
        chip_kind,
        chip_name,
        memory_bytes,
        free_bytes,
    }
}

/// macOS: `sysctlbyname` reads kernel values by name, the same ones the `sysctl` command
/// prints:
///
/// - `hw.optional.arm64` is 1 on Apple Silicon. It is 1 even when the app runs under Rosetta,
///   which is what we want: the question is what the Mac can do. Intel Macs do not have it.
/// - `machdep.cpu.brand_string` is the chip's marketing name ("Apple M1 Pro").
/// - `hw.memsize` is the installed memory in bytes (a 64-bit number).
#[cfg(target_os = "macos")]
fn chip_and_memory() -> (ChipKind, String, u64) {
    let arm64 = sysctl_u64("hw.optional.arm64").unwrap_or(0) == 1;
    let name = sysctl_string("machdep.cpu.brand_string").unwrap_or_default();
    let kind = if arm64 || name.starts_with("Apple") {
        ChipKind::AppleSilicon
    } else if name.contains("Intel") {
        ChipKind::Intel
    } else {
        ChipKind::Unknown
    };
    (kind, name, sysctl_u64("hw.memsize").unwrap_or(0))
}

#[cfg(not(target_os = "macos"))]
fn chip_and_memory() -> (ChipKind, String, u64) {
    (ChipKind::Unknown, String::new(), 0)
}

/// Reads a numeric sysctl value. The kernel writes 4 bytes for `int` values and 8 for 64-bit
/// ones; the size it reports tells which.
#[cfg(target_os = "macos")]
fn sysctl_u64(name: &str) -> Option<u64> {
    let name = std::ffi::CString::new(name).ok()?;
    let mut value: u64 = 0;
    let mut size = std::mem::size_of::<u64>();
    // SAFETY: `value` is a valid 8-byte buffer and `size` tells the kernel its length; the
    // kernel writes at most `size` bytes and stores the written length back in `size`.
    let result = unsafe {
        libc::sysctlbyname(
            name.as_ptr(),
            (&mut value as *mut u64).cast(),
            &mut size,
            std::ptr::null_mut(),
            0,
        )
    };
    match (result, size) {
        (0, 8) => Some(value),
        // A 4-byte int lands in the low bytes (Apple Silicon and Intel Macs are little-endian).
        (0, 4) => Some(value & 0xffff_ffff),
        _ => None,
    }
}

/// Reads a text sysctl value: first asks for its length, then reads it.
#[cfg(target_os = "macos")]
fn sysctl_string(name: &str) -> Option<String> {
    let name = std::ffi::CString::new(name).ok()?;
    let mut size = 0usize;
    // SAFETY: a null buffer asks only for the length, which the kernel stores in `size`.
    let result = unsafe {
        libc::sysctlbyname(
            name.as_ptr(),
            std::ptr::null_mut(),
            &mut size,
            std::ptr::null_mut(),
            0,
        )
    };
    if result != 0 || size == 0 {
        return None;
    }
    let mut buffer = vec![0u8; size];
    // SAFETY: `buffer` holds `size` bytes, as the kernel asked for.
    let result = unsafe {
        libc::sysctlbyname(
            name.as_ptr(),
            buffer.as_mut_ptr().cast(),
            &mut size,
            std::ptr::null_mut(),
            0,
        )
    };
    if result != 0 {
        return None;
    }
    buffer.truncate(size);
    let text = String::from_utf8_lossy(&buffer);
    Some(text.trim_end_matches('\0').trim().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    const GB: u64 = 1024 * 1024 * 1024;
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
    fn apple_silicon_with_memory_and_disk_gets_both_best_first() {
        let offer = offer_models(&mac(ChipKind::AppleSilicon, 32, 55_000 * MB), &[]);
        assert_eq!(ids(&offer), ["large-v3-turbo", "small"]);
        assert!(offer.models[0].recommended);
        assert!(!offer.models[1].recommended);
        assert_eq!(offer.left_out, None);
        assert_eq!(offer.needed_bytes, None);
        // Exactly 8 GB is enough.
        let offer = offer_models(&mac(ChipKind::AppleSilicon, 8, 20_000 * MB), &[]);
        assert_eq!(ids(&offer), ["large-v3-turbo", "small"]);
    }

    #[test]
    fn small_memory_or_intel_gets_only_the_faster_model() {
        let offer = offer_models(&mac(ChipKind::AppleSilicon, 4, 20_000 * MB), &[]);
        assert_eq!(ids(&offer), ["small"]);
        assert!(!offer.models[0].recommended);
        assert_eq!(offer.left_out, Some(LeftOutReason::NeedsMemory));

        let offer = offer_models(&mac(ChipKind::Intel, 16, 90_000 * MB), &[]);
        assert_eq!(ids(&offer), ["small"]);
        assert_eq!(offer.left_out, Some(LeftOutReason::NeedsAppleSilicon));

        let offer = offer_models(&mac(ChipKind::Unknown, 64, 90_000 * MB), &[]);
        assert_eq!(ids(&offer), ["small"]);
        assert_eq!(offer.left_out, Some(LeftOutReason::NeedsAppleSilicon));
    }

    #[test]
    fn low_disk_leaves_out_the_larger_model() {
        let large = models::known_model(BEST_MODEL_ID).unwrap().size_bytes;
        let small = models::known_model(FASTER_MODEL_ID).unwrap().size_bytes;
        let just_short = models::needed_free_bytes(large, 0) - 1;
        let offer = offer_models(&mac(ChipKind::AppleSilicon, 16, just_short), &[]);
        assert_eq!(ids(&offer), ["small"]);
        assert_eq!(offer.left_out, Some(LeftOutReason::NeedsDiskSpace));

        // 400 MB free: the mock's "low disk" Mac.
        let offer = offer_models(&mac(ChipKind::AppleSilicon, 16, 400 * MB), &[]);
        assert_eq!(ids(&offer), ["small"]);

        let exact = models::needed_free_bytes(small, 0);
        let offer = offer_models(&mac(ChipKind::AppleSilicon, 16, exact), &[]);
        assert_eq!(ids(&offer), ["small"]);
    }

    #[test]
    fn not_enough_disk_for_either_says_how_much_is_needed() {
        let small = models::known_model(FASTER_MODEL_ID).unwrap().size_bytes;
        let offer = offer_models(&mac(ChipKind::AppleSilicon, 32, 100 * MB), &[]);
        assert!(offer.models.is_empty());
        assert_eq!(offer.left_out, None);
        assert_eq!(
            offer.needed_bytes,
            Some(models::needed_free_bytes(small, 0))
        );
    }

    #[test]
    fn an_installed_model_needs_no_free_space() {
        let offer = offer_models(
            &mac(ChipKind::AppleSilicon, 32, 0),
            &["large-v3-turbo".to_string()],
        );
        assert_eq!(ids(&offer), ["large-v3-turbo"]);
        assert_eq!(offer.left_out, None);
        // Installed does not bypass the chip rule.
        let offer = offer_models(
            &mac(ChipKind::Intel, 32, 0),
            &["large-v3-turbo".to_string(), "small".to_string()],
        );
        assert_eq!(ids(&offer), ["small"]);
    }

    #[test]
    fn the_offer_serialises_for_the_frontend() {
        let check = HardwareCheck {
            hardware: Hardware {
                chip_kind: ChipKind::AppleSilicon,
                chip_name: "Apple M1 Pro".into(),
                memory_bytes: 32 * GB,
                free_bytes: 5,
            },
            offer: offer_models(&mac(ChipKind::Intel, 16, 90_000 * MB), &[]),
        };
        assert_eq!(
            serde_json::to_value(&check).unwrap(),
            serde_json::json!({
                "hardware": {
                    "chipKind": "apple_silicon",
                    "chipName": "Apple M1 Pro",
                    "memoryBytes": 32 * GB,
                    "freeBytes": 5,
                },
                "offer": {
                    "models": [{"id": "small", "sizeBytes": 190_085_487, "recommended": false}],
                    "leftOut": "needs_apple_silicon",
                    "neededBytes": null,
                },
            })
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn detect_reads_this_mac() {
        let hardware = detect(&std::env::temp_dir().join("typelite-no-such-folder/models"));
        assert_ne!(hardware.chip_kind, ChipKind::Unknown);
        assert!(!hardware.chip_name.is_empty());
        assert!(hardware.memory_bytes >= GB);
        assert!(hardware.free_bytes > 0);
    }
}
