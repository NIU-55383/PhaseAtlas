import test from 'node:test';
import assert from 'node:assert/strict';
import {parseExpression, evaluate, parseParameters} from '../dist/studio-expression.js';
import {fft, makeGrid, prepare, simulate, compareResults, phi} from '../dist/studio-solver.js';
import {presetConfig} from '../dist/studio-presets.js';
const relative = result => result.frames.at(-1).diagnostics[0].referenceRelativeL2;

test('parser honors mathematical precedence and rejects executable syntax', () => {
  assert.equal(evaluate(parseExpression('-2^2 + 2^-2'), {}), -3.75);
  assert.equal(evaluate(parseExpression('2^3^2'), {}), 512);
  assert.equal(parseParameters('nu=1/4; c=2*nu').c, .5);
  for (const expression of ['alert(1)', 'u.constructor', 'fetch(x)', 'u; x', 'globalThis', 'Dx(u,5)', 'lap(biharm(u))']) assert.throws(() => parseExpression(expression, ['u', 'x']));
  assert.throws(() => parseParameters('x=1'));
  assert.throws(() => parseParameters('nu=0; nu=1'));
  assert.throws(() => parseExpression('('.repeat(100) + '1' + ')'.repeat(100)));
});

test('FFT round trip and two-dimensional mixed derivative', () => {
  const re = Float64Array.from({length: 32}, (_, j) => Math.sin(j) + Math.cos(2*j)), original = re.slice(), im = new Float64Array(32);
  fft(re, im); fft(re, im, true);
  assert.ok(Math.max(...re.map((v, i) => Math.abs(v-original[i]))) < 1e-13);
  const grid = makeGrid({...presetConfig('advection2d'), N: 32});
  const values = grid.x.map((x, i) => Math.sin(2*x)*Math.cos(3*grid.y[i]));
  const lap = grid.derivative(values, 'lap');
  assert.ok(Math.max(...lap.map((v, i) => Math.abs(v+13*values[i]))) < 2e-12);
});

test('ETD phi functions handle zero and complex arguments', () => {
  assert.deepEqual(phi(0, 0, 1), [1, 0]);
  assert.deepEqual(phi(0, 0, 2), [.5, 0]);
  assert.ok(Math.abs(phi(0, 0, 3)[0]-1/6) < 1e-16);
  for (const r of [-100, -1.001, -1, -1e-8]) assert.ok(Math.abs(phi(r,0,1)[0]-Math.expm1(r)/r) < 1e-14);
  assert.ok(Math.abs(phi(0,2,1)[0]-Math.sin(2)/2) < 1e-14);
});

test('periodic heat benchmark integrates linear modes to roundoff', async () => {
  const r = await simulate({...presetConfig('heat'), N: 32});
  assert.ok(relative(r) < 1e-12, String(relative(r)));
  assert.equal(r.frames.length, 61);
  assert.equal(r.frames.at(-1).t, r.config.T);
  assert.equal(r.referenceChecks[0].initialRmsMismatch, 0);
  assert.ok(r.referenceChecks[0].maximumSampledRmsResidual < 1e-8);
});

test('a wrong reference is exposed by a sampled PDE residual', async () => {
  const r = await simulate({...presetConfig('heat'), N: 32, fields: [{rhs: 'nu*lap(u)', initial: 'sin(x)', exact: 'exp(nu*t)*sin(x)'}]});
  assert.ok(r.referenceChecks[0].maximumSampledRmsResidual > .3);
});

test('third-order dispersion has the correct Fourier sign', async () => {
  const r = await simulate({...presetConfig('heat'), N: 32, parameters: '', T: .7, dt: .1, fields: [{rhs: '-Dx(u,3)', initial: 'sin(x)', exact: 'sin(x+t)'}]});
  assert.ok(relative(r) < 1e-12, String(relative(r)));
});

test('2D advection diffusion resolves both derivative directions', async () => {
  const r = await simulate({...presetConfig('advection2d'), N: 16, T: 1, dt: .1, frames: 3});
  assert.ok(relative(r) < 1e-12, String(relative(r)));
});

test('nonlinear logistic reaction exhibits fourth-order time convergence', async () => {
  const c = {...presetConfig('heat'), N: 16, T: 2, parameters: '', frames: 2, fields: [{rhs: 'u-u^2', initial: '0.2', exact: '1/(1+4*exp(-t))'}]};
  const a = await simulate({...c, dt: .2}), b = await simulate({...c, dt: .1});
  assert.ok(relative(a)/relative(b) > 12, `${relative(a)} / ${relative(b)}`);
});

test('non-autonomous forcing uses stage times', async () => {
  const r = await simulate({...presetConfig('heat'), N: 16, parameters: '', T: 1, dt: .05, frames: 2, fields: [{rhs: 't^3+0*u', initial: '1', exact: '1+t^4/4'}]});
  assert.ok(relative(r) < 1e-13);
});

test('coupled wave system matches its exact standing wave', async () => {
  const r = await simulate({...presetConfig('wave'), N: 32, T: 1, dt: .01, frames: 3});
  assert.ok(relative(r) < 2e-9, String(relative(r)));
  assert.ok(r.warnings.some(s => s.includes('remain explicit')));
});

test('fourth-order nonlinear conservative PDE preserves its spatial mean', async () => {
  const r = await simulate({...presetConfig('cahn'), N: 16, T: .1, dt: .005, frames: 3});
  const drift = r.frames.at(-1).diagnostics[0].mean-r.frames[0].diagnostics[0].mean;
  assert.ok(Math.abs(drift) < 1e-13);
});

test('nested-grid comparison samples coincident physical points in 2D', async () => {
  const a = await simulate({...presetConfig('advection2d'), N: 16, T: .2, dt: .1, frames: 2});
  const b = await simulate({...a.config, N: 32, dt: .05});
  assert.ok(compareResults(a,b)[0].relativeL2 < 1e-12);
});

test('unsupported inputs fail explicitly, and divergent runs do not fabricate output', async () => {
  assert.throws(() => prepare({...presetConfig('heat'), boundary: 'dirichlet'}), /periodic/);
  assert.throws(() => prepare({...presetConfig('heat'), fields: [{rhs: 'Dy(u,1)', initial: 'sin(x)'}]}), /two-dimensional/);
  await assert.rejects(() => simulate({...presetConfig('heat'), fields: [{rhs: 'log(-1)', initial: '0'}]}), /finite/);
  await assert.rejects(() => simulate({...presetConfig('heat'), dt: .1, fields: [{rhs: '-lap(u)', initial: 'sin(x)'}]}), /growth/);
});
