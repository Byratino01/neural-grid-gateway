// Optional cinematic bloom. Keeps OrbitControls and scene objects unchanged.
// Bloom is limited to desktop-class GPUs; mobile retains lightweight glow sprites.
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { Vector2 } from 'three';

export function createCinematicBloom(renderer, scene, camera) {
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  const lowMemory = Number(navigator.deviceMemory || 8) <= 4;
  const enabled = !mobile && !lowMemory && !reducedMotion && renderer.capabilities.isWebGL2;
  if (!enabled) return {enabled:false,render:()=>renderer.render(scene,camera),resize(){},dispose(){}};
  let composer, bloom;
  try {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene,camera));
    const size = renderer.getDrawingBufferSize(new Vector2());
    bloom = new UnrealBloomPass(size,0.42,0.55,0.88);
    composer.addPass(bloom);
    return {
      enabled:true,
      render(){composer.render();},
      resize(width,height){composer.setSize(width,height);},
      dispose(){composer.dispose();bloom.dispose();}
    };
  } catch (error) {
    console.warn('Cinematic bloom unavailable; using standard renderer',error);
    try { composer?.dispose(); } catch {}
    return {enabled:false,render:()=>renderer.render(scene,camera),resize(){},dispose(){}};
  }
}
