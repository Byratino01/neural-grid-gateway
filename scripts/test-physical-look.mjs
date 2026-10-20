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
class Emissive {
 constructor(value=1){this.value=value;}
 multiplyScalar(scale){this.value*=scale;return this;}
 clone(){return new Emissive(this.value);}
}
class Material {
 constructor(name='hull_metal'){this.name=name;this.isMeshStandardMaterial=true;this.metalness=.2;this.roughness=.8;this.opacity=1;this.transparent=false;this.depthWrite=true;this.alphaTest=0;this.emissive=new Emissive(.4);this.emissiveIntensity=1;this.map=null;}
 clone(){const copy=Object.assign(new Material(this.name),this);copy.emissive=this.emissive.clone();return copy;}
 dispose(){this.disposed=true;}
}
const THREE={DirectionalLight:Light,PCFSoftShadowMap:2,DataTexture:Texture,RGBAFormat:1,RepeatWrapping:2,LinearFilter:3,LinearMipmapLinearFilter:4};
const scene={add(){},remove(){}},renderer={shadowMap:{enabled:false,type:0},toneMappingExposure:.75};
const shared=new Material();
const mesh=(name,material=shared,uv=true)=>({isMesh:true,name,material,castShadow:false,receiveShadow:false,geometry:{getAttribute(k){return k==='uv'&&uv?{}:undefined;}}});
const earthSurfaceMaterial=new Material('V10_Earth_geographic_surface');
earthSurfaceMaterial.map={embedded:true};
const cloudMaterial=new Material('V8_Earth_clouds_translucent');
const atmosphereMaterial=new Material('V8_Earth_atmospheric_scatter');
const hotMaterial=new Material('V7_ice_white_energy');
hotMaterial.emissiveIntensity=24;
const a=mesh('station_hull_A'),b=mesh('station_hull_B'),c=mesh('EARTH_rotating_sphere'),d=mesh('station_hull_no_uv',shared,false);
const earthSurface=mesh('EARTH_rotating_sphere',earthSurfaceMaterial),clouds=mesh('EARTH_high_cloud_layer',cloudMaterial),atmosphere=mesh('EARTH_atmospheric_blue_halo',atmosphereMaterial),hot=mesh('station_energy',hotMaterial);
const nodes=[a,b,c,d,earthSurface,clouds,atmosphere,hot],root={traverse(fn){nodes.forEach(fn);}};
const effect=createPhysicalLook(THREE,scene,renderer);
effect.install(root);
assert.equal(a.material,b.material,'Shared UV structural material must be reused');
assert.notEqual(a.material,d.material,'UV and non-UV variants must differ');
assert.ok(a.material.roughnessMap,'UV hull gets procedural roughness');
assert.equal(d.material.roughnessMap,undefined,'No-UV hull must not get roughness map');
assert.equal(c.material,shared,'Unmatched Earth material stays unchanged');
assert.notEqual(earthSurface.material,earthSurfaceMaterial,'Earth surface uses a reversible material clone');
assert.equal(earthSurface.material.map,earthSurfaceMaterial.map,'Earth geographic texture is preserved');
assert.ok(Math.abs(earthSurface.material.emissive.value-.06)<1e-10,'Earth self-emission is attenuated without replacing its texture');
assert.equal(earthSurfaceMaterial.emissive.value,.4,'Source GLB Earth material remains untouched');
assert.notEqual(clouds.material,cloudMaterial,'Cloud shell uses a reversible material clone');
assert.equal(clouds.material.transparent,true,'Opaque cloud shell becomes a translucent overlay');
assert.equal(clouds.material.opacity,.18);
assert.equal(cloudMaterial.transparent,false,'Source cloud material remains untouched');
assert.equal(atmosphere.material.transparent,true,'Blue atmospheric shell becomes a translucent overlay');
assert.equal(atmosphere.material.opacity,.1);
assert.equal(atmosphereMaterial.transparent,false,'Source atmosphere material remains untouched');
assert.equal(hot.material.emissiveIntensity,1.8,'Extreme emissive strength is capped on the clone');
assert.equal(hotMaterial.emissiveIntensity,24,'Source emissive material remains untouched');
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
