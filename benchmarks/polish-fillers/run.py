import json, sys, time, subprocess, urllib.request, re
pbin, label, reps = sys.argv[1], sys.argv[2], int(sys.argv[3])
C = json.load(open('corpus.json'))
p = subprocess.Popen([pbin], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
def ask(o):
    p.stdin.write(json.dumps(o, ensure_ascii=False)+'\n'); p.stdin.flush(); return json.loads(p.stdout.readline())
out=[]
for rep in range(reps):
    for c in C:
        m = ask({'text': c['text']})
        body={'model':'qwen3-4b','messages':[{'role':'system','content':m['system']},{'role':'user','content':m['user']}],'max_tokens':4096,'temperature':0.3,'stream':False}
        t=time.time()
        r=json.load(urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:18432/v1/chat/completions',json.dumps(body).encode(),{'Content-Type':'application/json'})))
        ms=round((time.time()-t)*1000)
        raw=r['choices'][0]['message']['content'].strip()
        fin=ask({'text':c['text'],'output':raw})['final']
        out.append({'id':c['id'],'lang':c['lang'],'rep':rep,'input':c['text'],'raw':raw,'final':fin,'ms':ms})
        print(label,c['id'],rep,ms,fin,flush=True)
json.dump({'label':label,'rows':out},open(f'{label}.json','w'),ensure_ascii=False,indent=1)
