import http from "node:http";
import crypto from "node:crypto";
import { WebSocketServer } from "ws";

const port = Number(process.env.PORT || 10000);
const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET || "";
const gatewayToken = process.env.GATEWAY_TOKEN || "";
const allowedOrigins = new Set((process.env.CORS_ORIGIN || "").split(",").map(s => s.trim()).filter(Boolean));
const clients = new Set();
const maxBody = 200000;
const ticketLifetimeMs = 60_000;
const tickets = new Map();
const deliveries = new Map();
const requests = new Map();

function clean(v, n = 120) { return String(v ?? "").replace(/[<>]/g, "").slice(0, n); }
function json(res, status, data, origin = "") {
  const headers = { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff" };
  if (allowedOrigins.has(origin)) { headers["access-control-allow-origin"] = origin; headers.vary = "Origin"; }
  res.writeHead(status, headers);
  res.end(JSON.stringify(data));
}
function authorized(req) {
  if (!gatewayToken) return false;
  const supplied = req.headers["x-gateway-token"];
  if (typeof supplied !== "string") return false;
  const a = Buffer.from(supplied), b = Buffer.from(gatewayToken);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function signatureValid(raw, signature) {
  if (!webhookSecret || typeof signature !== "string") return false;
  const expected = "sha256=" + crypto.createHmac("sha256", webhookSecret).update(raw).digest("hex");
  const a = Buffer.from(signature), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function rateLimit(key, max, windowMs) {
  const now = Date.now(), state = requests.get(key);
  if (!state || state.until <= now) { requests.set(key, { count: 1, until: now + windowMs }); return false; }
  state.count++;
  return state.count > max;
}
function prune() {
  const now = Date.now();
  for (const [key, expires] of tickets) if (expires < now) tickets.delete(key);
  for (const [key, expires] of deliveries) if (expires < now) deliveries.delete(key);
  for (const [key, state] of requests) if (state.until < now) requests.delete(key);
}
function event(input, origin) {
  return { schema: "neural-grid/event/v1", eventId: crypto.randomUUID(), timestamp: new Date().toISOString(),
    type: clean(input.type || "event.received", 80).toLowerCase(), source: clean(input.source || origin, 80),
    destination: clean(input.destination || "neural-grid", 80), correlationId: clean(input.correlationId || "", 80),
    payloadVersion: "1", metadata: {}, origin };
}
function broadcast(e) { const data = JSON.stringify(e); for (const ws of clients) if (ws.readyState === 1) ws.send(data); }
async function body(req) {
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > maxBody) throw Error("body too large"); chunks.push(c); }
  return Buffer.concat(chunks);
}
function githubEvent(payload, headers) {
  const kind = clean(headers["x-github-event"] || "github.event", 60);
  const type = kind === "workflow_run" ? (payload.workflow_run?.conclusion ? "workflow." + clean(payload.workflow_run.conclusion, 30) : "workflow.started") : "signal.transmitted";
  return event({ type, source: "github", destination: "neural-grid", correlationId: headers["x-github-delivery"] || "" }, "external");
}
const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || "";
  const reply = (status, data) => json(res, status, data, origin);
  try {
    if (req.method === "OPTIONS") {
      if (!allowedOrigins.has(origin)) return reply(403, { error: "origin denied" });
      res.writeHead(204, { "access-control-allow-origin": origin, "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": "content-type,x-gateway-token", "vary": "Origin" });
      return res.end();
    }
    if (origin && !allowedOrigins.has(origin)) return reply(403, { error: "origin denied" });
    if (req.method === "GET" && req.url === "/health") return reply(200, { ok: true, service: "neural-grid-gateway" });
    if (req.method === "POST" && req.url === "/webhooks/github") {
      const raw = await body(req);
      if (!signatureValid(raw, req.headers["x-hub-signature-256"])) return reply(401, { error: "invalid signature" });
      const id = req.headers["x-github-delivery"];
      if (typeof id !== "string" || !/^[a-zA-Z0-9-]{1,100}$/.test(id)) return reply(400, { error: "invalid delivery id" });
      prune();
      if (deliveries.has(id)) return reply(409, { error: "duplicate delivery" });
      const payload = JSON.parse(raw.toString("utf8"));
      deliveries.set(id, Date.now() + 24 * 60 * 60 * 1000);
      broadcast(githubEvent(payload, req.headers));
      return reply(202, { accepted: true });
    }
    if (req.method === "POST" && req.url === "/api/events/ticket") {
      if (!authorized(req)) return reply(401, { error: "unauthorized" });
      const peer = req.socket.remoteAddress || "unknown";
      if (rateLimit("ticket:" + peer, 20, 60_000)) return reply(429, { error: "rate limit exceeded" });
      prune();
      const ticket = crypto.randomBytes(24).toString("base64url");
      tickets.set(ticket, Date.now() + ticketLifetimeMs);
      return reply(200, { ticket, expiresInSeconds: 60 });
    }
    // Monitor-only deployment: no model invocation, command execution or billable task endpoint.
    return reply(404, { error: "not found" });
  } catch { return reply(400, { error: "request rejected" }); }
});
const wss = new WebSocketServer({ noServer: true, maxPayload: 4096, handleProtocols: () => false });
server.on("upgrade", (req, socket, head) => {
  const deny = () => { socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n"); socket.destroy(); };
  if (req.url !== "/events" || !gatewayToken) return deny();
  const origin = req.headers.origin || "";
  if (origin && !allowedOrigins.has(origin)) return deny();
  // Browser clients must present an approved Origin; non-browser clients may omit it.
  const protocols = String(req.headers["sec-websocket-protocol"] || "").split(",").map(x => x.trim());
  const protocol = protocols.find(x => x.startsWith("ng-ticket."));
  const ticket = protocol?.slice("ng-ticket.".length);
  prune();
  if (!ticket || !tickets.has(ticket) || tickets.get(ticket) < Date.now() || clients.size >= 100) return deny();
  tickets.delete(ticket);
  wss.handleUpgrade(req, socket, head, ws => wss.emit("connection", ws, req));
});
wss.on("connection", ws => {
  clients.add(ws);
  ws.send(JSON.stringify(event({ type: "connector.connected", source: "neural-grid-gateway" }, "external")));
  ws.on("close", () => clients.delete(ws));
});
server.listen(port, () => console.log("monitor-only gateway listening on " + port));
