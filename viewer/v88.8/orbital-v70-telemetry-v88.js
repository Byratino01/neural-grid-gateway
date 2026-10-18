// Orbital Nexus V70 read-only telemetry adapter.
// Import into the existing viewer; never modify GLB geometry, station transforms or camera.
export function createTelemetryAdapter({baseUrl,origin,requestSession,onState,onEvent,WebSocketClass=globalThis.WebSocket,fetchFn=globalThis.fetch}) {
  if (!/^https:\/\//.test(baseUrl)) throw Error("HTTPS gateway required");
  if (typeof requestSession!=="function") throw Error("Trusted session provider required");
  const state={status:"disconnected",connectors:[],lastEventAt:null,error:null};
  let socket=null,stopped=false,epoch=0;
  const publish=()=>onState?.({...state,connectors:state.connectors.map(c=>({...c}))});
  const authHeaders=token=>({authorization:"Bearer "+token});
  async function connect() {
    const attempt=++epoch;
    stopped=false;
    if(socket) {socket.close();socket=null;}
    state.status="connecting";state.error=null;publish();
    try {
      // requestSession must use an authenticated backend. Never ship issuer secrets to browsers.
      const token=await requestSession();
      if(stopped||attempt!==epoch)return;
      if(typeof token!=="string"||!token)throw Error("Session unavailable");
      const response=await fetchFn(baseUrl+"/api/connectors",{headers:authHeaders(token),cache:"no-store"});
      if(!response.ok)throw Error("Registry HTTP "+response.status);
      const registry=await response.json();
      if(stopped||attempt!==epoch)return;
      state.connectors=Array.isArray(registry.connectors)?registry.connectors:[];
      publish();
      const historyResponse=await fetchFn(baseUrl+"/api/telemetry/history",{headers:authHeaders(token),cache:"no-store"});
      if(!historyResponse.ok)throw Error("History HTTP "+historyResponse.status);
      const history=await historyResponse.json();
      if(stopped||attempt!==epoch)return;
      if(Array.isArray(history.events))for(const event of history.events)onEvent?.(event);
      const url=baseUrl.replace(/^https:/,"wss:")+"/events";
      socket=new WebSocketClass(url,["neural-grid-telemetry-v1","ng-auth."+token]);
      socket.onopen=()=>{if(!stopped&&attempt===epoch){state.status="connected";publish();}};
      socket.onmessage=e=>{
        if(stopped||attempt!==epoch)return;
        try {
          const event=JSON.parse(e.data);
          if(event?.schema!=="neural-grid/event/v1")return;
          state.lastEventAt=event.timestamp||null;
          onEvent?.(event);
          publish();
        } catch { /* discard malformed telemetry */ }
      };
      socket.onerror=()=>{if(!stopped&&attempt===epoch){state.status="error";state.error="WebSocket connection failed";publish();}};
      socket.onclose=()=>{if(!stopped&&attempt===epoch){state.status="disconnected";publish();}};
    }catch(e){if(!stopped&&attempt===epoch){state.status="error";state.error=String(e?.message||e);publish();}}
  }
  function disconnect(){stopped=true;epoch++;if(socket){socket.close();socket=null;}state.status="disconnected";publish();}
  return {connect,disconnect,getState:()=>({...state,connectors:state.connectors.map(c=>({...c}))})};
}
