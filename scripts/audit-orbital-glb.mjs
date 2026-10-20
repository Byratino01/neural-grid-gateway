#!/usr/bin/env node
// Read-only GLB structure audit: no renderer, external packages, or asset mutation.
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
const root=resolve('viewer/v88.8');
const data=await readFile(resolve(root,'orbital-nexus.glb'));
if(data.length<20||data.toString('ascii',0,4)!=='glTF')throw Error('Not a GLB');
const version=data.readUInt32LE(4),declared=data.readUInt32LE(8);
if(version!==2||declared!==data.length)throw Error('Invalid GLB header');
const jsonLength=data.readUInt32LE(12),type=data.readUInt32LE(16);
if(type!==0x4e4f534a||20+jsonLength>data.length)throw Error('Invalid JSON chunk');
const gltf=JSON.parse(data.subarray(20,20+jsonLength).toString('utf8'));
const nodes=gltf.nodes||[],materials=gltf.materials||[],meshes=gltf.meshes||[];
const earthCandidates=nodes.map((n,i)=>({index:i,name:n.name||''})).filter(n=>/earth|planet|globe|sphere/i.test(n.name));
const exactEarth=earthCandidates.filter(n=>/^(earth|earth_mesh|planet_earth|earth_globe)$/i.test(n.name));
const animations=(gltf.animations||[]).map(a=>({name:a.name||'',channels:a.channels?.length||0}));
const pbr=materials.filter(m=>m.pbrMetallicRoughness).length;
const normalMaps=materials.filter(m=>m.normalTexture).length;
const metallicRoughnessMaps=materials.filter(m=>m.pbrMetallicRoughness?.metallicRoughnessTexture).length;
const report={asset:'orbital-nexus.glb',glbVersion:version,bytes:data.length,
 nodes:nodes.length,meshes:meshes.length,materials:materials.length,textures:(gltf.textures||[]).length,
 images:(gltf.images||[]).length,pbrMaterials:pbr,normalMaps,metallicRoughnessMaps,
 animations,earthCandidates,earthRotationAutoDetect:exactEarth.length===1?'eligible':'needs explicit identification',
 warnings:[]};
if(!normalMaps)report.warnings.push('No normal maps');
if(exactEarth.length!==1)report.warnings.push('Earth rotation will not auto-activate with current naming');
console.log(JSON.stringify(report,null,2));
const dest=resolve('artifacts/orbital-glb-audit.json');
await mkdir(dirname(dest),{recursive:true});
await writeFile(dest,JSON.stringify(report,null,2)+'\n');
