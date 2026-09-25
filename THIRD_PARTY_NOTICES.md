# Third-party notices

Typelite includes the following third-party software.

## whisper.cpp, llama.cpp and ggml

whisper.cpp is used for built-in speech recognition (through the `whisper-rs` crate, which is
released under the Unlicense). llama.cpp's `llama-server` (release b11177) is built from source
and shipped inside Typelite for Built-in AI polish. Both are released by the ggml authors under
the MIT License (llama.cpp: Copyright (c) 2023-2026 The ggml authors).

MIT License

Copyright (c) 2023-2024 The ggml authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Libraries inside llama-server

`llama-server` includes cpp-httplib (Copyright (c) 2017 yhirose) and JSON for Modern C++
(Copyright (c) 2013-2025 Niels Lohmann), both under the MIT License above.

## Speech models

Whisper model files downloaded by Quick setup come from the whisper.cpp Hugging Face repository
and are released by OpenAI under the MIT License.

## AI models

The Qwen3 model files downloaded by Built-in AI (Qwen3-4B-Instruct-2507 and Qwen3-1.7B, as
Q4_K_M GGUF files from Unsloth's Hugging Face repositories) are released by the Qwen team under
the Apache License 2.0 (https://www.apache.org/licenses/LICENSE-2.0). They are downloaded, not
shipped with Typelite.
