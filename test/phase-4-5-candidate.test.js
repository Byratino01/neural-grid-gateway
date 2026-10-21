import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';

const root=new URL('../viewer/v88.8/',import.meta.url);
const originalPath=new URL('orbital-nexus.glb',root);
const candidatePath=new URL('candidates/orbital-nexus-phase-4-5-candidate.glb',root);
const approvedHash='a64b5e8c90c42132cd3a12c9fa29d21d5803e64890443cfb8bf7ff1645961cf6';
function unpack(buffer){
 assert.equal(buffer.toString('ascii',0,4),'glTF');assert.equal(buffer.readUInt32LE(4),2);assert.equal(buffer.readUInt32LE(8),buffer.length);
 const chunks=[];for(let at=12;at<buffer.length;){const length=buffer.readUInt32LE(at),type=buffer.readUInt32LE(at+4),start=at+8,end=start+length;assert.equal(length%4,0);assert.ok(end<=buffer.length);chunks.push({type,start,end,bytes:buffer.subarray(start,end)});at=end;}
 assert.equal(chunks.filter(c=>c.type===0x4e4f534a).length,1);assert.equal(chunks.filter(c=>c.type===0x004e4942).length,1);
 const jc=chunks.find(c=>c.type===0x4e4f534a),bc=chunks.find(c=>c.type===0x004e4942);
 return {json:JSON.parse(jc.bytes.toString('utf8').trim()),bin:bc.bytes};
}

test('Phase 4.5 candidate changes only approved glass material JSON and preserves the source GLB',async()=>{
 const [originalBuffer,candidateBuffer]=await Promise.all([readFile(originalPath),readFile(candidatePath)]);
 assert.equal(createHash('sha256').update(originalBuffer).digest('hex'),approvedHash);
 const original=unpack(originalBuffer),candidate=unpack(candidateBuffer);
 assert.deepEqual(candidate.bin,original.bin,'all geometry, animation, and embedded texture bytes are byte-identical');
 assert.deepEqual(candidate.json.nodes,original.json.nodes,'node IDs, transforms, hierarchy and station mappings are unchanged');
 assert.deepEqual(candidate.json.meshes,original.json.meshes,'mesh and material assignments are unchanged');
 assert.deepEqual(candidate.json.animations,original.json.animations,'animation tracks are unchanged');
 assert.deepEqual(candidate.json.accessors,original.json.accessors);
 assert.deepEqual(candidate.json.bufferViews,original.json.bufferViews);
 assert.deepEqual(candidate.json.images,original.json.images);
 assert.deepEqual(candidate.json.textures,original.json.textures);
 for(const name of ['R13_glass_blue','V7_optical_cyan_glass']){
  const mat=candidate.json.materials.find(m=>m.name===name);assert.ok(mat,`candidate retains ${name}`);
  assert.equal(mat.extensions?.KHR_materials_transmission,undefined,`${name} has no transmission`);
  assert.equal(mat.alphaMode,'BLEND');assert.equal(mat.pbrMetallicRoughness.roughnessFactor,0.24);assert.equal(mat.pbrMetallicRoughness.metallicFactor,0.12);assert.equal(mat.pbrMetallicRoughness.baseColorFactor[3],0.38);
 }
 const normalized=structuredClone(candidate.json);
 for(let i=0;i<normalized.materials.length;i++)normalized.materials[i]=original.json.materials[i];
 normalized.extensionsUsed=original.json.extensionsUsed;
 if(original.json.extensionsRequired===undefined)delete normalized.extensionsRequired;else normalized.extensionsRequired=original.json.extensionsRequired;
 assert.deepEqual(normalized,original.json,'all non-glass glTF metadata is unchanged');
 assert.equal(candidate.json.nodes.length,3104);assert.equal(candidate.json.meshes.length,3076);assert.equal(candidate.json.animations.length,118);assert.equal(candidate.json.images.length,2);
});

test('viewer defaults to the candidate and rollback explicitly loads the approved model',async()=>{
 const html=await readFile(new URL('../viewer/v88.8/v70.html',import.meta.url),'utf8');
 assert.match(html,/const rollbackAsset=assetChoice==='rollback'\|\|assetChoice==='original'/);
 assert.match(html,/const bundledAsset=rollbackAsset\?'.\/orbital-nexus\.glb':'.\/candidates\/orbital-nexus-phase-4-5-candidate\.glb'/);
 assert.match(html,/const bundledFilename=rollbackAsset\?'orbital-nexus\.glb':'orbital-nexus-phase-4-5-candidate\.glb'/);
});
