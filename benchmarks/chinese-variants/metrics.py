import re, opencc
T2S = opencc.OpenCC('t2s')
# Characters used in written Cantonese but not in standard written Chinese.
YUE_ONLY = set('嘅咗喺唔冇佢哋嚟嘢咁嗰咩啲睇俾冚嘞喎噉乜揾搵啱攰瞓諗嗮咪啩')
YUE_WORDS = ['係咪', '聽日', '琴日', '而家', '點解', '邊度', '屋企', '得閒', '仲未', '頭先', '可唔可以']
# Characters unique to each script (a short marker list both ways).
TRAD = set('們這說還個會來時麼對過為從經實點讓與國開電話發給問題後間無長門見車東親覺認記請讀錯體頭臉樣當報較計進運應準議測試據氣園響單')
SIMP = set('们这说还个会来时么对过为从经实点让与国开电话发给问题后间无长门见车东亲觉认记请读错体头脸样当报较计进运应准议测试据气园响单')

def norm(s):
    s = T2S.convert(s.lower())
    return re.sub(r"[\s\W_]+", "", s)

def cer(ref, hyp):
    r, h = norm(ref), norm(hyp)
    if not r:
        return 0.0
    d = list(range(len(h) + 1))
    for i in range(1, len(r) + 1):
        prev, d[0] = d[0], i
        for j in range(1, len(h) + 1):
            cur = min(d[j] + 1, d[j - 1] + 1, prev + (r[i - 1] != h[j - 1]))
            prev, d[j] = d[j], cur
    return d[len(h)] / len(r)

def yue_marks(s):
    return sum(c in YUE_ONLY for c in s) + sum(w in s or w in T2S.convert(w) and T2S.convert(w) in s for w in YUE_WORDS)

def script(s):
    t = sum(c in TRAD for c in s); m = sum(c in SIMP for c in s)
    if t == m: return 'none' if t == 0 else 'mixed'
    return 'trad' if t > m else 'simp'
