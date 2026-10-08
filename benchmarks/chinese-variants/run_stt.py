"""Runs the built-in speech engine (benchmark_speech example) over items.json.
usage: run_stt.py <binary> <model> <label> <language|auto>..."""
import json, os, subprocess, sys
D = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, D)
from metrics import cer, yue_marks, script
binary, model, label = sys.argv[1:4]
langs = sys.argv[4:] or ['auto']
items = json.load(open(f"{D}/items.json"))
p = subprocess.Popen([binary, model], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
ready = json.loads(p.stdout.readline())
out = {'label': label, 'model': os.path.basename(model), 'load_ms': ready['load_ms'], 'runs': []}
# warm-up
p.stdin.write(json.dumps({'pcm': items[0]['pcm']}) + '\n'); p.stdin.flush(); p.stdout.readline()
for lang in langs:
    for it in items:
        req = {'pcm': it['pcm']}
        if lang != 'auto':
            req['language'] = lang
        p.stdin.write(json.dumps(req) + '\n'); p.stdin.flush()
        r = json.loads(p.stdout.readline())
        out['runs'].append({'setting': lang, 'id': it['id'], 'voice': it['voice'], 'lang': it['lang'], 'sec': it['sec'],
                            'truth': it['text'], 'text': r['text'], 'detected': r['language'],
                            'cer': round(cer(it['text'], r['text']), 3), 'yue_marks': yue_marks(r['text']),
                            'truth_yue_marks': yue_marks(it['text']), 'script': script(r['text']),
                            'ms': round(r['elapsed_ms'])})
p.stdin.close(); p.wait()
json.dump(out, open(f"{D}/stt-{label}.json", 'w'), ensure_ascii=False, indent=1)
# summary
from collections import defaultdict
g = defaultdict(list)
for r in out['runs']:
    g[(r['setting'], r['lang'], r['voice'])].append(r)
for k, rs in sorted(g.items()):
    det = defaultdict(int); sc = defaultdict(int)
    for r in rs: det[r['detected']] += 1; sc[r['script']] += 1
    print(label, k, 'n', len(rs), 'CER %.3f' % (sum(r['cer'] for r in rs) / len(rs)),
          'yue+', sum(r['yue_marks'] for r in rs), 'det', dict(det), 'script', dict(sc),
          'ms', sorted(r['ms'] for r in rs)[len(rs) // 2])
