import test from 'node:test';
import assert from 'node:assert/strict';
import {CINEMATIC_BLOOM,readRenderCounters,snapshotRenderResources,subtractRenderCounters} from '../viewer/v88.8/render-metrics.js';
import {benchmarkEnvironmentReady} from '../viewer/v88.8/render-diagnostics.js';

test('render statistics snapshot all relevant scene counters',()=>{
  assert.deepEqual(readRenderCounters({render:{calls:3076,triangles:435096,points:4,lines:7}}),
    {calls:3076,triangles:435096,points:4,lines:7});
});

test('postprocessing counters are isolated from scene counters',()=>{
  const total={calls:29,triangles:45,points:3,lines:8};
  const scene={calls:11,triangles:30,points:1,lines:2};
  assert.deepEqual(subtractRenderCounters(total,scene),
    {calls:18,triangles:15,points:2,lines:6});
});

test('counter snapshots tolerate missing fields and never report negative post work',()=>{
  assert.deepEqual(readRenderCounters({render:{calls:'3'}}),
    {calls:3,triangles:0,points:0,lines:0});
  assert.deepEqual(subtractRenderCounters({calls:1},{calls:4}),
    {calls:0,triangles:0,points:0,lines:0});
});

test('bloom tuning keeps a higher threshold and lower intensity',()=>{
  assert.ok(CINEMATIC_BLOOM.strength < 0.42);
  assert.ok(CINEMATIC_BLOOM.radius < 0.55);
  assert.ok(CINEMATIC_BLOOM.threshold > 0.88);
});

test('resource snapshot reports renderer counts and actual pixel ratio',()=>{
  assert.deepEqual(snapshotRenderResources({memory:{geometries:3100,textures:18}},1.7),
    {geometries:3100,textures:18,pixelRatio:1.7});
});

test('render benchmarks require a visible foreground browser tab',()=>{
  assert.equal(benchmarkEnvironmentReady({visibilityState:'visible',hasFocus:()=>true}),true);
  assert.equal(benchmarkEnvironmentReady({visibilityState:'visible',hasFocus:()=>false}),false);
  assert.equal(benchmarkEnvironmentReady({visibilityState:'hidden',hasFocus:()=>true}),false);
});
