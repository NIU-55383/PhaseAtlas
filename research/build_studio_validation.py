"""Package measured independent Studio comparisons without shipping field arrays."""
import json
from pathlib import Path

root = Path(__file__).resolve().parent.parent
records = []
for name in ('burgers', 'gray', 'cahn'):
    browser = json.loads((root / f'research/validation/studio-{name}.json').read_text())
    reference = json.loads((root / f'research/validation/studio-{name}-reference.json').read_text())
    records.append({
        'model': name,
        'config': browser['config'],
        'browserSolverVersion': browser['solverVersion'],
        'referenceMethod': reference['method'],
        'scope': reference['scope'],
        'fields': [{k: v for k, v in field.items() if k != 'finalValues'} for field in reference['fields']],
    })
record = {
    'schema': 'phaseatlas-studio-validation/v1',
    'releaseValidationDate': '2026-10-18',
    'description': 'Measured regression examples, not validation of arbitrary user-entered PDEs.',
    'independentComparisons': records,
    'reproduce': ['node tests/studio_reference_fixtures.mjs',
                  'python research/studio_reference.py research/validation/studio-MODEL.json --output research/validation/studio-MODEL-reference.json',
                  'python research/build_studio_validation.py'],
}
target = root / 'dist/data/studio-validation.json'
target.write_text(json.dumps(record, indent=2), encoding='utf-8')
print(f'Wrote {target}')
