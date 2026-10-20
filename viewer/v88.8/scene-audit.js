// Read-only GLB inventory for the approved Orbital Nexus asset.
// Reports counts and names only: no geometry, textures or transforms are modified.
export function auditOrbitalScene(root, clips = []) {
  const result={nodes:0,meshes:0,triangles:0,materials:0,texturedMaterials:0,
    pbrMaterials:0,normalMaps:0,roughnessMaps:0,metalnessMaps:0,emissiveMaterials:0,
    transparentMaterials:0,skinnedMeshes:0,earthCandidates:[],animationClips:clips.length,
    animationTracks:clips.reduce((n,c)=>n+(c.tracks?.length||0),0),warnings:[]};
  if (!root) {result.warnings.push('No GLB root loaded');return result;}
  const materials=new Set();
  root.traverse(node=>{
    result.nodes++;
    if (/earth|planet|globe|sphere/i.test(node.name||'')) {
      result.earthCandidates.push({name:node.name||'(unnamed)',type:node.type,uuid:node.uuid});
    }
    if (!node.isMesh) return;
    result.meshes++;
    if(node.isSkinnedMesh) result.skinnedMeshes++;
    const geo=node.geometry;
    if(geo?.index) result.triangles+=Math.floor(geo.index.count/3);
    else if(geo?.attributes?.position) result.triangles+=Math.floor(geo.attributes.position.count/3);
    for(const m of (Array.isArray(node.material)?node.material:[node.material])){
      if(m)materials.add(m);
    }
  });
  result.materials=materials.size;
  for(const m of materials){
    if(m.isMeshStandardMaterial||m.isMeshPhysicalMaterial)result.pbrMaterials++;
    if(m.map||m.normalMap||m.roughnessMap||m.metalnessMap)result.texturedMaterials++;
    if(m.normalMap)result.normalMaps++;
    if(m.roughnessMap)result.roughnessMaps++;
    if(m.metalnessMap)result.metalnessMaps++;
    if(m.emissiveMap||m.emissiveIntensity>0&&m.emissive?.getHex?.()!==0)result.emissiveMaterials++;
    if(m.transparent)result.transparentMaterials++;
  }
  if(!result.normalMaps)result.warnings.push('No normal maps detected: close-up surface detail may be limited');
  if(!result.earthCandidates.length)result.warnings.push('No Earth candidate identified by node name');
  return result;
}
