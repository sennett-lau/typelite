//! Pure-Rust Qwen3 text worker (candle, GGUF) for the runtime A/B benchmark (plan
//! `rust-inference`). Reads the same GGUF file as the built-in llama-server.
//!
//!     qwen <model.gguf> <tokenizer.json>
//!     → {"ready": true, "load_ms": …}
//!     ← {"prompt": "<raw prompt, chat template applied>", "max_tokens": 512}
//!     → {"prefill_ms": …, "total_ms": …, "prompt_tokens": …, "generated_tokens": …, "text": …}
//!
//! Greedy decoding, stop at `<|im_end|>` or `<|endoftext|>`, a fresh KV cache per request
//! (llama-server is run with prompt caching off for the comparison).

use std::io::{self, BufRead, Write};
use std::time::Instant;

use candle_core::quantized::gguf_file;
use candle_core::{Device, Tensor, D};
use candle_transformers::models::quantized_qwen3::ModelWeights;
use serde_json::{json, Value};
use tokenizers::Tokenizer;

type Result<T> = std::result::Result<T, Box<dyn std::error::Error + Send + Sync>>;

struct Engine {
    model: ModelWeights,
    tokenizer: Tokenizer,
    stop: Vec<u32>,
    device: Device,
}

struct Completion {
    prefill_ms: f64,
    total_ms: f64,
    prompt_tokens: usize,
    generated: Vec<u32>,
}

impl Engine {
    fn load(model_path: &str, tokenizer_path: &str) -> Result<Self> {
        let device = Device::new_metal(0)?;
        let mut file = std::fs::File::open(model_path)?;
        let content = gguf_file::Content::read(&mut file)?;
        let model = ModelWeights::from_gguf(content, &mut file, &device)?;
        let tokenizer = Tokenizer::from_file(tokenizer_path)?;
        let stop = ["<|im_end|>", "<|endoftext|>"]
            .iter()
            .filter_map(|token| tokenizer.token_to_id(token))
            .collect();
        Ok(Self {
            model,
            tokenizer,
            stop,
            device,
        })
    }

    fn complete(&mut self, prompt: &str, max_tokens: usize) -> Result<Completion> {
        let started = Instant::now();
        let prompt_ids = self.tokenizer.encode(prompt, false)?.get_ids().to_vec();
        self.model.clear_kv_cache();

        let input = Tensor::new(prompt_ids.as_slice(), &self.device)?.unsqueeze(0)?;
        let mut next = self
            .model
            .forward(&input, 0)?
            .argmax(D::Minus1)?
            .squeeze(0)?
            .to_scalar::<u32>()?;
        let prefill_ms = started.elapsed().as_secs_f64() * 1000.0;

        let mut generated = Vec::with_capacity(max_tokens);
        while generated.len() < max_tokens && !self.stop.contains(&next) {
            generated.push(next);
            let input = Tensor::new(&[next], &self.device)?.unsqueeze(0)?;
            let offset = prompt_ids.len() + generated.len() - 1;
            next = self
                .model
                .forward(&input, offset)?
                .argmax(D::Minus1)?
                .squeeze(0)?
                .to_scalar::<u32>()?;
        }
        Ok(Completion {
            prefill_ms,
            total_ms: started.elapsed().as_secs_f64() * 1000.0,
            prompt_tokens: prompt_ids.len(),
            generated,
        })
    }
}

fn main() -> Result<()> {
    let mut args = std::env::args().skip(1);
    let model = args.next().ok_or("expected the GGUF model path")?;
    let tokenizer = args.next().ok_or("expected the tokenizer.json path")?;
    let started = Instant::now();
    let mut engine = Engine::load(&model, &tokenizer)?;
    let mut out = io::stdout().lock();
    writeln!(
        out,
        "{}",
        json!({"ready": true, "load_ms": started.elapsed().as_secs_f64() * 1000.0})
    )?;
    out.flush()?;
    for line in io::stdin().lock().lines() {
        let request: Value = serde_json::from_str(&line?)?;
        let prompt = request["prompt"].as_str().ok_or("expected a prompt")?;
        let max_tokens = request["max_tokens"].as_u64().unwrap_or(512) as usize;
        let completion = engine.complete(prompt, max_tokens)?;
        let text = engine.tokenizer.decode(&completion.generated, true)?;
        writeln!(
            out,
            "{}",
            json!({
                "prefill_ms": completion.prefill_ms,
                "total_ms": completion.total_ms,
                "prompt_tokens": completion.prompt_tokens,
                "generated_tokens": completion.generated.len(),
                "text": text,
            })
        )?;
        out.flush()?;
    }
    Ok(())
}
