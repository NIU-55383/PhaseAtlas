import {parseExpression, parseParameters, evaluate, derivativeOrder, splitLinear} from './studio-expression.js';

export const BOUNDED_VERSION = 'phaseatlas-fv-sbdf2-1.0.0';
export const BOUNDED_METHOD = 'Cell-centered finite volumes for diagonal diffusion; centered interior first derivatives with boundary closures; SBDF2 with backward-Euler startup; implicit diffusion solved by preconditioned conjugate gradients. Dirichlet/Neumann faces; no periodic extension or spectral filter.';
export const sidesFor = dimension => dimension === 2 ? ['left','right','bottom','top'] : ['left','right'];
const norm = a => Math.sqrt(a.reduce((s,v)=>s+v*v,0));
function check(a) {for(const v of a)if(!Number.isFinite(v)||Math.abs(v)>1e8)throw Error('The bounded-domain computation became non-finite or exceeded the amplitude limit. Reduce the time step and check the model. This is not proof of blow-up.');}
const array = (v,n) => typeof v === 'number' ? new Float64Array(n).fill(v) : v;

export function makeBoundedGrid(config) {
  const n=config.N,ny=config.dimension===2?n:1,size=n*ny,hx=config.Lx/n,hy=config.Ly/n;
  const x=new Float64Array(size),y=new Float64Array(size);
  for(let j=0;j<ny;j++)for(let i=0;i<n;i++){const p=j*n+i;x[p]=-config.Lx/2+(i+.5)*hx;y[p]=ny>1?-config.Ly/2+(j+.5)*hy:0;}
  return {n,ny,size,hx,hy,x,y,layout:'cell-centered'};
}

function inspectDerivatives(ast,names,dimension) {
  if(ast.type==='call'){
    if(['D','Dx','Dy','lap','biharm'].includes(ast.name)){
      if(ast.args[0].type!=='variable'||!names.includes(ast.args[0].name))throw Error('Non-periodic derivatives must act directly on an active field. For smooth Burgers flow use u*Dx(u,1), rather than Dx(u^2,1)/2.');
      if(ast.name==='Dy'&&dimension===1)throw Error('Dy requires a two-dimensional domain.');
    }
    ast.args.forEach(a=>inspectDerivatives(a,names,dimension));
  }else if(ast.type==='binary'){inspectDerivatives(ast.left,names,dimension);inspectDerivatives(ast.right,names,dimension);}
  else if(ast.type==='unary')inspectDerivatives(ast.child,names,dimension);
}

export function prepareBounded(config) {
  const grid=makeBoundedGrid(config),constants={...parseParameters(config.parameters),Lx:config.Lx,Ly:config.Ly};
  const names=config.fields.map(f=>f.name),space=['x',...(config.dimension===2?['y']:[]),...Object.keys(constants)],sides=sidesFor(config.dimension);
  const equations=config.fields.map(f=>{
    const ast=parseExpression(f.rhs,[...space,'t',...names]);
    if(derivativeOrder(ast)>2)throw Error('Non-periodic third- and fourth-order PDEs require additional, model-specific boundary conditions. This backend supports second-order diffusion systems; keep higher-order models periodic for now.');
    inspectDerivatives(ast,names,config.dimension);
    const initial=parseExpression(f.initial,space),exact=f.exact?parseExpression(f.exact,[...space,'t']):null;
    if(derivativeOrder(initial)||exact&&derivativeOrder(exact))throw Error('Initial and reference formulas must be explicit coordinate functions.');
    const split=splitLinear(ast,f.name,constants,config.dimension);
    if(derivativeOrder(split.remainder)>1)throw Error('Non-periodic second derivatives currently require constant, diagonal diffusion, such as nu*lap(u). Cross-diffusion and variable/nonlinear diffusivity need a separate solver.');
    const diffusion={x:0,y:0},linear=[];
    for(const term of split.terms){const [px,py,c]=term;if(px===2&&py===0)diffusion.x+=c;else if(px===0&&py===2)diffusion.y+=c;else if(px+py<=1)linear.push(term);else throw Error('Mixed second derivatives are not supported by the bounded-domain solver.');}
    if(diffusion.x<0||diffusion.y<0)throw Error('Non-periodic diffusion coefficients must be non-negative.');
    const boundaries={};
    for(const side of sides){const b=f.boundaries?.[side];if(!b||!['dirichlet','neumann'].includes(b.type)||typeof b.value!=='string')throw Error(`Set a Dirichlet value or Neumann outward derivative on the ${side} edge of ${f.name}.`);const formula=parseExpression(b.value,[...space,'t']);if(derivativeOrder(formula))throw Error('Boundary data must be explicit functions of position, time and parameters.');boundaries[side]={type:b.type,formula};}
    return {ast,initial,exact,diffusion,linear,remainder:split.remainder,boundaries};
  });
  // Two boundary constraints are not appropriate for a pure first-order transport equation.
  equations.forEach(eq=>{
    function scan(node){if(node.type==='call'){if(['D','Dx','Dy'].includes(node.name)&&node.args[1]?.value===1){const f=names.indexOf(node.args[0].name),axis=node.name==='Dy'?'y':'x';if(equations[f].diffusion[axis]<=0)throw Error('First spatial derivatives in non-periodic mode require positive diffusion in that direction for the differentiated field. Pure transport needs inflow/outflow boundary handling.');}node.args.forEach(scan);}else if(node.type==='binary'){scan(node.left);scan(node.right);}else if(node.type==='unary')scan(node.child);}
    scan(eq.ast);
  });
  return {config,grid,constants,equations,operators:equations.map((eq,j)=>({field:names[j],diffusion:eq.diffusion,implicit:'diagonal diffusion',explicit:'reaction, forcing and first derivatives'}))};
}

export function boundaryData(prepared,time) {
  const {config:c,grid:g,constants,equations}=prepared;
  return equations.map(eq=>Object.fromEntries(sidesFor(c.dimension).map(side=>{
    const values=new Float64Array(side==='left'||side==='right'?g.ny:g.n);
    for(let k=0;k<values.length;k++){
      const point={...constants,t:time,x:side==='left'?-c.Lx/2:side==='right'?c.Lx/2:-c.Lx/2+(k+.5)*g.hx,y:side==='bottom'?-c.Ly/2:side==='top'?c.Ly/2:c.dimension===2?-c.Ly/2+(k+.5)*g.hy:0};
      values[k]=evaluate(eq.boundaries[side].formula,point);
    }
    check(values);return [side,values];
  })));
}

export function boundedDerivative(values,kind,order,field,prepared,data) {
  const {grid:g,equations}=prepared,eq=equations[field],out=new Float64Array(g.size);
  function directional(axis,degree) {
    const result=new Float64Array(g.size),h=axis==='x'?g.hx:g.hy,stride=axis==='x'?1:g.n,count=axis==='x'?g.n:g.ny;
    const low=axis==='x'?'left':'bottom',high=axis==='x'?'right':'top';
    for(let j=0;j<g.ny;j++)for(let i=0;i<g.n;i++){
      const p=j*g.n+i,k=axis==='x'?i:j,edgeIndex=axis==='x'?j:i,u=values[p];
      let a=k>0?values[p-stride]:eq.boundaries[low].type==='dirichlet'?2*data[field][low][edgeIndex]-u:u+h*data[field][low][edgeIndex];
      let b=k<count-1?values[p+stride]:eq.boundaries[high].type==='dirichlet'?2*data[field][high][edgeIndex]-u:u+h*data[field][high][edgeIndex];
      // Quadratic Dirichlet closure for first derivatives at the first/last center.
      if(degree===1&&k===0&&eq.boundaries[low].type==='dirichlet')a=8/3*data[field][low][edgeIndex]-2*u+values[p+stride]/3;
      if(degree===1&&k===count-1&&eq.boundaries[high].type==='dirichlet')b=8/3*data[field][high][edgeIndex]-2*u+values[p-stride]/3;
      result[p]=degree===1?(b-a)/(2*h):(a-2*u+b)/(h*h);
    }
    return result;
  }
  if(kind==='lap'){const a=directional('x',2),b=g.ny>1?directional('y',2):null;for(let i=0;i<g.size;i++)out[i]=a[i]+(b?b[i]:0);return out;}
  return directional(kind==='Dy'?'y':'x',order);
}

function linearSystem(eq,g,alpha,dt) {
  const wx=dt*eq.diffusion.x/g.hx**2,wy=g.ny>1?dt*eq.diffusion.y/g.hy**2:0,diagonal=new Float64Array(g.size);
  for(let j=0;j<g.ny;j++)for(let i=0;i<g.n;i++){
    const xdiag=i===0?(eq.boundaries.left.type==='dirichlet'?3:1):i===g.n-1?(eq.boundaries.right.type==='dirichlet'?3:1):2;
    const ydiag=g.ny===1?0:j===0?(eq.boundaries.bottom.type==='dirichlet'?3:1):j===g.ny-1?(eq.boundaries.top.type==='dirichlet'?3:1):2;
    diagonal[j*g.n+i]=alpha+wx*xdiag+wy*ydiag;
  }
  function apply(v,out){for(let j=0;j<g.ny;j++)for(let i=0;i<g.n;i++){const p=j*g.n+i;out[p]=diagonal[p]*v[p]-(i>0?wx*v[p-1]:0)-(i<g.n-1?wx*v[p+1]:0)-(j>0?wy*v[p-g.n]:0)-(j<g.ny-1?wy*v[p+g.n]:0);}}
  return {diagonal,apply};
}

function solve(system,rhs,guess) {
  const n=rhs.length,x=guess.slice(),r=new Float64Array(n),z=new Float64Array(n),p=new Float64Array(n),ap=new Float64Array(n);
  system.apply(x,ap);let rz=0,rr=0;
  for(let i=0;i<n;i++){r[i]=rhs[i]-ap[i];z[i]=r[i]/system.diagonal[i];p[i]=z[i];rz+=r[i]*z[i];rr+=r[i]**2;}
  const tolerance=1e-11*Math.max(1,norm(rhs)),limit=Math.min(n+5,2500);
  if(Math.sqrt(rr)<=tolerance)return {values:x,iterations:0,residual:Math.sqrt(rr)};
  for(let step=0;step<limit;step++){
    system.apply(p,ap);let pap=0;for(let i=0;i<n;i++)pap+=p[i]*ap[i];if(!(pap>0))throw Error('The implicit diffusion solve lost positive definiteness.');
    const a=rz/pap;rr=0;for(let i=0;i<n;i++){x[i]+=a*p[i];r[i]-=a*ap[i];rr+=r[i]**2;}
    if(Math.sqrt(rr)<=tolerance){check(x);return {values:x,iterations:step+1,residual:Math.sqrt(rr)};}
    let next=0;for(let i=0;i<n;i++){z[i]=r[i]/system.diagonal[i];next+=r[i]*z[i];}
    const beta=next/rz;for(let i=0;i<n;i++)p[i]=z[i]+beta*p[i];rz=next;
  }
  throw Error('The implicit diffusion solve did not reach tolerance. Reduce the time step or grid size.');
}

function boundaryForcing(eq,g,data) {
  const out=new Float64Array(g.size);
  const add=(side,p,k,h,d)=>{out[p]+=d*(eq.boundaries[side].type==='dirichlet'?2*data[side][k]/h**2:data[side][k]/h);};
  for(let j=0;j<g.ny;j++){add('left',j*g.n,j,g.hx,eq.diffusion.x);add('right',j*g.n+g.n-1,j,g.hx,eq.diffusion.x);}
  if(g.ny>1)for(let i=0;i<g.n;i++){add('bottom',i,i,g.hy,eq.diffusion.y);add('top',(g.ny-1)*g.n+i,i,g.hy,eq.diffusion.y);}
  return out;
}

function boundaryFaces(values,eq,g,data) {
  const faces={},derivatives={};let rate=0;
  const edge=(side,indices,h,d,area)=>{
    faces[side]=[];derivatives[side]=[];
    indices.forEach((p,k)=>{const dir=eq.boundaries[side].type==='dirichlet',value=dir?data[side][k]:values[p]+h*data[side][k]/2,q=dir?2*(value-values[p])/h:data[side][k];faces[side].push(value);derivatives[side].push(q);rate+=d*q*area;});
  };
  edge('left',Array.from({length:g.ny},(_,j)=>j*g.n),g.hx,eq.diffusion.x,g.ny>1?g.hy:1);
  edge('right',Array.from({length:g.ny},(_,j)=>j*g.n+g.n-1),g.hx,eq.diffusion.x,g.ny>1?g.hy:1);
  if(g.ny>1){edge('bottom',Array.from({length:g.n},(_,i)=>i),g.hy,eq.diffusion.y,g.hx);edge('top',Array.from({length:g.n},(_,i)=>(g.ny-1)*g.n+i),g.hy,eq.diffusion.y,g.hx);}
  return {faces,derivatives,rate};
}

function formulaBoundaryMismatch(ast,eq,prepared,time) {
  const {config:c,grid:g,constants}=prepared;let maximum=0;
  for(const side of sidesFor(c.dimension))for(let k=0;k<(c.dimension===2?5:1);k++){
    const horizontal=side==='left'||side==='right',axis=horizontal?'x':'y',length=horizontal?c.Lx:c.Ly,sign=side==='left'||side==='bottom'?-1:1;
    const point={...constants,t:time,x:horizontal?sign*c.Lx/2:-c.Lx/2+(k+.5)*c.Lx/5,y:horizontal?(c.dimension===2?-c.Ly/2+(k+.5)*c.Ly/5:0):sign*c.Ly/2};
    const h=1e-5*length,v=evaluate(ast,point),b=eq.boundaries[side],target=evaluate(b.formula,point);
    const measured=b.type==='dirichlet'?v:(3*v-4*evaluate(ast,{...point,[axis]:point[axis]-sign*h})+evaluate(ast,{...point,[axis]:point[axis]-2*sign*h}))/(2*h);
    if(!Number.isFinite(measured)||!Number.isFinite(target))throw Error('Boundary/reference formulas must remain finite.');maximum=Math.max(maximum,Math.abs(measured-target));
  }
  return maximum;
}

export async function simulateBounded(prepared,progress,yieldTask) {
  const {config,grid:g,constants,equations,operators}=prepared,start=performance.now(),steps=Math.ceil(config.T/config.dt),dt=config.T/steps;
  const context={...constants,x:g.x,y:g.y,t:0},warnings=['A completed bounded-domain run does not certify convergence. Check time step, grid, boundary compatibility and physical units.'];
  const initialBoundaryMismatch=equations.map(eq=>formulaBoundaryMismatch(eq.initial,eq,prepared,0));
  if(initialBoundaryMismatch.some(v=>v>1e-5))warnings.push('Initial data do not match one or more boundary conditions. A boundary layer or initial transient may reduce accuracy; refine near the start.');
  let state=equations.map(eq=>array(evaluate(eq.initial,context,g),g.size));state.forEach(check);
  const systems=[1,1.5].map(alpha=>equations.map(eq=>linearSystem(eq,g,alpha,dt)));
  const names=config.fields.map(f=>f.name);let oldState=null,oldReaction=null,totalIterations=0,maxResidual=0;
  function reaction(values,time,data) {
    const ctx={...context,t:time};values.forEach((v,j)=>ctx[names[j]]=v);
    const domain={...g,derivative:(v,kind,order,ast)=>boundedDerivative(v,kind,order,names.indexOf(ast.name),prepared,data)};
    return equations.map((eq,j)=>{
      const out=array(evaluate(eq.remainder,ctx,domain),g.size).slice();
      for(const [px,py,c] of eq.linear){const term=px+py===0?values[j]:boundedDerivative(values[j],py?'Dy':'Dx',1,j,prepared,data);for(let i=0;i<g.size;i++)out[i]+=c*term[i];}
      check(out);return out;
    });
  }
  const frames=[],frameCount=Math.min(config.frames,steps+1),saveSteps=new Set(Array.from({length:frameCount},(_,i)=>Math.round(i*steps/(frameCount-1))));
  function save(time,data) {
    const edgeValues=[],diagnostics=state.map((v,j)=>{
      let sum=0,squares=0,min=Infinity,max=-Infinity;for(const a of v){sum+=a;squares+=a*a;min=Math.min(min,a);max=Math.max(max,a);}
      const face=boundaryFaces(v,equations[j],g,data[j]);edgeValues.push(face.faces);
      const d={mean:sum/g.size,rms:Math.sqrt(squares/g.size),min,max,mass:sum*g.hx*(g.ny>1?g.hy:1),boundaryMassRate:face.rate};
      if(equations[j].exact){const ref=array(evaluate(equations[j].exact,{...context,t:time},g),g.size);check(ref);let error=0,norm=0;for(let i=0;i<g.size;i++){error+=(v[i]-ref[i])**2;norm+=ref[i]**2;}d.referenceRmsError=Math.sqrt(error/g.size);d.referenceRelativeL2=norm>1e-24?Math.sqrt(error/norm):null;}
      return d;
    });
    frames.push({t:time,values:state.map(v=>Array.from(v)),boundaryFaces:edgeValues,diagnostics});
  }
  let data=boundaryData(prepared,0),lastYield=performance.now();save(0,data);
  for(let step=1;step<=steps;step++){
    const currentReaction=reaction(state,(step-1)*dt,data),nextData=boundaryData(prepared,step*dt);
    const next=equations.map((eq,j)=>{
      const forcing=boundaryForcing(eq,g,nextData[j]),rhs=new Float64Array(g.size);
      for(let i=0;i<g.size;i++)rhs[i]=step===1?state[j][i]+dt*(currentReaction[j][i]+forcing[i]):2*state[j][i]-.5*oldState[j][i]+dt*(2*currentReaction[j][i]-oldReaction[j][i]+forcing[i]);
      const solved=solve(systems[step===1?0:1][j],rhs,state[j]);totalIterations+=solved.iterations;maxResidual=Math.max(maxResidual,solved.residual);return solved.values;
    });
    oldState=state;oldReaction=currentReaction;state=next;data=nextData;
    if(saveSteps.has(step))save(step*dt,data);
    if(performance.now()-lastYield>80){progress(step/steps);await yieldTask();lastYield=performance.now();}
  }
  const referenceChecks=[];
  if(equations.every(eq=>eq.exact)){
    try{
      const checks=equations.map((eq,j)=>({field:names[j],initialRmsMismatch:0,maximumSampledRmsResidual:0,maximumBoundaryMismatch:0}));
      for(const time of [0,config.T/2,config.T]){
        const data=boundaryData(prepared,time),ctx={...context,t:time};equations.forEach((eq,j)=>ctx[names[j]]=array(evaluate(eq.exact,ctx,g),g.size));
        const domain={...g,derivative:(v,kind,order,ast)=>boundedDerivative(v,kind,order,names.indexOf(ast.name),prepared,data)};
        equations.forEach((eq,j)=>{
          const h=1e-4*Math.max(1,config.T),sample=t=>array(evaluate(eq.exact,{...context,t},g),g.size),a=sample(time-2*h),b=sample(time-h),c=sample(time+h),d=sample(time+2*h),rhs=array(evaluate(eq.ast,ctx,domain),g.size);[a,b,c,d,rhs].forEach(check);let squared=0;
          for(let i=0;i<g.size;i++)squared+=((a[i]-8*b[i]+8*c[i]-d[i])/(12*h)-rhs[i])**2;
          checks[j].maximumSampledRmsResidual=Math.max(checks[j].maximumSampledRmsResidual,Math.sqrt(squared/g.size));checks[j].maximumBoundaryMismatch=Math.max(checks[j].maximumBoundaryMismatch,formulaBoundaryMismatch(eq.exact,eq,prepared,time));
          if(time===0){const initial=array(evaluate(eq.initial,context,g),g.size);let error=0;for(let i=0;i<g.size;i++)error+=(initial[i]-ctx[names[j]][i])**2;checks[j].initialRmsMismatch=Math.sqrt(error/g.size);}
        });
      }
      referenceChecks.push(...checks);
    }catch{warnings.push('Reference residual sampling could not be completed. Check smoothness and finite values near the time endpoints.');}
  }
  progress(1);
  return {schema:'phaseatlas-studio/v1',solverVersion:BOUNDED_VERSION,createdAt:new Date().toISOString(),method:BOUNDED_METHOD,config,gridLayout:'cell-centered',dt,steps,elapsedMs:performance.now()-start,operators,referenceChecks,initialBoundaryMismatch,linearSolve:{totalIterations,maxAbsoluteResidual:maxResidual,relativeTolerance:1e-11},warnings,frames};
}
