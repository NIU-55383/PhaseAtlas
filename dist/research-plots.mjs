export const colors=['#0000cd','#c96428','#168277','#a04ca3'];
export const fmt=v=>v===null||!Number.isFinite(v)?'—':v===0?'0':Math.abs(v)<.001||Math.abs(v)>=1e4?v.toExponential(2):Number(v.toPrecision(4)).toString();
function setup(canvas,height=310){const W=Math.max(280,canvas.clientWidth),H=height,dpr=Math.min(2,globalThis.devicePixelRatio||1);canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);canvas.style.height=`${H}px`;const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);ctx.font='12px Arial';ctx.fillStyle='#59647b';return {ctx,W,H};}
export function shade(q,palette='blue'){
  q=Math.max(0,Math.min(1,q));
  const stops=palette==='gray'?[[25,35,55],[245,247,250]]:palette==='viridis'?[[68,1,84],[59,82,139],[33,145,140],[94,201,98],[253,231,37]]:[[0,0,205],[255,255,255],[201,100,40]];
  const t=q*(stops.length-1),i=Math.min(stops.length-2,Math.floor(t)),s=t-i;return `rgb(${stops[i].map((v,k)=>Math.round(v*(1-s)+stops[i+1][k]*s)).join(',')})`;
}
export function drawLines(canvas,series,{xlabel='t',ylabel='',height=280,log=false}={}){
  const {ctx,W,H}=setup(canvas,height),pts=series.flatMap(s=>s.x.flatMap((x,i)=>Number.isFinite(s.y[i])&&(!log||s.y[i]>0)?[[x,log?Math.log10(s.y[i]):s.y[i]]]:[]));
  if(!pts.length){ctx.fillText('No resolved values to plot.',25,45);return;}
  let xmin=Math.min(...pts.map(p=>p[0])),xmax=Math.max(...pts.map(p=>p[0])),ymin=Math.min(...pts.map(p=>p[1])),ymax=Math.max(...pts.map(p=>p[1]));if(xmin===xmax)xmax=xmin+1;
  if(ymin===ymax){const d=Math.max(1e-9,Math.abs(ymin)*.1);ymin-=d;ymax+=d;}else{const d=.06*(ymax-ymin);ymin-=d;ymax+=d;}
  const left=66,top=43,width=W-left-20,heightPlot=H-93,X=v=>left+(v-xmin)/(xmax-xmin)*width,Y=v=>top+(ymax-v)/(ymax-ymin)*heightPlot;
  ctx.strokeStyle='#dfe3ef';ctx.strokeRect(left,top,width,heightPlot);ctx.fillText(fmt(ymax),3,top+5);ctx.fillText(fmt(ymin),3,top+heightPlot);ctx.fillText(fmt(xmin),left,top+heightPlot+19);ctx.fillText(fmt(xmax),left+width-30,top+heightPlot+19);ctx.fillText(xlabel,left+width/2,top+heightPlot+37);ctx.fillText((log?'log₁₀ ':'')+ylabel,left,top-8);
  series.forEach((s,index)=>{ctx.strokeStyle=colors[index%colors.length];ctx.fillStyle=ctx.strokeStyle;ctx.lineWidth=1.8;ctx.fillText(s.name||'',10+index*(W/Math.max(1,series.length)),14,W/series.length-10);ctx.beginPath();let active=false;s.x.forEach((x,i)=>{const v=s.y[i];if(!Number.isFinite(v)||log&&v<=0){active=false;return;}const y=log?Math.log10(v):v;if(!active){ctx.moveTo(X(x),Y(y));active=true;}else ctx.lineTo(X(x),Y(y));});ctx.stroke();});
}
export function drawField(canvas,c,values,range,{palette='blue',view='plane',angle=35,contours=false,vectors=null,expression='u'}={}){
  const {ctx,W,H}=setup(canvas,360),[lo,hi0]=range,hi=hi0===lo?lo+1:hi0;
  let left=64,top=32,width=W-left-24,height=H-92;
  const rectangle=()=>({left,top,width,height,c});
  ctx.fillText(`${expression} · [${fmt(lo)}, ${fmt(hi)}]`,left,18,W-left-15);
  if(c.dimension===1){
    const Y=v=>top+(hi-v)/(hi-lo)*height;ctx.strokeStyle='#dfe3ef';ctx.strokeRect(left,top,width,height);ctx.fillText(fmt(hi),3,top+8);ctx.fillText(fmt(lo),3,top+height);ctx.beginPath();ctx.strokeStyle=colors[0];ctx.lineWidth=2;
    for(let i=0;i<c.N;i++){const x=left+(i+(c.boundary==='periodic'?0:.5))/c.N*width;i?ctx.lineTo(x,Y(values[i])):ctx.moveTo(x,Y(values[i]));}ctx.stroke();
  }else if(view==='surface'){
    const theta=angle*Math.PI/180,n=c.N,stride=Math.max(1,Math.ceil(n/36)),L=Math.max(c.Lx,c.Ly),offset=c.boundary==='periodic'?0:.5,project=(i,j)=>{
      const x=((i+offset)/n-.5)*c.Lx/L,y=((j+offset)/n-.5)*c.Ly/L,z=(values[j*n+i]-lo)/(hi-lo)-.5;
      return [W/2+(x*Math.cos(theta)-y*Math.sin(theta))*.77*Math.min(W,H*1.6),H*.58+(x*Math.sin(theta)+y*Math.cos(theta))*.35*H-z*.36*H];
    },tiles=[];
    const samples=Array.from({length:Math.ceil((n-1)/stride)},(_,i)=>i*stride);samples.push(n-1);
    for(let jj=0;jj<samples.length-1;jj++)for(let ii=0;ii<samples.length-1;ii++){const i=samples[ii],j=samples[jj],i1=samples[ii+1],j1=samples[jj+1],corners=[[i,j],[i1,j],[i1,j1],[i,j1]],q=corners.reduce((s,[x,y])=>s+values[y*n+x],0)/4;tiles.push({points:corners.map(([x,y])=>project(x,y)),depth:(i*Math.sin(theta)+j*Math.cos(theta)),q});}
    tiles.sort((a,b)=>a.depth-b.depth);for(const tile of tiles){ctx.beginPath();tile.points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fillStyle=shade((tile.q-lo)/(hi-lo),palette);ctx.fill();ctx.strokeStyle='#00008020';ctx.lineWidth=.3;ctx.stroke();}
    ctx.fillStyle='#59647b';const origin=[52,H-88],axes=[[Math.cos(theta),.45*Math.sin(theta),'x'],[-Math.sin(theta),.45*Math.cos(theta),'y']];ctx.strokeStyle='#59647b';ctx.lineWidth=1;
    for(const [dx,dy,name] of axes){ctx.beginPath();ctx.moveTo(...origin);ctx.lineTo(origin[0]+28*dx,origin[1]+28*dy);ctx.stroke();ctx.fillText(name,origin[0]+35*dx,origin[1]+35*dy);}
    ctx.fillText(`x ∈ [${fmt(-c.Lx/2)}, ${fmt(c.Lx/2)}]; y ∈ [${fmt(-c.Ly/2)}, ${fmt(c.Ly/2)}]`,20,H-38,W-40);
    ctx.fillText('Height: selected expression. Display mesh sampled for rendering.',20,H-20,W-40);return null;
  }else{
    const aspect=c.Lx/c.Ly;if(width/height>aspect){const next=height*aspect;left+=(width-next)/2;width=next;}else{const next=width/aspect;top+=(height-next)/2;height=next;}
    const n=c.N;for(let j=0;j<n;j++)for(let i=0;i<n;i++){ctx.fillStyle=shade((values[j*n+i]-lo)/(hi-lo),palette);ctx.fillRect(left+i*width/n,top+(n-1-j)*height/n,width/n+.4,height/n+.4);}
    if(contours){
      const point=(i,j)=>[left+(i+(c.boundary==='periodic'?0:.5))*width/n,top+height-(j+(c.boundary==='periodic'?0:.5))*height/n];ctx.strokeStyle='#17233c9a';ctx.lineWidth=.8;
      for(let k=1;k<=6;k++){const level=lo+(hi-lo)*k/7;for(let j=0;j<n-1;j++)for(let i=0;i<n-1;i++){
        const q=[[i,j],[i+1,j],[i+1,j+1],[i,j+1]],hits=[];
        for(let edge=0;edge<4;edge++){const a=q[edge],b=q[(edge+1)%4],va=values[a[1]*n+a[0]],vb=values[b[1]*n+b[0]];if((va<level)!==(vb<level)){const f=(level-va)/(vb-va),pa=point(...a),pb=point(...b);hits.push([pa[0]+f*(pb[0]-pa[0]),pa[1]+f*(pb[1]-pa[1])]);}}
        for(let m=0;m+1<hits.length;m+=2){ctx.beginPath();ctx.moveTo(...hits[m]);ctx.lineTo(...hits[m+1]);ctx.stroke();}
      }}
    }
    if(vectors){const step=Math.max(1,Math.ceil(n/12)),maximum=Math.max(...vectors[0].map((v,i)=>Math.hypot(v*width/c.Lx,vectors[1][i]*height/c.Ly)),1e-30),scale=Math.min(width,height)/15/maximum;ctx.strokeStyle='#111d3c';ctx.lineWidth=1.1;
      for(let j=0;j<n;j+=step)for(let i=0;i<n;i+=step){const p=j*n+i,x=left+(i+.5)*width/n,y=top+(n-j-.5)*height/n,dx=vectors[0][p]*width/c.Lx*scale,dy=-vectors[1][p]*height/c.Ly*scale,a=Math.atan2(dy,dx);if(Math.hypot(dx,dy)<.5)continue;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+dx,y+dy);ctx.lineTo(x+dx-4*Math.cos(a-.5),y+dy-4*Math.sin(a-.5));ctx.moveTo(x+dx,y+dy);ctx.lineTo(x+dx-4*Math.cos(a+.5),y+dy-4*Math.sin(a+.5));ctx.stroke();}}
    ctx.strokeStyle='#bcc4df';ctx.strokeRect(left,top,width,height);ctx.fillStyle='#59647b';ctx.fillText(fmt(c.Ly/2),Math.max(3,left-48),top+8);ctx.fillText(fmt(-c.Ly/2),Math.max(3,left-48),top+height);ctx.fillText('y',Math.max(3,left-27),top+height/2);
  }
  ctx.fillStyle='#59647b';ctx.fillText(fmt(-c.Lx/2),left,top+height+22);ctx.fillText(fmt(c.Lx/2),left+width-35,top+height+22);ctx.fillText('x',left+width/2,top+height+40);return rectangle();
}
export function drawAtlas(canvas,plan,metric){
  const {ctx,W,H}=setup(canvas,320);if(!plan||plan.kind!=='sweep'){ctx.fillText('Run a parameter scan to populate this map.',25,45);return null;}
  const nx=plan.options.xCount,ny=plan.options.yParameter?plan.options.yCount:1,left=70,top=28,width=W-95,height=H-86,vals=plan.jobs.map(metric).filter(Number.isFinite),lo=vals.length?Math.min(...vals):0,hi=vals.length?Math.max(...vals):1;
  for(const job of plan.jobs){const {i,j}=job.coordinates,x=left+i*width/nx,y=top+(ny-1-j)*height/ny,v=metric(job),q=hi===lo?.5:(v-lo)/(hi-lo);ctx.fillStyle=job.status==='complete'&&Number.isFinite(v)?shade(q):job.status==='failed'?'#fce7e6':'#edf0f6';ctx.fillRect(x+2,y+2,width/nx-4,height/ny-4);ctx.fillStyle=job.status==='complete'&&Number.isFinite(v)&&q<.25?'#fff':'#18233b';ctx.font='11px Arial';ctx.fillText(job.status==='complete'?fmt(v):job.status,x+7,y+height/ny/2,width/nx-14);}
  ctx.fillStyle='#59647b';for(let i=0;i<nx;i++){const job=plan.jobs.find(j=>j.coordinates.i===i);ctx.fillText(fmt(job.coordinates.x),left+(i+.5)*width/nx-17,top+height+20);}if(ny>1)for(let j=0;j<ny;j++){const job=plan.jobs.find(r=>r.coordinates.j===j);ctx.fillText(fmt(job.coordinates.y),4,top+(ny-j-.5)*height/ny);}
  ctx.fillText(plan.options.xParameter,left+width/2,top+height+40);ctx.fillText(plan.options.yParameter||'One parameter',left,16);return {left,top,width,height,nx,ny};
}
