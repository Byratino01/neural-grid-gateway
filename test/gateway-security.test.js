import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {once} from "node:events";
import net from "node:net";
import crypto from "node:crypto";
import WebSocket from "ws";

async function freePort() {
  const s=net.createServer();
  s.listen(0,"127.0.0.1");
  await once(s,"listening");
  const port=s.address().port;
  await new Promise(resolve=>s.close(resolve));
  return port;
}
async function withGateway(run) {
  const port=await freePort();
  const secret="github-test-secret";
  const token="viewer-test-token";
  const child=spawn(process.execPath,["server.js"],{
    cwd:process.cwd(),
    env:{...process.env,PORT:String(port),GITHUB_WEBHOOK_SECRET:secret,
      TELEMETRY_VIEWER_TOKEN:token,CORS_ORIGIN:"https://viewer.example",
      GATEWAY_TOKEN:"execution-token",OPENAI_API_KEY:"fake",NEURAL_GRID_MODE:"execution"},
    stdio:"ignore"
  });
  try {
    let ready=false;
    for(let i=0;i<80;i++){
      if(child.exitCode!==null)throw Error("gateway terminated");
      try {
        const r=await fetch(`http://127.0.0.1:${port}/health`);
        if(r.ok){ready=true;break;}
      } catch {}
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    assert.ok(ready,"gateway failed to start");
    await run({url:`http://127.0.0.1:${port}`,port,secret,token});
  } finally {
    child.kill();
    if(child.exitCode===null)await Promise.race([once(child,"exit"),new Promise(resolve=>setTimeout(resolve,1000))]);
  }
}
function webhook({url,secret,delivery,payload,valid=true}) {
  const raw=JSON.stringify(payload);
  const digest=crypto.createHmac("sha256",valid?secret:"wrong-secret").update(raw).digest("hex");
  return fetch(url+"/webhooks/github",{method:"POST",
    headers:{"content-type":"application/json","x-hub-signature-256":"sha256="+digest,
      "x-github-delivery":delivery,"x-github-event":"workflow_run"},body:raw});
}
test("execution disabled even when environment requests execution",async()=>{
  await withGateway(async({url})=>{
    const health=await (await fetch(url+"/health")).json();
    assert.equal(health.mode,"monitor");
    assert.equal(health.executionEnabled,false);
    const r=await fetch(url+"/api/openai/task",{method:"POST",
      headers:{"x-gateway-token":"execution-token","content-type":"application/json"},
      body:JSON.stringify({prompt:"run"})});
    assert.equal(r.status,403);
    assert.equal((await r.json()).error,"execution_disabled");
  });
});
test("history endpoint rejects unauthenticated and invalid credentials",async()=>{
  await withGateway(async({url,token})=>{
    assert.equal((await fetch(url+"/api/telemetry/history")).status,401);
    assert.equal((await fetch(url+"/api/telemetry/history",{headers:{"x-telemetry-token":"wrong"}})).status,401);
    const ok=await fetch(url+"/api/telemetry/history",{headers:{"x-telemetry-token":token}});
    assert.equal(ok.status,200);
    assert.deepEqual((await ok.json()).events,[]);
    const badOrigin=await fetch(url+"/api/telemetry/history",{headers:{"x-telemetry-token":token,origin:"https://attacker.example"}});
    assert.equal(badOrigin.status,403);
  });
});
test("signed webhook emits sanitized metadata and rejects duplicates",async()=>{
  await withGateway(async({url,secret,token})=>{
    const payload={action:"completed",repository:{full_name:"org/example"},workflow_run:{name:"CI",conclusion:"success"}};
    const first=await webhook({url,secret,delivery:"delivery-123456",payload});
    assert.equal(first.status,202);
    const again=await webhook({url,secret,delivery:"delivery-123456",payload});
    assert.equal(again.status,200);
    assert.equal((await again.json()).duplicate,true);
    const bad=await webhook({url,secret,delivery:"delivery-999999",payload,valid:false});
    assert.equal(bad.status,401);
    const history=await (await fetch(url+"/api/telemetry/history",{headers:{"x-telemetry-token":token}})).json();
    assert.equal(history.events.length,1);
    assert.equal(history.events[0].type,"github.workflow.success");
    assert.equal(history.events[0].metadata.repository,"org/example");
    assert.equal(history.events[0].metadata.conclusion,"success");
    assert.equal(history.events[0].correlationId,"delivery-123456");
  });
});
test("websocket refuses missing token and accepts valid scoped subscription",async()=>{
  await withGateway(async({port,token})=>{
    const connect=(protocols)=>new Promise(resolve=>{
      const ws=new WebSocket(`ws://127.0.0.1:${port}/events`,protocols,{origin:"https://viewer.example",handshakeTimeout:2000});
      ws.once("message",message=>{ws.close();resolve({ok:true,event:JSON.parse(String(message))});});
      ws.once("error",()=>resolve({ok:false}));
      ws.once("close",()=>resolve({ok:false}));
    });
    assert.equal((await connect(["neural-grid-telemetry-v1"])).ok,false);
    const accepted=await connect(["neural-grid-telemetry-v1","ng-auth."+token]);
    assert.equal(accepted.ok,true);
    assert.equal(accepted.event.type,"connector.connected");
  });
});
