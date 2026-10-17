"""Independent SciPy reference for PhaseAtlas. Python 3.10+, NumPy, SciPy.

Run: python research/phaseatlas.py --verify
     python research/phaseatlas.py --config experiment.json --output reference.json
The browser uses SBDF2; this reference uses a sparse matrix exponential for linear
experiments and SciPy BDF for nonlinear experiments on the same spatial mesh.
"""
import argparse
import json
from pathlib import Path
import numpy as np
from scipy.special import expit
from scipy.sparse import lil_matrix
from scipy.sparse.linalg import expm_multiply
from scipy.integrate import solve_ivp

MODELS = {
    'cubic': dict(a=0., b=315/16, alpha=-71/4, beta=-15/2, gamma=-1., c=105/8, p=1.5, scale=1., order=4),
    'burgers': dict(a=.5, b=0., alpha=.5, beta=0., gamma=0., c=.5, p=1., scale=-1., order=2),
    'kdvb': dict(a=-6., b=0., alpha=5., beta=1., gamma=0., c=-6., p=2., scale=1., order=3),
}
DEFAULT = dict(model='cubic', mode='linear', N=257, L=24, T=.06, dt=.00005,
               amplitude=.001, center=-5, width=1.5, k=np.sqrt(71/8), frames=61)

def profile(x, model='cubic'):
    m = MODELS[model]
    return expit(m['scale'] * np.asarray(x)) ** m['p']

def operator(config):
    m = MODELS[config['model']]
    if m['order'] == 3:
        raise ValueError('KdV–Burgers supports exact translation only.')
    N, L = config['N'], config['L']
    x = np.linspace(-L, L, N)
    h = x[1] - x[0]
    n = N - 2
    D = [lil_matrix((n, n)) for _ in range(4)]
    stencils = [{-1:-.5/h,1:.5/h}, {-1:1/h**2,0:-2/h**2,1:1/h**2},
                {-2:-.5/h**3,-1:1/h**3,1:-1/h**3,2:.5/h**3},
                {-2:1/h**4,-1:-4/h**4,0:6/h**4,1:-4/h**4,2:1/h**4}]
    for d, stencil in zip(D, stencils):
        for j in range(1, N-1):
            for offset, value in stencil.items():
                col = j + offset
                if col < 0: col = 1
                if col >= N: col = N-2
                if col in (0, N-1): continue
                d[j-1,col-1] += value
    D1,D2,D3,D4 = [d.tocsr() for d in D]
    v = profile(x,config['model'])
    fp = 2*m['a']*v[1:-1]+2*m['b']*v[1:-1]**2
    A = m['gamma']*D4-m['beta']*D3+m['alpha']*D2+m['c']*D1-D1.multiply(fp)
    return x,v,A.tocsr(),D1

def run(config):
    cfg = {**DEFAULT, **config}
    x,v,A,D1 = operator(cfg)
    taper_s = np.clip((np.abs(x)/cfg['L']-.75)/.25,0,1)
    taper = 1-10*taper_s**3+15*taper_s**4-6*taper_s**5
    w0 = cfg['amplitude']*np.exp(-.5*((x-cfg['center'])/cfg['width'])**2)*np.cos(cfg['k']*(x-cfg['center']))*taper
    times = np.linspace(0,cfg['T'],cfg['frames'])
    if cfg['mode'] == 'linear':
        W = expm_multiply(A,w0[1:-1],start=0,stop=cfg['T'],num=cfg['frames'])
        method = 'SciPy sparse expm_multiply (independent time integrator)'
    elif cfg['mode'] == 'nonlinear':
        m = MODELS[cfg['model']]
        def rhs(t,w):
            return A@w-D1@((m['a']+2*m['b']*v[1:-1])*w*w+2*m['b']*w**3/3)
        sol = solve_ivp(rhs,(0,cfg['T']),w0[1:-1],method='BDF',t_eval=times,
                        rtol=2e-9,atol=1e-12,jac_sparsity=(abs(A)>0))
        if not sol.success: raise RuntimeError(sol.message)
        W = sol.y.T
        method = 'SciPy BDF, rtol=2e-9, atol=1e-12'
    else:
        raise ValueError('Reference CLI accepts linear or nonlinear experiments.')
    return dict(config=cfg,x=x.tolist(),reference=v.tolist(),times=times.tolist(),
                perturbations=np.pad(W,((0,0),(1,1))).tolist(),method=method)

def symbolic_checks():
    import sympy as s
    y=s.symbols('y',positive=True)
    checks=[]
    params={'cubic':(0,s.Rational(315,16),s.Rational(-71,4),s.Rational(-15,2),-1,s.Rational(105,8),s.Rational(3,2),1),
            'burgers':(s.Rational(1,2),0,s.Rational(1,2),0,0,s.Rational(1,2),1,-1),
            'kdvb':(-6,0,5,1,0,-6,2,1)}
    for name,(a,b,al,be,ga,c,p,scale) in params.items():
        v=(y/(1+y))**p
        deriv=[v]
        for _ in range(4): deriv.append(s.simplify(scale*y*s.diff(deriv[-1],y)))
        residual=s.simplify(ga*deriv[4]-be*deriv[3]+al*deriv[2]+(c-2*a*v-2*b*v*v)*deriv[1])
        assert residual == 0, (name,residual)
        checks.append(dict(name=name,exact_residual=str(residual),passed=True))
    return checks

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config',type=Path)
    parser.add_argument('--output',type=Path,default=Path('reference.json'))
    parser.add_argument('--verify',action='store_true')
    args=parser.parse_args()
    if args.verify:
        print(json.dumps(symbolic_checks(),indent=2));return
    config=json.loads(args.config.read_text(encoding='utf-8')) if args.config else DEFAULT
    # Accept either the app's full export or a standalone config.
    config=config.get('config',config)
    result=run(config)
    args.output.write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(f"Wrote {args.output}: {result['method']}")
if __name__=='__main__': main()
