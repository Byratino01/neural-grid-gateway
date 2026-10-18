# V88 changelog

- Extended staging telemetry session TTL from 120 seconds to 900 seconds while preserving HMAC signing, origin binding, read-only scope, server-side expiry, and WebSocket expiry closure.
- Keyed workflow activity by repository plus workflow run ID.
- Added history hydration to the telemetry adapter before opening the live WebSocket, allowing reconnect recovery without changing manual Connect/Disconnect behavior.
- Updated workflow fixtures for the repository-qualified event contract.

Tests: viewer/activity/controller/visual/security-shape tests pass. Gateway-starting tests could not run because the declared `ws` package was unavailable locally and npm registry DNS was inaccessible.
