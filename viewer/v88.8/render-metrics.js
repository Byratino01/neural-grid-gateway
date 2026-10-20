// Renderer counters are cumulative only while WebGLRenderer.info.autoReset is
// disabled. Keep the snapshots numeric and detached from Three.js internals.
const COUNTERS = ['calls', 'triangles', 'points', 'lines'];
export const CINEMATIC_BLOOM = Object.freeze({strength:0.05,radius:0.25,threshold:1.3});

export function readRenderCounters(info) {
  const render = info?.render || {};
  return Object.fromEntries(COUNTERS.map(key => [key, Number(render[key]) || 0]));
}

export function subtractRenderCounters(total, scene) {
  return Object.fromEntries(COUNTERS.map(key => [
    key,
    Math.max(0, (Number(total?.[key]) || 0) - (Number(scene?.[key]) || 0))
  ]));
}

export function snapshotRenderResources(info, pixelRatio = 1) {
  return {
    geometries: Number(info?.memory?.geometries) || 0,
    textures: Number(info?.memory?.textures) || 0,
    pixelRatio: Number(pixelRatio) || 1
  };
}
