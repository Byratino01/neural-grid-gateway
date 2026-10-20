// Non-destructive real-time material and lighting enhancement for the approved GLB.
// Original mesh geometry, transforms, textures and camera controls remain unchanged.
export function createPhysicalLook(THREE, scene, renderer) {
  const sun = new THREE.DirectionalLight(0xfff1dc, 1.8);
  sun.position.set(24, 38, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -32; sun.shadow.camera.right = 32;
  sun.shadow.camera.top = 32; sun.shadow.camera.bottom = -32;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 120;
  sun.shadow.bias = -0.0002;
  sun.shadow.normalBias = 0.025;
  sun.shadow.radius = 2;
  scene.add(sun);
  const priorShadowEnabled = renderer.shadowMap.enabled;
  const priorShadowType = renderer.shadowMap.type;
  const priorExposure = renderer.toneMappingExposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMappingExposure = 1.0;
  const createdMaterials = new Set();
  let active = null;
  const originals = new Map();
  const originalShadowFlags = new Map();
  function restore() {
    for (const [mesh, material] of originals) mesh.material = material;
    originals.clear();
    for (const [mesh, flags] of originalShadowFlags) {
      mesh.castShadow = flags.castShadow;
      mesh.receiveShadow = flags.receiveShadow;
    }
    originalShadowFlags.clear();
    for (const material of createdMaterials) material.dispose();
    createdMaterials.clear();
    active = null;
  }
  function install(root) {
    // Keep GLB textures and named emissive/transparent materials intact.
    restore();
    active = root;
    root.traverse(object => {
      if (!object.isMesh || !object.material) return;
      const original = Array.isArray(object.material) ? object.material : [object.material];
      const enhanced = original.map(material => {
        if (!material || material.isShaderMaterial || material.isMeshBasicMaterial ||
            material.transparent || material.alphaTest > 0 ||
            /earth|planet|cloud|atmosphere|light|glow|emissive|blue|red|energy|glass/i.test(object.name+' '+material.name)) return material;
        if (!material.isMeshStandardMaterial && !material.isMeshPhysicalMaterial) return material;
        const copy = material.clone();
        createdMaterials.add(copy);
        // Retain imported PBR maps and explicit metallic/roughness values.
        // Conservative defaults apply only to visibly untextured station hulls.
        if (!copy.metalnessMap && !copy.roughnessMap && !copy.map &&
            /hull|panel|shell|metal|frame|structure|ring|station|module/i.test(object.name+' '+copy.name)) {
          copy.metalness = Math.max(copy.metalness, 0.72);
          copy.roughness = Math.min(Math.max(copy.roughness, 0.24), 0.48);
        }
        return copy;
      });
      const next = Array.isArray(object.material) ? enhanced : enhanced[0];
      if (enhanced.some((m,i)=>m!==original[i])) {
        originals.set(object, object.material);
        object.material = next;
      }
      // Keep transparent, emissive, cloud and effect surfaces out of the shadow pass.
      const shadowEligible = enhanced.some(m => m && !m.transparent && m.opacity === 1 &&
        !m.alphaTest && !m.isMeshBasicMaterial &&
        !/earth|planet|cloud|atmosphere|halo|glow|emissive|energy|packet|light|glass/i.test(object.name + ' ' + m.name));
      if (shadowEligible) {
        originalShadowFlags.set(object, {castShadow:object.castShadow,receiveShadow:object.receiveShadow});
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
  }
  function dispose() {
    restore();
    scene.remove(sun);
    sun.dispose();
    renderer.shadowMap.enabled = priorShadowEnabled;
    renderer.shadowMap.type = priorShadowType;
    renderer.toneMappingExposure = priorExposure;
  }
  return { install, dispose };
}
