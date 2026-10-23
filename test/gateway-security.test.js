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
async function withGateway(run,environment={}) {
  const port=await freePort();
  const secret="github-test-secret";
  const token="viewer-test-token";
  const child=spawn(process.execPath,["server.js"],{
    cwd:process.cwd(),
    env:{...process.env,PORT:String(port),GITHUB_WEBHOOK_SECRET:secret,
      TELEMETRY_SESSION_ISSUER_KEY:"issuer-test-key",TELEMETRY_SESSION_SIGNING_KEY:"signing-test-key",CORS_ORIGIN:"https://viewer.example",
      GATEWAY_TOKEN:"execution-token",OPENAI_API_KEY:"fake",OPENAI_ADMIN_KEY:"",NEURAL_GRID_MODE:"execution",...environment},
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
    const issue=async(origin="https://viewer.example")=>{
      const r=await fetch(`http://127.0.0.1:${port}/api/telemetry/sessions`,{
        method:"POST",headers:{authorization:"Bearer issuer-test-key","content-type":"application/json"},
        body:JSON.stringify({origin})
      });
      assert.equal(r.status,201);
      const body=await r.json();
      assert.equal(body.expiresIn,900);
      const payload=JSON.parse(Buffer.from(body.token.split(".")[0],"base64url").toString("utf8"));
      assert.equal(payload.exp-payload.iat,900);
      return body.token;
    };
    await run({issue,url:`http://127.0.0.1:${port}`,port,secret,token});
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
function signedSession(claims,key="signing-test-key") {
  const payload=Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature=crypto.createHmac("sha256",key).update(payload).digest("base64url");
  return payload+"."+signature;
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
test("OpenAI usage endpoint requires a read-only viewer session and exposes no write route",async()=>{
  await withGateway(async({url,issue})=>{
    assert.equal((await fetch(url+"/api/openai/telemetry")).status,401);
    const token=await issue();
    const response=await fetch(url+"/api/openai/telemetry",{headers:{authorization:"Bearer "+token,origin:"https://viewer.example"}});
    assert.equal(response.status,200);
    const body=await response.json();
    assert.equal(body.status,"unconnected");
    assert.equal(body.verified,false);
    assert.equal(JSON.stringify(body).includes("fake"),false,"no API credential is included in telemetry");
    assert.equal((await fetch(url+"/api/openai/telemetry",{method:"POST",headers:{authorization:"Bearer "+token,origin:"https://viewer.example"}})).status,404);
    assert.equal((await fetch(url+"/api/openai/task",{method:"POST",headers:{authorization:"Bearer "+token,origin:"https://viewer.example"}})).status,403);
  },{OPENAI_API_KEY:"fake",OPENAI_ADMIN_KEY:""});
});
test("history endpoint rejects unauthenticated and invalid credentials",async()=>{
  await withGateway(async({url,issue})=>{
    assert.equal((await fetch(url+"/api/telemetry/history")).status,401);
    assert.equal((await fetch(url+"/api/telemetry/history",{headers:{authorization:"Bearer wrong",origin:"https://viewer.example"}})).status,401);
    const session=await issue();
    const ok=await fetch(url+"/api/telemetry/history",{headers:{authorization:"Bearer "+session,origin:"https://viewer.example"}});
    assert.equal(ok.status,200);
    assert.deepEqual((await ok.json()).events,[]);
    const badOrigin=await fetch(url+"/api/telemetry/history",{headers:{authorization:"Bearer "+session,origin:"https://attacker.example"}});
    assert.equal(badOrigin.status,403);
    const sameOrigin=await fetch(url+"/api/telemetry/history",{headers:{authorization:"Bearer "+session,
      referer:"https://viewer.example/", "sec-fetch-site":"same-origin"}});
    assert.equal(sameOrigin.status,200,"same-origin browser GET may authenticate through Fetch Metadata and Referer");
    const noOriginContext=await fetch(url+"/api/telemetry/history",{headers:{authorization:"Bearer "+session}});
    assert.equal(noOriginContext.status,401,"missing origin and same-origin context rejected");
  });
});
test("signed webhook emits sanitized metadata and rejects duplicates",async()=>{
  await withGateway(async({url,secret,issue})=>{
    const payload={action:"completed",repository:{full_name:"org/example"},workflow_run:{name:"CI",conclusion:"success"}};
    const first=await webhook({url,secret,delivery:"delivery-123456",payload});
    assert.equal(first.status,202);
    const again=await webhook({url,secret,delivery:"delivery-123456",payload});
    assert.equal(again.status,200);
    assert.equal((await again.json()).duplicate,true);
    const bad=await webhook({url,secret,delivery:"delivery-999999",payload,valid:false});
    assert.equal(bad.status,401);
    const session=await issue();
    const history=await (await fetch(url+"/api/telemetry/history",{headers:{authorization:"Bearer "+session,origin:"https://viewer.example"}})).json();
    assert.equal(history.events.length,1);
    assert.equal(history.events[0].type,"github.workflow.success");
    assert.equal(history.events[0].metadata.repository,"org/example");
    assert.equal(history.events[0].metadata.conclusion,"success");
    assert.equal(history.events[0].correlationId,"delivery-123456");
  });
});
test("websocket refuses missing token and accepts valid scoped subscription",async()=>{
  await withGateway(async({port,issue,url})=>{
    const connect=(protocols)=>new Promise(resolve=>{
      const ws=new WebSocket(`ws://127.0.0.1:${port}/events`,protocols,{origin:"https://viewer.example",handshakeTimeout:2000});
      ws.once("message",message=>{ws.close();resolve({ok:true,event:JSON.parse(String(message))});});
      ws.once("error",()=>resolve({ok:false}));
      ws.once("close",()=>resolve({ok:false}));
    });
    assert.equal((await connect(["neural-grid-telemetry-v1"])).ok,false);
    const session=await issue();
    const unauthorized=await fetch(url+"/api/events/ticket",{method:"POST",headers:{origin:"https://viewer.example"}});
    assert.equal(unauthorized.status,401);
    const response=await fetch(url+"/api/events/ticket",{method:"POST",headers:{authorization:"Bearer "+session,origin:"https://viewer.example"}});
    assert.equal(response.status,201);
    const {ticket}=await response.json();
    assert.match(ticket,/^[A-Za-z0-9_-]{43}$/);
    const accepted=await connect(["neural-grid-telemetry-v1","ng-ticket."+ticket]);
    assert.equal((await connect(["neural-grid-telemetry-v1","ng-ticket."+ticket])).ok,false,"single-use ticket rejects replay");
    assert.equal(accepted.ok,true);
    assert.equal(accepted.event.type,"connector.connected");
  });
});

test("issuer quota is independent from high-volume viewer traffic",async()=>{
  await withGateway(async({url,issue})=>{
    const responses=await Promise.all(Array.from({length:120},()=>fetch(url+"/health")));
    assert.ok(responses.every(response=>response.status===200),"bounded viewer traffic remains available");
    const session=await issue();
    assert.ok(session,"trusted session issuance is not starved by viewer traffic");
  });
});
test("session issuance is server-only and bound to approved origin",async()=>{
  await withGateway(async({url,issue})=>{
    const missingKey=await fetch(url+"/api/telemetry/sessions",{method:"POST",
      headers:{"content-type":"application/json"},body:JSON.stringify({origin:"https://viewer.example"})});
    assert.equal(missingKey.status,401,"missing issuer credentials rejected");
    const invalidKey=await fetch(url+"/api/telemetry/sessions",{method:"POST",
      headers:{authorization:"Bearer invalid","content-type":"application/json"},body:JSON.stringify({origin:"https://viewer.example"})});
    assert.equal(invalidKey.status,401,"invalid issuer credentials rejected");
    const denied=await fetch(url+"/api/telemetry/sessions",{method:"POST",
      headers:{"content-type":"application/json",origin:"https://viewer.example"},
      body:JSON.stringify({origin:"https://viewer.example"})});
    assert.equal(denied.status,401);
    const issuanceOriginDenied=await fetch(url+"/api/telemetry/sessions",{method:"POST",
      headers:{authorization:"Bearer issuer-test-key","content-type":"application/json"},
      body:JSON.stringify({origin:"https://attacker.example"})});
    assert.equal(issuanceOriginDenied.status,403,"disallowed viewer origin rejected");
    const token=await issue();
    const deniedOrigin=await fetch(url+"/api/telemetry/history",{headers:{
      authorization:"Bearer "+token,origin:"https://attacker.example"}});
    assert.equal(deniedOrigin.status,403);
    const malformed=await fetch(url+"/api/telemetry/history",{headers:{
      authorization:"Bearer "+token+"corrupt",origin:"https://viewer.example"}});
    assert.equal(malformed.status,401);
  });
});

test("session scope, signature, and server-side expiration are enforced",async()=>{
  await withGateway(async({url,issue})=>{
    const valid=await issue();
    const claims=JSON.parse(Buffer.from(valid.split(".")[0],"base64url").toString("utf8"));
    assert.equal(claims.scope,"telemetry:read");
    assert.equal(claims.origin,"https://viewer.example");
    assert.equal(claims.exp-claims.iat,900);
    const request=token=>fetch(url+"/api/telemetry/history",{headers:{
      authorization:"Bearer "+token,origin:"https://viewer.example"}});
    assert.equal((await request(signedSession({...claims,scope:"telemetry:write"}))).status,401,
      "write scope is not accepted");
    assert.equal((await request(signedSession({...claims,exp:Math.floor(Date.now()/1000)-1}))).status,401,
      "expired token is rejected server-side");
    const [payload,signature]=valid.split(".");
    const corrupted=Buffer.from(signature,"base64url");
    corrupted[0]^=0x01;
    const tamperedSignature=corrupted.toString("base64url");
    assert.equal((await request(payload+"."+tamperedSignature)).status,401,
      "incorrect signature is rejected");
  });
});

