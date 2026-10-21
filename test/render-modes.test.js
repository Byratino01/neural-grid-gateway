import test from 'node:test';
import assert from 'node:assert/strict';
import {createRenderModeController,RENDER_MODES,summarizeRenderSample} from '../viewer/v88.8/render-modes.js';

test('diagnostic modes cover baseline, isolated effects, and minimal effects',()=>{
  assert.deepEqual(Object.fromEntries(Object.entries(RENDER_MODES).map(([id,m])=>[id,[m.shadows,m.bloom,m.atmosphere]])),{
    A:[true,true,true],B:[false,true,true],C:[true,false,true],D:[false,false,false]
  });
});

test('mode switching is reversible and does not recreate scene or camera',()=>{
  const calls=[];
  const modes=createRenderModeController({
    physicalLook:{setDiagnosticMode:settings=>calls.push(['scene',settings])},
    bloom:{setEnabled:value=>calls.push(['bloom',value])}
  });
  for(const id of ['B','C','D','A','D','A'])modes.setMode(id);
  assert.equal(modes.getMode(),'A');
  assert.deepEqual(calls.slice(-2),[['scene',{shadows:true,atmosphere:true}],['bloom',true]]);
  assert.throws(()=>modes.setMode('X'),RangeError);
});

test('benchmark summary reports frame percentiles and separates renderer counters',()=>{
  const result=summarizeRenderSample('A',[10,20,30,40],{
    scene:{calls:12,triangles:80},post:{calls:14,triangles:14},total:{calls:26,triangles:94},drawBreakdown:{model:8,viewer:3,shadow:1,transparentDoubleSide:2},resources:{pixelRatio:1.25},gpuTimingSupported:true,renderCpuSamples:[4,5,6]
  },[1,2,3]);
  assert.equal(result.frames,4);
  assert.equal(result.averageFrameTimeMs,25);
  assert.equal(result.medianFrameTimeMs,25);
  assert.equal(result.p95FrameTimeMs,40);
  assert.equal(result.onePercentLowFps,25);
  assert.deepEqual(result.scene,{calls:12,triangles:80});
  assert.deepEqual(result.post,{calls:14,triangles:14});
  assert.deepEqual(result.drawBreakdown,{model:8,viewer:3,shadow:1,transparentDoubleSide:2});
  assert.equal(result.averageGpuFrameTimeMs,2);
  assert.equal(result.medianGpuFrameTimeMs,2);
  assert.equal(result.gpuSamples,3);
  assert.equal(result.averageRenderCpuMs,5);
  assert.equal(result.medianRenderCpuMs,5);
  assert.equal(result.p95RenderCpuMs,6);
});
