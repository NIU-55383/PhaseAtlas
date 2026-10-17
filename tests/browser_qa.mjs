import {createRequire} from 'node:module';
import fs from 'node:fs';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
const page=await browser.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:1});
const errors=[],failures=[];
const audits=[];
async function auditView(name){
  const state=await page.evaluate(()=>({lang:document.documentElement.lang,title:document.title,chinese:/[\u3400-\u9fff]/.test(document.body.innerText),languageSwitch:!!document.querySelector('#language'),width:innerWidth,scrollWidth:document.documentElement.scrollWidth,brand:document.querySelector('.brand').textContent,primary:getComputedStyle(document.documentElement).getPropertyValue('--teal').trim()}));
  audits.push({name,...state});
  if(state.lang!=='en'||state.chinese||state.languageSwitch||!state.title.includes('PhaseAtlas')||!state.brand.includes('PhaseAtlas')||state.primary!=='#0000cd'||state.scrollWidth>state.width)throw Error('Interface audit failed: '+JSON.stringify(audits.at(-1)));
}
page.on('pageerror',e=>errors.push(e.stack));
page.on('response',r=>{if(r.status()>=400)failures.push([r.status(),r.url()]);});
fs.mkdirSync('docs/screenshots',{recursive:true});
await page.goto('http://127.0.0.1:8765/');
await page.waitForFunction(()=>document.querySelector('#control-status').textContent.includes('Δt='));
await page.locator('#rewind').click();
await page.locator('#timeline').fill('100');
await page.evaluate(()=>scrollTo(0,0));
await page.screenshot({path:'docs/screenshots/laboratory-desktop.png',fullPage:true,animations:"disabled"});
await auditView('laboratory-desktop');
await page.locator('[data-view="atlas"]').click();
await page.locator('#continue-front').click();
await page.waitForFunction(()=>document.querySelector('#continuation-status').textContent.includes('Numerical candidate'));
await page.screenshot({path:'docs/screenshots/atlas-desktop.png',fullPage:true,animations:"disabled"});
await auditView('atlas-desktop');
await page.locator('[data-view="verify"]').click();
await page.locator('#verify-wrong').click();
if(!(await page.locator('#residual-badge').textContent()).includes('Nonzero'))throw Error('Residual error injection failed');
await page.locator('#verify-correct').click();
if(!(await page.locator('#residual-badge').textContent()).includes('roundoff'))throw Error('Residual restoration failed');
await page.screenshot({path:'docs/screenshots/verification-desktop.png',fullPage:true,animations:"disabled"});
await auditView('verification-desktop');
await page.locator('[data-view="evidence"]').click();
await page.locator('#refine-run').click();
await page.waitForFunction(()=>document.querySelector('#refine-output').textContent.includes('relative L² difference'));
console.log('Refinement:',await page.locator('#refine-output').textContent());
await page.screenshot({path:'docs/screenshots/evidence-desktop.png',fullPage:true,animations:"disabled"});
await auditView('evidence-desktop');
for(const id of ['download-json','download-csv','download-svg','download-report']){const downloadPromise=page.waitForEvent('download');await page.locator(`#${id}`).click();const download=await downloadPromise;await download.saveAs(`docs/screenshots/${download.suggestedFilename()}`);}
await page.locator('#import-file').setInputFiles('docs/screenshots/phaseatlas-cubic.json');
await page.waitForFunction(()=>document.querySelector('#control-status').textContent.includes('2,400'));
await page.locator('#rewind').click();
await page.locator('[data-view="evidence"]').click();
const videoPromise=page.waitForEvent('download',{timeout:30000});
await page.locator('#download-video').click();
const video=await videoPromise;
await video.saveAs('docs/PhaseAtlas_Cubic_Demo.webm');
await page.locator('[data-view="theory"]').click();
await page.screenshot({path:'docs/screenshots/theory-desktop.png',fullPage:true,animations:"disabled"});
await auditView('theory-desktop');
await page.locator('[data-view="lab"]').click();
await page.locator('[data-model="burgers"]').click();
await page.waitForFunction(()=>document.querySelector('#control-status').textContent.includes('2,000'));
await page.locator('#rewind').click();
await page.locator('[data-model="kdvb"]').click();
await page.waitForFunction(()=>document.querySelector('#plot-mode-label').textContent.includes('Analytic'));
await page.locator('#rewind').click();
await page.locator('#timeline').fill('80');
await page.screenshot({path:'docs/screenshots/kdvb-desktop.png',fullPage:true,animations:"disabled"});
await page.locator('[data-model="cubic"]').click();
await page.waitForFunction(()=>document.querySelector('#control-status').textContent.includes('2,400'));
await page.locator('#rewind').click();
await page.setViewportSize({width:390,height:844});
await page.evaluate(()=>scrollTo(0,0));
await page.screenshot({path:'docs/screenshots/laboratory-mobile.png',fullPage:true,animations:"disabled"});
await auditView('laboratory-mobile');
for(const view of ['atlas','verify','evidence','theory']){
  await page.locator(`[data-view="${view}"]`).click();
  await auditView(view+'-mobile');
  await page.screenshot({path:`docs/screenshots/${view}-mobile.png`,fullPage:true,animations:"disabled"});
}
const overflows=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
const report={pageErrors:errors,httpErrors:failures,mobileViewport:overflows,interfaceAudits:audits};
fs.writeFileSync('docs/browser-qa.json',JSON.stringify(report,null,2));

console.log(JSON.stringify(report,null,2));
if(errors.length||failures.length||overflows.scrollWidth>overflows.width)process.exitCode=1;


} finally { await browser.close(); }
