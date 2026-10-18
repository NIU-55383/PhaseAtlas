"""Trim actual browser recording from a visible synchronization marker."""
from pathlib import Path
import json,subprocess,hashlib
import numpy as np,imageio_ffmpeg
root=Path(__file__).resolve().parent;out=root/'output';assets=root/'assets'
manifest_path=out/'demo-recording-manifest.json';manifest=json.loads(manifest_path.read_text(encoding='utf-8'))
source=Path(manifest['rawVideo']);reader=imageio_ffmpeg.read_frames(str(source),pix_fmt='rgb24');info=next(reader)
seen=False;offset=None
for i,data in enumerate(reader):
    w,h=info['size'];im=np.frombuffer(data,dtype=np.uint8).reshape(h,w,3);rgb=im[15:25,15:25].mean(axis=(0,1))
    green=bool(rgb[1]>150 and rgb[0]<80 and rgb[2]<130)
    if green:seen=True
    elif seen:offset=i/info['fps'];break
    if i>info['fps']*20:raise RuntimeError('Capture synchronization marker missing')
reader.close();assert offset is not None
target=assets/'studio-walkthrough.mp4'
subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-hide_banner','-loglevel','error','-y','-ss',str(offset),'-i',str(source),'-t','60','-an','-vf','fps=24','-c:v','libx264','-preset','veryfast','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',str(target)],check=True)
manifest.update(trimOffset=offset,clip=str(target),sha256=hashlib.sha256(target.read_bytes()).hexdigest())
manifest_path.write_text(json.dumps(manifest,indent=2),encoding='utf-8');print(json.dumps({'clip':str(target),'seconds':60,'trimOffset':offset}))
