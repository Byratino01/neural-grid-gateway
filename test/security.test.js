import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import WebSocket from "ws";

const port = 21000 + Math.floor(Math.random() * 10000);
const secret = "test-webhook-secret", token = "test-gateway-token";
const base = "http://127.0.0.1:" + port;
const child = spawn(process.execPath, ["server.js"], { env: { ...process.env, PORT: String(port), GITHUB_WEBHOOK_SECRET: secret, GATEWAY_TOKEN: token, CORS_ORIGIN: "http://localhost:3000" }, stdio: "ignore" });
async function ready() {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(base + "/health")).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw Error("gateway did not start");
}
test("monitor-only gateway security", async t => {
  await ready();
  t.after(() => child.kill());
  const get = (path, opts = {}) => fetch(base + path, opts);
  await t.test("task endpoint disabled", async () => {
    assert.equal((await get("/api/openai/task", { method: "POST", headers: { "x-gateway-token": token }, body: "{}" })).status, 404);
  });
  await t.test("ticket requires authentication", async () => {
    assert.equal((await get("/api/events/ticket", { method: "POST" })).status, 401);
    const r = await get("/api/events/ticket", { method: "POST", headers: { "x-gateway-token": token, Origin: "http://localhost:3000" } });
    assert.equal(r.status, 200);
    assert.ok((await r.json()).ticket);
  });
  await t.test("WebSocket rejects missing ticket and does not echo valid ticket", async () => {
    const connect = (protocols, origin) => new Promise(resolve => {
      const ws = new WebSocket("ws://127.0.0.1:" + port + "/events", protocols, { origin });
      ws.once("unexpected-response", (_request, response) => { response.resume(); resolve({ status: response.statusCode }); });
      ws.once("open", () => { const protocol = ws.protocol; ws.close(); resolve({ status: 101, protocol }); });
      ws.once("error", () => resolve({ status: 0 }));
    });
    assert.equal((await connect([], "http://localhost:3000")).status, 403);
    const response = await get("/api/events/ticket", { method: "POST", headers: { "x-gateway-token": token } });
    const { ticket } = await response.json();
    const valid = await connect(["neural-grid-events", "ng-ticket." + ticket], "http://localhost:3000");
    assert.equal(valid.status, 101);
    assert.equal(valid.protocol, "neural-grid-events");
    assert.equal((await connect(["neural-grid-events", "ng-ticket." + ticket], "http://localhost:3000")).status, 403);
    const next = await (await get("/api/events/ticket", { method: "POST", headers: { "x-gateway-token": token } })).json();
    assert.equal((await connect(["neural-grid-events", "ng-ticket." + next.ticket], "https://malicious.example")).status, 403);
    assert.equal((await connect(["neural-grid-events", "ng-ticket." + next.ticket], "http://localhost:3000")).status, 101);
  });
  await t.test("untrusted browser origins denied", async () => {
    assert.equal((await get("/health", { headers: { Origin: "https://malicious.example" } })).status, 403);
    assert.equal((await get("/health", { headers: { Origin: "http://localhost:3000" } })).status, 200);
  });
  await t.test("ticket issuance is rate limited", async () => {
    const statuses = [];
    for (let i = 0; i < 24; i++) {
      const response = await get("/api/events/ticket", { method: "POST", headers: { "x-gateway-token": token } });
      statuses.push(response.status);
    }
    assert.ok(statuses.includes(429));
  });
  await t.test("webhook signature and replay guard", async () => {
    const payload = JSON.stringify({ action: "completed", repository: { full_name: "example/repo" } });
    const signature = "sha256=" + crypto.createHmac("sha256", secret).update(payload).digest("hex");
    const headers = { "x-hub-signature-256": signature, "x-github-delivery": crypto.randomUUID(), "content-type": "application/json" };
    assert.equal((await get("/webhooks/github", { method: "POST", headers, body: payload })).status, 202);
    assert.equal((await get("/webhooks/github", { method: "POST", headers, body: payload })).status, 409);
    assert.equal((await get("/webhooks/github", { method: "POST", headers: { ...headers, "x-github-delivery": crypto.randomUUID(), "x-hub-signature-256": "sha256=bad" }, body: payload })).status, 401);
  });
});
