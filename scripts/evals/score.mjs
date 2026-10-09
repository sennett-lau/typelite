// Plan `language-evals`: deterministic scorers for polish and speech answers. Plain Node, no
// packages, no network. Tested by scripts/evals/score.test.mjs (vitest).

/** Simplified / Traditional pairs that tell the two scripts apart (common characters only). */
const SCRIPT_PAIRS =
  '们們 这這 个個 说說 时時 会會 发發 对對 过過 还還 没沒 东東 车車 门門 问問 间間 们們 ' +
  '为為 么麼 样樣 话話 让讓 认認 识識 应應 该該 开開 关關 后後 里裡 边邊 见見 观觀 现現 ' +
  '实實 点點 电電 脑腦 机機 线線 网網 页頁 级級 经經 给給 结結 统統 设設 计計 订訂 试試 ' +
  '请請 谢謝 让讓 买買 卖賣 价價 钱錢 贵貴 费費 报報 纸紙 书書 写寫 读讀 学學 习習 运運 ' +
  '动動 场場 长長 张張 头頭 题題 预預 准準 备備 务務 处處 理理 帮幫 忙忙 难難 欢歡 喜喜 ' +
  '东東 岁歲 钟鐘 号號 单單 双雙 节節 办辦 员員 门門 区區 医醫 药藥 饭飯 鸡雞 鱼魚 马馬 ' +
  '鸟鳥 龙龍 气氣 风風 云雲 阳陽 阴陰 叶葉 热熱 冷冷 闲閒 闻聞 顺順 须須 顾顧 页頁 项項 ' +
  '这這 将將 尔爾 们們 从從 众眾 优優 传傳 体體 余餘 傥儻 俩倆 侧側 内內 两兩 几幾 华華 ' +
  '卫衛 却卻 厂廠 历歷 压壓 县縣 发發 变變 丽麗 举舉 义義 乐樂 乔喬 习習 书書 买買 乱亂 ' +
  '争爭 于於 亏虧 亚亞 产產 亲親 亿億 仅僅 从從 仑侖 仓倉 仪儀 们們 价價 众眾 优優 伙夥 ' +
  '会會 伞傘 伟偉 传傳 伤傷 伦倫 伪偽 体體 余餘 佣傭 侠俠 侣侶 侥僥 侦偵 侧側 侨僑 侬儂 ' +
  '俭儉 债債 倾傾 偿償 储儲 儿兒 兑兌 党黨 兰蘭 关關 兴興 养養 兽獸 内內 冈岡 册冊 写寫 ' +
  '军軍 农農 冯馮 决決 况況 冻凍 净淨 凉涼 减減 凑湊 凤鳳 凭憑 凯凱 击擊 凿鑿 刍芻 划劃 ' +
  '刘劉 则則 刚剛 创創 删刪 别別 刮颳 制製 刹剎 剂劑 剑劍 剧劇 劝勸 办辦 务務 劢勱 动動 ' +
  '励勵 劲勁 劳勞 势勢 勋勳 匀勻 华華 协協 单單 卖賣 卢盧 卫衛 卷捲 厅廳 历歷 厉厲 压壓 ' +
  '厌厭 厕廁 厢廂 厨廚 县縣 参參 双雙 发發 变變 叙敘 叠疊 叶葉 号號 叹嘆 吓嚇 吕呂 吗嗎 ' +
  '启啟 吴吳 呐吶 员員 呜嗚 咏詠 哑啞 响響 哗嘩 唤喚 啬嗇 啰囉 喷噴 嘱囑 团團 园園 围圍 ' +
  '国國 图圖 圆圓 圣聖 场場 坏壞 块塊 坚堅 坛壇 坝壩 坞塢 坟墳 坠墜 垒壘 垦墾 埘塒 执執 ' +
  '扩擴 扫掃 扬揚 护護 报報 担擔 拥擁 择擇 挂掛 挡擋 挤擠 挥揮 换換 据據 掷擲 摆擺 摄攝 ' +
  '摇搖 撑撐 敌敵 数數 斋齋 断斷 无無 旧舊 显顯 晓曉 晒曬 暂暫 术術 杀殺 杂雜 权權 条條 ' +
  '来來 杨楊 极極 构構 枪槍 标標 栏欄 树樹 样樣 档檔 桥橋 检檢 楼樓 欧歐 毕畢 气氣 汇匯 ' +
  '汉漢 污汙 汤湯 沟溝 泪淚 泽澤 洁潔 浅淺 测測 济濟 浏瀏 浓濃 涂塗 涛濤 润潤 涨漲 渐漸 ' +
  '温溫 湾灣 湿濕 满滿 滚滾 滞滯 灭滅 灯燈 灵靈 灾災 炉爐 点點 炼煉 烟煙 烦煩 烧燒 热熱 ' +
  '爱愛 爷爺 牍牘 牵牽 犹猶 狮獅 独獨 猎獵 猫貓 献獻 环環 现現 玛瑪 琐瑣 电電 画畫 畅暢 ' +
  '疗療 疯瘋 盖蓋 盘盤 着著 矿礦 码碼 础礎 确確 礼禮 离離 种種 积積 称稱 稳穩 窃竊 竞競 ' +
  '笔筆 笼籠 筑築 签簽 简簡 类類 粮糧 紧緊 纠糾 红紅 纤纖 约約 级級 纪紀 纯純 纲綱 纳納 ' +
  '纵縱 纷紛 纸紙 纹紋 纺紡 线線 练練 组組 细細 织織 终終 绍紹 经經 绑綁 绕繞 绘繪 给給 ' +
  '络絡 绝絕 统統 继繼 绩績 绪緒 续續 维維 综綜 绿綠 缓緩 编編 缘緣 缩縮 缺缺 网網 罗羅 ' +
  '罚罰 职職 联聯 聪聰 肃肅 肠腸 肤膚 肿腫 胁脅 胜勝 胶膠 脉脈 脏髒 脑腦 脚腳 腊臘 艺藝 ' +
  '节節 芦蘆 苏蘇 苹蘋 范範 荐薦 药藥 获獲 营營 萧蕭 蓝藍 虑慮 虽雖 蚀蝕 蛮蠻 补補 表錶 ' +
  '衬襯 袭襲 装裝 规規 视視 览覽 觉覺 誉譽 计計 订訂 认認 讨討 让讓 训訓 议議 讯訊 记記 ' +
  '讲講 许許 论論 设設 访訪 证證 评評 识識 诉訴 词詞 译譯 试試 诗詩 诚誠 话話 询詢 该該 ' +
  '详詳 语語 误誤 说說 请請 诸諸 读讀 课課 谁誰 调調 谈談 谢謝 谱譜 贝貝 负負 贡貢 财財 ' +
  '责責 败敗 货貨 质質 购購 贯貫 贴貼 贵貴 费費 贺賀 资資 赏賞 赔賠 赛賽 赞贊 赠贈 赶趕 ' +
  '趋趨 跃躍 践踐 车車 轨軌 转轉 轮輪 软軟 轻輕 载載 较較 辅輔 辆輛 输輸 辞辭 边邊 达達 ' +
  '过過 运運 还還 这這 进進 远遠 违違 连連 迟遲 选選 递遞 逻邏 遗遺 邮郵 邻鄰 酱醬 释釋 ' +
  '针針 钟鐘 钢鋼 钥鑰 钱錢 铁鐵 银銀 链鏈 销銷 锁鎖 错錯 键鍵 镜鏡 长長 门門 闪閃 闭閉 ' +
  '问問 闯闖 间間 闹鬧 队隊 阶階 际際 陆陸 陈陳 险險 随隨 隐隱 难難 雾霧 静靜 鞋鞋 页頁 ' +
  '顶頂 项項 顺順 须須 顾顧 顿頓 预預 领領 频頻 题題 颜顏 额額 风風 飞飛 饭飯 饮飲 饱飽 ' +
  '馆館 马馬 驱驅 驶駛 验驗 骑騎 鱼魚 鲜鮮 鸡雞 鸭鴨 麦麥 黄黃 齐齊 齿齒 龙龍 厦廈 么麼'

/** Simplified forms that are also ordinary Traditional characters, so they prove nothing. */
const AMBIGUOUS = new Set([...'么余于里后卷表制划刮范着云伙佣污尔吕凉叶胜'])
const SIMPLIFIED_ONLY = new Set()
const TRADITIONAL_ONLY = new Set()
for (const pair of SCRIPT_PAIRS.split(/\s+/)) {
  const [s, t] = [...pair]
  if (s && t && s !== t && !AMBIGUOUS.has(s)) {
    SIMPLIFIED_ONLY.add(s)
    TRADITIONAL_ONLY.add(t)
  }
}

/** Words that mark written Cantonese, and Mandarin words that Cantonese does not use. */
export const CANTONESE_MARKERS = [
  '嘅',
  '咗',
  '喺',
  '哋',
  '冇',
  '唔',
  '嘢',
  '啲',
  '佢',
  '咁',
  '噉',
  '係',
  '睇',
  '嚟',
  '乜',
  '點解',
  '而家',
  '頭先',
  '聽日',
  '琴日',
  '俾',
  '畀',
  '咩',
  '嘞',
  '囉',
  '啱',
  '嗰',
]
export const MANDARIN_MARKERS = [
  '他們',
  '他们',
  '我們',
  '我们',
  '你們',
  '你们',
  '什麼',
  '什么',
  '這個',
  '这个',
  '那個',
  '那个',
  '沒有',
  '没有',
  '怎麼',
  '怎么',
  '為什麼',
  '为什么',
  '哪裡',
  '哪里',
  '東西',
  '东西',
  '現在',
  '现在',
  '剛才',
  '刚才',
  '明天',
  '昨天',
  '不在',
  '沒空',
  '没空',
  '散步',
  '這裡',
  '这里',
  '的話',
]

const HAN = /\p{Script=Han}/u

/** 'simplified', 'traditional' or null (no Han, or no telling characters). */
export function chineseScript(text) {
  let simplified = 0
  let traditional = 0
  for (const ch of text) {
    if (SIMPLIFIED_ONLY.has(ch)) simplified += 1
    if (TRADITIONAL_ONLY.has(ch)) traditional += 1
  }
  if (simplified === 0 && traditional === 0) return null
  return simplified >= traditional ? 'simplified' : 'traditional'
}

/** Characters of `script`'s opposite found in `text`. */
export function foreignScriptChars(text, script) {
  const other = script === 'simplified' ? TRADITIONAL_ONLY : SIMPLIFIED_ONLY
  return [...new Set([...text].filter((ch) => other.has(ch)))]
}

/** Lowercase, NFKC, plain quotes, single spaces. Keeps punctuation and line breaks. */
export function normalise(text) {
  return text
    .normalize('NFKC')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .trim()
    .toLowerCase()
}

/** Removes list markers at line starts, so "1. Milk" does not count as the number 1. */
function withoutListMarkers(text) {
  return text.replace(/^\s*(?:[-*•]|\d+[.)、])\s*/gm, '')
}

/** Tokens for an error rate: punctuation removed; words, or characters for `unit: 'char'`. */
export function tokens(text, unit) {
  const plain = normalise(withoutListMarkers(text))
    .replace(/[\p{P}\p{S}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!plain) return []
  if (unit === 'char') return [...plain.replace(/ /g, '')]
  return plain.split(' ')
}

/** Levenshtein distance over two arrays. */
export function editDistance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i += 1) {
    const cur = [i]
    for (let j = 1; j <= b.length; j += 1) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[b.length]
}

/** Word or character error rate of `hypothesis` against `reference`. */
export function errorRate(reference, hypothesis, unit) {
  const ref = tokens(reference, unit)
  const hyp = tokens(hypothesis, unit)
  return editDistance(ref, hyp) / Math.max(1, ref.length)
}

/** Digit numbers in `text` (list markers ignored; "1,000" counts as "1000"), sorted. */
export function numbers(text) {
  const found = withoutListMarkers(normalise(text)).match(/\d+(?:[.,:]\d+)*/g) ?? []
  return found.map((n) => n.replace(/,(?=\d{3}(?:\D|$))/g, '')).sort()
}

const isAsciiWord = (needle) => /^[\x20-\x7e]+$/.test(needle)

/** Whether `needle` occurs in `text`, case-insensitive; ASCII needles match whole words. */
export function contains(text, needle) {
  const hay = normalise(text)
  const n = normalise(needle)
  if (isAsciiWord(n) && /\w/.test(n)) {
    const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // Whole words by ASCII letters and digits only, so "server" matches inside Chinese text.
    return new RegExp(`(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`).test(hay)
  }
  return hay.includes(n)
}

const nonEmptyLines = (text) => text.split('\n').filter((l) => l.trim())
const listLines = (text) => text.split('\n').filter((l) => /^\s*(?:[-*•]|\d+[.)、])\s*\S/.test(l))
const paragraphs = (text) => text.split(/\n\s*\n/).filter((p) => p.trim())
const DASH = /[–—]|\s-{1,2}\s/
/** Sentence ends inside the text (the final one is not counted). */
export function sentenceBreaks(text) {
  const body = text.trim().replace(/[.?!。？！…]+["'」』)]*$/u, '')
  return (body.match(/[.?!。？！]+(?=\s|\p{Script=Han}|\p{Lu}|$)/gu) ?? []).length
}

/**
 * Checks that depend on the reference text. Returns a list of failed check names with details.
 */
function referenceChecks(reference, output, caseTags, lang) {
  const failed = []
  const refNumbers = numbers(reference).join(' ')
  const outNumbers = numbers(output).join(' ')
  if (refNumbers !== outNumbers)
    failed.push(['numbers', `want [${refNumbers}] got [${outNumbers}]`])
  const refList = listLines(reference).length
  const outList = listLines(output).length
  if (refList !== outList) failed.push(['list', `want ${refList} list lines, got ${outList}`])
  const refLines = nonEmptyLines(reference).length
  const outLines = nonEmptyLines(output).length
  const refParas = paragraphs(reference).length
  const outParas = paragraphs(output).length
  if (refLines !== outLines || refParas !== outParas) {
    failed.push([
      'layout',
      `want ${refLines} lines/${refParas} paragraphs, got ${outLines}/${outParas}`,
    ])
  }
  if (caseTags.includes('punctuation')) {
    const want = sentenceBreaks(reference)
    const got = sentenceBreaks(output)
    if (want !== got) failed.push(['punctuation', `want ${want} sentence breaks, got ${got}`])
  }
  if (lang?.dialect) {
    const other = lang.dialect === 'yue' ? MANDARIN_MARKERS : CANTONESE_MARKERS
    const leaked = other.filter((m) => output.includes(m) && !reference.includes(m))
    if (leaked.length) failed.push(['dialect', `unexpected ${leaked.join(' ')}`])
  }
  return failed
}

/** Checks that do not depend on which reference is chosen. */
function caseChecks(c, output, lang) {
  const failed = []
  const refs = [c.expected, ...(c.accept ?? [])]
  for (const needle of c.must_contain ?? []) {
    if (!contains(output, needle)) failed.push(['must_contain', needle])
  }
  for (const needle of c.must_not_contain ?? []) {
    if (contains(output, needle)) failed.push(['must_not_contain', needle])
  }
  for (const filler of lang?.fillers ?? []) {
    if (contains(output, filler) && !refs.some((r) => contains(r, filler))) {
      failed.push(['filler', filler])
    }
  }
  if (DASH.test(output) && !refs.some((r) => DASH.test(r))) failed.push(['dash', 'dash in output'])
  // Chinese languages only (Japanese kanji would look like either script).
  const script = lang?.dialect ? chineseScript(c.expected) : null
  if (script) {
    const foreign = foreignScriptChars(output, script)
    if (foreign.length) failed.push(['script', `${script} wanted, found ${foreign.join('')}`])
  }
  return failed
}

export const DEFAULT_MAX_ERROR = { word: 0.3, char: 0.25 }

/**
 * Scores one polish answer. `lang` is the entry from evals/languages.json.
 * Returns { pass, error, reference, failed: [[check, detail]] }.
 */
export function scorePolish(c, output, lang) {
  const unit = lang?.unit ?? 'word'
  const maxError = c.max_error ?? DEFAULT_MAX_ERROR[unit]
  const common = caseChecks(c, output, lang)
  let best = null
  for (const reference of [c.expected, ...(c.accept ?? [])]) {
    const error = errorRate(reference, output, unit)
    const failed = [...common, ...referenceChecks(reference, output, c.tags ?? [], lang)]
    if (error > maxError)
      failed.push(['error', `${(error * 100).toFixed(0)}% > ${maxError * 100}%`])
    const candidate = { pass: failed.length === 0, error, reference, failed }
    if (
      !best ||
      (candidate.pass && !best.pass) ||
      (candidate.pass === best.pass && candidate.failed.length < best.failed.length) ||
      (candidate.pass === best.pass &&
        candidate.failed.length === best.failed.length &&
        candidate.error < best.error)
    ) {
      best = candidate
    }
  }
  return best
}

export const DEFAULT_SPEECH_MAX_ERROR = { word: 0.15, char: 0.15 }

/**
 * Scores one speech answer. `answer` holds `output` and script-converted copies. The error rate
 * is taken on the copy in the reference's script (`error`), and on the raw text (`raw_error`), so
 * a wrong script is reported apart from wrong words.
 */
export function scoreSpeech(clip, answer, lang) {
  const unit = lang?.unit ?? 'word'
  const maxError = clip.max_error ?? DEFAULT_SPEECH_MAX_ERROR[unit]
  let best = null
  for (const reference of [clip.text, ...(clip.accept ?? [])]) {
    const script = chineseScript(reference)
    const converted =
      script === 'simplified'
        ? (answer.as_simplified ?? answer.output)
        : script === 'traditional'
          ? ((lang?.dialect === 'yue' ? answer.as_hong_kong : answer.as_taiwan) ?? answer.output)
          : answer.output
    const error = errorRate(reference, converted, unit)
    const rawError = errorRate(reference, answer.output, unit)
    const failed = []
    if (error > maxError)
      failed.push(['error', `${(error * 100).toFixed(0)}% > ${maxError * 100}%`])
    if (script && chineseScript(answer.output) && chineseScript(answer.output) !== script) {
      failed.push(['script', `${script} wanted, got ${chineseScript(answer.output)}`])
    }
    if (lang?.dialect === 'yue') {
      const leaked = MANDARIN_MARKERS.filter((m) => converted.includes(m) && !reference.includes(m))
      if (leaked.length) failed.push(['dialect', `Mandarin words ${leaked.join(' ')}`])
    }
    const pass = !failed.some(([name]) => name === 'error' || name === 'dialect')
    const candidate = { pass, error, raw_error: rawError, reference, failed }
    if (
      !best ||
      (candidate.pass && !best.pass) ||
      (candidate.pass === best.pass && error < best.error)
    ) {
      best = candidate
    }
  }
  return best
}
