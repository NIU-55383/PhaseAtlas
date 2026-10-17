"""Assemble the portable source/research toolkit with an explicit file allowlist."""
from pathlib import Path
import json
import shutil
import zipfile

root=Path(__file__).resolve().parent.parent
downloads=root/'dist/downloads';downloads.mkdir(exist_ok=True)
for source in [root/'docs/RESEARCH_NOTES.md',root/'docs/ACCEPTANCE.md',root/'docs/DEMO_SCRIPT.md',root/'docs/PhaseAtlas_Project_Brief.pdf',root/'docs/PhaseAtlas_Cubic_Demo.webm']:
    shutil.copy2(source,downloads/source.name)
baseline=root/'docs/screenshots/phaseatlas-cubic.json'
if baseline.exists():
    shutil.copy2(baseline,downloads/'reference-experiment.json')
    data=json.loads(baseline.read_text(encoding='utf-8'))
    (root/'docs/default-refinement.json').write_text(json.dumps(data.get('refinement',{}),indent=2),encoding='utf-8')
files=[root/name for name in ['README.md','package.json','launch.py','app.py','requirements.txt','START_PhaseAtlas.cmd']]
allowed={'.html','.css','.js','.mjs','.py','.txt','.md','.json','.pdf','.png','.svg','.webm'}
for directory in ['dist','research','tests','docs']:
    for p in (root/directory).rglob('*'):
        if not p.is_file() or p.suffix.lower() not in allowed:continue
        rel=p.relative_to(root)
        if '__pycache__' in rel.parts or 'downloads' in rel.parts or 'screenshots' in rel.parts:continue
        files.append(p)
out=downloads/'phaseatlas-research.zip'
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED,compresslevel=8) as archive:
    for p in sorted(set(files)):archive.write(p,Path('PhaseAtlas')/p.relative_to(root))
print(f'Packaged {len(set(files))} files, {out.stat().st_size/1024/1024:.2f} MiB: {out}')
