// Optional Earth rotation: activates only for a uniquely named, unanimated Earth object.
// Never guesses which mesh is Earth or modifies the approved station geometry.
export function createEarthMotion(THREE) {
  let earth = null;
  const axis = new THREE.Vector3(0, 1, 0);
  function install(root, clips = []) {
    earth = null;
    if (!root) return {found:false,reason:'No model'};
    const matches = [];
    root.traverse(o => {
      if (/^(earth|earth_mesh|planet_earth|earth_globe)$/i.test(o.name.trim())) matches.push(o);
    });
    if (matches.length !== 1) return {found:false,reason:matches.length ? 'Ambiguous Earth nodes' : 'Earth node not explicitly named'};
    const target = matches[0];
    // Avoid double rotation when the GLB already animates the Earth.
    const hasRotationTrack = clips.some(c => c.tracks.some(t =>
      (t.name.startsWith(target.name + '.') || t.name.startsWith(target.uuid + '.')) && /\.(quaternion|rotation)$/.test(t.name)));
    if (hasRotationTrack) return {found:true,embeddedAnimation:true};
    earth = target;
    return {found:true,embeddedAnimation:false,node:target.name};
  }
  function update(dt) {
    if (!earth) return;
    // A slow presentation spin, not a claim of orbital or astronomical accuracy.
    earth.rotateOnAxis(axis, Math.min(Math.max(dt,0),0.05) * 0.015);
  }
  function reset() { earth = null; }
  return {install,update,reset};
}
