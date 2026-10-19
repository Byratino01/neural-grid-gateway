import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";

const modelPath=new URL("../viewer/v88.8/orbital-nexus.glb",import.meta.url);
const approvedSha256="a64b5e8c90c42132cd3a12c9fa29d21d5803e64890443cfb8bf7ff1645961cf6";

function parseGlb(buffer) {
  assert.ok(buffer.length>=20,"GLB must contain a header and chunks");
  assert.equal(buffer.toString("ascii",0,4),"glTF","GLB magic");
  assert.equal(buffer.readUInt32LE(4),2,"GLB container version");
  assert.equal(buffer.readUInt32LE(8),buffer.length,"declared GLB length");
  const chunks=[];
  for(let offset=12;offset<buffer.length;){
    assert.ok(offset+8<=buffer.length,"complete GLB chunk header");
    const length=buffer.readUInt32LE(offset),type=buffer.readUInt32LE(offset+4),end=offset+8+length;
    assert.equal(length%4,0,"GLB chunk alignment");
    assert.ok(end<=buffer.length,"GLB chunk within file");
    chunks.push({type,data:buffer.subarray(offset+8,end)});
    offset=end;
  }
  assert.equal(chunks[0]?.type,0x4e4f534a,"JSON must be first chunk");
  assert.equal(chunks.filter(c=>c.type===0x4e4f534a).length,1,"one JSON chunk");
  assert.equal(chunks.filter(c=>c.type===0x004e4942).length,1,"one binary chunk");
  const json=JSON.parse(chunks[0].data.toString("utf8").trim());
  assert.equal(json.asset?.version,"2.0","glTF asset version");
  const bin=chunks.find(c=>c.type===0x004e4942).data;
  assert.ok(json.buffers?.length===1,"one embedded buffer");
  assert.ok(json.buffers[0].byteLength<=bin.length&&bin.length-json.buffers[0].byteLength<4,
    "declared buffer fits the padded BIN chunk");
  for(const [i,view] of (json.bufferViews||[]).entries())
    assert.ok((view.byteOffset||0)+view.byteLength<=bin.length,`bufferView ${i} fits the BIN chunk`);
  for(const [i,accessor] of (json.accessors||[]).entries()) {
    if(accessor.bufferView==null)continue;
    const view=json.bufferViews[accessor.bufferView];
    assert.ok(view,`accessor ${i} references an existing bufferView`);
    const componentBytes=({5120:1,5121:1,5122:2,5123:2,5125:4,5126:4})[accessor.componentType];
    const width=componentBytes*({SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16})[accessor.type];
    const last=(accessor.byteOffset||0)+Math.max(0,accessor.count-1)*(view.byteStride||width)+width;
    assert.ok(componentBytes&&width&&last<=view.byteLength,`accessor ${i} fits its bufferView`);
  }
  assert.ok(json.scenes?.length,"default scene exists");
  assert.ok(json.nodes?.length>0,"scene nodes exist");
  assert.ok(json.meshes?.length>0,"mesh geometry exists");
  assert.ok(json.materials?.length>0,"materials exist");
  assert.ok(json.animations?.length>0,"animation clips exist");
  for(const [i,image] of (json.images||[]).entries()) {
    assert.ok(image.bufferView!=null,`image ${i} is embedded in a bufferView`);
    assert.ok(json.bufferViews[image.bufferView],`image ${i} references an existing bufferView`);
  }
  assert.ok(!(json.buffers||[]).some(x=>x.uri&&!x.uri.startsWith("data:")),"no external buffers");
  assert.ok(!(json.images||[]).some(x=>x.uri&&!x.uri.startsWith("data:")),"no external images");
  return json;
}

test("approved Revision 32 GLB is present and matches its SHA-256 baseline",async()=>{
  const buffer=await readFile(modelPath);
  assert.equal(createHash("sha256").update(buffer).digest("hex"),approvedSha256);
  const json=parseGlb(buffer);
  assert.equal(json.nodes.length,3104);
  assert.equal(json.meshes.length,3076);
  assert.equal(json.materials.length,53);
  assert.equal(json.images.length,2);
  assert.equal(json.animations.length,118);
});
