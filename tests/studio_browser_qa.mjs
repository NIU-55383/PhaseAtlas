import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const base=process.env.PHASEATLAS_TEST_URL||'http://127.0.0.1:8766';
await fs.mkdir('docs/screenshots',{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
const errors=[],badResponses=[],checks=[];
try {
  const page=await browser.newPage({viewport:{width:1512,height:1100},reducedMotion:'reduce'});
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)badResponses.push([r.status(),r.url()]);});
  async function completed(){await page.waitForFunction(()=>document.querySelector('#studio-status').textContent.startsWith('Completed'),{},{timeout:60000});}
  async function download(id,name){const waiting=page.waitForEvent('download');await page.locator('#'+id).click();const d=await waiting;await d.saveAs('docs/screenshots/'+name);return fs.readFile('docs/screenshots/'+name);}
  async function audit(name){const a=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,english:document.documentElement.lang==='en'&&!/[\u3400-\u9fff]/.test(document.body.innerText)}));assert.ok(a.english);assert.ok(a.scroll<=a.width,JSON.stringify(a));checks.push(name);}
  await page.goto(base+'/studio.html');await completed();await audit('desktop layout and English interface');
  await page.locator('#studio-timeline').fill('60');
  await page.locator('#refine-studio').click();await page.waitForFunction(()=>document.querySelector('#studio-status').textContent.startsWith('Two refinement'),{},{timeout:60000});
  const heat=JSON.parse(await download('export-studio-json','studio-heat.json'));
  assert.ok(heat.frames.at(-1).diagnostics[0].referenceRelativeL2<1e-12);assert.ok(heat.refinement.temporal[0].relativeL2<1e-12);checks.push('heat reference and two-stage refinement');
  const csv=String(await download('export-studio-csv','studio-heat.csv'));assert.equal(csv.trim().split('\n').length,heat.frames.length*heat.config.N+1);checks.push('CSV includes all frames and grid points');
  const svg=String(await download('export-studio-figure','studio-heat.svg'));assert.ok(svg.includes('<metadata>'));assert.ok(!svg.includes('NaN'));checks.push('vector figure and embedded provenance');
  await page.locator('#export-studio-config').click();const link=await page.locator('#share-link').inputValue();
  const shared=await browser.newPage({reducedMotion:'reduce'});await shared.goto(link);await shared.waitForFunction(()=>document.querySelector('#studio-status').textContent.includes('Shared configuration loaded'));assert.equal(await shared.locator('#stat-time').textContent(),'—');await shared.close();checks.push('share-link round trip without automatic execution');
  await page.locator('#rhs-u').fill('window.alert(1)');await page.locator('#run-studio').click();await page.waitForFunction(()=>document.querySelector('#studio-status').classList.contains('error'));assert.equal(await page.locator('#result-title').textContent(),'Heat diffusion');checks.push('invalid equation rejected with prior result preserved');
  await page.locator('#preset').selectOption('gray');await page.locator('#run-studio').click();await completed();await page.locator('#display-field').selectOption('1');await page.locator('#studio-timeline').fill('60');
  await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'docs/screenshots/studio-desktop.png',fullPage:true});
  const gray=JSON.parse(await download('export-studio-json','studio-gray.json'));assert.equal(gray.config.dimension,2);assert.equal(gray.frames.at(-1).values.length,2);assert.equal(gray.frames.at(-1).values[1].length,4096);checks.push('2D coupled Gray–Scott evolution and field switching');
  const svg2=String(await download('export-studio-figure','studio-gray.svg'));assert.ok(svg2.includes('Field v'));assert.ok(!svg2.includes('NaN'));
  await page.setViewportSize({width:390,height:844});await audit('mobile layout');await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'docs/screenshots/studio-mobile.png',fullPage:true});
  await page.setViewportSize({width:1512,height:1100});
  const video=await download('export-studio-video','studio-gray.webm');assert.ok(video.length>10000);checks.push('WebM animation export');
  await page.locator('#import-studio').setInputFiles('docs/screenshots/studio-heat.json');await completed();assert.equal(await page.locator('#experiment-title').inputValue(),'Heat diffusion');assert.ok((await page.locator('#refinement-result').textContent()).includes('Not checked'));checks.push('JSON import recomputes and discards previous refinement claims');
  await page.locator('#preset').selectOption('gray');await page.locator('#run-studio').click();await page.locator('#cancel-studio').click();assert.ok((await page.locator('#studio-status').textContent()).startsWith('Canceled'));checks.push('worker cancellation');
  await page.goto(base+'/');await page.waitForFunction(()=>document.querySelector('#control-status').textContent.includes('Δt='),{},{timeout:60000});await page.locator('a[href="studio.html"]').click();await completed();checks.push('original front laboratory and new navigation');
  assert.deepEqual(errors,[]);assert.deepEqual(badResponses,[]);
  await fs.writeFile('docs/screenshots/studio-browser-qa.json',JSON.stringify({checks,errors,badResponses},null,2));
  console.log(JSON.stringify({checks,errors,badResponses},null,2));
}finally{await browser.close();}
