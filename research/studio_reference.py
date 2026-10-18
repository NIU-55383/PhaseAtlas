"""Independent small-grid check of a PhaseAtlas Studio JSON export.

Uses NumPy FFTs (periodic) or independently implemented finite-volume stencils
(Dirichlet/Neumann) and SciPy solve_ivp (DOP853 or BDF), not the browser's
ETDRK4/SBDF2 implementation. The spatial discretization is held fixed;
agreement therefore checks time integration, not continuum convergence.

    python studio_reference.py experiment.json --output comparison.json
    python studio_reference.py experiment.json --method BDF

Dependencies: numpy, scipy. Limit: N <= 128 in 1D; N <= 32 per axis in 2D.
Expressions are interpreted with a restricted AST; no eval or exec is used.
"""
import argparse
import ast
import json
import math
from pathlib import Path
import re

import numpy as np
from scipy.integrate import solve_ivp

FUNCTIONS = {'sin': np.sin, 'cos': np.cos, 'tanh': np.tanh, 'exp': np.exp,
             'log': np.log, 'sqrt': np.sqrt, 'abs': np.abs,
             'min': np.minimum, 'max': np.maximum}
DERIVATIVES = {'Dx', 'D', 'Dy', 'lap', 'biharm'}


def parse(source):
    if not isinstance(source, str) or not 0 < len(source) <= 1200:
        raise ValueError('Expression length must be 1–1200 characters.')
    tree = ast.parse(source.replace('^', '**'), mode='eval')
    nodes = list(ast.walk(tree))
    allowed = (ast.Expression, ast.Constant, ast.Name, ast.Load, ast.BinOp,
               ast.UnaryOp, ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Pow,
               ast.USub, ast.UAdd, ast.Call)
    if len(nodes) > 500 or any(not isinstance(n, allowed) for n in nodes):
        raise ValueError('Only mathematical expressions are supported.')
    for n in nodes:
        if isinstance(n, ast.Constant) and (type(n.value) not in (int, float) or not math.isfinite(n.value)):
            raise ValueError('Constants must be finite real numbers.')
        if isinstance(n, ast.Call):
            if not isinstance(n.func, ast.Name) or n.keywords:
                raise ValueError('Invalid function call.')
            name = n.func.id
            if name not in FUNCTIONS and name not in DERIVATIVES:
                raise ValueError(f'Unknown function: {name}')
            arity = 2 if name in {'min', 'max', 'D', 'Dx', 'Dy'} else 1
            if len(n.args) != arity:
                raise ValueError(f'{name} expects {arity} arguments.')
    return tree.body


def evaluate(node, context, derivative=None):
    if isinstance(node, ast.Constant):
        return float(node.value)
    if isinstance(node, ast.Name):
        if node.id not in context:
            raise ValueError(f'Unknown symbol: {node.id}')
        return context[node.id]
    if isinstance(node, ast.UnaryOp):
        value = evaluate(node.operand, context, derivative)
        return -value if isinstance(node.op, ast.USub) else value
    if isinstance(node, ast.BinOp):
        a = evaluate(node.left, context, derivative)
        b = evaluate(node.right, context, derivative)
        if isinstance(node.op, ast.Add): return a + b
        if isinstance(node.op, ast.Sub): return a - b
        if isinstance(node.op, ast.Mult): return a * b
        if isinstance(node.op, ast.Div): return a / b
        return a ** b
    name = node.func.id
    args = [evaluate(a, context, derivative) for a in node.args]
    if name in DERIVATIVES:
        if derivative is None:
            raise ValueError('Derivatives are not allowed here.')
        return derivative(args[0], name, args[1] if len(args) > 1 else None, node.args[0])
    return FUNCTIONS[name](*args)


def run(document, method='DOP853'):
    config = document.get('config', document)
    dimension, n = int(config['dimension']), int(config['N'])
    fields = config['fields']
    if dimension not in (1, 2) or not 1 <= len(fields) <= 3:
        raise ValueError('Use 1D or 2D and one to three fields.')
    if n < 16 or n & (n-1) or n > (128 if dimension == 1 else 32):
        raise ValueError('Independent reference limit: power-of-two N = 16–128 in 1D, 16–32 in 2D. Export a smaller-grid run first.')
    boundary = config.get('boundary', 'periodic')
    if boundary not in {'periodic', 'nonperiodic', 'dirichlet', 'neumann'}:
        raise ValueError('Choose periodic or Dirichlet/Neumann boundaries.')
    bounded = boundary != 'periodic'
    lx, ly, end, dt = (float(config[k]) for k in ('Lx', 'Ly', 'T', 'dt'))
    if not all(math.isfinite(v) and v > 0 for v in (lx, ly, end, dt)) or dt > end or end/dt > 40000:
        raise ValueError('Invalid domain or time settings.')
    constants = {'pi': np.pi, 'e': np.e}
    reserved = set(constants) | set(FUNCTIONS) | DERIVATIVES | {'x','y','t','u','v','w','Lx','Ly'}
    for assignment in re.split(r'[;\n]', config.get('parameters', '')):
        if not assignment.strip(): continue
        match = re.fullmatch(r'\s*([A-Za-z][A-Za-z0-9_]*)\s*=\s*(.+)\s*', assignment)
        if not match or match[1] in reserved or match[1] in constants:
            raise ValueError('Invalid or repeated parameter assignment.')
        value = float(evaluate(parse(match[2]), constants))
        if not math.isfinite(value): raise ValueError('Non-finite parameter.')
        constants[match[1]] = value
    constants.update(Lx=lx, Ly=ly)
    x = -lx/2 + (np.arange(n) + (0.5 if bounded else 0))*lx/n
    kx = 2*np.pi*np.fft.fftfreq(n, d=lx/n)
    modes = np.fft.fftfreq(n)*n
    if dimension == 2:
        y = -ly/2 + (np.arange(n) + (0.5 if bounded else 0))*ly/n
        x, y = np.meshgrid(x, y)
        kx, ky = np.meshgrid(kx, 2*np.pi*np.fft.fftfreq(n, d=ly/n))
        mx, my = np.meshgrid(modes, modes)
        mask = (np.abs(mx) < n/4) & (np.abs(my) < n/4)
    else:
        y, ky = np.zeros(n), np.zeros(n)
        mask = np.abs(modes) < n/4
    shape = x.shape
    context = dict(constants, x=x, y=y)

    boundaries = []
    sides = ('left', 'right', 'bottom', 'top') if dimension == 2 else ('left', 'right')
    if bounded:
        for f in fields:
            edges = {}
            for side in sides:
                data = f.get('boundaries', {}).get(side)
                if data is None and boundary in {'dirichlet', 'neumann'}:
                    data = {'type': boundary, 'value': '0'}
                if not data or data.get('type') not in {'dirichlet', 'neumann'}:
                    raise ValueError(f'Missing or invalid {side} boundary.')
                edges[side] = (data['type'], parse(data['value']))
            boundaries.append(edges)

    def boundary_values(t):
        result = []
        for edges in boundaries:
            output = {}
            for side, (_, formula) in edges.items():
                if side in ('left', 'right'):
                    bx, by = (-lx/2 if side == 'left' else lx/2), (y[:, 0] if dimension == 2 else 0)
                else:
                    bx, by = x[0, :], (-ly/2 if side == 'bottom' else ly/2)
                output[side] = evaluate(formula, dict(constants, x=bx, y=by, t=t))
                if not np.all(np.isfinite(output[side])):
                    raise ValueError('Non-finite boundary data.')
            result.append(output)
        return result

    def as_field(value):
        result = np.broadcast_to(np.asarray(value, dtype=float), shape).copy()
        if not np.all(np.isfinite(result)):
            raise ValueError('Non-finite expression.')
        return result

    def project(value):
        if bounded:
            return as_field(value)
        return np.fft.ifftn(np.fft.fftn(as_field(value))*mask).real

    def derivative(value, name, order, source=None):
        if name in {'Dx', 'Dy', 'D'} and (order not in (1, 2, 3, 4)):
            raise ValueError('Derivative orders must be 1–4.')
        if name == 'Dy' and dimension == 1:
            raise ValueError('Dy is only available in 2D.')
        if name == 'lap': symbol = -(kx*kx + ky*ky)
        elif name == 'biharm': symbol = (kx*kx + ky*ky)**2
        else: symbol = (1j*(ky if name == 'Dy' else kx))**int(order)
        return np.fft.ifftn(np.fft.fftn(as_field(value))*symbol).real

    def finite_volume_derivative(value, name, order, source, data):
        names = ('u', 'v', 'w')[:len(fields)]
        if not isinstance(source, ast.Name) or source.id not in names:
            raise ValueError('Bounded derivatives must act directly on a field.')
        if name == 'biharm' or name != 'lap' and order not in (1, 2):
            raise ValueError('Bounded derivatives support orders one and two.')
        if name == 'Dy' and dimension != 2:
            raise ValueError('Dy requires 2D.')
        index = names.index(source.id)
        v = as_field(value)

        def direction(axis, degree):
            h = lx/n if axis == -1 else ly/n
            low, high = ('left', 'right') if axis == -1 else ('bottom', 'top')
            first, last = np.take(v, 0, axis=axis), np.take(v, -1, axis=axis)
            ghosts = []
            for side, cell, neighbor in ((low, first, np.take(v, 1, axis=axis)),
                                         (high, last, np.take(v, -2, axis=axis))):
                target = data[index][side]
                if boundaries[index][side][0] == 'dirichlet':
                    ghost = 8*target/3 - 2*cell + neighbor/3 if degree == 1 else 2*target-cell
                else:
                    ghost = cell+h*target
                ghosts.append(np.expand_dims(ghost, axis))
            padded = np.concatenate((ghosts[0], v, ghosts[1]), axis=axis)
            a, b = np.take(padded, np.arange(n), axis=axis), np.take(padded, np.arange(2, n+2), axis=axis)
            return (b-a)/(2*h) if degree == 1 else (a-2*v+b)/h**2

        if name == 'lap':
            return direction(-1, 2)+(direction(0, 2) if dimension == 2 else 0)
        return direction(0 if name == 'Dy' else -1, int(order))

    equations = [parse(f['rhs']) for f in fields]
    initial = np.stack([project(evaluate(parse(f['initial']), context)) for f in fields])
    full_shape = initial.shape

    def rhs(t, vector):
        current = vector.reshape(full_shape)
        variables = dict(context, t=t, **dict(zip(('u','v','w'), current)))
        d = derivative
        if bounded:
            data = boundary_values(t)
            d = lambda value, name, order, source: finite_volume_derivative(value, name, order, source, data)
        with np.errstate(over='raise', invalid='raise', divide='raise'):
            return np.stack([project(evaluate(eq, variables, d)) for eq in equations]).ravel()

    solution = solve_ivp(rhs, (0, end), initial.ravel(), method=method,
                         rtol=1e-9, atol=1e-11, max_step=dt, t_eval=[end])
    if not solution.success:
        raise RuntimeError(solution.message)
    values = solution.y[:, -1].reshape(full_shape)
    spatial_method = 'NumPy cell-centered finite-volume stencils' if bounded else 'NumPy FFT'
    report = {'method': f'SciPy solve_ivp {method}; {spatial_method}; rtol=1e-9, atol=1e-11',
              'scope': ('Same cell-centered grid and boundary closures.' if bounded else 'Same periodic grid and half-band projection.')+' This is an independent time-integration check, not a continuum error bound.',
              'config': config, 'rhsEvaluations': solution.nfev, 'fields': []}
    exported = document.get('frames', [])
    if exported and not math.isclose(float(exported[-1]['t']), end, rel_tol=1e-10, abs_tol=1e-12):
        raise ValueError('Exported final time does not match the configuration.')
    for i, v in enumerate(values):
        row = {'field': ('u','v','w')[i], 'mean': float(np.mean(v)), 'rms': float(np.sqrt(np.mean(v*v)))}
        if exported:
            previous = np.asarray(exported[-1]['values'][i]).reshape(shape)
            row['browserRelativeL2Difference'] = float(np.linalg.norm(v-previous)/max(np.linalg.norm(v), 1e-30))
        row['finalValues'] = v.ravel().tolist()
        report['fields'].append(row)
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('experiment', type=Path)
    parser.add_argument('--output', type=Path, default=Path('phaseatlas-reference-check.json'))
    parser.add_argument('--method', choices=['DOP853', 'BDF'], default='DOP853')
    args = parser.parse_args()
    result = run(json.loads(args.experiment.read_text(encoding='utf-8')), args.method)
    args.output.write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(json.dumps({k: v for k, v in result.items() if k not in ('config', 'fields')}, indent=2))
    print(json.dumps([{k: v for k, v in row.items() if k != 'finalValues'} for row in result['fields']], indent=2))
    print(f'Saved {args.output}')
