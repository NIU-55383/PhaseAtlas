import test from 'node:test';
import assert from 'node:assert/strict';
import {simulate,prepare,compareResults,makeGrid} from '../dist/studio-solver.js';
const bc=(type,value='0')=>({type,value});
const edges=(type='dirichlet',value='0')=>Object.fromEntries(['left','right','bottom','top'].map(s=>[s,bc(type,value)]));
const config=(overrides={})=>({title:'Boundary benchmark',dimension:1,N:32,Lx:1,Ly:1,T:.2,dt:.001,frames:3,parameters:'nu=0.1',boundary:'nonperiodic',fields:[{rhs:'nu*lap(u)',initial:'sin(pi*(x+0.5))',exact:'exp(-nu*pi^2*t)*sin(pi*(x+0.5))',boundaries:edges()}],...overrides});
const error=r=>r.frames.at(-1).diagnostics[0].referenceRelativeL2;

test('Dirichlet diffusion converges at second order in space',async()=>{
  const a=await simulate(config({N:16,dt:.0002})),b=await simulate(config({N:32,dt:.0002}));
  assert.ok(error(a)/error(b)>3.9,`${error(a)} / ${error(b)}`);
  assert.ok(error(b)<.0002);assert.equal(b.frames.at(-1).boundaryFaces[0].left[0],0);
});
test('Neumann diffusion preserves mass and resolves the cosine mode',async()=>{
  const c=config({fields:[{rhs:'nu*lap(u)',initial:'2+cos(pi*(x+0.5))',exact:'2+exp(-nu*pi^2*t)*cos(pi*(x+0.5))',boundaries:edges('neumann')}]});
  const r=await simulate(c);assert.ok(error(r)<.0001);assert.ok(Math.abs(r.frames.at(-1).diagnostics[0].mass-2)<1e-10);assert.equal(r.frames.at(-1).diagnostics[0].boundaryMassRate,0);
});
test('mixed Dirichlet/Neumann edges reproduce a half-wave eigenmode',async()=>{
  const r=await simulate(config({fields:[{rhs:'nu*lap(u)',initial:'sin(pi*(x+0.5)/2)',exact:'exp(-nu*pi^2*t/4)*sin(pi*(x+0.5)/2)',boundaries:{left:bc('dirichlet'),right:bc('neumann')}}]}));
  assert.ok(error(r)<.00002,String(error(r)));
});
test('time-dependent nonzero Dirichlet data enter the implicit solve at the correct time',async()=>{
  const r=await simulate(config({N:16,dt:.02,fields:[{rhs:'nu*lap(u)+1',initial:'x+0.5',exact:'x+0.5+t',boundaries:{left:bc('dirichlet','t'),right:bc('dirichlet','1+t')}}]}));
  assert.ok(error(r)<1e-9,String(error(r)));assert.equal(r.frames.at(-1).boundaryFaces[0].right[0],1.2);
});
test('outward Neumann signs preserve a linear steady profile',async()=>{
  const r=await simulate(config({dt:.02,fields:[{rhs:'nu*lap(u)',initial:'x',exact:'x',boundaries:{left:bc('neumann','-1'),right:bc('neumann','1')}}]}));
  assert.ok(error(r)<1e-10);assert.ok(r.referenceChecks[0].maximumBoundaryMismatch<1e-9);
});
test('nonzero Neumann data produce the correct mass gain',async()=>{
  const r=await simulate(config({N:16,dt:.01,fields:[{rhs:'nu*lap(u)',initial:'x^2',exact:'x^2+2*nu*t',boundaries:edges('neumann','1')}]}));
  const initial=r.frames[0].diagnostics[0].mass,final=r.frames.at(-1).diagnostics[0];
  assert.ok(Math.abs(final.mass-initial-.04)<1e-9);assert.ok(Math.abs(final.boundaryMassRate-.2)<1e-12);assert.ok(error(r)<1e-8);
});
test('2D mixed edges preserve the intended sine-cosine eigenfunction',async()=>{
  const r=await simulate(config({dimension:2,N:16,T:.1,dt:.0005,fields:[{rhs:'nu*lap(u)',initial:'sin(pi*(x+0.5))*cos(pi*(y+0.5))',exact:'exp(-2*nu*pi^2*t)*sin(pi*(x+0.5))*cos(pi*(y+0.5))',boundaries:{left:bc('dirichlet'),right:bc('dirichlet'),bottom:bc('neumann'),top:bc('neumann')}}]}));
  assert.ok(error(r)<.0007,String(error(r)));
});
test('2D boundary formulas use tangential coordinates and time on every edge',async()=>{
  const r=await simulate(config({dimension:2,N:16,T:.1,dt:.01,fields:[{rhs:'nu*lap(u)+1',initial:'x*y',exact:'x*y+t',boundaries:{left:bc('dirichlet','-0.5*y+t'),right:bc('dirichlet','0.5*y+t'),bottom:bc('dirichlet','-0.5*x+t'),top:bc('dirichlet','0.5*x+t')}}]}));
  assert.ok(error(r)<1e-8,String(error(r)));assert.ok(r.referenceChecks[0].maximumBoundaryMismatch<1e-12);
});
test('anisotropic diffusion respects all outward Neumann normals on a rectangle',async()=>{
  const c=config({dimension:2,N:16,Lx:2,Ly:3,T:.1,dt:.01,fields:[{rhs:'0.2*Dx(u,2)+0.3*Dy(u,2)',initial:'x+y+x*y',exact:'x+y+x*y',boundaries:{left:bc('neumann','-1-y'),right:bc('neumann','1+y'),bottom:bc('neumann','-1-x'),top:bc('neumann','1+x')}}]});
  const a=await simulate(c),b=await simulate({...c,N:32});assert.ok(error(a)<1e-9);assert.ok(compareResults(a,b)[0].rmsDifference<1e-9);assert.ok(Math.abs(a.frames.at(-1).diagnostics[0].boundaryMassRate)<1e-12);
});
test('coupled fields retain separate boundary types and values',async()=>{
  const c=config({N:16,T:.1,fields:[{rhs:'0.1*lap(u)+v-u',initial:'x',exact:'x',boundaries:{left:bc('dirichlet','-0.5'),right:bc('dirichlet','0.5')}},{rhs:'0.2*lap(v)+u-v',initial:'x',exact:'x',boundaries:{left:bc('neumann','-1'),right:bc('neumann','1')}}]});
  const r=await simulate(c);for(const d of r.frames.at(-1).diagnostics)assert.ok(d.referenceRmsError<1e-10);
});
test('SBDF2 reaction has second-order temporal convergence',async()=>{
  const c=config({N:16,T:1,fields:[{rhs:'nu*lap(u)-u^2',initial:'1',exact:'1/(1+t)',boundaries:edges('neumann')}]});
  const a=await simulate({...c,dt:.04}),b=await simulate({...c,dt:.02});assert.ok(error(a)/error(b)>3.5,`${error(a)} / ${error(b)}`);
});
test('bounded first derivatives and nonlinear transport use Dirichlet data without wraparound',async()=>{
  const r=await simulate(config({N:16,dt:.001,fields:[{rhs:'nu*lap(u)-u*Dx(u,1)+u',initial:'x+0.5',exact:'x+0.5',boundaries:{left:bc('dirichlet'),right:bc('dirichlet','1')}}]}));
  assert.ok(error(r)<1e-9,String(error(r)));
});
test('cell-center refinement compares the same physical coordinates',async()=>{
  const c=config({N:16,fields:[{rhs:'nu*lap(u)',initial:'x+0.5',exact:'x+0.5',boundaries:{left:bc('dirichlet'),right:bc('dirichlet','1')}}]});
  const a=await simulate(c),b=await simulate({...c,N:32,dt:.0005});assert.ok(compareResults(a,b)[0].relativeL2<1e-10);assert.equal(makeGrid(a.config).x[0],-.5+1/32);
});
test('underspecified and unsupported non-periodic models are rejected, incompatible initial data are flagged',async()=>{
  for(const rhs of ['-biharm(u)','x*lap(u)','Dx(u^2,1)','-lap(u)','-Dx(u,1)'])assert.throws(()=>prepare(config({fields:[{rhs,initial:'0',boundaries:edges()}]})));
  assert.throws(()=>prepare(config({fields:[{rhs:'lap(u)',initial:'0'}]})),/boundary/);
  const r=await simulate(config({fields:[{rhs:'nu*lap(u)',initial:'1',boundaries:edges()}]}));assert.ok(r.warnings.some(w=>w.includes('Initial data do not match')));
});
