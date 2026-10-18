import fs from 'node:fs/promises';
import {simulate} from '../dist/studio-solver.js';
import {presetConfig} from '../dist/studio-presets.js';
await fs.mkdir('research/validation',{recursive:true});
const edge=(type,value='0')=>({type,value});
const cases=[
  ['mixed-rod',{...presetConfig('mixed-rod'),N:32,T:.3,dt:.001}],
  ['heated-plate',{...presetConfig('heated-plate'),N:16,T:.2,dt:.0005}],
  ['time-boundary',{...presetConfig('cooled-rod'),N:32,T:.3,dt:.001,fields:[{rhs:'nu*lap(u)+cos(t)-2*nu',initial:'x^2',exact:'x^2+sin(t)',boundaries:{left:edge('dirichlet','0.25+sin(t)'),right:edge('dirichlet','0.25+sin(t)')}}]}],
  ['neumann-input',{...presetConfig('insulated-rod'),N:16,T:.2,dt:.005,fields:[{rhs:'nu*lap(u)',initial:'x^2',exact:'x^2+2*nu*t',boundaries:{left:edge('neumann','1'),right:edge('neumann','1')}}]}],
  ['coupled-neumann',{...presetConfig('insulated-rod'),N:32,T:.4,dt:.001,fields:[{rhs:'0.1*lap(u)-u*v+0.2',initial:'1+0.2*cos(pi*(x+0.5))',boundaries:{left:edge('neumann'),right:edge('neumann')}},{rhs:'0.05*lap(v)+u*v-v',initial:'0.5+0.1*cos(2*pi*(x+0.5))',boundaries:{left:edge('neumann'),right:edge('neumann')}}]}],
];
for(const [name,config] of cases){const result=await simulate({...config,frames:3});await fs.writeFile(`research/validation/boundary-${name}.json`,JSON.stringify(result));console.log(name,result.elapsedMs.toFixed(1)+' ms');}
