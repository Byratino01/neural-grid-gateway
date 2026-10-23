import test from "node:test";
import assert from "node:assert/strict";
import {createOrbitalTelemetryAdapter} from "../viewer/orbital-telemetry-adapter.js";

test("V70 adapter maps registered stations without changing scene objects",()=>{
  const stations=[],pulses=[],diagnostics=[];
  const a=createOrbitalTelemetryAdapter({onStations:x=>stations.push(x),onPulse:x=>pulses.push(x),onDiagnostic:x=>diagnostics.push(x),now:()=>100});
  assert.equal(a.ingestRegistry({connectors:[{id:"github",stationId:"github",status:"configured"},{id:"render",stationId:"render",status:"unconnected"}]}),true);
  assert.equal(stations[0].length,2);
  assert.equal(stations[0][0].connected,false);
  const event={schema:"neural-grid/event/v1",eventId:"event-123456",source:"github",destination:"render",type:"github.workflow.success"};
  assert.equal(a.ingestEvent(event),true);
  assert.equal(pulses[0].stationId,"github");
  assert.equal(pulses[0].targetStationId,null);
  assert.equal(pulses[0].verifiedLink,false);
  assert.equal(a.ingestEvent(event),false);
  assert.equal(pulses.length,1);
  assert.equal(a.ingestEvent({...event,eventId:"event-222222",source:"unknown"}),false);
  assert.equal(diagnostics[0].code,"unknown_source");
});
test("V70 adapter rejects malformed registry and events",()=>{
  const diagnostics=[];
  const a=createOrbitalTelemetryAdapter({onStations:()=>{},onPulse:()=>{},onDiagnostic:x=>diagnostics.push(x)});
  assert.equal(a.ingestRegistry({connectors:[{id:"Bad ID",stationId:"github",status:"connected"}]}),false);
  assert.equal(a.ingestEvent({schema:"wrong"}),false);
  assert.deepEqual(diagnostics.map(x=>x.code),["invalid_registry","invalid_event"]);
});
