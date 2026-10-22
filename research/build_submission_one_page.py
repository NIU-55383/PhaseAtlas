"""Build the dense A4 submission summary, with seven plots from executed cases."""
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
from PIL import Image
from pypdf import PdfReader
import json, shutil, html

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'dist/submission-2026';FIG=OUT/'figures'
for name,file in [('Text','arial.ttf'),('Bold','arialbd.ttf')]:
    pdfmetrics.registerFont(TTFont(name,'C:/Windows/Fonts/'+file))
pdfmetrics.registerFontFamily('Text',normal='Text',bold='Bold',italic='Text',boldItalic='Bold')
BLUE='#0000cd';NAVY='#000080';INK='#18354b';MUTED='#63748e';LINE='#dce5f0';PALE='#f3f6fc'
W,H=A4;M=30;CW=W-2*M
path=OUT/'PhaseAtlas_One_Page.pdf'
c=canvas.Canvas(str(path),pagesize=A4,pageCompression=1)
c.setTitle('PhaseAtlas | Interactive PDE research platform');c.setAuthor('Niu Te')
c.setSubject('Editable PDEs, 3D space-time visualization, numerical checks and reproducible experiments')
boxes=[]
def rect(x,top,w,h,color,stroke=None):
    c.setFillColor(HexColor(color));c.setStrokeColor(HexColor(stroke or color));c.setLineWidth(.5)
    c.roundRect(x,H-top-h,w,h,4,fill=1,stroke=bool(stroke))
def text(x,top,value,size=9,bold=False,color=INK):
    c.setFont('Bold' if bold else 'Text',size);c.setFillColor(HexColor(color));c.drawString(x,H-top-size,value)
def para(x,top,width,value,size=8.6,leading=11.5,maxh=80,color=INK):
    sty=ParagraphStyle('p',fontName='Text',fontSize=size,leading=leading,textColor=HexColor(color))
    p=Paragraph(value,sty);_,height=p.wrap(width,maxh)
    assert height<=maxh+.01,(value[:40],height,maxh)
    p.drawOn(c,x,H-top-height);boxes.append((x,top,width,height))
    return height
def picture(name,x,top,w,h):
    source=FIG/(name+'.png')
    iw,ih=Image.open(source).size;scale=min(w/iw,h/ih);pw,ph=iw*scale,ih*scale
    c.drawImage(str(source),x+(w-pw)/2,H-top-(h-ph)/2-ph,width=pw,height=ph,mask='auto')
def panel(x,top,w,h,label):
    rect(x,top,w,h,'#ffffff',LINE);text(x+9,top+7,label,8.1,True,BLUE)

rect(0,0,W,6,NAVY)
text(M,23,'PhaseAtlas',31,True,NAVY)
text(W-189,30,'SCIENTIFIC SOFTWARE',8.5,True,BLUE)
text(W-189,45,'Niu Te | Imperial College London',7.5,color=MUTED)
text(M,67,'Interactive PDE research platform',19.5,True)
text(M,94,'Editable equations  /  3D space-time surfaces  /  numerical verification',9.1,color=BLUE)

gap=20;col=(CW-gap)/2
text(M,119,'Research problem',9.1,True,BLUE)
para(M,135,col,'Researchers repeatedly build separate tools to simulate a PDE, visualize its evolution and check numerical accuracy. PhaseAtlas brings these tasks into a browser workspace, with editable equations, explicit boundary data and saved trajectories. It supports model exploration, numerical-method development and teaching through inspectable, reusable experiments.',maxh=75)
text(M+col+gap,119,'Workflow and contribution',9.1,True,BLUE)
para(M+col+gap,135,col+0.1,'Define a model, run it locally, inspect the solution and compare resolutions. The platform links synchronized animation and 3D surfaces to parameter scans, boundary-balance checks and travelling-wave diagnostics. Exported records retain equations, parameters, numerical settings and arrays so collaborators can replay and extend a calculation.',maxh=75)

rect(M,213,CW,30,PALE)
for x,big,small in [(M+12,'1D / 2D','intervals and rectangles'),(M+190,'3D x-t-u','rotation, playback and PNG export'),(M+392,'96 tests passed','mathematical and numerical checks')]:
    text(x,218,big,9.2,True,BLUE);text(x,231,small,6.8,color=MUTED)

left=300;g=10;right=CW-left-g
panel(M,254,left,178,'A  |  3D space-time surface')
picture('surface',M+3,273,left-6,143)
text(M+9,419,'Height and colour encode u(x,t); saved frame highlighted.',6.6,color=MUTED)
panel(M+left+g,254,right,178,'B  |  Space-time heatmap')
picture('heatmap',M+left+g+6,274,right-12,139)
text(M+left+g+9,419,'The same field on a fixed colour scale.',6.6,color=MUTED)

pw=(CW-20)/3
for i,(name,label) in enumerate([('scan-compact','C  |  Final mean at t = 3'),('profiles-compact','D  |  Solution profiles'),('observables-compact','E  |  Mean and local probe')]):
    xx=M+i*(pw+10);panel(xx,443,pw,125,label);picture(name,xx+5,464,pw-10,99)

text(M+2,571,'A, B, D, E: diffusivity 0.1; Bi = 2; N = 64; time step 0.001. C: 16 runs on N = 32. Dimensionless units.',6.6,color=MUTED)

panel(M,579,CW,146,'F-G  |  Exact-mode refinement and boundary-balance verification')
picture('verification',M+4,600,385,119)
bx=M+398
text(bx,605,'Observed order',8.1,True,BLUE);text(bx,620,'p = 1.99995',13,True)
para(bx,644,125,'Robin eigenmode: N = 16, 32, 64; fixed time step 0.0002. Final RMS error falls from 4.86e-5 to 3.15e-6.',7.1,9.1,70)

text(M,738,'Methods, applications and reuse',9.1,True,BLUE)
para(M,754,CW,'<b>Models.</b> One to three coupled fields; periodic Fourier/ETDRK4 models in 1D/2D; bounded diffusion with Dirichlet, Neumann and passive Robin conditions; 1D fourth-order equations with two configurable linear boundary rows per end. <b>Checks.</b> Time/grid refinement, supplied-reference residuals, conservation and boundary diagnostics. <b>Reuse.</b> JSON/CSV trajectories, SVG/PNG figures and WebM animations. The illustrated dimensionless cooling model compares internal diffusion and surface heat exchange; numerical computation runs in Float64 browser workers.',7.9,10.35,52)

rect(M,814,CW,18,NAVY)
text(M+8,818,'DEMO  phaseatlas.onrender.com',7.8,True,'#ffffff')
text(M+239,818,'CODE  github.com/NIU-55383/PhaseAtlas',7.6,False,'#ffffff')
c.linkURL('https://phaseatlas.onrender.com/',(M,H-832,M+224,H-814),relative=0)
c.linkURL('https://github.com/NIU-55383/PhaseAtlas',(M+232,H-832,W-M,H-814),relative=0)
c.showPage();c.save()
r=PdfReader(path);assert len(r.pages)==1
txt=r.pages[0].extract_text();assert all(s.lower() not in txt.lower() for s in ['MAE03','baseline','pre-event','18 October'])
assert '3D' in txt and len(r.pages[0].images)>=6
for target in [ROOT/'docs/PhaseAtlas_Project_Brief.pdf',ROOT/'dist/downloads/PhaseAtlas_Project_Brief.pdf']:
    target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(path,target)
# HTML companion embeds the same reviewed single-page artifact.
summary='Niu Te | Imperial College London. PhaseAtlas: editable PDE models, synchronized animation, 3D space-time surfaces, refinement studies and reusable experiment records.'
htmltext='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PhaseAtlas | Project summary</title><style>body{margin:0;background:#edf2f7;color:#18354b;font:16px Arial}nav{padding:18px;background:#000080}a{color:white;margin-right:22px}main{max-width:900px;margin:24px auto}img{width:100%;box-shadow:0 8px 35px #18354b15}p{padding:0 14px}</style><nav><a href="../index.html">PhaseAtlas</a><a href="PhaseAtlas_One_Page.pdf">Download one-page PDF</a></nav><main><p>'''+html.escape(summary)+'''</p><img src="figures/one-page-preview.png" alt="One-page project summary with seven scientific plots: 3D surface, heatmap, parameter response, profiles, observables, refinement and balance."></main></html>'''
(OUT/'PhaseAtlas_One_Page.html').write_text(htmltext,encoding='utf-8')
print(json.dumps({'pdf':str(path),'pages':1,'images':len(r.pages[0].images),'characters':len(txt),'textBlocks':boxes}))

if __name__=='__main__':pass
