import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
  const page=await browser.newPage();
  await page.goto('http://127.0.0.1:8765/#evidence');
  await page.waitForFunction(()=>document.querySelector('#control-status').textContent.includes('2,400'));
  const pending=page.waitForEvent('download',{timeout:30000});
  await page.locator('#download-video').click();
  const download=await pending;
  await download.saveAs('docs/PhaseAtlas_Cubic_Demo.webm');
  console.log('Saved actual 1280×720 cubic demonstration.');
}finally{await browser.close();}
