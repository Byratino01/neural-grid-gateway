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
  constructor(scene, camera, diagnosticsEnabled) {
    super(scene, camera);
    this.sceneCounters = {calls:0,triangles:0,points:0,lines:0};
    this.diagnosticsEnabled=diagnosticsEnabled;
    this.modelRoot=null;
    this.doubleSidedTransparentMaterials=new WeakSet();
    this.lastBreakdownAt=0;
    this.drawBreakdown=null;
  }

  render(renderer, ...args) {
    const original=renderer.renderBufferDirect,originalRender=renderer.render;
    const now=performance.now(),captureBreakdown=this.diagnosticsEnabled&&now-this.lastBreakdownAt>=1500;
    const breakdown={model:0,viewer:0,shadow:0,transmission:0,transparentDoubleSide:0,mainCamera:0,otherCamera:0};
    const objectCalls=captureBreakdown?new Map():null,modelRoot=this.modelRoot,thisCamera=this.camera,thisMaterialSet=this.doubleSidedTransparentMaterials;
    let primaryTarget;
    if(captureBreakdown){
      renderer.render=function(...renderArgs){primaryTarget=this.getRenderTarget();return originalRender.apply(this,renderArgs);};
      renderer.renderBufferDirect=function(camera,scene,geometry,material,object,group){
        const target=this.getRenderTarget();
        const category=scene===null?'shadow':isUnderRoot(object,modelRoot)?'model':'viewer';
        breakdown[category]++;
        if(scene!==null&&target!==primaryTarget)breakdown.transmission++;
        breakdown[camera===thisCamera?'mainCamera':'otherCamera']++;
        if(thisMaterialSet.has(material)&&material.side!==2)breakdown.transparentDoubleSide++;
        if(objectCalls&&object?.uuid)objectCalls.set(object.uuid,(objectCalls.get(object.uuid)||0)+1);
        return original.call(this,camera,scene,geometry,material,object,group);
      };
    }
    try { super.render(renderer, ...args); }
    finally { if(captureBreakdown){renderer.renderBufferDirect=original;renderer.render=originalRender;} }
    this.sceneCounters = readRenderCounters(renderer.info);
    if(captureBreakdown){
      const drawnObjects=objectCalls.size,repeatObjects=[...objectCalls.values()].filter(count=>count>1).length;
      this.drawBreakdown={...breakdown,drawnObjects,repeatObjects,maxDrawsPerObject:Math.max(0,...objectCalls.values())};
      this.lastBreakdownAt=now;
    }
  }

  setModelRoot(root){
    this.modelRoot=root;
    this.doubleSidedTransparentMaterials=new WeakSet();
    root?.traverse(object=>{
      for(const material of (Array.isArray(object.material)?object.material:[object.material]))
        if(material?.transparent&&material.side===2)this.doubleSidedTransparentMaterials.add(material);
    });
  }
}

function isUnderRoot(object,root){for(let node=object;node;node=node.parent)if(node===root)return true;return false;}

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
      drawBreakdown:composer&&bloomEnabled?scenePass.drawBreakdown:null,
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
    setModelRoot(){},setPixelRatio(value){const ratio=Number(value);if(!Number.isFinite(ratio)||ratio<=0)throw new RangeError('Pixel ratio must be positive.');renderer.setPixelRatio(ratio);},
    dispose(){gpuTimer.dispose();renderer.info.autoReset=priorAutoReset;}
  };
  try {
    composer = new EffectComposer(renderer);
    scenePass = new SceneMetricsRenderPass(scene,camera,diagnosticsEnabled);
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
      setModelRoot(root){if(scenePass)scenePass.setModelRoot(root);},
      setPixelRatio(value){const ratio=Number(value);if(!Number.isFinite(ratio)||ratio<=0)throw new RangeError('Pixel ratio must be positive.');renderer.setPixelRatio(ratio);composer.setPixelRatio(ratio);},
      render,getStats:()=>lastStats,
      resize(width,height){composer.setSize(width,height);},
      dispose(){composer.dispose();bloom.dispose();gpuTimer.dispose();renderer.info.autoReset=priorAutoReset;}
    };
  } catch (error) {
    console.warn('Cinematic bloom unavailable; using standard renderer',error);
    try { composer?.dispose(); } catch {}
    composer = null;
    return {enabled:false,setEnabled(){},isEnabled:()=>false,render,getStats:()=>lastStats,resize(){},setModelRoot(){},setPixelRatio(value){const ratio=Number(value);if(!Number.isFinite(ratio)||ratio<=0)throw new RangeError('Pixel ratio must be positive.');renderer.setPixelRatio(ratio);},dispose(){gpuTimer.dispose();renderer.info.autoReset=priorAutoReset;}};
  }
}
