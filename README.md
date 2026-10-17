# Neural Grid Gateway

Render-ready gateway for Neural Grid. It verifies GitHub webhook signatures, calls OpenAI only from the server, and broadcasts sanitized events over a read-only WebSocket.

## Endpoints

- GET /health
- POST /webhooks/github
- POST /api/openai/task (requires x-gateway-token)
- WSS /events

## Render setup

Add these environment variables in Render; never commit their values:

- GITHUB_WEBHOOK_SECRET
- OPENAI_API_KEY
- GATEWAY_TOKEN
- CORS_ORIGIN
- OPENAI_MODEL (optional; defaults to gpt-5-mini)

After deployment:

- GitHub webhook: https://HOST/webhooks/github
- Neural Grid event feed: wss://HOST/events

Only bounded, sanitized metadata is broadcast. No API keys, GitHub tokens, raw webhook payloads, prompts, hidden reasoning, or private repository content are exposed.

## Gateway V2: monitor-only safety gate (proposed branch)

This branch enforces monitor-only operation at the server, regardless of `NEURAL_GRID_MODE` or whether OpenAI credentials are present. `POST /api/openai/task` always responds with HTTP 403 and `{"error":"execution_disabled","mode":"monitor"}`, before attempting an OpenAI API call. The original implementation is retained as unreachable code for a future, separately reviewed execution-mode release. `GET /health` reports `mode:"monitor"` and `executionEnabled:false`.

Run `npm install` and `npm test` to exercise the local safety gate. Do not deploy or merge without verifying the full gateway and webhook behavior. Existing `/events` subscriptions remain unauthenticated; this branch is NOT a production-ready telemetry security upgrade. Future work: authenticated read-only event feed, constrained origins, structured sanitized metadata, webhook replay defense, and bounded event history.

No Render environment change or production deployment is performed by this branch.

## Gateway V3 telemetry draft

The gateway remains **monitor-only** and has no live OpenAI execution route. The proposed Render blueprint no longer requests OpenAI credentials. Existing environment variables on a previously deployed Render service must be audited separately; changing this blueprint does not remove them.

- `GITHUB_WEBHOOK_SECRET`: required to accept GitHub events.
- `TELEMETRY_VIEWER_TOKEN`: required for `GET /api/telemetry/history` and `WSS /events`.
- `CORS_ORIGIN`: comma-separated browser origins authorized for the viewer.

Browser WebSocket clients must supply subprotocols `neural-grid-telemetry-v1` and `ng-auth.<token>`. The server selects only the fixed protocol name. This is an interim mechanism: **a long-lived token embedded in a public browser app is not a secret**. Do not publish the viewer token in Netlify static files, a repository, or browser-accessible configuration. Before connecting an internet-facing browser viewer, implement short-lived, scoped session credentials issued through an authenticated login or a trusted backend.

GitHub deliveries are verified using HMAC-SHA256 and deduplicated by delivery ID in memory. The last 200 sanitized events are kept only in memory; no database persistence or cross-instance synchronization exists. The reported destination `neural-grid` means the telemetry observer, not proof of a direct GitHub-to-ChatGPT interaction. Monitor Mode never authorizes external execution.

Deployment is not part of this pull request. The live Render service remains unchanged until reviewed and explicitly deployed.
