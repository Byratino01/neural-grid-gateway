// Non-destructive real-time material and lighting enhancement for the approved GLB.
// Original mesh geometry, transforms, textures and camera controls remain unchanged.
export function createPhysicalLook(THREE, scene, renderer) {
  const sun = new THREE.DirectionalLight(0xfff1dc, 0.8);
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
  renderer.toneMappingExposure = 0.82;
  // Thousands of GLB meshes can make universal shadow casting prohibitively expensive.
  // Only explicit structural surfaces participate; imported shadow flags remain respected.
  const structuralName = /hull|panel|shell|metal|frame|structure|ring|station|module|deck|walkway/i;
  const effectName = /earth|planet|cloud|atmosphere|halo|glow|emissive|energy|packet|light|glass|hologram/i;
  // Deterministic, tileable fine-scale roughness variation (no external assets).
  // A shared 64x64 map is applied only to UV-mapped, untextured structural metals.
  const n=64, pixels=new Uint8Array(n*n*4);
  for(let y=0;y<n;y++) for(let x=0;x<n;x++) {
    const grain=Math.sin(x*0.71+y*0.13)*Math.sin(y*1.91+x*0.37);
    const rough=Math.round(215+grain*24);
    const i=(y*n+x)*4;
    pixels[i]=rough;pixels[i+1]=rough;pixels[i+2]=rough;pixels[i+3]=255;
  }
  const microRoughness=new THREE.DataTexture(pixels,n,n,THREE.RGBAFormat);
  microRoughness.wrapS=THREE.RepeatWrapping;
  microRoughness.wrapT=THREE.RepeatWrapping;
  microRoughness.repeat.set(3,3);
  microRoughness.magFilter=THREE.LinearFilter;
  microRoughness.minFilter=THREE.LinearMipmapLinearFilter;
  microRoughness.generateMipmaps=true;
  microRoughness.needsUpdate=true;
  const createdMaterials = new Set();
  const overrideCache = new Map();
  // Reuse enhanced clones across meshes sharing one imported material.
  const cloneCache = new Map();
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
    overrideCache.clear();
    cloneCache.clear();
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
        if (!material) return material;
        const overrideMaterial = (configure) => {
          let copy = overrideCache.get(material);
          if (copy) return copy;
          copy = material.clone();
          configure(copy);
          createdMaterials.add(copy);
          overrideCache.set(material, copy);
          return copy;
        };
        // The approved Earth surface includes its own geographic base-color
        // texture. Its neutral 0.4 emissive factor washes out texture shading;
        // attenuate only a reversible clone and keep the embedded map intact.
        if (/geographic_surface/i.test(material.name||'') && material.emissive) {
          return overrideMaterial(copy => copy.emissive.multiplyScalar(0.15));
        }
        // The approved cloud shell has an opaque white-blue factor (alpha=1),
        // which hides the geographic surface. Make only its cloned material a
        // light transparent overlay; geometry and embedded texture stay intact.
        if (/clouds_translucent/i.test(material.name||'')) {
          return overrideMaterial(copy => {
            copy.transparent = true;
            copy.opacity = Math.min(copy.opacity ?? 1,0.18);
            copy.depthWrite = false;
            copy.needsUpdate = true;
          });
        }
        if (/atmospheric_scatter/i.test(material.name||'')) {
          return overrideMaterial(copy => {
            copy.transparent = true;
            copy.opacity = Math.min(copy.opacity ?? 1,0.1);
            copy.depthWrite = false;
            copy.needsUpdate = true;
          });
        }
        // Very high authored emissive strengths turn architectural accents
        // white and broaden the bloom. Cap cloned strengths while retaining
        // their source hue and all animated transforms/pulses.
        if (material.emissive && Number(material.emissiveIntensity) > 1.8) {
          return overrideMaterial(copy => { copy.emissiveIntensity = 1.8; });
        }
        if (material.isShaderMaterial || material.isMeshBasicMaterial ||
            material.transparent || material.alphaTest > 0 ||
            /earth|planet|cloud|atmosphere|light|glow|emissive|blue|red|energy|glass/i.test(object.name+' '+material.name)) return material;
        if (!material.isMeshStandardMaterial && !material.isMeshPhysicalMaterial) return material;
        const isStructure = structuralName.test(object.name+' '+material.name);
        const hasUV=Boolean(object.geometry?.getAttribute('uv'));
        const cacheKey = isStructure ? (hasUV ? 'structural-uv' : 'structural-no-uv') : 'other';
        let copies = cloneCache.get(material);
        if (!copies) { copies = new Map(); cloneCache.set(material, copies); }
        if (copies.has(cacheKey)) return copies.get(cacheKey);
        const copy = material.clone();
        createdMaterials.add(copy);
        // Retain imported PBR maps and explicit metallic/roughness values.
        // Conservative defaults apply only to visibly untextured station hulls.
        if (!copy.metalnessMap && !copy.roughnessMap && !copy.map &&
            /hull|panel|shell|metal|frame|structure|ring|station|module/i.test(object.name+' '+copy.name)) {
          copy.metalness = Math.max(copy.metalness, 0.72);
          copy.roughness = Math.min(Math.max(copy.roughness, 0.24), 0.48);
          if(hasUV && isStructure) copy.roughnessMap=microRoughness;
        }
        copies.set(cacheKey, copy);
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
        !effectName.test(object.name + ' ' + m.name));
      // Preserve artist-authored flags. Add shadow receiving to named structural parts,
      // but never force all 3,076 meshes to cast shadows on every frame.
      if (shadowEligible && structuralName.test(object.name + ' ' + enhanced.map(m=>m?.name||'').join(' '))) {
        originalShadowFlags.set(object, {castShadow:object.castShadow,receiveShadow:object.receiveShadow});
        object.receiveShadow = true;
      }
    });
  }
  function dispose() {
    restore();
    scene.remove(sun);
    sun.dispose();
    microRoughness.dispose();
    renderer.shadowMap.enabled = priorShadowEnabled;
    renderer.shadowMap.type = priorShadowType;
    renderer.toneMappingExposure = priorExposure;
  }
  return { install, dispose };
}
