import test from "node:test";
import assert from "node:assert/strict";
import {listConnectors,routeConnectorEvent} from "../connector-registry.js";

test("registry starts with no verified connections",()=>{
  const entries=listConnectors();
  assert.deepEqual(entries.map(x=>x.id),["github","render","netlify","chatgpt","truck-scanner"]);
  assert.ok(entries.every(x=>x.status==="unconnected" && x.connected===false && x.lastObservedAt===null));
  assert.equal(new Set(entries.map(x=>x.stationId)).size,entries.length);
  assert.ok(entries.every(x=>Array.isArray(x.supportedEvents)));
  assert.deepEqual(entries.map(x=>x.name),["GitHub","Render","Netlify","OpenAI API","Truck Scanner"]);
  assert.deepEqual(entries.find(x=>x.id==="chatgpt").supportedEvents,["openai.api.usage.*"]);
  assert.equal(entries.find(x=>x.id==="chatgpt").transport,"openai_read_only_api");
  assert.ok(entries.filter(x=>x.id!=="truck-scanner").every(x=>typeof x.icon==="string"));
  assert.equal(entries.find(x=>x.id==="truck-scanner").icon,null);
});
test("configured webhook is not proof of live connection",()=>{
  const entries=listConnectors({githubWebhookConfigured:true});
  assert.equal(entries[0].status,"configured");
  assert.equal(entries[0].connected,false);
  assert.ok(entries.slice(1).every(x=>x.status==="unconnected"));
});
test("routing is conservative and rejects fabricated links",()=>{
  const e=routeConnectorEvent({source:"github",destination:"render"});
  assert.equal(e.sourceStationId,"github");
  assert.equal(e.destinationStationId,"render");
  assert.equal(e.verifiedAppToApp,false);
  const openAiUsage=routeConnectorEvent({source:"chatgpt",destination:"github"});
  assert.equal(openAiUsage.sourceConnectorId,"chatgpt");
  assert.equal(openAiUsage.verifiedAppToApp,false,"OpenAI usage data never proves an app-to-app interaction");
  const unknown=routeConnectorEvent({source:"unknown",destination:"neural-grid"});
  assert.equal(unknown.sourceStationId,null);
  assert.equal(unknown.destinationStationId,null);
});
