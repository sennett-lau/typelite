---
id: cantonese-hong-kong
name: Cantonese (Hong Kong) 廣東話
version: 4
format: 1
tier: official
languages: [zh-Hant-HK, yue-Hant-HK]
applies_to: [polish, translate]
summary: Colloquial written Cantonese as Hong Kong people type it, with Hong Kong code-mixing.
authors: [sennett-lau]
license: CC0-1.0
model_hint: Best with a speech model that writes Cantonese as spoken, such as Qwen3-ASR; whisper turns it into written Chinese first.
detect_codes: [yue, zh]
hints: [嘅, 咗, 喺, 啲, 冇, 唔, 佢, 嚟, 哋, 嘢, 咁, 嗰, 咩, 乜嘢, 係咪, 聽日, 琴日, 點解, 邊度, 而家, 得閒, 啱啱, 仲未, 屋企]
require_hint: true
---

## Instructions

Written Cantonese (粵語白話文) writes Cantonese as it is spoken, with its own characters and grammar, the way Hong Kong people type messages and informal email. It is not formal written Chinese (書面語), not Mandarin, and never Simplified Chinese.

Speech recognition sometimes writes Cantonese speech as written Chinese. Those written-Chinese words are recognition mistakes, not what was said: change each of them back to the Cantonese word. This restores the speaker's words; it is not translation.

- Cantonese words and grammar in Hong Kong Traditional characters: 係 (not 是), 嘅 (not 的), 喺 (not 在), 冇 (not 沒有), 唔 (not 不), 唔好 (not 不要), 佢 (not 他/她), 我哋 (not 我們), 呢個 (not 這個), 嗰個 (not 那個), 睇 (not 看), 俾 (not 給), 講/話 (not 說), 食 (not 吃), 仲未 (not 還未), 聽日 (not 明天), 琴日 (not 昨天), 而家 (not 現在), 頭先 (not 剛才), 成日 (not 經常), and 咗 啲 嚟 嘢 咁.
- Hong Kong code-mixing: keep English words in English, exactly as spoken, including the ones Hongkongers say in English although a Chinese word exists: check, present, proposal, project, deadline, email, meeting, report, update, send, confirm, book, cancel, file, OK. Never turn a mixed sentence into all English or all Chinese.
- Keep names, brands, products and technical terms in English.
- Keep the speaker's own wording and tone; do not make it more formal (你幫我… stays 你幫我…, not 請幫我…). Keep slang and swear words (屌, 仆街, on9) exactly as spoken.
- Use particles such as 囉 喇 啦 呀 only where a Hongkonger would say them.
- Drop hesitation sounds (嗯, 呃) anywhere, also at the start. After a self-correction (such as 唔係), keep only the corrected part. Tone particles (啦, 呢) stay.
- Hong Kong vocabulary (軟件, 網絡, 的士), full-width punctuation, digits for times and amounts: 下晝5點, 3點半, $200.

## Examples

「嗯呢個呢個project要喺禮拜五之前搞掂，唔係，禮拜四之前」 → 呢個project要喺禮拜四之前搞掂
「呃，他剛才說這份報告明天才可以給我們。」 → 佢頭先話份report聽日先可以俾我哋
"Can you check the deadline for the proposal?" → 你可唔可以幫我check下個proposal嘅deadline？
"I haven't read the email yet, I'll reply to you after lunch." → 我仲未睇個email，食完lunch再覆你
