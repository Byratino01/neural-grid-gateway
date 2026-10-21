import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname, resolve} from 'node:path';

const source=resolve('viewer/v88.8/orbital-nexus.glb');
const output=resolve('viewer/v88.8/candidates/orbital-nexus-phase-4-5-candidate.glb');
const expected='a64b5e8c90c42132cd3a12c9fa29d21d5803e64890443cfb8bf7ff1645961cf6';
const data=await readFile(source);
const hash=createHash('sha256').update(data).digest('hex');
if(hash!==expected)throw Error(`Approved source checksum mismatch: ${hash}`);
if(data.toString('ascii',0,4)!=='glTF'||data.readUInt32LE(4)!==2||data.readUInt32LE(8)!==data.length)throw Error('Invalid source GLB');
let offset=12,json=null,bin=null;
while(offset<data.length){
  const size=data.readUInt32LE(offset),type=data.readUInt32LE(offset+4),start=offset+8,end=start+size;
  if(end>data.length||size%4)throw Error('Invalid source chunk bounds/alignment');
  if(type===0x4e4f534a){if(json)throw Error('Duplicate JSON chunk');json={start,end};}
  else if(type===0x004e4942){if(bin)throw Error('Duplicate BIN chunk');bin={header:offset,start,end};}
  else throw Error(`Unsupported GLB chunk type: ${type}`);
  offset=end;
}
if(!json||!bin)throw Error('Expected one JSON and one BIN chunk');
const gltf=JSON.parse(data.subarray(json.start,json.end).toString('utf8').trim());
const expectedMaterials=['R13_glass_blue','V7_optical_cyan_glass'];
const changed=[];
for(const name of expectedMaterials){
  const mat=gltf.materials.find(m=>m.name===name);
  if(!mat)throw Error(`Missing glass material ${name}`);
  const pbr=mat.pbrMetallicRoughness;
  if(!pbr?.baseColorFactor)throw Error(`Missing PBR base color for ${name}`);
  pbr.baseColorFactor[3]=Math.min(0.48,Math.max(Number(pbr.baseColorFactor[3]??1),0.38));
  pbr.metallicFactor=Math.max(Number(pbr.metallicFactor??0),0.12);
  pbr.roughnessFactor=Math.max(Number(pbr.roughnessFactor??1),0.24);
  mat.alphaMode='BLEND';
  if(mat.emissiveFactor)mat.emissiveFactor=mat.emissiveFactor.map(c=>c*1.35);
  if(mat.extensions){delete mat.extensions.KHR_materials_transmission;delete mat.extensions.KHR_materials_volume;if(!Object.keys(mat.extensions).length)delete mat.extensions;}
  changed.push({name,opacity:pbr.baseColorFactor[3],metallic:pbr.metallicFactor,roughness:pbr.roughnessFactor,emissive:mat.emissiveFactor??[0,0,0]});
}
for(const ext of ['KHR_materials_transmission','KHR_materials_volume']){
 if((gltf.materials||[]).every(m=>!m.extensions?.[ext])){
  gltf.extensionsUsed=(gltf.extensionsUsed||[]).filter(x=>x!==ext);
  gltf.extensionsRequired=(gltf.extensionsRequired||[]).filter(x=>x!==ext);
 }
}
const jsonBytes=Buffer.from(JSON.stringify(gltf),'utf8');
const paddedLength=(jsonBytes.length+3)&~3;
const next=Buffer.alloc(12+8+paddedLength+(bin.end-bin.header));
next.write('glTF',0,'ascii');next.writeUInt32LE(2,4);next.writeUInt32LE(next.length,8);
next.writeUInt32LE(paddedLength,12);next.writeUInt32LE(0x4e4f534a,16);jsonBytes.copy(next,20);next.fill(0x20,20+jsonBytes.length,20+paddedLength);
data.copy(next,20+paddedLength,bin.header,bin.end);
await mkdir(dirname(output),{recursive:true});
await writeFile(output,next);
console.log(JSON.stringify({sourceHash:hash,candidate:output,candidateBytes:next.length,glassMaterials:changed,geometryAndBinaryChunkByteIdentical:next.subarray(20+paddedLength+8).equals(data.subarray(bin.start,bin.end))},null,2));
