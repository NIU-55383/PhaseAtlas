"""Render a narration-paced scientific film from PhaseAtlas solver arrays.

No fabricated trajectories. Playback linearly interpolates stored frames; the
original arrays, timestamps and diagnostics remain unchanged. Frames stream to
FFmpeg so no multi-gigabyte image sequence is written to disk.
"""
from pathlib import Path
import argparse, hashlib, json, math, re, subprocess, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps
from fontTools.ttLib import TTFont
import imageio_ffmpeg

HERE=Path(__file__).resolve().parent
W,H=1920,1080
BLUE='#0000cd'; INK='#142d4b'; MUTED='#617086'; LINE='#dce4ed'; PALE='#f2f6fc'; ORANGE='#ce6b34'
FONTS={}
FONT_PATHS={False:('C:/Windows/Fonts/segoeui.ttf',0),True:('C:/Windows/Fonts/segoeuib.ttf',0),'math':('C:/Windows/Fonts/cambria.ttc',1)}
CHARMAPS={key:set(TTFont(path,fontNumber=index).getBestCmap())for key,(path,index)in FONT_PATHS.items()}
def font(size,bold=False):
    key=(size,bold)
    if key not in FONTS:
        path,index=FONT_PATHS[bold];FONTS[key]=ImageFont.truetype(path,size,index=index)
    return FONTS[key]

def font_for(value,size,bold=False):
    chars={ord(c)for c in str(value)if not c.isspace()}
    family=bold if chars<=CHARMAPS[bold] else 'math'
    if not chars<=CHARMAPS[family]:raise ValueError('Unsupported glyph in '+str(value))
    return font(size,family)
def text(draw,xy,value,size=28,fill=INK,bold=False,anchor=None):
    draw.text(xy,str(value),font=font_for(value,size,bold),fill=fill,anchor=anchor)
def fit(draw,xy,value,size=60,width=1720,fill=INK,bold=True):
    while draw.textlength(value,font=font_for(value,size,bold))>width:size-=1
    text(draw,xy,value,size,fill,bold)
def wrap(value,size,width,bold=False):
    lines=[]
    for paragraph in value.split('\n'):
        line=''
        for word in paragraph.split():
            trial=(line+' '+word).strip()
            if font(size,bold).getlength(trial)>width and line:lines.append(line);line=word
            else:line=trial
        if line:lines.append(line)
    return lines
def para(draw,xy,value,size=28,width=470,fill=INK,gap=1.35,bold=False):
    for i,line in enumerate(wrap(value,size,width,bold)):text(draw,(xy[0],xy[1]+i*size*gap),line,size,fill,bold)
def card(draw,rect,fill=PALE,outline=None):draw.rounded_rectangle(rect,18,fill=fill,outline=outline,width=2)
def line(draw,pts,color=BLUE,width=5):
    if len(pts)>1:draw.line([(float(x),float(y)) for x,y in pts],fill=color,width=width,joint='curve')
def dot(draw,x,y,color=BLUE,r=7):draw.ellipse((x-r,y-r,x+r,y+r),fill=color)
def arrow(draw,x0,y0,x1,y1,color=BLUE,width=4):
    draw.line((x0,y0,x1,y1),fill=color,width=width);a=math.atan2(y1-y0,x1-x0)
    draw.polygon([(x1,y1),(x1-15*math.cos(a-.45),y1-15*math.sin(a-.45)),(x1-15*math.cos(a+.45),y1-15*math.sin(a+.45))],fill=color)
def axes(draw,rect,xlim,ylim,xticks,yticks,xlabel,ylabel):
    x0,y0,x1,y1=rect
    for v,label in yticks:
        y=y1-(v-ylim[0])/(ylim[1]-ylim[0])*(y1-y0)
        draw.line((x0,y,x1,y),fill=LINE,width=1);text(draw,(x0-18,y),label,23,MUTED,anchor='rm')
    for v,label in xticks:
        x=x0+(v-xlim[0])/(xlim[1]-xlim[0])*(x1-x0)
        draw.line((x,y0,x,y1),fill=LINE,width=1);text(draw,(x,y1+16),label,23,MUTED,anchor='mt')
    draw.line((x0,y0,x0,y1,x1,y1),fill=MUTED,width=2)
    text(draw,((x0+x1)/2,y1+58),xlabel,25,MUTED,anchor='mt')
    text(draw,(x0,y0-48),ylabel,25,MUTED)
    return lambda x,y: np.column_stack((x0+(np.asarray(x)-xlim[0])/(xlim[1]-xlim[0])*(x1-x0),y1-(np.asarray(y)-ylim[0])/(ylim[1]-ylim[0])*(y1-y0)))
def interpolate(a,p):
    q=np.clip(p,0,1)*(len(a)-1);i=min(len(a)-2,int(q));r=q-i
    return a[i]*(1-r)+a[i+1]*r
def stamp(seconds):
    n=round(seconds*1000);return f'{n//3600000:02d}:{n//60000%60:02d}:{n//1000%60:02d},{n%1000:03d}'

class RecordedWalkthrough:
    """Decode the actual browser recording sequentially; keep only one frame."""
    def __init__(self,path):self.path=path;self.reader=None;self.index=-1;self.image=None
    def close(self):
        if self.reader is not None:self.reader.close();self.reader=None
    def at(self,seconds):
        target=min(1439,max(0,int(seconds*24)))
        if self.reader is None or target<self.index:
            self.close();self.reader=imageio_ffmpeg.read_frames(str(self.path),pix_fmt='rgb24');self.info=next(self.reader);self.index=-1
        while self.index<target:
            data=next(self.reader);self.image=Image.frombytes('RGB',self.info['size'],data);self.index+=1
        return self.image

class Film:
    def __init__(self,repo,rough=True):
        self.repo=repo;self.data=repo/'dist/data/submission-2026';self.rough=rough
        self.story=json.loads((HERE/'storyboard.json').read_text(encoding='utf-8'))
        self.duration=self.story['duration']
        self.demo=RecordedWalkthrough(HERE/'assets/studio-walkthrough.mp4')
        self.summary=self.load('summary');self.cool=self.load('cooling');self.scan=self.load('cooling-scan');self.front=self.load('fourth-order-front')
        self.u=np.array([f['values'][0] for f in self.cool['frames']]);self.ts=np.array([f['t']for f in self.cool['frames']]);self.x=-1+(np.arange(self.u.shape[1])+.5)*2/self.u.shape[1]
        self.fw=np.array([f['w']for f in self.front['frames']])/.001;self.fx=np.array(self.front['x']);self.ft=np.array([f['t']for f in self.front['frames']]);self.mask=np.abs(self.fx)<=12
        self.norms={k:np.array([f['diag'][k]/self.front['frames'][0]['diag'][k]for f in self.front['frames']])for k in ['global','local','weighted']}
        self.balance=self.summary['cooling']['balance']['rows']
        self.photos={k:Image.open(HERE/'assets'/f'{k}.png').convert('RGB')for k in ['homepage','studio','exports','materials']}
        self.captions=[]
        aligned=HERE/'captions-aligned.json'
        if not rough:
            if not aligned.is_file():raise ValueError('Final narration requires aligned captions')
            self.captions=[(v['start'],v['end'],v['text'])for v in json.loads(aligned.read_text(encoding='utf-8'))]
        else:
            for s in self.story['scenes']:
                words=s['narration'].split();groups=[];g=[]
                for word in words:
                    g.append(word)
                    if len(g)>=17 or (len(g)>=7 and re.search(r'[.!?]$',word)):groups.append(g);g=[]
                if g:groups.append(g)
                pos=s['start']+.6;span=s['end']-s['start']-1.2
                for group in groups:
                    end=pos+span*len(group)/len(words);self.captions.append((pos,end,' '.join(group)));pos=end
        self.bases={}
        self.write_copy()

    def load(self,name):return json.loads((self.data/(name+'.json')).read_text(encoding='utf-8'))
    def write_copy(self):
        status='Visual rough cut: provisional timing.' if self.rough else 'Final English narration: generic AI male voice. No personal voice cloning.'
        lines=['PHASEATLAS — ENGLISH INTRODUCTION NARRATION',status,'']
        for s in self.story['scenes']:lines += [f"{s['start']//60:02d}:{s['start']%60:02d}–{s['end']//60:02d}:{s['end']%60:02d} | {s['title']}",s['narration'],'']
        (HERE/'narration-en.txt').write_text('\n'.join(lines),encoding='utf-8')
        srt='\n\n'.join(f'{i+1}\n{stamp(a)} --> {stamp(b)}\n{v}'for i,(a,b,v)in enumerate(self.captions))+'\n'
        (HERE/'captions-en.srt').write_text(srt,encoding='utf-8')
    def base(self,index):
        if index in self.bases:return self.bases[index].copy()
        s=self.story['scenes'][index];im=Image.new('RGB',(W,H),'white');d=ImageDraw.Draw(im)
        text(d,(92,40),'PhaseAtlas',34,BLUE,True)
        d.line((92,103,1828,103),fill=LINE,width=2)
        fit(d,(92,173),s['title'],58,width=1740)
        d.line((92,1009,1828,1009),fill=LINE,width=2)
        text(d,(92,1030),'Niu Te · Imperial College London',20,MUTED)
        self.bases[index]=im.copy();return im
    def frame(self,t):
        last=len(self.story['scenes'])-1;index=min(last,next((i for i,s in enumerate(self.story['scenes'])if t<s['end']),last));s=self.story['scenes'][index];p=(t-s['start'])/(s['end']-s['start'])
        im=self.base(index);d=ImageDraw.Draw(im)
        getattr(self,'scene_'+s['key'])(im,d,np.clip(p,0,1))
        caption=next((v for a,b,v in self.captions if a<=t<b),'')
        for i,v in enumerate(wrap(caption,32,1670)):text(d,(960,926+i*43),v,32,INK,anchor='mt')
        return im

    def scene_intro(self,im,d,p):
        if not hasattr(self,'intro_visuals'):
            figures=self.repo/'dist/submission-2026/figures'
            self.intro_visuals={}
            for name in ['surface','heatmap']:
                picture=Image.open(figures/(name+'.png')).convert('RGB');pixels=np.array(picture)
                yy,xx=np.where(np.any(pixels<235,axis=2));box=(max(0,int(xx.min())-8),max(0,int(yy.min())-8),min(picture.width,int(xx.max())+9),min(picture.height,int(yy.max())+9))
                self.intro_visuals[name]=ImageOps.contain(picture.crop(box),(355,244),method=Image.Resampling.LANCZOS)
        para(d,(95,282),'Edit a model, inspect its evolution,\nand share a complete calculation.',29,505,gap=1.35)
        card(d,(92,403,610,716),PALE)
        text(d,(120,425),'Editable heat-transfer model',25,BLUE,True)
        text(d,(120,475),'uₜ = νuₓₓ',43,INK,True)
        text(d,(120,542),'u(x, 0) = 1',29,INK)
        text(d,(120,589),'∂ₙu + Bi (u − uₐ) = 0',27,INK)
        text(d,(120,637),'ν = 0.1    Bi = 2    uₐ = 0.2',24,MUTED)
        text(d,(120,677),'64 cells · Δt = 0.001 · T = 3',22,MUTED)
        text(d,(95,748),'Numerical checks and exports',24,BLUE,True)
        para(d,(95,790),'Time / grid refinement\nBoundary-balance diagnostics\nJSON, CSV, figures and animation',25,505,gap=1.35)

        for name,rect,title in [('surface',(642,281,1230,590),'3D space-time surface'),('heatmap',(1250,281,1828,590),'Space-time heatmap')]:
            x0,y0,x1,y1=rect;card(d,rect,'white',LINE);text(d,(x0+22,y0+16),title,25,BLUE,True)
            photo=self.intro_visuals[name];im.paste(photo,(x0+18,y0+58))
        text(d,(1016,369),'64 cells',31,INK,True)
        text(d,(1016,418),'121 saved times',21,MUTED)
        text(d,(1016,479),'x / t / u',29,BLUE,True)
        para(d,(1016,523),'Space and time\nin one surface',20,195,gap=1.3)
        text(d,(1630,369),'u(x, t)',32,BLUE,True)
        para(d,(1630,420),'Fixed colour\nscale',21,175,gap=1.3)
        text(d,(1630,498),'0 ≤ t ≤ 3',22,INK)
        text(d,(1630,538),'−1 ≤ x ≤ 1',22,INK)

        card(d,(642,610,1230,897),'white',LINE)
        text(d,(664,628),'Animated solution profile',24,BLUE,True)
        text(d,(1204,630),f't = {3*p:.2f}',23,BLUE,True,anchor='ra')
        xy=axes(d,(732,716,1190,805),(-1,1),(.4,1.05),[(-1,'−1'),(0,'0'),(1,'1')],[(.5,'0.5'),(1,'1.0')],'Position x','Temperature u')
        line(d,xy(self.x,interpolate(self.u,p)),BLUE,5)

        card(d,(1250,610,1828,897),'white',LINE)
        text(d,(1272,628),'Exact-mode resolution check',24,BLUE,True)
        ns=np.log2(np.array(self.summary['robin']['N']));errors=np.log10(self.summary['robin']['errors'])
        ab=axes(d,(1354,716,1776,805),(4,6),(-6,-4),[(4,'16'),(5,'32'),(6,'64')],[(-6,'10⁻⁶'),(-5,'10⁻⁵'),(-4,'10⁻⁴')],'Cells N','Final RMS error')
        line(d,ab(ns,errors),BLUE,4)
        for x,y in ab(ns,errors):dot(d,x,y,BLUE,5)
        text(d,(1789,671),'Observed order ≈ 2',21,INK,True,anchor='ra')

    def scene_studio(self,im,d,p):
        photo=self.photos['studio'].crop((375,330,2110,1360))
        photo=ImageOps.fit(photo,(1150,610),method=Image.Resampling.LANCZOS)
        im.paste(photo,(92,282));d.rounded_rectangle((92,282,1242,892),10,outline=LINE,width=2)
        text(d,(1290,293),'YOUR EXPERIMENT',22,BLUE,True)
        items=[('Equation','∂u/∂t = F(u, ∇u, …)'),('Initial data','u(x, 0) = u₀(x)'),('Boundary conditions','Dirichlet · Neumann · Robin'),('Fourth order in 1D','Two linear conditions per end')]
        for i,(label,value)in enumerate(items):
            y=353+i*126;card(d,(1276,y-12,1828,y+97),PALE if p>(i*.14) else '#fafbfe')
            text(d,(1300,y),label,23,MUTED);fit(d,(1300,y+37),value,30,width=500,fill=BLUE if i==0 else INK)
        text(d,(1290,867),'Actual Studio interface · supported models',20,MUTED)

    def scene_cooling(self,im,d,p):
        q=np.clip((p-.035)/.87,0,1);u=interpolate(self.u,q)
        text(d,(95,278),'uₜ = νuₓₓ',39,BLUE,True);text(d,(440,286),'∂ₙu + Bi (u − uₐ) = 0 at each end',32,INK)
        xy=axes(d,(180,413,1200,733),(-1,1),(0,1.1),[(-1,'−1'),(-.5,'−0.5'),(0,'0'),(.5,'0.5'),(1,'1')],[(.2,'0.2'),(.4,'0.4'),(.6,'0.6'),(.8,'0.8'),(1,'1.0')],'Position x','Dimensionless temperature u')
        ambient=xy(np.array([-1,1]),np.array([.2,.2]));line(d,ambient,MUTED,2)
        line(d,xy(self.x,np.ones_like(self.x)),LINE,3);line(d,xy(self.x,u),BLUE,6)
        for i,v in enumerate(u):
            a=np.clip((v-.2)/.8,0,1);rgb=tuple(int(z)for z in np.array([239,246,255])*(1-a)+np.array([0,0,205])*a)
            d.rectangle((180+i*1020/64,825,180+(i+1)*1020/64,858),fill=rgb)
        arrow(d,158,841,102,841);arrow(d,1221,841,1277,841)
        card(d,(1330,355,1828,849));text(d,(1366,390),'SIMULATION TIME',22,MUTED,True);text(d,(1366,427),f'{q*3:.2f}',70,BLUE,True)
        text(d,(1366,534),'MEAN TEMPERATURE',22,MUTED,True);text(d,(1366,573),f'{u.mean():.5f}',65,INK,True)
        para(d,(1366,681),'ν = 0.1     Bi = 2\nAmbient uₐ = 0.2',27,420)
        text(d,(1366,785),'64 cells · Δt = 0.001',24,MUTED)
        text(d,(180,880),'Fixed temperature scale · interpolated playback of saved numerical frames',20,MUTED)

    def scene_verification(self,im,d,p):
        text(d,(122,282),'01 / EXACT-MODE REFINEMENT',24,BLUE,True);text(d,(1050,282),'02 / THERMAL-CONTENT BALANCE',24,BLUE,True)
        x=np.log2(np.array(self.summary['robin']['N']));y=np.log10(self.summary['robin']['errors']);q=np.clip(p*1.8,0,1)
        xy=axes(d,(195,412,843,724),(4,6),(-6,-4),[(4,'16'),(5,'32'),(6,'64')],[(-6,'10⁻⁶'),(-5,'10⁻⁵'),(-4,'10⁻⁴')],'Number of cells N','Final RMS error')
        line(d,xy(np.array([4,6]),np.array([y[0],y[0]-math.log10(16)])),MUTED,2)
        upto=min(2,int(q*2));line(d,xy(x[:upto+1],y[:upto+1]),BLUE,5)
        for i in range(upto+1):
            xx,yy=xy([x[i]],[y[i]])[0];dot(d,xx,yy);text(d,(xx+8,yy-29),f'{10**y[i]:.2e}',23,BLUE,True)
        if upto<2:
            r=q*2-upto;line(d,xy(np.array([x[upto],x[upto]+r]),np.array([y[upto],y[upto]+r*(y[upto+1]-y[upto])])),BLUE,5)
        text(d,(195,830),'Observed order ≈ 2.000',35,BLUE,True)
        text(d,(195,878),'Same Δt = 0.0002 · three-grid diagnostic',21,MUTED)
        b=self.balance;tt=np.array([a['t']for a in b]);m=np.array([a['massChange']for a in b]);a=np.array([a['integratedInput']for a in b]);n=max(2,int(len(tt)*np.clip((p-.2)/.65,0,1)))
        ab=axes(d,(1120,412,1790,724),(0,3),(-.55,.02),[(0,'0'),(1,'1'),(2,'2'),(3,'3')],[(-.5,'−0.5'),(-.25,'−0.25'),(0,'0')],'Time t','Change in total thermal content')
        line(d,ab(tt[:n],m[:n]),BLUE,6)
        points=ab(tt[:n],a[:n])
        for k in range(0,len(points)-1,6):line(d,points[k:k+4],ORANGE,3)
        d.line((1090,837,1140,837),fill=BLUE,width=5);text(d,(1155,818),'Measured content change',27)
        d.line((1090,877,1140,877),fill=ORANGE,width=3);text(d,(1155,858),'Integrated boundary input',27)

    def scene_scan(self,im,d,p):
        text(d,(170,282),'MEAN TEMPERATURE AT t = 3',27,BLUE,True);text(d,(430,325),'Boundary exchange coefficient Bi →',24,MUTED)
        for i,v in enumerate([.5,1,2,4]):text(d,(376+i*200,367),str(v),25,MUTED,anchor='mt')
        for j,v in enumerate([.05,.1,.2,.4]):text(d,(235,458+j*103),str(v),24,MUTED,anchor='rm')
        text(d,(150,838),'Diffusivity ν increases downward',24,MUTED)
        n=min(16,int(p*32)+1);selected=min(15,int(max(0,p-.5)*32)) if p>.5 else n-1
        for j in range(4):
            for i in range(4):
                k=j*4+i;v=self.scan[k]['metric']['value'];a=np.clip((v-.2)/.8,0,1);rgb=tuple(int(z)for z in np.array([239,246,255])*(1-a)+np.array([0,0,205])*a)
                box=(275+i*200,407+j*103,465+i*200,500+j*103);card(d,box,rgb if k<n else PALE)
                if k<n:text(d,((box[0]+box[2])/2,box[1]+22),f'{v:.3f}',32,'white' if a>.5 else INK,True,anchor='mt')
                if k==selected:d.rounded_rectangle(box,18,outline=ORANGE,width=5)
        case=self.scan[selected];run=case['experiment'];values=np.array([f['values'][0]for f in run['frames']]);xp=-1+(np.arange(values.shape[1])+.5)*2/values.shape[1]
        card(d,(1174,296,1828,877));text(d,(1210,330),'REPLAY THE SELECTED EXPERIMENT',21,BLUE,True)
        text(d,(1210,375),f"ν = {case['nu']}    Bi = {case['Bi']}",32,INK,True)
        xy=axes(d,(1264,505,1768,728),(-1,1),(0,1.1),[(-1,'−1'),(0,'0'),(1,'1')],[(.2,'0.2'),(1,'1.0')],'Position x','Temperature u')
        # After the scan is revealed, replay the selected result over each focus interval.
        replay=(max(0,p-.5)*32)%1 if p>.5 else min(1,p*4)
        line(d,xy(xp,interpolate(values,replay)),BLUE,5)
        text(d,(1210,823),f"Final mean = {case['metric']['value']:.5f}",29,BLUE,True)
        text(d,(170,883),'16 completed runs · finite-time response map',22,MUTED)

    def scene_front(self,im,d,p):
        fit(d,(95,278),'uₜ = γuₓₓₓₓ − βuₓₓₓ + αuₓₓ − ∂ₓ(a u² + ⅔ b u³)',38,width=1720,fill=BLUE)
        text(d,(95,342),'Reference front: U(ξ) = ((1 + tanh(ξ/2))/2)^(3/2)',25,MUTED)
        q=np.clip(p/0.88,0,1)
        im.paste(self.front_surface(q),(92,381))
        vv=np.concatenate(list(self.norms.values()));lo=math.floor(np.log10(vv.min()));hi=max(1,math.ceil(np.log10(vv.max())))
        ab=axes(d,(1150,431,1790,739),(0,.06),(lo,hi),[(0,'0'),(.03,'0.03'),(.06,'0.06')],[(v,f'10^{v}')for v in range(lo,hi+1)],'Time t','Norm / initial norm (log scale)')
        n=max(2,int(len(self.ft)*q))
        for k,label,col,x in [('global','Global',BLUE,1118),('local','Local',ORANGE,1348),('weighted','Weighted',MUTED,1560)]:
            line(d,ab(self.ft[:n],np.log10(self.norms[k][:n])),col,4);d.line((x,849,x+38,849),fill=col,width=4);text(d,(x+50,829),label,26,INK)
        text(d,(170,839),f't = {q*.06:.4f}     Initial amplitude = 0.001',27,INK,True)
        text(d,(170,875),'Fourth-order front laboratory · recorded numerical run',22,MUTED)

    def front_surface(self,q):
        """Fixed-scale x-t-w surface from the same stored arrays as the norms."""
        if not hasattr(self,'surface_plate'):
            width,height=975,438
            plate=Image.new('RGB',(width,height),'white');dr=ImageDraw.Draw(plate)
            xs=self.fx[self.mask];zs=self.fw[:,self.mask];limit=float(np.max(np.abs(zs)))
            a,e=math.radians(-42),math.radians(26)
            def project(x,t,z):
                xx=-.8+1.6*(x-xs[0])/(xs[-1]-xs[0]);tt=-.65+1.3*t/self.ft[-1];zz=.5*z/limit
                rx=xx*math.cos(a)-tt*math.sin(a);depth=xx*math.sin(a)+tt*math.cos(a)
                return rx,depth*math.sin(e)-zz*math.cos(e),depth*math.cos(e)+zz*math.sin(e)
            cube=np.array([project(x,t,z) for x in [xs[0],xs[-1]] for t in [0,self.ft[-1]] for z in [-limit,limit]])
            lo=cube[:,:2].min(axis=0);hi=cube[:,:2].max(axis=0)
            scale=min((width-160)/(hi[0]-lo[0]),(height-100)/(hi[1]-lo[1]));mid=(lo+hi)/2
            def screen(x,t,z):
                rx,ry,depth=project(x,t,z)
                return (width*.5+(rx-mid[0])*scale,height*.49+(ry-mid[1])*scale,depth)
            floor=[screen(x,t,-limit)[:2] for x,t in [(xs[0],0),(xs[-1],0),(xs[-1],self.ft[-1]),(xs[0],self.ft[-1])]]
            dr.polygon(floor,fill='#f5f8fd',outline=LINE)
            for ratio in np.linspace(0,1,5):
                x=xs[0]+ratio*(xs[-1]-xs[0]);t=ratio*self.ft[-1]
                line(dr,[screen(x,0,-limit)[:2],screen(x,self.ft[-1],-limit)[:2]],LINE,1)
                line(dr,[screen(xs[0],t,-limit)[:2],screen(xs[-1],t,-limit)[:2]],LINE,1)
            colors=np.array([[0,0,128],[45,80,199],[226,235,249],[246,214,177],[193,83,28]])
            columns=np.unique(np.linspace(0,len(xs)-1,61).astype(int));rows=np.unique(np.linspace(0,len(self.ft)-1,53).astype(int));triangles=[]
            for j,k in zip(rows[:-1],rows[1:]):
                for i,l in zip(columns[:-1],columns[1:]):
                    for cells in [[(j,i),(j,l),(k,l)],[(j,i),(k,l),(k,i)]]:
                        points=[screen(xs[ii],self.ft[jj],zs[jj,ii]) for jj,ii in cells]
                        v=np.mean([zs[jj,ii] for jj,ii in cells]);position=np.clip((v+limit)/(2*limit),0,1)*4
                        ci=min(3,int(position));mix=position-ci;color=tuple(np.rint(colors[ci]*(1-mix)+colors[ci+1]*mix).astype(int))
                        triangles.append((np.mean([p[2] for p in points]),[(p[0],p[1]) for p in points],color))
            for _,points,color in sorted(triangles,key=lambda item:item[0]):dr.polygon(points,fill=color)
            def label(value,x,t,z,dx=0,dy=0):
                px,py,_=screen(x,t,z);text(dr,(px+dx,py+dy),value,18,MUTED,anchor='mm')
            line(dr,[screen(xs[0],self.ft[-1],-limit)[:2],screen(xs[-1],self.ft[-1],-limit)[:2]],MUTED,1)
            line(dr,[screen(xs[0],0,-limit)[:2],screen(xs[0],self.ft[-1],-limit)[:2]],MUTED,1)
            line(dr,[screen(xs[0],0,-limit)[:2],screen(xs[0],0,limit)[:2]],MUTED,1)
            for x in [-12,0,12]:label(str(x).replace('-','−'),x,self.ft[-1],-limit,9,16)
            for t in [0,.03,.06]:label(f'{t:.2f}',xs[0],t,-limit,-25,9)
            for z in [-limit,0,limit]:label(f'{z:.0f}',xs[0],0,z,-27,0)
            label('ξ',0,self.ft[-1],-limit,10,43);label('t',xs[0],.03,-limit,-52,15)
            text(dr,(15,4),'SPACE × TIME × DISTURBANCE',21,BLUE,True)
            text(dr,(15,height-25),'Fixed height and colour scales · selected saved slice in navy',18,MUTED)
            self.surface_plate=plate;self.surface_screen=screen;self.surface_x=xs;self.surface_values=zs
        plate=self.surface_plate.copy();dr=ImageDraw.Draw(plate)
        frame=min(len(self.ft)-1,round(q*(len(self.ft)-1)))
        points=[self.surface_screen(x,self.ft[frame],z)[:2] for x,z in zip(self.surface_x,self.surface_values[frame])]
        line(dr,points,'#ffffff',5);line(dr,points,'#071e64',2)
        return plate

    def scene_reuse(self,im,d,p):
        crop=self.photos['exports'].crop((360,0,2110,1430))
        image=ImageOps.fit(crop,(1020,600),method=Image.Resampling.LANCZOS)
        im.paste(image,(92,290));d.rounded_rectangle((92,290,1112,890),12,outline=LINE,width=2)
        text(d,(1170,289),'ONE PORTABLE RESEARCH RECORD',24,BLUE,True)
        for i,(a,b)in enumerate([('MODEL','Equations, boundaries, initial data'),('CALCULATION','Grid, time step, method, parameters'),('RESULT','All saved fields and diagnostics'),('CHECK','Refinement and Python comparisons')]):
            y=349+i*128;card(d,(1155,y-8,1828,y+101));text(d,(1184,y+5),a,21,BLUE,True);para(d,(1184,y+42),b,27,605)
        text(d,(1170,883),'JSON · CSV · SVG · WebM',27,BLUE,True)

    def scene_demo(self,im,d,p):
        seconds=p*60
        im.paste(self.demo.at(seconds),(0,105))
        d.rectangle((630,25,1830,90),fill='white')

    def scene_probe(self,im,d,p):
        if not hasattr(self,'probe_data'):
            self.probe_data=json.loads((HERE/'assets/heat-flux.json').read_text(encoding='utf-8'))
            self.probe_rows=np.array(self.probe_data['fluxFrames'])
            self.probe_history=np.array([r['value'] for r in self.probe_data['probeHistory']])
            self.probe_controls=Image.open(HERE/'assets/probe-controls.png').convert('RGB').resize((488,181),Image.Resampling.LANCZOS)
            self.probe_expression=Image.open(HERE/'assets/probe-expression.png').convert('RGB').resize((488,76),Image.Resampling.LANCZOS)
        q=np.clip((p-.07)/.82,0,1);time=3*q
        xs=np.array(self.probe_data['x']);ts=np.array(self.probe_data['times'])
        values=interpolate(self.probe_rows,q);value=float(interpolate(self.probe_history,q))
        text(d,(95,285),'CUSTOM OBSERVATION',23,BLUE,True)
        text(d,(95,334),'q = −ν ∂u/∂x',47,INK,True)
        para(d,(95,406),'Heat flux from a saved\ntemperature field',28,530,gap=1.3)
        im.paste(self.probe_expression,(95,500))
        im.paste(self.probe_controls,(95,601))
        text(d,(95,824),'121 saved fields · 64 cells',25,INK,True)
        para(d,(95,867),'Postprocess the existing trajectory',23,530,fill=MUTED)
        d.line((650,282,650,900),fill=LINE,width=2)

        text(d,(714,285),'Heat-flux profile',27,BLUE,True)
        text(d,(1792,285),f't = {time:.2f}',27,BLUE,True,anchor='ra')
        ab=axes(d,(812,390,1790,552),(-1,1),(-.14,.14),[(-1,'−1'),(0,'0'),(1,'1')],[(-.1,'−0.1'),(0,'0'),(.1,'0.1')],'Position x','Heat flux q')
        line(d,ab([-1,1],[0,0]),MUTED,1)
        line(d,ab(xs,values),BLUE,5)
        xp=ab([.75,.75],[-.14,.14])
        for y in range(round(xp[1,1]),round(xp[0,1]),12):d.line((xp[0,0],y,xp[0,0],min(y+5,xp[0,1])),fill=ORANGE,width=2)
        px,py=ab([.75],[value])[0];dot(d,px,py,ORANGE,7)
        text(d,(1792,338),'Probe x = 0.75',24,ORANGE,True,anchor='ra')

        text(d,(714,642),'Virtual probe: q(0.75, t)',27,BLUE,True)
        text(d,(1792,642),f'q = {value:.5f}',27,INK,True,anchor='ra')
        xy=axes(d,(812,739,1790,824),(0,3),(0,.065),[(0,'0'),(1,'1'),(2,'2'),(3,'3')],[(0,'0'),(.03,'0.03'),(.06,'0.06')],'Time t','Local heat flux q')
        line(d,xy(ts,self.probe_history),LINE,3)
        n=max(1,int(q*(len(ts)-1))+1)
        tx=np.append(ts[:n],time);ty=np.append(self.probe_history[:n],value)
        line(d,xy(tx,ty),BLUE,5)
        px,py=xy([time],[value])[0];dot(d,px,py,ORANGE,6)

    def scene_outro(self,im,d,p):
        if not hasattr(self,'outro_visuals'):
            self.outro_visuals={}
            figures=self.repo/'dist/submission-2026/figures'
            for name,size in [('surface',(620,330)),('heatmap',(530,330))]:
                picture=Image.open(figures/(name+'.png')).convert('RGB');pixels=np.array(picture)
                yy,xx=np.where(np.any(pixels<235,axis=2))
                box=(max(0,int(xx.min())-8),max(0,int(yy.min())-8),min(picture.width,int(xx.max())+9),min(picture.height,int(yy.max())+9))
                self.outro_visuals[name]=ImageOps.contain(picture.crop(box),size,method=Image.Resampling.LANCZOS)
        columns=[(92,705),(756,1301),(1360,1828)]
        for (x0,x1),heading in zip(columns,['3D space-time surface','Solution across space and time','Grid-refinement check']):
            text(d,(x0,285),heading,27,BLUE,True)
            d.line((x0,328,x1,328),fill=LINE,width=2)
        for name,(x0,x1) in zip(['surface','heatmap'],columns[:2]):
            picture=self.outro_visuals[name]
            im.paste(picture,(round((x0+x1-picture.width)/2),350))
        ns=np.log2(np.array(self.summary['robin']['N']));errors=np.log10(self.summary['robin']['errors'])
        ab=axes(d,(1443,412,1802,605),(4,6),(-6,-4),[(4,'16'),(5,'32'),(6,'64')],[(-6,'10⁻⁶'),(-5,'10⁻⁵'),(-4,'10⁻⁴')],'Cells N','Final RMS error')
        line(d,ab(ns,errors),BLUE,4)
        for x,y in ab(ns,errors):dot(d,x,y,BLUE,6)
        text(d,(1360,697),'Observed order ≈ 2.000',26,INK,True)
        text(d,(92,697),'64 cells · 121 saved times',26,INK,True)
        text(d,(756,697),'Heat diffusion · Robin boundaries',26,INK,True)
        d.line((92,735,1828,735),fill=LINE,width=2)
        features=[
            (92,'Custom PDEs','Periodic, Dirichlet, Neumann and Robin boundaries; extra conditions for fourth-order models.',585),
            (756,'Interactive visualization','Animated profiles, rotatable 3D surfaces and saved solution fields.',545),
            (1360,'Reproducible experiments','Resolution checks and model, data, figure and video exports.',468),
        ]
        for x,title,description,width in features:
            text(d,(x,755),title,27,BLUE,True)
            para(d,(x,799),description,24,width,gap=1.26)
        text(d,(92,881),'phaseatlas.onrender.com',29,BLUE,True)
        text(d,(1828,881),'github.com/NIU-55383/PhaseAtlas',25,MUTED,anchor='ra')

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--repo',type=Path,default=Path(r'C:\Users\牛特\Documents\GitHub\PhaseAtlas'));parser.add_argument('--fps',type=int,default=24);parser.add_argument('--preview-only',action='store_true');parser.add_argument('--audio','--approved-audio',dest='approved_audio',type=Path)
    args=parser.parse_args();out=HERE/'output';out.mkdir(exist_ok=True)
    if args.approved_audio and not args.approved_audio.is_file():raise SystemExit('Approved narration file not found')
    film=Film(args.repo,rough=not bool(args.approved_audio))
    if args.approved_audio:
        with wave.open(str(args.approved_audio),'rb')as audio:
            if abs(audio.getnframes()/audio.getframerate()-film.duration)>.01:raise SystemExit('Narration timeline must match scene duration')
    thumbnails=[]
    for i,s in enumerate(film.story['scenes']):
        t=s['start']+.66*(s['end']-s['start']);frame=film.frame(t);frame.save(out/f'scene-{i+1:02d}.jpg',quality=92);thumbnails.append(frame.resize((640,360)))
    contact=Image.new('RGB',(1280,360*math.ceil(len(thumbnails)/2)),'white')
    for i,v in enumerate(thumbnails):contact.paste(v,((i%2)*640,(i//2)*360))
    contact.save(out/'storyboard-preview.jpg',quality=94)
    print(f'Prepared {len(thumbnails)} scene previews, narration and captions.',flush=True)
    if args.preview_only:film.demo.close();return
    target=out/('PhaseAtlas-introduction-v2.mp4' if args.approved_audio else 'PhaseAtlas-visual-rough-cut.mp4')
    ffmpeg=imageio_ffmpeg.get_ffmpeg_exe();command=[ffmpeg,'-hide_banner','-loglevel','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(args.fps),'-i','pipe:0']
    if args.approved_audio:command+=['-i',str(args.approved_audio),'-map','0:v:0','-map','1:a:0','-af','apad','-c:a','aac','-b:a','192k']
    else:command+=['-an']
    command+=['-c:v','libx264','-preset','veryfast','-crf','19','-pix_fmt','yuv420p','-movflags','+faststart','-t',str(film.duration),str(target)]
    with (out/'render-errors.log').open('wb')as err:
        proc=subprocess.Popen(command,stdin=subprocess.PIPE,stderr=err)
        try:
            for i in range(film.duration*args.fps):
                proc.stdin.write(film.frame(i/args.fps).tobytes())
                if i%(args.fps*20)==0:print(f'Rendered {i//args.fps:3d} / {film.duration} seconds',flush=True)
            proc.stdin.close();result=proc.wait()
        except BaseException:
            proc.kill();proc.wait();raise
    if result:raise SystemExit((out/'render-errors.log').read_text())
    film.demo.close()
    manifest={'video':target.name,'durationSeconds':film.duration,'width':W,'height':H,'fps':args.fps,'fonts':'Segoe UI with verified Cambria Math fallback for missing mathematical glyphs','audioStatus':'Generic synthetic male narration, Kokoro am_puck; no voice cloning' if args.approved_audio else 'Silent visual rough cut','dataStatus':film.summary['status'],'playback':'Linear interpolation of stored numerical frames; no simulated data invented','sourceFiles':{n+'.json':hashlib.sha256((film.data/(n+'.json')).read_bytes()).hexdigest()for n in ['summary','cooling','cooling-scan','fourth-order-front']},'videoSha256':hashlib.sha256(target.read_bytes()).hexdigest()}
    manifest['walkthrough']={'type':'Actual browser recording','seconds':60,'videoSha256':hashlib.sha256((HERE/'assets/studio-walkthrough.mp4').read_bytes()).hexdigest(),'exportSha256':hashlib.sha256((out/'demo-experiment.json').read_bytes()).hexdigest()}
    manifest['derivedObservation']={'scene':'probe','seconds':20,'expression':'-nu*Dx(u,1)','probeX':.75,'dataSha256':hashlib.sha256((HERE/'assets/heat-flux.json').read_bytes()).hexdigest(),'sourceExperimentSha256':film.probe_data['sourceSha256'],'source':'Existing saved solution; no additional PDE solve for the plotted derived quantities'}
    (out/'render-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8');print(json.dumps({'video':str(target),'bytes':target.stat().st_size,'seconds':film.duration}),flush=True)
if __name__=='__main__':main()
