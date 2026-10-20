// Conservative, camera-independent VFX for the approved V88.8 scene.
// Does not move imported station geometry or alter Explore Mode.
export function createOrbitalVfx(THREE, scene) {
  const group = new THREE.Group();
  group.name = 'V88_REALTIME_LIGHTING_VFX';
  scene.add(group);
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: 0x42bbff, transparent: true, opacity: 0.25,
    depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending
  });
  const hub = new THREE.Mesh(new THREE.TorusGeometry(2.05, 0.055, 8, 96), glowMaterial);
  hub.rotation.x = -Math.PI / 2;
  hub.position.set(0, 0.55, 0);
  group.add(hub);
  const hubLight = new THREE.PointLight(0x47baff, 2.2, 9, 2);
  hubLight.position.set(0, 1.5, 0);
  group.add(hubLight);
  const stationLights = [];
  const locations = [[-8.3,8],[8.3,8],[-12.5,0],[12.5,0],[-8.3,-8],[8.3,-8]];
  for (let i = 0; i < locations.length; i++) {
    const [x,y] = locations[i];
    const material = glowMaterial.clone();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.8,0.035,6,48),material);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x,0.6,-y);
    group.add(ring);
    stationLights.push({material,phase:i*Math.PI/3});
  }
  let elapsed = 0;
  function update(dt) {
    elapsed += Math.min(Math.max(dt,0),0.05);
    const pulse = Math.sin(elapsed*1.7);
    glowMaterial.opacity = 0.18 + 0.12*(pulse+1)/2;
    hubLight.intensity = 1.5 + 0.7*(pulse+1)/2;
    for (const {material,phase} of stationLights) {
      material.opacity = 0.12 + 0.23*(1+Math.sin(elapsed*1.9+phase))/2;
    }
  }
  function dispose() {
    scene.remove(group);
    group.traverse(o => {o.geometry?.dispose();o.material?.dispose?.()});
  }
  return {update,dispose};
}
