"""Compact scientific figures made exclusively from saved solver arrays."""
from pathlib import Path
import json
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'dist/data/submission-2026'
OUT = ROOT / 'dist/submission-2026/figures'
OUT.mkdir(parents=True, exist_ok=True)
load = lambda name: json.loads((DATA / (name + '.json')).read_text(encoding='utf-8'))
cool = load('cooling')
values = np.array([f['values'][0] for f in cool['frames']])
times = np.array([f['t'] for f in cool['frames']])
x = -1 + (np.arange(cool['config']['N']) + .5) * 2 / cool['config']['N']
blue, ink, orange = '#0000cd', '#18354b', '#cc692e'
cmap = LinearSegmentedColormap.from_list('atlas', ['#000080','#3456cb','#c6daf6','#f5f8fc','#e6ae70','#bf5428'])
plt.rcParams.update({'font.family':'Arial','font.size':8.5,'axes.labelcolor':ink,'text.color':ink,
    'xtick.color':'#63748e','ytick.color':'#63748e','axes.spines.top':False,'axes.spines.right':False,
    'axes.edgecolor':'#a9b8c9','axes.linewidth':.55,'figure.facecolor':'white','savefig.facecolor':'white',
    'xtick.major.size':2.5,'ytick.major.size':2.5,'grid.alpha':.15})

def save(fig, name):
    fig.savefig(OUT/(name+'.png'), dpi=320, bbox_inches='tight', pad_inches=.025)
    fig.savefig(OUT/(name+'.svg'), bbox_inches='tight', pad_inches=.025)
    plt.close(fig)

fig=plt.figure(figsize=(5.2,2.9));ax=fig.add_subplot(111,projection='3d')
X,T=np.meshgrid(x,times)
ax.plot_surface(X,T,values,cmap=cmap,vmin=values.min(),vmax=values.max(),rstride=2,cstride=2,
    linewidth=.12,edgecolor='#ffffff35',antialiased=True,shade=True)
ax.plot(x,np.full(len(x),times[-1]),values[-1],color='#091e64',lw=1.1,zorder=20)
ax.set(xlabel='Position x',ylabel='Time t',zlabel='Temperature u',xlim=(-1,1),ylim=(0,3),zlim=(.4,1.03))
ax.view_init(elev=25,azim=-55);ax.set_box_aspect((1.65,1.4,.8))
ax.set_xticks([-1,0,1]);ax.set_yticks([0,1.5,3]);ax.set_zticks([.5,.75,1])
for axis in [ax.xaxis,ax.yaxis,ax.zaxis]:
    axis.pane.set_facecolor('#f4f7fc');axis.pane.set_edgecolor('#e4eaf3')
    axis._axinfo['grid']['color']=(.65,.72,.82,.26)
ax.tick_params(pad=0,labelsize=8);fig.subplots_adjust(left=0,right=1,bottom=.03,top=1)
save(fig,'surface')

fig,ax=plt.subplots(figsize=(3.35,2.65),layout='constrained')
image=ax.pcolormesh(x,times,values,shading='auto',cmap=cmap,vmin=values.min(),vmax=values.max(),rasterized=True)
ax.set(xlabel='Position x',ylabel='Time t',xticks=[-1,0,1],yticks=[0,1,2,3])
bar=fig.colorbar(image,ax=ax,pad=.035,fraction=.04);bar.set_label('u',rotation=0,labelpad=7)
save(fig,'heatmap')

summary=load('summary');z=np.array([q['mean'] for q in summary['scan']]).reshape(4,4)
fig,ax=plt.subplots(figsize=(2.9,1.95),layout='constrained')
ax.imshow(z,origin='lower',cmap='Blues',vmin=.2,vmax=1,aspect='auto')
ax.set(xticks=range(4),xticklabels=[.5,1,2,4],yticks=range(4),yticklabels=[.05,.1,.2,.4],xlabel='Boundary exchange Bi',ylabel='Diffusivity')
for j in range(4):
    for i in range(4):ax.text(i,j,f'{z[j,i]:.2f}',ha='center',va='center',fontsize=8,color='white' if z[j,i]>.68 else ink)
save(fig,'scan-compact')

fig,ax=plt.subplots(figsize=(2.9,1.95),layout='constrained')
for idx,color in zip([0,40,80,120],['#becce0','#627fc5',blue,orange]):
    ax.plot(x,values[idx],lw=1.25,label=f't={times[idx]:g}',color=color)
ax.set(xlabel='Position x',ylabel='Temperature u',xlim=(-1,1),ylim=(.4,1.03),xticks=[-1,0,1],yticks=[.5,.75,1])
ax.legend(ncol=2,loc='lower center',fontsize=6.8,frameon=False,columnspacing=.7,handlelength=1.3)
ax.grid();save(fig,'profiles-compact')

fig,ax=plt.subplots(figsize=(2.9,1.95),layout='constrained')
ax.plot(times,values.mean(axis=1),lw=1.5,color=blue,label='Spatial mean')
ax.plot(times,values[:,len(x)//2],lw=1.1,color=orange,label='Central probe')
ax.set(xlabel='Time t',ylabel='Temperature',xlim=(0,3),ylim=(.7,1.015),xticks=[0,1.5,3],yticks=[.75,.875,1])
ax.legend(fontsize=6.8,frameon=False,loc='lower left',handlelength=1.4)
ax.grid();save(fig,'observables-compact')
print(json.dumps({'source':'cooling.json','frames':len(times),'cells':len(x),'figures':5,'finalMean':float(values[-1].mean())}))
