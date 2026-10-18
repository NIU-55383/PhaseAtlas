import {prepare,makeGrid} from './studio-solver.js';
import {boundaryData,boundedDerivative,boundaryFaces} from './studio-bounded.js';
import {evaluate} from './studio-expression.js';
import {validateExperiment,statistics} from './evidence-core.mjs';
import {makeObserver,samplePoint,waveDiagnostics} from './research-core.mjs';
const insist=(c,m)=>{if(!c)throw Error(m);};
const integrate=(values,volume)=>typeof values==='number'?values*volume:statistics(values).mean*volume;

export function balanceAudit(experiment,field=0){
  validateExperiment(experiment);const prepared=prepare(experiment.config),c=prepared.config,g=prepared.grid||makeGrid(c),names=c.fields.map(f=>f.name);
  insist(c.boundary==='nonperiodic','Boundary/bulk balance audit currently supports the second-order bounded backend, including Robin. Fourth-order flux decomposition needs a separate audit.');
  insist(Number.isInteger(field)&&field>=0&&field<c.fields.length,'Choose a valid field for the balance audit.');
  const eq=prepared.equations[field],volume=c.Lx*(c.dimension===2?c.Ly:1);let integratedInput=0;
  const rows=[];
  for(const snapshot of experiment.frames){
    const data=boundaryData(prepared,snapshot.t),context={...prepared.constants,x:g.x,y:g.y,t:snapshot.t};names.forEach((n,i)=>context[n]=snapshot.values[i]);
    const domain={...g,derivative:(values,kind,order,input)=>boundedDerivative(values,kind,order,names.indexOf(input.name),prepared,data)};
    const values=snapshot.values[field],boundary=boundaryFaces(values,eq,g,data[field]);
    let bulkRate=integrate(evaluate(eq.remainder,context,domain),volume);
    for(const [px,py,coefficient] of eq.linear)bulkRate+=coefficient*integrate(px+py===0?values:boundedDerivative(values,py?'Dy':'Dx',1,field,prepared,data),volume);
    const fullRhsRate=integrate(evaluate(eq.ast,context,domain),volume),mass=integrate(values,volume),totalRate=boundary.rate+bulkRate;
    insist([mass,bulkRate,totalRate,fullRhsRate].every(Number.isFinite),'The balance calculation produced a non-finite rate.');
    const previous=rows.at(-1);if(previous)integratedInput+=(snapshot.t-previous.t)*(previous.totalRate+totalRate)/2;
    rows.push({t:snapshot.t,mass,boundaryRate:boundary.rate,sideRates:boundary.rates,bulkRate,totalRate,integratedInput,massChange:previous?mass-rows[0].mass:0,
      balanceDefect:previous?mass-rows[0].mass-integratedInput:0,operatorClosure:fullRhsRate-totalRate,boundaryResidual:boundary.residual});
  }
  return {schema:'phaseatlas-balance-audit/v1',field:names[field],rows,
    maximumAbsoluteDefect:Math.max(...rows.map(r=>Math.abs(r.balanceDefect))),maximumOperatorClosure:Math.max(...rows.map(r=>Math.abs(r.operatorClosure))),maximumBoundaryResidual:Math.max(...rows.map(r=>r.boundaryResidual)),
    interpretation:'Recomputed from saved arrays and model data; imported diagnostics are ignored. Boundary rate is diffusive input (positive into the domain). Bulk includes reactions, sources and non-diffusive transport as written. Trapezoidal integration uses saved times, so the balance defect includes temporal discretization and output-sampling error. An operator-closure residual is an algebraic consistency check, not continuum accuracy or physical validation.'};
}

export function metricValue(experiment,settings){
  validateExperiment(experiment);
  const kind=settings.kind||'observable';
  if(kind==='wave'){
    const analysis=waveDiagnostics(experiment,settings.field??0,settings.wave),last=analysis.rows.at(-1),key=settings.waveMetric||'alignedRms';
    insist(['speed','shift','alignedRms','localL2','globalL2','weightedL2','edgeFraction'].includes(key),'Unknown wave metric.');
    if(['shift','alignedRms'].includes(key)&&last.atSearchLimit)return {value:null,reason:'Alignment reached its configured search limit.'};
    return {value:last[key],reason:last[key]===null?'No resolved value for this wave metric.':null,definition:`Final ${key}; ${analysis.reference}`};
  }
  if(kind==='balance'){
    const audit=balanceAudit(experiment,settings.field??0);return {value:audit.maximumAbsoluteDefect,definition:'Maximum absolute saved-frame mass-balance defect (includes output-time quadrature error).'};
  }
  insist(kind==='observable','Unknown map metric type.');
  const source=settings.expression||'u',statistic=settings.statistic||'rms',reduction=settings.reduction||'final',observe=makeObserver(experiment,source),volume=experiment.config.Lx*(experiment.config.dimension===2?experiment.config.Ly:1);
  insist(['rms','mean','min','max','integral','point'].includes(statistic),'Unknown spatial metric.');
  insist(['final','maximum','change','time-average','first-crossing'].includes(reduction),'Unknown temporal reduction.');
  const snapshots=reduction==='final'?[experiment.frames.at(-1)]:reduction==='change'?[experiment.frames[0],experiment.frames.at(-1)]:experiment.frames;
  const values=snapshots.map(f=>{
    const v=observe(f),s=statistics(v);return statistic==='integral'?s.mean*volume:statistic==='point'?samplePoint(v,experiment.config,settings.x??0,settings.y??0):s[statistic];
  });
  let value=null,reason=null;
  if(reduction==='final')value=values.at(-1);
  if(reduction==='change')value=values.at(-1)-values[0];
  if(reduction==='maximum')value=Math.max(...values);
  if(reduction==='time-average'){
    value=0;for(let i=1;i<values.length;i++)value+=(experiment.frames[i].t-experiment.frames[i-1].t)*(values[i]+values[i-1])/2;value/=experiment.config.T;
  }
  if(reduction==='first-crossing'){
    const threshold=settings.threshold,direction=settings.direction||'above';insist(Number.isFinite(threshold),'Threshold must be finite.');insist(['above','below'].includes(direction),'Choose above or below for the event.');
    const sign=direction==='above'?1:-1;
    if(sign*(values[0]-threshold)>=0)value=0;
    else for(let i=1;i<values.length;i++)if(sign*(values[i]-threshold)>=0){const fraction=(threshold-values[i-1])/(values[i]-values[i-1]);value=experiment.frames[i-1].t+fraction*(experiment.frames[i].t-experiment.frames[i-1].t);break;}
    if(value===null)reason='Threshold was not crossed in saved frames; no event time is inferred.';
  }
  return {value,reason,definition:`${reduction} of ${statistic}(${source})`,sampling:'Temporal reductions use saved frames. Extrema or transient crossings between saved times may be missed; first crossings use linear time interpolation.'};
}

export function sensitivityEstimate(plan,metric){
  insist(plan?.kind==='sweep','Local sensitivity requires a parameter scan.');
  const nx=plan.options.xCount,ny=plan.options.yParameter?plan.options.yCount:1;
  const find=(i,j)=>plan.jobs.find(job=>job.coordinates.i===i&&job.coordinates.j===j);
  const value=job=>job?.status==='complete'?metric(job)?.value:null;
  return plan.jobs.map(job=>{
    const {i,j}=job.coordinates,current=value(job),out={id:job.id,x:null,y:null,schemeX:null,schemeY:null};
    if(!Number.isFinite(current))return out;
    for(const [axis,k,count] of [['x',i,nx],['y',j,ny]]){
      if(count<2)continue;const low=Math.max(0,k-1),high=Math.min(count-1,k+1),a=axis==='x'?find(low,j):find(i,low),b=axis==='x'?find(high,j):find(i,high),va=value(a),vb=value(b);
      if(Number.isFinite(va)&&Number.isFinite(vb)){out[axis]=(vb-va)/(b.coordinates[axis]-a.coordinates[axis]);out[axis==='x'?'schemeX':'schemeY']=k>0&&k<count-1?'centered secant':'one-sided secant';}
    }
    return out;
  });
}
