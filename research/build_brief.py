"""Create the one-page project summary from actual research figures."""
from pathlib import Path
from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,Table,TableStyle,Image
from reportlab.lib.styles import getSampleStyleSheet,ParagraphStyle
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

root=Path(__file__).resolve().parent.parent
regular=next(p for p in [Path('C:/Windows/Fonts/arial.ttf'),Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')] if p.exists())
bold=next(p for p in [Path('C:/Windows/Fonts/arialbd.ttf'),Path('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf')] if p.exists())
pdfmetrics.registerFont(TTFont('DejaVu',str(regular)))
pdfmetrics.registerFont(TTFont('DejaVuBold',str(bold)))
pdfmetrics.registerFontFamily('DejaVu',normal='DejaVu',bold='DejaVuBold')
ink,teal,muted=HexColor('#17233c'),HexColor('#0000cd'),HexColor('#65718a')
styles=getSampleStyleSheet()
styles.add(ParagraphStyle(name='Brand',fontName='DejaVuBold',fontSize=28,leading=34,textColor=ink,spaceAfter=4))
styles.add(ParagraphStyle(name='Deck',fontName='DejaVu',fontSize=11,leading=16,textColor=teal,spaceAfter=12))
styles.add(ParagraphStyle(name='BodyWD',fontName='DejaVu',fontSize=8.5,leading=12.4,textColor=ink,spaceAfter=9))
styles.add(ParagraphStyle(name='SectionWD',fontName='DejaVuBold',fontSize=10,leading=15,textColor=ink,spaceBefore=6,spaceAfter=5))
styles.add(ParagraphStyle(name='CaptionWD',fontName='DejaVu',fontSize=7,leading=10,textColor=muted,spaceAfter=8))
P=lambda s,style='BodyWD':Paragraph(s,styles[style])
sections=[
('Problem','An exact traveling wave and a persuasive animation are not enough to trust a PDE experiment. Sign errors, inadequate resolution, boundary reflections and ambiguous stability claims can all produce convincing but misleading results.'),
('A reusable scientific workbench','PhaseAtlas connects verified formulas to real browser-based computation. Researchers can evolve localized disturbances, compare moving and laboratory coordinates, inspect fixed-scale space-time maps, and distinguish global, local and weighted responses. A spectral atlas and numerical shooting tool generate explicit candidates for further analysis.'),
('Trust and reproducibility','The browser uses a variable-coefficient implicit SBDF2 method. Thirteen mathematical and numerical tests pass; SymPy verifies all three exact profiles. Independent SciPy integration agrees with the default cubic experiment to approximately <b>0.0191%</b> in the final perturbation relative L2 norm on the same spatial mesh. A joint refinement from 2,049 to 4,097 points changes the final perturbation by 1.13%; this is distinct from the same-mesh integrator comparison. Manufactured-solution, space, time and domain checks are provided.'),
('Practical value','For nonlinear-wave researchers, solver developers and instructors: audit a formula, design an experiment, inspect failure modes, and hand another researcher the complete configuration and time history. Exports include JSON, CSV, SVG, PNG, a report and WebM animation. An independent Python reference and editable figure generator accompany the source. No account, API key or external LLM is needed for local computation.'),
('Research contribution and next step','The new deliverable is the integrated software and evidence workflow, developed with AI assistance. The known exact fronts and the author\'s earlier Fourth-order work are prior foundations. A future Nonlinearity paper must establish a new result, such as persistence and rigorous response estimates for a front family; the platform supports that work but does not claim to have completed it.'),
]
story=[P('PhaseAtlas','Brand'),P('A reproducible laboratory for nonlinear traveling waves','Deck')]
story.append(P('SCIENTIFIC SOFTWARE  /  MATHEMATICS  /  RESEARCH PREVIEW 0.1','CaptionWD'))
for title,body in sections[:2]:story.extend([P(title,'SectionWD'),P(body)])
imgs=[]
for name in ['02_spacetime','03_norms']:
    image=Image(str(root/'docs/figures'/f'{name}.png'),width=247,height=130,kind='proportional')
    imgs.append(image)
table=Table([imgs],colWidths=[252,252]);table.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-1),0)]));story.append(table)
story.append(P('Actual default cubic computation: fixed-scale disturbance map (left), normalized finite-interval norms (right). Different diagnostics can evolve in different directions. These figures are observations, not a nonlinear stability theorem.','CaptionWD'))
for title,body in sections[2:]:story.extend([P(title,'SectionWD'),P(body)])
story.append(P('<b>Scope:</b> Cubic and Burgers perturbation evolution; KdV-Burgers analytic translation only. Candidate continuation is numerical, not an interval-validated existence proof. No experimental calibration is claimed. Local use requires no account. Hosting and source licensing are managed by the project owner.','CaptionWD'))
story.append(P('Context: Hu &amp; Liu (2019), doi:10.3934/math.2019.5.1450; Johnson, Lyng &amp; Smith, arXiv:1810.02233. Source and verification details accompany the project.','CaptionWD'))
out=root/'docs/PhaseAtlas_Project_Brief.pdf'
def footer(canvas,doc):
    canvas.setStrokeColor(HexColor('#dde2ec'));canvas.line(43,34,552,34)
    canvas.setFont('DejaVu',7);canvas.setFillColor(muted);canvas.drawString(43,22,'PhaseAtlas | exact structure -> computation -> evidence');canvas.drawRightString(552,22,'Project summary | 1')
doc=SimpleDocTemplate(str(out),pagesize=A4,rightMargin=43,leftMargin=43,topMargin=32,bottomMargin=45)
doc.build(story,onFirstPage=footer,onLaterPages=footer)
html='<!doctype html><html lang="en"><meta charset="utf-8"><title>PhaseAtlas project brief</title><style>body{max-width:850px;margin:40px auto;padding:25px;font:14px/1.6 system-ui;color:#17233c}h1{font-size:35px;margin-bottom:0}h2{font-size:17px}p{color:#465470}.plots{display:flex;gap:12px}.plots img{width:49%}@media print{body{margin:0;font-size:11px}}</style><h1>PhaseAtlas</h1><p>A reproducible laboratory for nonlinear traveling waves</p>'
for title,body in sections:html+=f'<h2>{title}</h2><p>{body}</p>'
html+='<div class="plots"><img src="figures/02_spacetime.png" alt="Perturbation space-time map"><img src="figures/03_norms.png" alt="Normalized response norms"></div><p>Finite-domain numerical observations. No nonlinear stability or experimental calibration claim.</p></html>'
(root/'docs/project-brief.html').write_text(html,encoding='utf-8')
print(out)

