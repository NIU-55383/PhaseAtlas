// Actual case data for the 18 October 2026 submission draft. Run from repo root.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {simulate} from '../dist/studio-solver.js';
import {presetConfig} from '../dist/studio-presets.js';
import {simulate as frontSimulate,DEFAULTS} from '../dist/science.js';
import {compareThree} from '../dist/evidence-core.mjs';
import {balanceAudit,metricValue} from '../dist/research-audit.mjs';
const dir='dist/data/submission-2026';await fs.mkdir(dir,{recursive:true});
const save=async(name,data)=>fs.writeFile(`${dir}/${name}.json`,JSON.stringify(data));
const modeRuns=[];
for(const N of [16,32,64])modeRuns.push(await simulate({...presetConfig('robin-mode'),N,T:.2,dt:.0002,frames:41}));
const comparison=compareThree(modeRuns,'space');
await save('robin-refinement',{schema:'phaseatlas-evidence-bundle/v1',sources:modeRuns.map(r=>({name:`Robin N=${r.config.N}`,experiment:r}))});
const cooling=await simulate({...presetConfig('convective-rod'),N:64,T:3,dt:.001,frames:121});
await save('cooling',cooling);await save('cooling-balance',balanceAudit(cooling));
const cases=[];
for(const nu of [.05,.1,.2,.4])for(const Bi of [.5,1,2,4]){
 const config={...presetConfig('convective-rod'),N:32,T:3,dt:.001,frames:31,parameters:`nu=${nu}; Bi=${Bi}; ambient=.2`};
 const experiment=await simulate(config);
 cases.push({nu,Bi,metric:metricValue(experiment,{expression:'u',statistic:'mean',reduction:'final'}),experiment});
}
await save('cooling-scan',cases);
const front=frontSimulate(DEFAULTS);await save('mae03-front',front);
const sourceFiles=['studio-solver.js','studio-bounded.js','studio-fourth.js','studio-expression.js','studio-presets.js','research-audit.mjs','research-core.mjs','evidence-core.mjs','science.js'];
const sourceHashes={};for(const f of sourceFiles)sourceHashes[f]=crypto.createHash('sha256').update((await fs.readFile('dist/'+f,'utf8')).replace(/\r\n/g,'\n')).digest('hex');
const summary={generatedAt:new Date().toISOString(),status:'Pre-event baseline; no hackathon-period contribution claimed',sourceHashFormat:'SHA-256 of UTF-8 source with LF line endings',sourceHashes,robin:{N:modeRuns.map(r=>r.config.N),T:.2,dt:.0002,errors:modeRuns.map(r=>r.frames.at(-1).diagnostics[0].referenceRmsError),comparison},cooling:{config:cooling.config,balance:balanceAudit(cooling),finalMean:metricValue(cooling,{expression:'u',statistic:'mean',reduction:'final'}).value},scan:cases.map(({nu,Bi,metric})=>({nu,Bi,mean:metric.value})),front:{config:front.config,first:front.frames[0].diag,last:front.frames.at(-1).diag}};
await save('summary',summary);console.log(JSON.stringify({order:comparison.rows[0].observedOrder,errors:summary.robin.errors,coolingFinalMean:summary.cooling.finalMean,scanCount:cases.length}));
