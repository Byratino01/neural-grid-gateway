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
