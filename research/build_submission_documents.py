"""Build the dated PDFs and editable HTML from submission_content.py."""
from pathlib import Path
import json,re,html,shutil
from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,Table,TableStyle,Image,PageBreak,KeepTogether
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from pypdf import PdfReader
from submission_content import *
root=Path(__file__).resolve().parents[1];out=root/'dist/submission-2026';out.mkdir(parents=True,exist_ok=True)
pdfmetrics.registerFont(TTFont('Text',r'C:\Windows\Fonts\arial.ttf'));pdfmetrics.registerFont(TTFont('TextBold',r'C:\Windows\Fonts\arialbd.ttf'));pdfmetrics.registerFontFamily('Text',normal='Text',bold='TextBold',italic='Text',boldItalic='TextBold')
ink=HexColor('#193451');blue=HexColor('#0000cd');muted=HexColor('#566477')
def math_text(s):
 for a,b in [('u_xxxx','u<sub>xxxx</sub>'),('u_xxx','u<sub>xxx</sub>'),('u_xx','u<sub>xx</sub>'),('u_t','u<sub>t</sub>'),('d_n^3','∂<sub>n</sub><super>3</super>'),('d_n^2','∂<sub>n</sub><super>2</super>'),('d_n','∂<sub>n</sub>'),('d_x','∂<sub>x</sub>'),('u^3','u<super>3</super>'),('u^2','u<super>2</super>'),('D_01','D<sub>01</sub>'),('D_12','D<sub>12</sub>')]:s=s.replace(a,b)
 for a,b in [('alpha','α'),('beta','β'),('gamma','γ'),('nu','ν'),('xi','ξ')]:s=re.sub(r'\b'+a+r'\b',b,s)
 return s.replace('*',' · ').replace('L2','L<super>2</super>').replace('^(-3/2)','<super>-3/2</super>')
def styles(brief=False):
 size=8.9 if brief else 10.1;leading=12.3 if brief else 14.4
 return {'title':ParagraphStyle('title',fontName='TextBold',fontSize=23 if brief else 25,leading=28,textColor=ink,spaceAfter=9),
 'deck':ParagraphStyle('deck',fontName='Text',fontSize=10,leading=14,textColor=blue,spaceAfter=11),
 'p':ParagraphStyle('p',fontName='Text',fontSize=size,leading=leading,textColor=ink,spaceAfter=7),
 'h':ParagraphStyle('h',fontName='TextBold',fontSize=10.3 if brief else 12,leading=15,textColor=blue,spaceBefore=7,spaceAfter=5,keepWithNext=True),
 'caption':ParagraphStyle('caption',fontName='Text',fontSize=7.9,leading=10.4,textColor=muted,spaceAfter=9),
 'cell':ParagraphStyle('cell',fontName='Text',fontSize=8.4,leading=11.2,textColor=ink),
 'small':ParagraphStyle('small',fontName='Text',fontSize=7.9,leading=10.5,textColor=muted,spaceAfter=5)}
def footer(c,d):
 c.setStrokeColor(HexColor('#d6dfea'));c.line(43,36,A4[0]-43,36);c.setFillColor(muted);c.setFont('Text',7.5);c.drawString(43,23,'PhaseAtlas | Niu Te | 18 October 2026 baseline');c.drawRightString(A4[0]-43,23,str(d.page))
def blocks(seq,sty,brief=False):
 result=[]
 for b in seq:
  if b[0] in ['p','h']:result.append(Paragraph(math_text(b[1]),sty[b[0]]))
  elif b[0]=='image':
   path=out/'figures'/(b[1]+'.png');from PIL import Image as PI
   with PI.open(path) as im:w,h=im.size
   width=509;height=width*h/w
   if brief:width=440;height=width*h/w
   result.append(KeepTogether([Image(str(path),width=width,height=height),Spacer(1,4),Paragraph(b[2],sty['caption'])]))
  elif b[0]=='table':
   rows=[[Paragraph(str(t),sty['cell']) for t in row] for row in b[1]];n=len(rows[0]);widths={2:[132,377],3:[105,196,208],4:[127.25]*4}[n]
   if n==2 and b[1][0][0]=='Cells N':widths=[150,359]
   t=Table(rows,colWidths=widths,hAlign='LEFT',repeatRows=1);t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),HexColor('#eaf0ff')),('VALIGN',(0,0),(-1,-1),'TOP'),('LINEBELOW',(0,0),(-1,0),.6,HexColor('#b7c9ea')),('LINEBELOW',(0,1),(-1,-1),.3,HexColor('#e1e7f0')),('LEFTPADDING',(0,0),(-1,-1),7),('RIGHTPADDING',(0,0),(-1,-1),7),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7)]));result.extend([t,Spacer(1,9)])
 return result
css='body{font:16px/1.65 Arial,sans-serif;color:#193451;background:#edf2f7;margin:0}main{max-width:940px;margin:auto;padding:30px}.page{background:white;padding:46px;margin:20px 0;border-top:5px solid #0000cd}h1{font-size:34px;line-height:1.2}h2{font-size:21px;color:#0000cd}a{color:#0000cd}figure{margin:24px 0}img{width:100%}figcaption,.meta{color:#566477;font-size:13px}table{border-collapse:collapse;width:100%;font-size:14px}td,th{text-align:left;vertical-align:top;padding:9px;border-bottom:1px solid #d6dfea}tr:first-child{background:#eaf0ff}nav{padding:16px;background:white}nav a{margin-right:20px}@media(max-width:600px){main{padding:10px}.page{padding:20px}h1{font-size:27px}table{font-size:12px}}@media print{body{background:white}main{padding:0}.page{break-after:page;margin:0;border:0;padding:0}nav{display:none}}'
def htmlblocks(seq):
 parts=[]
 for b in seq:
  if b[0] in ['p','h']:
   tag='p' if b[0]=='p' else 'h2';s=re.sub(r'<link href="([^"]+)">',r'<a href="\1">',math_text(b[1])).replace('</link>','</a>').replace('<super>','<sup>').replace('</super>','</sup>');parts.append(f'<{tag}>{s}</{tag}>')
  elif b[0]=='image':parts.append(f'<figure><img src="figures/{b[1]}.png" alt="{html.escape(b[2])}"><figcaption>{b[2]}</figcaption></figure>')
  elif b[0]=='table':parts.append('<table>'+''.join('<tr>'+''.join('<td>'+html.escape(str(c))+'</td>' for c in row)+'</tr>' for row in b[1])+'</table>')
 return ''.join(parts)
def build(name,title,pages,brief=False):
 sty=styles(brief);story=[]
 for i,seq in enumerate(pages):
  if i:story.append(PageBreak())
  else:story.extend([Paragraph(title,sty['title']),Paragraph(AUTHOR+'<br/>'+DATE,sty['deck'])])
  story+=blocks(seq,sty,brief)
 doc=SimpleDocTemplate(str(out/(name+'.pdf')),pagesize=A4,leftMargin=43,rightMargin=43,topMargin=34,bottomMargin=47,title=title,author='Niu Te',subject='Scientific software project report; pre-event baseline')
 doc.build(story,onFirstPage=footer,onLaterPages=footer)
 text='<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+title+'</title><style>'+css+'</style><nav><a href="../index.html">PhaseAtlas</a><a href="'+name+'.pdf">Download PDF</a></nav><main>'
 for i,seq in enumerate(pages):text+='<section class="page">'+(f'<h1>{title}</h1><p class="meta">{AUTHOR}<br/>{DATE}</p>' if i==0 else '')+htmlblocks(seq)+'</section>'
 text+='</main></html>';(out/(name+'.html')).write_text(text,encoding='utf8')
 n=len(PdfReader(out/(name+'.pdf')).pages);print(name,n,'pages');return n
assert build('PhaseAtlas_One_Page','PhaseAtlas<br/>From PDE animations to reproducible evidence',[ONE_PAGE],True)==1,'The submission summary must be one page'
assert build('PhaseAtlas_Article',TITLE,ARTICLE)==6,'Review article pagination'
assert build('PhaseAtlas_Submission_Kit','PhaseAtlas<br/>Submission kit & presentation scripts',KIT)==4,'Review kit pagination'
(out/'social-post.txt').write_text(SOCIAL,encoding='utf8')
for name,sections in [('demo-4min',SCRIPT4),('demo-2min',SCRIPT2)]:
 (out/(name+'.txt')).write_text('\n\n'.join('\n'.join(row) for row in sections),encoding='utf8')
shutil.copy2(out/'PhaseAtlas_One_Page.pdf',root/'docs/PhaseAtlas_Project_Brief.pdf');shutil.copy2(out/'PhaseAtlas_One_Page.pdf',root/'dist/downloads/PhaseAtlas_Project_Brief.pdf')
