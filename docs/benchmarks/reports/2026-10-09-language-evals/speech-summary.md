# Speech evaluation

Model `ggml-large-v3-turbo-q5_0.bin`, split `all`, 1 sample(s) per case, git `c96ec25+dirty`, 2026-10-09T08:18:48.282Z.

Overall pass rate: **67%** over 24 cases.

| Language | Cases | Pass rate | Mean error |
|---|---|---|---|
| en | 8 | 100% | 2% |
| yue | 8 | 0% | 44% |
| zh-Hans | 8 | 100% | 2% |

## By tag

| Tag | en | yue | zh-Hans |
|---|---|---|---|
| clean | 100% (6) |  | 100% (6) |
| dialect |  | 0% (8) |  |
| mixed-language |  |  | 100% (2) |
| names | 100% (1) |  |  |
| numbers | 100% (2) |  | 100% (1) |

## Failed checks (samples)

| Check | en | yue | zh-Hans |
|---|---|---|---|
| dialect |  | 7 |  |
| error |  | 8 |  |

## Cases that failed at least once (8)

### `sp-yue-001` 0% [dialect]

- input: `audio/synthetic/sp-yue-001.wav`
- expected: `我今日好忙，唔得閒食飯。`
- got: `我今日好忙,不得閒吃飯。`
- why: error: 20% > 15%

### `sp-yue-002` 0% [dialect]

- input: `audio/synthetic/sp-yue-002.wav`
- expected: `佢頭先話份報告聽日先可以俾我哋。`
- got: `他剛才說份報告明天才可以給我們。`
- why: error: 60% > 15%; dialect: Mandarin words 我們 剛才 明天

### `sp-yue-003` 0% [dialect]

- input: `audio/synthetic/sp-yue-003.wav`
- expected: `你睇下呢個問題係咪咁樣。`
- got: `你看下這個問題是否這樣。`
- why: error: 45% > 15%; dialect: Mandarin words 這個

### `sp-yue-004` 0% [dialect]

- input: `audio/synthetic/sp-yue-004.wav`
- expected: `我哋已經將文件發咗俾客，佢哋仲未覆。`
- got: `我們已經將文件發了給下,他們還未覆。`
- why: error: 44% > 15%; dialect: Mandarin words 他們 我們

### `sp-yue-005` 0% [dialect]

- input: `audio/synthetic/sp-yue-005.wav`
- expected: `呢個週末天氣好好，我想去公園行下。`
- got: `這個週末天氣很好,我想去公園逛下。`
- why: error: 20% > 15%; dialect: Mandarin words 這個

### `sp-yue-006` 0% [dialect]

- input: `audio/synthetic/sp-yue-006.wav`
- expected: `佢唔喺屋企，你遲啲再打俾佢啦。`
- got: `他不在家裡,你遲些再打給他啦。`
- why: error: 62% > 15%; dialect: Mandarin words 不在

### `sp-yue-007` 0% [dialect]

- input: `audio/synthetic/sp-yue-007.wav`
- expected: `而家冇足夠時間做呢件事。`
- got: `現在沒有足夠時間做這件事。`
- why: error: 45% > 15%; dialect: Mandarin words 沒有 現在

### `sp-yue-008` 0% [dialect]

- input: `audio/synthetic/sp-yue-008.wav`
- expected: `你可唔可以幫我睇下點解部電腦開唔到？`
- got: `你可不可以幫我看看,為什麼這部電腦開不了?`
- why: error: 53% > 15%; dialect: Mandarin words 什麼 為什麼

