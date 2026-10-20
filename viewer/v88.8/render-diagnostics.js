// Low-overhead rendering diagnostics. Only enabled by ?renderStats=1.
// Does not collect network identifiers, expose connector data, or change camera controls.
import { readRenderCounters, snapshotRenderResources } from './render-metrics.js';

export function createRenderDiagnostics(renderer, {intervalMs=1500}={}) {
 const enabled=new URLSearchParams(location.search).get('renderStats')==='1';
 if(!enabled) return {frame(){},dispose(){}};
 const panel=document.createElement('div');
 panel.id='orbital-render-stats';
 panel.setAttribute('role','status');
 panel.setAttribute('aria-label','Rendering performance diagnostics');
 Object.assign(panel.style,{position:'fixed',bottom:'12px',right:'12px',zIndex:'99999',padding:'9px 12px',
  background:'rgba(4,11,22,.88)',color:'#bdeaff',border:'1px solid #4d83a4',borderRadius:'7px',
  font:'12px/1.5 monospace',pointerEvents:'none',whiteSpace:'pre-wrap',overflowWrap:'anywhere',maxWidth:'min(85vw, 560px)'});
 document.body.appendChild(panel);
 let last=performance.now(),frames=0,frameMs=0,renderMs=0,lastFrame=last;
 function frame(metrics){
  const now=performance.now();
  frameMs+=Math.max(0,now-lastFrame);
  lastFrame=now;
  renderMs+=Math.max(0,Number(metrics?.renderCpuMs)||0);
  frames++;
  const elapsed=now-last;
  if(elapsed<intervalMs)return;
  const scene=metrics?.scene||readRenderCounters(renderer.info);
  const post=metrics?.post||{calls:0,triangles:0};
  const total=metrics?.total||scene;
  const resources=metrics?.resources||snapshotRenderResources(renderer.info,renderer.getPixelRatio());
  const fps=frames*1000/elapsed;
  panel.textContent='FPS '+fps.toFixed(1)+' | Frame '+(frameMs/frames).toFixed(1)+' ms | Render CPU '+(renderMs/frames).toFixed(1)+' ms\n'+
   'Scene + shadows: '+scene.calls+' draws | '+scene.triangles.toLocaleString()+' triangles\n'+
   'Postprocess: '+post.calls+' draws | '+post.triangles.toLocaleString()+' triangles\n'+
   'Total: '+total.calls+' draws | '+total.triangles.toLocaleString()+' triangles\n'+
   'Renderer resources: '+resources.geometries+' geometries / '+resources.textures+' textures\n'+
   'Pixel ratio '+resources.pixelRatio.toFixed(2)+' | WebGL '+(renderer.capabilities.isWebGL2?'2':'1');
  last=now;frames=0;frameMs=0;renderMs=0;
 }
 return {frame,dispose(){panel.remove();}};
}
