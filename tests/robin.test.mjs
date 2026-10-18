import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {simulate,prepare,makeGrid} from '../dist/studio-solver.js';
import {presetConfig} from '../dist/studio-presets.js';
import {boundaryData,boundedDerivative,boundaryFaces} from '../dist/studio-bounded.js';
import {balanceAudit,metricValue,sensitivityEstimate} from '../dist/research-audit.mjs';
import {buildPlan} from '../dist/research-core.mjs';
import {compareThree} from '../dist/evidence-core.mjs';
const robin=(alpha='1',beta='1',value='0')=>({type:'robin',alpha,beta,value});
const close=(a,b,t=1e-9)=>assert.ok(Math.abs(a-b)<t,`${a} versus ${b}; tolerance ${t}`);
const base=()=>({...presetConfig('robin-mode'),N:16,T:.2,dt:.0002,frames:11});
const error=r=>r.frames.at(-1).diagnostics[0].referenceRmsError;

test('Robin eigenmode converges at second order under spatial refinement',async()=>{
  const runs=[];for(const N of [16,32,64])runs.push(await simulate({...base(),N}));const p=compareThree(runs,'space').rows[0].observedOrder;
  assert.ok(error(runs[0])/error(runs[1])>3.8);assert.ok(error(runs[1])/error(runs[2])>3.8);close(p,2,.1);
  console.log('Robin spatial order:',p,'RMS errors:',runs.map(error));
});
test('Robin alpha=0 and beta=0 reduce to scaled Neumann and Dirichlet data',async()=>{
  for(const [id,a,b] of [['cooled-rod','3','0'],['insulated-rod','0','7']]){
    const c={...presetConfig(id),N:16,T:.1,dt:.001,frames:3},expected=await simulate(c),robinConfig=structuredClone(c);
    for(const side of ['left','right'])robinConfig.fields[0].boundaries[side]=robin(a,b,'0');
    const actual=await simulate(robinConfig);close(error(actual),error(expected),1e-11);
  }
});
test('inhomogeneous time-dependent Robin data preserve an affine manufactured solution and signs',async()=>{
  const c={...base(),dt:.01,fields:[{rhs:'nu*lap(u)+1',initial:'x+2',exact:'x+2+t',boundaries:{left:robin('2','3','2*(x+2+t)-3'),right:robin('4','0.5','4*(x+2+t)+0.5')}}]},r=await simulate(c);
  assert.ok(error(r)<1e-9);assert.ok(r.referenceChecks[0].maximumBoundaryMismatch<1e-9);const audit=balanceAudit(r);
  close(audit.rows.at(-1).massChange,.4);close(audit.rows.at(-1).integratedInput,.4);assert.ok(audit.maximumAbsoluteDefect<1e-9);close(audit.rows[0].sideRates.left,-.1);close(audit.rows[0].sideRates.right,.1);
});
test('2D mixed Robin faces handle tangential data and anisotropic diffusion',async()=>{
  const c={...base(),dimension:2,N:16,Lx:2,Ly:3,T:.1,dt:.005,fields:[{rhs:'0.2*Dx(u,2)+0.3*Dy(u,2)+1',initial:'x+y+x*y+3',exact:'x+y+x*y+3+t',boundaries:{left:robin('2','1','2*(x+y+x*y+3+t)-(1+y)'),right:{type:'dirichlet',value:'x+y+x*y+3+t'},bottom:{type:'neumann',value:'-1-x'},top:robin('1','2','x+y+x*y+3+t+2*(1+x)')}}]};
  const r=await simulate(c),audit=balanceAudit(r);assert.ok(error(r)<1e-8);assert.ok(audit.maximumAbsoluteDefect<1e-8);assert.ok(audit.maximumOperatorClosure<1e-11);close(audit.rows.at(-1).massChange,.6,1e-8);
});
test('quadratic first-derivative closure honors Robin conditions at both boundary centers',()=>{
  const c={...base(),fields:[{rhs:'nu*lap(u)',initial:'x^2+2',boundaries:{left:robin('2','1','2*(x^2+2)-2*x'),right:robin('2','1','2*(x^2+2)+2*x')}}]},p=prepare(c),g=p.grid,v=Float64Array.from(g.x,x=>x*x+2),d=boundedDerivative(v,'Dx',1,0,p,boundaryData(p,0));
  d.forEach((a,i)=>close(a,2*g.x[i],1e-12));
});
test('passive Robin restrictions and coefficient normalization are explicit',async()=>{
  for(const [a,b] of [['0','0'],['-1','1'],['1','-1'],['exp(1000)','1'],['t','1'],['x','1']]){const c=base();c.fields[0].boundaries.left=robin(a,b);assert.throws(()=>prepare(c));}
  const c=base();c.fields[0].boundaries={left:robin('1e200','1e200','1e200'),right:robin('1e200','1e200','1e200')};c.fields[0].initial='1';c.fields[0].exact='1';const r=await simulate(c);assert.ok(error(r)<1e-11);
});
test('coupled fields retain separate Robin and insulating conditions',async()=>{
  const c={...base(),fields:[{rhs:'nu*lap(u)+v-u',initial:'2',exact:'2',boundaries:{left:robin('2','3','4'),right:robin('1','1','2')}},{rhs:'nu*lap(v)+u-v',initial:'2',exact:'2',boundaries:{left:{type:'neumann',value:'0'},right:{type:'neumann',value:'0'}}}]},r=await simulate(c);
  r.frames.at(-1).diagnostics.forEach(d=>assert.ok(d.referenceRmsError<1e-11));assert.ok(balanceAudit(r,1).maximumAbsoluteDefect<1e-10);
});
test('balance defect improves with denser saved-time sampling and ignores imported diagnostics',async()=>{
  const fine=await simulate({...base(),T:2,frames:101,dt:.0005}),coarse=structuredClone(fine);coarse.frames=coarse.frames.filter((_,i)=>i%25===0);
  const a=balanceAudit(fine),b=balanceAudit(coarse);assert.ok(a.maximumAbsoluteDefect<b.maximumAbsoluteDefect/20,`${a.maximumAbsoluteDefect} versus ${b.maximumAbsoluteDefect}`);
  fine.frames.forEach(f=>{f.diagnostics=[{mass:999,boundaryMassRate:999}];});close(balanceAudit(fine).maximumAbsoluteDefect,a.maximumAbsoluteDefect,1e-15);
  assert.ok(a.rows.at(-1).boundaryRate<0);assert.ok(a.maximumOperatorClosure<1e-12);assert.ok(a.maximumBoundaryResidual<1e-14);
});
test('a flux operator identity does not mask a deliberately corrupted trajectory',async()=>{
  const r=await simulate(base());r.frames.at(-1).values[0]=r.frames.at(-1).values[0].map(v=>v+.3);
  const a=balanceAudit(r);assert.ok(a.maximumAbsoluteDefect>.5);assert.ok(a.maximumOperatorClosure<1e-12);
});
test('custom map statistics, temporal reductions and threshold events use saved values',async()=>{
  const r=await simulate({...base(),T:1,dt:.01,fields:[{rhs:'nu*lap(u)+1',initial:'0',boundaries:{left:{type:'neumann',value:'0'},right:{type:'neumann',value:'0'}}}]});
  const metric=(reduction,more={})=>metricValue(r,{expression:'u',statistic:'mean',reduction,...more});
  close(metric('final').value,1);close(metric('change').value,1);close(metric('maximum').value,1);close(metric('time-average').value,.5);
  close(metric('first-crossing',{threshold:.37,direction:'above'}).value,.37);assert.equal(metric('first-crossing',{threshold:2}).value,null);
  close(metricValue(r,{expression:'u^2',statistic:'integral',reduction:'final'}).value,2);
  close(metricValue(r,{expression:'u',statistic:'point',reduction:'final',x:.1}).value,1);
  assert.throws(()=>metricValue(r,{expression:'sqrt(-1)'}));assert.ok(metricValue(r,{kind:'balance'}).value<1e-9);
});
test('finite-difference sensitivities expose missing neighbors instead of extrapolating',()=>{
  const plan=buildPlan({...base(),parameters:'nu=.1;k=1'},'sweep',{xParameter:'nu',xMin:.1,xMax:.3,xCount:3,yParameter:'k',yMin:.5,yMax:1.5,yCount:3});
  for(const j of plan.jobs){j.status='complete';j.metric={value:3*j.coordinates.x-2*j.coordinates.y};}
  const rows=sensitivityEstimate(plan,j=>j.metric);rows.forEach(r=>{close(r.x,3);close(r.y,-2);});assert.equal(rows[4].schemeX,'centered secant');assert.equal(rows[0].schemeY,'one-sided secant');
  plan.jobs[1].status='failed';const missing=sensitivityEstimate(plan,j=>j.metric);assert.equal(missing[0].x,null);assert.equal(missing[4].y,null);assert.equal(missing[1].x,null);
});
test('wave metrics withhold ambiguous events and reject unsupported balance domains',async()=>{
  const r=await simulate({...presetConfig('heat'),N:64,T:.1,dt:.01,frames:3});assert.equal(metricValue(r,{kind:'wave',waveMetric:'speed',wave:{level:0,center:0,radius:2,maxShift:.2}}).value,null);
  assert.throws(()=>balanceAudit(r),/second-order bounded/);
});

if(process.env.PHASEATLAS_REFERENCE_FIXTURES){
  await fs.mkdir('qa/robin-reference',{recursive:true});
  for(const [name,c] of Object.entries({mode:{...base(),N:32,T:.3,dt:.0002},affine:{...base(),N:16,T:.1,dt:.002,fields:[{rhs:'nu*lap(u)+1',initial:'x+2',exact:'x+2+t',boundaries:{left:robin('2','3','2*(x+2+t)-3'),right:robin('4','.5','4*(x+2+t)+.5')}}]}})){
    await fs.writeFile(`qa/robin-reference/${name}.json`,JSON.stringify(await simulate(c)));
  }
}
