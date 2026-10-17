# V73 staging integration checklist — NOT DEPLOYED

## Preconditions
- Create a **separate** Render staging service from `feature/monitor-mode-gateway-v2`. Do not reuse or redeploy production.
- Configure staging-only randomly generated secrets for `GITHUB_WEBHOOK_SECRET`, `TELEMETRY_SESSION_ISSUER_KEY`, and `TELEMETRY_SESSION_SIGNING_KEY`. Never commit or expose values in browser JS.
- Set `CORS_ORIGIN` to the exact trusted viewer origin; local `127.0.0.1` viewer uses a random port, so plan an explicit stable localhost origin and verify it. Do not use `*`.
- A separate authenticated trusted backend must call `POST /api/telemetry/sessions` with the issuer key and target origin. This endpoint is NOT safe to expose through a public unauthenticated browser relay.
- Do not call the staging gateway 'connected' merely because a webhook secret exists. Distinguish configured from observed.
- No external connector, webhook, or staging service has been activated by this checklist.

## Smoke test sequence
1. Verify `GET /health`: `mode=monitor`, `executionEnabled=false`.
2. Verify anonymous `GET /api/connectors` and `GET /api/telemetry/history` are denied.
3. Issue a 120-second scoped browser session from the trusted backend. Test wrong origin, tampered token, and expired token are denied.
4. Fetch the registry from the browser with an Authorization header; let the browser supply its own Origin. Never set an `origin` request header in JavaScript.
5. Connect WSS with protocols `neural-grid-telemetry-v1`, `ng-auth.<token>`. Verify the socket closes at session expiry; reconnect only with a newly issued token.
6. Deliver a **test fixture** signed with the staging GitHub webhook secret; verify exactly one sanitized `github.workflow.success` event after duplicate delivery.
7. Verify GitHub station pulse and activity row. Do NOT draw an app-to-app edge unless independent correlation proves it.
8. Verify bad HMAC, replayed delivery, unknown connector, and disconnected gateway do not generate misleading connected status.
9. Confirm emergency stop, local approval controls, and production Render configuration are unchanged.
10. Only after a separately approved live GitHub webhook test, verify a real GitHub Actions workflow produces a station pulse.

## Constraints
- No GLB geometry, station transforms, or camera changes.
- No production deployment or PR merge.
- Monitor Mode is read-only; Execution Mode remains unavailable.
- Current gateway stores event history and deduplication in memory, so restart resets both.
