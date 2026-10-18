import {parseExpression,parseParameters,evaluate,derivativeOrder,splitLinear} from './studio-expression.js';
import {makeBoundedGrid} from './studio-bounded.js';

export const FOURTH_VERSION='phaseatlas-fourth-sbdf2-1.0.0';
export const FOURTH_METHOD='1D cell-centered finite differences; centered second-order interior derivatives; quartic boundary reconstruction from three interior values and two independent linear conditions per endpoint; all constant same-field linear terms implicit; SBDF2 with backward-Euler startup; banded LU with partial pivoting. No periodic extension or filtering.';
export const boundaryOrders={value:0,normal:1,second:2,third:3};
export const boundaryWeights=order=>[0,1,2,3].map(k=>k===order?'1':'0');
const factorial=[1,1,2,6,24,120,720];
const stencil={1:[[-1,-.5],[1,.5]],2:[[-1,1],[0,-2],[1,1]],3:[[-2,-.5],[-1,1],[1,-1],[2,.5]],4:[[-2,1],[-1,-4],[0,6],[1,-4],[2,1]]};
const asArray=(v,n)=>typeof v==='number'?new Float64Array(n).fill(v):v;
function finite(v){for(const a of v)if(!Number.isFinite(a)||Math.abs(a)>1e8)throw Error('The fourth-order computation became non-finite or exceeded the amplitude limit. Reduce the time step, refine the grid and inspect the model. This does not establish mathematical blow-up.');return v;}

// Small, row-scaled inverse used only to construct boundary interpolation weights.
export function smallInverse(matrix){
  const n=matrix.length,rows=matrix.map((r,i)=>{
    const scale=Math.max(...r.map(Math.abs));if(!(scale>0))throw Error('A boundary condition cannot have all zero coefficients.');
    return [...r.map(v=>v/scale),...Array.from({length:n},(_,j)=>i===j?1/scale:0)];
  });
  for(let k=0;k<n;k++){
    let pivot=k;for(let i=k+1;i<n;i++)if(Math.abs(rows[i][k])>Math.abs(rows[pivot][k]))pivot=i;
    if(Math.abs(rows[pivot][k])<1e-12)throw Error('The boundary conditions are dependent or the local boundary reconstruction is singular. Choose two independent conditions at each endpoint.');
    [rows[k],rows[pivot]]=[rows[pivot],rows[k]];const d=rows[k][k];for(let j=0;j<2*n;j++)rows[k][j]/=d;
    for(let i=0;i<n;i++)if(i!==k){const c=rows[i][k];for(let j=0;j<2*n;j++)rows[i][j]-=c*rows[k][j];}
  }
  return rows.map(r=>r.slice(n));
}

export function boundaryClosure(coefficients,h){
  // r increases into the domain at either endpoint; D_n = -D_r/h.
  const matrix=Array.from({length:3},(_,i)=>Array.from({length:5},(_,k)=>(i+.5)**k));
  for(const a of coefficients)matrix.push(Array.from({length:5},(_,k)=>k<4?a[k]*(-1/h)**k*factorial[k]:0));
  const inverse=smallInverse(matrix);
  const at=r=>Array.from({length:5},(_,j)=>inverse.reduce((s,row,k)=>s+r**k*row[j],0));
  const traces=Array.from({length:4},(_,k)=>inverse[k].map(v=>v*(-1/h)**k*factorial[k]));
  return {ghosts:[at(-.5),at(-1.5)],traces};
}

export function prepareFourth(config){
  if(config.dimension!==1)throw Error('Custom fourth-order boundary conditions currently require a 1D interval. 2D fourth-order boundary operators need a separate implementation.');
  const grid=makeBoundedGrid(config),constants={...parseParameters(config.parameters),Lx:config.Lx,Ly:config.Ly},names=config.fields.map(f=>f.name),space=['x',...Object.keys(constants)];
  const equations=config.fields.map(f=>{
    const ast=parseExpression(f.rhs,[...space,'t',...names]),initial=parseExpression(f.initial,space),exact=f.exact?parseExpression(f.exact,[...space,'t']):null;
    if(derivativeOrder(initial)||exact&&derivativeOrder(exact))throw Error('Initial and reference formulas must be explicit functions of position and time.');
    function inspect(node){
      if(node.type==='call'){
        if(node.name==='Dy')throw Error('Dy is unavailable on a 1D interval.');
        if(['Dx','D','lap','biharm'].includes(node.name)){
          const order=node.name==='lap'?2:node.name==='biharm'?4:node.args[1].value;
          if(order>1&&(node.args[0].type!=='variable'||!names.includes(node.args[0].name)))throw Error('In fourth-order boundary mode, derivatives of order two or higher must act directly on a field. First derivatives of flux expressions are supported.');
        }
        node.args.forEach(inspect);
      }else if(node.type==='binary'){inspect(node.left);inspect(node.right);}else if(node.type==='unary')inspect(node.child);
    }
    inspect(ast);const split=splitLinear(ast,f.name,constants,1),coefficients=new Float64Array(5);
    for(const [px,py,c] of split.terms){if(py||px>4)throw Error('Only x derivatives through order four are supported.');coefficients[px]+=c;}
    if(!(coefficients[4]<0))throw Error(`Field ${f.name} needs a negative constant coefficient of its own fourth derivative in this mode, for example -kappa*Dx(${f.name},4), kappa > 0. Use the second-order backend for diffusion-only fields.`);
    if(!coefficients.every(Number.isFinite)||derivativeOrder(split.remainder)>1)throw Error('Fourth-order boundary mode requires constant diagonal coefficients for second, third and fourth derivatives. Coupled reactions and first derivatives may remain explicit.');
    const boundaries={},closures={};
    for(const side of ['left','right']){
      const rows=f.boundaries[side].conditions.map(condition=>{
        const weights=condition.coefficients.map(text=>{const a=parseExpression(text,Object.keys(constants));if(derivativeOrder(a))throw Error('Boundary coefficients must be constant expressions.');const v=evaluate(a,constants);if(!Number.isFinite(v))throw Error('Boundary coefficients must be finite.');return v;});
        const formula=parseExpression(condition.value,[...space,'t']);if(derivativeOrder(formula))throw Error('Boundary targets must be explicit expressions in x, t and parameters.');
        return {weights,formula};
      });
      boundaries[side]=rows;closures[side]=boundaryClosure(rows.map(r=>r.weights),grid.hx);
    }
    return {ast,initial,exact,coefficients,remainder:split.remainder,boundaries,closures};
  });
  return {config,grid,constants,equations,operators:equations.map((eq,i)=>({field:names[i],linearCoefficients:Array.from(eq.coefficients),implicit:'all constant same-field linear derivatives and reaction',explicit:'nonlinear/coupled reaction and first derivatives'}))};
}

export function fourthBoundaryData(prepared,time){
  const {config,constants,equations}=prepared;
  return equations.map(eq=>Object.fromEntries(['left','right'].map(side=>[side,eq.boundaries[side].map(row=>{
    const value=evaluate(row.formula,{...constants,x:(side==='left'?-1:1)*config.Lx/2,t:time});finite([value]);return value;
  })])));
}
function inputAt(values,side,targets){return side==='left'?[values[0],values[1],values[2],...targets]:[values.at(-1),values.at(-2),values.at(-3),...targets];}
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
export function extendFourth(values,eq,data){
  const n=values.length,out=new Float64Array(n+4);out.set(values,2);
  for(const side of ['left','right']){const input=inputAt(values,side,data[side]);eq.closures[side].ghosts.forEach((row,k)=>{out[side==='left'?1-k:n+2+k]=dot(row,input);});}
  return out;
}
export function fourthDerivative(extended,order,h){
  const out=new Float64Array(extended.length-4),scale=h**order;
  for(let i=0;i<out.length;i++)for(const [offset,c] of stencil[order])out[i]+=c*extended[i+2+offset]/scale;
  return out;
}
export function fourthOperator(eq,grid){
  const n=grid.n,h=grid.hx,rows=Array.from({length:n},()=>new Map()),forcing=Array.from({length:n},()=>new Float64Array(4));
  const add=(i,j,v)=>rows[i].set(j,(rows[i].get(j)||0)+v);
  for(let i=0;i<n;i++){
    add(i,i,eq.coefficients[0]);
    for(let order=1;order<=4;order++)for(const [offset,c] of stencil[order]){
      const v=c*eq.coefficients[order]/h**order,j=i+offset;if(!v)continue;
      if(j>=0&&j<n)add(i,j,v);
      else{
        const side=j<0?'left':'right',k=j<0?-j-1:j-n,w=eq.closures[side].ghosts[k];
        for(let a=0;a<3;a++)add(i,side==='left'?a:n-1-a,v*w[a]);
        for(let a=0;a<2;a++)forcing[i][(side==='left'?0:2)+a]+=v*w[3+a];
      }
    }
  }
  return {rows,forcing};
}

// Pivot operations are replayed during solves, avoiding assumptions about the
// lower-triangular bandwidth after row exchanges. Upper fill is retained in Maps.
export function factorFourth(rows,alpha,dt){
  const n=rows.length,matrix=rows.map((row,i)=>new Map([...row].map(([j,v])=>[j,(i===j?alpha:0)-dt*v])));
  matrix.forEach((row,i)=>{if(!row.has(i))row.set(i,alpha);});
  const lower=rows.reduce((b,row,i)=>Math.max(b,...[...row.keys()].map(j=>i-j)),0),pivots=[],multipliers=[],upper=[];
  let minScaledPivot=Infinity;
  for(let k=0;k<n;k++){
    let p=k;for(let i=k+1;i<=Math.min(n-1,k+lower);i++)if(Math.abs(matrix[i].get(k)||0)>Math.abs(matrix[p].get(k)||0))p=i;
    [matrix[k],matrix[p]]=[matrix[p],matrix[k]];pivots.push(p);const diagonal=matrix[k].get(k)||0,scale=Math.max(1,...[...matrix[k].values()].map(Math.abs));
    minScaledPivot=Math.min(minScaledPivot,Math.abs(diagonal)/scale);
    if(!Number.isFinite(diagonal)||Math.abs(diagonal)<1e-13*scale)throw Error('The fourth-order implicit system has a small pivot. Reduce the time step and check the boundary conditions and coefficients.');
    const row=[...matrix[k]].filter(([j,v])=>j>=k&&v!==0).sort((a,b)=>a[0]-b[0]);upper.push(row);const elimination=[];
    for(let i=k+1;i<=Math.min(n-1,k+lower);i++){
      const ratio=(matrix[i].get(k)||0)/diagonal;elimination.push([i,ratio]);matrix[i].delete(k);
      if(ratio)for(const [j,v] of row)if(j>k)matrix[i].set(j,(matrix[i].get(j)||0)-ratio*v);
    }
    multipliers.push(elimination);
  }
  const matrixNorm=Math.max(...rows.map((row,i)=>[...row].reduce((s,[j,v])=>s+Math.abs((j===i?alpha:0)-dt*v),row.has(i)?0:alpha)));
  return {alpha,dt,rows,pivots,multipliers,upper,minScaledPivot,matrixNorm};
}
export function solveFourth(system,rhs){
  const x=rhs.slice(),n=x.length;
  for(let k=0;k<n;k++){const p=system.pivots[k];[x[k],x[p]]=[x[p],x[k]];for(const [i,c] of system.multipliers[k])x[i]-=c*x[k];}
  for(let k=n-1;k>=0;k--){const row=system.upper[k];for(const [j,v] of row)if(j>k)x[k]-=v*x[j];x[k]/=row[0][1];}finite(x);
  let residual=0,scale=0,xnorm=0;
  for(let i=0;i<n;i++){let value=system.alpha*x[i];for(const [j,c] of system.rows[i])value-=system.dt*c*x[j];residual=Math.max(residual,Math.abs(value-rhs[i]));scale=Math.max(scale,Math.abs(rhs[i]));xnorm=Math.max(xnorm,Math.abs(x[i]));}
  const backwardError=residual/Math.max(1e-300,scale+system.matrixNorm*xnorm);
  if(!Number.isFinite(backwardError)||backwardError>1e-10)throw Error('The fourth-order linear solve failed its backward-error check. Reduce the time step and inspect the boundary data.');
  return {values:x,residual,backwardError};
}

const sampleInverse=smallInverse(Array.from({length:7},(_,i)=>Array.from({length:7},(_,k)=>i**k)));
function formulaTraces(ast,prepared,side,time){
  const {config,constants}=prepared,sign=side==='left'?-1:1,h=1e-3*Math.min(1,config.Lx),x=sign*config.Lx/2;
  const values=Array.from({length:7},(_,i)=>evaluate(ast,{...constants,x:x-sign*i*h,t:time}));finite(values);
  // Derivatives annihilate constants. Subtract the endpoint value first so a
  // constant offset does not amplify cancellation by h^-3 in the third trace.
  const differences=values.map(v=>v-values[0]);
  return Array.from({length:4},(_,k)=>k===0?values[0]:dot(sampleInverse[k],differences)*factorial[k]*(-1/h)**k);
}
function formulaMismatch(ast,eq,prepared,time){
  let maximum=0;
  for(const side of ['left','right']){const traces=formulaTraces(ast,prepared,side,time);for(const row of eq.boundaries[side]){const expected=evaluate(row.formula,{...prepared.constants,x:(side==='left'?-1:1)*prepared.config.Lx/2,t:time});maximum=Math.max(maximum,Math.abs(dot(row.weights,traces)-expected));}}
  return maximum;
}
export async function simulateFourth(prepared,progress,yieldTask){
  const {config,grid,constants,equations,operators}=prepared,n=grid.n,start=performance.now(),steps=Math.ceil(config.T/config.dt),dt=config.T/steps;
  const context={...constants,x:grid.x,t:0},names=config.fields.map(f=>f.name),linear=equations.map(eq=>fourthOperator(eq,grid)),systems=[1,1.5].map(alpha=>linear.map(op=>factorFourth(op.rows,alpha,dt)));
  const warnings=['A completed fourth-order run does not certify convergence or well-posedness. Custom boundary pairs can change the spectrum and stability. Refine time step and grid.'];
  const initialBoundaryMismatch=equations.map(eq=>formulaMismatch(eq.initial,eq,prepared,0));
  if(initialBoundaryMismatch.some(v=>v>1e-5))warnings.push('Initial data may not match all four boundary conditions (sampled one-sided derivative check). Initial layers or incompatibility can reduce accuracy.');
  let state=equations.map(eq=>finite(asArray(evaluate(eq.initial,context,grid),n))),previous=null,previousR=null,maxResidual=0,maxBackwardError=0,maxBoundaryResidual=0;
  function domainFor(values,time,data){
    const extended=values.map((v,i)=>extendFourth(v,equations[i],data[i])),extendedContext={...constants,t:time,x:Float64Array.from({length:n+4},(_,i)=>-config.Lx/2+(i-1.5)*grid.hx)};
    names.forEach((name,i)=>extendedContext[name]=extended[i]);
    return {...grid,derivative:(_v,kind,order,ast)=>{
      const degree=kind==='lap'?2:kind==='biharm'?4:order;
      const input=ast.type==='variable'&&names.includes(ast.name)?extended[names.indexOf(ast.name)]:finite(asArray(evaluate(ast,extendedContext,{size:n+4}),n+4));
      return fourthDerivative(input,degree,grid.hx);
    }};
  }
  function rhs(values,time,data,full=false){const ctx={...context,t:time};names.forEach((name,i)=>ctx[name]=values[i]);const domain=domainFor(values,time,data);return equations.map(eq=>finite(asArray(evaluate(full?eq.ast:eq.remainder,ctx,domain),n)));}
  const frames=[],count=Math.min(config.frames,steps+1),saveSteps=new Set(Array.from({length:count},(_,i)=>Math.round(i*steps/(count-1))));
  function save(time,data){
    const faces=[],traces=[],diagnostics=state.map((v,j)=>{
      let sum=0,squared=0,min=Infinity,max=-Infinity;for(const a of v){sum+=a;squared+=a*a;min=Math.min(min,a);max=Math.max(max,a);}
      const edge={},edgeTraces={};let boundaryResidual=0;
      for(const side of ['left','right']){const input=inputAt(v,side,data[j][side]),trace=equations[j].closures[side].traces.map(row=>dot(row,input));edge[side]=[trace[0]];edgeTraces[side]=trace;equations[j].boundaries[side].forEach((row,k)=>{boundaryResidual=Math.max(boundaryResidual,Math.abs(dot(row.weights,trace)-data[j][side][k]));});}
      faces.push(edge);traces.push(edgeTraces);maxBoundaryResidual=Math.max(maxBoundaryResidual,boundaryResidual);
      const d={mean:sum/n,rms:Math.sqrt(squared/n),min,max,mass:sum*grid.hx,boundaryConstraintResidual:boundaryResidual};
      if(equations[j].exact){const ref=finite(asArray(evaluate(equations[j].exact,{...context,t:time},grid),n));let error=0,norm=0;for(let i=0;i<n;i++){error+=(v[i]-ref[i])**2;norm+=ref[i]**2;}d.referenceRmsError=Math.sqrt(error/n);d.referenceRelativeL2=norm>1e-24?Math.sqrt(error/norm):null;}
      return d;
    });
    frames.push({t:time,values:state.map(v=>Array.from(v)),boundaryFaces:faces,boundaryTraces:traces,diagnostics});
  }
  let data=fourthBoundaryData(prepared,0),lastYield=performance.now();save(0,data);
  for(let step=1;step<=steps;step++){
    const reaction=rhs(state,(step-1)*dt,data),nextData=fourthBoundaryData(prepared,step*dt);
    const next=state.map((v,j)=>{
      const targets=[...nextData[j].left,...nextData[j].right],forcing=linear[j].forcing,vector=new Float64Array(n);
      for(let i=0;i<n;i++)vector[i]=step===1?v[i]+dt*(reaction[j][i]+dot(forcing[i],targets)):2*v[i]-.5*previous[j][i]+dt*(2*reaction[j][i]-previousR[j][i]+dot(forcing[i],targets));
      const solved=solveFourth(systems[step===1?0:1][j],vector);maxResidual=Math.max(maxResidual,solved.residual);maxBackwardError=Math.max(maxBackwardError,solved.backwardError);return solved.values;
    });
    previous=state;previousR=reaction;state=next;data=nextData;if(saveSteps.has(step))save(step*dt,data);
    if(performance.now()-lastYield>80){progress(step/steps);await yieldTask();lastYield=performance.now();}
  }
  const referenceChecks=[];
  if(equations.every(eq=>eq.exact))try{
    const checks=equations.map((eq,j)=>({field:names[j],initialRmsMismatch:0,maximumSampledRmsResidual:0,maximumBoundaryMismatch:0}));
    const sample=time=>equations.map(eq=>finite(asArray(evaluate(eq.exact,{...context,t:time},grid),n)));
    for(const time of [0,config.T/2,config.T]){
      const ref=sample(time),h=1e-4*Math.max(1,config.T),a=sample(time-2*h),b=sample(time-h),c=sample(time+h),d=sample(time+2*h),spatial=rhs(ref,time,fourthBoundaryData(prepared,time),true);
      equations.forEach((eq,j)=>{let sum=0;for(let i=0;i<n;i++)sum+=((a[j][i]-8*b[j][i]+8*c[j][i]-d[j][i])/(12*h)-spatial[j][i])**2;checks[j].maximumSampledRmsResidual=Math.max(checks[j].maximumSampledRmsResidual,Math.sqrt(sum/n));checks[j].maximumBoundaryMismatch=Math.max(checks[j].maximumBoundaryMismatch,formulaMismatch(eq.exact,eq,prepared,time));if(time===0){const initial=asArray(evaluate(eq.initial,context,grid),n);checks[j].initialRmsMismatch=Math.sqrt(initial.reduce((s,v,i)=>s+(v-ref[j][i])**2,0)/n);}});
    }
    referenceChecks.push(...checks);
  }catch{warnings.push('Reference residual or boundary sampling could not be completed. Check formula smoothness and finite values near the time endpoints.');}
  progress(1);
  return {schema:'phaseatlas-studio/v1',solverVersion:FOURTH_VERSION,createdAt:new Date().toISOString(),method:FOURTH_METHOD,config,gridLayout:'cell-centered',dt,steps,elapsedMs:performance.now()-start,operators,referenceChecks,initialBoundaryMismatch,linearSolve:{method:'banded LU with partial pivoting',maxAbsoluteResidual:maxResidual,maxRelativeBackwardError:maxBackwardError,minScaledPivot:Math.min(...systems.flat().map(s=>s.minScaledPivot))},maximumBoundaryConstraintResidual:maxBoundaryResidual,warnings,frames};
}
