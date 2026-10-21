import test from 'node:test';
import assert from 'node:assert/strict';
import {createReflectionEnvironment} from '../viewer/v88.8/reflection-environment.js';

test('procedural PMREM reflections use non-clipping blur and restore scene state on dispose',()=>{
  const calls=[];const target={texture:{name:'pmrem'},dispose(){calls.push('target.dispose')}};
  class Color{constructor(value){this.value=value}multiplyScalar(value){this.value*=value;return this}}
  class Scene{constructor(){this.children=[]}add(x){this.children.push(x)}}
  class Geometry{dispose(){calls.push('geometry.dispose')}}
  class Material{dispose(){calls.push('material.dispose')}}
  class Mesh{constructor(geometry,material){this.geometry=geometry;this.material=material;this.position={set(){}};this.scale={set(){}};this.rotation={}}}
  class PMREM{constructor(){}fromScene(...args){calls.push(['fromScene',...args.slice(1)]);return target}dispose(){calls.push('pmrem.dispose')}}
  const THREE={Scene,Color,PlaneGeometry:Geometry,MeshBasicMaterial:Material,Mesh,PMREMGenerator:PMREM,DoubleSide:2};
  const previous={name:'previous'},scene={environment:previous,environmentIntensity:.2,add(){}};
  const result=createReflectionEnvironment(THREE,scene,{});
  assert.deepEqual(calls.find(Array.isArray),['fromScene',.04,.1,30]);
  assert.equal(scene.environment,target.texture);
  assert.equal(scene.environmentIntensity,.65);
  result.dispose();
  assert.equal(scene.environment,previous);
  assert.equal(scene.environmentIntensity,.2);
  assert.ok(calls.includes('target.dispose'));
  assert.ok(calls.includes('pmrem.dispose'));
});
