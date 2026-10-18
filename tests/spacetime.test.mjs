import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSpaceTimeData,surfaceMesh,sampleIndices,projectPoint} from '../dist/spacetime-core.mjs';

const c={dimension:1,N:4,Lx:8,boundary:'periodic'};
const frames=[{t:0},{t:.03},{t:.9}],rows=[[1,2,3,4],[2,4,6,8],[0,-2,1,7]];
test('Surface coordinates match periodic nodes and bounded cell centers, using actual saved times',()=>{
  const p=buildSpaceTimeData(c,frames,rows);
  assert.deepEqual(p.x,[-4,-2,0,2]);assert.deepEqual(p.times,[0,.03,.9]);
  for(const boundary of ['nonperiodic','fourth-order'])assert.deepEqual(buildSpaceTimeData({...c,boundary},frames,rows).x,[-3,-1,1,3]);
});
test('Difference views preserve signed values and fix scales across all frames',()=>{
  const copy=structuredClone(rows),d=buildSpaceTimeData(c,frames,rows,{mode:'change'});
  assert.deepEqual(Array.from(d.values[0]),[0,0,0,0]);assert.deepEqual(Array.from(d.values[2]),[-1,-4,-2,3]);assert.equal(d.zmin,-4);assert.equal(d.zmax,4);assert.deepEqual(rows,copy);
  const e=buildSpaceTimeData(c,frames,rows,{mode:'reference',references:rows.map(()=>[2,2,2,2])});assert.equal(e.values[2][1],-4);assert.equal(e.zmax,6);
});
test('Display decimation retains endpoints and current reveal frame without concealing full-data extrema in scale',()=>{
  const n=1024,m=121,values=Array.from({length:m},()=>Array(n).fill(0));values[50][500]=91;
  const d=buildSpaceTimeData({...c,N:n},Array.from({length:m},(_,i)=>({t:i*.1})),values),full=surfaceMesh(d),partial=surfaceMesh(d,100,true);
  assert.equal(d.high,91);assert.equal(full.columns.length,113);assert.equal(full.rows.length,73);assert.equal(full.columns.at(-1),1023);assert.equal(full.rows.at(-1),120);assert.equal(partial.rows.at(-1),100);
  assert.deepEqual(surfaceMesh(d,0,true).rows,[0]);assert.deepEqual(sampleIndices(2,73),[0,1]);
});
test('Zero and constant solutions have finite nondegenerate plotting ranges',()=>{
  for(const value of [0,1,-4,1e-15]){const d=buildSpaceTimeData(c,frames,rows.map(()=>Array(4).fill(value)));assert.ok(d.zmin<value&&d.zmax>value);}
});
test('Incorrect dimensions, missing references, invalid times and non-finite samples are rejected',()=>{
  assert.throws(()=>buildSpaceTimeData({...c,dimension:2},frames,rows),/one-dimensional/);
  assert.throws(()=>buildSpaceTimeData(c,frames,rows,{mode:'reference'}),/reference/);
  assert.throws(()=>buildSpaceTimeData(c,[{t:0},{t:0},{t:1}],rows),/increasing/);
  assert.throws(()=>buildSpaceTimeData(c,frames,[rows[0],[0,NaN,0,0],rows[2]]),/non-finite/);
});
test('Projection preserves orthogonal world directions in screen/depth coordinates',()=>{
  for(const angle of [-180,-45,0,95,180]){const p=projectPoint(.4,-.7,.2,angle,28);assert.ok(Math.abs(p.reduce((s,v)=>s+v*v,0)-.69)<1e-12);assert.ok(p.every(Number.isFinite));}
});
