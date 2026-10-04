//! JSON-lines driver for the actual built-in speech engine; input is raw 16 kHz mono PCM16.
use std::io::{self, BufRead};
use std::path::Path;
use std::time::Instant;

use serde_json::{json, Value};
use typelite_lib::stt::builtin::engine;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let model = std::env::args().nth(1).ok_or("expected model path")?;
    let start = Instant::now();
    engine().preload(Path::new(&model))?;
    println!(
        "{}",
        json!({"ready": true, "load_ms": start.elapsed().as_secs_f64() * 1000.0})
    );
    for line in io::stdin().lock().lines() {
        let request: Value = serde_json::from_str(&line?)?;
        let pcm = std::fs::read(request["pcm"].as_str().ok_or("expected pcm path")?)?;
        let start = Instant::now();
        let result = engine().transcribe(Path::new(&model), &pcm, request["language"].as_str())?;
        println!(
            "{}",
            json!({
                "elapsed_ms": start.elapsed().as_secs_f64() * 1000.0,
                "text": result.text, "language": result.language,
                "dropped_segments": result.dropped_segments,
            })
        );
    }
    Ok(())
}
