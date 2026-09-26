//! Plan `language-prompt-library`: checks the language presets in `presets/languages/` at the
//! repository root, and the generated `index.json` next to them.
//!
//! Test-only for now. This is a second parser, independent of `scripts/language-presets.mjs`
//! (the generator contributors run), so the gate fails when a preset is invalid or the index is
//! stale, and the two parsers must agree. When the app gains the download feature, this parser
//! and the matching rules below move into app code.
//!
//! A preset is `presets/languages/<id>/preset.md`: front matter in a strict YAML subset (one
//! `key: value` per line; text, integers or `[a, b]` lists), then the sections
//! `## Instructions`, optional `## Variant: <tag>` notes and optional `## Examples`.

use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};

use sha2::{Digest, Sha256};

const PRESET_FORMAT: i64 = 1;
const INDEX_FORMAT: i64 = 1;
const MAX_FILE_BYTES: usize = 8 * 1024;
/// Same limit as a language's own instructions in Settings.
const MAX_RENDERED_CHARS: usize = crate::storage::TRANSLATION_INSTRUCTIONS_MAX_CHARS;
const MAX_VARIANT_CHARS: usize = 400;
const MAX_NAME_CHARS: usize = 60;
const MAX_SUMMARY_CHARS: usize = 140;
const MAX_HINT_CHARS: usize = 140;
const REQUIRED_KEYS: &[&str] = &[
    "id",
    "name",
    "version",
    "format",
    "tier",
    "languages",
    "applies_to",
    "summary",
    "authors",
    "license",
];
const OPTIONAL_KEYS: &[&str] = &["model_hint", "deprecated"];
const TIERS: &[&str] = &["official", "community"];
const OPERATIONS: &[&str] = &["polish", "translate"];
const LICENSE: &str = "CC0-1.0";
/// A preset folder holds the preset and, optionally, notes for reviewers. Nothing else.
const ALLOWED_FILES: &[&str] = &["preset.md", "NOTES.md"];

fn library_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../presets/languages")
}

// ─── Parsing ───

#[derive(Debug, Clone, PartialEq)]
enum Value {
    Text(String),
    Int(i64),
    List(Vec<String>),
}

fn parse_scalar(raw: &str) -> Result<String, String> {
    if let Some(rest) = raw.strip_prefix('"') {
        return rest
            .strip_suffix('"')
            .map(str::to_string)
            .ok_or_else(|| format!("unclosed quote: {raw}"));
    }
    Ok(raw.to_string())
}

fn parse_value(raw: &str) -> Result<Value, String> {
    if let Some(rest) = raw.strip_prefix('[') {
        let inner = rest
            .strip_suffix(']')
            .ok_or_else(|| format!("unclosed list: {raw}"))?
            .trim();
        if inner.is_empty() {
            return Ok(Value::List(Vec::new()));
        }
        let items = inner
            .split(',')
            .map(|item| parse_scalar(item.trim()))
            .collect::<Result<Vec<_>, _>>()?;
        return Ok(Value::List(items));
    }
    let digits = raw.strip_prefix('-').unwrap_or(raw);
    if !digits.is_empty() && digits.chars().all(|c| c.is_ascii_digit()) {
        return raw
            .parse()
            .map(Value::Int)
            .map_err(|_| format!("number out of range: {raw}"));
    }
    parse_scalar(raw).map(Value::Text)
}

/// A preset that passed validation.
#[derive(Debug, Clone)]
struct Preset {
    id: String,
    name: String,
    version: i64,
    tier: String,
    languages: Vec<String>,
    applies_to: Vec<String>,
    summary: String,
    authors: Vec<String>,
    model_hint: Option<String>,
    deprecated: Option<String>,
    instructions: String,
    /// Variant tag → note.
    variants: BTreeMap<String, String>,
    examples: Option<String>,
    bytes: usize,
    sha256: String,
}

/// Front matter fields and `(heading, text)` sections, or the first format error.
type Parsed = (BTreeMap<String, Value>, Vec<(String, String)>);

fn split_preset(text: &str) -> Result<Parsed, String> {
    if text.starts_with('\u{feff}') {
        return Err("file starts with a byte-order mark".into());
    }
    if text.contains('\r') {
        return Err("file has CR line endings; use LF".into());
    }
    if !text.ends_with('\n') {
        return Err("file must end with a newline".into());
    }
    let lines: Vec<&str> = text.split('\n').collect();
    if lines[0] != "---" {
        return Err("file must start with a --- front matter line".into());
    }
    let end = lines
        .iter()
        .skip(1)
        .position(|line| *line == "---")
        .map(|offset| offset + 1)
        .ok_or("front matter has no closing --- line")?;

    let mut fields = BTreeMap::new();
    for line in &lines[1..end] {
        let (key, raw) = line
            .split_once(": ")
            .filter(|(key, raw)| {
                !key.is_empty()
                    && key.chars().all(|c| c.is_ascii_lowercase() || c == '_')
                    && !raw.trim().is_empty()
            })
            .ok_or_else(|| format!("front matter line is not \"key: value\": {line}"))?;
        if fields
            .insert(key.to_string(), parse_value(raw.trim())?)
            .is_some()
        {
            return Err(format!("front matter key given twice: {key}"));
        }
    }

    let mut sections: Vec<(String, Vec<&str>)> = Vec::new();
    for line in &lines[end + 1..] {
        if let Some(heading) = line.strip_prefix("## ") {
            sections.push((heading.trim().to_string(), Vec::new()));
        } else if let Some((_, body)) = sections.last_mut() {
            body.push(line);
        } else if !line.trim().is_empty() {
            return Err("text before ## Instructions".into());
        }
    }
    let sections = sections
        .into_iter()
        .map(|(heading, body)| (heading, body.join("\n").trim().to_string()))
        .collect();
    Ok((fields, sections))
}

/// Well-formed `language[-Script][-REGION]`; returns the language subtag.
fn tag_language(tag: &str) -> Option<&str> {
    let mut parts = tag.split('-');
    let language = parts.next()?;
    if !(2..=3).contains(&language.len()) || !language.chars().all(|c| c.is_ascii_lowercase()) {
        return None;
    }
    let mut rest: Vec<&str> = parts.collect();
    let is_script = |s: &str| {
        s.len() == 4
            && s.chars().next().is_some_and(|c| c.is_ascii_uppercase())
            && s.chars().skip(1).all(|c| c.is_ascii_lowercase())
    };
    let is_region = |s: &str| {
        (s.len() == 2 && s.chars().all(|c| c.is_ascii_uppercase()))
            || (s.len() == 3 && s.chars().all(|c| c.is_ascii_digit()))
    };
    if rest.first().is_some_and(|s| is_script(s)) {
        rest.remove(0);
    }
    if rest.first().is_some_and(|s| is_region(s)) {
        rest.remove(0);
    }
    rest.is_empty().then_some(language)
}

/// A preset tag matches a selected code when it equals it or is a prefix of it at a `-`.
fn tag_matches(tag: &str, code: &str) -> bool {
    code == tag
        || code
            .strip_prefix(tag)
            .is_some_and(|rest| rest.starts_with('-'))
}

fn text_field(
    fields: &BTreeMap<String, Value>,
    key: &str,
    max: usize,
    errors: &mut Vec<String>,
) -> Option<String> {
    match fields.get(key) {
        None => None,
        Some(Value::Text(text)) if !text.trim().is_empty() => {
            if text.chars().count() > max {
                errors.push(format!("{key} is longer than {max} characters"));
            }
            Some(text.clone())
        }
        Some(_) => {
            errors.push(format!("{key} must be text"));
            None
        }
    }
}

fn list_field(
    fields: &BTreeMap<String, Value>,
    key: &str,
    errors: &mut Vec<String>,
) -> Vec<String> {
    match fields.get(key) {
        Some(Value::List(items)) if !items.is_empty() && items.iter().all(|i| !i.is_empty()) => {
            if items.iter().collect::<BTreeSet<_>>().len() != items.len() {
                errors.push(format!("{key} has duplicates"));
            }
            items.clone()
        }
        _ => {
            errors.push(format!("{key} must be a non-empty list"));
            Vec::new()
        }
    }
}

/// Parses and validates one `preset.md`; `folder` is its folder name.
fn validate_preset(
    folder: &str,
    bytes: &[u8],
    known_languages: &BTreeSet<String>,
) -> Result<Preset, Vec<String>> {
    let mut errors = Vec::new();
    if bytes.len() > MAX_FILE_BYTES {
        errors.push(format!("file is larger than {MAX_FILE_BYTES} bytes"));
    }
    let text = std::str::from_utf8(bytes).map_err(|_| vec!["file is not UTF-8".to_string()])?;
    let (fields, sections) = split_preset(text).map_err(|error| vec![error])?;

    for key in fields.keys() {
        if !REQUIRED_KEYS.contains(&key.as_str()) && !OPTIONAL_KEYS.contains(&key.as_str()) {
            errors.push(format!("unknown front matter key: {key}"));
        }
    }
    for key in REQUIRED_KEYS {
        if !fields.contains_key(*key) {
            errors.push(format!("missing {key}"));
        }
    }

    let id = match fields.get("id") {
        Some(Value::Text(id))
            if (3..=48).contains(&id.len())
                && !id.starts_with('-')
                && !id.ends_with('-')
                && !id.contains("--")
                && id
                    .chars()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-') =>
        {
            if id != folder {
                errors.push(format!("id \"{id}\" differs from its folder \"{folder}\""));
            }
            id.clone()
        }
        _ => {
            errors.push("id must be a lowercase slug of 3 to 48 characters".into());
            String::new()
        }
    };
    let name = text_field(&fields, "name", MAX_NAME_CHARS, &mut errors).unwrap_or_default();
    let summary =
        text_field(&fields, "summary", MAX_SUMMARY_CHARS, &mut errors).unwrap_or_default();
    let model_hint = text_field(&fields, "model_hint", MAX_HINT_CHARS, &mut errors);
    let deprecated = text_field(&fields, "deprecated", MAX_HINT_CHARS, &mut errors);
    let version = match fields.get("version") {
        Some(Value::Int(version)) if *version >= 1 => *version,
        _ => {
            errors.push("version must be a positive whole number".into());
            0
        }
    };
    if fields.get("format") != Some(&Value::Int(PRESET_FORMAT)) {
        errors.push(format!("format must be {PRESET_FORMAT}"));
    }
    let tier = match fields.get("tier") {
        Some(Value::Text(tier)) if TIERS.contains(&tier.as_str()) => tier.clone(),
        _ => {
            errors.push(format!("tier must be one of {}", TIERS.join(", ")));
            String::new()
        }
    };
    if fields.get("license") != Some(&Value::Text(LICENSE.into())) {
        errors.push(format!("license must be {LICENSE}"));
    }

    let languages = list_field(&fields, "languages", &mut errors);
    for tag in &languages {
        match tag_language(tag) {
            None => errors.push(format!(
                "language tag is not language[-Script][-REGION]: {tag}"
            )),
            Some(language) if !known_languages.contains(language) => errors.push(format!(
                "language {language} (in {tag}) is not in language-codes.json"
            )),
            Some(_) => {}
        }
        for other in &languages {
            if other != tag && tag_matches(tag, other) {
                errors.push(format!("language {other} is already covered by {tag}"));
            }
        }
    }
    let applies_to = list_field(&fields, "applies_to", &mut errors);
    for operation in &applies_to {
        if !OPERATIONS.contains(&operation.as_str()) {
            errors.push(format!("unknown applies_to value: {operation}"));
        }
    }
    let authors = list_field(&fields, "authors", &mut errors);

    // Sections: Instructions, then Variant notes, then Examples.
    let mut instructions = None;
    let mut examples = None;
    let mut variants = BTreeMap::new();
    let mut stage = 0;
    for (heading, body) in sections {
        if heading == "Instructions" {
            if stage != 0 {
                errors.push("## Instructions must come first, once".into());
            }
            instructions = Some(body);
            stage = 1;
        } else if let Some(tag) = heading.strip_prefix("Variant: ") {
            let tag = tag.trim().to_string();
            if stage != 1 {
                errors.push(format!("## Variant: {tag} must follow ## Instructions"));
            }
            if tag_language(&tag).is_none() {
                errors.push(format!("variant tag is not well formed: {tag}"));
            }
            if !languages.iter().any(|language| tag_matches(language, &tag)) {
                errors.push(format!("variant {tag} is not covered by languages"));
            }
            if body.is_empty() {
                errors.push(format!("variant {tag} is empty"));
            }
            if body.chars().count() > MAX_VARIANT_CHARS {
                errors.push(format!(
                    "variant {tag} is longer than {MAX_VARIANT_CHARS} characters"
                ));
            }
            if variants.insert(tag.clone(), body).is_some() {
                errors.push(format!("variant {tag} given twice"));
            }
        } else if heading == "Examples" {
            if stage == 0 || stage == 2 {
                errors.push("## Examples must come last, once".into());
            }
            if body.is_empty() {
                errors.push("## Examples is empty".into());
            }
            examples = Some(body);
            stage = 2;
        } else {
            errors.push(format!("unknown section: ## {heading}"));
        }
    }
    let instructions = instructions.filter(|text| !text.is_empty());
    if instructions.is_none() {
        errors.push("## Instructions is missing or empty".into());
    }
    if !errors.is_empty() {
        return Err(errors);
    }

    let preset = Preset {
        id,
        name,
        version,
        tier,
        languages,
        applies_to,
        summary,
        authors,
        model_hint,
        deprecated,
        instructions: instructions.unwrap_or_default(),
        variants,
        examples,
        bytes: bytes.len(),
        sha256: format!("{:x}", Sha256::digest(bytes)),
    };
    for variant in std::iter::once(None).chain(preset.variants.keys().map(Some)) {
        let length = render(&preset, variant.map(String::as_str)).chars().count();
        if length > MAX_RENDERED_CHARS {
            errors.push(format!(
                "rendered text{} is {length} characters (limit {MAX_RENDERED_CHARS})",
                variant.map(|v| format!(" for {v}")).unwrap_or_default()
            ));
        }
    }
    if errors.is_empty() {
        Ok(preset)
    } else {
        Err(errors)
    }
}

/// The text the model gets: Instructions, the variant's note (if any), then Examples.
fn render(preset: &Preset, variant: Option<&str>) -> String {
    let mut parts = vec![preset.instructions.clone()];
    if let Some(note) = variant.and_then(|tag| preset.variants.get(tag)) {
        parts.push(format!(
            "Notes for {}:\n{note}",
            variant.unwrap_or_default()
        ));
    }
    if let Some(examples) = &preset.examples {
        parts.push(format!("Examples:\n{examples}"));
    }
    parts.join("\n\n")
}

/// The note to use for a selected code: the longest variant tag that matches it.
fn best_variant<'a>(preset: &'a Preset, code: &str) -> Option<&'a str> {
    preset
        .variants
        .keys()
        .filter(|tag| tag_matches(tag, code))
        .max_by_key(|tag| tag.len())
        .map(String::as_str)
}

// ─── Matching (see language-matching.md in the plan) ───

/// Fixes case and adds the script to Chinese and Cantonese codes, where it is ambiguous.
fn normalize_code(code: &str) -> String {
    let parts: Vec<String> = code
        .trim()
        .replace('_', "-")
        .split('-')
        .enumerate()
        .map(|(i, part)| match (i, part.len()) {
            (0, _) => part.to_ascii_lowercase(),
            (_, 4) => {
                let lower = part.to_ascii_lowercase();
                lower[..1].to_ascii_uppercase() + &lower[1..]
            }
            _ => part.to_ascii_uppercase(),
        })
        .collect();
    let has_script = parts.get(1).is_some_and(|p| p.len() == 4);
    let (language, rest) = (parts[0].as_str(), &parts[1..]);
    if has_script || !matches!(language, "zh" | "yue") {
        return parts.join("-");
    }
    let region = rest.first().map(String::as_str);
    let (script, region) = match (language, region) {
        ("zh", None) => ("Hans", None),
        ("zh", Some(r @ ("HK" | "MO" | "TW"))) => ("Hant", Some(r)),
        ("zh", Some(r)) => ("Hans", Some(r)),
        ("yue", None) => ("Hant", Some("HK")),
        ("yue", Some("CN")) => ("Hans", Some("CN")),
        (_, r) => ("Hant", r),
    };
    let mut normalized = format!("{language}-{script}");
    if let Some(region) = region {
        normalized.push('-');
        normalized.push_str(region);
    }
    normalized
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct Match {
    id: String,
    /// Subtags of the best matching tag.
    specificity: usize,
    /// False when found only through the macrolanguage (`yue` → `zh`).
    direct: bool,
}

fn best_specificity(preset: &Preset, code: &str) -> Option<usize> {
    preset
        .languages
        .iter()
        .filter(|tag| tag_matches(tag, code))
        .map(|tag| tag.split('-').count())
        .max()
}

/// Presets for a selected code, best first, plus the related ones (same language, no match).
fn find_presets(
    presets: &[Preset],
    code: &str,
    macrolanguages: &BTreeMap<String, String>,
) -> (Vec<Match>, Vec<String>) {
    let code = normalize_code(code);
    let language = code.split('-').next().unwrap_or_default().to_string();
    let macro_code = macrolanguages
        .get(&language)
        .map(|parent| format!("{parent}{}", &code[language.len()..]));
    let listed: Vec<&Preset> = presets.iter().filter(|p| p.deprecated.is_none()).collect();

    let mut matches: Vec<(Match, &Preset)> = Vec::new();
    for preset in &listed {
        if let Some(specificity) = best_specificity(preset, &code) {
            matches.push((
                Match {
                    id: preset.id.clone(),
                    specificity,
                    direct: true,
                },
                preset,
            ));
        } else if let Some(specificity) = macro_code
            .as_deref()
            .and_then(|macro_code| best_specificity(preset, macro_code))
        {
            matches.push((
                Match {
                    id: preset.id.clone(),
                    specificity,
                    direct: false,
                },
                preset,
            ));
        }
    }
    matches.sort_by(|(a, pa), (b, pb)| {
        b.direct
            .cmp(&a.direct)
            .then(b.specificity.cmp(&a.specificity))
            .then((pa.tier != "official").cmp(&(pb.tier != "official")))
            .then(pa.name.cmp(&pb.name))
    });

    let primaries: BTreeSet<&str> = std::iter::once(language.as_str())
        .chain(macrolanguages.get(&language).map(String::as_str))
        .collect();
    let mut related: Vec<String> = listed
        .iter()
        .filter(|preset| !matches.iter().any(|(m, _)| m.id == preset.id))
        .filter(|preset| {
            preset.languages.iter().any(|tag| {
                let primary = tag.split('-').next().unwrap_or_default();
                primaries.contains(primary)
                    || macrolanguages
                        .get(primary)
                        .is_some_and(|parent| primaries.contains(parent.as_str()))
            })
        })
        .map(|preset| preset.id.clone())
        .collect();
    related.sort();
    (matches.into_iter().map(|(m, _)| m).collect(), related)
}

// ─── Loading the library ───

struct LanguageCodes {
    languages: BTreeSet<String>,
    macrolanguages: BTreeMap<String, String>,
}

fn load_language_codes() -> LanguageCodes {
    let text = std::fs::read_to_string(library_dir().join("language-codes.json"))
        .expect("read language-codes.json");
    let json: serde_json::Value = serde_json::from_str(&text).expect("parse language-codes.json");
    let languages = json["languages"]
        .as_object()
        .expect("languages map")
        .keys()
        .cloned()
        .collect();
    let macrolanguages = json["macrolanguages"]
        .as_object()
        .expect("macrolanguages map")
        .iter()
        .map(|(k, v)| {
            (
                k.clone(),
                v.as_str().expect("macrolanguage code").to_string(),
            )
        })
        .collect();
    LanguageCodes {
        languages,
        macrolanguages,
    }
}

/// Every preset folder, validated. Panics with every problem found.
fn load_library(codes: &LanguageCodes) -> Vec<Preset> {
    let mut folders: Vec<PathBuf> = std::fs::read_dir(library_dir())
        .expect("read presets/languages")
        .map(|entry| entry.expect("dir entry").path())
        .filter(|path| path.is_dir())
        .collect();
    folders.sort();
    let mut problems = Vec::new();
    let mut presets = Vec::new();
    for folder in folders {
        let name = folder.file_name().unwrap().to_string_lossy().to_string();
        let Ok(bytes) = std::fs::read(folder.join("preset.md")) else {
            problems.push(format!("{name}: missing preset.md"));
            continue;
        };
        for file in std::fs::read_dir(&folder).expect("read preset folder") {
            let file = file
                .expect("dir entry")
                .file_name()
                .to_string_lossy()
                .to_string();
            if !ALLOWED_FILES.contains(&file.as_str()) {
                problems.push(format!("{name}: unexpected file {file}"));
            }
        }
        match validate_preset(&name, &bytes, &codes.languages) {
            Ok(preset) => presets.push(preset),
            Err(errors) => problems.extend(errors.into_iter().map(|e| format!("{name}: {e}"))),
        }
    }
    let mut ids = BTreeSet::new();
    for preset in &presets {
        if !ids.insert(preset.id.clone()) {
            problems.push(format!("duplicate id: {}", preset.id));
        }
    }
    assert!(
        problems.is_empty(),
        "invalid presets:\n{}",
        problems.join("\n")
    );
    presets
}

fn index_entry(preset: &Preset) -> serde_json::Value {
    let mut entry = serde_json::json!({
        "id": preset.id,
        "name": preset.name,
        "version": preset.version,
        "format": PRESET_FORMAT,
        "tier": preset.tier,
        "languages": preset.languages,
        "variants": preset.variants.keys().collect::<Vec<_>>(),
        "applies_to": preset.applies_to,
        "summary": preset.summary,
        "authors": preset.authors,
        "path": format!("{}/preset.md", preset.id),
        "bytes": preset.bytes,
        "sha256": preset.sha256,
    });
    if let Some(hint) = &preset.model_hint {
        entry["model_hint"] = hint.clone().into();
    }
    if let Some(reason) = &preset.deprecated {
        entry["deprecated"] = reason.clone().into();
    }
    entry
}

#[cfg(test)]
mod tests {
    use super::*;

    fn known() -> BTreeSet<String> {
        ["en", "zh", "yue", "es"]
            .iter()
            .map(|s| s.to_string())
            .collect()
    }

    fn preset_text(front: &str, body: &str) -> String {
        format!("---\n{front}\n---\n\n{body}\n")
    }

    const GOOD_FRONT: &str = "id: sample\nname: Sample\nversion: 1\nformat: 1\ntier: community\nlanguages: [en]\napplies_to: [polish, translate]\nsummary: A sample.\nauthors: [someone]\nlicense: CC0-1.0";

    fn errors_for(front: &str, body: &str) -> Vec<String> {
        validate_preset("sample", preset_text(front, body).as_bytes(), &known())
            .err()
            .unwrap_or_default()
    }

    #[test]
    fn every_preset_in_the_repository_is_valid() {
        let codes = load_language_codes();
        let presets = load_library(&codes);
        let ids: Vec<&str> = presets.iter().map(|p| p.id.as_str()).collect();
        for seed in ["cantonese-hong-kong", "english", "mandarin-taiwan"] {
            assert!(ids.contains(&seed), "seed preset {seed} is missing");
        }
    }

    #[test]
    fn index_json_is_up_to_date() {
        let codes = load_language_codes();
        let presets = load_library(&codes);
        let text =
            std::fs::read_to_string(library_dir().join("index.json")).expect("read index.json");
        let index: serde_json::Value = serde_json::from_str(&text).expect("parse index.json");
        let expected = serde_json::json!({
            "format": INDEX_FORMAT,
            "presets": presets.iter().map(index_entry).collect::<Vec<_>>(),
        });
        assert_eq!(
            index, expected,
            "presets/languages/index.json is out of date; run: node scripts/language-presets.mjs"
        );
    }

    #[test]
    fn a_good_preset_passes_and_renders_its_sections() {
        let body = "## Instructions\nWrite well.\n\n## Variant: en-GB\nBritish spelling.\n\n## Examples\n\"a\" → A";
        let preset =
            validate_preset("sample", preset_text(GOOD_FRONT, body).as_bytes(), &known()).unwrap();
        assert_eq!(render(&preset, None), "Write well.\n\nExamples:\n\"a\" → A");
        assert_eq!(
            render(&preset, Some("en-GB")),
            "Write well.\n\nNotes for en-GB:\nBritish spelling.\n\nExamples:\n\"a\" → A"
        );
    }

    #[test]
    fn bad_front_matter_is_rejected() {
        let front = "id: Bad_Id\nname: X\nversion: 0\nformat: 2\ntier: gold\nlanguages: [en, en-GB, zh-Hant-KHX, xx]\napplies_to: [polish, ask]\nsummary: s\nauthors: [a]\nlicense: MIT\nlanguage: en";
        let errors = errors_for(front, "## Instructions\nx");
        for expected in [
            "unknown front matter key: language",
            "id must be a lowercase slug of 3 to 48 characters",
            "version must be a positive whole number",
            "format must be 1",
            "tier must be one of official, community",
            "license must be CC0-1.0",
            "language en-GB is already covered by en",
            "language tag is not language[-Script][-REGION]: zh-Hant-KHX",
            "language xx (in xx) is not in language-codes.json",
            "unknown applies_to value: ask",
        ] {
            assert!(
                errors.iter().any(|e| e == expected),
                "missing error {expected:?} in {errors:?}"
            );
        }
        let missing = errors_for("id: sample", "## Instructions\nx");
        assert!(missing.iter().any(|e| e == "missing languages"));
        let wrong_folder = validate_preset(
            "other",
            preset_text(GOOD_FRONT, "## Instructions\nx").as_bytes(),
            &known(),
        )
        .unwrap_err();
        assert!(wrong_folder[0].contains("differs from its folder"));
    }

    #[test]
    fn bad_sections_are_rejected() {
        let errors = errors_for(
            GOOD_FRONT,
            "## Variant: fr\nbonjour\n## Instructions\nx\n## Other\ny",
        );
        assert!(errors
            .iter()
            .any(|e| e == "variant fr is not covered by languages"));
        assert!(errors
            .iter()
            .any(|e| e == "## Variant: fr must follow ## Instructions"));
        assert!(errors.iter().any(|e| e == "unknown section: ## Other"));

        let text_before = errors_for(GOOD_FRONT, "hello\n## Instructions\nx");
        assert_eq!(text_before, vec!["text before ## Instructions"]);

        let crlf = validate_preset(
            "sample",
            preset_text(GOOD_FRONT, "## Instructions\nx")
                .replace('\n', "\r\n")
                .as_bytes(),
            &known(),
        )
        .unwrap_err();
        assert_eq!(crlf, vec!["file has CR line endings; use LF"]);
    }

    #[test]
    fn rendered_text_over_the_limit_is_rejected() {
        let fits = format!("## Instructions\n{}", "x".repeat(MAX_RENDERED_CHARS));
        assert!(errors_for(GOOD_FRONT, &fits).is_empty());
        // Counted in characters, like the app: 2000 Chinese characters fit, 2001 do not.
        let cjk = format!("## Instructions\n{}", "嘅".repeat(MAX_RENDERED_CHARS + 1));
        let errors = errors_for(GOOD_FRONT, &cjk);
        assert!(errors
            .iter()
            .any(|e| e.starts_with("rendered text is 2001")));
        // Files over 8 KiB are rejected.
        let huge = format!("## Instructions\n{}", "x".repeat(MAX_FILE_BYTES));
        assert!(errors_for(GOOD_FRONT, &huge)
            .iter()
            .any(|e| e.starts_with("file is larger than")));
        // A variant note can push one rendering over the limit.
        let body = format!(
            "## Instructions\n{}\n## Variant: en-GB\nshort note",
            "x".repeat(MAX_RENDERED_CHARS - 5)
        );
        let errors = errors_for(GOOD_FRONT, &body);
        assert!(errors
            .iter()
            .any(|e| e.starts_with("rendered text for en-GB")));
    }

    #[test]
    fn codes_are_normalized_before_matching() {
        assert_eq!(normalize_code("en"), "en");
        assert_eq!(normalize_code("en_gb"), "en-GB");
        assert_eq!(normalize_code("zh"), "zh-Hans");
        assert_eq!(normalize_code("zh-HK"), "zh-Hant-HK");
        assert_eq!(normalize_code("zh-hant-hk"), "zh-Hant-HK");
        assert_eq!(normalize_code("zh-CN"), "zh-Hans-CN");
        assert_eq!(normalize_code("yue"), "yue-Hant-HK");
        assert_eq!(normalize_code("yue-CN"), "yue-Hans-CN");
        assert!(tag_matches("en", "en-GB"));
        assert!(tag_matches("zh-Hant", "zh-Hant-HK"));
        assert!(!tag_matches("en-GB", "en"));
        assert!(!tag_matches("e", "en"));
    }

    /// The worked example in language-matching.md: en-GB finds the shared `english` preset
    /// (plus a more specific community one first), and en-US and en-NZ find the same file.
    #[test]
    fn english_variants_resolve_to_the_shared_english_preset() {
        let codes = load_language_codes();
        let mut presets = load_library(&codes);
        let english = presets.iter().find(|p| p.id == "english").unwrap().clone();
        let mut community = |id: &str, name: &str, tag: &str| {
            let mut preset = english.clone();
            preset.id = id.into();
            preset.name = name.into();
            preset.tier = "community".into();
            preset.languages = vec![tag.into()];
            preset.variants.clear();
            presets.push(preset);
        };
        community("british-plain-legal", "British plain legal", "en-GB");
        community("english-australia-casual", "Australian casual", "en-AU");

        let (matches, related) = find_presets(&presets, "en-GB", &codes.macrolanguages);
        let ids: Vec<&str> = matches.iter().map(|m| m.id.as_str()).collect();
        assert_eq!(ids, ["british-plain-legal", "english"]);
        assert_eq!(matches[1].specificity, 1);
        assert_eq!(related, ["english-australia-casual"]);
        assert_eq!(best_variant(&english, "en-GB"), Some("en-GB"));
        let rendered = render(&english, best_variant(&english, "en-GB"));
        assert!(rendered.contains("Notes for en-GB:\nBritish spelling"));
        assert!(!rendered.contains("American spelling"));

        for code in ["en-US", "en-NZ", "en"] {
            let (matches, _) = find_presets(&presets, code, &codes.macrolanguages);
            assert!(matches.iter().any(|m| m.id == "english"), "{code}");
        }
        assert_eq!(best_variant(&english, "en-NZ"), None);
        assert_eq!(best_variant(&english, "en"), None);
        // Plain `en` does not directly match presets written for one region.
        let (matches, related) = find_presets(&presets, "en", &codes.macrolanguages);
        assert_eq!(matches.len(), 1);
        assert_eq!(related, ["british-plain-legal", "english-australia-casual"]);
    }

    #[test]
    fn chinese_codes_resolve_to_the_right_presets() {
        let codes = load_language_codes();
        let presets = load_library(&codes);
        for code in ["zh-Hant-HK", "zh-HK", "yue", "yue-HK"] {
            let (matches, related) = find_presets(&presets, code, &codes.macrolanguages);
            assert_eq!(matches[0].id, "cantonese-hong-kong", "{code}");
            assert!(matches[0].direct, "{code}");
            assert!(related.contains(&"mandarin-taiwan".to_string()), "{code}");
        }
        let (matches, related) = find_presets(&presets, "zh-TW", &codes.macrolanguages);
        assert_eq!(matches[0].id, "mandarin-taiwan");
        assert!(related.contains(&"cantonese-hong-kong".to_string()));
        // Simplified Chinese has no preset yet; both Traditional ones are related only.
        let (matches, related) = find_presets(&presets, "zh", &codes.macrolanguages);
        assert!(matches.is_empty());
        assert_eq!(related, ["cantonese-hong-kong", "mandarin-taiwan"]);
    }

    #[test]
    fn macrolanguage_matches_rank_below_direct_ones() {
        let codes = load_language_codes();
        let presets = load_library(&codes);
        let mut formal = presets
            .iter()
            .find(|p| p.id == "cantonese-hong-kong")
            .unwrap()
            .clone();
        formal.id = "chinese-hong-kong-formal".into();
        formal.name = "A formal".into();
        formal.languages = vec!["zh-Hant-HK".into()];
        let mut all = presets.clone();
        all.push(formal);
        let (matches, _) = find_presets(&all, "yue-Hant-HK", &codes.macrolanguages);
        assert_eq!(matches[0].id, "cantonese-hong-kong");
        assert_eq!(matches[1].id, "chinese-hong-kong-formal");
        assert!(!matches[1].direct);
    }

    #[test]
    fn deprecated_presets_are_not_listed() {
        let codes = load_language_codes();
        let mut presets = load_library(&codes);
        for preset in &mut presets {
            preset.deprecated = Some("Replaced".into());
        }
        let (matches, related) = find_presets(&presets, "en-GB", &codes.macrolanguages);
        assert!(matches.is_empty() && related.is_empty());
    }
}
