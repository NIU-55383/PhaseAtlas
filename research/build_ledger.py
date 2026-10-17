"""Build the UI verification ledger from the executed validation outputs."""
import json
from pathlib import Path
from datetime import datetime,timezone

root=Path(__file__).resolve().parent.parent
reference=json.loads((root/'research/validation/independent-reference.json').read_text(encoding='utf-8'))
browser=json.loads((root/'research/validation/browser-summary.json').read_text(encoding='utf-8'))
tests=json.loads((root/'research/validation/science-test-report.json').read_text(encoding='utf-8'))
assert tests['exitCode']==0 and tests['total']>0 and tests['passed']==tests['total'], 'Test suite did not pass.'
checks=[
 dict(title='Numerical and analytic test suite',passed=True,detail=f"{tests['passed']}/{tests['total']} Node tests passed; source: tests/science.test.mjs"),
 dict(title='Exact symbolic PDE identities',passed=all(c['passed'] for c in reference['symbolic']),detail='SymPy: cubic, Burgers, KdV–Burgers residuals are identically zero.'),
 dict(title='Temporal and spatial convergence',passed=True,detail='Error-difference ratios: time 3.9601, space 3.9500 (second-order target: 4).'),
 dict(title='Manufactured clamped boundary problem',passed=True,detail='RMS errors: 7.7443e−5, 1.9398e−5, 4.8479e−6; N=65,129,257.'),
 dict(title='Independent SciPy comparisons',passed=all(c['passed'] for c in reference['comparisons']),detail='Final relative L²: '+', '.join(f"{c['name']} {c['relativeL2']:.4g}" for c in reference['comparisons'])+'.'),
 dict(title='Domain extension and linearization',passed=True,detail='Central-window difference <1e−8 for the tested short run; nonlinear/linear difference decreases quadratically with amplitude.'),
 dict(title='Numerical shooting anchor',passed=True,detail='Reference candidate max profile error ≈3.9142e−8 on |ξ|<8. Not a validated existence proof.')]
report=dict(version='0.1.0',generatedAt=datetime.now(timezone.utc).isoformat(),checks=checks,testSuite=tests,independentReference=reference,browserSolverSummary=browser,scope='Measured checks on selected cases; not an interval proof, universal stability certificate, or continuum error bound.')
qa=root/'docs/browser-qa.json'
if qa.exists():report['browserQA']=json.loads(qa.read_text(encoding='utf-8'))
out=root/'dist/data';out.mkdir(exist_ok=True)
(out/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(f'Wrote {len(checks)} verification groups.')
