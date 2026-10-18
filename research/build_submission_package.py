from pathlib import Path
import json,hashlib,shutil,zipfile
from datetime import datetime,timezone
root=Path(__file__).resolve().parents[1]
ref=root/'dist/data/submission-2026/reference';ref.mkdir(exist_ok=True)
previous=root.parent/'phaseatlas-robin-side'
for src,name in [(previous/'phaseatlas-reference-check.json','robin-mode-check.json'),(previous/'qa/robin-reference/mode.json','robin-mode-input.json'),(previous/'qa/robin-reference/affine-check.json','affine-check.json'),(previous/'qa/robin-reference/affine.json','affine-input.json')]:shutil.copy2(src,ref/name) if src.exists() else None
manifest={'date':'2026-10-18','author':'Niu Te','affiliation':'Imperial College London','status':'Pre-event baseline; not posted or submitted','numericTests':{'passed':90,'failed':0,'command':'node --test tests/science.test.mjs tests/studio.test.mjs tests/boundaries.test.mjs tests/fourth.test.mjs tests/evidence.test.mjs tests/research.test.mjs tests/robin.test.mjs'},'sources':json.loads((root/'dist/data/submission-2026/summary.json').read_text())['sourceHashes'],'artifacts':{}}
qa=root/'qa/submission-browser-qa.json'
if qa.exists():manifest['presentationQA']=json.loads(qa.read_text())
guide='''<!doctype html><html lang="en"><meta charset="utf-8"><title>PhaseAtlas submission package</title><style>body{max-width:850px;margin:40px auto;padding:20px;font:16px/1.6 Arial;color:#193451}a{color:#0000cd}code{background:#eef2ff}</style><h1>PhaseAtlas</h1><p>Niu Te | Imperial College London<br>18 October 2026 pre-event baseline</p><ol><li><a href="dist/submission-2026/PhaseAtlas_One_Page.pdf">One-page submission write-up</a></li><li><a href="dist/submission-2026/PhaseAtlas_Article.pdf">Six-page technical article</a></li><li><a href="dist/submission-2026/PhaseAtlas_Submission_Kit.pdf">Requirements, copy-ready fields, four-minute and two-minute scripts</a></li><li><a href="dist/submission-2026/PhaseAtlas_Article.html">Editable article HTML</a></li><li><a href="dist/submission-2026/social-post.txt">Social post draft</a></li></ol><h2>Run the website locally</h2><p>From this extracted directory run <code>python -m http.server 8000 --directory dist</code>, then open http://127.0.0.1:8000/. Browser workers require HTTP; do not open the tools as file URLs.</p><h2>Reproduce the scientific cases</h2><p>Run <code>node research/build_submission_cases.mjs</code>. Actual case arrays are in <code>dist/data/submission-2026/</code>, including 16 cooling-map trajectories and the three Robin-refinement runs. The summary records numerical source hashes. An independent Robin input and SciPy comparison are in its reference subdirectory.</p><p>Run the Node test command recorded in <code>dist/submission-2026/manifest.json</code>. The Python reference uses NumPy/SciPy; plots use Matplotlib; document generation uses ReportLab/PyPDF and Windows Arial fonts. HTML/PDF articles are already built. Browser QA additionally uses Playwright and Edge.</p><h2>Before submission</h2><p>The current agenda permits up to four minutes and one page. The legacy submission page and its form have not been confirmed for 2026. Confirm the event-period contribution and final form with the organizer. Publishing this package does not submit the project, upload a video or post on social media. Scripts are supplied; a final narrated recording remains to be made. Source licensing has not been changed.</p></html>'''
(root/'dist/submission-2026/Package_README.html').write_text(guide.replace('dist/submission-2026/',''),encoding='utf8')
# Refresh old presentation download entries so they cannot silently serve obsolete copy.
script=(root/'dist/submission-2026/demo-4min.txt').read_text(encoding='utf8')
for dest in ['docs/DEMO_SCRIPT.md','dist/downloads/DEMO_SCRIPT.md']:
 (root/dest).write_text('# PhaseAtlas: current presentation script\n\nAuthor: Niu Te, Imperial College London. Baseline: 18 October 2026.\n\n'+script+'\n\nSee dist/submission-2026/PhaseAtlas_Submission_Kit.pdf for current requirements, caveats and the two-minute alternative.\n',encoding='utf8')
for p in (root/'dist/submission-2026').rglob('*'):
 if p.is_file() and p.name!='manifest.json':manifest['artifacts'][p.relative_to(root/'dist').as_posix()]=hashlib.sha256(p.read_bytes()).hexdigest()
(root/'dist/submission-2026/manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf8')
zip_path=root/'dist/downloads/PhaseAtlas_Submission_2026.zip'
with zipfile.ZipFile(zip_path,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=7) as z:
 z.writestr('README.html',guide);z.write(root/'package.json','package.json')
 for folder in ['dist','research','tests']:
  for p in (root/folder).rglob('*'):
   if p.is_file() and p.suffix not in ['.zip','.pyc'] and '__pycache__' not in p.parts:z.write(p,p.relative_to(root).as_posix())
 for name in ['RESEARCH_NOTES.md','CUSTOM_PDE_STUDIO.md','ROBIN_AND_RESEARCH_METRICS.html']:
  z.write(root/'docs'/name,'docs/'+name)
shutil.copy2(zip_path,root/'dist/downloads/phaseatlas-research.zip')
with zipfile.ZipFile(zip_path) as z:
 assert z.testzip() is None
 print(json.dumps({'zipMB':round(zip_path.stat().st_size/1e6,2),'entries':len(z.namelist()),'PDFs':3,'articlePages':6}))
