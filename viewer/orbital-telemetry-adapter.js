// Orbital Nexus V70 read-only station adapter.
// Does not access or mutate Three.js scene objects, camera, GLB or DOM.
export function createOrbitalTelemetryAdapter({onStations,onPulse,onDiagnostic,now=()=>Date.now()}={}) {
  if (![onStations,onPulse,onDiagnostic].every(fn=>typeof fn==="function"))
    throw new TypeError("callbacks required");
  const stations=new Map(), seen=new Map();
  let lastEventAt=null;
  const diagnostic=(code,details={})=>onDiagnostic({code,...details});
  return Object.freeze({
    ingestRegistry(payload) {
      if (!Array.isArray(payload?.connectors)) {diagnostic("invalid_registry");return false;}
      const next=new Map();
      for (const c of payload.connectors) {
        if (!c || typeof c.id!=="string" || !/^[a-z0-9-]{1,64}$/.test(c.id) ||
          typeof c.stationId!=="string" || !/^[a-z0-9-]{1,64}$/.test(c.stationId) ||
          !["unconnected","configured","connected","disconnected","error"].includes(c.status) ||
          next.has(c.id)) {diagnostic("invalid_registry");return false;}
        next.set(c.id,{id:c.id,stationId:c.stationId,name:String(c.name||c.id).slice(0,80),
          status:c.status,connected:c.status==="connected"&&c.connected===true});
      }
      stations.clear();
      for(const [id,station] of next)stations.set(id,station);
      onStations([...stations.values()]);
      return true;
    },
    ingestEvent(event) {
      if(event?.schema!=="neural-grid/event/v1" ||
        typeof event.eventId!=="string" || !/^[a-zA-Z0-9-]{8,80}$/.test(event.eventId) ||
        typeof event.source!=="string" || typeof event.type!=="string") {
        diagnostic("invalid_event");return false;
      }
      const source=stations.get(event.source);
      if(!source) {diagnostic("unknown_source",{source:event.source.slice(0,64)});return false;}
      const t=now();
      for(const [id,at] of seen)if(t-at>300000)seen.delete(id);
      if(seen.has(event.eventId))return false;
      seen.set(event.eventId,t);
      if(seen.size>500)seen.delete(seen.keys().next().value);
      lastEventAt=t;
      const verifiedLink=event.routing?.verifiedAppToApp===true &&
        stations.has(event.destination) &&
        event.routing.sourceConnectorId===event.source &&
        event.routing.destinationConnectorId===event.destination;
      onPulse({stationId:source.stationId,type:event.type,eventId:event.eventId,
        targetStationId:verifiedLink?stations.get(event.destination).stationId:null,
        verifiedLink,observedAt:t});
      return true;
    },
    snapshot(){return {stations:[...stations.values()],lastEventAt};}
  });
}
