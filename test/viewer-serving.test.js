import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {once} from "node:events";
import net from "node:net";
import {createHash} from "node:crypto";

async function freePort(){
  const server=net.createServer();server.listen(0,"127.0.0.1");await once(server,"listening");
  const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;
}
async function withGateway(run){
  const port=await freePort();
  const child=spawn(process.execPath,["server.js"],{cwd:process.cwd(),env:{...process.env,PORT:String(port)},stdio:"ignore"});
  try{
    let ready=false;
    for(let i=0;i<80;i++){
      if(child.exitCode!==null)throw Error("gateway terminated");
      try{const response=await fetch(`http://127.0.0.1:${port}/health`);if(response.ok){ready=true;break}}catch{}
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    assert.ok(ready,"gateway failed to start");
    await run(`http://127.0.0.1:${port}`);
  }finally{child.kill();if(child.exitCode===null)await Promise.race([once(child,"exit"),new Promise(resolve=>setTimeout(resolve,1000))])}
}

test("viewer entry and approved local assets are served from the isolated viewer directory",async()=>{
  await withGateway(async base=>{
    const page=await fetch(base+"/viewer/");
    assert.equal(page.status,200);assert.match(page.headers.get("content-type"),/text\/html/);
    assert.match(await page.text(),/id="v70-dashboard"/);
    for(const [url,type] of [["/viewer/v70-dashboard.css","text/css"],["/viewer/v70-dashboard.js","text/javascript"],["/viewer/assets/icons/github.svg","image/svg+xml"],["/viewer/vendor/three/build/three.module.js","text/javascript"]]){
      const response=await fetch(base+url);assert.equal(response.status,200,url);assert.ok(response.headers.get("content-type").startsWith(type),url);
    }
    const head=await fetch(base+"/viewer/orbital-nexus.glb",{method:"HEAD"});
    assert.equal(head.status,200,"viewer model HEAD request");
    assert.equal(head.headers.get("content-type"),"model/gltf-binary");
    assert.equal(head.headers.get("content-length"),"22000596");
    assert.equal(await head.text(),"","HEAD response has no body");
    const model=await fetch(base+"/viewer/orbital-nexus.glb");
    assert.equal(model.status,200,"viewer model GET request");
    assert.equal(createHash("sha256").update(Buffer.from(await model.arrayBuffer())).digest("hex"),
      "a64b5e8c90c42132cd3a12c9fa29d21d5803e64890443cfb8bf7ff1645961cf6","gateway serves the approved GLB bytes");
  });
});

test("viewer static route rejects traversal, encoded traversal, dotfiles and backend files",async()=>{
  await withGateway(async base=>{
    for(const rawPath of ["/viewer/../server.js","/viewer/%2e%2e/server.js","/viewer/%252e%252e/server.js","/viewer/.env","/viewer/package.json","/viewer/server.js"]){
      const response=await fetch(base+rawPath,{redirect:"manual"});assert.equal(response.status,404,rawPath);
    }
  });
});

test("existing gateway health and protected routes remain available",async()=>{
  await withGateway(async base=>{
    const health=await (await fetch(base+"/health")).json();assert.equal(health.executionEnabled,false);assert.equal(health.mode,"monitor");
    assert.equal((await fetch(base+"/api/telemetry/history")).status,401);
    assert.equal((await fetch(base+"/viewer/../../server.js")).status,404);
  });
});
