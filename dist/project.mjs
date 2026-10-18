const legacy=new Set(['#lab','#atlas','#verify','#evidence','#theory']);
if(legacy.has(location.hash))location.replace(`front.html${location.hash}`);
const canvas=document.querySelector('#cooling-canvas'),play=document.querySelector('#play-case'),slider=document.querySelector('#case-time'),label=document.querySelector('#case-label');
let run,frame=0,playing=false,previous=0;
function draw(){
 if(!run)return;const rect=canvas.getBoundingClientRect(),dpr=devicePixelRatio||1;canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);const c=canvas.getContext('2d');c.scale(dpr,dpr);const W=rect.width,H=rect.height,L=45,R=W-14,T=20,B=H-37;
 c.fillStyle='#f4f7fc';c.fillRect(0,0,W,H);c.strokeStyle='#c2cfdf';c.lineWidth=1;c.beginPath();c.moveTo(L,T);c.lineTo(L,B);c.lineTo(R,B);c.stroke();c.font='11px Arial';c.fillStyle='#586a7d';
 const yy=v=>B-v*(B-T)/1.1;
 for(const v of [.2,.4,.6,.8,1]){c.fillText(v.toFixed(1),14,yy(v)+4);c.strokeStyle='#dfe6f0';c.beginPath();c.moveTo(L,yy(v));c.lineTo(R,yy(v));c.stroke();}
 c.fillText('-1',L-5,B+18);c.fillText('0',(L+R)/2-3,B+18);c.fillText('1',R-3,B+18);c.fillText('x',(L+R)/2-3,H-3);c.fillText('u',L-8,12);
 c.strokeStyle='#c36424';c.setLineDash([5,4]);c.beginPath();c.moveTo(L,yy(.2));c.lineTo(R,yy(.2));c.stroke();c.setLineDash([]);c.fillText('ambient',(L+R)/2-20,yy(.2)-8);
 const values=run.frames[frame].values[0];c.strokeStyle='#0000cd';c.lineWidth=2.5;c.beginPath();values.forEach((v,i)=>{const px=L+(i+.5)/values.length*(R-L),py=yy(v);i?c.lineTo(px,py):c.moveTo(px,py);});c.stroke();slider.value=frame;label.textContent=`t = ${run.frames[frame].t.toFixed(2)}`;
}
play.onclick=()=>{playing=!playing;play.textContent=playing?'Pause':'Play';};slider.oninput=()=>{playing=false;play.textContent='Play';frame=Number(slider.value);draw();};
try{const response=await fetch('data/submission-2026/cooling.json');if(!response.ok)throw Error('Recorded example unavailable');run=await response.json();slider.max=run.frames.length-1;play.disabled=false;slider.disabled=false;draw();}catch(error){label.textContent=error.message;}
new ResizeObserver(draw).observe(canvas);
function tick(now){if(playing&&run&&now-previous>65){frame=(frame+1)%run.frames.length;draw();previous=now;}requestAnimationFrame(tick);}requestAnimationFrame(tick);
