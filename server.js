import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {WebSocketServer} from "ws";
import {listConnectors,routeConnectorEvent} from "./connector-registry.js";

// Execution is deliberately unavailable. Changing an environment variable cannot enable it.
const mode = "monitor";
const port = Number(process.env.PORT || 10000);
const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET || "";
const sessionIssuerKey = process.env.TELEMETRY_SESSION_ISSUER_KEY || "";
const sessionSigningKey = process.env.TELEMETRY_SESSION_SIGNING_KEY || "";
// V88 staging policy: short-lived, read-only telemetry sessions.
const sessionTtlSeconds = 900;
const allowedOrigins = (process.env.CORS_ORIGIN || "").split(",").map(x => x.trim()).filter(Boolean);
const clients = new Set();
const maxBody = 200000;
const maxHistory = 200;
const history = [];
const deliveries = new Map();
const replayTtl = 24 * 60 * 60 * 1000;
const viewerRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "viewer", "v88.8");
const contentTypes = {".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",".json":"application/json; charset=utf-8",".svg":"image/svg+xml",".ico":"image/x-icon",".png":"image/png",".jpg":"image/jpeg",".glb":"model/gltf-binary",".woff2":"font/woff2"};

function json(res, status, value, origin = "") {
  const headers = {"content-type":"application/json","cache-control":"no-store"};
  if (origin && allowedOrigins.includes(origin)) headers["access-control-allow-origin"] = origin;
  res.writeHead(status, headers);
  res.end(JSON.stringify(value));
}
function requestOrigin(req) {
  const origin=String(req.headers.origin||"");
  if(origin)return origin;
  // Same-origin browser GETs commonly omit Origin. Accept a viewer origin only
  // when Fetch Metadata confirms same-origin and Referer resolves to our allowlist.
  if(req.headers["sec-fetch-site"]!=="same-origin")return "";
  try {
    const referrer=new URL(String(req.headers.referer||""));
    return allowedOrigins.includes(referrer.origin)?referrer.origin:"";
  } catch {return "";}
}
function safe(value, max = 120) {
  return String(value ?? "").replace(/[<>\x00-\x1f]/g, "").slice(0, max);
}
function telemetry(input, origin) {
  const metadata = {};
  for (const key of ["repository","action","ref","workflow","conclusion","deliveryId","runId","status"]) {
    if (input.metadata?.[key] != null) metadata[key] = safe(input.metadata[key], 120);
  }
  return {
    schema:"neural-grid/event/v1",
    eventId:crypto.randomUUID(),
    timestamp:new Date().toISOString(),
    type:safe(input.type || "event.received", 80).toLowerCase(),
    source:safe(input.source || origin, 80),
    destination:safe(input.destination || "neural-grid", 80),
    correlationId:safe(input.correlationId || "", 80),
    payloadVersion:"1",metadata,origin,
    routing:routeConnectorEvent(input)
  };
}
function broadcast(e) {
  history.push(e);
  if (history.length > maxHistory) history.shift();
  const message = JSON.stringify(e);
  for (const ws of clients) {
    if (ws.readyState === 1 && ws.bufferedAmount < 1024 * 1024) ws.send(message);
  }
}
function validSignature(raw, signature) {
  if (!webhookSecret || typeof signature !== "string" || !/^sha256=[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac("sha256", webhookSecret).update(raw).digest();
  const supplied = Buffer.from(signature.slice(7), "hex");
  return supplied.length === expected.length && crypto.timingSafeEqual(expected, supplied);
}
function validToken(a, b) {
  if (!a || !b || typeof b !== "string") return false;
  const x = crypto.createHash("sha256").update(a).digest();
  const y = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(x, y);
}
function b64(data) { return Buffer.from(data).toString("base64url"); }
function issueSession(origin) {
  if (!sessionSigningKey || !origin || !allowedOrigins.includes(origin)) return null;
  const now = Math.floor(Date.now() / 1000);
  const payload = b64(JSON.stringify({v:1,scope:"telemetry:read",aud:"neural-grid",origin,iat:now,exp:now+sessionTtlSeconds,nonce:crypto.randomBytes(12).toString("hex")}));
  const signature = crypto.createHmac("sha256",sessionSigningKey).update(payload).digest("base64url");
  return {token:payload+"."+signature,expiresIn:sessionTtlSeconds};
}
function verifySession(token, origin) {
  if (!sessionSigningKey || !origin || !allowedOrigins.includes(origin) || typeof token !== "string" || token.length > 2048) return false;
  const parts=token.split(".");
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]+$/.test(parts[1])) return false;
  const expected=crypto.createHmac("sha256",sessionSigningKey).update(parts[0]).digest();
  const provided=Buffer.from(parts[1],"base64url");
  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected,provided)) return false;
  try {
    const p=JSON.parse(Buffer.from(parts[0],"base64url").toString("utf8"));
    const now=Math.floor(Date.now()/1000);
    return p.v===1 && p.scope==="telemetry:read" && p.aud==="neural-grid" &&
      p.origin===origin && Number.isSafeInteger(p.iat) && Number.isSafeInteger(p.exp) &&
      p.iat<=now && p.exp>now && p.exp-p.iat<=sessionTtlSeconds;
  } catch {return false;}
}
async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBody) throw Error("body too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
function githubEvent(payload, headers, deliveryId) {
  const kind = safe(headers["x-github-event"] || "unknown", 60).toLowerCase();
  const action = safe(payload.action || "received", 60);
  const repo = safe(payload.repository?.full_name || "", 120);
  const workflow = safe(payload.workflow?.name || payload.workflow_run?.name || "", 120);
  const conclusion = safe(payload.workflow_run?.conclusion || "", 60);
  const runId = payload.workflow_run?.id;
  const status = safe(payload.workflow_run?.status || "", 40);
  return telemetry({
    type:kind === "workflow_run" ? "github.workflow." + (conclusion || action) : "github." + kind + "." + action,
    source:"github",destination:"neural-grid",
    correlationId:deliveryId,
    metadata:{repository:repo,action,ref:payload.ref || "",workflow,conclusion,deliveryId,
      ...(Number.isSafeInteger(runId)&&runId>0?{runId:String(runId)}:{}),status}
  },"external");
}
function isDuplicate(id) {
  const now = Date.now();
  for (const [key, ts] of deliveries) if (now - ts > replayTtl) deliveries.delete(key);
  if (deliveries.has(id)) return true;
  deliveries.set(id, now);
  if (deliveries.size > 10000) deliveries.delete(deliveries.keys().next().value);
  return false;
}
function serveViewer(req,res) {
  let pathname;
  try { pathname = new URL(req.url,"http://gateway.local").pathname; } catch { return false; }
  const requestPath = pathname === "/viewer" || pathname === "/viewer/" ? "/v70.html" : pathname.slice("/viewer/".length);
  let decoded;
  try { decoded = decodeURIComponent(requestPath); } catch { return false; }
  if (!decoded || decoded.includes("\0") || decoded.includes("..") || decoded.split(/[\\/]/).some(part=>part.startsWith("."))) return false;
  const filePath = path.resolve(viewerRoot, decoded.replace(/^[/\\]+/, ""));
  if (filePath !== viewerRoot && !filePath.startsWith(viewerRoot + path.sep)) return false;
  try {
    const body = fs.readFileSync(filePath);
    res.writeHead(200,{"content-type":contentTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream","cache-control":"no-store"});
    res.end(body);
    return true;
  } catch { return false; }
}
// Per-IP bounded rate limiting and short-lived, single-use WebSocket tickets.
const requestBuckets = new Map();
const wsTickets = new Map();
const maxWsClients = 100;
const ticketLifetimeMs = 60000;
function rateAllowed(req, limit = 120) {
  const now = Date.now();
  if (requestBuckets.size > 10000) for (const [key,value] of requestBuckets) if (now - value.start > 60000) requestBuckets.delete(key);
  const key = req.socket.remoteAddress || "unknown";
  const bucket = requestBuckets.get(key);
  if (!bucket || now - bucket.start >= 60000) { requestBuckets.set(key,{start:now,count:1}); return true; }
  return ++bucket.count <= limit;
}
function issueWsTicket(session, origin) {
  const claims = JSON.parse(Buffer.from(session.split(".")[0],"base64url").toString("utf8"));
  const now = Date.now();
  for (const [key,value] of wsTickets) if (value.expiresAt <= now) wsTickets.delete(key);
  if (wsTickets.size >= 10000) return null;
  const ticket = crypto.randomBytes(32).toString("base64url");
  wsTickets.set(ticket,{origin,expiresAt:Math.min(now+ticketLifetimeMs,claims.exp*1000),sessionExpiresAt:claims.exp});
  return {ticket,expiresIn:Math.max(1,Math.ceil((Math.min(now+ticketLifetimeMs,claims.exp*1000)-now)/1000))};
}
function consumeWsTicket(ticket,origin) {
  if (!ticket || !/^[A-Za-z0-9_-]{43}$/.test(ticket)) return null;
  const entry = wsTickets.get(ticket);
  if (!entry) return null;
  wsTickets.delete(ticket);
  return entry.origin===origin && entry.expiresAt>Date.now() ? entry : null;
}

const server = http.createServer(async (req,res) => {
  const origin = requestOrigin(req);
  try {
    if (!rateAllowed(req, req.url === "/api/telemetry/sessions" ? 20 : 120)) return json(res,429,{error:"rate_limited"},origin);
    if (req.method === "OPTIONS") {
      if (!origin || !allowedOrigins.includes(origin)) return json(res,403,{error:"origin_not_allowed"});
      res.writeHead(204,{
        "access-control-allow-origin":origin,
        "access-control-allow-methods":"GET, POST, OPTIONS",
        "access-control-allow-headers":"content-type, authorization",
        "vary":"origin"
      });
      return res.end();
    }
    if (req.method === "GET" && req.url === "/health")
      return json(res,200,{ok:true,service:"neural-grid-gateway",mode,executionEnabled:false},origin);
    if (req.method === "GET" && (req.url === "/viewer" || req.url.startsWith("/viewer/")))
      return serveViewer(req,res) ? undefined : json(res,404,{error:"not_found"},origin);
    if (req.method === "POST" && req.url === "/api/openai/task")
      return json(res,403,{error:"execution_disabled",mode},origin);
    if (req.method === "POST" && req.url === "/api/telemetry/sessions") {
      // Only a trusted backend may issue sessions; never expose the issuer key in browser JS.
      if (origin || !validToken(sessionIssuerKey,req.headers.authorization?.replace(/^Bearer /,"")))
        return json(res,401,{error:"unauthorized"});
      const input=JSON.parse((await readBody(req)).toString("utf8"));
      const issued=issueSession(input.origin);
      if (!issued) return json(res,403,{error:"origin_not_allowed"});
      return json(res,201,issued);
    }
    if (req.method === "POST" && req.url === "/api/events/ticket") {
      if (!origin || !allowedOrigins.includes(origin)) return json(res,403,{error:"origin_not_allowed"},origin);
      const session=req.headers.authorization?.replace(/^Bearer /,"");
      if (!verifySession(session,origin)) return json(res,401,{error:"unauthorized"},origin);
      const issued=issueWsTicket(session,origin);
      if (!issued) return json(res,429,{error:"ticket_capacity"},origin);
      return json(res,201,issued,origin);
    }
    if (req.method === "POST" && req.url === "/webhooks/github") {
      const raw = await readBody(req);
      if (!validSignature(raw,req.headers["x-hub-signature-256"]))
        return json(res,401,{error:"invalid_signature"},origin);
      const deliveryId = safe(req.headers["x-github-delivery"],80);
      if (!/^[a-zA-Z0-9-]{8,80}$/.test(deliveryId))
        return json(res,400,{error:"invalid_delivery_id"},origin);
      const payload = JSON.parse(raw.toString("utf8"));
      if (!payload || typeof payload !== "object" || Array.isArray(payload))
        return json(res,400,{error:"invalid_payload"},origin);
      if (isDuplicate(deliveryId)) return json(res,200,{accepted:true,duplicate:true},origin);
      broadcast(githubEvent(payload,req.headers,deliveryId));
      return json(res,202,{accepted:true},origin);
    }
    if (req.method === "GET" && (req.url === "/api/telemetry/history" || req.url === "/api/connectors")) {
      if (origin && !allowedOrigins.includes(origin))
        return json(res,403,{error:"origin_not_allowed"},origin);
      if (!verifySession(req.headers.authorization?.replace(/^Bearer /,""),origin))
        return json(res,401,{error:"unauthorized"},origin);
      if (req.url === "/api/connectors") return json(res,200,{connectors:listConnectors({githubWebhookConfigured:!!webhookSecret}),mode},origin);
      return json(res,200,{events:history.slice(),mode},origin);
    }
    return json(res,404,{error:"not_found"},origin);
  } catch {
    return json(res,400,{error:"request_rejected"},origin);
  }
});
const wss = new WebSocketServer({noServer:true,handleProtocols: protocols =>
  protocols.has("neural-grid-telemetry-v1") ? "neural-grid-telemetry-v1" : false
});
server.on("upgrade",(req,socket,head) => {
  if (req.url !== "/events") return socket.destroy();
  const origin = String(req.headers.origin || "");
  if (!origin || !allowedOrigins.includes(origin) || clients.size >= maxWsClients) return socket.destroy();
  // Browser WebSocket APIs cannot set arbitrary auth headers. A token is supplied
  // as a second subprotocol; never log this header or put the token in a URL.
  const protocols = String(req.headers["sec-websocket-protocol"] || "").split(",").map(x=>x.trim());
  const supplied = protocols.find(x=>x.startsWith("ng-ticket."))?.slice(10);
  if (!protocols.includes("neural-grid-telemetry-v1")) return socket.destroy();
  const ticket = consumeWsTicket(supplied,origin);
  if (!ticket) return socket.destroy();
  wss.handleUpgrade(req,socket,head,ws=>wss.emit("connection",ws,ticket.sessionExpiresAt));
});
wss.on("connection",(ws,expiresAt) => {
  const remainingMs=Math.max(0,expiresAt*1000-Date.now());
  const expiryTimer=setTimeout(()=>ws.close(1008,"Session expired"),remainingMs);
  expiryTimer.unref?.();
  clients.add(ws);
  ws.send(JSON.stringify(telemetry({type:"connector.connected",source:"neural-grid-gateway"},"internal")));
  ws.on("close",()=>{clearTimeout(expiryTimer);clients.delete(ws);});
  ws.on("error",()=>{clearTimeout(expiryTimer);clients.delete(ws);});
});
server.listen(port,"0.0.0.0",()=>console.log("gateway listening on 0.0.0.0:"+port));

