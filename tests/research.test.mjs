import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPlan,setParameter,seriesValues,makeObserver,samplePoint,observationHistory,waveDiagnostics,gaussianSeed} from '../dist/research-core.mjs';
import {simulate,prepare,makeGrid} from '../dist/studio-solver.js';
import {presetConfig} from '../dist/studio-presets.js';
import {parseExpression,evaluate} from '../dist/studio-expression.js';
import {compareThree,statistics} from '../dist/evidence-core.mjs';
const close=(a,b,tol=1e-9)=>assert.ok(Math.abs(a-b)<=tol,`${a} versus ${b} (tol ${tol})`);
const rod={...presetConfig('cooled-rod'),N:16,T:.25,dt:.0005,frames:5};
function fixture(raw,fn){const c=prepare(raw).config,g=makeGrid(c),times=[0,c.T/2,c.T];return {schema:'phaseatlas-studio/v1',solverVersion:'analytic-test-fixture',method:'analytic samples, not a numerical solve',config:c,dt:c.T/10,steps:10,frames:times.map(t=>({t,values:[Array.from(g.x,(x,i)=>fn(x,t,g.y[i]))]}))};}

test('parameter replacement recalculates later dependencies and rejects missing parameters',()=>{
  assert.equal(setParameter('nu=.1; c=2*nu','nu',.25),'nu = 0.25; c=2*nu');
  assert.throws(()=>setParameter('nu=.1','x',1),/Define parameter/);assert.throws(()=>setParameter('nu=.1','nu',Infinity),/finite/);
  assert.deepEqual(seriesValues(-1,1,3),[-1,0,1]);assert.throws(()=>seriesValues(1,0,3));
});
test('spatial plan yields second order for a Dirichlet heat benchmark',async()=>{
  const plan=buildPlan(rod,'space'),runs=[];for(const j of plan.jobs)runs.push(await simulate(j.config));
  const report=compareThree(runs,'space');assert.deepEqual(report.grids,[16,32,64]);assert.ok(report.timeSteps.every(d=>d===.0005));close(report.rows[0].observedOrder,2,.02);
  console.log('Dirichlet spatial observed order:',report.rows[0].observedOrder);
});
test('temporal plan isolates SBDF2 time accuracy on a fixed grid',async()=>{
  const plan=buildPlan({...rod,N:32,T:1,dt:.04},'time'),runs=[];for(const j of plan.jobs)runs.push(await simulate(j.config));
  const report=compareThree(runs,'time');assert.deepEqual(report.grids,[32,32,32]);close(report.rows[0].observedOrder,2,.1);console.log('Dirichlet temporal observed order:',report.rows[0].observedOrder);
});
test('scan retains inadmissible cells for explicit failures and caps total work',()=>{
  const p=buildPlan(rod,'sweep',{xParameter:'nu',xMin:-.1,xMax:.1,xCount:3});assert.equal(p.jobs.length,3);assert.throws(()=>prepare(p.jobs[0].config));
  assert.throws(()=>buildPlan({...rod,N:512},'space'),/grid limit/);
  assert.throws(()=>buildPlan(rod,'sweep',{xParameter:'nu',yParameter:'nu',xMin:0,xMax:1,xCount:2,yMin:0,yMax:1,yCount:2}),/different parameters/);
});
test('periodic observable derivatives match analytic fields and constants',()=>{
  const e=fixture({...presetConfig('heat'),N:64},x=>Math.sin(x));
  const v=makeObserver(e,'Dx(u,1)^2+u^2')(e.frames[0]);close(statistics(v).mean,1);assert.ok(v.every(x=>Math.abs(x-1)<1e-10));
  assert.ok(makeObserver(e,'2')(e.frames[0]).every(x=>x===2));
  assert.throws(()=>makeObserver(e,'sqrt(-1)')(e.frames[0]),/non-finite/);
});
test('bounded observer uses boundary data and rejects unimplemented derivative compositions',()=>{
  const e=fixture({...rod,N:64},x=>Math.sin(Math.PI*(x+.5))),x=makeGrid(e.config).x;
  const dx=makeObserver(e,'Dx(u,1)')(e.frames[0]);assert.ok(Math.max(...dx.map((v,i)=>Math.abs(v-Math.PI*Math.cos(Math.PI*(x[i]+.5)))))<.002);
  assert.throws(()=>makeObserver(e,'Dx(u^2,1)'),/directly/);assert.throws(()=>makeObserver(e,'Dx(u,3)'),/Unsupported/);
});
test('fourth-order observation uses manufactured clamped boundary reconstruction',()=>{
  const e=fixture({...presetConfig('biharmonic-clamped'),N:32},(x,t)=>(1-4*x*x)**2*Math.exp(-t));
  const v=makeObserver(e,'Dx(u,4)')(e.frames[0]);assert.ok(Math.max(...v.map(x=>Math.abs(x-384)))<1e-6);
});
test('probe interpolation wraps periodic boundaries and clamps bounded half-cell strips',()=>{
  const periodic=prepare({...presetConfig('heat'),N:16}).config,values=Array.from({length:16},(_,i)=>i);
  close(samplePoint(values,periodic,periodic.Lx/2),0);close(samplePoint(values,periodic,-periodic.Lx/2),0);
  const bounded=prepare(rod).config;close(samplePoint(values,bounded,-.5),0);close(samplePoint(values,bounded,.5),15);
  assert.throws(()=>samplePoint(values,bounded,1),/outside/);
});
test('2D probes and integral observations use physical coordinates and volume',()=>{
  const c={...presetConfig('heated-plate'),N:16,T:.1},e=fixture(c,(x,t,y)=>3+2*x-y),g=makeGrid(e.config);
  close(samplePoint(e.frames[0].values[0],e.config,.13,.12),3+.26-.12);
  close(observationHistory(e,'u','integral')[0].value,6);close(observationHistory(e,'x','mean')[0].value,0);
});
test('bounded translated front has accurate shift and tiny aligned residual',()=>{
  const e=fixture({...rod,N:256,Lx:20,T:.4},(x,t)=>Math.tanh(x-.5*t));
  const d=waveDiagnostics(e,0,{level:0,center:0,radius:4,eta:0,maxShift:1});
  close(d.rows.at(-1).shift,.2,.002);close(d.rows.at(-1).speed,.5,.003);assert.ok(d.rows.at(-1).alignedRms<.001);assert.ok(d.rows.at(-1).globalL2>.1);
});
test('shape change survives alignment and constrained shift is flagged',()=>{
  const c={...rod,N:256,Lx:20,T:.4},e=fixture(c,(x,t)=>(1+t)*Math.tanh(x));
  const d=waveDiagnostics(e,0,{level:0,center:0,radius:4,maxShift:.5});assert.ok(d.rows.at(-1).alignedRms>.2);
  const shifted=fixture(c,(x,t)=>Math.tanh(x-4*t)),limited=waveDiagnostics(shifted,0,{level:0,center:0,radius:4,maxShift:.5});assert.equal(limited.rows.at(-1).atSearchLimit,true);
});
test('constant fields and periodic ambiguous crossings do not yield spurious speeds',()=>{
  const flat=fixture({...rod,N:128,Lx:20},()=>.5),d=waveDiagnostics(flat,0,{level:.5,center:0,radius:4,maxShift:1});assert.ok(d.rows.every(r=>r.position===null&&r.shift===null&&r.speed===null));
  const e=fixture({...presetConfig('heat'),N:64},(x,t)=>Math.sin(x+.01-t)),a=waveDiagnostics(e,0,{level:0,center:0,radius:2,maxShift:.2});assert.ok(a.rows.every(r=>r.crossings===2&&r.position===null&&r.speed===null));
});
test('Fourth-order numerical front retains supplied-reference and wave diagnostics',async()=>{
  const e=await simulate({...presetConfig('fourth-order-front'),N:256,T:.005,dt:.00001,frames:5});
  const d=waveDiagnostics(e,0,{reference:'formula',level:.5,center:0,radius:5,maxShift:.5,eta:0});
  assert.ok(d.rows.at(-1).localL2<.002);close(d.rows.at(-1).speed,105/8,.15);assert.ok(d.rows.at(-1).alignedRms<.001);
  console.log('Fourth-order speed:',d.rows.at(-1).speed,'reference local L2:',d.rows.at(-1).localL2);
});
test('periodic initial seed is continuous at the seam and clears reference only for edited field',()=>{
  const c=prepare({...presetConfig('heat'),N:64}).config,next=gaussianSeed(c,0,3,0,.2,.3);
  assert.equal(next.fields[0].exact,'');assert.notEqual(c.fields[0].exact,'');assert.notEqual(c.fields[0].initial,next.fields[0].initial);
  const e={config:next},obs=makeObserver(e,next.fields[0].initial),g=makeGrid(next);assert.ok(obs({t:0,values:[Array.from(g.x,Math.sin)]}).every(Number.isFinite));
  const ast=parseExpression(next.fields[0].initial,['x']),a=evaluate(ast,{x:-c.Lx/2},{size:1}),b=evaluate(ast,{x:c.Lx/2},{size:1});close(typeof a==='number'?a:a[0],typeof b==='number'?b:b[0],1e-12);
  assert.throws(()=>gaussianSeed(prepare(rod).config,0,0,0,.2,.3),/periodic/);
});
test('two-parameter scans preserve every axis pair and original initial data',()=>{
  const c={...presetConfig('advection2d'),N:16,T:.1,dt:.01,frames:5},p=buildPlan(c,'sweep',{xParameter:'nu',xMin:.1,xMax:.2,xCount:2,yParameter:'cx',yMin:0,yMax:2,yCount:3});
  assert.equal(p.jobs.length,6);assert.deepEqual(p.jobs.map(j=>[j.coordinates.x,j.coordinates.y]),[[.1,0],[.2,0],[.1,1],[.2,1],[.1,2],[.2,2]]);
  assert.ok(p.jobs.every(j=>j.config.fields[0].initial===c.fields[0].initial));
});
