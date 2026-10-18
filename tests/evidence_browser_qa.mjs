import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('playwright');
const root=path.resolve('dist'),qa=path.resolve('qa');await fs.mkdir(qa,{recursive:true});
const server=http.createServer(async(req,res)=>{
  try{const filename=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!filename.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
    const bytes=await fs.readFile(filename);res.setHeader('Content-Type',({'.mjs':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json'})[path.extname(filename)]||'application/octet-stream');res.end(bytes);
  }catch{res.writeHead(404);res.end();}
});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({channel:'msedge',headless:true});const checks=[],errors=[];
try{
  const page=await browser.newPage({viewport:{width:1440,height:1100},reducedMotion:'reduce'});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/evidence.html');await page.locator('#demo').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Loaded measured'));
  assert.equal(await page.locator('#count').textContent(),'3 runs');assert.equal(await page.locator('#study tbody tr').count(),1);assert.ok(Number(await page.locator('#study tbody td').last().textContent())>1.8);checks.push('Measured three-level spatial study with source provenance');
  await page.locator('#play').click();await page.waitForFunction(()=>Number(document.querySelector('#timeline').value)>0);await page.locator('#play').click();checks.push('Saved-frame animation and pause');
  const downloadWait=page.waitForEvent('download');await page.locator('#download').click();const download=await downloadWait;const exportPath=path.join(qa,'evidence-bundle.json');await download.saveAs(exportPath);const bundle=JSON.parse(await fs.readFile(exportPath,'utf8'));assert.equal(bundle.sources.length,3);assert.ok(bundle.report.study.rows[0].observedOrder>1.8);assert.equal(bundle.report.sources[0].sha256.length,64);checks.push('Export includes original trajectories, model and recomputed report');
  await page.locator('#axis').selectOption('time');assert.ok((await page.locator('#study').textContent()).includes('grid fixed'));await page.locator('#axis').selectOption('space');checks.push('Mixed spatial/temporal interpretations rejected');
  await page.screenshot({path:path.join(qa,'evidence-desktop.png'),fullPage:true});
  const malicious=structuredClone(bundle.sources[0].experiment);malicious.config.title='<img src=x onerror="window.injected=true">';
  await page.locator('#files').setInputFiles({name:'untrusted.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(malicious))});await page.waitForFunction(()=>document.querySelector('#count').textContent==='1 runs');assert.equal(await page.locator('#inventory img').count(),0);assert.equal(await page.evaluate(()=>window.injected),undefined);checks.push('Untrusted metadata rendered only as text');
  await page.locator('#files').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{')});await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Import failed'));assert.equal(await page.locator('#count').textContent(),'1 runs');checks.push('Invalid import retains previous data');
  bundle.report.study.rows[0].observedOrder=999;
  await page.locator('#files').setInputFiles({name:'bundle.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bundle))});await page.waitForFunction(()=>document.querySelector('#count').textContent==='3 runs');assert.ok(Number(await page.locator('#study tbody td').last().textContent())<3);checks.push('Reimport recomputes and discards supplied conclusions');
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.equal(await page.locator('html').getAttribute('lang'),'en');await page.screenshot({path:path.join(qa,'evidence-mobile.png'),fullPage:true});checks.push('English mobile layout without horizontal overflow');
  const e=structuredClone(bundle.sources[0].experiment);e.config.dimension=2;e.config.N=16;e.config.Ly=2;e.config.title='Synthetic 2D UI fixture';e.config.fields=e.config.fields.slice(0,1);e.frames=e.frames.map(f=>({...f,values:[Array.from({length:256},(_,i)=>Math.sin(i/16+f.t))]}));
  await page.locator('#files').setInputFiles({name:'2d.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(e))});await page.waitForFunction(()=>document.querySelector('#count').textContent==='1 runs');assert.ok((await page.locator('#scale').textContent()).includes('aspect ratio'));checks.push('2D playback and physical aspect ratio');
  await page.locator('#clear').click();assert.equal(await page.locator('#count').textContent(),'0 runs');assert.equal(await page.locator('#download').isDisabled(),true);checks.push('Clear resets report and export state');
  await page.locator('#demo').click();await page.waitForFunction(()=>document.querySelector('#count').textContent==='3 runs');await page.pdf({path:path.join(qa,'evidence-report.pdf'),format:'A4',printBackground:true});checks.push('Printable PDF report');
  assert.deepEqual(errors,[]);await fs.writeFile(path.join(qa,'evidence-browser-qa.json'),JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({checks,errors},null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
