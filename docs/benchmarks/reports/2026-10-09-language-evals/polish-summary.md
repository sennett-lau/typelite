# Polish evaluation

Model `Qwen3-4B-Instruct-2507-Q4_K_M.gguf`, split `all`, 3 sample(s) per case, git `c96ec25+dirty`, 2026-10-09T08:24:48.817Z.

Overall pass rate: **66%** over 150 cases.

| Language | Cases | Pass rate | Mean error |
|---|---|---|---|
| en | 42 | 83% | 8% |
| es | 10 | 50% | 21% |
| fr | 10 | 60% | 11% |
| ja | 10 | 17% | 68% |
| yue | 40 | 50% | 22% |
| zh-Hans | 38 | 84% | 4% |

## By tag

| Tag | en | es | fr | ja | yue | zh-Hans |
|---|---|---|---|---|---|---|
| dash | 50% (2) |  |  |  |  |  |
| dialect |  |  |  |  | 65% (23) | 100% (4) |
| filler | 79% (11) | 33% (3) | 33% (3) | 0% (3) | 38% (8) | 80% (10) |
| keep-meaning | 83% (12) | 100% (1) | 100% (1) | 0% (2) | 83% (6) | 86% (7) |
| list | 100% (4) | 0% (1) | 0% (1) | 100% (1) | 100% (4) | 100% (3) |
| mixed-language |  |  |  | 0% (1) | 36% (11) | 83% (6) |
| newline | 100% (5) | 0% (1) | 0% (1) | 100% (1) | 60% (5) | 60% (5) |
| numbers | 60% (10) | 0% (1) | 33% (3) | 0% (2) | 0% (5) | 100% (5) |
| punctuation | 82% (11) | 100% (3) | 100% (2) | 0% (2) | 47% (19) | 79% (14) |
| script |  |  |  |  | 50% (2) | 100% (1) |
| self-correction | 83% (6) | 0% (2) | 50% (2) | 33% (2) | 0% (5) | 100% (4) |

## Failed checks (samples)

| Check | en | es | fr | ja | yue | zh-Hans |
|---|---|---|---|---|---|---|
| dash | 1 |  |  |  |  |  |
| dialect |  |  |  |  | 20 |  |
| error | 15 | 9 | 3 | 25 | 29 | 6 |
| filler | 1 | 3 |  | 6 | 14 |  |
| layout |  | 3 | 3 |  |  |  |
| must_contain | 9 |  | 6 | 25 | 31 | 6 |
| must_not_contain | 1 | 9 | 6 | 3 | 32 | 3 |
| numbers | 12 | 3 | 3 | 3 | 6 |  |
| punctuation |  |  |  |  | 9 | 9 |
| script |  |  |  |  | 5 |  |

## Cases that failed at least once (53)

### `en-006` 67% [filler]

- input: `hmm let me think the server crashed at like two in the morning`
- expected: `Let me think, the server crashed at like two in the morning`
- got: `Hmm, let me think—the server crashed at two in the morning`
- why: must_not_contain: hmm; filler: hmm; dash: dash in output

### `en-013` 0% [numbers]

- input: `please upgrade node to version twenty two point one one and then rerun the tests`
- expected: `Please upgrade Node to version 22.11 and then rerun the tests`
- got: `Please upgrade node to version 22.1.1 and then rerun the tests`
- why: must_contain: 22.11; numbers: want [22.11] got [22.1.1]

### `en-014` 0% [numbers, keep-meaning]

- input: `the meeting is at three thirty not four`
- expected: `The meeting is at 3:30, not 4`
- got: `The meeting is at 3:30, not four`
- why: numbers: want [3:30 4] got [3:30]

### `en-027` 0% [numbers, punctuation]

- input: `can you make the font size fourteen and the line height one point five`
- expected: `Can you make the font size 14 and the line height 1.5?`
- got: `Can you make the font size fourteen and the line height one point five?`
- why: must_contain: 14; must_contain: 1.5; numbers: want [1.5 14] got []; error: 31% > 30%

### `en-032` 0% [punctuation]

- input: `it works on my machine but on staging it doesn't which is weird`
- expected: `It works on my machine, but on staging it doesn't, which is weird`
- got: `It works on my machine but doesn't on staging, which is weird`
- why: error: 36% > 30%

### `en-h06` 0% [keep-meaning, filler]

- input: `you know what let's just cancel it`
- expected: `You know what, let's just cancel it`
- got: `Let's just cancel it`
- why: error: 38% > 30%

### `en-h08` 0% [self-correction, numbers]

- input: `price it at nineteen ninety nine no twenty four ninety nine`
- expected: `Price it at 24.99`
- got: `Price it at nineteen ninety nine no twenty four ninety nine`
- why: numbers: want [24.99] got []; error: 160% > 30%

### `en-h10` 0% [dash, filler]

- input: `mm the meeting the one with finance got moved to next week`
- expected: `The meeting, the one with finance, got moved to next week`
- got: `The meeting with finance has been moved to next week`
- why: error: 36% > 30%

### `es-001` 0% [filler]

- input: `bueno o sea el servidor se cayó otra vez esta mañana`
- expected: `El servidor se cayó otra vez esta mañana`
- got: `Bueno, o sea, el servidor se cayó otra vez esta mañana`
- why: must_not_contain: o sea

### `es-002` 0% [self-correction]

- input: `la reunión es a las tres no perdón a las cuatro en la sala grande`
- expected: `La reunión es a las cuatro en la sala grande`
- got: `La reunión es a las tres, no a las cuatro en la sala grande`
- why: must_not_contain: tres; error: 40% > 30%

### `es-004` 0% [numbers, filler]

- input: `eh las ventas subieron un doce coma cinco por ciento`
- expected: `Las ventas subieron un 12,5 %`
- got: `Eh, las ventas subieron un 12.5 por ciento`
- why: filler: eh; numbers: want [12,5] got [12.5]

### `es-005` 0% [list, newline]

- input: `tenemos que hacer tres cosas primero arreglar el error segundo actualizar la documentación y tercero avisar al cliente`
- expected: `Tenemos que hacer tres cosas:⏎1. Arreglar el error⏎2. Actualizar la documentación⏎3. Avisar al cliente`
- got: `1. arreglar el error  ⏎2. actualizar la documentación  ⏎3. avisar al cliente`
- why: layout: want 4 lines/1 paragraphs, got 3/1; error: 36% > 30%

### `es-h01` 0% [self-correction]

- input: `mándaselo a Carlos no espera a Lucía`
- expected: `Mándaselo a Lucía`
- got: `Mándaselo a Carlos, no a Lucía`
- why: must_not_contain: Carlos; error: 100% > 30%

### `fr-004` 0% [filler, numbers]

- input: `bon ben du coup on se voit demain à dix heures`
- expected: `Du coup, on se voit demain à 10 h`
- got: `Bon ben du coup, on se voit demain à dix heures`
- why: must_not_contain: ben

### `fr-005` 0% [list, newline]

- input: `il faut trois choses premièrement des tests deuxièmement de la doc et troisièmement une date de sortie`
- expected: `Il faut trois choses :⏎1. Des tests⏎2. De la doc⏎3. Une date de sortie`
- got: `1. Des tests  ⏎2. De la doc  ⏎3. Une date de sortie`
- why: layout: want 4 lines/1 paragraphs, got 3/1; error: 31% > 30%

### `fr-h01` 0% [filler, self-correction]

- input: `euh la livraison est prévue mardi non mercredi`
- expected: `La livraison est prévue mercredi`
- got: `La livraison est prévue mardi`
- why: must_contain: mercredi; must_not_contain: mardi

### `fr-h02` 0% [numbers]

- input: `mets à jour la version deux point quatre et relance le build`
- expected: `Mets à jour la version 2.4 et relance le build`
- got: `Mets à jour la version deux point quatre et relance le build`
- why: must_contain: 2.4; numbers: want [2.4] got []

### `ja-001` 0% [filler]

- input: `えーと明日の会議は三時からです`
- expected: `明日の会議は三時からです`
- got: `明天的会议是三时开始`
- why: must_contain: 明日; must_contain: 会議; error: 75% > 25%

### `ja-002` 0% [self-correction]

- input: `資料は田中さんに送ってください違う佐藤さんに送ってください`
- expected: `資料は佐藤さんに送ってください`
- got: `资料送佐藤先生`
- why: error: 80% > 25%

### `ja-003` 0% [filler, numbers]

- input: `あのー売上が十二点五パーセント増えました`
- expected: `売上が12.5%増えました`
- got: `销售额增加了12.5%`
- why: error: 100% > 25%

### `ja-005` 0% [punctuation]

- input: `このバグはもう直りましたか`
- expected: `このバグはもう直りましたか？`
- got: `这个bug已经修复了吗？`
- why: must_contain: バグ; error: 100% > 25%

### `ja-006` 0% [punctuation]

- input: `昨日サーバーが落ちました今朝復旧しました`
- expected: `昨日サーバーが落ちました。今朝復旧しました。`
- got: `昨日服务器宕机，今朝已恢复`
- why: error: 81% > 25%

### `ja-007` 0% [mixed-language, keep-meaning]

- input: `このprojectのdeadlineは来週の金曜日です`
- expected: `このprojectのdeadlineは来週の金曜日です`
- got: `这个项目的截止日期是下周的周五`
- why: must_contain: project; must_contain: deadline; error: 100% > 25%

### `ja-008` 0% [keep-meaning]

- input: `いいえそれは違うと思います`
- expected: `いいえ、それは違うと思います`
- got: `不，我认为那不一样`
- why: must_contain: いいえ; must_contain: 違う; error: 100% > 25%

### `ja-h01` 0% [filler, numbers]

- input: `えーとバージョン二点一にアップデートしてください`
- expected: `バージョン2.1にアップデートしてください`
- got: `えーとバージョン二点一にアップデートしてください`
- why: must_contain: 2.1; must_not_contain: えーと; filler: えーと; filler: えー; numbers: want [2.1] got []; error: 30% > 25%

### `ja-h02` 67% [self-correction]

- input: `会議は月曜日いや火曜日にしましょう`
- expected: `会議は火曜日にしましょう`
- got: `会议在周二举行吧`
- why: must_contain: 火曜日; error: 92% > 25%

### `yue-001` 0% [filler, dialect]

- input: `呃我哋聽日開會之前要搞掂份報告`
- expected: `我哋聽日開會之前要搞掂份報告`
- got: `呃，我們聽日開會之前要搞掂份報告`
- why: must_not_contain: 呃; filler: 呃; dialect: unexpected 我們

### `yue-003` 0% [filler, dialect, punctuation]

- input: `嗯我想問下你得唔得閒星期五食飯`
- expected: `我想問下你得唔得閒星期五食飯？`
- got: `嗯，我想問下你得唔得閒星期五食飯？`
- why: must_not_contain: 嗯; filler: 嗯

### `yue-004` 0% [self-correction, dialect]

- input: `三點鐘唔係唔好意思四點鐘喺會議室等`
- expected: `四點鐘喺會議室等`
- got: `三点钟不好意思，四点钟在会议室等`
- why: must_contain: 會議室; script: traditional wanted, found 点钟会议; error: 150% > 25%

### `yue-010` 0% [mixed-language, punctuation]

- input: `呢個project個deadline係下個禮拜五我哋要加快啲`
- expected: `呢個project個deadline係下個禮拜五，我哋要加快啲`
- got: `這個project的截止日期是下個禮拜五，我們要加快啲`
- why: must_contain: deadline; dialect: unexpected 我們 這個; error: 40% > 25%

### `yue-011` 0% [self-correction, numbers]

- input: `個價錢係九十九蚊唔係唔係八十九蚊`
- expected: `個價錢係八十九蚊`
- got: `個價錢係九十九蚊，唔係八十九蚊`
- why: must_not_contain: 九十九; error: 75% > 25%

### `yue-012` 0% [numbers, punctuation]

- input: `今個月營業額升咗百分之十五總共係三點二億`
- expected: `今個月營業額升咗15%，總共係3.2億`
- got: `今個月營業額升咗百分之十五，總共係三點二億`
- why: must_contain: 3.2; numbers: want [3.2] got []

### `yue-013` 0% [numbers, mixed-language]

- input: `將個version升去二點一然後再試多次`
- expected: `將個version升去2.1，然後再試多次`
- got: `將版本升至 2.1，然後再試多次`
- why: must_contain: version; error: 47% > 25%

### `yue-018` 0% [newline, punctuation, mixed-language]

- input: `啱啱同老闆傾完佢話OK喎另外聽日記得帶埋部laptop`
- expected: `啱啱同老闆傾完，佢話OK喎。⏎⏎另外，聽日記得帶埋部laptop`
- got: `啱啱同老闆傾完，佢話OK喎，另外聽日記得帶埋部laptop`
- why: punctuation: want 1 sentence breaks, got 0

### `yue-019` 0% [self-correction, mixed-language]

- input: `我哋約咗Peter唔係係Paul喺中環食lunch`
- expected: `我哋約咗Paul喺中環食lunch`
- got: `我哋約咗Peter喺中環食lunch`
- why: must_contain: Paul; must_not_contain: Peter

### `yue-022` 0% [dialect, keep-meaning]

- input: `而家冇足夠時間做呢件事`
- expected: `而家冇足夠時間做呢件事`
- got: `現在我沒有足夠時間做這件事`
- why: must_contain: 而家; must_contain: 冇; must_not_contain: 現在; must_not_contain: 沒有; dialect: unexpected 沒有 現在; error: 55% > 25%

### `yue-023` 0% [numbers, dialect]

- input: `我哋聽日上晝十點半開會`
- expected: `我哋聽日上晝10點半開會`
- got: `我們聽日上晝十點半開會`
- why: dialect: unexpected 我們

### `yue-024` 0% [filler, punctuation]

- input: `呃嗰個嗰個file你放咗喺邊`
- expected: `嗰個file你放咗喺邊？`
- got: `呃，那個file你放咗喺邊？`
- why: must_not_contain: 呃; filler: 呃; dialect: unexpected 那個

### `yue-025` 0% [script, dialect, punctuation]

- input: `我觉得呢个方案几好但系个价钱贵咗啲`
- expected: `我觉得呢个方案几好，但系个价钱贵咗啲`
- got: `我觉得这个方案很好，但价格贵了一些`
- why: must_contain: 几好; must_contain: 贵咗啲; dialect: unexpected 这个; error: 47% > 25%

### `yue-030` 0% [self-correction, mixed-language]

- input: `我想book兩個位唔係三個位七點半`
- expected: `我想book三個位，七點半`
- got: `我想book兩個位，唔係三個位，七點半`
- why: must_not_contain: 兩個; error: 42% > 25%

### `yue-h01` 0% [filler, dialect]

- input: `呃聽日嘅會改咗去三點`
- expected: `聽日嘅會改咗去三點`
- got: `呃，聽日嘅會改咗去三點`
- why: must_not_contain: 呃; filler: 呃

### `yue-h02` 0% [self-correction, mixed-language]

- input: `send俾John唔係唔好意思send俾Amy`
- expected: `send俾Amy`
- got: `Send 俾 John 不係唔好意思，send 俾 Amy`
- why: must_not_contain: John; error: 188% > 25%

### `yue-h04` 0% [numbers, punctuation]

- input: `部機嘅記憶體用咗百分之八十五點五要搵人睇下`
- expected: `部機嘅記憶體用咗85.5%，要搵人睇下`
- got: `部機嘅記憶體用咗百分之八十五點五，要搵人睇下`
- why: must_contain: 85.5; numbers: want [85.5] got []; error: 50% > 25%

### `yue-h06` 0% [punctuation, dialect]

- input: `你搞掂未呀我哋等緊你`
- expected: `你搞掂未呀？我哋等緊你`
- got: `你搞掂未呀，我哋等緊你`
- why: punctuation: want 1 sentence breaks, got 0

### `yue-h07` 0% [filler, mixed-language, punctuation]

- input: `嗯個meeting room book咗未`
- expected: `個meeting room book咗未？`
- got: `嗯個meeting room book咗未`
- why: must_not_contain: 嗯; filler: 嗯

### `yue-h09` 0% [newline, punctuation]

- input: `多謝你幫手個網站而家快咗好多另外下個禮拜我放假`
- expected: `多謝你幫手，個網站而家快咗好多。⏎⏎另外，下個禮拜我放假`
- got: `多謝你幫手，網站現已快好多，另外下個禮拜我放假`
- why: punctuation: want 1 sentence breaks, got 0

### `zh-003` 33% [filler]

- input: `就是说这个功能嗯下周之前要上线`
- expected: `这个功能下周之前要上线`
- got: `就是说这个功能下周之前要上线`
- why: error: 27% > 25%

### `zh-020` 0% [newline, punctuation]

- input: `今天的发布很顺利用户反馈也不错另外下周一记得交周报`
- expected: `今天的发布很顺利，用户反馈也不错。⏎⏎另外，下周一记得交周报`
- got: `今天的发布很顺利，用户反馈也不错，另外下周一记得交周报`
- why: punctuation: want 1 sentence breaks, got 0

### `zh-026` 0% [filler]

- input: `就是说我们需要在下周之前完成所有的测试`
- expected: `我们需要在下周之前完成所有的测试`
- got: `就是说我们需要在下周之前完成所有的测试`
- why: must_not_contain: 就是说

### `zh-h01` 67% [filler]

- input: `嗯那个下午的会取消了`
- expected: `下午的会取消了`
- got: `那个下午的会取消了`
- why: error: 29% > 25%

### `zh-h07` 0% [punctuation]

- input: `你什么时候有空我们约个时间聊一下`
- expected: `你什么时候有空？我们约个时间聊一下`
- got: `你什么时候有空，我们约个时间聊一下？`
- why: punctuation: want 1 sentence breaks, got 0

### `zh-h09` 0% [mixed-language, keep-meaning]

- input: `请帮我update一下这个report`
- expected: `请帮我update一下这个report`
- got: `请帮我更新一下这个报告`
- why: must_contain: update; must_contain: report; error: 63% > 25%

### `zh-h10` 0% [newline, punctuation]

- input: `项目进展顺利另外提醒一下周五下午公司停电`
- expected: `项目进展顺利。⏎⏎另外提醒一下，周五下午公司停电`
- got: `项目进展顺利，另外提醒一下周五下午公司停电`
- why: punctuation: want 1 sentence breaks, got 0

