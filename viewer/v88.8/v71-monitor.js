/* V71 Monitor Mode: browser-only, read-only, no issuer credentials. */
(function () {
'use strict';
// The same-origin registry owns connector identity and display names. Keep a
// tiny fallback so the monitor remains legible if its metadata script fails.
const catalog = Array.isArray(window.__NG_CONNECTORS) ? window.__NG_CONNECTORS : [
  {id:'github',name:'GitHub'}, {id:'render',name:'Render'},
  {id:'netlify',name:'Netlify'}, {id:'chatgpt',name:'OpenAI API'},
  {id:'truck-scanner',name:'Truck Scanner'}
];
const $ = id => document.getElementById(id);
const panel = $('v71-monitor');
if (!panel) return;
const state = $('v71-state'), detail = $('v71-detail'), list = $('v71-connectors');
const start = $('v71-connect'), stop = $('v71-disconnect');
const gatewayInput=$('v80-gateway'), tokenInput=$('v80-token');
const config = window.__NG_MONITOR_CONFIG;
// Browser never stores an issuer key. A manually supplied token must already be
// minted by a trusted server. No connection is initiated without a click.
let pendingToken='';
function gatewayUrl(){return (gatewayInput?.value||config?.baseUrl||'').trim();}
function providerAvailable(){return Boolean(config&&typeof config.requestSession==='function');}

const rows = new Map(), known = new Map();
let socket = null, attempt = 0, active = false, sessionTimer = null, countdownTimer = null, expiresAt = 0;
const seen = new Map();
function status(value, explanation) {
  state.textContent = value.toUpperCase();
  state.dataset.state = value;
  detail.textContent = explanation;
  start.disabled = active;
  stop.disabled = !active;
}
function validConfig() {
  if (!gatewayUrl()) return false;
  try { const u = new URL(gatewayUrl()); const localHttp=u.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(u.hostname);return (u.protocol === 'https:'||localHttp) && !u.username && !u.password && u.pathname === '/' && !u.search && !u.hash; }
  catch { return false; }
}
function addRow(id, name) {
  const row = document.createElement('div'); row.className = 'v71-connector'; row.dataset.connector = id;
  const dot = document.createElement('span'); dot.className = 'v71-dot'; dot.setAttribute('aria-hidden','true');
  const label = document.createElement('span'); label.textContent = name;
  const indicator = document.createElement('strong'); indicator.textContent = 'UNCONNECTED';
  row.append(dot,label,indicator); list.append(row); rows.set(id,{row,indicator});
}
for (const {id,name} of catalog) addRow(id,name);
function setRow(id, value) {
  const entry = rows.get(id); if (!entry) return;
  entry.row.dataset.status = value; entry.indicator.textContent = value.toUpperCase();
}
function clearLive() { document.dispatchEvent(new Event('ng:monitor-reset')); window.__NG_OPENAI_USAGE?.reset(); known.clear(); for (const {id} of catalog) setRow(id,'unconnected'); }
function applyRegistry(payload) {
  if (!payload || !Array.isArray(payload.connectors)) throw Error('Invalid connector registry');
  const next = new Map();
  for (const c of payload.connectors) {
    if (!c || !rows.has(c.id) || next.has(c.id) || c.stationId !== c.id ||
        !['unconnected','configured','connected','disconnected','error'].includes(c.status)) throw Error('Invalid registry entry');
    next.set(c.id, c);
  }
  clearLive();
  for (const [id,c] of next) {
    known.set(id,c);
    // Preserve registry state exactly. A configured endpoint is not a live
    // connection, and errors/disconnections must remain visible to operators.
    setRow(id,c.status === 'connected' && c.connected !== true ? 'error' : c.status);
  }
}
async function refreshOpenAI(base,token,ticket){
  setRow('chatgpt','connecting');
  try{
    const response=await fetch(base+'/api/openai/telemetry',{headers:{Authorization:'Bearer '+token},cache:'no-store',credentials:'omit'});
    if(ticket!==attempt)return;
    if(!response.ok){
      const state=response.status===404?'unconnected':'error';setRow('chatgpt',state);
      window.__NG_OPENAI_USAGE?.reset();return;
    }
    const payload=await response.json();
    if(ticket!==attempt)return;
    if(payload?.schema!=='neural-grid/openai-usage/v1'||payload?.provider!=='openai_api')throw Error('Invalid OpenAI telemetry response');
    const state=payload.status==='connected'&&payload.verified===true?'connected':payload.status==='error'?'error':'unconnected';
    setRow('chatgpt',state);
    window.__NG_OPENAI_USAGE?.ingest(payload);
  }catch{
    if(ticket===attempt){setRow('chatgpt','error');window.__NG_OPENAI_USAGE?.reset();}
  }
}
function pulse(id) {
  const entry = rows.get(id); if (!entry) return;
  entry.row.classList.remove('v71-pulse'); void entry.row.offsetWidth;
  entry.row.classList.add('v71-pulse');
  // Existing physical station controls: presentation only, no click, signal or model mutation.
  const station = document.querySelector('#stations button[data-id="'+id+'"]');
  if (station) {
    station.classList.remove('v71-pulse'); void station.offsetWidth;
    station.classList.add('v71-pulse');
    station.addEventListener('animationend',()=>station.classList.remove('v71-pulse'),{once:true});
  }
}
function ingest(event) {
  if (!event || event.schema !== 'neural-grid/event/v1' ||
      typeof event.eventId !== 'string' || !/^[a-zA-Z0-9-]{8,80}$/.test(event.eventId) ||
      typeof event.source !== 'string' || !known.has(event.source) || typeof event.type !== 'string') return false;
  const now = Date.now();
  for (const [id,t] of seen) if (now-t > 300000) seen.delete(id);
  if (seen.has(event.eventId)) return false;
  seen.set(event.eventId,now); if (seen.size>500) seen.delete(seen.keys().next().value);
  // Read-only observation bus. No workflow actions or scene mutations.
  document.dispatchEvent(new CustomEvent('ng:monitor-event',{detail:event}));
  pulse(event.source);
  const feed = $('v71-last-event');
  feed.textContent = event.source.toUpperCase()+' · '+event.type.slice(0,100)+' · '+new Date(now).toLocaleTimeString();
  // Do not draw a link: a destination label alone is not verified app-to-app communication.
  return true;
}
function disconnect() {
  attempt++; active=false; if (sessionTimer) clearTimeout(sessionTimer); if (countdownTimer) clearInterval(countdownTimer);
  sessionTimer=null; countdownTimer=null; expiresAt=0;
  if (socket) { const previous=socket;socket=null;previous.close(); }
  pendingToken=''; if(tokenInput)tokenInput.value='';
  clearLive(); seen.clear(); status('disconnected','No authenticated telemetry session. All connectors default to unconnected.');
}
async function connect() {
  if (active) return;
  if (!validConfig()){status('error','Enter a valid HTTPS gateway address.');return;}
  const manualToken=tokenInput?.value.trim()||'';
  if (!manualToken&&!providerAvailable()){status('disconnected','Enter a short-lived session token from a trusted issuer to connect. No network request was made.');return;}
  const ticket=++attempt; active=true; status('connecting',manualToken?'Using the manually supplied short-lived read-only session.':'Requesting short-lived read-only session from the configured trusted provider.');
  try {
    const credential=manualToken||await config.requestSession();
    if(tokenInput)tokenInput.value=''; // never retain token in a form field
    if (ticket!==attempt) return;
    const token=typeof credential==='string'?credential:credential?.token;
    const ttl=Number(credential?.expiresIn);
    // Never assume an arbitrary lifetime. Clamp to the gateway's 900-second maximum.
    const lifetime=Number.isFinite(ttl)&&ttl>0?Math.min(900,Math.floor(ttl)):900;
    if (typeof token!=='string' || token.length<16 || token.length>8192) throw Error('Trusted session unavailable');
    const base=gatewayUrl().replace(/\/$/,'');
    const response=await fetch(base+'/api/connectors',{headers:{Authorization:'Bearer '+token},cache:'no-store',credentials:'omit'});
    if (ticket!==attempt) return;
    if (!response.ok) throw Error('Registry HTTP '+response.status);
    applyRegistry(await response.json());
    if (ticket!==attempt) return;
    // Recover authenticated history before subscribing to live events. The same
    // ingest path deduplicates history and WebSocket replay deliveries.
    const historyResponse=await fetch(base+'/api/telemetry/history',{headers:{Authorization:'Bearer '+token},cache:'no-store',credentials:'omit'});
    if (!historyResponse.ok) throw Error('History HTTP '+historyResponse.status);
    const historyPayload=await historyResponse.json();
    if (Array.isArray(historyPayload.events)) for (const event of historyPayload.events) ingest(event);
    if (ticket!==attempt) return;
    await refreshOpenAI(base,token,ticket);
    if (ticket!==attempt) return;
    const ticketResponse=await fetch(base+'/api/events/ticket',{method:'POST',headers:{Authorization:'Bearer '+token},cache:'no-store',credentials:'omit'});
    if(ticket!==attempt)return;
    if(!ticketResponse.ok)throw Error('WebSocket ticket HTTP '+ticketResponse.status);
    const ticketData=await ticketResponse.json();
    if(typeof ticketData.ticket!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(ticketData.ticket))throw Error('Invalid WebSocket ticket');
    const ws=new WebSocket(base.replace(/^https:/,'wss:').replace(/^http:/,'ws:')+'/events',['neural-grid-telemetry-v1','ng-ticket.'+ticketData.ticket]);
    socket=ws;
    ws.onopen=()=>{if(ticket===attempt){
      expiresAt=Date.now()+lifetime*1000;
      status('connected','Authenticated read-only stream open · '+lifetime+'s remaining. Connector states are reported by the registry.');
      countdownTimer=setInterval(()=>{if(ticket!==attempt||!expiresAt)return;
        const remaining=Math.max(0,Math.ceil((expiresAt-Date.now())/1000));
        if(remaining>0)detail.textContent='Authenticated read-only stream open · '+remaining+'s remaining. Connector states are reported by the registry.';
      },1000);
      sessionTimer=setTimeout(()=>{if(ticket===attempt){disconnect();status('expired','Session expired. Press Connect to request a new read-only token.');}},lifetime*1000);
    }};
    ws.onmessage=message=>{if(ticket!==attempt)return;try{ingest(JSON.parse(message.data));}catch{}};
    ws.onerror=()=>{if(ticket===attempt){disconnect();status('error','Telemetry socket error; reconnect manually.');}};
    ws.onclose=()=>{if(ticket===attempt){disconnect();status('disconnected','Telemetry stream closed; reconnect manually.');}};
    // Expiry starts only after the authenticated socket opens; never auto-reconnect.
  } catch(e) {if(ticket===attempt){disconnect();status('error',String(e?.message||e).slice(0,180));}}
}
start.addEventListener('click',connect);stop.addEventListener('click',disconnect);
status('disconnected','Manual mode. Press Connect to request a temporary read-only session. No external connections are active.');
window.addEventListener('pagehide',disconnect,{once:true});
})();

