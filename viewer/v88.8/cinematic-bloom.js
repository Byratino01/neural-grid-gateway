// Optional cinematic bloom. Keeps OrbitControls and scene objects unchanged.
// Bloom is limited to desktop-class GPUs; mobile retains lightweight glow sprites.
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Vector2 } from 'three';
import { CINEMATIC_BLOOM, readRenderCounters, snapshotRenderResources, subtractRenderCounters } from './render-metrics.js';
import {createGpuTimer} from './gpu-timer.js';

class SceneMetricsRenderPass extends RenderPass {
  constructor(scene, camera) {
    super(scene, camera);
    this.sceneCounters = {calls:0,triangles:0,points:0,lines:0};
  }

  render(renderer, ...args) {
    super.render(renderer, ...args);
    this.sceneCounters = readRenderCounters(renderer.info);
  }
}

export function createCinematicBloom(renderer, scene, camera) {
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  const lowMemory = Number(navigator.deviceMemory || 8) <= 4;
  const enabled = !mobile && !lowMemory && !reducedMotion && renderer.capabilities.isWebGL2;
  const priorAutoReset = renderer.info.autoReset;
  renderer.info.autoReset = false;
  const diagnosticsEnabled=new URLSearchParams(window.location.search).get('renderStats')==='1';
  const gpuTimer=diagnosticsEnabled?createGpuTimer(renderer):{supported:false,begin(){},end(){},poll(){return null;},dispose(){}};
  let composer, bloom, scenePass;
  let bloomEnabled = enabled;
  let lastStats = null;
  function render() {
    renderer.info.reset();
    const started = performance.now();
    const gpuMs=gpuTimer.poll();
    gpuTimer.begin();
    try {
      if (composer && bloomEnabled) composer.render();
      else renderer.render(scene,camera);
    } finally {gpuTimer.end();}
    const total = readRenderCounters(renderer.info);
    const sceneCounters = composer && bloomEnabled ? scenePass.sceneCounters : total;
    lastStats = {
      scene: sceneCounters,
      post: subtractRenderCounters(total, sceneCounters),
      total,
      resources: snapshotRenderResources(renderer.info, renderer.getPixelRatio()),
      renderCpuMs: performance.now() - started,
      gpuMs,
      gpuTimingSupported:gpuTimer.supported
    };
  }
  if (!enabled) return {
    enabled:false,setEnabled(){},isEnabled:()=>false,render,getStats:()=>lastStats,resize(){},
    dispose(){gpuTimer.dispose();renderer.info.autoReset=priorAutoReset;}
  };
  try {
    composer = new EffectComposer(renderer);
    scenePass = new SceneMetricsRenderPass(scene,camera);
    composer.addPass(scenePass);
    // Pass sizes are scaled by EffectComposer's pixel ratio. Supply CSS size,
    // not drawing-buffer size, to avoid applying a high-DPI ratio twice.
    const size = renderer.getSize(new Vector2());
    bloom = new UnrealBloomPass(size,CINEMATIC_BLOOM.strength,CINEMATIC_BLOOM.radius,CINEMATIC_BLOOM.threshold);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    return {
      enabled:true,
      setEnabled(value){bloomEnabled=Boolean(value);},
      isEnabled(){return bloomEnabled;},
      render,getStats:()=>lastStats,
      resize(width,height){composer.setSize(width,height);},
      dispose(){composer.dispose();bloom.dispose();gpuTimer.dispose();renderer.info.autoReset=priorAutoReset;}
    };
  } catch (error) {
    console.warn('Cinematic bloom unavailable; using standard renderer',error);
    try { composer?.dispose(); } catch {}
    composer = null;
    return {enabled:false,setEnabled(){},isEnabled:()=>false,render,getStats:()=>lastStats,resize(){},dispose(){gpuTimer.dispose();renderer.info.autoReset=priorAutoReset;}};
  }
}
