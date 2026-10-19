import {simulate, compareResults} from './studio-solver.js';
const yieldTask = () => new Promise(resolve => setTimeout(resolve, 0));
self.onmessage = async ({data}) => {
  try {
    if (data.action === 'run') {
      const result = await simulate(data.config, value => self.postMessage({type: 'progress', value}), yieldTask);
      self.postMessage({type: 'result', result});
    } else if (data.action === 'refine') {
      const base = data.result;
      const temporal = await simulate({...base.config, dt: base.dt / 2, frames: 2}, value => self.postMessage({type: 'progress', value: value / 2, label: 'Time-step refinement'}), yieldTask);
      const spatial = await simulate({...base.config, N: base.config.N * 2, dt: base.dt / 2, frames: 2}, value => self.postMessage({type: 'progress', value: .5 + value / 2, label: 'Spatial refinement'}), yieldTask);
      self.postMessage({type: 'refinement', result: {createdAt: new Date().toISOString(), solverVersion: base.solverVersion, baseN: base.config.N, baseDt: base.dt, refinedN: spatial.config.N, refinedDt: temporal.dt, temporal: compareResults(base, temporal), spatial: compareResults(temporal, spatial), note: 'Final-time field differences. The spatial comparison holds the halved time step fixed. '+(base.config.boundary==='periodic'?'Coincident periodic grid points are compared. ':'Fine cell-center values are linearly interpolated onto coarse centers; interpolation also contributes to the difference. ')}});
    } else throw Error('Unknown computation request.');
  } catch (error) { self.postMessage({type: 'error', message: error.message}); }
};
