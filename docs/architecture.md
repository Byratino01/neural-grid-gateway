# Architecture and regression boundaries

## Current ownership

- `server.js` owns HTTP routing, server-side session issuance, authentication, webhook signature checks, and read-only WebSocket history delivery.
- `connector-registry.js` is the declarative connector inventory. It owns IDs, display names, station IDs, same-origin icon references, supported event families, and transport descriptors. Configuration is reported separately from verified live connection state.
- `viewer/v88.8/connector-catalog.js` provides the small browser-facing projection of that inventory to the monitor UI. `v71-monitor.js` owns the monitor session lifecycle and renders registry states; it does not issue credentials or perform actions.
- `viewer/v88.8/v88-icons.js` adds visual marks and intentionally hides the legacy Truck Scanner row. Its Higgsfield row is visual-only and is not a registered telemetry integration.
- `viewer/v88.8/v70-dashboard.js` builds the six dashboard panels; existing workflow model/controller files under `viewer/` and `viewer/v88.8/` own reusable workflow and telemetry presentation logic.
- `viewer/v88.8/v70.html` remains the main page and still hosts substantial inline scene and application logic. This is a future extraction seam; moving it is outside this change because script ordering and scene state are tightly coupled.

## Data flow

The gateway authenticates the viewer's short-lived read-only session before returning the connector inventory, history, or opening the telemetry socket. A signed webhook can establish configured state, but that alone does not mark a connector as live. The monitor displays the registry status as reported and only displays live-stream status after the authenticated socket opens. Event pulses are presentation-only; a destination label is not proof of an application-to-application connection.

## Regression protection

`test/architecture-regression.test.js` pins key scene setup anchors (Three.js controls and loader imports, camera, lighting, damping, bundled GLB URL, and render loop) and ensures that monitor catalog/status semantics stay explicit. `test/approved-glb-integrity.test.js` pins the approved model's SHA-256 and checks its GLB chunks, embedded resources, and core references. `viewer/v88.8/test_v88_8_model_load.cjs` exercises the actual Three.js loader over local HTTP and verifies its loaded mesh/animation report. The five-viewport Playwright check remains the dashboard layout behavior check and requires successful GLB responses.

The gateway tests exercise controlled local fixtures. Do not use a real staging credential or private/third-party target for this validation.
