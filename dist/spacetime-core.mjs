// Display geometry only. The solver's trajectories and diagnostics are never modified.
export function sampleIndices(length, limit) {
  if (!Number.isInteger(length) || length < 1 || !Number.isInteger(limit) || limit < 2) throw Error('Invalid display mesh size.');
  const count = Math.min(length, limit);
  return Array.from({length: count}, (_, i) => count === 1 ? 0 : Math.round(i * (length - 1) / (count - 1)));
}

export function buildSpaceTimeData(config, frames, rows, {mode = 'field', references = null, label = 'u'} = {}) {
  if (config.dimension !== 1) throw Error('Space-time surfaces require a one-dimensional field.');
  const n = config.N;
  if (!Number.isInteger(n) || n < 2 || !Number.isFinite(config.Lx) || config.Lx <= 0) throw Error('Invalid spatial grid.');
  if (!frames?.length || rows?.length !== frames.length) throw Error('Missing saved trajectory.');
  if (!['field', 'change', 'reference'].includes(mode)) throw Error('Unknown surface quantity.');
  if (mode === 'reference' && references?.length !== frames.length) throw Error('No reference formula for this observation.');
  const times = frames.map(f => f.t);
  if (times.some((t, i) => !Number.isFinite(t) || (i && t <= times[i - 1]))) throw Error('Saved times must be finite and strictly increasing.');
  let low = Infinity, high = -Infinity;
  const values = rows.map((row, k) => {
    if (row?.length !== n || (mode === 'reference' && references[k]?.length !== n)) throw Error('Surface grid and saved arrays disagree.');
    return Float64Array.from(row, (v, i) => {
      const value = mode === 'change' ? v - rows[0][i] : mode === 'reference' ? v - references[k][i] : v;
      if (!Number.isFinite(value)) throw Error('Surface contains a non-finite value.');
      low = Math.min(low, value); high = Math.max(high, value); return value;
    });
  });
  let zmin = low, zmax = high;
  if (mode !== 'field') { const extent = Math.max(Math.abs(low), Math.abs(high), 1e-12); zmin = -extent; zmax = extent; }
  else if (low === high) { const pad = Math.max(Math.abs(low) * .05, 1e-12); zmin -= pad; zmax += pad; }
  const offset = config.boundary === 'periodic' ? 0 : .5;
  const x = Array.from({length: n}, (_, i) => -config.Lx / 2 + (i + offset) * config.Lx / n);
  return {x, times, values, low, high, zmin, zmax, xmin: -config.Lx / 2, xmax: config.Lx / 2,
    tmin: times[0], tmax: times.at(-1), mode, label, boundary: config.boundary,
    quantity: mode === 'change' ? `${label}(x,t) − ${label}(x,t₀)` : mode === 'reference' ? `${label} − supplied reference` : label};
}

export function surfaceMesh(data, frame = data.times.length - 1, reveal = false, limits = {x: 113, t: 73}) {
  const end = reveal ? Math.max(0, Math.min(data.times.length - 1, Math.round(frame))) : data.times.length - 1;
  return {columns: sampleIndices(data.x.length, limits.x), rows: sampleIndices(end + 1, limits.t)};
}

export function projectPoint(x, t, z, azimuth = -45, elevation = 28) {
  const a = azimuth * Math.PI / 180, e = elevation * Math.PI / 180;
  const depth = Math.sin(a) * x + Math.cos(a) * t;
  return [Math.cos(a) * x - Math.sin(a) * t, Math.sin(e) * depth - Math.cos(e) * z,
    Math.cos(e) * depth + Math.sin(e) * z];
}
