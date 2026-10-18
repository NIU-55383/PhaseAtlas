import {PRESETS, presetConfig} from './studio-presets.js';
import {prepare, makeGrid, validateConfig} from './studio-solver.js';
import {parseParameters, parseExpression, evaluate} from './studio-expression.js';
import {boundaryWeights} from './studio-fourth.js';
import {attachResearchWorkbench} from './research-bridge.mjs';

const $ = id => document.getElementById(id);
const colors = ['#0000cd', '#c96428', '#8275bc'];
let result = null, refinement = null, worker = null, busy = false, frame = 0, field = 0, playing = false, animation = 0;
let grid = null, ranges = [], referenceAsts = [], referenceContext = {}, lastTick = 0, toastTimer;
const fmt = n => n === null || n === undefined || !Number.isFinite(n) ? '—' : n === 0 ? '0' : Math.abs(n) < .001 || Math.abs(n) >= 10000 ? n.toExponential(2) : Number(n.toPrecision(4)).toString();
const escapeXML = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const exportButtons = ['export-studio-json', 'export-studio-csv', 'export-studio-figure', 'export-studio-video', 'export-studio-config'];
function toast(text) { $('studio-toast').textContent = text; $('studio-toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('studio-toast').classList.remove('visible'), 5500); }
function status(text, error = false) { $('studio-status').textContent = text; $('studio-status').classList.toggle('error', error); }
function pause() { playing = false; cancelAnimationFrame(animation); $('studio-play').textContent = '▶'; $('studio-play').setAttribute('aria-label', 'Play animation'); }
function play() {
  if (!result) return;
  playing = true; $('studio-play').textContent = 'Ⅱ'; $('studio-play').setAttribute('aria-label', 'Pause animation'); lastTick = 0;
  function tick(now) {
    if (!playing) return;
    if (now - lastTick >= 1000 / (12 * Number($('studio-speed').value))) { frame = (frame + 1) % result.frames.length; renderFrame(); lastTick = now; }
    animation = requestAnimationFrame(tick);
  }
  animation = requestAnimationFrame(tick);
}

function editorFields(count, values = []) {
  $('field-editors').replaceChildren();
  for (let i = 0; i < count; i++) {
    const name = ['u','v','w'][i], wrapper = document.createElement('div'); wrapper.className = 'field-editor';
    // Fixed labels are markup; all supplied equation text is assigned through .value.
    wrapper.innerHTML = `<label><span class="equation-label">∂${name} / ∂t =</span><textarea id="rhs-${name}" rows="2" spellcheck="false" aria-label="Right-hand side for ${name}"></textarea></label><label>${name}(x${Number($('dimension').value) === 2 ? ', y' : ''}, 0)<textarea id="initial-${name}" rows="2" spellcheck="false" aria-label="Initial data for ${name}"></textarea></label><details><summary>Reference formula (optional)</summary><label>Compare against ${name}(x, t)<textarea id="exact-${name}" rows="2" spellcheck="false" aria-label="Reference formula for ${name}"></textarea></label><p class="helper">A comparison function, not an automatically verified exact solution.</p></details>`;
    $('field-editors').append(wrapper);
    $(`rhs-${name}`).value = values[i]?.rhs ?? '0.1*lap('+name+')';
    $(`initial-${name}`).value = values[i]?.initial ?? (i === 0 ? 'sin(2*pi*x/Lx)' : '0');
    $(`exact-${name}`).value = values[i]?.exact ?? '';
    const edges=document.createElement('details');edges.className='boundary-editor';edges.open=true;
    edges.innerHTML=`<summary>Boundary data for ${name}</summary>`;
    for(const side of ['left','right','bottom','top']){
      const row=document.createElement('div');row.className='boundary-row';row.dataset.side=side;
      row.innerHTML=`<label>${side[0].toUpperCase()+side.slice(1)} edge<select id="bc-${name}-${side}-type" aria-label="${name} ${side} boundary type"><option value="dirichlet">Dirichlet · value</option><option value="neumann">Neumann · ∂n</option><option value="robin">Robin · αu + β∂n u</option></select></label><label>Target g<input id="bc-${name}-${side}-value" spellcheck="false" aria-label="${name} ${side} boundary expression"></label><div class="robin-weights hidden"><label>α · value coefficient<input id="bc-${name}-${side}-alpha" spellcheck="false" aria-label="${name} ${side} Robin alpha"></label><label>β · normal coefficient<input id="bc-${name}-${side}-beta" spellcheck="false" aria-label="${name} ${side} Robin beta"></label><p class="helper">αu + β∂n u = g. Constant parameters; α, β ≥ 0, not both zero.</p></div>`;
      edges.append(row);
    }
    wrapper.append(edges);
    for(const side of ['left','right','bottom','top']){
      $(`bc-${name}-${side}-type`).value=values[i]?.boundaries?.[side]?.type??($('boundary-mode').value==='neumann'?'neumann':'dirichlet');
      $(`bc-${name}-${side}-value`).value=values[i]?.boundaries?.[side]?.value??'0';
      $(`bc-${name}-${side}-alpha`).value=values[i]?.boundaries?.[side]?.alpha??'1';
      $(`bc-${name}-${side}-beta`).value=values[i]?.boundaries?.[side]?.beta??'1';
    }
    const fourth=document.createElement('details');fourth.className='fourth-boundary-editor';fourth.open=true;fourth.innerHTML=`<summary>Four boundary conditions for ${name}</summary><p class="helper">Two independent rows at each endpoint. ∂n = −∂x at left and +∂x at right; odd derivative signs reverse at the left endpoint.</p>`;
    for(const side of ['left','right']){
      const endpoint=document.createElement('div');endpoint.className='fourth-endpoint';endpoint.innerHTML=`<label>${side==='left'?'Left':'Right'} endpoint<select class="fourth-pair" data-field="${name}" data-side="${side}" id="fourth-${name}-${side}-pair"><option value="custom">Custom conditions</option><option value="01">Zero value + slope</option><option value="02">Zero value + curvature</option><option value="13">Zero first + third derivatives</option><option value="23">Zero second + third derivatives</option></select></label>`;
      for(let k=0;k<2;k++){
        const prefix=`fourth-${name}-${side}-${k}`,condition=document.createElement('div');condition.className='fourth-condition';condition.dataset.prefix=prefix;
        condition.innerHTML=`<div class="boundary-row"><label>Condition ${k+1}<select class="fourth-order-select" id="${prefix}-order" aria-label="${name} ${side} condition ${k+1} operator"><option value="0">u · value</option><option value="1">∂n u · slope</option><option value="2">∂n² u · curvature</option><option value="3">∂n³ u</option><option value="custom">Linear combination</option></select></label><label>Equals<input id="${prefix}-value" spellcheck="false" aria-label="${name} ${side} condition ${k+1} target"></label></div><div class="fourth-weights"><p class="helper">a₀u + a₁∂n u + a₂∂n² u + a₃∂n³ u</p><div class="fourth-coefficients">${[0,1,2,3].map(j=>`<label>a${j}<input class="fourth-coefficient" id="${prefix}-a${j}" spellcheck="false" aria-label="${name} ${side} condition ${k+1} coefficient ${j}"></label>`).join('')}</div><p class="helper">Constant expressions or parameters; targets may depend on x and t.</p></div>`;
        endpoint.append(condition);
      }
      fourth.append(endpoint);
    }
    wrapper.append(fourth);
    for(const side of ['left','right'])for(let k=0;k<2;k++){
      const prefix=`fourth-${name}-${side}-${k}`,bc=values[i]?.boundaries?.[side]?.conditions?.[k],coefficients=bc?.coefficients??boundaryWeights(k);
      coefficients.forEach((v,j)=>{$(`${prefix}-a${j}`).value=v;});$(`${prefix}-value`).value=bc?.value??'0';
      const simple=[0,1,2,3].find(order=>JSON.stringify(coefficients)===JSON.stringify(boundaryWeights(order)));$(`${prefix}-order`).value=simple===undefined?'custom':String(simple);fourthRowDisplay(prefix);
    }
  }
  boundaryDisplay();
}
function readFields() { return ['u','v','w'].slice(0, Number($('field-count').value)).map(name => ({rhs: $(`rhs-${name}`)?.value || '0', initial: $(`initial-${name}`)?.value || '0', exact: $(`exact-${name}`)?.value || '', boundaries:Object.fromEntries(['left','right','bottom','top'].map(side=>[side,{type:$(`bc-${name}-${side}-type`)?.value??'dirichlet',value:$(`bc-${name}-${side}-value`)?.value??'0',alpha:$(`bc-${name}-${side}-alpha`)?.value??'1',beta:$(`bc-${name}-${side}-beta`)?.value??'1',...(['left','right'].includes(side)?{conditions:[0,1].map(k=>({coefficients:[0,1,2,3].map(j=>$(`fourth-${name}-${side}-${k}-a${j}`)?.value??(j===k?'1':'0')),value:$(`fourth-${name}-${side}-${k}-value`)?.value??'0'}))}:{})}]))})); }
function fourthRowDisplay(prefix){$(`${prefix}-order`).closest('.fourth-condition').querySelector('.fourth-weights').classList.toggle('hidden',$(`${prefix}-order`).value!=='custom');}
function boundaryDisplay(){
  const periodic=$('boundary-mode').value==='periodic',fourth=$('boundary-mode').value==='fourth-order',two=$('dimension').value==='2';
  document.querySelectorAll('.boundary-editor').forEach(el=>el.classList.toggle('hidden',periodic||fourth));
  document.querySelectorAll('.fourth-boundary-editor').forEach(el=>el.classList.toggle('hidden',!fourth));
  document.querySelectorAll('.boundary-row').forEach(el=>el.classList.toggle('hidden',!two&&['bottom','top'].includes(el.dataset.side)));
  document.querySelectorAll('.boundary-editor .boundary-row').forEach(el=>el.querySelector('.robin-weights').classList.toggle('hidden',el.querySelector('select').value!=='robin'));
  $('boundary-help').classList.toggle('hidden',periodic||fourth);$('fourth-help').classList.toggle('hidden',!fourth);$('dimension').querySelector('option[value="2"]').disabled=fourth;
  $('domain-help').textContent=periodic?'x ∈ [−Lx/2, Lx/2). Opposite edges are joined.':'x ∈ [−Lx/2, Lx/2]'+(two?', y ∈ [−Ly/2, Ly/2].':'.')+' Values are computed at cell centers; each edge has its own boundary data.';
}
const boundaryLabel=c=>c.boundary==='periodic'?'periodic':c.boundary==='fourth-order'?'fourth-order boundary conditions':'Dirichlet / Neumann / Robin';
function dimensions() {
  const two = $('dimension').value === '2'; $('length-y-label').classList.toggle('hidden', !two);
  [...$('grid-size').options].forEach(o => { o.disabled = two && Number(o.value) > 128; });
  if (two && Number($('grid-size').value) > 128) $('grid-size').value = '64';
  boundaryDisplay();
}
function applyConfig(c,presetId='') {
  $('preset').value=presetId;
  $('experiment-title').value = c.title; $('dimension').value = String(c.dimension); $('field-count').value = String(c.fields.length);
  $('boundary-mode').value=c.boundary==='periodic'||!c.boundary?'periodic':c.boundary==='fourth-order'?'fourth-order':'nonperiodic';
  if(['dirichlet','neumann'].includes(c.boundary))c={...c,fields:c.fields.map(f=>({...f,boundaries:f.boundaries??Object.fromEntries(['left','right','bottom','top'].map(side=>[side,{type:c.boundary,value:'0'}]))}))};
  $('parameters').value = c.parameters; $('length-x').value = c.Lx; $('length-y').value = c.Ly;
  $('end-time').value = c.T; $('time-step').value = c.dt; $('grid-size').value = String(c.N);
  if (![...$('frame-count').options].some(o => Number(o.value) === c.frames)) $('frame-count').add(new Option(String(c.frames), String(c.frames)));
  $('frame-count').value = String(c.frames); editorFields(c.fields.length, c.fields); dimensions();
}
function readConfig() { return {title: $('experiment-title').value, dimension: Number($('dimension').value), fields: readFields(), parameters: $('parameters').value, Lx: Number($('length-x').value), Ly: Number($('length-y').value), N: Number($('grid-size').value), T: Number($('end-time').value), dt: Number($('time-step').value), frames: Number($('frame-count').value), boundary: ['periodic','fourth-order'].includes($('boundary-mode').value)?$('boundary-mode').value:'nonperiodic'}; }
function changed() { if (!busy) { status('Settings changed. Run to update the figures; exports retain the last successful experiment.'); $('result-state').textContent = result ? 'Previous run' : 'Ready'; } }
function setBusy(value) {
  busy = value;
  document.querySelectorAll('.studio-editor input,.studio-editor textarea,.studio-editor select').forEach(el => { el.disabled = value; });
  $('run-studio').disabled = value; $('refine-studio').disabled = value || !result;
  $('cancel-studio').classList.toggle('hidden', !value); $('studio-progress').classList.toggle('hidden', !value);
  $('import-studio').disabled = value;
  if (value) $('studio-progress').value = 0;
}
function startWorker(action, payload) {
  pause(); worker?.terminate(); setBusy(true); $('result-state').textContent = action === 'run' ? 'Computing' : 'Checking';
  worker = new Worker(new URL('./studio-worker.js', import.meta.url), {type: 'module'});
  const fail = message => { worker?.terminate(); worker = null; setBusy(false); status(message + (result ? ' Previous successful results are retained.' : ''), true); $('result-state').textContent = 'Needs attention'; };
  worker.onerror = e => { e.preventDefault(); fail(e.message || 'The computation worker could not start.'); };
  worker.onmessage = ({data}) => {
    if (data.type === 'progress') { $('studio-progress').value = data.value; status(`${data.label || 'Computing'} · ${Math.round(data.value * 100)}%`); }
    if (data.type === 'error') fail(data.message);
    if (data.type === 'result') {
      worker.terminate(); worker = null; setBusy(false); acceptResult(data.result);
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) play();
    }
    if (data.type === 'refinement') {
      worker.terminate(); worker = null; setBusy(false); refinement = data.result; renderRefinement();
      status('Two refinement comparisons completed. Inspect the differences before drawing conclusions.'); $('result-state').textContent = 'Compared';
    }
  };
  worker.postMessage({action, ...payload});
}
function run() {
  try { const c = prepare(readConfig()).config; status('Starting the numerical evolution…'); startWorker('run', {config: c}); }
  catch (e) { status(e.message, true); $('result-state').textContent = 'Check equation'; }
}
function acceptResult(next) {
  result = next; refinement = null; frame = 0; field = 0; grid = makeGrid(next.config);
  const c = result.config;
  referenceContext = {...parseParameters(c.parameters), x: grid.x, y: grid.y, Lx: c.Lx, Ly: c.Ly};
  referenceAsts = c.fields.map(f => f.exact ? parseExpression(f.exact, [...Object.keys(referenceContext), 't']) : null);
  ranges = c.fields.map((_, f) => {
    let min = Infinity, max = -Infinity;
    for (const snapshot of result.frames) { min = Math.min(min, snapshot.diagnostics[f].min); max = Math.max(max, snapshot.diagnostics[f].max); if(c.dimension===1&&snapshot.boundaryFaces){const edges=Object.values(snapshot.boundaryFaces[f]).flat();min=Math.min(min,...edges);max=Math.max(max,...edges);} }
    if (max-min < 1e-12) { min -= Math.max(1, Math.abs(min))*.05; max += Math.max(1, Math.abs(max))*.05; }
    return [min, max];
  });
  $('display-field').replaceChildren(...c.fields.map((f, i) => new Option(f.name, String(i))));
  $('studio-timeline').max = result.frames.length - 1;
  $('result-title').textContent = c.title; $('result-state').textContent = 'Computed';
  $('method-description').textContent = `${result.method} Actual Δt = ${fmt(result.dt)}; ${result.steps} steps. Runtime ${(result.elapsedMs/1000).toFixed(2)} s. `+(c.boundary==='periodic'?`Initial projection difference: ${fmt(result.initialProjectionRelativeL2)} (relative L²).`:`Largest implicit-solve residual: ${fmt(result.linearSolve.maxAbsoluteResidual)} (${c.boundary==='fourth-order'?'infinity norm; backward error '+fmt(result.linearSolve.maxRelativeBackwardError):'absolute Euclidean norm'}). Initial boundary mismatch: ${result.initialBoundaryMismatch.map(fmt).join(', ')}. Reactions and transport remain explicit; time-step refinement is essential.`);
  $('studio-warnings').replaceChildren(...result.warnings.map(w => {const li = document.createElement('li'); li.textContent = w; return li;}));
  const resolutionWarnings=result.warnings.filter(w=>!w.startsWith('A smooth animation')&&!w.startsWith('A completed bounded-domain run')&&!w.startsWith('A completed fourth-order run')&&!w.includes('remain explicit'));
  $('quality-note').textContent=resolutionWarnings.join(' ');$('quality-note').classList.toggle('visible',resolutionWarnings.length>0);
  $('refinement-result').innerHTML = '<p class="helper">Not checked for this run. Compare time and spatial resolution separately.</p>';
  exportButtons.forEach(id => { $(id).disabled = false; }); $('refine-studio').disabled = false;
  $('share-link-box').classList.add('hidden');
  status(`Completed · ${result.steps} steps · Δt=${fmt(result.dt)} · ${(result.elapsedMs/1000).toFixed(2)} s. Resolution has not yet been checked.`);
  renderAll();
  try { localStorage.setItem('phaseatlas-studio-last', JSON.stringify(c)); } catch {}
}

function canvas(id) {
  const element = $(id), rect = element.getBoundingClientRect(), width = Math.max(180, rect.width), height = Math.max(100, rect.height), dpr = Math.min(devicePixelRatio || 1, 2);
  element.width = Math.round(width*dpr); element.height = Math.round(height*dpr);
  const ctx = element.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0); ctx.fillStyle = '#fff'; ctx.fillRect(0,0,width,height);
  return {ctx, width, height};
}
function axes(ctx, width, height, {xmin, xmax, ymin, ymax, xlabel='x', ylabel='', log=false, equalAspect=false}, drawGrid=true) {
  const p = {left:50, right:17, top:20, bottom:33};
  let W = width-p.left-p.right, H = height-p.top-p.bottom;
  if(equalAspect){const ratio=(xmax-xmin)/(ymax-ymin);if(W/H>ratio){const fitted=H*ratio;p.left+=(W-fitted)/2;p.right+=(W-fitted)/2;W=fitted;}else{const fitted=W/ratio;p.top+=(H-fitted)/2;p.bottom+=(H-fitted)/2;H=fitted;}}
  const X = x => p.left+(x-xmin)/(xmax-xmin)*W, Y = y => p.top+H-(y-ymin)/(ymax-ymin)*H;
  ctx.font='10px Arial'; ctx.lineWidth=1; ctx.fillStyle='#65718a'; ctx.setLineDash([]);
  for (let i=0;i<=4;i++) {
    const x=xmin+(xmax-xmin)*i/4, y=ymin+(ymax-ymin)*i/4;
    if(drawGrid){ctx.strokeStyle='#edf0f5';ctx.beginPath();ctx.moveTo(p.left,Y(y));ctx.lineTo(width-p.right,Y(y));ctx.stroke();}
    ctx.textAlign='right';ctx.fillText(log ? `10^${fmt(y)}` : fmt(y),p.left-8,Y(y)+3);
    ctx.textAlign='center';ctx.fillText(fmt(x),X(x),height-p.bottom+17);
  }
  ctx.textAlign='left';ctx.fillText(ylabel,p.left,10);ctx.textAlign='right';ctx.fillText(xlabel,width-p.right,height-1);
  return {p,W,H,X,Y};
}
function lines(ctx, geometry, series) {
  const {p,W,H,X,Y}=geometry; ctx.save(); ctx.beginPath();ctx.rect(p.left,p.top,W,H);ctx.clip();
  for(const s of series){ctx.strokeStyle=s.color||colors[0];ctx.lineWidth=s.width||1.8;ctx.setLineDash(s.dashed?[5,4]:[]);ctx.beginPath();s.y.forEach((y,i)=>i?ctx.lineTo(X(s.x[i]),Y(y)):ctx.moveTo(X(s.x[i]),Y(y)));ctx.stroke();}
  ctx.restore();ctx.setLineDash([]);
}
function color(value) {
  const stops=[[0,0,128],[0,0,205],[119,119,232],[245,245,255],[238,196,145],[201,100,40]];
  const z=Math.max(0,Math.min(1,value))*(stops.length-1), a=Math.min(stops.length-2,Math.floor(z)), t=z-a;
  return stops[a].map((v,i)=>Math.round(v*(1-t)+stops[a+1][i]*t));
}
function paintRaster(ctx, width, height, values, nx, ny, range, bounds) {
  const image=document.createElement('canvas');image.width=nx;image.height=ny;const ic=image.getContext('2d'), pixels=ic.createImageData(nx,ny);
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const rgb=color((values[j*nx+i]-range[0])/(range[1]-range[0])), p=((ny-1-j)*nx+i)*4;pixels.data.set([...rgb,255],p);}
  ic.putImageData(pixels,0,0);
  const g=axes(ctx,width,height,bounds,false);ctx.imageSmoothingEnabled=false;ctx.drawImage(image,g.p.left,g.p.top,g.W,g.H);return g;
}
function reference(data,index,f) {
  if(!referenceAsts[f])return null;
  const a=evaluate(referenceAsts[f],{...referenceContext,t:data.frames[index].t},grid);
  return typeof a==='number'?Array(grid.size).fill(a):Array.from(a);
}
function fieldCurves(data,index,f){
  const c=data.config,s=data.frames[index],values=s.values[f],ref=reference(data,index,f);
  if(c.boundary==='periodic'){
    const x=Array.from({length:c.N+1},(_,i)=>-c.Lx/2+i*c.Lx/c.N);
    return [{x,y:[...values,values[0]],color:colors[f]},...(ref?[{x,y:[...ref,ref[0]],color:'#7a8195',dashed:true,width:1.3}]:[])];
  }
  const edges=s.boundaryFaces[f],curves=[{x:[-c.Lx/2,...grid.x,c.Lx/2],y:[edges.left[0],...values,edges.right[0]],color:colors[f]}];
  if(ref){const endpoint=x=>evaluate(referenceAsts[f],{...referenceContext,x,y:0,t:s.t}),left=endpoint(-c.Lx/2),right=endpoint(c.Lx/2),finite=Number.isFinite(left)&&Number.isFinite(right);curves.push({x:finite?curves[0].x:Array.from(grid.x),y:finite?[left,...ref,right]:ref,color:'#7a8195',dashed:true,width:1.3});}
  return curves;
}
function paintField(ctx,width,height,data,index,f) {
  const c=data.config, values=data.frames[index].values[f], range=ranges[f];ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);
  if(c.dimension===2)return paintRaster(ctx,width,height,values,c.N,c.N,range,{xmin:-c.Lx/2,xmax:c.Lx/2,ymin:-c.Ly/2,ymax:c.Ly/2,xlabel:'x',ylabel:'y',equalAspect:true});
  const span=range[1]-range[0];
  const g=axes(ctx,width,height,{xmin:-c.Lx/2,xmax:c.Lx/2,ymin:range[0]-.08*span,ymax:range[1]+.08*span,xlabel:'x',ylabel:c.fields[f].name});
  lines(ctx,g,fieldCurves(data,index,f));return g;
}
function renderFrame() {
  if(!result)return;
  const c=result.config, snapshot=result.frames[frame], d=snapshot.diagnostics[field];
  $('studio-timeline').value=frame;$('studio-frame-label').textContent=`${frame} / ${result.frames.length-1}`;
  $('stat-time').textContent=fmt(snapshot.t);$('stat-grid').textContent=`${c.N}${c.dimension===2?' × '+c.N:''} ${c.boundary==='periodic'?'grid · periodic':'cells · bounded'}`;
  $('stat-range').textContent=`${fmt(d.min)} … ${fmt(d.max)}`;$('stat-field').textContent=`Field ${c.fields[field].name}`;
  $('stat-rms').textContent=fmt(d.rms);$('stat-mean').textContent=`Mean ${fmt(d.mean)}`;
  $('stat-error').textContent=d.referenceRelativeL2 !== undefined ? fmt(d.referenceRelativeL2 ?? d.referenceRmsError) : '—';
  $('stat-reference').textContent=d.referenceRelativeL2 !== undefined ? d.referenceRelativeL2===null ? 'Absolute RMS · zero reference' : 'Relative L² · supplied formula' : 'No reference formula';
  let checkBox=$('reference-check');
  if(!checkBox){checkBox=document.createElement('p');checkBox.id='reference-check';checkBox.className='helper';$('refinement-result').after(checkBox);}
  const check=result.referenceChecks?.[field];
  checkBox.textContent=check?`Supplied reference: initial RMS mismatch ${fmt(check.initialRmsMismatch)}; largest sampled PDE residual RMS ${fmt(check.maximumSampledRmsResidual)} at t = 0, T/2, T. `+(c.boundary==='periodic'?'These use spectral spatial and finite-difference time derivatives.':'These use the '+(c.boundary==='fourth-order'?'finite-difference':'finite-volume')+' spatial operator and finite-difference time derivatives. Maximum sampled boundary mismatch: '+fmt(check.maximumBoundaryMismatch)+'.')+' Numerical checks, not a symbolic proof.':c.fields.some(f=>f.exact)?'PDE residual sampling requires a smooth reference for every active field.':'Optional: supply reference formulas to compare initial data and sample the PDE residual.';
  $('field-heading').textContent=c.dimension===2?'A field across the domain':'The evolving field';
  $('field-subtitle').textContent=c.dimension===2?'Color scale fixed across the entire run':referenceAsts[field]?'Solid: computed · dashed: supplied reference · fixed vertical scale':'Fixed vertical scale across the entire run';
  $('field-colorbar').classList.toggle('hidden',c.dimension!==2);$('field-low').textContent=fmt(ranges[field][0]);$('field-high').textContent=fmt(ranges[field][1]);
  const {ctx,width,height}=canvas('studio-field');paintField(ctx,width,height,result,frame,field);
  if(document.querySelector('.resolution-card details').open)renderSpectrum();
}
function renderHistory() {
  const c=result.config, snapshots=result.frames, values=[];
  for(const s of snapshots)for(let i=0;i<c.N;i++){const row=c.dimension===2?Math.floor(c.N/2)*c.N:0;values.push(c.dimension===2&&c.boundary!=='periodic'?(s.values[field][row+i]+s.values[field][row-c.N+i])/2:s.values[field][row+i]);}
  $('history-heading').textContent=c.dimension===2?'A slice through space × time':'Space × time';
  $('history-subtitle').textContent=c.dimension===2?'Center slice y = 0'+(c.boundary!=='periodic'?' · interpolated between central rows':' · selected field'):'Selected field across all saved times';
  const {ctx,width,height}=canvas('studio-history');
  paintRaster(ctx,width,height,values,c.N,snapshots.length,ranges[field],{xmin:-c.Lx/2,xmax:c.Lx/2,ymin:0,ymax:c.T,xlabel:'x',ylabel:'t'});
}
function renderDiagnostics() {
  const series=['rms','mean'].map((key,i)=>({x:result.frames.map(f=>f.t),y:result.frames.map(f=>f.diagnostics[field][key]),color:colors[i]}));
  let min=Math.min(...series.flatMap(s=>s.y)),max=Math.max(...series.flatMap(s=>s.y)),span=Math.max(1e-5,max-min);min-=.08*span;max+=.08*span;
  const {ctx,width,height}=canvas('studio-diagnostics'),g=axes(ctx,width,height,{xmin:0,xmax:result.config.T,ymin:min,ymax:max,xlabel:'t'});lines(ctx,g,series);
}
function renderSpectrum() {
  if(result.config.boundary==='fourth-order'){
    const series={x:result.frames.map(s=>s.t),y:result.frames.map(s=>s.diagnostics[field].boundaryConstraintResidual)},maximum=Math.max(1e-14,...series.y);
    const {ctx,width,height}=canvas('studio-spectrum'),g=axes(ctx,width,height,{xmin:0,xmax:result.config.T,ymin:0,ymax:1.1*maximum,xlabel:'t',ylabel:'Discrete boundary-row residual'});lines(ctx,g,[series]);
    $('studio-spectrum').setAttribute('aria-label','Residual of the four discrete boundary constraints over time');
    $('spectrum-note').textContent='Largest absolute residual of the four specified boundary rows, evaluated on the reconstructed boundary traces. This checks numerical enforcement, not continuum accuracy. Inspect reference error and time/grid refinement separately. Odd normal derivatives change sign at the left endpoint.';
    return;
  }
  if(result.config.boundary!=='periodic'){
    const series={x:result.frames.map(s=>s.t),y:result.frames.map(s=>s.diagnostics[field].boundaryMassRate)},min=Math.min(...series.y),max=Math.max(...series.y),span=Math.max(1e-8,max-min);
    const {ctx,width,height}=canvas('studio-spectrum'),g=axes(ctx,width,height,{xmin:0,xmax:result.config.T,ymin:min-.08*span,ymax:max+.08*span,xlabel:'t',ylabel:'Diffusive mass input rate'});lines(ctx,g,[series]);
    $('studio-spectrum').setAttribute('aria-label','Diffusive boundary mass input over time');
    $('spectrum-note').textContent='Net diffusive mass input through the boundary: ∫ D ∂n u ds. Positive means diffusion adds mass. This excludes reactions, sources and advective transport. For a closed diffusion-only system it should be zero. Neumann inputs are normal derivatives, not physical fluxes.';
    return;
  }
  $('studio-spectrum').setAttribute('aria-label','Logarithmic Fourier energy by mode number');
  $('spectrum-note').textContent='Spectrum of the selected frame. The projection retains |mode| < N/4 on each axis; N is the collocation grid, not the number of retained modes.';
  const c=result.config,v=grid.forward(result.frames[frame].values[field]),bins=new Float64Array(c.N/2+1);
  for(let j=0;j<grid.ny;j++)for(let i=0;i<c.N;i++){const mx=Math.min(i,c.N-i),my=Math.min(j,grid.ny-j),p=j*c.N+i;bins[Math.max(mx,my)]+=(v.re[p]**2+v.im[p]**2)/grid.size**2;}
  const peak=Math.max(1e-30,...bins),y=Array.from(bins,a=>Math.log10(Math.max(peak*1e-16,a))),ymax=Math.ceil(Math.log10(peak));
  const {ctx,width,height}=canvas('studio-spectrum'),g=axes(ctx,width,height,{xmin:0,xmax:c.N/2,ymin:ymax-16,ymax,xlabel:c.dimension===2?'max(|mode x|, |mode y|)':'|mode|',ylabel:'Fourier energy',log:true});
  ctx.fillStyle='#eeeeee80';ctx.fillRect(g.X(c.N/4),g.p.top,g.W/2,g.H);lines(ctx,g,[{x:Array.from(bins,(_,i)=>i),y}]);
}
function renderAll(){if(result){renderFrame();renderHistory();renderDiagnostics();}}
function renderRefinement() {
  const box=$('refinement-result');box.replaceChildren();
  const table=document.createElement('table');table.innerHTML='<thead><tr><th>Field</th><th>Halved Δt</th><th>Doubled grid</th></tr></thead>';
  const body=document.createElement('tbody');
  refinement.temporal.forEach((row,i)=>{const tr=document.createElement('tr');for(const text of [row.field,fmt(row.relativeL2??row.rmsDifference),fmt(refinement.spatial[i].relativeL2??refinement.spatial[i].rmsDifference)]){const td=document.createElement('td');td.textContent=text;tr.append(td);}body.append(tr);});table.append(body);box.append(table);
  const p=document.createElement('p');p.className='helper';p.textContent=`Final-time relative L² differences (absolute RMS if the comparison field is zero). N: ${refinement.baseN} → ${refinement.refinedN}; Δt: ${fmt(refinement.baseDt)} → ${fmt(refinement.refinedDt)}. ${refinement.note}`;box.append(p);
}
function download(name,content,type='application/json') {
  const blob=content instanceof Blob?content:new Blob([content],{type});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function exportJSON(){if(result)download('phaseatlas-custom-experiment.json',JSON.stringify({...result,refinement}));}
function exportCSV(){
  if(!result)return;const c=result.config,rows=[['t','x',...(c.dimension===2?['y']:[]),...c.fields.map(f=>f.name)].join(',')];
  for(const snapshot of result.frames)for(let p=0;p<grid.size;p++)rows.push([snapshot.t,grid.x[p],...(c.dimension===2?[grid.y[p]]:[]),...snapshot.values.map(v=>v[p])].join(','));
  download('phaseatlas-custom-fields.csv',rows.join('\n'),'text/csv');
}
function svgFigure(){
  const c=result.config,s=result.frames[frame],W=1000,H=680,p={x:95,y:115,w:810,h:430},range=ranges[field],name=c.fields[field].name;
  if(c.dimension===2){const ratio=c.Lx/c.Ly;if(p.w/p.h>ratio){const w=p.h*ratio;p.x+=(p.w-w)/2;p.w=w;}else{const h=p.w/ratio;p.y+=(p.h-h)/2;p.h=h;}}
  let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><metadata>${escapeXML(JSON.stringify({solverVersion:result.solverVersion,config:c,frame,field:name,method:result.method}))}</metadata><rect width="100%" height="100%" fill="white"/><g font-family="Arial,Helvetica,sans-serif"><text x="60" y="45" font-size="25" fill="#0000cd">PhaseAtlas / ${escapeXML(c.title)}</text><text x="60" y="78" font-size="14" fill="#65718a">Field ${name} · t = ${fmt(s.t)} · ${boundaryLabel(c)} ${c.dimension}D domain · N = ${c.N} · Δt = ${fmt(result.dt)}</text>`;
  const X=x=>p.x+(x+c.Lx/2)/c.Lx*p.w;let ymin,ymax;
  if(c.dimension===2){ymin=-c.Ly/2;ymax=c.Ly/2;for(let j=0;j<c.N;j++)for(let i=0;i<c.N;i++){const rgb=color((s.values[field][j*c.N+i]-range[0])/(range[1]-range[0]));svg+=`<rect x="${p.x+i*p.w/c.N}" y="${p.y+(c.N-1-j)*p.h/c.N}" width="${p.w/c.N+.02}" height="${p.h/c.N+.02}" fill="rgb(${rgb})"/>`;}}
  else {const span=range[1]-range[0];ymin=range[0]-.08*span;ymax=range[1]+.08*span;}
  const Y=y=>p.y+p.h-(y-ymin)/(ymax-ymin)*p.h;
  for(let i=0;i<=4;i++){const x=-c.Lx/2+i*c.Lx/4,y=ymin+i*(ymax-ymin)/4;svg+=`<text x="${X(x)}" y="${p.y+p.h+24}" text-anchor="middle" font-size="12" fill="#65718a">${fmt(x)}</text><text x="${p.x-12}" y="${Y(y)+4}" text-anchor="end" font-size="12" fill="#65718a">${fmt(y)}</text>`;if(c.dimension===1)svg+=`<path d="M${p.x} ${Y(y)}H${p.x+p.w}" stroke="#edf0f5"/>`;}
  if(c.dimension===1){for(const curve of fieldCurves(result,frame,field)){let path='';curve.y.forEach((v,i)=>{path+=`${i?'L':'M'}${X(curve.x[i]).toFixed(3)},${Y(v).toFixed(3)} `;});svg+=`<path d="${path}" fill="none" stroke="${curve.color}" stroke-width="2" ${curve.dashed?'stroke-dasharray="6 4"':''}/>`;}}
  else {for(let i=0;i<200;i++)svg+=`<rect x="${p.x+i*p.w/200}" y="585" width="${p.w/200+.1}" height="9" fill="rgb(${color(i/199)})"/>`;svg+=`<text x="${p.x}" y="614" font-size="12">${fmt(range[0])}</text><text x="${p.x+p.w}" y="614" text-anchor="end" font-size="12">${fmt(range[1])}</text>`;}
  svg+=`<text x="${p.x+p.w}" y="${p.y+p.h+43}" font-size="14" text-anchor="end">x</text><text x="${p.x}" y="${p.y-13}" font-size="14">${c.dimension===2?'y':name}</text><text x="60" y="650" font-size="11" fill="#65718a">Fixed scale across this run. Numerical observation; export JSON for the complete model and diagnostics.</text></g></svg>`;return svg;
}
async function recordVideo(){
  if(!result)return;
  if(!window.MediaRecorder||!HTMLCanvasElement.prototype.captureStream){toast('WebM recording needs a browser with canvas recording support, such as Edge or Chrome.');return;}
  pause();const button=$('export-studio-video');button.disabled=true;const data=result,f=field,element=document.createElement('canvas');element.width=1280;element.height=800;const ctx=element.getContext('2d'),stream=element.captureStream(24);
  const mime=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(m=>MediaRecorder.isTypeSupported(m));const chunks=[];
  let recorder;
  try {
    recorder=new MediaRecorder(stream,mime?{mimeType:mime}:{});
    const done=new Promise((resolve,reject)=>{recorder.onstop=resolve;recorder.onerror=()=>reject(Error('Video recording failed.'));recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};});
    // Freeze changes that would invalidate the recording's shared plot scales.
    setBusy(true);$('cancel-studio').classList.add('hidden');$('studio-progress').classList.add('hidden');
    toast('Recording a 10-second animation. Keep this tab visible.');recorder.start();const start=performance.now();
    await new Promise(resolve=>{function draw(now){const fraction=Math.min(1,(now-start)/10000),index=Math.min(data.frames.length-1,Math.floor(fraction*(data.frames.length-1)));ctx.fillStyle='#fff';ctx.fillRect(0,0,1280,800);ctx.fillStyle='#0000cd';ctx.font='bold 28px Arial';ctx.fillText('PhaseAtlas / '+data.config.title,65,48,1150);ctx.fillStyle='#65718a';ctx.font='16px Arial';ctx.fillText(`Field ${data.config.fields[f].name} · t = ${fmt(data.frames[index].t)} · N = ${data.config.N} · Δt = ${fmt(data.dt)}`,65,81);ctx.save();ctx.translate(35,110);paintField(ctx,1210,570,data,index,f);ctx.restore();ctx.font='15px Arial';ctx.fillStyle='#65718a';ctx.fillText(`${boundaryLabel(data.config)} domain · fixed scale [${fmt(ranges[f][0])}, ${fmt(ranges[f][1])}] · ${data.config.dimension===2?'color: blue → white → orange':'solid: computed; dashed: reference if supplied'}`,65,728);ctx.fillText('Numerical observation. Export the experiment JSON for reproducibility and refinement checks.',65,759);if(fraction<1)requestAnimationFrame(draw);else resolve();}requestAnimationFrame(draw);});
    recorder.stop();await done;download('phaseatlas-custom-animation.webm',new Blob(chunks,{type:'video/webm'}));toast('Animation exported.');
  }catch(e){toast(e.message);}finally{if(recorder?.state==='recording')recorder.stop();stream.getTracks().forEach(t=>t.stop());setBusy(false);button.disabled=false;status('Animation recording finished; the experiment is unchanged.');}
}
function shareLink(){if(!result)return;const bytes=new TextEncoder().encode(JSON.stringify(result.config));let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);const encoded=btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');const url=new URL(location.href);url.hash='experiment='+encoded;$('share-link').value=url.href;$('share-link-box').classList.remove('hidden');$('share-link').select();navigator.clipboard?.writeText(url.href).then(()=>toast('Experiment link copied.')).catch(()=>toast('Select and copy the displayed experiment link.'));}

$('preset').add(new Option('Custom / imported experiment',''));
for(const p of PRESETS)$('preset').add(new Option(p.label,p.id));
$('preset').onchange=()=>{const p=PRESETS.find(p=>p.id===$('preset').value);if(!p)return;applyConfig(presetConfig(p.id),p.id);$('preset-description').textContent=p.description;changed();};
$('boundary-mode').onchange=()=>{const mode=$('boundary-mode').value;if(mode==='dirichlet'||mode==='neumann'){document.querySelectorAll('.boundary-editor .boundary-row select').forEach(el=>{el.value=mode;});document.querySelectorAll('.boundary-editor .boundary-row input[id$="-value"]').forEach(el=>{el.value='0';});}if(mode==='fourth-order')$('dimension').value='1';dimensions();boundaryDisplay();changed();};
document.querySelector('#field-editors').addEventListener('input',e=>{
  if(e.target.closest('.boundary-editor .boundary-row')){$('boundary-mode').value='nonperiodic';boundaryDisplay();}
  if(e.target.closest('.fourth-condition')){e.target.closest('.fourth-endpoint').querySelector('.fourth-pair').value='custom';if(e.target.classList.contains('fourth-coefficient')){const prefix=e.target.closest('.fourth-condition').dataset.prefix;$(`${prefix}-order`).value='custom';fourthRowDisplay(prefix);}}
});
document.querySelector('#field-editors').addEventListener('change',e=>{
  if(e.target.classList.contains('fourth-order-select')){const prefix=e.target.closest('.fourth-condition').dataset.prefix;if(e.target.value!=='custom')boundaryWeights(Number(e.target.value)).forEach((v,j)=>{$(`${prefix}-a${j}`).value=v;});fourthRowDisplay(prefix);}
  if(e.target.classList.contains('fourth-pair')&&e.target.value!=='custom'){
    [...e.target.value].forEach((order,k)=>{const prefix=`fourth-${e.target.dataset.field}-${e.target.dataset.side}-${k}`;$(`${prefix}-order`).value=order;boundaryWeights(Number(order)).forEach((v,j)=>{$(`${prefix}-a${j}`).value=v;});$(`${prefix}-value`).value='0';fourthRowDisplay(prefix);});
  }
});
$('field-count').onchange=()=>{editorFields(Number($('field-count').value),readFields());changed();};
$('dimension').onchange=()=>{dimensions();editorFields(Number($('field-count').value),readFields());changed();};
document.querySelector('.studio-editor').addEventListener('input',changed);
$('run-studio').onclick=run;
$('cancel-studio').onclick=()=>{worker?.terminate();worker=null;setBusy(false);status('Canceled. The previous successful result is retained.');$('result-state').textContent='Canceled';};
$('refine-studio').onclick=()=>{if(!result)return;try{prepare({...result.config,N:result.config.N*2,dt:result.dt/2,frames:2});status('Comparing time-step and spatial resolution…');startWorker('refine',{result});}catch(e){status('Refinement could not start: '+e.message+' Run a smaller base grid or shorter duration.',true);}};
$('display-field').onchange=()=>{field=Number($('display-field').value);renderAll();};
$('studio-play').onclick=()=>playing?pause():play();$('studio-rewind').onclick=()=>{pause();frame=0;renderFrame();};
$('studio-timeline').oninput=()=>{pause();frame=Number($('studio-timeline').value);renderFrame();};
document.querySelector('.resolution-card details').addEventListener('toggle',()=>{if(result&&document.querySelector('.resolution-card details').open)renderSpectrum();});
$('export-studio-json').onclick=exportJSON;$('export-studio-csv').onclick=exportCSV;$('export-studio-figure').onclick=()=>result&&download('phaseatlas-custom-figure.svg',svgFigure(),'image/svg+xml');$('export-studio-video').onclick=recordVideo;$('export-studio-config').onclick=shareLink;
$('import-studio').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>80000000)throw Error('Experiment JSON exceeds 80 MB.');const input=JSON.parse(await file.text()),config=prepare(input.config||input).config;applyConfig(config);$('preset-description').textContent='Imported configuration. The result will be recomputed on this device.';run();}catch(error){status(error.message,true);}finally{e.target.value='';}};
$('studio-field').onpointermove=e=>{if(!result)return;const r=e.currentTarget.getBoundingClientRect(),c=result.config,x=e.clientX-r.left,y=e.clientY-r.top;let left=50,top=20,w=r.width-67,h=r.height-53;if(c.dimension===2){const ratio=c.Lx/c.Ly;if(w/h>ratio){const fitted=h*ratio;left+=(w-fitted)/2;w=fitted;}else{const fitted=w/ratio;top+=(h-fitted)/2;h=fitted;}}if(x<left||x>left+w||y<top||y>top+h){$('hover-value').textContent='';return;}const ix=Math.max(0,Math.min(c.N-1,Math.floor((x-left)/w*c.N))),iy=c.dimension===2?Math.max(0,Math.min(c.N-1,Math.floor((1-(y-top)/h)*c.N))):0,p=iy*c.N+ix;$('hover-value').textContent=`x=${fmt(grid.x[p])}${c.dimension===2?', y='+fmt(grid.y[p]):''} · ${c.fields[field].name}=${fmt(result.frames[frame].values[field][p])}`;};
$('studio-field').onpointerleave=()=>{$('hover-value').textContent='';};
let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(renderAll,100);});
let initial=presetConfig('heat');$('preset-description').textContent=PRESETS[0].description;
if(location.hash.startsWith('#experiment=')) {
  try{const encoded=location.hash.slice(12);if(encoded.length>16000)throw Error('The shared configuration is too large.');const text=atob(encoded.replace(/-/g,'+').replace(/_/g,'/'));initial=validateConfig(JSON.parse(new TextDecoder().decode(Uint8Array.from(text,c=>c.charCodeAt(0)))));$('preset-description').textContent='Shared experiment. Review the configuration and click Run; shared links never start computations automatically.';applyConfig(initial);status('Shared configuration loaded. Review the equations, then run.');}
  catch(e){applyConfig(initial);status('Could not load the shared experiment: '+e.message,true);}
} else {applyConfig(initial,'heat');run();}
attachResearchWorkbench(()=>prepare(readConfig()).config,message=>status(message,true));
