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