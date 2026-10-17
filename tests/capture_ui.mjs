// Capture stable review images after layout and view animations have settled.
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
  const page=await browser.newPage({viewport:{width:1440,height:1100},reducedMotion:'reduce'});
  await page.goto('http://127.0.0.1:8765/');
  await page.waitForFunction(()=>document.querySelector('#control-status').textContent.includes('2,400'));
  await page.locator('#timeline').fill('100');
  for(const size of ['desktop','mobile']){
    await page.setViewportSize(size==='desktop'?{width:1440,height:1100}:{width:390,height:844});
    for(const [view,name] of [['lab','laboratory'],['atlas','atlas'],['verify','verification'],['evidence','evidence'],['theory','theory']]){
      await page.locator(`[data-view="${view}"]`).click();
      if(view==='atlas'&&size==='desktop'){
        await page.locator('#continue-front').click();
        await page.waitForFunction(()=>document.querySelector('#continuation-status').textContent.includes('Numerical candidate'));
      }
      if(view==='evidence'&&size==='desktop'){
        await page.locator('#refine-run').click();
        await page.waitForFunction(()=>document.querySelector('#refine-output').textContent.includes('relative L² difference'));
      }
      await page.evaluate(()=>scrollTo(0,0));
      await page.screenshot({path:`docs/screenshots/${name}-${size}.png`,fullPage:true,animations:'disabled'});
    }
  }
  console.log('Captured five views at desktop and phone widths.');
}finally{await browser.close();}
