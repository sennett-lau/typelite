# Cantonese dictations cut short after 1.1.3

A user's Cantonese dictations lost the end of the text after updating to 1.1.3. This report finds
the cause and measures the fix.

## Evidence from the user's log (counts only; Typelite logs no text)

Polished length against the transcript (transcript bytes ÷ 3 for Chinese), Cantonese runs with
at least 10 characters, polish on a llama-server with a 4096-token context:

| Period | Runs | Median kept | Runs keeping under 75% |
|---|---:|---:|---:|
| Before 1.1.3 (preset v3 or v4) | 206 | 117% | 8% |
| After 1.1.3 | 11 | 96% | 45% |

The server's log showed `stop processing: n_tokens = 4095, truncated = 1`: the context was full.

## Cause

The prompt and the answer share the server's context. The 1.1.3 polish prompt (plan
`polish-dashes-and-fillers`) is longer, and with the Cantonese (Hong Kong) preset it is about
3,300 tokens. A 4096-token context then leaves a few hundred tokens for the answer, and a longer
dictation is cut off mid-sentence (「佢話份合約要改多兩」). The answer said `finish_reason: "length"`,
and Typelite pasted it anyway. Built-in AI also ran with 4096 tokens.

## Measurements

Cantonese cases (dev and holdout, 52), routed as the user's app does
(`--languages en,zh-Hant-HK --presets`, preset cantonese-hong-kong v4), Apple M1 Pro or the
user's GPU server:

| Server | Pass rate | Mean error | Answers keeping under 60% |
|---|---:|---:|---:|
| Uncensored Qwen 3.5 4B, 4096 context (n=3) | 44% | 27% | 30 of 156 |
| Same, 8192 context (n=3) | 75% | 14% | 0 of 156 |
| Built-in Qwen 3.5 4B, 8192 context (n=1) | 79% | 11% | 0 of 52 |
| Qwen 3.5 4B, 4096 context, with the fix (n=1) | (30 cut-off answers now fail; the app pastes the transcript) | | 0 pasted cut |

## Fix

- Built-in AI runs with an 8192-token context (`llm::builtin::CONTEXT_TOKENS`).
- An answer with `finish_reason: "length"` is an error, so the pipeline pastes the whole
  transcript, and the user sees why (`protocol::CUT_OFF_MESSAGE`).
- The troubleshooting guide says to give a server at least 8192 tokens.
- 12 Cantonese cases where 唔係 and 即係 carry meaning (yue-031 to yue-038, yue-h11 to yue-h14),
  and `--presets` for the eval runner to measure with downloaded presets.
