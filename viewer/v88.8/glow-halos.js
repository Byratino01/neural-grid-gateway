// Lightweight additive glow halos. No post-processing dependencies.
// Camera-facing sprites preserve Explore Mode and work on mobile GPUs.
export function createGlowHalos(THREE, scene) {
  const canvas=document.createElement('canvas');
  canvas.width=128;canvas.height=128;
  const ctx=canvas.getContext('2d');
  if(!ctx) return {update(){},dispose(){}};
  const g=ctx.createRadialGradient(64,64,2,64,64,63);
  g.addColorStop(0,'rgba(145,225,255,0.7)');
  g.addColorStop(0.18,'rgba(55,170,255,0.32)');
  g.addColorStop(0.5,'rgba(18,105,255,0.10)');
  g.addColorStop(1,'rgba(5,65,210,0)');
  ctx.fillStyle=g;ctx.fillRect(0,0,128,128);
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  const group=new THREE.Group();
  group.name='V88_CAMERA_FACING_GLOW_HALOS';
  scene.add(group);
  const nodes=[[0,1.2,0,7],[-8.3,1,-8,3.1],[8.3,1,-8,3.1],[-12.5,1,0,3.1],[12.5,1,0,3.1],[-8.3,1,8,3.1],[8.3,1,8,3.1]];
  const sprites=nodes.map(([x,y,z,size],i)=>{
    const material=new THREE.SpriteMaterial({map:texture,color:0x78caff,transparent:true,opacity:0.35,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});
    const sprite=new THREE.Sprite(material);
    sprite.position.set(x,y,z);
    sprite.scale.set(size,size,1);
    group.add(sprite);
    return {sprite,material,phase:i*0.83};
  });
  let elapsed=0;
  return {
    update(dt){
      elapsed+=Math.min(Math.max(dt,0),0.05);
      for(const {material,phase} of sprites)
        material.opacity=0.22+0.15*(1+Math.sin(elapsed*1.6+phase))/2;
    },
    dispose(){
      scene.remove(group);
      for(const {material} of sprites)material.dispose();
      texture.dispose();
    }
  };
}
