import {PRESETS,presetConfig} from './studio-presets.js';
import {prepare} from './studio-solver.js';
import {parseParameters} from './studio-expression.js';
import {buildPlan,setParameter,makeObserver,observationHistory,waveDiagnostics,gaussianSeed} from './research-core.mjs';
import {compareThree,statistics} from './evidence-core.mjs';
import {drawField,drawLines,drawAtlas,fmt} from './research-plots.mjs';
import {balanceAudit,metricValue,sensitivityEstimate} from './research-audit.mjs';

const $=id=>document.getElementById(id),num=id=>Number($(id).value);
const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
const attempt=fn=>async(...args)=>{try{await fn(...args);}catch(e){status(e.message,true);}};
let model,plan=null,selectedId=null,busy=false,activeWorker=null,cancelWorker=null,queueToken=0;
let frame=0,playing=false,lastTick=0,observed=null,viewExpression='u',vectorObservers=null,range=[0,1],fieldRect=null,atlasRect=null,waves=null,resolution=null,history=null;
let balance=null,mapSettings={kind:'observable',expression:'u',statistic:'rms',reduction:'final'},mapComputing=false;
const selected=()=>plan?.jobs.find(j=>j.id===selectedId),experiment=()=>selected()?.result;
function status(message,error=false){$('status').textContent=message;$('status').classList.toggle('error',error);}
function pause(){playing=false;$('play').textContent='Play';}
function download(name,payload){const url=URL.createObjectURL(new Blob([JSON.stringify(payload)],{type:'application/json'}));const a=node('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function downloadCSV(name,headers,rows){
  const cell=value=>{if(value===null||value===undefined)return '';if(typeof value==='number')return Number.isFinite(value)?String(value):'';let s=String(value);if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
  const text=[headers,...rows].map(row=>row.map(cell).join(',')).join('\r\n'),url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'})),a=node('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function readModel(){return prepare({...model,N:num('N'),T:num('T'),dt:num('dt'),frames:num('frames'),parameters:$('parameters').value}).config;}
function modelChanged(){status('Model settings changed. Run to compute them; existing trajectories and exports still describe their original models.');}
function fillFields(id,c){const previous=$(id).value;$(id).replaceChildren();c.fields.forEach((f,i)=>$(id).add(new Option(f.name,String(i))));if([...$(id).options].some(o=>o.value===previous))$(id).value=previous;}
function installModel(raw){
  model=prepare(raw).config;
  $('preset').value='custom';
  for(const key of ['N','T','dt','frames','parameters'])$(key).value=model[key];
  $('model-json').value=JSON.stringify(model,null,2);fillFields('seed-field',model);parametersChanged();
  fillFields('wave-field',model);$('wave-radius').value=model.Lx/4;$('wave-shift').value=model.Lx/10;
}
function parametersChanged(){
  const params=parseParameters($('parameters').value),names=Object.keys(params),oldX=$('x-param').value,oldY=$('y-param').value;
  $('x-param').replaceChildren();$('y-param').replaceChildren(new Option('None · 1D scan',''));
  for(const name of names){$('x-param').add(new Option(name,name));$('y-param').add(new Option(name,name));}
  if(names.includes(oldX))$('x-param').value=oldX;if(names.includes(oldY))$('y-param').value=oldY;
  $('sliders').replaceChildren();
  if(!names.length)$('sliders').append(node('p','This model has no named parameters.','subtle'));
  for(const name of names){
    const value=params[name],span=Math.max(Math.abs(value),.1),row=node('div',undefined,'slider-row'),label=node('label',name),output=node('output',fmt(value)),slider=node('input'),pair=node('div',undefined,'pair');
    slider.type='range';slider.setAttribute('aria-label',`${name} value`);slider.min=value-span;slider.max=value+span;slider.step='any';slider.value=value;
    const inputs=[];
    for(const [text,v] of [['Minimum',value-span],['Maximum',value+span]]){const l=node('label',text),input=node('input');input.type='number';input.step='any';input.value=v;input.setAttribute('aria-label',`${name} ${text.toLowerCase()}`);l.append(input);pair.append(l);inputs.push(input);}
    inputs.forEach(input=>input.onchange=attempt(()=>{const [lo,hi]=inputs.map(i=>Number(i.value));if(!Number.isFinite(lo)||!Number.isFinite(hi)||lo>=hi)throw Error('Slider minimum must be smaller than its maximum.');slider.min=lo;slider.max=hi;slider.value=parseParameters($('parameters').value)[name];}));
    slider.oninput=attempt(()=>{$('parameters').value=setParameter($('parameters').value,name,Number(slider.value));const p=parseParameters($('parameters').value);for(const entry of $('sliders').children){const key=entry.dataset.parameter;entry.querySelector('output').textContent=fmt(p[key]);if(key!==name){const s=entry.querySelector('input[type=range]');s.min=Math.min(Number(s.min),p[key]);s.max=Math.max(Number(s.max),p[key]);s.value=p[key];}}$('model-json').value=JSON.stringify({...model,parameters:$('parameters').value},null,2);modelChanged();});
    row.dataset.parameter=name;label.append(' ',output);row.append(label,slider,pair);$('sliders').append(row);
  }
}
function setBusy(value){
  busy=value;document.querySelectorAll('#model-controls input,#model-controls textarea,#model-controls select,#model-controls button').forEach(e=>e.disabled=value);
  $('run').disabled=value;$('cancel').disabled=!value;$('resume').disabled=value||!plan?.jobs.some(j=>['pending','canceled'].includes(j.status));
  $('seed-enable').disabled=value;
  $('map-apply').disabled=value||mapComputing;
}
function updateRecords(){
  const jobs=plan?.jobs||[];$('ledger').replaceChildren();$('selected').replaceChildren();
  for(const job of jobs){
    const row=node('div',undefined,`ledger-row ${job.status}`),copy=node('div'),c=job.config;
    copy.append(node('strong',`${job.id+1}. ${job.label} · ${job.status}`),node('small',`N=${c.N}${c.dimension===2?' × '+c.N:''} · requested Δt=${fmt(c.dt)} · T=${fmt(c.T)}`));
    if(job.error)copy.append(node('small',job.error));row.append(copy);
    if(job.status==='complete'){const button=node('button','Inspect');button.onclick=attempt(()=>selectRun(job.id));row.append(button);$('selected').add(new Option(`${job.id+1}. ${job.label}`,String(job.id)));}
    $('ledger').append(row);
  }
  if(selectedId!==null)$('selected').value=String(selectedId);
  $('selected').disabled=!jobs.some(j=>j.status==='complete');$('export').disabled=!plan;
  $('evidence-export').disabled=!resolution;
  const e=experiment();$('provenance').textContent=e?`${e.solverVersion} · ${e.method} Actual Δt=${e.dt}; ${e.steps} steps; ${e.frames.length} saved frames. Selected run: ${e.config.title}. ${e.warnings?.join(' ')||''}`:'';
  renderMap();
}
function renderResolution(){
  resolution=null;$('resolution').replaceChildren();let series=[];
  if(plan&&['space','time'].includes(plan.kind)){
    if(plan.jobs.every(j=>j.status==='complete')){
      try{
        resolution=compareThree(plan.jobs.map(j=>j.result),plan.kind);
        for(const row of resolution.rows){$('resolution').append(node('h3',`${row.field}: observed order ${fmt(row.observedOrder)}`),node('p',`RMS differences: ${fmt(row.d01)} → ${fmt(row.d12)}. ${row.status}`,'subtle'));series.push({name:row.field,x:[1,2],y:[row.d01,row.d12]});}
        $('resolution').append(node('p',resolution.comparison,'subtle'));
      }catch(e){$('resolution').append(node('p',e.message,'notice'));}
    }else $('resolution').append(node('p','Three completed, compatible levels are required. Failed or canceled runs do not count as accuracy evidence.','subtle'));
  }else $('resolution').append(node('p','Run three spatial levels or three time steps to estimate an observed order.','subtle'));
  drawLines($('resolution-plot'),series,{xlabel:'adjacent comparison',ylabel:'RMS difference',log:true,height:230});$('evidence-export').disabled=!resolution;
}
function runWorker(job,token){
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./studio-worker.js',import.meta.url),{type:'module'});activeWorker=worker;
    const finish=(err,result)=>{worker.terminate();if(activeWorker===worker){activeWorker=null;cancelWorker=null;}err?reject(err):resolve(result);};
    cancelWorker=()=>finish(new Error('Canceled by user.'));
    worker.onmessage=({data})=>{if(token!==queueToken)return;
      if(data.type==='progress')$('progress').value=(plan.jobs.filter(j=>['complete','failed'].includes(j.status)).length+data.value)/plan.jobs.length;
      else if(data.type==='result')finish(null,data.result);else if(data.type==='error')finish(Error(data.message));
    };
    worker.onerror=e=>finish(Error(e.message||'Worker could not run.'));worker.postMessage({action:'run',config:job.config});
  });
}
async function executeQueue(){
  const token=++queueToken;setBusy(true);
  try{
    for(const job of plan.jobs){
      if(!['pending','canceled'].includes(job.status))continue;
      job.status='running';delete job.error;updateRecords();status(`Running ${job.id+1}/${plan.jobs.length}: ${job.label}.`);
      try{const result=await runWorker(job,token);if(token!==queueToken)return;job.result=result;job.status='complete';if(selectedId===null)selectRun(job.id);}
      catch(e){if(token!==queueToken)return;job.status='failed';job.error=e.message;}
      $('progress').value=plan.jobs.filter(j=>['complete','failed'].includes(j.status)).length/plan.jobs.length;renderResolution();updateRecords();
    }
    const completed=plan.jobs.filter(j=>j.status==='complete').length,failed=plan.jobs.filter(j=>j.status==='failed').length;
    status(`Study finished: ${completed} completed, ${failed} failed. ${plan.interpretation}`,failed>0);
  }finally{if(token===queueToken)setBusy(false);}
}
function resetViews(){pause();selectedId=null;observed=null;vectorObservers=null;waves=null;history=null;balance=null;frame=0;fieldRect=null;for(const id of ['play','timeline','export-run','analyze-wave','audit-balance'])$(id).disabled=true;$('time').textContent='No trajectory';drawAll();}
async function startStudy(){
  const options={xParameter:$('x-param').value,yParameter:$('y-param').value,xMin:num('xmin'),xMax:num('xmax'),xCount:num('xcount'),yMin:num('ymin'),yMax:num('ymax'),yCount:num('ycount')};
  const next=buildPlan(readModel(),$('kind').value,options);mapSettings=readMapSettings();plan=next;resetViews();$('progress').value=0;renderResolution();updateRecords();await executeQueue();
}
function selectRun(id){
  pause();selectedId=id;const e=experiment();if(!e)return;frame=0;waves=null;history=null;fillFields('wave-field',e.config);
  balance=selected().balanceAudit||null;fillFields('balance-field',e.config);$('audit-balance').disabled=e.config.boundary!=='nonperiodic';
  $('timeline').max=e.frames.length-1;$('timeline').value=0;for(const key of ['play','timeline','export-run'])$(key).disabled=false;
  $('analyze-wave').disabled=e.config.dimension!==1;
  $('wave-note').textContent='Analyze this run to compute threshold crossings, alignment and disturbance norms.';
  try{applyObservation();}catch(error){$('expression').value='u';$('vector-x').value='';$('vector-y').value='';applyObservation();status(`Observation reset to u: ${error.message}`,true);}
  updateRecords();drawWaves();drawBalance();
}
function applyObservation(){
  const e=experiment();if(!e)return;
  const source=$('expression').value.trim(),observe=makeObserver(e,source),arrays=e.frames.map(observe);
  const vx=$('vector-x').value.trim(),vy=$('vector-y').value.trim();let vectors=null;
  if(vx||vy){if(!vx||!vy||e.config.dimension!==2)throw Error('Vector fields require both expressions and a 2D model.');vectors=[makeObserver(e,vx),makeObserver(e,vy)];vectors.forEach(v=>v(e.frames[frame]));}
  observed=arrays;viewExpression=source;vectorObservers=vectors;range=[Infinity,-Infinity];for(const values of arrays){const s=statistics(values);range[0]=Math.min(range[0],s.min);range[1]=Math.max(range[1],s.max);}
  selected().observation={expression:source,vectorX:vx,vectorY:vy};drawFrame();measure();
}
function drawFrame(){
  const e=experiment();if(!e||!observed){drawLines($('field'),[],{height:360});return;}
  const values=observed[frame],s=statistics(values),fixed=$('scale').value==='fixed',vectors=vectorObservers?.map(v=>v(e.frames[frame]));
  fieldRect=drawField($('field'),e.config,values,fixed?range:[s.min,s.max],{expression:viewExpression,palette:$('palette').value,view:$('view').value,angle:num('angle'),contours:$('contours').checked,vectors});
  selected().presentation={frame,expression:viewExpression,view:$('view').value,palette:$('palette').value,scale:$('scale').value,angle:num('angle'),contours:$('contours').checked,range:fixed?range:[s.min,s.max]};
  $('timeline').value=frame;$('time').textContent=`t=${fmt(e.frames[frame].t)} / ${fmt(e.config.T)}`;
  $('view-note').textContent=`${viewExpression}; ${fixed?'fixed scale across saved frames':'current-frame scale (colors can change between frames)'}. Playback steps through saved frames. ${e.config.dimension===1?'Line connects grid samples; endpoint boundary traces are available in Studio.':'Plane pixels show samples on the numerical grid.'}`;
}
function measure(){
  const e=experiment();if(!e||!observed)return;const settings={expression:viewExpression,statistic:$('statistic').value,x:num('probe-x'),y:num('probe-y')};
  const values=observationHistory(e,viewExpression,settings.statistic,{x:settings.x,y:settings.y});history={settings,values};selected().measurement=history;drawHistory();
}
function drawHistory(){drawLines($('series'),history?[{name:`${history.settings.statistic}(${history.settings.expression})`,x:history.values.map(r=>r.t),y:history.values.map(r=>r.value)}]:[],{height:230});}
function analyzeWave(){
  const settings={level:num('wave-level'),center:num('wave-center'),radius:num('wave-radius'),eta:num('wave-eta'),maxShift:num('wave-shift'),reference:$('wave-ref').value};
  waves=waveDiagnostics(experiment(),num('wave-field'),settings);selected().waveAnalysis=waves;
  const limited=waves.rows.filter(r=>r.atSearchLimit).length,missing=waves.rows.filter(r=>r.position===null).length;
  $('wave-note').textContent=`Reference: ${waves.reference}. ${limited} frames reached the alignment search limit; ${missing} frames lacked a unique threshold crossing. ${waves.limitation}`;drawWaves();
}
function drawWaves(){
  const x=waves?.rows.map(r=>r.t)||[],key=$('motion').value;
  drawLines($('motion-plot'),waves?[{name:key,x,y:waves.rows.map(r=>r[key])}]:[],{ylabel:key});
  drawLines($('norm-plot'),waves?[['globalL2','Global L²'],['localL2','Local L²'],['weightedL2','Weighted L²'],['alignedRms','Aligned RMS']].map(([key,name])=>({name,x,y:waves.rows.map(r=>r[key])})):[],{log:$('wave-log').checked});
}
function waveSettings(){return {level:num('wave-level'),center:num('wave-center'),radius:num('wave-radius'),eta:num('wave-eta'),maxShift:num('wave-shift'),reference:$('wave-ref').value};}
function mapMetric(job){
  if(job.status!=='complete')return null;const key=JSON.stringify(mapSettings);
  if(job.mapMetric?.key!==key){
    try{job.mapMetric={key,...metricValue(job.result,mapSettings)};}
    catch(e){job.mapMetric={key,value:null,reason:e.message};}
  }
  return job.mapMetric;
}
function renderMap(){
  const sensitivities=plan?.kind==='sweep'?sensitivityEstimate(plan,mapMetric):[],display=$('map-display').value;
  atlasRect=drawAtlas($('atlas'),plan,j=>display==='value'?mapMetric(j)?.value:sensitivities.find(r=>r.id===j.id)?.[display]);
  if(plan)plan.map={settings:structuredClone(mapSettings),display,sensitivities};
  $('map-csv').disabled=!plan||plan.kind!=='sweep';
  const definition=mapSettings.kind==='observable'?`${mapSettings.reduction} of ${mapSettings.statistic}(${mapSettings.expression})${mapSettings.reduction==='first-crossing'?`; ${mapSettings.direction} ${mapSettings.threshold}`:''}${mapSettings.statistic==='point'?`; probe (${mapSettings.x}, ${mapSettings.y})`:''}`:mapSettings.kind==='wave'?`Final ${mapSettings.waveMetric}; reference ${mapSettings.wave.reference}; η=${mapSettings.wave.eta}; window ${mapSettings.wave.center} ± ${mapSettings.wave.radius}; shift search ±${mapSettings.wave.maxShift}`:'Maximum absolute saved-frame mass-balance defect';
  $('map-definition').textContent=`Applied: ${definition}. ${display==='value'?'Metric values.':`Sensitivity to ${display==='x'?plan?.options.xParameter||'X':plan?.options.yParameter||'Y'}; centered secants inside the grid, one-sided at edges.`}`;
  const job=selected(),metric=job?mapMetric(job):null,s=sensitivities.find(r=>r.id===selectedId);
  $('map-selection').textContent=job?`${job.label}: ${metric?.value===null?metric.reason:fmt(metric?.value)}${s?`; X sensitivity ${fmt(s.x)}, Y sensitivity ${fmt(s.y)}`:''}.`:'';
}
function readMapSettings(){return {kind:$('map-kind').value,expression:$('map-expression').value.trim(),statistic:$('map-stat').value,reduction:$('map-reduction').value,threshold:num('map-threshold'),direction:$('map-direction').value,x:num('map-probe-x'),y:num('map-probe-y'),field:num('wave-field'),waveMetric:$('map-wave-metric').value,wave:waveSettings()};}
async function applyMap(){
  if(busy||mapComputing)throw Error('Wait for the current computation or cancel the study before changing the map metric.');
  mapSettings=readMapSettings();mapComputing=true;$('map-apply').disabled=true;$('run').disabled=true;$('resume').disabled=true;
  try{for(const job of plan?.jobs||[]){mapMetric(job);await new Promise(r=>setTimeout(r,0));}renderMap();const unavailable=plan?.jobs.filter(j=>j.status==='complete'&&j.mapMetric?.value===null).length||0;status(`Map metric updated. ${unavailable} completed runs have an unavailable metric; their reasons remain in the export. Saved-frame events and maxima can miss changes between frames.`);}
  finally{mapComputing=false;setBusy(busy);}
}
function auditSelected(){balance=balanceAudit(experiment(),num('balance-field'));selected().balanceAudit=balance;drawBalance();}
function drawBalance(){
  const rows=balance?.rows||[],x=rows.map(r=>r.t),curve=(key,name)=>({name,x,y:rows.map(r=>r[key])});
  drawLines($('balance-rates'),balance?[curve('boundaryRate','Boundary diffusion'),curve('bulkRate','Other PDE terms'),curve('totalRate','Total rate')]:[],{ylabel:'content / time',height:230});
  drawLines($('balance-content'),balance?[curve('massChange','Measured change'),curve('integratedInput','Integrated input')]:[],{ylabel:'content change',height:230});
  drawLines($('balance-defect'),balance?[curve('balanceDefect','Change − integrated input')]:[],{ylabel:'balance defect',height:210});
  $('balance-sides').replaceChildren();
  $('balance-csv').disabled=!balance;
  if(balance){
    $('balance-note').textContent=`Field ${balance.field}. Maximum absolute balance defect ${fmt(balance.maximumAbsoluteDefect)}; operator closure ${fmt(balance.maximumOperatorClosure)}; normalized boundary-row residual ${fmt(balance.maximumBoundaryResidual)}. ${balance.interpretation}`;
    const table=node('table'),head=node('tr');['Boundary side','Final diffusive input rate'].forEach(v=>head.append(node('th',v)));table.append(head);
    for(const [side,value] of Object.entries(rows.at(-1).sideRates)){const r=node('tr');r.append(node('td',side),node('td',fmt(value)));table.append(r);}$('balance-sides').append(table);
  }else $('balance-note').textContent='Recompute diffusive boundary input and other PDE terms from saved arrays. Available for second-order bounded models, including Robin.';
}
function drawAll(){drawFrame();renderResolution();drawHistory();drawWaves();drawBalance();updateRecords();}
function encodeModel(c){return btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(c)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function shareModel(){const encoded=encodeModel(readModel());if(encoded.length>16000)throw Error('The model link exceeds 16,000 characters. Export JSON instead.');$('share-box').hidden=false;$('share-link').value=`${location.origin}${location.pathname}#experiment=${encoded}`;status('Model link prepared. It shares configuration only and never runs automatically.');}
function exportStudy(){download('phaseatlas-study.json',{...plan,workbenchVersion:'phaseatlas-research-1.1.0',resolution,selectedRunId:selectedId,interpretation:plan.interpretation});}
async function importModel(event){
  const file=event.target.files[0];if(!file)return;
  try{
    if(file.size>180000000)throw Error('JSON exceeds the 180 MB import limit.');
    const payload=JSON.parse(await file.text()),candidate=payload.baseConfig||payload.config||payload;installModel(candidate);
    if(payload.schema==='phaseatlas-study/v1'&&['single','space','time','sweep'].includes(payload.kind)){
      $('kind').value=payload.kind;kindChanged();const keys={'x-param':'xParameter','y-param':'yParameter',xmin:'xMin',xmax:'xMax',xcount:'xCount',ymin:'yMin',ymax:'yMax',ycount:'yCount'};
      for(const [id,key] of Object.entries(keys))if(payload.options?.[key]!==undefined)$(id).value=payload.options[key];
      if(payload.map?.settings){
        const s=payload.map.settings,keys={'map-kind':'kind','map-expression':'expression','map-stat':'statistic','map-reduction':'reduction','map-threshold':'threshold','map-direction':'direction','map-probe-x':'x','map-probe-y':'y','map-wave-metric':'waveMetric'};
        for(const [id,key] of Object.entries(keys))if(s[key]!==undefined&&['string','number'].includes(typeof s[key]))$(id).value=s[key];
        fillFields('wave-field',model);$('wave-field').value=s.field??0;
        for(const [id,key] of Object.entries({'wave-level':'level','wave-center':'center','wave-radius':'radius','wave-eta':'eta','wave-shift':'maxShift','wave-ref':'reference'}))if(s.wave?.[key]!==undefined)$(id).value=s.wave[key];
        if(['value','x','y'].includes(payload.map.display))$('map-display').value=payload.map.display;
      }
    }
    status('Imported model and available study settings. Saved results are not adopted; choose Run study to recompute them.');
  }finally{event.target.value='';}
}
function kindChanged(){$('scan-controls').hidden=$('kind').value!=='sweep';}
function seedAt(event){
  if(!$('seed-enable').checked||!fieldRect||busy)return;
  const c=readModel(),e=experiment(),r=$('field').getBoundingClientRect(),px=event.clientX-r.left,py=event.clientY-r.top,{left,top,width,height}=fieldRect;
  if(px<left||px>left+width||py<top||py>top+height)return;
  if(c.boundary!==e.config.boundary||c.dimension!==e.config.dimension||c.Lx!==e.config.Lx||c.Ly!==e.config.Ly||c.fields.length!==e.config.fields.length)throw Error('Run the changed domain before editing seeds on its plot.');
  const x=(px-left)/width*c.Lx-c.Lx/2,y=c.dimension===2?(1-(py-top)/height)*c.Ly-c.Ly/2:0;
  installModel(gaussianSeed(c,num('seed-field'),x,y,num('seed-amplitude'),num('seed-radius')));status(`Initial-data seed added at x=${fmt(x)}${c.dimension===2?`, y=${fmt(y)}`:''}. Run to evolve the edited model. The previous trajectory is unchanged.`);
}
function selectAtlas(event){
  if(!atlasRect)return;const b=$('atlas').getBoundingClientRect(),x=event.clientX-b.left,y=event.clientY-b.top,{left,top,width,height,nx,ny}=atlasRect;
  if(x<left||x>=left+width||y<top||y>=top+height)return;
  const i=Math.floor((x-left)/width*nx),j=ny-1-Math.floor((y-top)/height*ny),job=plan.jobs.find(q=>q.coordinates.i===i&&q.coordinates.j===j);
  if(job.status==='complete')selectRun(job.id);else status(`${job.label}: ${job.status}. ${job.error||'No completed trajectory is available.'}`,job.status==='failed');
}

$('preset').add(new Option('Custom / imported model','custom'));PRESETS.forEach(p=>$('preset').add(new Option(p.label,p.id)));
installModel({...presetConfig('cooled-rod'),N:16,T:.25,dt:.0005,frames:31});$('preset').value='cooled-rod';
if(location.hash.startsWith('#experiment=')){
  try{const encoded=location.hash.slice(12);if(encoded.length>16000)throw Error('Model link exceeds 16,000 characters.');installModel(JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(encoded.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0)))));status('Shared model loaded. Review its settings, then choose Run study.');}catch(e){status(`Could not load model link: ${e.message}`,true);}
}
$('preset').onchange=attempt(()=>{const id=$('preset').value;if(id==='custom')return;installModel(presetConfig(id));$('preset').value=id;modelChanged();});
$('parameters').onchange=attempt(()=>{parametersChanged();modelChanged();});
for(const id of ['N','T','dt','frames'])$(id).onchange=modelChanged;
$('apply-json').onclick=attempt(()=>{installModel(JSON.parse($('model-json').value));modelChanged();});
$('kind').onchange=kindChanged;$('run').onclick=attempt(startStudy);$('resume').onclick=attempt(executeQueue);
$('cancel').onclick=()=>{++queueToken;const job=plan?.jobs.find(j=>j.status==='running');if(job){job.status='canceled';job.error='Canceled by user.';}cancelWorker?.();setBusy(false);renderResolution();updateRecords();status('Study canceled. Completed runs are retained; resume continues pending and canceled jobs.');};
$('selected').onchange=attempt(()=>selectRun(num('selected')));$('apply-view').onclick=attempt(applyObservation);$('measure').onclick=attempt(measure);
for(const id of ['view','palette','scale','contours','angle'])$(id).oninput=attempt(drawFrame);
$('play').onclick=()=>{playing=!playing;$('play').textContent=playing?'Pause':'Play';};$('timeline').oninput=attempt(()=>{pause();frame=num('timeline');drawFrame();});
$('analyze-wave').onclick=attempt(analyzeWave);$('motion').onchange=drawWaves;$('wave-log').onchange=drawWaves;
$('map-stat').onchange=attempt(applyMap);$('map-apply').onclick=attempt(applyMap);$('map-display').onchange=renderMap;$('audit-balance').onclick=attempt(auditSelected);$('atlas').onclick=attempt(selectAtlas);$('field').onclick=attempt(seedAt);$('seed-enable').onchange=()=>{$('field').classList.toggle('seed-active',$('seed-enable').checked);};
$('map-csv').onclick=()=>{const sensitivity=sensitivityEstimate(plan,mapMetric);downloadCSV('phaseatlas-parameter-metrics.csv',['run_id','status','x_parameter','x_value','y_parameter','y_value','metric','value','sensitivity_x','sensitivity_y','missing_reason','solver_version','metric_settings'],plan.jobs.map(j=>{const m=mapMetric(j),s=sensitivity.find(s=>s.id===j.id);return [j.id,j.status,plan.options.xParameter,j.coordinates.x,plan.options.yParameter,j.coordinates.y,m?.definition||JSON.stringify(mapSettings),m?.value,s?.x,s?.y,m?.reason||j.error||'',j.result?.solverVersion,JSON.stringify(mapSettings)];}));};
$('balance-csv').onclick=()=>{const columns=['t','mass','boundaryRate','bulkRate','totalRate','massChange','integratedInput','balanceDefect','operatorClosure','boundaryResidual'];downloadCSV('phaseatlas-balance-audit.csv',[...columns,'leftInput','rightInput','bottomInput','topInput'],balance.rows.map(r=>[...columns.map(k=>r[k]),...['left','right','bottom','top'].map(s=>r.sideRates[s])]));};
$('import').onchange=attempt(importModel);$('share').onclick=attempt(shareModel);$('export').onclick=attempt(exportStudy);
$('export-run').onclick=()=>download('phaseatlas-selected-experiment.json',experiment());
$('evidence-export').onclick=()=>download('phaseatlas-evidence-bundle.json',{schema:'phaseatlas-evidence-bundle/v1',sources:plan.jobs.map(j=>({name:j.label,experiment:j.result}))});
let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>attempt(drawAll)(),100);});
function tick(now){if(playing&&experiment()&&now-lastTick>100){frame=(frame+1)%experiment().frames.length;try{drawFrame();}catch(e){pause();status(e.message,true);}lastTick=now;}requestAnimationFrame(tick);}requestAnimationFrame(tick);
drawAll();
