"""Fit scene lengths to natural narration, without padding to four minutes."""
from pathlib import Path
import difflib, hashlib, json, re, subprocess, math
import numpy as np
import soundfile as sf

HERE=Path(__file__).resolve().parent
OUT=HERE/'output'
RATE=24000

def canonical(word):
    word=re.sub(r'[^a-z0-9]','',word.lower())
    return {'16':'sixteen','32':'thirtytwo','64':'sixtyfour','2':'two',
            'center':'centre','travelling':'traveling','faze':'phase',
            'niu':'new','te':'tuh','tough':'tuh'}.get(word,word)

def aligned_words(display,recognized):
    words=display.split();source='';spans=[]
    for word in words:
        a=len(source);source+=canonical(word);spans.append((a,len(source)))
    target='';clock=[]
    for word in recognized:
        letters=canonical(word['word']);target+=letters
        if letters:clock.extend(np.linspace(word['start'],word['end'],len(letters),endpoint=False).tolist())
    matcher=difflib.SequenceMatcher(None,source,target,autojunk=False)
    points=[]
    for a,b,n in matcher.get_matching_blocks():
        points.extend((a+k,clock[b+k])for k in range(n))
    assert len(points)/len(source)>.94,(len(points)/len(source),display)
    x,y=np.array(points).T
    times=np.interp(np.arange(len(source)),x,y)
    result=[]
    for word,(a,b) in zip(words,spans):
        result.append({'word':word,'start':float(times[a]),'end':float(times[b-1]+.06)})
    return result,len(points)/len(source)

def main():
    story=json.loads((HERE/'storyboard.json').read_text(encoding='utf-8'))
    durations=[]
    for i,scene in enumerate(story['scenes']):
        meta=json.loads((OUT/'ai-narration'/f'{i+1:02d}-{scene["key"]}.json').read_text(encoding='utf-8'))
        if scene['key']=='probe':
            assert meta['duration']<19,'Probe narration exceeds its 20-second slot'
            durations.append(20)
        elif scene['key']=='demo':
            assert meta['duration']<58,'Walkthrough narration exceeds its one-minute slot'
            durations.append(60)
        else:durations.append(math.ceil(meta['duration']+(1.6 if scene['key']=='outro' else 1.0)))
    total=sum(durations)
    timeline=np.zeros(total*RATE,dtype=np.float32)
    captions=[];report=[];cursor=0
    for i,(scene,duration) in enumerate(zip(story['scenes'],durations)):
        scene['start']=cursor;scene['end']=cursor+duration
        path=OUT/'ai-narration'/f'{i+1:02d}-{scene["key"]}.wav'
        meta=json.loads(path.with_suffix('.json').read_text(encoding='utf-8'))
        assert meta['storageFormat']=='FLOAT','Regenerate clips before mastering'
        samples,rate=sf.read(path,dtype='float32');assert rate==RATE
        lead=.35
        offset=cursor+lead;a=round(offset*RATE);b=a+len(samples)
        assert b<(cursor+duration-.4)*RATE,(scene['key'],len(samples)/RATE,duration)
        timeline[a:b]=samples
        asr_path=path.with_suffix('.review.json')
        if not asr_path.is_file():asr_path=path.with_suffix('.asr.json')
        asr=json.loads(asr_path.read_text(encoding='utf-8'))
        assert asr['sourceSha256']==meta['sha256'],'Refresh ASR for '+scene['key']
        words,match=aligned_words(scene['narration'],asr['words'])
        groups=[];group=[]
        for word in words:
            group.append(word)
            if len(group)>=15 or (len(group)>=6 and re.search(r'[.!?;:]$',word['word'])):
                groups.append(group);group=[]
        if group:groups.append(group)
        for j,group in enumerate(groups):
            start=max(cursor+.15,offset+group[0]['start']-.08)
            end=min(cursor+duration-.1,offset+group[-1]['end']+.28)
            if j+1<len(groups):end=min(end,offset+groups[j+1][0]['start']-.08)
            else:end=min(cursor+duration-.1,offset+len(samples)/RATE+.15)
            captions.append({'scene':scene['key'],'start':round(start,3),'end':round(end,3),
                             'text':' '.join(w['word']for w in group)})
        report.append({'scene':scene['key'],'sceneStart':cursor,'sceneEnd':cursor+duration,
                       'voiceStart':offset,'voiceEnd':b/RATE,'captionCharacterMatch':match,
                       'sourceSha256':hashlib.sha256(path.read_bytes()).hexdigest()})
        cursor+=duration
    assert cursor==total
    assert all(c['end']>c['start']for c in captions)
    assert all(a['end']<=b['start']for a,b in zip(captions,captions[1:]))
    raw=OUT/'narration-timeline-float.wav'
    sf.write(raw,timeline,RATE,subtype='FLOAT')
    story['status']='Final English video with generic AI male narration; no personal voice cloning.'
    story['duration']=total
    (HERE/'storyboard.json').write_text(json.dumps(story,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (HERE/'captions-aligned.json').write_text(json.dumps(captions,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (OUT/'timeline-manifest.json').write_text(json.dumps({'duration':total,'rate':RATE,'segments':report},indent=2),encoding='utf-8')
    print(json.dumps({'audio':str(raw),'duration':total,'captions':len(captions),'segments':report}),flush=True)

if __name__=='__main__':main()
