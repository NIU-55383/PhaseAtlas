import test from 'node:test';
import assert from 'node:assert/strict';
import {simulate,prepare,compareResults} from '../dist/studio-solver.js';
import {factorFourth,solveFourth,boundaryClosure} from '../dist/studio-fourth.js';
import {presetConfig} from '../dist/studio-presets.js';
const row=(order,value='0')=>({coefficients:[0,1,2,3].map(k=>k===order?'1':'0'),value});
const pair=(a,b,va='0',vb='0')=>({conditions:[row(a,va),row(b,vb)]});
const error=r=>r.frames.at(-1).diagnostics[0].referenceRelativeL2;
const cfg=()=>({...presetConfig('biharmonic-supported'),N:32,T:.1,dt:.0001,frames:3});

test('fourth-order band factorization handles row pivoting and checks its residual',()=>{
  const M=[[0,2,0,0],[1,3,4,0],[0,5,6,7],[0,0,8,9]],x=[1,-2,3,-4],rhs=Float64Array.from(M,r=>r.reduce((s,v,i)=>s+v*x[i],0));
  const A=M.map((r,i)=>new Map(r.map((v,j)=>[j,(i===j?1:0)-v]).filter(([j,v])=>v!==0))),factor=factorFourth(A,1,1),result=solveFourth(factor,rhs);
  assert.ok(factor.pivots.some((p,i)=>p!==i));result.values.forEach((v,i)=>assert.ok(Math.abs(v-x[i])<1e-12));assert.ok(result.backwardError<1e-14);
});
test('quartic reconstruction respects nonzero outward-derivative conventions',()=>{
  const h=.1,weights=[[1,2,0,0],[0,0,1,1]],c=boundaryClosure(weights,h),f=r=>2+3*r+4*r*r+5*r**3+6*r**4;
  const traces=[2,-3/h,8/h**2,-30/h**3],input=[f(.5),f(1.5),f(2.5),...weights.map(w=>w.reduce((s,v,i)=>s+v*traces[i],0))];
  c.ghosts.forEach((w,i)=>assert.ok(Math.abs(w.reduce((s,v,k)=>s+v*input[k],0)-f(-.5-i))<1e-9));
});
test('supported biharmonic diffusion converges with spatial refinement',async()=>{
  const a=await simulate({...cfg(),N:16}),b=await simulate(cfg()),c=await simulate({...cfg(),N:64});
  assert.ok(error(a)/error(b)>3.5,`${error(a)}/${error(b)}`);assert.ok(error(b)/error(c)>3.7);assert.ok(error(c)<.00005);
});
test('clamped manufactured solution exhibits second-order temporal convergence',async()=>{
  const c={...presetConfig('biharmonic-clamped'),N:32,T:.2,frames:3};
  const a=await simulate({...c,dt:.004}),b=await simulate({...c,dt:.002});assert.ok(error(a)/error(b)>3.4,`${error(a)}/${error(b)}`);assert.ok(b.maximumBoundaryConstraintResidual<1e-9);
});
test('zero first and third normal derivatives preserve mass for biharmonic diffusion',async()=>{
  const r=await simulate({...presetConfig('biharmonic-flux'),N:32,T:.1,dt:.0001,frames:3});
  assert.ok(error(r)<.0001);assert.ok(Math.abs(r.frames.at(-1).diagnostics[0].mean-1)<1e-10);
  assert.ok(r.initialBoundaryMismatch[0]<1e-5, String(r.initialBoundaryMismatch[0]));
  assert.ok(!r.warnings.some(w=>w.includes('Initial data may not match')));
  const incompatible=presetConfig('biharmonic-flux');incompatible.N=32;incompatible.T=.001;incompatible.dt=.001;incompatible.fields[0].initial='1+x';
  assert.ok((await simulate(incompatible)).warnings.some(w=>w.includes('Initial data may not match')));
});
test('free endpoint conditions preserve an affine state',async()=>{
  const c=cfg();c.fields=[{rhs:'-kappa*Dx(u,4)',initial:'0.2+x',exact:'0.2+x',boundaries:{left:pair(2,3),right:pair(2,3)}}];
  const r=await simulate(c);assert.ok(error(r)<1e-9);
});
test('nonzero third normal derivatives give the expected biharmonic mass change',async()=>{
  const c=cfg();c.fields=[{rhs:'-kappa*Dx(u,4)',initial:'x^4',exact:'x^4-24*kappa*t',boundaries:{left:pair(1,3,'0.5','12'),right:pair(1,3,'0.5','12')}}];
  const r=await simulate(c);assert.ok(error(r)<1e-8);assert.ok(Math.abs(r.frames.at(-1).diagnostics[0].mass-r.frames[0].diagnostics[0].mass+24*.01*.1)<1e-10);
});
test('time-dependent mixed linear boundary rows retain dispersion signs',async()=>{
  const c=cfg();c.dt=.005;c.fields=[{rhs:'-kappa*Dx(u,4)+0.3*Dx(u,3)-0.2*Dx(u,2)-0.8+1.2*x',initial:'x^3',exact:'x^3+t',boundaries:{left:{conditions:[{coefficients:['1','2','0','0'],value:'t-1.625'},{coefficients:['0','0','1','1'],value:'-9'}]},right:pair(0,3,'0.125+t','6')}}];
  const a=await simulate(c),b=await simulate({...c,N:64,dt:.0025});assert.ok(error(a)<1e-8,String(error(a)));assert.ok(compareResults(a,b)[0].relativeL2<.001);assert.ok(a.maximumBoundaryConstraintResidual<1e-8);
});
test('nonlinear conservative flux expressions use reconstructed boundary fields',async()=>{
  const c=cfg();c.dt=.001;c.fields=[{rhs:'-kappa*Dx(u,4)-Dx(u^2/2,1)+1+u',initial:'1+x',exact:'1+x+t',boundaries:{left:pair(0,1,'0.5+t','-1'),right:pair(0,1,'1.5+t','1')}}];
  const a=await simulate({...c,dt:.002}),b=await simulate(c);assert.ok(error(a)/error(b)>3.5);assert.ok(error(b)<1e-6,String(error(b)));
});
test('MAE03 travelling-front error decreases on a finer grid',async()=>{
  const c={...presetConfig('mae03-front'),N:128,T:.01,dt:.000025,frames:3};
  const a=await simulate(c),b=await simulate({...c,N:256});assert.ok(error(a)/error(b)>3.5,`${error(a)}/${error(b)}`);assert.ok(error(b)<.0001,String(error(b)));
});
test('invalid fourth-order boundary specifications fail explicitly',()=>{
  const c=cfg();
  assert.throws(()=>prepare({...c,dimension:2}),/1D/);
  assert.throws(()=>prepare({...c,fields:[{...c.fields[0],rhs:'kappa*Dx(u,4)'}]}),/negative/);
  assert.throws(()=>prepare({...c,fields:[{...c.fields[0],rhs:'-x*Dx(u,4)'}]}),/negative|constant/);
  assert.throws(()=>prepare({...c,fields:[{...c.fields[0],boundaries:{left:pair(0,0),right:pair(0,1)}}]}),/dependent|singular/);
  assert.throws(()=>prepare({...c,fields:[{...c.fields[0],boundaries:{left:{conditions:[row(0)]},right:pair(0,1)}}]}),/two independent/);
});
