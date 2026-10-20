// Read-only renderer profiling panel. Enabled only with ?renderStats=1.
import {readRenderCounters,snapshotRenderResources} from './render-metrics.js';
import {RENDER_MODES,summarizeRenderSample} from './render-modes.js';

const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

export function createRenderDiagnostics(renderer,{intervalMs=1500,setMode=()=>{},setPixelRatio=()=>{},getSceneDiagnostics=()=>null,warmupMs=3000,sampleMs=30000}={}) {
  const enabled=new URLSearchParams(location.search).get('renderStats')==='1';
  if(!enabled)return {frame(){},dispose(){},setMode(){},getReport:()=>null};
  const panel=document.createElement('section');
  panel.id='orbital-render-stats';
  panel.setAttribute('aria-label','Rendering performance diagnostics');
  Object.assign(panel.style,{position:'fixed',bottom:'12px',right:'12px',zIndex:'99999',padding:'9px 12px',
    background:'rgba(4,11,22,.94)',color:'#bdeaff',border:'1px solid #4d83a4',borderRadius:'7px',
    font:'12px/1.45 monospace',maxWidth:'min(92vw,640px)',maxHeight:'70vh',overflow:'auto',boxSizing:'border-box'});
  const heading=document.createElement('div');heading.textContent='Rendering diagnostics (CPU timings + optional GPU timer query)';
  const modeRow=document.createElement('div');modeRow.style.margin='6px 0';
  const modeSelect=document.createElement('select');modeSelect.setAttribute('aria-label','Rendering mode');
  let rendererDetails={api:renderer.capabilities.isWebGL2?'WebGL 2':'WebGL 1',vendor:'unavailable',renderer:'unavailable'};
  try{
    const gl=renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');
    rendererDetails={api:renderer.capabilities.isWebGL2?'WebGL 2':'WebGL 1',
      vendor:String(gl.getParameter(debug?.UNMASKED_VENDOR_WEBGL||gl.VENDOR)||'unknown'),
      renderer:String(gl.getParameter(debug?.UNMASKED_RENDERER_WEBGL||gl.RENDERER)||'unknown')};
  }catch{}
  Object.entries(RENDER_MODES).forEach(([id,mode])=>{const option=document.createElement('option');option.value=id;option.textContent=mode.label;modeSelect.append(option);});
  modeSelect.onchange=()=>setMode(modeSelect.value);
  const runButton=document.createElement('button');runButton.textContent='Benchmark all modes (30s each)';
  const ratioButton=document.createElement('button');ratioButton.textContent='Compare pixel ratio 1.25 vs 1.0';
  const exportButton=document.createElement('button');exportButton.textContent='Export JSON';exportButton.disabled=true;
  for(const button of [modeSelect,runButton,ratioButton,exportButton])Object.assign(button.style,{marginRight:'6px',padding:'4px 6px'});
  modeRow.append(modeSelect,runButton,ratioButton,exportButton);
  const current=document.createElement('pre');current.style.whiteSpace='pre-wrap';
  const reportWrap=document.createElement('div');reportWrap.style.maxHeight='22vh';reportWrap.style.overflow='auto';
  const reportView=document.createElement('table');reportView.setAttribute('aria-label','Rendering mode benchmark comparison');
  Object.assign(reportView.style,{borderCollapse:'collapse',font:'11px/1.35 monospace',whiteSpace:'nowrap'});
  const status=document.createElement('div');status.setAttribute('role','status');
  reportWrap.append(reportView);panel.append(heading,modeRow,current,status,reportWrap);document.body.append(panel);
  let last=performance.now(),lastFrame=last,frames=0,frameMs=0,renderMs=0;
  let activeRun=null,latestMetrics=null,report=[],ratioReport=[],lastGpuMs=null;
  function setSelectedMode(id){modeSelect.value=id;setMode(id);}
  function frame(metrics){
    const now=performance.now(),delta=Math.max(0,now-lastFrame);lastFrame=now;
    frameMs+=delta;renderMs+=Math.max(0,Number(metrics?.renderCpuMs)||0);frames++;
    latestMetrics=metrics||null;
    if(Number.isFinite(metrics?.gpuMs)&&metrics.gpuMs>0)lastGpuMs=metrics.gpuMs;
    if(activeRun?.collecting&&delta>0){activeRun.samples.push(delta);if(Number.isFinite(metrics?.gpuMs)&&metrics.gpuMs>0)activeRun.gpuSamples.push(metrics.gpuMs);}
    const elapsed=now-last;
    if(elapsed<intervalMs)return;
    const scene=metrics?.scene||readRenderCounters(renderer.info);
    const post=metrics?.post||{calls:0,triangles:0};
    const total=metrics?.total||scene;
    const resources=metrics?.resources||snapshotRenderResources(renderer.info,renderer.getPixelRatio());
    const shadow=getSceneDiagnostics?.();
    current.textContent=`FPS ${((frames*1000)/elapsed).toFixed(1)} | Frame ${(frameMs/frames).toFixed(1)} ms | Render CPU ${(renderMs/frames).toFixed(1)} ms\n`+
      `Scene + shadows: ${scene.calls} draws | ${scene.triangles.toLocaleString()} triangles\n`+
      (metrics?.drawBreakdown?`Draw submissions: model ${metrics.drawBreakdown.model} (transmission target ${metrics.drawBreakdown.transmission}, included) | viewer ${metrics.drawBreakdown.viewer} | shadow ${metrics.drawBreakdown.shadow} | transparent double-side ${metrics.drawBreakdown.transparentDoubleSide}\n`: '')+
      `Postprocess: ${post.calls} draws | ${post.triangles.toLocaleString()} triangles\n`+
      `Total: ${total.calls} draws | ${total.triangles.toLocaleString()} triangles\n`+
      `Renderer resources: ${resources.geometries} geometries / ${resources.textures} textures\n`+
      (shadow?`Shadow map ${shadow.enabled?'on':'off'} | light caster ${shadow.lightCasts?'yes':'no'} | mesh casters ${shadow.casters}/${shadow.meshes} | receivers ${shadow.receivers}\n`: '')+
      `Pixel ratio ${resources.pixelRatio.toFixed(2)} | ${rendererDetails.api}\nRenderer: ${rendererDetails.renderer}\nGPU render ${lastGpuMs===null?(metrics?.gpuTimingSupported?'waiting for timer query':'timer query unsupported'):lastGpuMs.toFixed(2)+' ms (timer query)'}`;
    last=now;frames=0;frameMs=0;renderMs=0;
  }
  function renderReport(){
    reportView.replaceChildren();
    const headers=['Mode','Avg / median / 1% low FPS','CPU frame avg / median / P95 ms','GPU avg / median / P95 ms','Scene/shadow draws','Post draws','Model (transmission subset) / viewer / shadow','Triangles scene / post','Resources geom / tex','Pixel ratio'];
    const head=document.createElement('thead'),headRow=document.createElement('tr');
    for(const label of headers){const cell=document.createElement('th');cell.textContent=label;cell.style.textAlign='left';cell.style.padding='2px 5px';headRow.append(cell);}
    head.append(headRow);reportView.append(head);
    const body=document.createElement('tbody');
    for(const row of report){
      const values=[row.mode,`${row.averageFps.toFixed(1)} / ${row.medianFps.toFixed(1)} / ${row.onePercentLowFps.toFixed(1)}`,
        `${row.averageFrameTimeMs.toFixed(2)} / ${row.medianFrameTimeMs.toFixed(2)} / ${row.p95FrameTimeMs.toFixed(2)}`,
        row.gpuSamples?`${row.averageGpuFrameTimeMs.toFixed(2)} / ${row.medianGpuFrameTimeMs.toFixed(2)} / ${row.p95GpuFrameTimeMs.toFixed(2)}`:'n/a',
        row.scene?.calls??'n/a',row.post?.calls??'n/a',row.drawBreakdown?`${row.drawBreakdown.model} (${row.drawBreakdown.transmission}) / ${row.drawBreakdown.viewer} / ${row.drawBreakdown.shadow}`:'n/a',`${row.scene?.triangles??'n/a'} / ${row.post?.triangles??'n/a'}`,
        `${row.resources?.geometries??'n/a'} / ${row.resources?.textures??'n/a'}`,row.resources?.pixelRatio?.toFixed?.(2)??'n/a'];
      const tr=document.createElement('tr');for(const value of values){const td=document.createElement('td');td.textContent=String(value);td.style.padding='2px 5px';tr.append(td);}body.append(tr);
    }
    reportView.append(body);
    exportButton.disabled=report.length===0;
  }
  async function runBenchmark(){
    if(activeRun)return;
    report=[];renderReport();runButton.disabled=true;modeSelect.disabled=true;
    try{
      for(const id of Object.keys(RENDER_MODES)){
        setSelectedMode(id);status.textContent=`${id}: warming up for ${(warmupMs/1000).toFixed(0)}s…`;
        await wait(warmupMs);
        activeRun={collecting:true,samples:[],gpuSamples:[]};
        const capture=activeRun;
        status.textContent=`${id}: sampling for ${(sampleMs/1000).toFixed(0)}s…`;
        await wait(sampleMs);
        capture.collecting=false;
        report.push(summarizeRenderSample(id,capture.samples,latestMetrics||{},capture.gpuSamples));
        activeRun=null;renderReport();
      }
      status.textContent='Benchmark complete. Compare on the same browser, window size, and scene.';
    }catch(error){activeRun=null;status.textContent=`Benchmark stopped: ${error.message}`;}
    finally{setSelectedMode('A');modeSelect.disabled=false;runButton.disabled=false;}
  }
  async function runPixelRatioComparison(){
    if(activeRun)return;
    const original=renderer.getPixelRatio();ratioReport=[];ratioButton.disabled=true;runButton.disabled=true;modeSelect.disabled=true;
    try{
      setSelectedMode('A');
      for(const ratio of [1.25,1.0])for(let repeat=1;repeat<=2;repeat++){
        setPixelRatio(ratio);
        status.textContent=`Pixel ratio ${ratio.toFixed(2)} · run ${repeat}: warming up for ${(warmupMs/1000).toFixed(0)}s…`;
        await wait(warmupMs);
        activeRun={collecting:true,samples:[],gpuSamples:[]};const capture=activeRun;
        status.textContent=`Pixel ratio ${ratio.toFixed(2)} · run ${repeat}: sampling for ${(sampleMs/1000).toFixed(0)}s…`;
        await wait(sampleMs);capture.collecting=false;
        ratioReport.push({...summarizeRenderSample(`A · ratio ${ratio.toFixed(2)} · run ${repeat}`,capture.samples,latestMetrics||{},capture.gpuSamples),repeat,pixelRatio:ratio});
        activeRun=null;
      }
      report=[...ratioReport];renderReport();status.textContent='Pixel ratio comparison complete (two runs at each setting).';
    }catch(error){activeRun=null;status.textContent=`Pixel ratio comparison stopped: ${error.message}`;}
    finally{activeRun=null;setPixelRatio(original);setSelectedMode('A');modeSelect.disabled=false;runButton.disabled=false;ratioButton.disabled=false;}
  }
  ratioButton.onclick=runPixelRatioComparison;
  runButton.onclick=runBenchmark;
  exportButton.onclick=()=>{
    const payload={createdAt:new Date().toISOString(),sampleDurationMs:sampleMs,warmupDurationMs:warmupMs,
      timingNote:'Frame and renderCpuMs values are CPU-side wall-clock measurements, not GPU execution time. GPU frame values come from asynchronous disjoint timer queries and are omitted when unsupported, disjoint, or unavailable.',renderer:{...rendererDetails,pixelRatio:renderer.getPixelRatio()},modes:report,pixelRatioComparison:ratioReport};
    const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='neural-grid-render-benchmark.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  renderReport();
  return {frame,dispose(){activeRun=null;panel.remove();},setMode:setSelectedMode,getReport:()=>report.slice(),runBenchmark};
}
