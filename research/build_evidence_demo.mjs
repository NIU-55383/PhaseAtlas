// Run from the repository root: node research/build_evidence_demo.mjs
// Optional first argument: another PhaseAtlas checkout, used for isolated QA.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
const destination=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist/data/evidence-demo.json');
const root=path.resolve(process.argv[2]||'.');
const {simulate}=await import(pathToFileURL(path.join(root,'dist/studio-solver.js')));
const {presetConfig}=await import(pathToFileURL(path.join(root,'dist/studio-presets.js')));
const sources=[];
for(const N of [16,32,64]){
  const experiment=await simulate({...presetConfig('cooled-rod'),N,T:.25,dt:.0005,frames:31});
  sources.push({name:`Cooling rod N=${N}`,experiment});
}
await fs.mkdir(path.dirname(destination),{recursive:true});
await fs.writeFile(destination,JSON.stringify({schema:'phaseatlas-evidence-bundle/v1',sources}));
console.log(`Saved ${sources.length} independently executed solver runs to ${destination}`);
