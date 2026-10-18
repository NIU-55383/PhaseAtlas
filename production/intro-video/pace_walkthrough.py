"""Add short action pauses between walkthrough chapters without stretching speech."""
from pathlib import Path
import json,hashlib,shutil
import numpy as np,soundfile as sf
root=Path(__file__).resolve().parent;out=root/'output/ai-narration'
wav=out/'08-demo.wav';meta_path=wav.with_suffix('.json');meta=json.loads(meta_path.read_text(encoding='utf-8'))
if meta.get('chapterPacing'):
    print('Walkthrough already paced.');raise SystemExit(0)
asr=json.loads(wav.with_suffix('.review.json').read_text(encoding='utf-8'));assert asr['sourceSha256']==meta['sha256']
words=asr['words'];indices=[next(i for i,w in enumerate(words)if w['word'].lower().strip(',.')==marker and i>minimum)for marker,minimum in [('i',20),('now',50),('then',80),('finally',100)]]
samples,rate=sf.read(wav,dtype='float32')
cuts=[0]
for i in indices:
    midpoint=(words[i-1]['end']+words[i]['start'])/2
    candidates=np.arange(max(0,round((midpoint-.12)*rate)),min(len(samples)-480,round((midpoint+.12)*rate)),120)
    cut=min(candidates,key=lambda n:float(np.mean(samples[n:n+480]**2)))+240
    cuts.append(int(cut))
cuts.append(len(samples));starts=[0,11,25,35,46]
length=round(starts[-1]*rate)+cuts[-1]-cuts[-2]
result=np.zeros(length,dtype='float32');chapters=[]
for i,(a,b)in enumerate(zip(cuts,cuts[1:])):
    start=round(starts[i]*rate);end=start+b-a
    if i<4:assert end<starts[i+1]*rate,'Chapter too long'
    result[start:end]=samples[a:b]
    chapters.append({'sourceStart':a/rate,'sourceEnd':b/rate,'start':starts[i],'end':end/rate})
backup=root/'output/demo-original-narration.wav';shutil.copy2(wav,backup)
sf.write(wav,result,rate,subtype='FLOAT')
for word in meta['phonemeWords']:
    chapter=next((c for c in chapters if c['sourceStart']<=word['start']<c['sourceEnd']),chapters[-1]);shift=chapter['start']-chapter['sourceStart'];word['start']+=shift;word['end']+=shift
meta.update(duration=len(result)/rate,sha256=hashlib.sha256(wav.read_bytes()).hexdigest(),chapterPacing=chapters)
meta_path.write_text(json.dumps(meta,indent=2),encoding='utf-8')
manifest_path=out/'voice-manifest.json';manifest=json.loads(manifest_path.read_text(encoding='utf-8'))
for segment in manifest['segments']:
    if segment['scene']=='demo':segment.update(duration=meta['duration'],sha256=meta['sha256'])
manifest_path.write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print(json.dumps({'duration':meta['duration'],'chapters':chapters}))
