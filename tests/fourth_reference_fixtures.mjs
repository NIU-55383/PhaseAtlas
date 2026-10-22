import fs from 'node:fs/promises';
import {simulate} from '../dist/studio-solver.js';
import {presetConfig} from '../dist/studio-presets.js';
await fs.mkdir('research/validation',{recursive:true});
const row=(k,value='0')=>({coefficients:[0,1,2,3].map(j=>j===k?'1':'0'),value});
const pair=(a,b,va='0',vb='0')=>({conditions:[row(a,va),row(b,vb)]});
const base={...presetConfig('biharmonic-supported'),N:32,T:.1,dt:.0005};
const cases=[
  ['supported',base],
  ['clamped',{...presetConfig('biharmonic-clamped'),N:32,T:.1,dt:.0005}],
  ['custom-time',{...base,dt:.002,fields:[{rhs:'-kappa*Dx(u,4)+0.3*Dx(u,3)-0.2*Dx(u,2)-0.8+1.2*x',initial:'x^3',exact:'x^3+t',boundaries:{left:{conditions:[{coefficients:['1','2','0','0'],value:'t-1.625'},{coefficients:['0','0','1','1'],value:'-9'}]},right:pair(0,3,'0.125+t','6')}}]}],
  ['fourth-order-front',{...presetConfig('fourth-order-front'),N:128,T:.01,dt:.000025}],
  ['fourth-order-perturbed',{...presetConfig('fourth-order-perturbed'),N:128,T:.01,dt:.000025}],
  ['coupled',{...base,N:16,T:.02,dt:.0001,fields:[{rhs:'-kappa*Dx(u,4)-u*v+0.2',initial:'(1-4*x^2)^2',boundaries:{left:pair(0,1),right:pair(0,1)}},{rhs:'-2*kappa*Dx(v,4)+u*v-v',initial:'0.5*sin(pi*(x+0.5))',boundaries:{left:pair(0,2),right:pair(0,2)}}]}],
];
for(const [name,c] of cases){const r=await simulate({...c,frames:3});await fs.writeFile(`research/validation/fourth-${name}.json`,JSON.stringify(r));console.log(name,r.frames.at(-1).diagnostics.map(d=>d.referenceRelativeL2??d.rms));}
const study={spatial:[],temporal:[],fourth-order:[]};
for(const N of [16,32,64]){const r=await simulate({...base,N,dt:.00005,frames:2});study.spatial.push({N,dt:r.dt,relativeL2:r.frames.at(-1).diagnostics[0].referenceRelativeL2});}
for(const dt of [.004,.002,.001]){const r=await simulate({...presetConfig('biharmonic-clamped'),N:32,T:.2,dt,frames:2});study.temporal.push({N:32,dt:r.dt,relativeL2:r.frames.at(-1).diagnostics[0].referenceRelativeL2});}
for(const N of [128,256,512]){const r=await simulate({...presetConfig('fourth-order-front'),N,T:.01,dt:.000025,frames:2});study.fourth-order.push({N,dt:r.dt,relativeL2:r.frames.at(-1).diagnostics[0].referenceRelativeL2});}
await fs.writeFile('research/validation/fourth-convergence.json',JSON.stringify(study,null,2));console.log(study);
