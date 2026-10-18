import {validateExperiment,summarize,statistics,compareThree,MAX_VALUES} from './evidence-core.mjs';
const $=id=>document.getElementById(id);
const fmt=x=>x===null||x===undefined?'—':!Number.isFinite(x)?'unavailable':x===0?'0':Math.abs(x)<.001||Math.abs(x)>=1e4?x.toExponential(3):Number(x.toPrecision(5)).toString();
function node(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
let sources=[],currentStudy=null,currentReport=null,selected=0,field=0,frame=0,playing=false,lastTick=0,range=[0,1],loading=false;
function pause(){playing=false;$('play').textContent='Play';}
async function fingerprint(text){if(!globalThis.crypto?.subtle)return null;const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');}
async function decode(text,name){
  const data=JSON.parse(text);
  if(data?.schema==='phaseatlas-evidence-bundle/v1'){
    if(!Array.isArray(data.sources)||data.sources.length<1||data.sources.length>3)throw Error('A bundle must contain one to three sources.');
    const out=[];
    for(let i=0;i<data.sources.length;i++){
      const item=data.sources[i],e=validateExperiment(item.experiment);
      out.push({name:typeof item.name==='string'?item.name.slice(0,200):`${name} / run ${i+1}`,sha256:await fingerprint(JSON.stringify(e)),fingerprintScope:'Serialized experiment in imported bundle',experiment:e});
    }
    return out;
  }
  const e=validateExperiment(data);
  return [{name:name.slice(0,200),sha256:await fingerprint(text),fingerprintScope:'Decoded UTF-8 text of the imported file',experiment:e}];
}
function lock(value){loading=value;$('files').disabled=value;$('demo').disabled=value;$('clear').disabled=value;}
async function loadFiles(files){
  if(loading)return;lock(true);pause();
  try{
    if(!files.length||files.length>3)throw Error('Select one to three Studio exports, or one evidence bundle.');
    if(files.reduce((s,f)=>s+f.size,0)>96*1024*1024||files.some(f=>f.size>64*1024*1024))throw Error('Use files below 64 MiB each and 96 MiB in total.');
    const next=[];
    for(const file of files)next.push(...await decode(await file.text(),file.name));
    install(next);status(`Loaded ${sources.length} run${sources.length===1?'':'s'}. Comparisons are recomputed from the supplied trajectories.`);
  }catch(e){status(`Import failed: ${e.message} Previous results are retained.`,true);}finally{lock(false);$('files').value='';}
}
function install(next){
  if(next.length>3)throw Error('Use at most three runs per study.');
  const count=next.reduce((s,r)=>s+r.experiment.config.N**r.experiment.config.dimension*r.experiment.config.fields.length*r.experiment.frames.length,0);
  if(count>2*MAX_VALUES)throw Error('The combined study exceeds twelve million field values.');
  sources=next;selected=0;field=0;frame=0;renderInventory();renderStudy();selectRun();renderRecord();
}
function renderInventory(){
  const box=$('inventory');box.replaceChildren();$('count').textContent=`${sources.length} runs`;$('run').replaceChildren();
  if(!sources.length){box.append(node('p','No experiments loaded.','subtle'));return;}
  sources.forEach((s,i)=>{
    const e=s.experiment,c=e.config,row=node('div',undefined,'run-row');
    row.append(node('strong',`${i+1}. ${c.title||s.name}`),node('small',`${c.dimension}D · ${c.boundary} · N = ${c.N} · actual Δt = ${fmt(e.dt)} · T = ${fmt(c.T)}`));
    box.append(row);$('run').add(new Option(`${i+1}. N=${c.N}, Δt=${fmt(e.dt)}`,String(i)));
  });
}
function renderStudy(){
  const box=$('study');box.replaceChildren();currentStudy=null;
  if(!sources.length)box.append(node('p','Three compatible runs are required for an observed order.','subtle'));
  else try{
    currentStudy=compareThree(sources.map(s=>s.experiment),$('axis').value);
    const wrap=node('div',undefined,'table-wrap'),table=node('table'),head=node('thead'),hr=node('tr');
    for(const t of ['Field','D₀₁ (RMS)','D₁₂ (RMS)','Observed p'])hr.append(node('th',t));head.append(hr);table.append(head);const body=node('tbody');
    for(const row of currentStudy.rows){const tr=node('tr');[row.field,fmt(row.d01),fmt(row.d12),fmt(row.observedOrder)].forEach(t=>tr.append(node('td',t)));body.append(tr);}
    table.append(body);wrap.append(table);box.append(wrap,node('p',currentStudy.comparison,'subtle'));
    for(const row of currentStudy.rows)box.append(node('p',`${row.field}: ${row.status}`,'subtle'));
  }catch(e){box.append(node('p',e.message,'error'));}
  drawConvergence();
}
function selectRun(){
  pause();selected=Number($('run').value)||0;field=0;frame=0;$('field').replaceChildren();
  for(const id of ['run','field','play','timeline','download','print'])$(id).disabled=!sources.length;
  if(sources.length){const c=sources[selected].experiment.config;c.fields.forEach((f,i)=>$('field').add(new Option(f.name,String(i))));$('timeline').max=sources[selected].experiment.frames.length-1;}
  setRange();drawTrajectory();
}
function setRange(){
  range=[Infinity,-Infinity];if(!sources.length){range=[0,1];return;}
  for(const snap of sources[selected].experiment.frames){const d=statistics(snap.values[field]);range[0]=Math.min(range[0],d.min);range[1]=Math.max(range[1],d.max);}
  if(range[0]===range[1]){const span=Math.max(Math.abs(range[0])*.05,1e-8);range=[range[0]-span,range[1]+span];}
}
function context(id){const c=$(id);c.width=Math.max(280,Math.round(c.clientWidth));c.height=id==='trajectory'?380:240;const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);return {ctx,W:c.width,H:c.height};}
function drawTrajectory(){
  const {ctx,W,H}=context('trajectory');ctx.font='16px Arial';ctx.fillStyle='#59647b';
  if(!sources.length){ctx.fillText('Import an experiment to inspect its saved evolution.',40,65);$('time').textContent='No trajectory';return;}
  const e=sources[selected].experiment,c=e.config,snap=e.frames[frame],v=snap.values[field];
  let left=W<600?63:85,top=35,width=W-left-25,height=H-100;const [lo,hi]=range;
  const y=value=>top+height*(1-(value-lo)/(hi-lo));
  if(c.dimension===1){
    ctx.strokeStyle='#dfe3ef';ctx.strokeRect(left,top,width,height);ctx.fillStyle='#59647b';
    ctx.fillText(fmt(hi),5,top+8);ctx.fillText(fmt(lo),5,top+height);ctx.fillText(fmt(-c.Lx/2),left,top+height+28);ctx.fillText(fmt(c.Lx/2),left+width-50,top+height+28);
    ctx.fillText(c.fields[field].name,left,20);ctx.fillText('x',left+width/2,top+height+43);
    ctx.beginPath();ctx.strokeStyle='#0000cd';ctx.lineWidth=2.4;
    for(let i=0;i<c.N;i++){const xx=c.boundary==='periodic'?left+i/c.N*width:left+(i+.5)/c.N*width;if(i===0)ctx.moveTo(xx,y(v[i]));else ctx.lineTo(xx,y(v[i]));}ctx.stroke();
    ctx.fillText('Saved grid samples; no endpoint reconstruction.',left,top+height+62,width);
  }else{
    const aspect=c.Lx/c.Ly;if(width/height>aspect){const next=height*aspect;left+=(width-next)/2;width=next;}else{const next=width/aspect;top+=(height-next)/2;height=next;}
    for(let j=0;j<c.N;j++)for(let i=0;i<c.N;i++){
      const t=Math.max(0,Math.min(1,(v[j*c.N+i]-lo)/(hi-lo)));let rgb;
      if(t<.5){const r=Math.round(255*t*2);rgb=[r,r,205+Math.round(50*t*2)];}else{const q=(t-.5)*2;rgb=[255-Math.round(54*q),255-Math.round(155*q),255-Math.round(215*q)];}
      ctx.fillStyle=`rgb(${rgb.join(',')})`;ctx.fillRect(left+i*width/c.N,top+(c.N-1-j)*height/c.N,width/c.N+.3,height/c.N+.3);
    }
    ctx.strokeStyle='#bcc4df';ctx.strokeRect(left,top,width,height);ctx.fillStyle='#59647b';ctx.fillText(`x ∈ [${fmt(-c.Lx/2)}, ${fmt(c.Lx/2)}]`,left,top+height+26);ctx.fillText(`y ∈ [${fmt(-c.Ly/2)}, ${fmt(c.Ly/2)}]`,left,top-10);
  }
  $('timeline').value=frame;$('time').textContent=`t = ${fmt(snap.t)} / ${fmt(c.T)}`;
  const d=statistics(v);$('scale').textContent=`Fixed ${c.fields[field].name} scale [${fmt(lo)}, ${fmt(hi)}] for this run. Mean = ${fmt(d.mean)}; RMS = ${fmt(d.rms)}. ${c.dimension===2?'Low → high: blue → white → orange. Physical aspect ratio preserved.':'Grid values are connected for display.'} Frames are replayed in their saved order, not in real physical time.`;
}
function drawConvergence(){
  const {ctx,W,H}=context('convergence');ctx.font='14px Arial';ctx.fillStyle='#59647b';
  if(!currentStudy){ctx.fillText('A compatible three-level study will appear here.',30,55);return;}
  const positive=currentStudy.rows.flatMap(r=>[r.d01,r.d12]).filter(x=>x>0);
  if(!positive.length){ctx.fillText('All differences are zero at stored precision; no order can be estimated.',30,55);return;}
  let lo=Math.floor(Math.log10(Math.min(...positive))),hi=Math.ceil(Math.log10(Math.max(...positive)));if(lo===hi){lo--;hi++;}
  const y=v=>H-48-(Math.log10(v)-lo)/(hi-lo)*(H-85),xs=[90,W-45];
  ctx.strokeStyle='#dfe3ef';ctx.strokeRect(60,30,W-85,H-78);ctx.fillText(`10^${hi}`,5,38);ctx.fillText(`10^${lo}`,5,H-45);ctx.font='12px Arial';ctx.fillText('Coarse → middle',xs[0]-45,H-18);ctx.fillText('Middle → fine',xs[1]-45,H-18);
  currentStudy.rows.forEach((r,i)=>{const color=['#0000cd','#c96428','#128070'][i];ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=2;if(r.d01>0&&r.d12>0){ctx.beginPath();ctx.moveTo(xs[0],y(r.d01));ctx.lineTo(xs[1],y(r.d12));ctx.stroke();}for(const [j,d]of [r.d01,r.d12].entries())if(d>0){ctx.beginPath();ctx.arc(xs[j],y(d),5,0,2*Math.PI);ctx.fill();}ctx.fillText(r.field,100+i*90,18);});
}
function renderRecord(){
  const box=$('record');box.replaceChildren();currentReport=null;
  if(!sources.length){box.append(node('p','Equations, boundary data, numerical method and source fingerprints will appear here.','subtle'));return;}
  currentReport={schema:'phaseatlas-evidence-report/v1',createdAt:new Date().toISOString(),axis:$('axis').value,study:currentStudy,
    sources:sources.map(s=>({name:s.name,sha256:s.sha256,fingerprintScope:s.fingerprintScope,...summarize(s.experiment)})),
    scope:'Inspection of supplied trajectories, not a new solver run. Imported conclusions and refinement diagnostics are ignored. Fingerprints identify data and do not authenticate their origin.',
    missingChecks:['Independent trajectory reproduction','Continuous PDE residual verification','Domain-size sensitivity (when approximating an unbounded domain)','Physical model validation','Mathematical stability proof']};
  sources.forEach((s,i)=>{
    const d=node('details');d.open=i===selected;d.append(node('summary',`${i+1}. ${s.experiment.config.title||s.name} / model and method`));
    d.append(node('p',s.experiment.method));
    const c=s.experiment.config,lines=[`Parameters: ${c.parameters||'(none)'}`,`Domain: ${c.dimension}D, Lx=${c.Lx}${c.dimension===2?`, Ly=${c.Ly}`:''}`,`Boundaries: ${c.boundary}`];
    for(const f of c.fields){lines.push(`${f.name}_t = ${f.rhs}`,`${f.name}(x,0) = ${f.initial}`);if(f.exact)lines.push(`Supplied reference (not verified here): ${f.exact}`);if(f.boundaries)lines.push(JSON.stringify(f.boundaries,null,2));}
    d.append(node('pre',lines.join('\n')),node('p',`Solver: ${s.experiment.solverVersion}. Actual Δt=${fmt(s.experiment.dt)}; ${s.experiment.steps} steps.`,'subtle'),node('p',`SHA-256: ${s.sha256||'Unavailable in this browser context'}. ${s.fingerprintScope}.`,'fingerprint'));
    for(const warning of currentReport.sources[i].sourceWarnings)d.append(node('p',`Source warning: ${warning}`,'source-warning'));
    box.append(d);
  });
}
function exportBundle(){if(!sources.length)return;const payload={schema:'phaseatlas-evidence-bundle/v1',report:currentReport,sources};const url=URL.createObjectURL(new Blob([JSON.stringify(payload)],{type:'application/json'}));const a=node('a');a.href=url;a.download='phaseatlas-evidence-bundle.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function tick(now){if(playing&&now-lastTick>120&&sources.length){frame=(frame+1)%sources[selected].experiment.frames.length;drawTrajectory();lastTick=now;}requestAnimationFrame(tick);}requestAnimationFrame(tick);
$('files').addEventListener('change',()=>loadFiles([...$('files').files]));
$('demo').onclick=async()=>{if(loading)return;lock(true);pause();status('Loading three measured heat-transfer runs…');try{const response=await fetch('data/evidence-demo.json');if(!response.ok)throw Error(`Benchmark request returned ${response.status}.`);const next=await decode(await response.text(),'Heat-transfer benchmark');$('axis').value='space';install(next);status('Loaded measured N=16, 32, 64 runs at one fixed time step. Inspect the spatial differences and replay the cooling rod.');}catch(e){status(`Could not load the benchmark: ${e.message}`,true);}finally{lock(false);}};
$('clear').onclick=()=>{pause();install([]);status('Experiments cleared. Import up to three matching runs.');};
$('axis').onchange=()=>{renderStudy();renderRecord();};$('run').onchange=()=>{selectRun();renderRecord();};
$('field').onchange=()=>{pause();field=Number($('field').value);setRange();drawTrajectory();};
$('timeline').oninput=()=>{pause();frame=Number($('timeline').value);drawTrajectory();};$('play').onclick=()=>{playing=!playing;$('play').textContent=playing?'Pause':'Play';};
$('download').onclick=exportBundle;$('print').onclick=()=>{pause();window.print();};
window.addEventListener('resize',()=>{drawTrajectory();drawConvergence();});
drawTrajectory();drawConvergence();
