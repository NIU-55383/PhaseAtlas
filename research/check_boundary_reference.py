"""Recompute the exported boundary fixtures with independent SciPy time integration."""
from pathlib import Path
import json
from datetime import datetime, timezone
from studio_reference import run

root = Path(__file__).resolve().parent.parent
records = []
for name in ['mixed-rod', 'heated-plate', 'time-boundary', 'neumann-input', 'coupled-neumann']:
    document = json.loads((root / f'research/validation/boundary-{name}.json').read_text())
    reference = run(document)
    differences = [{k: v for k, v in row.items() if k != 'finalValues'} for row in reference['fields']]
    for row in differences:
        assert row['browserRelativeL2Difference'] < 1e-5, (name, row)
    record = {'case': name, 'N': document['config']['N'], 'dimension': document['config']['dimension'],
              'T': document['config']['T'], 'dt': document['dt'], 'fields': differences,
              'referenceMethod': reference['method']}
    records.append(record)
    print(json.dumps(record))

report = {'schema': 'phaseatlas-boundary-validation/v1', 'createdAt': datetime.now(timezone.utc).isoformat(),
          'browserSolver': 'phaseatlas-fv-sbdf2-1.0.0',
          'scope': 'Independent NumPy stencil implementation and SciPy DOP853 on the same finite-volume grid. These comparisons check implementation and time integration, not continuum accuracy or every supported PDE.',
          'reproduce': ['node tests/boundary_reference_fixtures.mjs', 'python research/check_boundary_reference.py'],
          'cases': records}
(root / 'dist/data/boundary-validation.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
