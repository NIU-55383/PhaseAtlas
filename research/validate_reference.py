"""Compare the browser implementation against independently assembled SciPy runs."""
import json
from pathlib import Path
import numpy as np
from phaseatlas import run,symbolic_checks

folder=Path(__file__).parent/'validation'
comparisons=[]
for name in ['cubic_linear','cubic_nonlinear','burgers']:
    browser=json.loads((folder/f'{name}.json').read_text(encoding='utf-8'))
    reference=run(browser['config'])
    actual=np.asarray(browser['frames'][-1]['w'])
    expected=np.asarray(reference['perturbations'][-1])
    relative=float(np.linalg.norm(actual-expected)/max(np.linalg.norm(expected),1e-15))
    absolute=float(np.max(np.abs(actual-expected)))
    assert relative<.003, (name,relative)
    comparisons.append(dict(name=name,relativeL2=relative,maxAbs=absolute,passed=True,referenceMethod=reference['method']))
    print(f'{name}: relative L2={relative:.6g}, max abs={absolute:.6g}',flush=True)
report=dict(comparisons=comparisons,symbolic=symbolic_checks(),numpyVersion=np.__version__)
(folder/'independent-reference.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
