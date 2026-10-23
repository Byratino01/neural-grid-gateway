import test from "node:test";
import assert from "node:assert/strict";
import {createOrbitalTelemetryAdapter} from "../viewer/orbital-telemetry-adapter.js";

test("V74: signed-gateway-shaped event pulses only the source station",()=>{
 const pulses=[],diagnostics=[];
 const adapter=createOrbitalTelemetryAdapter({
  onStations:()=>{},onPulse:p=>pulses.push(p),onDiagnostic:d=>diagnostics.push(d),
  now:()=>1000
 });
 assert.equal(adapter.ingestRegistry({connectors:[
  {id:"github",stationId:"github",status:"configured",connected:false},
  {id:"render",stationId:"render",status:"unconnected",connected:false}
 ]}),true);
 const event={schema:"neural-grid/event/v1",eventId:"fixture-event-0001",
  timestamp:"2026-10-17T00:00:00.000Z",type:"github.workflow.success",
  source:"github",destination:"neural-grid",origin:"external",
  routing:{sourceConnectorId:"github",sourceStationId:"github",
   destinationConnectorId:null,destinationStationId:null,verifiedAppToApp:false},
  metadata:{repository:"fixture/test",conclusion:"success"}};
 assert.equal(adapter.ingestEvent(event),true);
 assert.equal(adapter.ingestEvent(event),false);
 assert.equal(pulses.length,1);
 assert.equal(pulses[0].stationId,"github");
 assert.equal(pulses[0].verifiedLink,false);
 assert.equal(pulses[0].targetStationId,null);
 assert.equal(adapter.snapshot().stations.find(x=>x.id==="github").connected,false);
 assert.equal(diagnostics.length,0);
});
test("V74: unknown source cannot pulse a station",()=>{
 const pulses=[];
 const adapter=createOrbitalTelemetryAdapter({
  onStations:()=>{},onPulse:p=>pulses.push(p),onDiagnostic:()=>{}
 });
 adapter.ingestRegistry({connectors:[{id:"github",stationId:"github",status:"unconnected"}]});
 assert.equal(adapter.ingestEvent({schema:"neural-grid/event/v1",eventId:"fixture-event-0002",
  source:"unknown",type:"github.workflow.success"}),false);
 assert.equal(pulses.length,0);
});
