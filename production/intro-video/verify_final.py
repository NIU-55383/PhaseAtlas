"""Decode every frame and verify the narration-paced delivery file."""
from pathlib import Path
import imageio_ffmpeg, subprocess, re, json, hashlib
import numpy as np
HERE=Path(__file__).resolve().parent;out=HERE/'output'
video=out/'PhaseAtlas-introduction-v2.mp4';ff=imageio_ffmpeg.get_ffmpeg_exe()
story=json.loads((HERE/'storyboard.json').read_text(encoding='utf-8'));duration=story['duration']
result=subprocess.run([ff,'-hide_banner','-nostdin','-xerror','-i',str(video),'-map','0:v:0','-map','0:a:0','-f','null','NUL'],capture_output=True)
log=result.stderr.decode('utf-8',errors='replace')
assert result.returncode==0,log
assert f'Duration: {duration//3600:02d}:{duration//60%60:02d}:{duration%60:02d}.00' in log,log
assert '1920x1080' in log and '24 fps' in log,log
assert 'Audio: aac' in log and '48000 Hz' in log,log
counts=re.findall(r'frame=\s*(\d+)',log)
assert counts and int(counts[-1])==duration*24,counts
audio=subprocess.run([ff,'-v','error','-i',str(video),'-map','0:a:0','-f','f32le','-ar','48000','pipe:1'],capture_output=True,check=True)
samples=np.frombuffer(audio.stdout,dtype='<f4');assert np.isfinite(samples).all()
assert np.max(np.abs(samples))<1
assert abs(len(samples)/48000-duration)<.05
timeline=json.loads((out/'timeline-manifest.json').read_text(encoding='utf-8'))
for s in timeline['segments']:
    segment=samples[int(s['voiceStart']*48000):int(s['voiceEnd']*48000)]
    assert np.sqrt(np.mean(segment**2))>.015,s
captions=json.loads((HERE/'captions-aligned.json').read_text(encoding='utf-8'))
assert captions[-1]['end']<duration
script=' '.join(s['narration']for s in story['scenes'])
assert 'MAE03' not in script and 'API' not in script and 'I used AI assistance' not in script
assert all('API' not in c['text'] and 'pre-event baseline' not in c['text']for c in captions)
frames=[round((s['sceneStart']+.66*(s['sceneEnd']-s['sceneStart']))*24)for s in timeline['segments']]
select='+'.join(f'eq(n,{n})'for n in frames)
subprocess.run([ff,'-hide_banner','-loglevel','error','-y','-i',str(video),'-vf',f"select='{select}',scale=640:360,tile=2x5",'-frames:v','1',str(out/'encoded-video-contact.jpg')],check=True)
demo=next(s for s in story['scenes']if s['key']=='demo');assert demo['end']-demo['start']==60
experiment=json.loads((out/'demo-experiment.json').read_text(encoding='utf-8'));assert experiment['refinement'] and len(experiment['frames'])==61
report={'decode':'All video and audio frames decoded without errors','frames':duration*24,'durationSeconds':duration,'resolution':[1920,1080],'fps':24,'audio':'AAC / 48 kHz / generic synthetic male narration','decodedAudioSeconds':len(samples)/48000,'decodedAudioPeakDbFS':float(20*np.log10(np.max(np.abs(samples)))),'clippedSamples':int(np.sum(np.abs(samples)>=1)),'voicedScenes':len(story['scenes']),'walkthroughSeconds':60,'walkthroughExportVerified':True,'captionCues':len(captions),'fileBytes':video.stat().st_size,'sha256':hashlib.sha256(video.read_bytes()).hexdigest()}
(out/'video-check.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report))
