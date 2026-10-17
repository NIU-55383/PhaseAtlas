import {createRequire} from 'node:module';
import fs from 'node:fs';
const {chromium}=createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
  const page=await browser.newPage({viewport:{width:1280,height:720}});
  await page.goto('http://127.0.0.1:8765/');
  const media=await page.evaluate(async()=>{
    const video=document.createElement('video');video.src='/downloads/PhaseAtlas_Cubic_Demo.webm';video.muted=true;
    await new Promise((resolve,reject)=>{video.onloadedmetadata=resolve;video.onerror=()=>reject(Error('Cannot decode WebM'));});
    await video.play();await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Video did not play to six seconds')),15000);video.ontimeupdate=()=>{if(video.currentTime>=6){clearTimeout(timeout);video.pause();resolve();}};});
    const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;
    canvas.getContext('2d').drawImage(video,0,0);
    return {width:video.videoWidth,height:video.videoHeight,time:video.currentTime,png:canvas.toDataURL('image/png')};
  });
  fs.writeFileSync('docs/screenshots/video-frame.png',Buffer.from(media.png.split(',')[1],'base64'));
  const responses=[];
  for(const path of ['downloads/phaseatlas-research.zip','downloads/RESEARCH_NOTES.md','downloads/PhaseAtlas_Project_Brief.pdf','data/verification.json']){
    const r=await page.request.get('http://127.0.0.1:8765/'+path);responses.push({path,status:r.status(),bytes:(await r.body()).length});if(!r.ok())throw Error(`Missing asset: ${path}`);
  }
  console.log(JSON.stringify({video:{width:media.width,height:media.height,time:media.time},responses},null,2));
}finally{await browser.close();}
