import http from "node:http";
import crypto from "node:crypto";
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

function json(res, status, value, origin = "") {
  const headers = {"content-type":"application/json","cache-control":"no-store"};
  if (origin && allowedOrigins.includes(origin)) headers["access-control-allow-origin"] = origin;
  res.writeHead(status, headers);
  res.end(JSON.stringify(value));
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
const server = http.createServer(async (req,res) => {
  const origin = String(req.headers.origin || "");
  try {
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
  if (origin && !allowedOrigins.includes(origin)) return socket.destroy();
  // Browser WebSocket APIs cannot set arbitrary auth headers. A token is supplied
  // as a second subprotocol; never log this header or put the token in a URL.
  const protocols = String(req.headers["sec-websocket-protocol"] || "").split(",").map(x=>x.trim());
  const supplied = protocols.find(x=>x.startsWith("ng-auth."))?.slice(8);
  if (!verifySession(supplied,origin) || !protocols.includes("neural-grid-telemetry-v1"))
    return socket.destroy();
  // Enforce expiry after handshake, not only at authentication.
  const payload=JSON.parse(Buffer.from(supplied.split(".")[0],"base64url").toString("utf8"));
  wss.handleUpgrade(req,socket,head,ws=>wss.emit("connection",ws,payload.exp));
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
