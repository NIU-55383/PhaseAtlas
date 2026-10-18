import fs from 'node:fs/promises';
import {simulate} from '../dist/studio-solver.js';
import {presetConfig} from '../dist/studio-presets.js';
await fs.mkdir('research/validation',{recursive:true});
for(const [id,settings] of [['burgers',{N:64,T:.5,dt:.01}],['gray',{N:16,T:2,dt:.05}],['cahn',{N:16,T:.1,dt:.002}]]) {
  const result=await simulate({...presetConfig(id),...settings,frames:2});
  await fs.writeFile(`research/validation/studio-${id}.json`,JSON.stringify(result));
  console.log(`${id}: independent-reference fixture saved`);
}
