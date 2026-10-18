import {createRequire} from 'node:module';
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath}from'node:url';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const root=path.dirname(fileURLToPath(import.meta.url)),out=path.join(root,'output');
const rawDir=path.join(out,'demo-recording');fs.mkdirSync(rawDir,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
const ctx=await browser.newContext({viewport:{width:1920,height:800},recordVideo:{dir:rawDir,size:{width:1920,height:800}},acceptDownloads:true});
const page=await ctx.newPage();const errors=[],events=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:8769/studio.html');
await page.waitForFunction(()=>document.querySelector('#studio-status').textContent.startsWith('Completed'));
await page.evaluate(()=>{
 const cursor=document.createElement('div');cursor.id='video-cursor';cursor.style.cssText='position:fixed;left:960px;top:400px;width:24px;height:24px;border:3px solid #cc6b34;border-radius:50%;background:#cc6b3430;pointer-events:none;z-index:2147483646;transform:translate(-50%,-50%);transition:width .15s,height .15s';document.body.append(cursor);
 addEventListener('mousemove',e=>{cursor.style.left=e.clientX+'px';cursor.style.top=e.clientY+'px'});
 addEventListener('mousedown',()=>{cursor.style.width='42px';cursor.style.height='42px';setTimeout(()=>{cursor.style.width='24px';cursor.style.height='24px'},220)});
 const marker=document.createElement('div');marker.id='capture-sync';marker.style.cssText='position:fixed;left:0;top:0;width:40px;height:40px;background:rgb(17,211,71);z-index:2147483647';document.body.append(marker);
});
await page.waitForTimeout(500);
await page.evaluate(()=>document.getElementById('capture-sync').remove());
const started=Date.now();
async function until(t){const delay=t*1000-(Date.now()-started);if(delay>0)await page.waitForTimeout(delay);}
async function center(selector){await page.locator(selector).evaluate(e=>e.scrollIntoView({block:'center',behavior:'smooth'}));await page.waitForTimeout(550);const r=await page.locator(selector).boundingBox();await page.mouse.move(r.x+r.width*.6,r.y+r.height*.5,{steps:15});}
async function mark(name){events.push({name,t:(Date.now()-started)/1000});console.log(JSON.stringify(events.at(-1)),{flush:true});}
await until(2);await center('#preset');await page.locator('#preset').selectOption('convective-rod');await mark('Select convection-cooled rod');
await until(5);await center('#rhs-u');await page.locator('#rhs-u').fill('');await page.locator('#rhs-u').pressSequentially('nu*Dx(u,2)',{delay:100});await mark('Enter custom diffusion equation');
await until(10);await center('#parameters');await page.locator('#parameters').fill('nu=0.12; Bi=2; ambient=0.2');await mark('Set diffusivity and ambient temperature');
await until(14);await center('#bc-u-left-type');await page.locator('#bc-u-left-alpha').click();await page.locator('#bc-u-left-alpha').fill('Bi');await mark('Inspect left Robin coefficients');
await until(18);await center('#bc-u-right-type');await page.locator('#bc-u-right-value').click();await page.locator('#bc-u-right-value').fill('Bi*ambient');await mark('Inspect independent right boundary');
await until(23);await center('#run-studio');await page.locator('#run-studio').click();
await page.waitForFunction(()=>document.querySelector('#studio-status').textContent.startsWith('Completed'));await mark('Numerical solve completed');
await center('#studio-field');await page.locator('#studio-play').scrollIntoViewIfNeeded();await page.locator('#studio-play').click();await mark('Play computed trajectory');
await until(31);await page.locator('#studio-play').click();await center('#studio-timeline');
const slider=await page.locator('#studio-timeline').boundingBox();await page.mouse.click(slider.x+slider.width*.64,slider.y+slider.height/2);await mark('Pause and scrub to a saved frame');
await until(36);await center('#refine-studio');await page.locator('#refine-studio').click();
await page.waitForFunction(()=>document.querySelector('#refinement-result table'));await mark('Time-step and grid comparisons completed');
await center('#refinement-result');
await until(47);await center('#export-studio-json');
const downloaded=page.waitForEvent('download');await page.locator('#export-studio-json').click();const download=await downloaded;await download.saveAs(path.join(out,'demo-experiment.json'));await mark('Download reproducible experiment JSON');
await until(54);await page.locator('#export-studio-figure').hover();await mark('Other export formats available');
await until(61);
const lastState={status:await page.locator('#studio-status').textContent(),refinement:await page.locator('#refinement-result').textContent()};
await ctx.close();const video=await page.video().path();await browser.close();
const experiment=JSON.parse(fs.readFileSync(path.join(out,'demo-experiment.json'),'utf8'));
if(!experiment.refinement||experiment.config.fields[0].rhs!=='nu*Dx(u,2)'||!experiment.frames.length||errors.length)throw Error('Walkthrough verification failed: '+JSON.stringify({errors,config:experiment.config}));
fs.writeFileSync(path.join(out,'demo-recording-manifest.json'),JSON.stringify({rawVideo:video,events,viewport:[1920,800],duration:60,errors,lastState,export:{frames:experiment.frames.length,N:experiment.config.N,parameters:experiment.config.parameters,refinement:experiment.refinement}},null,2));
console.log(JSON.stringify({video,events:events.length,frames:experiment.frames.length,refinement:true}));
