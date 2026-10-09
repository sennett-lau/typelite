"""Polishes transcripts through a running llama-server with the app's real system prompt.
usage: run_polish.py <prompt-binary> <port> <label> <source: truth|stt-file.json> <variant> [repeats]
variant: app (unchanged prompt) | no-yue (CANTONESE rule and the Cantonese examples removed)"""
import json, os, re, subprocess, sys, time, urllib.request
D = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, D)
from metrics import cer, yue_marks, script
pbin, port, label, source, variant = sys.argv[1:6]
repeats = int(sys.argv[6]) if len(sys.argv) > 6 else 1

if source == 'truth':
    rows = [{'id': c['id'], 'lang': c['lang'], 'voice': '-', 'truth': c['text'], 'input': c['text']}
            for c in json.load(open(f"{D}/corpus.json"))]
else:
    stt = json.load(open(source))
    rows = [{'id': r['id'], 'lang': r['lang'], 'voice': r['voice'], 'truth': r['truth'], 'input': r['text'], 'detected': r['detected']}
            for r in stt['runs'] if r['setting'] == 'auto']
rows = [r for r in rows if r['lang'] in ('cmn', 'cmn-mix', 'en', 'yue')]

p = subprocess.Popen([pbin], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)

def strip_yue(system):
    system = re.sub(r"\n   CANTONESE:[^\n]*", "", system)
    for ex in ['Input: "嗯我頭先已經send咗個file俾你喇你睇下係咪啱啦"\nOutput: 我頭先已經send咗個file俾你喇，你睇下係咪啱啦\n\n',
               'Input: "我今日要send個report俾老闆但係啲數仲未check完"\nOutput: 我今日要send個report俾老闆，但係啲數仲未check完\n\n',
               'Input: "第二步，sorry，第四步係測試"\nOutput: 第四步係測試\n\n']:
        assert ex in system, ex[:30]
        system = system.replace(ex, '')
    system = system.replace(" and every Cantonese word (嘅 咗 唔 係 啲 冇 喇 啦 呀)", "")
    return system

STD_HK = '''Write standard written Chinese (書面語) as used in Hong Kong, in Hong Kong Traditional characters. It is not colloquial Cantonese: never use Cantonese-only words or particles (嘅 咗 喺 啲 冇 唔 佢 哋 嘢 睇 俾 囉 喇).
- Use Hong Kong vocabulary (軟件, 網絡, 手提電腦, 巴士, 的士) and full-width Chinese punctuation (，。？！：); write numbers and times as digits.
- Keep the meaning, tone and register of the original. Keep names, brands and technical terms as they are.'''
out = []
for rep in range(repeats):
    for r in rows:
        p.stdin.write(json.dumps({'text': r['input'], **({'target': variant[3:].split('+')[0]} if variant.startswith('tr-') else {})}) + '\n'); p.stdin.flush()
        msg = json.loads(p.stdout.readline())
        system = strip_yue(msg['system']) if variant == 'no-yue' else msg['system']
        if variant.endswith('+std'):
            a = system.index('Write colloquial written Cantonese'); b = system.index('個meeting改咗去聽日下晝3點半') + len('個meeting改咗去聽日下晝3點半')
            system = system[:a] + STD_HK + system[b:]
        body = {'model': 'qwen3-4b', 'messages': [{'role': 'system', 'content': system}, {'role': 'user', 'content': msg['user']}],
                'max_tokens': 4096, 'temperature': 0.3, 'stream': False}
        t = time.time()
        req = urllib.request.Request(f"http://127.0.0.1:{port}/v1/chat/completions", json.dumps(body).encode(), {'Content-Type': 'application/json'})
        res = json.load(urllib.request.urlopen(req))
        text = res['choices'][0]['message']['content'].strip()
        out.append({**r, 'rep': rep, 'output': text, 'ms': round((time.time() - t) * 1000),
                    'cer_vs_truth': round(cer(r['truth'], text), 3), 'cer_vs_input': round(cer(r['input'], text), 3),
                    'yue_in': yue_marks(r['input']), 'yue_out': yue_marks(text), 'script_in': script(r['input']), 'script_out': script(text)})
p.stdin.close()
json.dump({'label': label, 'source': os.path.basename(source), 'variant': variant, 'rows': out},
          open(f"{D}/polish-{label}.json", 'w'), ensure_ascii=False, indent=1)
from collections import defaultdict
g = defaultdict(list)
for r in out: g[r['lang']].append(r)
for k, rs in sorted(g.items()):
    n = len(rs)
    print(label, k, 'n', n, 'CERtruth %.3f' % (sum(r['cer_vs_truth'] for r in rs) / n), 'CERinput %.3f' % (sum(r['cer_vs_input'] for r in rs) / n),
          'yue-added-rows', sum(r['yue_out'] > r['yue_in'] for r in rs), 'script-changed', sum(r['script_in'] != r['script_out'] and r['script_in'] in ('simp','trad') for r in rs),
          'ms', sorted(r['ms'] for r in rs)[n // 2])
for r in out:
    if r['yue_out'] > r['yue_in'] or (r['script_in'] != r['script_out'] and r['script_in'] in ('simp', 'trad')):
        print('  ', r['id'], r['voice'], r['rep'], r['input'], '=>', r['output'])
