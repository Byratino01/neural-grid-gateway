# Neural Grid Gateway — Monitor-only hardening candidate

> **Draft only. Do not merge or deploy before viewer authentication integration and review.**

## Routes
- `GET /health` — minimal service health response
- `POST /webhooks/github` — GitHub HMAC-SHA256 signed events; delivery IDs are deduplicated in memory for 24 hours
- `POST /api/events/ticket` — issues a 60-second single-use WebSocket ticket **only** to a trusted caller holding `GATEWAY_TOKEN`
- `WSS /events` — authenticated read-only event stream, requires `neural-grid-events` and `ng-ticket.<ticket>` WebSocket subprotocol offers; the server negotiates only the fixed `neural-grid-events` protocol

The former `POST /api/openai/task` endpoint is intentionally disabled in Monitor Mode.

## Security configuration
- `GITHUB_WEBHOOK_SECRET` — required for webhook verification
- `GATEWAY_TOKEN` — required for ticket issuance and WebSocket connections
- `CORS_ORIGIN` — comma-separated, exact browser origins; there is **no wildcard default**
- `PORT` — set by Render

**Never embed `GATEWAY_TOKEN` in public HTML, JS, GLB, localStorage, or mobile PWA assets.** Browser code cannot safely hold this long-lived credential. A trusted session-authenticated backend must mint short-lived tickets on behalf of authenticated viewers, or replace this flow with secure cookie-backed viewer sessions. The viewer is not integrated yet.

Example for a trusted *server-to-server* ticket request (not browser JavaScript):

```http
POST /api/events/ticket HTTP/1.1
x-gateway-token: <secret configured only on trusted backend>
```

## Limitations / release blockers
1. Viewer code and trusted ticket broker have not been integrated or audited.
2. Current ticket rate limiting and webhook replay cache are in-memory, reset on restart, and not shared across instances.
3. `CORS_ORIGIN` must be set to the actual deployed viewer origin(s); exact scheme/host/port must match.
4. Webhook requests do not use browser CORS; GitHub sends no Origin header. Webhook signature remains mandatory.
5. CI security tests do not substitute for browser integration tests or a production authorization review.
6. Commit a reviewed dependency lockfile and change CI to `npm ci` for reproducible installs.
7. Audit existing GitHub Actions workflow permissions and verify deployment settings before merging.

## Local/CI tests
```sh
npm install --ignore-scripts
npm test
npm audit --omit=dev --audit-level=high
```

## Rollout
Prepare and test a viewer-compatible authentication broker; verify secret isolation; validate negative authorization cases; only then approve a coordinated viewer/gateway deployment. Preserve the V88.8 baseline.
