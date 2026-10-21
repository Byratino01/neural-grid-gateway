export const RENDER_MODES = Object.freeze({
  A:{label:'A · Baseline',shadows:true,bloom:true,atmosphere:true},
  B:{label:'B · Shadows off',shadows:false,bloom:true,atmosphere:true},
  C:{label:'C · Bloom off',shadows:true,bloom:false,atmosphere:true},
  D:{label:'D · Minimal effects',shadows:false,bloom:false,atmosphere:false}
});

export function createRenderModeController({physicalLook,bloom}={}) {
  let current='A';
  function setMode(id) {
    const mode=RENDER_MODES[id];
    if (!mode) throw new RangeError(`Unknown rendering mode: ${id}`);
    physicalLook?.setDiagnosticMode({shadows:mode.shadows,atmosphere:mode.atmosphere});
    bloom?.setEnabled(mode.bloom);
    current=id;
    return {id,...mode};
  }
  return {setMode,getMode:()=>current};
}

const percentile=(sorted,p)=>sorted.length?sorted[Math.min(sorted.length-1,Math.ceil(p*sorted.length)-1)]:0;
export function summarizeRenderSample(mode,frameTimes,metrics={},gpuFrameTimes=[]) {
  const samples=frameTimes.filter(value=>Number.isFinite(value)&&value>0).sort((a,b)=>a-b);
  const gpuSamples=gpuFrameTimes.filter(value=>Number.isFinite(value)&&value>0).sort((a,b)=>a-b);
  const renderSamples=(metrics.renderCpuSamples||[]).filter(value=>Number.isFinite(value)&&value>0).sort((a,b)=>a-b);
  const mean=samples.length?samples.reduce((sum,value)=>sum+value,0)/samples.length:0;
  const middle=Math.floor(samples.length/2);
  const median=samples.length?(samples.length%2?samples[middle]:(samples[middle-1]+samples[middle])/2):0;
  const p95=percentile(samples,.95);
  const lowFps=percentile(samples,.99)>0?1000/percentile(samples,.99):0;
  const medianFps=median>0?1000/median:0;
  const averageFps=mean>0?1000/mean:0;
  const gpuMean=gpuSamples.length?gpuSamples.reduce((sum,value)=>sum+value,0)/gpuSamples.length:0;
  const renderMean=renderSamples.length?renderSamples.reduce((sum,value)=>sum+value,0)/renderSamples.length:0;
  const renderMiddle=Math.floor(renderSamples.length/2);
  const renderMedian=renderSamples.length?(renderSamples.length%2?renderSamples[renderMiddle]:(renderSamples[renderMiddle-1]+renderSamples[renderMiddle])/2):0;
  const gpuMiddle=Math.floor(gpuSamples.length/2);
  const gpuMedian=gpuSamples.length?(gpuSamples.length%2?gpuSamples[gpuMiddle]:(gpuSamples[gpuMiddle-1]+gpuSamples[gpuMiddle])/2):0;
  return {
    mode,frames:samples.length,averageFps,medianFps,onePercentLowFps:lowFps,
    averageFrameTimeMs:mean,medianFrameTimeMs:median,p95FrameTimeMs:p95,
    gpuTimingSupported:Boolean(metrics.gpuTimingSupported),gpuSamples:gpuSamples.length,
    averageGpuFrameTimeMs:gpuMean,medianGpuFrameTimeMs:gpuMedian,p95GpuFrameTimeMs:percentile(gpuSamples,.95),
    renderCpuSamples:renderSamples.length,averageRenderCpuMs:renderMean,medianRenderCpuMs:renderMedian,p95RenderCpuMs:percentile(renderSamples,.95),
    scene:metrics.scene||null,post:metrics.post||null,total:metrics.total||null,
    drawBreakdown:metrics.drawBreakdown||null,
    resources:metrics.resources||null
  };
}
