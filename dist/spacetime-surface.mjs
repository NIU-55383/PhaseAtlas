import {buildSpaceTimeData, surfaceMesh, projectPoint} from './spacetime-core.mjs';

const fmt = v => v === 0 ? '0' : Math.abs(v) < .001 || Math.abs(v) >= 10000 ? v.toExponential(2) : Number(v.toPrecision(4)).toString();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function shade(q) {
  const colors = [[0,0,128],[35,64,203],[156,191,242],[242,246,255],[244,199,142],[193,83,28]];
  const v = clamp(q,0,1)*(colors.length-1), i = Math.min(colors.length-2,Math.floor(v)), s = v-i;
  return `rgb(${colors[i].map((c,k)=>Math.round(c*(1-s)+colors[i+1][k]*s)).join(',')})`;
}

// Orthographic display: x, t and amplitude have independent axis scales, with physical ticks.
export function drawSpaceTime(ctx, W, H, data, {azimuth=-45,elevation=28,zoom=1,frame=0,reveal=false,title='',mesh=false}={}) {
  ctx.clearRect(0,0,W,H);ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);
  const font = Math.max(10,Math.min(26,W/70)), margin=Math.max(46,font*4);
  const project=(x,t,z)=>projectPoint(x,t,z,azimuth,elevation);
  const cube=[];for(const x of [-.8,.8])for(const t of [-.65,.65])for(const z of [-.5,.5])cube.push(project(x,t,z));
  const minX=Math.min(...cube.map(p=>p[0])),maxX=Math.max(...cube.map(p=>p[0])),minY=Math.min(...cube.map(p=>p[1])),maxY=Math.max(...cube.map(p=>p[1]));
  const scale=Math.min((W-2*margin)/(maxX-minX),(H-120)/(maxY-minY))*zoom;
  const screen=(x,t,z)=>{const p=project(x,t,z);return [W/2+(p[0]-(minX+maxX)/2)*scale, H*.52+(p[1]-(minY+maxY)/2)*scale,p[2]];};
  const tspan=data.tmax-data.tmin||1,zspan=data.zmax-data.zmin;
  const point=(i,j)=>screen(-.8+1.6*(data.x[i]-data.xmin)/(data.xmax-data.xmin),-.65+1.3*(data.times[j]-data.tmin)/tspan,-.5+(data.values[j][i]-data.zmin)/zspan);
  const path=(points,stroke,fill,width=1)=>{ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));if(fill){ctx.closePath();ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke();}};
  const label=(text,p,dx=0,dy=0,align='center')=>{ctx.font=`${font}px Arial`;ctx.textAlign=align;const tw=ctx.measureText(text).width,x=clamp(p[0]+dx,4+(align==='right'?tw:align==='center'?tw/2:0),W-4-(align==='left'?tw:align==='center'?tw/2:0)),y=clamp(p[1]+dy,43,H-62);ctx.lineWidth=4;ctx.strokeStyle='#ffffffed';ctx.strokeText(text,x,y);ctx.fillStyle='#52617a';ctx.fillText(text,x,y);};
  ctx.save();ctx.beginPath();ctx.rect(0,34,W,H-64);ctx.clip();
  path([screen(-.8,-.65,-.5),screen(.8,-.65,-.5),screen(.8,.65,-.5),screen(-.8,.65,-.5)],'#dfe6f2','#f7f9fe');
  for(let k=0;k<=4;k++){const q=k/4;path([screen(-.8+1.6*q,-.65,-.5),screen(-.8+1.6*q,.65,-.5)],'#e1e7f2');path([screen(-.8,-.65+1.3*q,-.5),screen(.8,-.65+1.3*q,-.5)],'#e1e7f2');}
  const sampled=surfaceMesh(data,frame,reveal),triangles=[];
  for(let j=0;j<sampled.rows.length-1;j++)for(let i=0;i<sampled.columns.length-1;i++){
    const a=sampled.columns[i],b=sampled.columns[i+1],c=sampled.rows[j],d=sampled.rows[j+1];
    for(const indices of [[[a,c],[b,c],[b,d]],[[a,c],[b,d],[a,d]]]){
      const pts=indices.map(([x,t])=>point(x,t)),value=indices.reduce((s,[x,t])=>s+data.values[t][x],0)/3;
      triangles.push({pts,depth:pts.reduce((s,p)=>s+p[2],0)/3,color:shade((value-data.zmin)/zspan)});
    }
  }
  triangles.sort((a,b)=>a.depth-b.depth);
  for(const tri of triangles)path(tri.pts,mesh?'#18356c1a':tri.color,tri.color,mesh?.45:.55);
  // Highlight is deliberately overlaid to keep the active saved slice identifiable.
  const active=clamp(Math.round(frame),0,data.times.length-1),slice=data.x.map((_,i)=>point(i,active));
  path(slice,'#ffffffdf',null,4);path(slice,'#071e64',null,2);
  ctx.restore();
  const a=azimuth*Math.PI/180,xnear=Math.sin(a)>=0?.8:-.8,tnear=Math.cos(a)>=0?.65:-.65;
  const zCorner=[[-.8,-.65],[-.8,.65],[.8,-.65],[.8,.65]].sort((p,q)=>screen(...p,-.5)[0]-screen(...q,-.5)[0])[0];
  path([screen(-.8,tnear,-.5),screen(.8,tnear,-.5)],'#7383a5');path([screen(xnear,-.65,-.5),screen(xnear,.65,-.5)],'#7383a5');path([screen(...zCorner,-.5),screen(...zCorner,.5)],'#7383a5');
  for(let i=0;i<=2;i++){const q=i/2;label(fmt(data.xmin+(data.xmax-data.xmin)*q),screen(-.8+1.6*q,tnear,-.5),0,18);label(fmt(data.tmin+(data.tmax-data.tmin)*q),screen(xnear,-.65+1.3*q,-.5),xnear<0?-19:19,8,xnear<0?'right':'left');label(fmt(data.zmin+zspan*q),screen(...zCorner,-.5+q),-10,-5,'right');}
  label('x',screen(0,tnear,-.5),0,38);label('t',screen(xnear,0,-.5),xnear<0?-40:40,22);label(data.mode==='field'?data.label:'Δ',screen(...zCorner,.5),0,-18);
  ctx.textAlign='left';ctx.fillStyle='#000080';ctx.font=`600 ${font+1}px Arial`;ctx.fillText(title||data.quantity,15,23,W-30);
  ctx.font=`${font}px Arial`;ctx.fillStyle='#52617a';ctx.fillText(`t = ${fmt(data.times[active])} · ${reveal?'Revealed through selected frame':'Full saved trajectory'}`,15,H-13,W-30);
  const barW=Math.min(W-36,Math.max(150,W*.25)),barX=W-barW-18,barY=H-46;
  for(let i=0;i<100;i++){ctx.fillStyle=shade(i/99);ctx.fillRect(barX+i*barW/100,barY,barW/100+1,6);}
  ctx.fillStyle='#52617a';ctx.textAlign='left';ctx.fillText(fmt(data.zmin),barX,barY-6);ctx.textAlign='right';ctx.fillText(fmt(data.zmax),barX+barW,barY-6);
  ctx.textAlign='left';return {sampled,triangles:triangles.length};
}

export function createSpaceTimeSurface(after, {id='spacetime',onFrame=()=>{}}={}) {
  if(!document.querySelector('link[data-spacetime-style]')){const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('./spacetime-surface.css',import.meta.url);link.dataset.spacetimeStyle='true';document.head.append(link);}
  const root=document.createElement('section');root.className='spacetime-panel';root.id=id;root.setAttribute('aria-label','Three-dimensional space-time surface');
  root.innerHTML=`<div class="surface-heading"><div><h2>3D space-time surface</h2></div><button data-key="export" disabled>Export PNG ↗</button></div>
    <div class="surface-controls"><label>Height<select data-key="quantity"><option value="field">Selected field / observation</option><option value="change">Change from initial frame</option><option value="reference" disabled>Difference from reference</option></select></label>
    <label>Rotation<input data-key="azimuth" type="range" min="-180" max="180" value="-45" step="1"></label><label>Elevation<input data-key="elevation" type="range" min="10" max="75" value="28" step="1"></label><label>Zoom<input data-key="zoom" type="range" min="0.65" max="1.8" value="1" step="0.05"></label><button data-key="reset">Reset view</button>
    <label class="surface-toggle"><input data-key="reveal" type="checkbox">Reveal with playback</label></div>
    <canvas data-key="canvas" tabindex="0" role="img" aria-label="Space-time surface: x, t and amplitude. Drag to rotate. Arrow keys rotate and tilt; plus and minus zoom."></canvas>
    <div class="surface-playback"><button data-key="play" disabled>Play</button><input data-key="timeline" type="range" min="0" max="0" value="0" aria-label="Surface saved frame" disabled><output data-key="time">No trajectory</output></div>
    <details data-key="details"><summary>Plot details</summary><p class="surface-note" data-key="note" role="status">Run a one-dimensional experiment to display its space-time surface.</p></details>
    <p class="surface-caption">Drag to rotate · + / − to zoom · Dark curve: selected frame · Fixed height and color scales</p>`;
  after.after(root);const el=key=>root.querySelector(`[data-key="${key}"]`),canvas=el('canvas');
  let source=null,data=null,frame=0,playing=false,last=0,visible=true,drawRequest=0,lastInfo=null;
  const options=()=>({azimuth:+el('azimuth').value,elevation:+el('elevation').value,zoom:+el('zoom').value,frame,reveal:el('reveal').checked,title:data?.quantity||''});
  function stop(){playing=false;el('play').textContent='Play';}
  function draw(){drawRequest=0;if(!visible)return;const rect=canvas.getBoundingClientRect(),W=Math.max(230,rect.width),H=Math.max(250,rect.height),dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);
    if(!data){ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);ctx.fillStyle='#65718a';ctx.font='13px Arial';ctx.fillText(source?.config?.dimension===2?'Use a 1D model for an x–t–u surface.':'Run a 1D experiment to begin.',18,35);return;}
    lastInfo=drawSpaceTime(ctx,W,H,data,options());canvas.dataset.frame=frame;canvas.dataset.quantity=data.mode;canvas.dataset.sampled=`${lastInfo.sampled.columns.length} × ${lastInfo.sampled.rows.length}`;
  }
  function schedule(){if(!drawRequest)drawRequest=requestAnimationFrame(draw);}
  function updateFrame(next,emit=false){if(!data)return;frame=clamp(Math.round(next),0,data.times.length-1);el('timeline').value=frame;el('time').textContent=`t = ${fmt(data.times[frame])} / ${fmt(data.tmax)}`;if(emit)onFrame(frame);schedule();}
  function rebuild(){
    try{data=source?.config.dimension===1?buildSpaceTimeData(source.config,source.frames,source.rows,{mode:el('quantity').value,references:source.references,label:source.label}):null;
      for(const key of ['export','play','timeline','quantity'])el(key).disabled=!data;
      if(data){el('timeline').max=data.times.length-1;const sampled=surfaceMesh(data);el('note').dataset.error='false';el('note').textContent=`${source.config.title} · ${data.x.length} spatial samples × ${data.times.length} saved times; display mesh up to ${sampled.columns.length} × ${sampled.rows.length}. ${data.boundary==='periodic'?'Periodic grid; the duplicated seam is omitted.':'Cell-center samples.'} ${data.mode==='reference'?'Signed difference from the supplied reference formula.':data.mode==='change'?'Pointwise change from the first saved frame.':''}`;updateFrame(frame);}
      else{stop();el('time').textContent='No 1D trajectory';el('note').textContent=source?'This model has two spatial dimensions. Its x–y surface is available in the Research Workbench.':'Run a one-dimensional experiment to display its space-time surface.';schedule();}
    }catch(error){data=null;stop();for(const key of ['export','play','timeline'])el(key).disabled=true;el('details').open=true;el('note').dataset.error='true';el('note').textContent=`Surface unavailable: ${error.message}`;schedule();}
  }
  el('quantity').onchange=()=>{stop();rebuild();};for(const key of ['azimuth','elevation','zoom','reveal'])el(key).oninput=schedule;
  el('reset').onclick=()=>{el('azimuth').value=-45;el('elevation').value=28;el('zoom').value=1;schedule();};
  el('timeline').oninput=()=>{stop();updateFrame(+el('timeline').value,true);};
  el('play').onclick=()=>{if(!data)return;playing=!playing;el('play').textContent=playing?'Pause':'Play';last=performance.now();if(playing)onFrame(frame);};
  let pointer=null;
  canvas.onpointerdown=e=>{if(e.button!==0)return;pointer={id:e.pointerId,x:e.clientX,y:e.clientY,a:+el('azimuth').value,e:+el('elevation').value};canvas.setPointerCapture(e.pointerId);};
  canvas.onpointermove=e=>{if(!pointer||pointer.id!==e.pointerId)return;el('azimuth').value=((pointer.a+(e.clientX-pointer.x)*.45+540)%360)-180;el('elevation').value=clamp(pointer.e-(e.clientY-pointer.y)*.3,10,75);schedule();};
  canvas.onpointerup=canvas.onpointercancel=()=>{pointer=null;};
  canvas.onkeydown=e=>{const controls={ArrowLeft:['azimuth',-5],ArrowRight:['azimuth',5],ArrowUp:['elevation',5],ArrowDown:['elevation',-5],'+':['zoom',.05],'=':['zoom',.05],'-':['zoom',-.05]};if(!controls[e.key])return;e.preventDefault();const [key,delta]=controls[e.key];el(key).value=+el(key).value+delta;schedule();};
  el('export').onclick=()=>{
    if(!data)return;const output=document.createElement('canvas');output.width=2400;output.height=1600;const ctx=output.getContext('2d');drawSpaceTime(ctx,2400,1480,data,{...options(),title:`PhaseAtlas / ${source.config.title} / ${data.quantity}`});ctx.fillStyle='#fff';ctx.fillRect(0,1480,2400,120);ctx.fillStyle='#52617a';ctx.font='21px Arial';
    ctx.fillText(`N = ${source.config.N}; ${data.times.length} saved frames; ${data.boundary} domain; fixed height range [${fmt(data.zmin)}, ${fmt(data.zmax)}].`,35,1520,2325);
    ctx.fillText('Display mesh sampled from computed values. Export experiment JSON for equations, boundary data and resolution checks.',35,1560,2325);
    output.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`phaseatlas-spacetime-${data.mode}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},'image/png');
  };
  new ResizeObserver(schedule).observe(canvas);
  new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible)schedule();},{rootMargin:'150px'}).observe(root);
  function tick(now){if(playing&&data&&visible&&now-last>=100){updateFrame((frame+1)%data.times.length,true);last=now;}requestAnimationFrame(tick);}requestAnimationFrame(tick);rebuild();
  return {element:root,setData(next){stop();source=next;frame=0;el('quantity').querySelector('[value="reference"]').disabled=!next?.references;if(el('quantity').value==='reference'&&!next?.references)el('quantity').value='field';rebuild();},setFrame(next){updateFrame(next);},pause:stop};
}
