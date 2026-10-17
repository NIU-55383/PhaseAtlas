"""Generate publication-editable scientific figures from a PhaseAtlas JSON export.

python research/make_figures.py --input experiment.json --output figures
Requires matplotlib in addition to the reference dependencies.
"""
import argparse
import json
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap

def figures(source,output):
    data=json.loads(Path(source).read_text(encoding='utf-8-sig'))
    cfg=data['config'];x=np.array(data['x']);v=np.array(data['reference'])
    times=np.array([f['t'] for f in data['frames']]);w=np.array([f['w'] for f in data['frames']])
    output=Path(output);output.mkdir(parents=True,exist_ok=True)
    plt.rcParams.update({'font.size':10,'axes.spines.top':False,'axes.spines.right':False,'axes.labelcolor':'#000080','text.color':'#17233c','figure.dpi':150,'savefig.bbox':'tight'})
    teal,orange,purple='#0000cd','#c96428','#8275bc'
    def save(fig,name):
        for ext in ['png','svg','pdf']: fig.savefig(output/f'{name}.{ext}')
        plt.close(fig)
    fig,axs=plt.subplots(2,1,figsize=(8,5),sharex=True)
    axs[0].plot(x,v,'--',c='#8894a8',label='Exact reference')
    axs[0].plot(x,v+w[-1],c=teal,label=f"{cfg['mode']}, t={times[-1]:.4g}")
    axs[0].set_ylabel('$u$');axs[0].legend(frameon=False)
    for i,color in zip(np.linspace(0,len(times)-1,4,dtype=int), ['#000080','#0000CD','#8275BC','#C96428']):axs[1].plot(x,w[i],label=f't={times[i]:.4g}',color=color,alpha=.9)
    axs[1].set(xlabel=r'$\xi=x-ct$',ylabel='$w=u-v$');axs[1].legend(frameon=False,ncol=2)
    fig.suptitle(f"{cfg['model']}: N={cfg['N']}, L={cfg['L']}, dt={data['dt']:.3g}")
    save(fig,'01_front_and_perturbation')
    fig,ax=plt.subplots(figsize=(8,4));scaled=w/(cfg['amplitude'] or 1);lim=max(np.max(np.abs(scaled)),1e-12)
    im=ax.pcolormesh(x,times,scaled,shading='auto',cmap=LinearSegmentedColormap.from_list('phaseatlas', ['#0000CD','#FFFFFF','#C96428']),vmin=-lim,vmax=lim,rasterized=True)
    ax.set(xlabel=r'$\xi=x-ct$',ylabel='$t$',title='Space–time perturbation; one fixed color scale')
    fig.colorbar(im,ax=ax,label=r'$w/\varepsilon$');save(fig,'02_spacetime')
    fig,ax=plt.subplots(figsize=(8,4))
    for key,label,color in [('global','Global $L^2$',teal),('local',r'Local $L^2$, $|\xi|\leq5$',orange),('weighted',r'Weighted $L^2$, $e^{-2\xi}$',purple)]:
        arr=np.array([f['diag'][key] for f in data['frames']]);ax.semilogy(times,np.maximum(arr/max(arr[0],1e-30),1e-12),label=label,color=color)
    ax.set(xlabel='$t$',ylabel='Norm / initial norm',title='Finite-interval response; not a stability classification');ax.legend(frameon=False);save(fig,'03_norms')
    k=np.linspace(0,5,501);fig,ax=plt.subplots(figsize=(8,4))
    ax.plot(k,71/4*k*k-k**4,label=r'Unweighted, $u_\pm$',color=orange)
    ax.plot(k,-k**4-13/4*k*k-.75,label=r'$\eta=-2$, $u_-=0$',color=teal)
    ax.plot(k,-k**4-13/4*k*k-159/2,label=r'$\eta=-2$, $u_+=1$',color=purple)
    ax.axhline(0,color='gray',lw=.7);ax.set(xlabel='$k$',ylabel=r'$\mathrm{Re}\,\lambda$',ylim=(-120,100),title='Cubic reference: analytic far-field dispersion (lower tails clipped)');ax.legend(frameon=False);save(fig,'04_reference_dispersion')
    print(f'Created 4 figure groups in PNG, SVG and PDF: {output}')
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--input',required=True);p.add_argument('--output',default='figures');a=p.parse_args();figures(a.input,a.output)
