"""Regenerate publication figures from executed cases, never illustrative data."""
from pathlib import Path
import json
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.ticker import NullLocator
root=Path(__file__).resolve().parents[1];data=root/'dist/data/submission-2026';out=root/'dist/submission-2026/figures';out.mkdir(parents=True,exist_ok=True)
load=lambda n:json.loads((data/(n+'.json')).read_text())
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':10,'axes.spines.top':False,'axes.spines.right':False,'axes.labelcolor':'#193451','text.color':'#193451','axes.titleweight':'bold','figure.facecolor':'white','savefig.facecolor':'white'})
blue='#0000cd';orange='#d16622';gray='#617086'
def save(fig,name):
    fig.savefig(out/(name+'.png'),dpi=190,bbox_inches='tight');fig.savefig(out/(name+'.svg'),bbox_inches='tight');plt.close(fig)
s=load('summary');r=load('cooling');x=np.linspace(-1+1/r['config']['N'],1-1/r['config']['N'],r['config']['N']);ts=np.array([f['t'] for f in r['frames']]);u=np.array([f['values'][0] for f in r['frames']])
fig,ax=plt.subplots(1,2,figsize=(10,3.2),layout='constrained')
for i in [0,40,80,120]:ax[0].plot(x,u[i],label=f't = {ts[i]:.1f}',lw=1.8)
ax[0].axhline(.2,color=gray,ls='--',label='Ambient');ax[0].set(xlabel='Position x',ylabel='Dimensionless temperature u',title='A. Cooling through the boundaries',ylim=(.15,1.05));ax[0].legend(ncol=2,fontsize=8)
ax[1].plot(ts,u.mean(axis=1),color=blue,lw=2);ax[1].set(xlabel='Time t',ylabel='Mean temperature',title='B. A measurable cooling response');ax[1].grid(alpha=.15)
save(fig,'cooling')
fig,ax=plt.subplots(1,2,figsize=(10,3.2),layout='constrained');N=np.array(s['robin']['N']);err=np.array(s['robin']['errors']);ax[0].loglog(N,err,'o-',color=blue,label='Exact-mode RMS error');ax[0].loglog(N,err[0]*(N[0]/N)**2,'--',color=gray,label='Second-order guide');ax[0].set(xlabel='Cells N',ylabel='Final RMS error',title='A. Robin boundary verification',xticks=N);ax[0].set_xticklabels(N);ax[0].xaxis.set_minor_locator(NullLocator());ax[0].legend(fontsize=8);ax[0].grid(alpha=.15)
b=s['cooling']['balance'];t=[q['t'] for q in b['rows']];ax[1].plot(t,[q['massChange'] for q in b['rows']],color=blue,lw=2,label='Measured content change');ax[1].plot(t,[q['integratedInput'] for q in b['rows']],color=orange,ls='--',label='Integrated boundary + bulk input');ax[1].set(xlabel='Time t',ylabel='Change in integral of u',title='B. Independent balance diagnostic');ax[1].legend(fontsize=8);ax[1].grid(alpha=.15)
save(fig,'verification')
fig,ax=plt.subplots(figsize=(7.5,3.7),layout='constrained');z=np.array([q['mean'] for q in s['scan']]).reshape(4,4);im=ax.imshow(z,cmap='Blues',origin='lower',aspect='auto',vmin=.2,vmax=1);ax.set(xticks=range(4),xticklabels=[.5,1,2,4],yticks=range(4),yticklabels=[.05,.1,.2,.4],xlabel='Boundary exchange coefficient Bi',ylabel='Diffusivity nu',title='Mean temperature at t = 3');
for j in range(4):
 for i in range(4):ax.text(i,j,f'{z[j,i]:.3f}',ha='center',va='center',color='white' if z[j,i]>.68 else '#193451')
fig.colorbar(im,ax=ax,label='Dimensionless temperature');save(fig,'parameter-map')
f=load('fourth-order-front');xx=np.array(f['x']);tt=np.array([a['t'] for a in f['frames']]);ww=np.array([a['w'] for a in f['frames']]);mask=np.abs(xx)<=12
fig,ax=plt.subplots(1,2,figsize=(10,3.4),layout='constrained');vmax=np.max(np.abs(ww[:,mask]/.001));im=ax[0].imshow(ww[:,mask]/.001,extent=[xx[mask][0],xx[mask][-1],tt[-1],0],aspect='auto',cmap='RdBu_r',vmin=-vmax,vmax=vmax);ax[0].set(xlabel='Moving coordinate xi',ylabel='Time t',title='A. Fourth-order disturbance / initial amplitude');fig.colorbar(im,ax=ax[0],fraction=.045)
for key,label,c in [('global','Global L2',blue),('local','Local L2',orange),('weighted','Weighted L2',gray)]:
 vals=np.array([a['diag'][key] for a in f['frames']]);ax[1].semilogy(tt,vals/vals[0],label=label,color=c,lw=1.8)
ax[1].set(xlabel='Time t',ylabel='Norm / initial norm',title='B. Different questions, different norms');ax[1].legend(fontsize=8);ax[1].grid(alpha=.15);save(fig,'wave')
print(json.dumps({'figures':4,'scanRange':[float(z.min()),float(z.max())],'balanceMax':b['maximumAbsoluteDefect']},indent=2))
