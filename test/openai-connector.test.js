import test from "node:test";
import assert from "node:assert/strict";
import {createOpenAIConnector} from "../openai-connector.js";
import {readFile} from "node:fs/promises";
import {runInNewContext} from "node:vm";

const browserControllerSource=await readFile(new URL("../viewer/v88.8/openai-usage-v88.js",import.meta.url),"utf8");
const monitorSource=await readFile(new URL("../viewer/v88.8/v71-monitor.js",import.meta.url),"utf8");
const dashboardSource=await readFile(new URL("../viewer/v88.8/v70-dashboard.js",import.meta.url),"utf8");
const now=Date.UTC(2026,9,19,16,30,0);

test("OpenAI connector remains unconnected without a read-only usage credential",async()=>{
  let calls=0;
  const snapshot=await createOpenAIConnector({now:()=>now,fetchFn:async()=>{calls++;throw Error("must not fetch");}}).snapshot();
  assert.equal(calls,0);
  assert.equal(snapshot.status,"unconnected");
  assert.equal(snapshot.verified,false);
  assert.equal(snapshot.usage.status,"not_configured");
});

test("OpenAI connector reads only daily provider usage and returns sanitized grouped metrics",async()=>{
  const adminKey="admin-secret-test-value";
  let request;
  const connector=createOpenAIConnector({adminKey,now:()=>now,fetchFn:async(url,options)=>{
    request={url:String(url),options};
    return {ok:true,status:200,json:async()=>({data:[{start_time:Date.UTC(2026,9,19)/1000,end_time:now/1000,
      results:[{model:"gpt-test",num_model_requests:7,input_tokens:120,output_tokens:45,input_cached_tokens:20},
        {model:"gpt-second",num_model_requests:2,input_tokens:30,output_tokens:10}]}]})};
  }});
  const snapshot=await connector.snapshot();
  const url=new URL(request.url);
  assert.equal(url.origin,"https://api.openai.com");
  assert.equal(url.pathname,"/v1/organization/usage/completions");
  assert.equal(url.searchParams.get("start_time"),String(Date.UTC(2026,9,19)/1000));
  assert.equal(url.searchParams.get("end_time"),String(now/1000));
  assert.equal(url.searchParams.get("bucket_width"),"1d");
  assert.equal(url.searchParams.get("group_by"),"model");
  assert.equal(request.options.method,"GET");
  assert.equal(request.options.redirect,"error");
  assert.equal(request.options.headers.Authorization,"Bearer "+adminKey);
  assert.equal(snapshot.status,"connected");
  assert.equal(snapshot.verified,true);
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot.usage.records)),[
    {model:"gpt-test",requests:7,inputTokens:120,outputTokens:45,cachedInputTokens:20},
    {model:"gpt-second",requests:2,inputTokens:30,outputTokens:10,cachedInputTokens:null}
  ]);
  assert.equal(JSON.stringify(snapshot).includes(adminKey),false);
  assert.equal(JSON.stringify(snapshot).includes("ChatGPT account"),true);
});

test("provider authorization and transport failures are explicit without echoing provider bodies",async t=>{
  for(const [httpStatus,expected] of [[401,"unauthorized"],[403,"forbidden"],[503,"provider_error"]]){
    await t.test(String(httpStatus),async()=>{
      const snapshot=await createOpenAIConnector({adminKey:"fake-admin",now:()=>now,
        fetchFn:async()=>({ok:false,status:httpStatus,json:async()=>({error:"private-provider-body"})})}).snapshot();
      assert.equal(snapshot.status,"error");
      assert.equal(snapshot.verified,false);
      assert.equal(snapshot.usage.status,expected);
      assert.equal(JSON.stringify(snapshot).includes("private-provider-body"),false);
    });
  }
  const network=await createOpenAIConnector({adminKey:"fake-admin",now:()=>now,
    fetchFn:async()=>{throw Error("private network detail");}}).snapshot();
  assert.equal(network.usage.status,"unavailable");
  assert.equal(JSON.stringify(network).includes("private network detail"),false);
});

test("browser accepts sanitized usage snapshots but never turns them into interaction events",()=>{
  const events=[];
  const context={document:{dispatchEvent:event=>events.push(event)},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}}};
  runInNewContext(browserControllerSource,context);
  const controller=context.__NG_OPENAI_USAGE;
  assert.equal(controller.ingest({provider:"openai_api"}),false);
  assert.equal(controller.ingest({schema:"neural-grid/openai-usage/v1",provider:"openai_api",status:"connected",verified:true,
    observedAt:new Date(now).toISOString(),usage:{status:"available",bucketWidth:"1d",records:[
      {model:"gpt-test",requests:7,inputTokens:120,outputTokens:45,cachedInputTokens:20},
      {model:"<untrusted>",requests:-1,inputTokens:"bad"}
    ]}}),true);
  const snapshot=controller.snapshot();
  assert.equal(snapshot.verified,true);
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot.usage.records)),[
    {model:"gpt-test",requests:7,inputTokens:120,outputTokens:45,cachedInputTokens:20},
    {model:null,requests:null,inputTokens:null,outputTokens:null,cachedInputTokens:null}
  ]);
  assert.equal("events" in snapshot,false);
  assert.equal("route" in snapshot,false);
  controller.reset();
  assert.equal(controller.snapshot(),null);
  assert.deepEqual(events.map(event=>event.type),["ng:openai-usage","ng:openai-usage"]);
});

test("browser connector never receives the provider credential or creates orbital interaction events",()=>{
  assert.match(monitorSource,/base\+'\/api\/openai\/telemetry'/);
  assert.doesNotMatch(monitorSource,/api\.openai\.com|OPENAI_ADMIN_KEY/);
  assert.match(browserControllerSource,/ng:openai-usage/);
  assert.doesNotMatch(browserControllerSource,/ng:monitor-event|setSignalState|buildRuntimeStream/);
  assert.match(dashboardSource,/ng:openai-usage/);
  assert.match(dashboardSource,/Provider-reported daily aggregate/);
  assert.match(dashboardSource,/Time → · cumulative events/);
});
