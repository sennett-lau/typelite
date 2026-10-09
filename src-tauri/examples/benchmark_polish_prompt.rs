//! JSON-lines driver: prints the polish system prompt a default config builds for a transcript
//! (General app, "clean" style, Chinese script "preserve", no language notes, no translation;
//! the default language list is English only, so Chinese routes to no language).
//! With `"target": "zh-Hant-HK"` it builds the Translate prompt for that target instead, with
//! the target's built-in instructions. Input `{"text": "..."}`; output `{"system": "...", "user": "<transcription>...</transcription>"}`.
use std::io::{self, BufRead};

use serde_json::{json, Value};
use typelite_lib::llm::prompt::{build_system_prompt_with_scene, SystemPromptOptions};
use typelite_lib::llm::AppType;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    for line in io::stdin().lock().lines() {
        let request: Value = serde_json::from_str(&line?)?;
        let text = request["text"].as_str().ok_or("expected text")?;
        let target = request["target"].as_str().unwrap_or("");
        let system = build_system_prompt_with_scene(SystemPromptOptions {
            app_type: AppType::General,
            dictionary: &[],
            correction_rules: &[],
            polish_style: "clean",
            active_scene_prompt: "",
            polish_custom_prompt: "",
            polish_chinese_script: "preserve",
            chinese_script_sample: text,
            translate_enabled: !target.is_empty(),
            target_lang: target,
            translation_instructions: "",
            has_selected_text: false,
        });
        println!(
            "{}",
            json!({"system": system, "user": format!("<transcription>\n{text}\n</transcription>")})
        );
    }
    Ok(())
}
