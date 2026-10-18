// Report calculations are independent of the PDE solver and ignore imported diagnostics.
export const MAX_VALUES = 6000000;
const finite = x => typeof x === 'number' && Number.isFinite(x);
const close = (a,b) => Math.abs(a-b) <= 1e-10*Math.max(Math.abs(a),Math.abs(b),Number.MIN_VALUE);
const requireThat = (condition,message) => { if(!condition) throw Error(message); };
const stable = x => JSON.stringify(sortKeys(x));
function sortKeys(x) {
  if(Array.isArray(x)) return x.map(sortKeys);
  if(x && typeof x === 'object') return Object.fromEntries(Object.keys(x).sort().map(k=>[k,sortKeys(x[k])]));
  return x;
}
export function validateExperiment(e) {
  requireThat(e?.schema==='phaseatlas-studio/v1','Use a full JSON export from Custom PDE Studio.');
  const c=e.config;
  requireThat(c && [1,2].includes(c.dimension),'The export must have a 1D or 2D domain.');
  requireThat(Number.isInteger(c.N)&&c.N>=2&&c.N<=(c.dimension===1?1024:128),'Unsupported grid size.');
  requireThat(['periodic','nonperiodic','fourth-order'].includes(c.boundary),'Unknown boundary layout.');
  requireThat(c.boundary!=='fourth-order'||c.dimension===1,'Bounded fourth-order exports must be 1D.');
  requireThat(finite(c.Lx)&&c.Lx>0&&(c.dimension===1||(finite(c.Ly)&&c.Ly>0)),'Domain lengths must be positive.');
  requireThat(finite(c.T)&&c.T>0&&finite(e.dt)&&e.dt>0,'Final time and actual time step must be positive.');
  requireThat(Number.isInteger(e.steps)&&e.steps>0&&close(e.steps*e.dt,c.T),'Actual time step, step count and final time do not agree.');
  requireThat(typeof e.solverVersion==='string'&&e.solverVersion.length>0&&typeof e.method==='string'&&e.method.length>0,'Solver version and method are required.');
  requireThat(Array.isArray(c.fields)&&c.fields.length>=1&&c.fields.length<=3,'Expected one to three fields.');
  requireThat(c.fields.every(f=>f && typeof f.name==='string'&&typeof f.rhs==='string'&&typeof f.initial==='string'),'Field definitions are incomplete.');
  requireThat(new Set(c.fields.map(f=>f.name)).size===c.fields.length,'Field names must be distinct.');
  requireThat(Array.isArray(e.frames)&&e.frames.length>=2&&e.frames.length<=121,'Expected 2–121 saved frames.');
  const size=c.N**c.dimension;
  requireThat(size*e.frames.length*c.fields.length<=MAX_VALUES,'This export exceeds the six-million-value inspection limit.');
  e.frames.forEach((f,i)=>{
    requireThat(finite(f.t)&&(i===0?f.t===0:f.t>e.frames[i-1].t),'Frame times must start at zero and increase strictly.');
    requireThat(Array.isArray(f.values)&&f.values.length===c.fields.length,'A frame has missing fields.');
    requireThat(f.values.every(a=>Array.isArray(a)&&a.length===size&&a.every(v=>finite(v)&&Math.abs(v)<=1e100)),'A frame has an invalid grid, non-finite values or amplitudes outside the inspection range (±1e100).');
  });
  requireThat(close(e.frames.at(-1).t,c.T),'The last frame does not reach the declared final time.');
  return e;
}
export function statistics(values) {
  let mean=0,squared=0,min=Infinity,max=-Infinity;
  for(const v of values){mean+=v/values.length;squared+=(v/Math.sqrt(values.length))**2;min=Math.min(min,v);max=Math.max(max,v);}
  return {mean,rms:Math.sqrt(squared),min,max};
}
export function summarize(e) {
  validateExperiment(e);
  return {title:e.config.title||'Untitled experiment',config:e.config,solverVersion:e.solverVersion,method:e.method,actualDt:e.dt,steps:e.steps,
    fields:e.config.fields.map((f,i)=>({field:f.name,initial:statistics(e.frames[0].values[i]),final:statistics(e.frames.at(-1).values[i])})),
    sourceWarnings:Array.isArray(e.warnings)?e.warnings.filter(x=>typeof x==='string'):[],
    evidence:'Statistics recomputed from supplied arrays. The trajectory has not been rerun or authenticated.'};
}
function problem(e) {
  const c={...e.config};
  for(const k of ['title','N','dt','frames']) delete c[k];
  // Ly has no physical meaning for 1D exports.
  if(c.dimension===1) delete c.Ly;
  return stable(c);
}
export function sampleOnGrid(e,base,field,values=e.frames.at(-1).values[field]) {
  const c=e.config,b=base.config,ratio=c.N/b.N,v=values;
  requireThat(c.N>=b.N&&Number.isInteger(ratio),'Use nested grids with an integer refinement ratio.');
  const output=[];
  for(let j=0;j<(b.dimension===2?b.N:1);j++)for(let i=0;i<b.N;i++){
    if(b.boundary==='periodic'){output.push(v[j*ratio*c.N+i*ratio]);continue;}
    const x=(i+.5)*ratio-.5,y=b.dimension===2?(j+.5)*ratio-.5:0;
    const x0=Math.floor(x),x1=Math.ceil(x),y0=Math.floor(y),y1=Math.ceil(y),sx=x-x0,sy=y-y0;
    output.push((1-sy)*((1-sx)*v[y0*c.N+x0]+sx*v[y0*c.N+x1])+sy*((1-sx)*v[y1*c.N+x0]+sx*v[y1*c.N+x1]));
  }
  return output;
}
export function compareThree(experiments,axis='space') {
  requireThat(['space','time'].includes(axis),'Choose a space or time study.');
  requireThat(experiments.length===3,'Import exactly three runs to estimate an observed order. One or two comparisons cannot determine an order.');
  experiments.forEach(validateExperiment);
  const key=problem(experiments[0]);
  requireThat(experiments.every(e=>problem(e)===key),'Keep equations, parameters, initial data, boundaries, domain and final time identical. Formula text must also match.');
  requireThat(experiments.every(e=>e.solverVersion===experiments[0].solverVersion&&e.method===experiments[0].method),'Do not mix solver versions or numerical methods in an order study.');
  const runs=[...experiments].sort((a,b)=>axis==='space'?a.config.N-b.config.N:b.dt-a.dt);
  const [a,b,c]=runs;
  let ratio;
  if(axis==='space'){
    requireThat(runs.every(e=>close(e.dt,a.dt)),'For spatial refinement, keep the actual time step fixed. Joint grid/time refinement cannot isolate spatial order.');
    ratio=b.config.N/a.config.N;
    requireThat(Number.isInteger(ratio)&&ratio>1&&c.config.N/b.config.N===ratio,'Use three distinct nested grids with the same integer refinement ratio.');
  }else{
    requireThat(runs.every(e=>e.config.N===a.config.N),'For temporal refinement, keep the spatial grid fixed.');
    ratio=a.dt/b.dt;
    requireThat(ratio>1&&!close(ratio,1)&&close(b.dt/c.dt,ratio),'Use three distinct actual time steps with an equal refinement ratio.');
  }
  const levels=runs.map(e=>axis==='space'?e.config.Lx/e.config.N:e.dt);
  const rows=a.config.fields.map((f,index)=>{
    const vectors=runs.map(e=>sampleOnGrid(e,a,index));
    // Use the same adjacent-grid interpolation in both differences before
    // transferring the finer difference to the common comparison grid.
    const coarseDifference=vectors[0].map((v,i)=>v-vectors[1][i]);
    const fineOnMiddle=sampleOnGrid(c,b,index);
    const middleDifference=b.frames.at(-1).values[index].map((v,i)=>v-fineOnMiddle[i]);
    const fineDifference=sampleOnGrid(b,a,index,middleDifference);
    const d01=statistics(coarseDifference).rms,d12=statistics(fineDifference).rms;
    const scale=Math.max(...vectors.map(v=>statistics(v).rms));
    const floor=64*Number.EPSILON*Math.max(scale,Number.MIN_VALUE);
    const observedOrder=d01>floor&&d12>floor?Math.log(d01/d12)/Math.log(ratio):null;
    const referenceScale=statistics(vectors[2]).rms;
    return {field:f.name,d01,d12,relativeD01:referenceScale>floor?d01/referenceScale:null,relativeD12:referenceScale>floor?d12/referenceScale:null,
      observedOrder,roundoffHeuristic:floor,status:observedOrder===null?'Differences near floating-point resolution; order withheld.':observedOrder<=0?'Differences do not decrease. Refine further and inspect the model.':'Differences decrease on these three levels; this alone does not establish convergence.'};
  });
  return {axis,ratio,levels,grids:runs.map(e=>e.config.N),timeSteps:runs.map(e=>e.dt),rows,
    comparison:axis==='space'&&a.config.boundary!=='periodic'?'Adjacent-grid differences are formed first, using the same refinement ratio. The finer difference is then interpolated onto the coarsest cell-center grid. Interpolation contributes to the measured order.':'Adjacent-level final-field differences are compared on the same coarsest grid at the same final time.',
    limitation:'Observed order is a finite-resolution diagnostic, not a rigorous error estimate. Check more levels, temporal/spatial contamination and domain sensitivity separately. No theorem, stability certification or physical validation is inferred.'};
}
