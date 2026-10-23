import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {once} from "node:events";
import net from "node:net";

async function freePort() {
  const server=net.createServer();
  server.listen(0,"127.0.0.1");
  await once(server,"listening");
  const port=server.address().port;
  await new Promise(resolve=>server.close(resolve));
  return port;
}
test("monitor mode rejects OpenAI execution even with token and API key",async()=>{
  const port=await freePort();
  const child=spawn(process.execPath,["server.js"],{
    cwd:process.cwd(),
    env:{...process.env,PORT:String(port),GATEWAY_TOKEN:"test-token",OPENAI_API_KEY:"test-not-real",NEURAL_GRID_MODE:"execution"},
    stdio:"ignore"
  });
  try {
    let health;
    for(let i=0;i<50;i++){
      if(child.exitCode!==null)throw Error("gateway terminated");
      try {const r=await fetch(`http://127.0.0.1:${port}/health`);health=await r.json();break;}
      catch {await new Promise(resolve=>setTimeout(resolve,50));}
    }
    assert.ok(health,"server did not start");
    assert.equal(health.mode,"monitor");
    assert.equal(health.executionEnabled,false);
    const r=await fetch(`http://127.0.0.1:${port}/api/openai/task`,{
      method:"POST",headers:{"x-gateway-token":"test-token","content-type":"application/json"},
      body:JSON.stringify({prompt:"Do something"})
    });
    assert.equal(r.status,403);
    assert.deepEqual(await r.json(),{error:"execution_disabled",mode:"monitor"});
  } finally {
    child.kill();
    await Promise.race([once(child,"exit"),new Promise(resolve=>setTimeout(resolve,1000))]);
  }
});
