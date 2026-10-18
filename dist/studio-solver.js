import {FIELD_NAMES, parseExpression, parseParameters, evaluate, derivativeOrder, splitLinear} from './studio-expression.js';
import {makeBoundedGrid, prepareBounded, simulateBounded, sidesFor} from './studio-bounded.js';
import {prepareFourth,simulateFourth} from './studio-fourth.js';

export const SOLVER_VERSION = 'phaseatlas-spectral-1.0.0';
export const METHOD = 'Fourier pseudospectral discretization; diagonal ETDRK4; half-band projection (|mode| < N/4 per axis); Float64 arithmetic; periodic boundaries.';
const complex = n => ({re: new Float64Array(n), im: new Float64Array(n)});
const multiply = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const divide = (a, b) => { const d = b[0] ** 2 + b[1] ** 2; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
const exponential = (r, i) => [Math.exp(r) * Math.cos(i), Math.exp(r) * Math.sin(i)];

export function fft(re, im, inverse = false) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let length = 2; length <= n; length *= 2) {
    const angle = (inverse ? 2 : -2) * Math.PI / length, wr = Math.cos(angle), wi = Math.sin(angle);
    for (let start = 0; start < n; start += length) {
      let ur = 1, ui = 0;
      for (let k = 0; k < length / 2; k++) {
        const a = start + k, b = a + length / 2;
        const vr = re[b] * ur - im[b] * ui, vi = re[b] * ui + im[b] * ur;
        re[b] = re[a] - vr; im[b] = im[a] - vi; re[a] += vr; im[a] += vi;
        const next = ur * wr - ui * wi; ui = ur * wi + ui * wr; ur = next;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

export function makeGrid(config) {
  if(config.boundary && config.boundary !== 'periodic') return makeBoundedGrid(config);
  const {N: n, dimension, Lx, Ly} = config, ny = dimension === 2 ? n : 1, size = n * ny;
  const x = new Float64Array(size), y = new Float64Array(size), kx = new Float64Array(size), ky = new Float64Array(size), mask = new Uint8Array(size);
  const edge = new Uint8Array(size);
  for (let j = 0; j < ny; j++) for (let i = 0; i < n; i++) {
    const p = j * n + i, mx = i <= n / 2 ? i : i - n, my = j <= ny / 2 ? j : j - ny;
    x[p] = -Lx / 2 + i * Lx / n; y[p] = dimension === 2 ? -Ly / 2 + j * Ly / n : 0;
    kx[p] = 2 * Math.PI * mx / Lx; ky[p] = dimension === 2 ? 2 * Math.PI * my / Ly : 0;
    mask[p] = Math.abs(mx) < n / 4 && (dimension === 1 || Math.abs(my) < n / 4) ? 1 : 0;
    edge[p] = mask[p] && (Math.abs(mx) > n / 6 || Math.abs(my) > n / 6) ? 1 : 0;
  }
  function transform(re, im, inverse = false) {
    for (let j = 0; j < ny; j++) fft(re.subarray(j * n, (j + 1) * n), im.subarray(j * n, (j + 1) * n), inverse);
    if (dimension === 2) {
      const r = new Float64Array(n), q = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) { r[j] = re[j * n + i]; q[j] = im[j * n + i]; }
        fft(r, q, inverse);
        for (let j = 0; j < n; j++) { re[j * n + i] = r[j]; im[j * n + i] = q[j]; }
      }
    }
  }
  function forward(values) { const out = complex(size); if (typeof values === 'number') out.re.fill(values); else out.re.set(values); transform(out.re, out.im); return out; }
  function physical(v) { const out = {re: v.re.slice(), im: v.im.slice()}; transform(out.re, out.im, true); return out.re; }
  function project(v) { for (let i = 0; i < size; i++) if (!mask[i]) { v.re[i] = 0; v.im[i] = 0; } return v; }
  function derivative(values, kind, order) {
    if (kind === 'Dy' && dimension === 1) throw Error('Dy requires a two-dimensional domain.');
    const v = forward(values);
    for (let i = 0; i < size; i++) {
      let r = 0, q = 0;
      if (kind === 'lap' || kind === 'biharm') { const square = kx[i] ** 2 + ky[i] ** 2; r = kind === 'lap' ? -square : square ** 2; }
      else { const k = kind === 'Dy' ? ky[i] : kx[i]; const power = k ** order; if (order === 1) q = power; if (order === 2) r = -power; if (order === 3) q = -power; if (order === 4) r = power; }
      const old = v.re[i]; v.re[i] = old * r - v.im[i] * q; v.im[i] = old * q + v.im[i] * r;
    }
    return physical(v);
  }
  return {size, n, ny, x, y, kx, ky, mask, edge, forward, physical, project, derivative};
}

// phi_j(z) = sum_{k >= 0} z^k/(k+j)!. Series avoids cancellation near zero.
export function phi(zr, zi, j) {
  let factorial = 1; for (let k = 2; k <= j; k++) factorial *= k;
  if (Math.hypot(zr, zi) <= 1) {
    let term = [1 / factorial, 0], total = [...term];
    for (let k = 1; k < 100; k++) {
      term = multiply(term, [zr / (k + j), zi / (k + j)]);
      total[0] += term[0]; total[1] += term[1];
      if (Math.hypot(...term) < 1e-17 * Math.max(1, Math.hypot(...total))) break;
    }
    return total;
  }
  let value = exponential(zr, zi), f = 1;
  for (let k = 1; k <= j; k++) { value = divide([value[0] - 1 / f, value[1]], [zr, zi]); f *= k; }
  return value;
}

function coefficients(symbol, h, grid) {
  const out = Object.fromEntries(['E', 'E2', 'Q', 'f1', 'f2', 'f3'].map(k => [k, complex(grid.size)]));
  for (let i = 0; i < grid.size; i++) {
    if (!grid.mask[i]) continue;
    const r = h * symbol.re[i], q = h * symbol.im[i];
    if (r > 30) throw Error('The linear growth within one time step is too large. Check derivative signs and reduce the time step.');
    const p1 = phi(r, q, 1), p2 = phi(r, q, 2), p3 = phi(r, q, 3), half = phi(r / 2, q / 2, 1);
    const values = {E: exponential(r, q), E2: exponential(r / 2, q / 2), Q: half.map(v => h / 2 * v), f1: [0, 1].map(k => h * (p1[k] - 3 * p2[k] + 4 * p3[k])), f2: [0, 1].map(k => h * (p2[k] - 2 * p3[k])), f3: [0, 1].map(k => h * (-p2[k] + 4 * p3[k]))};
    for (const key of Object.keys(out)) { out[key].re[i] = values[key][0]; out[key].im[i] = values[key][1]; }
  }
  return out;
}

function symbolFromTerms(terms, grid) {
  const result = complex(grid.size);
  for (const [px, py, c] of terms) for (let i = 0; i < grid.size; i++) {
    const magnitude = c * grid.kx[i] ** px * grid.ky[i] ** py;
    const order = (px + py) % 4;
    if (order === 0) result.re[i] += magnitude;
    if (order === 1) result.im[i] += magnitude;
    if (order === 2) result.re[i] -= magnitude;
    if (order === 3) result.im[i] -= magnitude;
  }
  return result;
}

export function validateConfig(raw) {
  if (!raw || typeof raw !== 'object') throw Error('Missing experiment configuration.');
  const c = {title: String(raw.title || 'Custom experiment').slice(0, 100), dimension: Number(raw.dimension), N: Number(raw.N), Lx: Number(raw.Lx), Ly: Number(raw.Ly ?? raw.Lx), T: Number(raw.T), dt: Number(raw.dt), frames: Number(raw.frames ?? 61), parameters: raw.parameters ?? '', boundary: raw.boundary ?? 'periodic'};
  if (![1, 2].includes(c.dimension)) throw Error('Choose a one- or two-dimensional domain.');
  if (!['periodic','nonperiodic','dirichlet','neumann','fourth-order'].includes(c.boundary)) throw Error('Choose periodic, Dirichlet/Neumann, or 1D fourth-order boundaries.');
  const defaultBoundary = c.boundary === 'neumann' ? 'neumann' : 'dirichlet';
  if(c.boundary !== 'periodic'&&c.boundary!=='fourth-order')c.boundary='nonperiodic';
  if(c.boundary==='fourth-order'&&c.dimension!==1)throw Error('Custom fourth-order boundary conditions currently require a 1D interval.');
  if (!Number.isInteger(c.N) || c.N < 16 || c.N > (c.dimension === 2 ? 128 : 1024) || (c.N & (c.N - 1))) throw Error('Use a power-of-two grid: 16–1024 in 1D, or 16–128 per axis in 2D.');
  if (![c.Lx, c.Ly].every(n => Number.isFinite(n) && n > 0 && n <= 10000)) throw Error('Domain lengths must be positive and at most 10000.');
  if (![c.T, c.dt].every(n => Number.isFinite(n) && n > 0) || c.T > 100000 || c.dt > c.T) throw Error('Require 0 < time step ≤ end time ≤ 100000.');
  if (!Number.isInteger(c.frames) || c.frames < 2 || c.frames > 121) throw Error('Choose 2–121 saved frames.');
  if (!Array.isArray(raw.fields) || raw.fields.length < 1 || raw.fields.length > 3) throw Error('Use one to three real-valued fields: u, v, w.');
  c.fields = raw.fields.map((f, i) => {
    if (!f || typeof f.rhs !== 'string' || typeof f.initial !== 'string' || (f.exact && typeof f.exact !== 'string')) throw Error('Every field needs a right-hand side and initial expression.');
    const field={name: FIELD_NAMES[i], rhs: f.rhs.trim(), initial: f.initial.trim(), exact: (f.exact || '').trim()};
    if(c.boundary !== 'periodic'){
      field.boundaries={};
      for(const side of sidesFor(c.dimension)){
        const bc=f.boundaries?.[side] ?? (['dirichlet','neumann'].includes(raw.boundary)?{type:defaultBoundary,value:'0'}:null);
        if(c.boundary==='fourth-order'){
          if(!bc||!Array.isArray(bc.conditions)||bc.conditions.length!==2)throw Error(`Specify two independent conditions on the ${side} endpoint of field ${field.name}.`);
          field.boundaries[side]={conditions:bc.conditions.map(row=>{
            if(!row||!Array.isArray(row.coefficients)||row.coefficients.length!==4||!row.coefficients.every(v=>typeof v==='string')||typeof row.value!=='string')throw Error('Each fourth-order boundary row needs four constant coefficient expressions and a target expression.');
            return {coefficients:row.coefficients.map(s=>s.trim()),value:row.value.trim()};
          })};
          continue;
        }
        if(!bc||!['dirichlet','neumann','robin'].includes(bc.type)||typeof bc.value!=='string')throw Error(`Specify the ${side} boundary of field ${field.name}.`);
        field.boundaries[side]={type:bc.type,value:bc.value.trim()};
        if(bc.type==='robin'){
          if(typeof bc.alpha!=='string'||typeof bc.beta!=='string')throw Error('Robin boundaries need alpha and beta coefficient expressions: alpha*u + beta*normal_derivative = value.');
          field.boundaries[side].alpha=bc.alpha.trim();field.boundaries[side].beta=bc.beta.trim();
        }
      }
    }
    return field;
  });
  const steps = Math.ceil(c.T / c.dt);
  if (steps > 40000 || steps * c.N ** c.dimension * c.fields.length > 90000000) throw Error('This run exceeds the browser work limit. Reduce duration or grid size, or increase the time step only after checking accuracy.');
  parseParameters(c.parameters);
  return c;
}

export function prepare(raw) {
  const config = validateConfig(raw);
  if(config.boundary==='fourth-order')return prepareFourth(config);
  if(config.boundary!=='periodic')return prepareBounded(config);
  const grid = makeGrid(config), parameters = parseParameters(config.parameters);
  const constants = {...parameters, Lx: config.Lx, Ly: config.Ly};
  const names = config.fields.map(f => f.name), space = ['x', ...(config.dimension === 2 ? ['y'] : []), ...Object.keys(constants)];
  const warnings = [], operators = [];
  const equations = config.fields.map(f => {
    const ast = parseExpression(f.rhs, [...space, 't', ...names]);
    if (config.dimension === 1 && /\bDy\s*\(/.test(f.rhs)) throw Error('Dy requires a two-dimensional domain.');
    const initial = parseExpression(f.initial, space), exact = f.exact ? parseExpression(f.exact, [...space, 't']) : null;
    if (derivativeOrder(initial) || (exact && derivativeOrder(exact))) throw Error('Initial and reference formulas must be explicit functions of coordinates, parameters and time, without derivative calls.');
    const split = splitLinear(ast, f.name, constants, config.dimension);
    if (derivativeOrder(split.remainder) >= 2) warnings.push(`${f.name}: coupled, variable-coefficient or nonlinear derivatives remain explicit. Time-step refinement is essential.`);
    const symbol = symbolFromTerms(split.terms, grid);
    let maxRate = -Infinity;
    for (let i = 0; i < grid.size; i++) if (grid.mask[i]) maxRate = Math.max(maxRate, symbol.re[i]);
    operators.push({field: f.name, terms: split.terms, maximumLinearRate: maxRate});
    return {ast, initial, exact, remainder: split.remainder, symbol};
  });
  return {config, grid, constants, equations, warnings, operators};
}

function check(values) {
  for (let i = 0; i < values.length; i++) if (!Number.isFinite(values[i]) || Math.abs(values[i]) > 1e8) throw Error('The computation became non-finite or exceeded the amplitude limit. Check the model and initial data, then reduce the time step. This is not evidence of mathematical blow-up.');
}

function combine(parts, size) {
  const out = complex(size);
  for (const [factor, vector, scale = 1] of parts) for (let i = 0; i < size; i++) {
    out.re[i] += scale * (factor.re[i] * vector.re[i] - factor.im[i] * vector.im[i]);
    out.im[i] += scale * (factor.re[i] * vector.im[i] + factor.im[i] * vector.re[i]);
  }
  check(out.re); check(out.im); return out;
}

export async function simulate(raw, progress = () => {}, yieldTask = () => Promise.resolve()) {
  const prepared=prepare(raw);
  if(prepared.config.boundary==='fourth-order')return simulateFourth(prepared,progress,yieldTask);
  if(prepared.config.boundary!=='periodic')return simulateBounded(prepared,progress,yieldTask);
  const {config, grid, constants, equations, warnings, operators} = prepared;
  const start = performance.now(), context = {...constants, x: grid.x, y: grid.y, t: 0};
  const steps = Math.ceil(config.T / config.dt), dt = config.T / steps;
  const coeff = equations.map(eq => coefficients(eq.symbol, dt, grid));
  let projectedInitialError = 0;
  let state = equations.map(eq => {
    let values = evaluate(eq.initial, context, grid); if (typeof values === 'number') values = new Float64Array(grid.size).fill(values);
    check(values);
    const spectral = grid.project(grid.forward(values)), projected = grid.physical(spectral);
    let diff = 0, sum = 0;
    for (let i = 0; i < grid.size; i++) { diff += (values[i] - projected[i]) ** 2; sum += values[i] ** 2; }
    projectedInitialError = Math.max(projectedInitialError, Math.sqrt(diff / Math.max(sum, 1e-30)));
    // Check boundary traces of the entered formula before periodic extension.
    for (const axis of config.dimension === 2 ? ['x', 'y'] : ['x']) for (let i = 0; i < 8; i++) {
      const point = {...constants, x: -config.Lx / 2 + config.Lx * i / 8, y: -config.Ly / 2 + config.Ly * i / 8};
      const length = axis === 'x' ? config.Lx : config.Ly;
      const a = evaluate(eq.initial, {...point, [axis]: -length / 2}), b = evaluate(eq.initial, {...point, [axis]: length / 2});
      if (!Number.isFinite(a) || !Number.isFinite(b)) throw Error('Initial data are not finite at a periodic boundary.');
      if (Math.abs(a - b) > 1e-5 * Math.max(1, Math.abs(a), Math.abs(b))) { warnings.push('Initial boundary values do not match. The solver uses a periodic extension; change the initial formula or domain.'); break; }
    }
    return spectral;
  });
  function nonlinear(v, time) {
    const ctx = {...context, t: time};
    v.forEach((s, j) => { ctx[config.fields[j].name] = grid.physical(s); check(ctx[config.fields[j].name]); });
    return equations.map(eq => {
      const values = evaluate(eq.remainder, ctx, grid);
      if (typeof values === 'number') { if (!Number.isFinite(values)) throw Error('The right-hand side is not finite. Check logarithms, square roots and division.'); } else check(values);
      return grid.project(grid.forward(values));
    });
  }
  const frameCount = Math.min(config.frames, steps + 1);
  const frames = [], saveSteps = new Set(Array.from({length: frameCount}, (_, i) => Math.round(i * steps / (frameCount - 1))));
  let maximumTail = 0;
  function save(time) {
    const values = state.map(s => grid.physical(s)), diagnostics = values.map((v, j) => {
      check(v); let sum = 0, squares = 0, min = Infinity, max = -Infinity, spectrum = 0, tail = 0;
      for (let i = 0; i < grid.size; i++) { sum += v[i]; squares += v[i] ** 2; min = Math.min(min, v[i]); max = Math.max(max, v[i]); const e = state[j].re[i] ** 2 + state[j].im[i] ** 2; spectrum += e; if (grid.edge[i]) tail += e; }
      const d = {mean: sum / grid.size, rms: Math.sqrt(squares / grid.size), min, max, tailFraction: tail / Math.max(spectrum, 1e-30)};
      maximumTail = Math.max(maximumTail, d.tailFraction);
      if (equations[j].exact) {
        const ref = evaluate(equations[j].exact, {...context, t: time}, grid);
        if (typeof ref === 'number' ? !Number.isFinite(ref) : Array.from(ref).some(a => !Number.isFinite(a))) throw Error('The reference formula is not finite.');
        let error = 0, norm = 0; for (let i = 0; i < grid.size; i++) { const r = typeof ref === 'number' ? ref : ref[i]; error += (v[i] - r) ** 2; norm += r ** 2; }
        d.referenceRmsError = Math.sqrt(error / grid.size); d.referenceRelativeL2 = norm > 1e-24 ? Math.sqrt(error / norm) : null;
      }
      return d;
    });
    frames.push({t: time, values: values.map(v => Array.from(v)), diagnostics});
  }
  save(0);
  let lastYield = performance.now();
  for (let step = 1; step <= steps; step++) {
    const t = (step - 1) * dt, nv = nonlinear(state, t);
    const a = state.map((v, j) => combine([[coeff[j].E2, v], [coeff[j].Q, nv[j]]], grid.size));
    const na = nonlinear(a, t + dt / 2);
    const b = state.map((v, j) => combine([[coeff[j].E2, v], [coeff[j].Q, na[j]]], grid.size));
    const nb = nonlinear(b, t + dt / 2);
    const c = state.map((_, j) => combine([[coeff[j].E2, a[j]], [coeff[j].Q, nb[j], 2], [coeff[j].Q, nv[j], -1]], grid.size));
    const nc = nonlinear(c, t + dt);
    state = state.map((v, j) => combine([[coeff[j].E, v], [coeff[j].f1, nv[j]], [coeff[j].f2, na[j], 2], [coeff[j].f2, nb[j], 2], [coeff[j].f3, nc[j]]], grid.size));
    if (saveSteps.has(step)) save(step * dt);
    if (performance.now() - lastYield > 80) { progress(step / steps); await yieldTask(); lastYield = performance.now(); }
  }
  if (projectedInitialError > 1e-3) warnings.push(`The initial projection removed ${(100 * projectedInitialError).toPrecision(3)}% in relative L2. Increase the grid or smooth the initial data.`);
  if (maximumTail > 1e-4) warnings.push('Significant energy reaches the highest retained modes. Increase spatial resolution and compare again.');
  warnings.push('A smooth animation does not certify convergence, well-posedness or nonlinear stability. Non-polynomial and higher-degree nonlinearities can still alias.');
  const referenceChecks = [];
  if (equations.every(eq => eq.exact)) {
    // This checks the supplied formula against the entered PDE independently of
    // the time trajectory, but uses numerical derivatives, not symbolic proof.
    try {
      const sample = (eq, time) => {
        const value = evaluate(eq.exact, {...context, t: time}, grid);
        const out = typeof value === 'number' ? new Float64Array(grid.size).fill(value) : value;
        check(out); return out;
      };
      const checks = equations.map((_, j) => ({field: config.fields[j].name, initialRmsMismatch: 0, maximumSampledRmsResidual: 0}));
      equations.forEach((eq, j) => {
        const ref = sample(eq, 0), initial = evaluate(eq.initial, context, grid);
        let total = 0; for (let i = 0; i < grid.size; i++) total += (ref[i] - (typeof initial === 'number' ? initial : initial[i])) ** 2;
        checks[j].initialRmsMismatch = Math.sqrt(total / grid.size);
      });
      const h = 1e-4 * Math.max(1, config.T);
      for (const time of [0, config.T / 2, config.T]) {
        const ctx = {...context, t: time}; equations.forEach((eq, j) => { ctx[config.fields[j].name] = sample(eq, time); });
        equations.forEach((eq, j) => {
          const a = sample(eq, time - 2*h), b = sample(eq, time - h), c = sample(eq, time + h), d = sample(eq, time + 2*h);
          const rhs = evaluate(eq.ast, ctx, grid); if (typeof rhs === 'number') {if (!Number.isFinite(rhs)) throw Error('Non-finite residual.');} else check(rhs);
          let squared = 0; for (let i = 0; i < grid.size; i++) squared += ((a[i]-8*b[i]+8*c[i]-d[i])/(12*h) - (typeof rhs === 'number' ? rhs : rhs[i])) ** 2;
          checks[j].maximumSampledRmsResidual = Math.max(checks[j].maximumSampledRmsResidual, Math.sqrt(squared / grid.size));
        });
      }
      referenceChecks.push(...checks);
    } catch {
      warnings.push('Reference residual sampling could not be completed near a time endpoint. It requires a finite, smooth reference formula on a small time neighborhood.');
    }
  }
  progress(1);
  return {schema: 'phaseatlas-studio/v1', solverVersion: SOLVER_VERSION, createdAt: new Date().toISOString(), method: METHOD, config, dt, steps, elapsedMs: performance.now() - start, operators, referenceChecks, initialProjectionRelativeL2: projectedInitialError, warnings: [...new Set(warnings)], frames};
}

export function compareResults(coarse, refined) {
  const a = coarse.config, b = refined.config;
  if (a.dimension !== b.dimension || b.N % a.N || a.Lx !== b.Lx || a.Ly !== b.Ly || a.T !== b.T || a.fields.length !== b.fields.length || a.boundary !== b.boundary || JSON.stringify(a.fields)!==JSON.stringify(b.fields)||a.parameters!==b.parameters) throw Error('Comparison requires matching equations, boundaries, domains, final time and nested grids.');
  const stride = b.N / a.N, last = coarse.frames.at(-1), fine = refined.frames.at(-1);
  return a.fields.map((field, f) => {
    let error = 0, norm = 0;
    for (let j = 0; j < (a.dimension === 2 ? a.N : 1); j++) for (let i = 0; i < a.N; i++) {
      let value;
      if(a.boundary==='periodic')value=fine.values[f][j*stride*b.N+i*stride];
      else {
        const x=(i+.5)*stride-.5,y=a.dimension===2?(j+.5)*stride-.5:0,x0=Math.floor(x),x1=Math.ceil(x),y0=Math.floor(y),y1=Math.ceil(y),sx=x-x0,sy=y-y0,v=fine.values[f];
        value=(1-sy)*((1-sx)*v[y0*b.N+x0]+sx*v[y0*b.N+x1])+sy*((1-sx)*v[y1*b.N+x0]+sx*v[y1*b.N+x1]);
      }
      const delta = last.values[f][j * a.N + i] - value;
      error += delta ** 2; norm += value ** 2;
    }
    return {field: field.name, rmsDifference: Math.sqrt(error / a.N ** a.dimension), relativeL2: norm > 1e-24 ? Math.sqrt(error / norm) : null};
  });
}
