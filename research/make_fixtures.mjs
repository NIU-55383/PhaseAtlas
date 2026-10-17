import fs from 'node:fs';
import {DEFAULTS,simulate,verifyProfile,continueFront,VERSION} from '../dist/science.js';
fs.mkdirSync('research/validation',{recursive:true});
const cases={cubic_linear:{...DEFAULTS,mode:'linear',N:257,L:16,T:.015,dt:.000025,frames:7},cubic_nonlinear:{...DEFAULTS,mode:'nonlinear',N:2049,T:.06,dt:.000025,frames:7},burgers:{...DEFAULTS,model:'burgers',mode:'nonlinear',N:257,T:1,dt:.001,k:1,center:-2,amplitude:.03,frames:7}};
const summary={version:VERSION,createdAt:new Date().toISOString(),runs:{},profiles:{}};
for(const [name,config] of Object.entries(cases)){const result=simulate(config);fs.writeFileSync(`research/validation/${name}.json`,JSON.stringify(result));summary.runs[name]={steps:result.steps,dt:result.dt,initial:result.frames[0].diag,final:result.frames.at(-1).diag,warnings:result.warnings};}
for(const id of ['cubic','burgers','kdvb'])summary.profiles[id]=verifyProfile(id).max;
summary.continuation=[[-20,-8.5],[-15,-6.5],[-17.75,-7.5],[-18,-7.7]].map(([alpha,beta])=>{const r=continueFront(alpha,beta);return {alpha,beta,ok:r.ok,tail:r.tail};});
fs.writeFileSync('research/validation/browser-summary.json',JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary,null,2));

