// Procedural reflection environment: self-contained, no external HDR downloads.
// Generates an environment cubemap for GLB PBR materials using PMREM.
export function createReflectionEnvironment(THREE, scene, renderer, {blurSigma=0.04,intensity=0.65}={}) {
  const studio = new THREE.Scene();
  studio.background = new THREE.Color(0x091321);
  const geometries = [];
  const materials = [];
  function panel(color, intensity, position, scale, rotationY = 0) {
    const geometry = new THREE.PlaneGeometry(1,1);
    const material = new THREE.MeshBasicMaterial({color:new THREE.Color(color).multiplyScalar(intensity),side:THREE.DoubleSide,toneMapped:false});
    const mesh = new THREE.Mesh(geometry,material);
    mesh.position.set(...position); mesh.scale.set(...scale,1);mesh.rotation.y=rotationY;
    studio.add(mesh);geometries.push(geometry);materials.push(material);
  }
  panel(0xcfe9ff,3.0,[0,5,-8],[14,5]);
  panel(0x7cbaff,1.7,[-8,2,1],[5,10],Math.PI/2);
  panel(0xffd8ad,2.3,[8,3,1],[5,9],-Math.PI/2);
  panel(0x86a4cd,0.65,[0,-6,4],[16,3]);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(studio,blurSigma,0.1,30);
  const previous = scene.environment;
  scene.environment = target.texture;
  const previousIntensity = scene.environmentIntensity;
  scene.environmentIntensity = intensity;
  pmrem.dispose();
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  return {dispose(){if(scene.environment===target.texture){scene.environment=previous;scene.environmentIntensity=previousIntensity;}target.dispose();}};
}
