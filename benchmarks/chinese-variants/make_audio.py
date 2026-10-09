import json, os, subprocess, wave
D = os.path.dirname(os.path.abspath(__file__))
os.makedirs(f"{D}/audio", exist_ok=True)
c = json.load(open(f"{D}/corpus.json"))
voices = {'cmn': ['Tingting', 'Meijia', 'Eddy (Chinese (China mainland))'], 'cmn-mix': ['Tingting', 'Meijia'],
          'yue': ['Sinji'], 'en': ['Samantha']}
items = []
for s in c:
    for v in voices[s['lang']]:
        tag = v.split()[0].lower()
        base = f"{D}/audio/{s['id']}-{tag}"
        subprocess.run(['say', '-v', v, '-o', base + '.aiff', s['text']], check=True)
        subprocess.run(['afconvert', '-f', 'WAVE', '-d', 'LEI16@16000', '-c', '1', base + '.aiff', base + '.wav'], check=True)
        w = wave.open(base + '.wav')
        open(base + '.pcm', 'wb').write(w.readframes(w.getnframes()))
        items.append({**s, 'voice': tag, 'pcm': base + '.pcm', 'sec': round(w.getnframes() / 16000, 2)})
json.dump(items, open(f"{D}/items.json", 'w'), ensure_ascii=False, indent=1)
print(len(items))
