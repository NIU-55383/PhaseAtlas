import {prepare,makeGrid} from './studio-solver.js';
import {parseParameters,parseExpression,evaluate,derivativeOrder} from './studio-expression.js';
import {boundedDerivative,boundaryData} from './studio-bounded.js';
import {fourthBoundaryData,extendFourth,fourthDerivative} from './studio-fourth.js';
import {statistics,validateExperiment} from './evidence-core.mjs';

const insist=(condition,message)=>{if(!condition)throw Error(message);};
export function setParameter(source,name,value){
  insist(Number.isFinite(value),'Parameter values must be finite.');
  const known=parseParameters(source);insist(Object.hasOwn(known,name),`Define parameter ${name} in the model first.`);
  const entries=source.split(/[;\n]/).map(s=>s.trim()).filter(Boolean);
  const updated=entries.map(entry=>entry.match(/^([A-Za-z][A-Za-z0-9_]*)\s*=/)?.[1]===name?`${name} = ${value}`:entry).join('; ');
  parseParameters(updated);return updated;
}
export function seriesValues(min,max,count){
  insist(Number.isFinite(min)&&Number.isFinite(max)&&max>min,'An axis needs a finite minimum smaller than its maximum.');
  insist(Number.isInteger(count)&&count>=2&&count<=5,'Use 2–5 values on each parameter axis.');
  return Array.from({length:count},(_,i)=>min+(max-min)*i/(count-1));
}
export function buildPlan(raw,kind,options={}){
  const base=prepare(raw).config,jobs=[];
  const add=(config,coordinates,label)=>jobs.push({id:jobs.length,config,coordinates,label,status:'pending'});
  if(kind==='single')add(base,{},'Single experiment');
  else if(kind==='space'||kind==='time'){
    const actualDt=base.T/Math.ceil(base.T/base.dt);
    for(let level=0;level<3;level++)add({...base,N:kind==='space'?base.N*2**level:base.N,dt:kind==='time'?actualDt/2**level:actualDt},{level},`Level ${level+1}`);
  }else if(kind==='sweep'){
    const xs=seriesValues(options.xMin,options.xMax,options.xCount),ys=options.yParameter?seriesValues(options.yMin,options.yMax,options.yCount):[null];
    insist(!options.yParameter||options.yParameter!==options.xParameter,'Choose different parameters for the two axes.');
    for(let j=0;j<ys.length;j++)for(let i=0;i<xs.length;i++){
      let parameters=setParameter(base.parameters,options.xParameter,xs[i]);
      if(options.yParameter)parameters=setParameter(parameters,options.yParameter,ys[j]);
      // Admissibility errors are recorded per cell when the study runs.
      add({...base,parameters},{i,j,x:xs[i],y:ys[j]},`${options.xParameter}=${xs[i]}${options.yParameter?`, ${options.yParameter}=${ys[j]}`:''}`);
    }
  }else throw Error('Unknown study type.');
  let work=0,stored=0;
  for(const job of jobs){
    const c=job.config;
    insist(c.N<=(c.dimension===1?1024:128),'This study exceeds the grid limit. Start from N ≤ 256 in 1D or N ≤ 32 in 2D for three spatial levels.');
    work+=Math.ceil(c.T/c.dt)*c.N**c.dimension*c.fields.length;
    stored+=Math.min(c.frames,Math.ceil(c.T/c.dt)+1)*c.N**c.dimension*c.fields.length;
    if(kind!=='sweep')prepare(c);
  }
  insist(work<=240000000,'The combined study exceeds 240 million field-grid-point steps. Reduce duration, grid or parameter count.');
  insist(stored<=6000000,'This study would retain over six million values. Reduce saved frames, grid or parameter count.');
  return {schema:'phaseatlas-study/v1',createdAt:new Date().toISOString(),baseConfig:base,kind,options:{...options},jobs,work,stored,
    interpretation:kind==='sweep'?'Finite-time initial-value scan. It does not trace stationary branches or classify bifurcations.':'Independent experiments with recorded discretizations. Numerical evidence does not constitute a proof.'};
}
export function makeObserver(experiment,source){
  const c=experiment.config,prepared=prepare(c),g=makeGrid(c),names=c.fields.map(f=>f.name),constants={...parseParameters(c.parameters),Lx:c.Lx,Ly:c.Ly};
  const ast=parseExpression(source,[...names,...Object.keys(constants),'x',...(c.dimension===2?['y']:[]),'t']);
  function inspect(a){if(a.type==='call'){
    if(['D','Dx','Dy','lap','biharm'].includes(a.name)&&c.boundary!=='periodic'){
      insist(a.args[0].type==='variable'&&names.includes(a.args[0].name),'Bounded observation derivatives must act directly on a field.');
      insist(a.name!=='Dy'||c.dimension===2,'Dy requires a 2D field.');
      insist(derivativeOrder(a)<=(c.boundary==='fourth-order'?4:2),'Unsupported derivative for this boundary backend.');
    }a.args.forEach(inspect);
  }else if(a.type==='binary'){inspect(a.left);inspect(a.right);}else if(a.type==='unary')inspect(a.child);}
  inspect(ast);
  return (snapshot)=>{
    const context={...constants,x:g.x,y:g.y,t:snapshot.t};names.forEach((name,i)=>context[name]=snapshot.values[i]);
    let domain=g;
    if(c.boundary==='nonperiodic'){
      const data=boundaryData(prepared,snapshot.t);
      domain={...g,derivative:(values,kind,order,input)=>boundedDerivative(values,kind,order,names.indexOf(input.name),prepared,data)};
    }else if(c.boundary==='fourth-order'){
      const data=fourthBoundaryData(prepared,snapshot.t);
      domain={...g,derivative:(values,kind,order,input)=>fourthDerivative(extendFourth(values,prepared.equations[names.indexOf(input.name)],data[names.indexOf(input.name)]),kind==='lap'?2:kind==='biharm'?4:order,prepared.grid.hx)};
    }
    const value=evaluate(ast,context,domain),out=typeof value==='number'?new Array(g.size).fill(value):Array.from(value);
    insist(out.every(v=>Number.isFinite(v)&&Math.abs(v)<=1e100),'The observation is non-finite or outside the display range.');
    return out;
  };
}
export function samplePoint(values,c,x,y=0){
  insist(Number.isFinite(x)&&Number.isFinite(y)&&x>=-c.Lx/2&&x<=c.Lx/2&&(c.dimension===1||(y>=-c.Ly/2&&y<=c.Ly/2)),'Probe point lies outside the domain.');
  const index=(coordinate,length)=>{const z=(coordinate+length/2)/length*c.N-(c.boundary==='periodic'?0:.5);return c.boundary==='periodic'?z:Math.max(0,Math.min(c.N-1,z));};
  const a=index(x,c.Lx),b=c.dimension===2?index(y,c.Ly):0,ix=Math.floor(a),iy=Math.floor(b),sx=a-ix,sy=b-iy;
  const at=(i,j)=>values[((j%c.N+c.N)%c.N)*c.N+(i%c.N+c.N)%c.N];
  if(c.dimension===1)return (1-sx)*values[(ix%c.N+c.N)%c.N]+sx*values[((ix+1)%c.N+c.N)%c.N];
  return (1-sy)*((1-sx)*at(ix,iy)+sx*at(ix+1,iy))+sy*((1-sx)*at(ix,iy+1)+sx*at(ix+1,iy+1));
}
export function observationHistory(e,expression,mode='rms',point={x:0,y:0}){
  const observe=makeObserver(e,expression),volume=e.config.Lx*(e.config.dimension===2?e.config.Ly:1);
  return e.frames.map(f=>{const values=observe(f),s=statistics(values);return {t:f.t,value:mode==='integral'?s.mean*volume:mode==='point'?samplePoint(values,e.config,point.x,point.y):s[mode]};});
}
export function waveDiagnostics(e,field=0,{level=.5,center=0,radius=5,eta=0,maxShift=1,reference='initial'}={}){
  validateExperiment(e);const c=e.config,n=c.N,h=c.Lx/n;
  insist(c.dimension===1,'Wave alignment currently requires a 1D field.');
  insist(Number.isInteger(field)&&field>=0&&field<c.fields.length,'Select a valid field.');
  insist([level,center,radius,eta,maxShift].every(Number.isFinite)&&radius>0&&maxShift>0&&maxShift<c.Lx/3,'Use finite diagnostics, a positive window radius and 0 < maximum shift < Lx/3.');
  insist(Math.abs(eta)*(c.Lx/2+Math.abs(center))<=40,'The exponential weight is too large for a reliable displayed norm.');
  const grid=makeGrid(c),x=Array.from(grid.x),periodic=c.boundary==='periodic';
  const indices=x.map((v,i)=>i).filter(i=>Math.abs(x[i]-center)<=radius&&(periodic||(x[i]>=x[0]+maxShift&&x[i]<=x.at(-1)-maxShift)));
  insist(indices.length>=8,'The fixed alignment window must contain at least eight grid points after the boundary buffer.');
  const f=c.fields[field],constants={...parseParameters(c.parameters),Lx:c.Lx,Ly:c.Ly};
  const refAst=reference==='formula'&&f.exact?parseExpression(f.exact,['x','t',...Object.keys(constants)]):null;
  insist(reference==='initial'||refAst,'This field has no supplied reference formula.');
  const interpolate=(values,location)=>{
    const z=(location-x[0])/h,low=Math.floor(z),s=z-low;
    if(periodic)return (1-s)*values[(low%n+n)%n]+s*values[((low+1)%n+n)%n];
    if(z<-1e-9||z>n-1+1e-9)return NaN;
    const p=Math.max(0,Math.min(n-1,z)),a=Math.floor(p),b=Math.min(n-1,a+1);return values[a]*(1-(p-a))+values[b]*(p-a);
  };
  const rows=e.frames.map(snapshot=>{
    const u=snapshot.values[field],raw=refAst?evaluate(refAst,{...constants,x:grid.x,t:snapshot.t},{size:n}):e.frames[0].values[field],ref=typeof raw==='number'?new Array(n).fill(raw):Array.from(raw);
    insist(ref.every(Number.isFinite),'Reference formula is not finite.');
    let global=0,local=0,weighted=0,edge=0;
    for(let i=0;i<n;i++){const square=(u[i]-ref[i])**2*h;global+=square;if(Math.abs(x[i]-center)<=radius)local+=square;weighted+=square*Math.exp(2*eta*(x[i]-center));if(Math.abs(x[i])>=.4*c.Lx)edge+=square;}
    const crossing=[];let plateau=false;
    for(let i=0;i<n-1;i++){
      const a=u[i]-level,b=u[i+1]-level;if(a===0&&b===0){plateau=true;continue;}
      if(a===0||a*b<0)crossing.push(x[i]+h*(-a)/(b-a));
    }
    if(u[n-1]===level)crossing.push(x[n-1]);
    // A periodic profile can cross the level across its last-to-first edge.
    // Omitting that edge would incorrectly label a two-crossing wave as unique.
    if(periodic&&(u[n-1]-level)*(u[0]-level)<0)crossing.push(x[n-1]+h*(level-u[n-1])/(u[0]-u[n-1]));
    let shift=null,alignedRms=null,atSearchLimit=false;
    const refStats=statistics(ref),amplitude=refStats.max-refStats.min;
    if(amplitude>1e-12*Math.max(1,refStats.rms)){
      const loss=s=>indices.reduce((sum,i)=>sum+(u[i]-interpolate(ref,x[i]-s))**2,0)/indices.length;
      const samples=81,spacing=2*maxShift/(samples-1);let best=0,bestValue=Infinity;
      for(let k=0;k<samples;k++){const v=loss(-maxShift+k*spacing);if(v<bestValue){best=k;bestValue=v;}}
      let left=-maxShift+Math.max(0,best-1)*spacing,right=-maxShift+Math.min(samples-1,best+1)*spacing;
      for(let k=0;k<32;k++){const a=left+(right-left)/3,b=right-(right-left)/3;if(loss(a)<loss(b))right=b;else left=a;}
      shift=(left+right)/2;alignedRms=Math.sqrt(loss(shift));atSearchLimit=Math.abs(shift)>.99*maxShift;
    }
    return {t:snapshot.t,position:!plateau&&crossing.length===1?crossing[0]:null,crossings:crossing.length,shift,alignedRms,atSearchLimit,
      globalL2:Math.sqrt(global),localL2:Math.sqrt(local),weightedL2:Math.sqrt(weighted),edgeFraction:global>1e-28?edge/global:null};
  });
  rows.forEach((r,i)=>{const a=rows[Math.max(0,i-1)],b=rows[Math.min(rows.length-1,i+1)];r.speed=r.position!==null&&a.position!==null&&b.position!==null&&b.t>a.t?(b.position-a.position)/(b.t-a.t):null;});
  return {field:f.name,reference:refAst?'supplied formula at each time':'initial numerical profile',level,center,radius,eta,maxShift,rows,
    limitation:'Alignment minimizes a sampled squared difference over a fixed window; interpolation and a bounded shift search limit accuracy. Threshold speed is withheld when a unique crossing is absent. These are finite-time diagnostics, not a stability or convective/absolute classification.'};
}
export function gaussianSeed(config,field,x,y,amplitude,radius){
  insist(config.boundary==='periodic','Initial-data seeds currently require periodic boundaries.');
  insist(Number.isFinite(amplitude)&&Number.isFinite(radius)&&radius>0,'Seed amplitude and radius must be finite, with radius positive.');
  const out=structuredClone(config),f=out.fields[field];insist(f,'Select a valid field for the seed.');
  const dx=`(${config.Lx}/(2*pi*${radius}))^2*(1-cos(2*pi*(x-(${x}))/${config.Lx}))`;
  const dy=config.dimension===2?`+(${config.Ly}/(2*pi*${radius}))^2*(1-cos(2*pi*(y-(${y}))/${config.Ly}))`:'';
  f.initial=`(${f.initial})+(${amplitude})*exp(-(${dx}${dy}))`;f.exact='';
  prepare(out);return out;
}
