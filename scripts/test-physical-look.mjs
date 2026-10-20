// Node-only regression checks for the non-destructive PBR enhancement.
// No WebGL context, deployment, or changes to the approved GLB.
import assert from 'node:assert/strict';
import {createPhysicalLook} from '../viewer/v88.8/physical-look.js';
class Texture {
 constructor(data,w,h){this.data=data;this.width=w;this.height=h;this.repeat={set(){}};this.disposed=false;}
 dispose(){this.disposed=true;}
}
class Light {
 position={set(){}};
 shadow={mapSize:{set(){}},camera:{}};
 dispose(){}
}
class Material {
 constructor(name='hull_metal'){this.name=name;this.isMeshStandardMaterial=true;this.metalness=.2;this.roughness=.8;this.opacity=1;this.transparent=false;this.alphaTest=0;}
 clone(){return Object.assign(new Material(this.name),this);}
 dispose(){this.disposed=true;}
}
const THREE={DirectionalLight:Light,PCFSoftShadowMap:2,DataTexture:Texture,RGBAFormat:1,RepeatWrapping:2,LinearFilter:3,LinearMipmapLinearFilter:4};
const scene={add(){},remove(){}},renderer={shadowMap:{enabled:false,type:0},toneMappingExposure:.75};
const shared=new Material();
const mesh=(name,material=shared,uv=true)=>({isMesh:true,name,material,castShadow:false,receiveShadow:false,geometry:{getAttribute(k){return k==='uv'&&uv?{}:undefined;}}});
const a=mesh('station_hull_A'),b=mesh('station_hull_B'),c=mesh('EARTH_rotating_sphere'),d=mesh('station_hull_no_uv',shared,false);
const nodes=[a,b,c,d],root={traverse(fn){nodes.forEach(fn);}};
const effect=createPhysicalLook(THREE,scene,renderer);
effect.install(root);
assert.equal(a.material,b.material,'Shared UV structural material must be reused');
assert.notEqual(a.material,d.material,'UV and non-UV variants must differ');
assert.ok(a.material.roughnessMap,'UV hull gets procedural roughness');
assert.equal(d.material.roughnessMap,undefined,'No-UV hull must not get roughness map');
assert.equal(c.material,shared,'Earth material is preserved');
assert.equal(a.castShadow,false,'Do not force expensive mesh shadow casting');
assert.equal(a.receiveShadow,true,'Hull may receive shadows');
const first=a.material;
effect.install(root);
assert.notEqual(a.material,first,'Reload creates fresh, live material');
assert.equal(first.disposed,true,'Reload disposes old cloned material');
effect.dispose();
assert.equal(a.material,shared,'Original material restored');
assert.equal(a.receiveShadow,false,'Original shadow state restored');
assert.equal(renderer.shadowMap.enabled,false,'Original renderer shadow enabled state restored');
assert.equal(renderer.shadowMap.type,0,'Original renderer shadow type restored');
assert.equal(renderer.toneMappingExposure,.75,'Original exposure restored');
console.log('Physical-look material lifecycle and shadow regression checks passed');
