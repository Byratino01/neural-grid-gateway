import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {once} from "node:events";
import net from "node:net";
import crypto from "node:crypto";
import WebSocket from "ws";

async function portAvailable(){
  const server=net.createServer();
  server.listen(0,"127.0.0.1");
  await once(server,"listening");
  const port=server.address().port;
  await new Promise(resolve=>server.close(resolve));
  return port;
}
async function gateway(fn){
  const port=await portAvailable();
  const secret="staging-fixture-secret";
  const child=spawn(process.execPath,["server.js"],{
    env:{...process.env,PORT:String(port),GITHUB_WEBHOOK_SECRET:secret,
      TELEMETRY_SESSION_ISSUER_KEY:"fixture-issuer",TELEMETRY_SESSION_SIGNING_KEY:"fixture-signing",
      CORS_ORIGIN:"https://staging-viewer.example"},stdio:"ignore"
  });
  try{
    let ready=false;
    for(let i=0;i<80;i++){
      if(child.exitCode!==null)throw Error("gateway exited");
      try{const r=await fetch(`http://127.0.0.1:${port}/health`);if(r.ok){ready=true;break;}}catch{}
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    assert.ok(ready,"staging fixture gateway did not start");
    await fn({url:`http://127.0.0.1:${port}`,port,secret});
  }finally{
    child.kill();
    if(child.exitCode===null)await Promise.race([once(child,"exit"),new Promise(resolve=>setTimeout(resolve,1000))]);
  }
}
test("staging fixture: signed GitHub event reaches scoped read-only WebSocket once",async()=>{
  await gateway(async({url,port,secret})=>{
    const health=await (await fetch(url+"/health")).json();
    assert.equal(health.mode,"monitor");
    assert.equal(health.executionEnabled,false);
    assert.equal((await fetch(url+"/api/connectors")).status,401);
    const issuance=await fetch(url+"/api/telemetry/sessions",{method:"POST",
      headers:{authorization:"Bearer fixture-issuer","content-type":"application/json"},
      body:JSON.stringify({origin:"https://staging-viewer.example"})});
    assert.equal(issuance.status,201);
    const {token}=await issuance.json();
    const registryResponse=await fetch(url+"/api/connectors",{headers:{
      authorization:"Bearer "+token,origin:"https://staging-viewer.example"}});
    assert.equal(registryResponse.status,200);
    const registry=await registryResponse.json();
    assert.equal(registry.mode,"monitor");
    assert.equal(registry.connectors.find(c=>c.id==="github").connected,false);
    const ticketResponse=await fetch(url+"/api/events/ticket",{method:"POST",headers:{
      authorization:"Bearer "+token,origin:"https://staging-viewer.example"}});
    assert.equal(ticketResponse.status,201);
    const {ticket}=await ticketResponse.json();
    assert.match(ticket,/^[A-Za-z0-9_-]{43}$/);
    const ws=new WebSocket(`ws://127.0.0.1:${port}/events`,
      ["neural-grid-telemetry-v1","ng-ticket."+ticket],{origin:"https://staging-viewer.example"});
    try{
      await Promise.race([once(ws,"open"),new Promise((_,reject)=>setTimeout(()=>reject(Error("socket timeout")),3000))]);
      const messages=[];
      ws.on("message",data=>messages.push(JSON.parse(String(data))));
      const payload=JSON.stringify({action:"completed",repository:{full_name:"fixture/test"},
        workflow_run:{name:"CI",conclusion:"success"}});
      const signature=crypto.createHmac("sha256",secret).update(payload).digest("hex");
      const send=()=>fetch(url+"/webhooks/github",{method:"POST",
        headers:{"content-type":"application/json","x-hub-signature-256":"sha256="+signature,
          "x-github-delivery":"fixture-delivery-001","x-github-event":"workflow_run"},body:payload});
      assert.equal((await send()).status,202);
      assert.equal((await send()).status,200);
      for(let i=0;i<40&&!messages.some(e=>e.type==="github.workflow.success");i++)
        await new Promise(resolve=>setTimeout(resolve,25));
      const observed=messages.filter(e=>e.type==="github.workflow.success");
      assert.equal(observed.length,1);
      assert.equal(observed[0].source,"github");
      assert.equal(observed[0].routing.verifiedAppToApp,false);
      const denied=await fetch(url+"/api/openai/task",{method:"POST"});
      assert.equal(denied.status,403);
    }finally{ws.close();}
  });
});
