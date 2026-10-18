"""Compare fourth-order browser fixtures with independent NumPy/SciPy integration."""
from pathlib import Path
from datetime import datetime, timezone
import json
from studio_reference import run

root = Path(__file__).resolve().parent.parent
records = []
for name in ['supported', 'clamped', 'custom-time', 'mae03-front', 'mae03-perturbed', 'coupled']:
    browser = json.loads((root/f'research/validation/fourth-{name}.json').read_text())
    reference = run(browser)
    fields = [{k:v for k,v in f.items() if k != 'finalValues'} for f in reference['fields']]
    assert all(f['browserRelativeL2Difference'] < 1e-5 for f in fields), (name,fields)
    record = {'case':name, 'N':browser['config']['N'], 'T':browser['config']['T'], 'dt':browser['dt'],
              'fields':fields, 'referenceMethod':reference['method']}
    records.append(record)
    print(json.dumps(record), flush=True)
report = {'schema':'phaseatlas-fourth-validation/v1','createdAt':datetime.now(timezone.utc).isoformat(),
          'solverVersion':'phaseatlas-fourth-sbdf2-1.0.0',
          'scope':'Independent NumPy boundary reconstruction and centered differences with SciPy BDF on the same cell-centered grid. Agreement is not a continuum error bound. The separate refinement records compare known exact/manufactured solutions.',
          'reproduce':['node tests/fourth_reference_fixtures.mjs','python research/check_fourth_reference.py'],
          'cases':records,'convergence':json.loads((root/'research/validation/fourth-convergence.json').read_text())}
(root/'dist/data/fourth-validation.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
