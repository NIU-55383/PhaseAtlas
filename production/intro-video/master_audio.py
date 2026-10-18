"""Two-pass EBU R128 loudness normalization before final video encoding."""
from pathlib import Path
import json,subprocess,re,wave
import imageio_ffmpeg
import numpy as np
HERE=Path(__file__).resolve().parent;out=HERE/'output'
ff=imageio_ffmpeg.get_ffmpeg_exe();source=out/'narration-timeline-float.wav';target=out/'PhaseAtlas-narration.wav'
measure=subprocess.run([ff,'-hide_banner','-nostdin','-i',str(source),'-af','loudnorm=I=-18:TP=-2:LRA=11:print_format=json','-f','null','NUL'],capture_output=True,check=True)
log=measure.stderr.decode(errors='replace');stats=json.loads(re.findall(r'\{[^{}]+\}',log)[-1])
filt='loudnorm=I=-18:TP=-2:LRA=11:measured_I={input_i}:measured_TP={input_tp}:measured_LRA={input_lra}:measured_thresh={input_thresh}:offset={target_offset}:linear=true:print_format=json'.format(**stats)
result=subprocess.run([ff,'-hide_banner','-nostdin','-y','-i',str(source),'-af',filt,'-ar','48000','-ac','1','-c:a','pcm_s16le',str(target)],capture_output=True,check=True)
with wave.open(str(target),'rb')as w:
    n=w.getnframes();rate=w.getframerate();a=np.frombuffer(w.readframes(n),dtype='<i2')
expected=json.loads((HERE/'storyboard.json').read_text(encoding='utf-8'))['duration']
assert n/rate==expected
assert np.max(np.abs(a.astype(np.int32)))<32767
master=json.loads(re.findall(r'\{[^{}]+\}',result.stderr.decode(errors='replace'))[-1])
data={'input':stats,'master':master,'duration':n/rate,'rate':rate,'samplePeakDbFS':float(20*np.log10(np.max(np.abs(a.astype(float)))/32768)),'clippedSamples':0}
(out/'audio-check.json').write_text(json.dumps(data,indent=2),encoding='utf-8');print(json.dumps(data))
