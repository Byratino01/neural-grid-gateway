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
 copy(other){this.value=other.value;return this;}
}
class Material {
 constructor(name='hull_metal'){this.name=name;this.isMeshStandardMaterial=true;this.metalness=.2;this.roughness=.8;this.opacity=1;this.transparent=false;this.depthWrite=true;this.alphaTest=0;this.emissive=new Emissive(.4);this.emissiveIntensity=1;this.map=null;}
 clone(){const copy=Object.assign(new Material(this.name),this);copy.emissive=this.emissive.clone();return copy;}
 dispose(){this.disposed=true;}
}
const THREE={DirectionalLight:Light,PCFSoftShadowMap:2,DataTexture:Texture,RGBAFormat:1,RepeatWrapping:2,LinearFilter:3,LinearMipmapLinearFilter:4};
const scene={environmentIntensity:.65,add(){},remove(){}},renderer={shadowMap:{enabled:false,type:0},toneMappingExposure:.75};
const shared=new Material();
const mesh=(name,material=shared,uv=true)=>({isMesh:true,name,material,visible:true,castShadow:false,receiveShadow:false,geometry:{getAttribute(k){return k==='uv'&&uv?{}:undefined;}}});
const earthSurfaceMaterial=new Material('V10_Earth_geographic_surface');
earthSurfaceMaterial.map={embedded:true};
const cloudMaterial=new Material('V8_Earth_clouds_translucent');
const atmosphereMaterial=new Material('V8_Earth_atmospheric_scatter');
const glassMaterial=new Material('R13_glass_blue');glassMaterial.transmission=.78;glassMaterial.isMeshPhysicalMaterial=true;
const hotMaterial=new Material('V7_ice_white_energy');
hotMaterial.emissiveIntensity=24;
const a=mesh('station_hull_A'),b=mesh('station_hull_B'),c=mesh('EARTH_rotating_sphere'),d=mesh('station_hull_no_uv',shared,false);
const earthSurface=mesh('EARTH_rotating_sphere',earthSurfaceMaterial),clouds=mesh('EARTH_high_cloud_layer',cloudMaterial),atmosphere=mesh('EARTH_atmospheric_blue_halo',atmosphereMaterial),hot=mesh('station_energy',hotMaterial);
const glass=mesh('station_glass',glassMaterial);
const nodes=[a,b,c,d,earthSurface,clouds,atmosphere,hot,glass],root={traverse(fn){nodes.forEach(fn);}};
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
const earthEmissiveBaseline=earthSurface.material.emissive.value;
effect.setPhase4Experiment('earth-lighting-metal');
assert.ok(Math.abs(earthSurface.material.emissive.value-earthEmissiveBaseline*2/3)<1e-10,'Earth contrast experiment lowers only cloned surface emissive');
assert.equal(clouds.material.opacity,.12,'Earth/cloud experiment keeps the authored cloud map and uses lighter opacity');
assert.equal(atmosphere.material.opacity,.16,'Earth/cloud experiment increases only the cloned scattering shell');
assert.equal(scene.environmentIntensity,.5525,'Lighting experiment reduces procedural environment intensity');
assert.equal(renderer.toneMappingExposure,.79,'Lighting experiment uses a restrained exposure');
effect.setPhase4Experiment('standard-glass');
assert.notEqual(glass.material,glassMaterial,'Glass experiment substitutes only runtime material clones');
assert.equal(glass.material.transmission,0,'Glass experiment disables transmission in its clone');
assert.equal(glass.material.transparent,true,'Glass experiment uses standard alpha transparency');
assert.equal(glassMaterial.transmission,.78,'Approved source glass material remains untouched');
effect.setPhase4Experiment('baseline');
assert.equal(glass.material,glassMaterial,'Baseline restores the original glass material reference');
assert.equal(earthSurface.material.emissive.value,earthEmissiveBaseline,'Baseline restores Earth material factors');
assert.equal(clouds.material.opacity,.18,'Baseline restores cloud opacity');
assert.equal(atmosphere.material.opacity,.1,'Baseline restores atmosphere opacity');
assert.equal(scene.environmentIntensity,.65,'Baseline restores environment intensity');
assert.equal(renderer.toneMappingExposure,.82,'Baseline restores runtime exposure');
effect.setDiagnosticMode({shadows:false,atmosphere:false});
assert.equal(renderer.shadowMap.enabled,false,'Shadow mode switch disables rendering without changing the light');
assert.equal(effect.getShadowProfile().lightCasts,true,'Shadow mode switch preserves the light configuration');
assert.equal(clouds.visible,false,'Minimal-effects mode hides the cloud shell reversibly');
assert.equal(effect.getShadowProfile().casters,0,'No GLB meshes are configured to cast shadows');
effect.setDiagnosticMode({shadows:true,atmosphere:true});
assert.equal(renderer.shadowMap.enabled,true,'Baseline mode restores the shadow-map switch');
assert.equal(clouds.visible,true,'Baseline mode restores original atmosphere visibility');
const first=a.material;
effect.install(root);
assert.notEqual(a.material,first,'Reload creates fresh, live material');
assert.equal(first.disposed,true,'Reload disposes old cloned material');
effect.dispose();
assert.equal(a.material,shared,'Original material restored');
assert.equal(a.receiveShadow,false,'Original shadow state restored');
assert.equal(clouds.visible,true,'Original cloud visibility restored on dispose');
assert.equal(renderer.shadowMap.enabled,false,'Original renderer shadow enabled state restored');
assert.equal(renderer.shadowMap.type,0,'Original renderer shadow type restored');
assert.equal(renderer.toneMappingExposure,.75,'Original exposure restored');
assert.equal(scene.environmentIntensity,.65,'Original environment intensity restored');
console.log('Physical-look material lifecycle and shadow regression checks passed');
