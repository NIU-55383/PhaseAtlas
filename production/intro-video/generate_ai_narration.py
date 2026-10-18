"""Generate preset male English narration locally. No personal voice sample is used."""
from pathlib import Path
import argparse,json,re,hashlib,time
import numpy as np
import onnxruntime as ort
import soundfile as sf
from kokoro_onnx import Kokoro,EspeakConfig

HERE=Path(__file__).resolve().parent

def spoken(text):
    return text.replace('PhaseAtlas','Phase Atlas').replace('Niu Te','New Tuh').replace('-',' ')

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--models',type=Path,required=True);parser.add_argument('--espeak-data',default='D:/PhaseAtlasRuntime/espeak-ng-data');parser.add_argument('--voice',default='am_puck');parser.add_argument('--speed',type=float,default=1.0)
    args=parser.parse_args();out=HERE/'output'/'ai-narration';out.mkdir(exist_ok=True)
    opts=ort.SessionOptions();opts.intra_op_num_threads=4;opts.inter_op_num_threads=1
    session=ort.InferenceSession(str(args.models/'kokoro-v1.0.onnx'),sess_options=opts,providers=['CPUExecutionProvider'])
    tts=Kokoro.from_session(session,str(args.models/'voices-v1.0.bin'),espeak_config=EspeakConfig(data_path=args.espeak_data))
    story=json.loads((HERE/'storyboard.json').read_text(encoding='utf-8'));report=[]
    for i,s in enumerate(story['scenes']):
        target=out/f'{i+1:02d}-{s["key"]}.wav';content=spoken(s['narration']);metadata=target.with_suffix('.json')
        if metadata.exists():
            old=json.loads(metadata.read_text(encoding='utf-8'))
            if target.exists() and old.get('profile')=='natural-v2' and old.get('storageFormat')=='FLOAT' and old['spokenText']==content and old['voice']==args.voice and old['speed']==args.speed:
                report.append(old);print('Reusing '+target.name,flush=True);continue
        start=time.monotonic();samples,rate,timings=tts.create_timed(content,voice=args.voice,speed=args.speed,lang='en-us',sentence_pause=.18,clause_pause=.06)
        assert rate==24000 and np.isfinite(samples).all()
        # Preserve synthesizer overshoots until the complete track is normalized.
        # Writing directly to PCM_16 here would silently clip peaks above 1.
        sf.write(target,samples,rate,subtype='FLOAT')
        phoneme_words=[];word='';a=0;b=0
        for item in [*timings,None]:
            if item is not None and item.phoneme!=' ':
                if not word:a=item.start
                word+=item.phoneme;b=item.end;continue
            if word:phoneme_words.append({'phonemes':word,'start':a,'end':b})
            word=''
        record={'scene':s['key'],'voice':args.voice,'speed':args.speed,'storageFormat':'FLOAT','spokenText':content,'displayText':s['narration'],'duration':len(samples)/rate,'rate':rate,'renderSeconds':time.monotonic()-start,'phonemeWords':phoneme_words,'spokenWords':content.split(),'peak':float(np.max(np.abs(samples))),'sha256':hashlib.sha256(target.read_bytes()).hexdigest()}
        record.update(profile='natural-v2',sentencePause=.18,clausePause=.06)
        metadata.write_text(json.dumps(record,indent=2),encoding='utf-8');report.append(record)
        print(json.dumps({'scene':s['key'],'duration':record['duration'],'available':s['end']-s['start'],'spokenWords':len(record['spokenWords']),'timedWords':len(phoneme_words),'renderSeconds':record['renderSeconds']}),flush=True)
    manifest={'engine':'Kokoro 82M v1.0 via kokoro-onnx 0.6.1 / CPU','voice':args.voice,'voiceType':'Preset synthetic male; no cloning','language':'English (US)','userVoiceSampleUsed':False,'cloudServiceCalled':False,'segments':[{'scene':v['scene'],'duration':v['duration'],'sha256':v['sha256']}for v in report],'modelSources':json.loads((args.models/'source-manifest.json').read_text(encoding='utf-8'))}
    (out/'voice-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
if __name__=='__main__':main()
