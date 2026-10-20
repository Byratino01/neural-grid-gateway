// Low-overhead rendering diagnostics. Only enabled by ?renderStats=1.
// Does not collect network identifiers, expose connector data, or change camera controls.
export function createRenderDiagnostics(renderer, {intervalMs=1500}={}) {
 const enabled=new URLSearchParams(location.search).get('renderStats')==='1';
 if(!enabled) return {frame(){},dispose(){}};
 const panel=document.createElement('div');
 panel.id='orbital-render-stats';
 panel.setAttribute('role','status');
 panel.setAttribute('aria-label','Rendering performance diagnostics');
 Object.assign(panel.style,{position:'fixed',bottom:'12px',right:'12px',zIndex:'99999',padding:'9px 12px',
  background:'rgba(4,11,22,.88)',color:'#bdeaff',border:'1px solid #4d83a4',borderRadius:'7px',
  font:'12px/1.5 monospace',pointerEvents:'none',whiteSpace:'pre',maxWidth:'85vw'});
 document.body.appendChild(panel);
 let last=performance.now(),frames=0,frameMs=0;
 function frame(){
  frames++;
  const now=performance.now(),elapsed=now-last;
  if(elapsed<intervalMs)return;
  const info=renderer.info;
  const fps=Math.round(frames*1000/elapsed);
  const calls=info.render.calls,triangles=info.render.triangles;
  const geometries=info.memory.geometries,textures=info.memory.textures;
  const pixelRatio=renderer.getPixelRatio();
  panel.textContent='FPS '+fps+' | '+(elapsed/frames).toFixed(1)+' ms/frame\n'+
   'Draw calls '+calls+' | Triangles '+triangles.toLocaleString()+'\n'+
   'GPU resources: '+geometries+' geometries / '+textures+' textures\n'+
   'Pixel ratio '+pixelRatio.toFixed(2)+' | WebGL '+(renderer.capabilities.isWebGL2?'2':'1');
  last=now;frames=0;frameMs=0;
 }
 return {frame,dispose(){panel.remove();}};
}
