---
id: speaches
name: Speaches (faster-whisper)
connection: openai-compatible
address: http://<computer-address>:8000/v1
model: Systran/faster-whisper-large-v3
needs_key: false
runs: local-network
cost: free
languages: About 100 languages, auto-detect
notes: Fast on a computer with an NVIDIA GPU.
---

[Speaches](https://github.com/speaches-ai/speaches) is an OpenAI-compatible server built on
faster-whisper. Run it with Docker on a computer with an NVIDIA GPU:

```sh
docker run -d --name speaches --gpus=all -p 8000:8000 \
  -v hf-hub-cache:/home/ubuntu/.cache/huggingface/hub \
  ghcr.io/speaches-ai/speaches:latest-cuda
```

Replace `<computer-address>` with that computer's address. See
[Running your own server](../openai-compatible.md#running-your-own-server).
