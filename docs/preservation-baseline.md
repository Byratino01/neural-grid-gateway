# Neural Grid V88.8 preservation baseline

Verified on 2026-10-19 from the supplied project checkout and approved GLB attachment. This baseline records the source and validation evidence; it does not authorize deployment, merge, staging configuration changes, or new provider credentials.

## Repository and source identity

- Repository: `Byratino01/neural-grid-gateway`
- Local source checkout: `feature/modular-architecture-regression-v1` at `783d0f1` (base `ab1e9451fdff17d0c3c763ce541474059787b627`).
- The connected GitHub integration published `feature/modular-architecture-regression-v1` as commit `3e01a3a`. It was recreated from the local committed tree through GitHub's API, so the commit IDs differ; the changed source files were compared against the remote branch during publication.
- Current viewer entry: `viewer/v88.8/v70.html`.
- Viewer dependencies are same-origin Three.js `0.169.0`, `OrbitControls`, and `GLTFLoader` via its import map and `viewer/v88.8/vendor/three/` assets.
- The gateway in `server.js` serves the `viewer/v88.8` directory at `/viewer/`, reports monitor-only mode, authenticates short-lived read-only telemetry sessions (900 seconds), validates allowed origins, and exposes authenticated registry/history plus a scoped WebSocket. Workflow execution stays disabled.

## Approved model

- Installed source asset: `viewer/v88.8/orbital-nexus.glb`.
- Original attachment: `3d-jutsu-Neural-Grid-V6-Orbital-Nexus-2026-10-17-09-05-51.glb`.
- Size: 22,000,596 bytes.
- SHA-256: `a64b5e8c90c42132cd3a12c9fa29d21d5803e64890443cfb8bf7ff1645961cf6`.
- GLB 2.0, produced by `THREE.GLTFExporter r178`; one scene, 3,104 nodes, 3,076 meshes/primitives, 491,573 POSITION references, 435,096 triangles, 53 materials, two embedded images/textures, and 118 animation clips.
- Its single JSON chunk and BIN chunk lengths match the file; local structural validation found no out-of-range buffer views/accessors, missing primitive references, or external buffer/image URIs. `extensionsRequired` is empty. Used extensions are `KHR_materials_emissive_strength`, `KHR_lights_punctual`, `KHR_materials_transmission`, `KHR_materials_volume`, `KHR_materials_ior`, and `KHR_materials_clearcoat`.
- The file is copied byte-for-byte from the user-supplied attachment. The integrity test pins its digest and selected structure counts; changing or removing it fails the test until a newly approved baseline is reviewed.

## Viewer structure and preserved interface

The Three.js scene and substantial application logic remain inline in `v70.html`; extraction is deliberately deferred. The scene uses a 49-degree perspective camera at `(0, 25, 42)`, a fixed target at `(0, -0.5, 0)`, ambient hemisphere and directional lights, damped OrbitControls, a continuous render loop, and the existing GLTFLoader-based model import. Import uses the loaded GLB's own geometry, materials, textures, and animation clips rather than generating or substituting a model.

The current dashboard panel titles and order are:

1. Connectors
2. Activity Feed
3. System Status
4. Event Flow
5. Station Metrics
6. Connection Map

The existing panel geometry, CSS, connectors, and scene transforms were not redesigned for this restoration.

## Staging reference comparison

The supplied staging URL was inspected read-only on 2026-10-19. Its visible page reported “Ready: Load your approved Revision 32 GLB” and its request for `/viewer/orbital-nexus.glb` returned HTTP 404. Calls to `/api/v51/jobs` and `/api/v53/policy` also returned HTTP 404. The loaded page therefore did not demonstrate the approved model or those APIs during this observation. The 404 polling repeated while the tab was open; the tab was closed after inspection.

The URL's actual deployed source revision was not independently verified from deployment metadata. The supplied claim that it is deployed from `ab1e9451` remains an input reference, not an observed fact. Do not copy staging files over the preservation branch or change Render configuration on the basis of this comparison.

## Local launch and verification

From the repository root in PowerShell:

```powershell
npm.cmd ci
npm.cmd start
```

Open `http://127.0.0.1:10000/viewer/`. The gateway uses port `10000` unless `PORT` is set. This local launch does not configure staging credentials; the viewer's local model loading is same-origin and requires no provider key.

Run the deterministic checks:

```powershell
npm.cmd test
node --check viewer/v88.8/v71-monitor.js
node --check viewer/v88.8/connector-catalog.js
```

For the actual Three.js/GLB browser smoke test against an isolated static fixture, make Playwright available on `NODE_PATH` and point `PLAYWRIGHT_CHROME_PATH` to installed Chrome or Chromium, then run:

```powershell
node viewer/v88.8/test_v88_8_model_load.cjs
```

To run the same smoke test against the real gateway route and verify the model's `HEAD`/`GET` flow, set `V88_MODEL_TEST_GATEWAY=1` before the command. The script launches a local gateway process with disposable fixture keys and stops it afterward; it does not use staging credentials.

For the five dashboard viewport checks:

```powershell
node viewer/v88.8/test_v88_8_layout.cjs
```

The browser scripts use a local isolated fixture server by default. Supplying `V88_6_URL` selects the caller-provided server and turns on the harness's gateway-authentication flow; use only local CI fixtures for that flow. Neither test targets staging.

## Verification and limitations

- `npm test`: **29 passed, 0 failed**. This includes gateway auth/session/WebSocket, monitor-only behavior, viewer path security, GLB hash/structure, and existing UI/telemetry unit tests.
- JavaScript syntax checks and `git diff --check` (with Windows CRLF recognized) passed.
- The five-viewport Playwright layout matrix passed at 1714×864, 1920×1080, 1366×768, 1024×768, and 768×1024 with six panels and four chart points at each size. The GLB HEAD/GET responses both succeeded and there were no failed fixture resources.
- The separate Playwright smoke test passed against both its isolated HTTP fixture and an automatically started local gateway: the viewer loaded the approved GLB through its own Three.js `GLTFLoader`, reported 3,076 meshes and 118 animation clips, and made no external requests or runtime errors. Gateway-level tests verified the HEAD response carries the model's actual length and the GET body matches the approved SHA-256.
- These checks establish file integrity, structural consistency, local viewer load behavior, and layout at the tested browser/runtime. They do not establish pixel-perfect parity with an independently archived historical Revision 32 screenshot.
- Local server authentication/session/WebSocket behavior is covered by deterministic local fixtures. A fresh live staging session was not exercised, and no staging token was used.

## Next stage plan — 05 / Station Metrics: live application telemetry

Keep the existing visual table and replace only placeholder values after each adapter's source, schema, freshness, and permission scope is reviewed.

### Proposed sources, access, and collection

| Provider | Read-only source and candidate collection | Minimum access / restrictions |
| --- | --- | --- |
| GitHub Actions | `workflow_run` webhook for prompt event updates; authenticated `GET /repos/{owner}/{repo}/actions/runs` for snapshot and gap recovery. | GitHub App or fine-grained token with Actions repository permission `read`; do not request Actions write or trigger/re-run workflows. |
| Render | Render public API metrics and deploy/service status, using service IDs mapped in server configuration. Confirm exact endpoint/query contract in the current OpenAPI specification before implementation. | Server-side API key; call GET only. Render docs describe account API keys as secrets, so avoid introducing a key until its account scope and a read-only service identity are confirmed. OTel streaming is an optional workspace-admin feature and should not be enabled for this phase. |
| Netlify | `GET /api/v1/sites/{site_id}/deploys` and deploy detail reads; poll with a conservative interval, conditional requests where supported, and pagination. | Server-side bearer token with read-only account/site access where available. Never call deploy creation or environment-variable endpoints. |
| OpenAI | Organization Usage API buckets, starting with completions usage and only adding other documented usage endpoints required by the design. | Separate server-only key with Usage read permission. Never place an admin key in the browser; do not issue inference requests to gather metrics. |
| Higgsfield | Public API docs currently describe generation submission, status polling, cancellation, and media results. Treat this as generation activity only if the account's API contract supports read-only history/usage access; do not submit or cancel jobs for telemetry. | No API credential until a read-only history/usage endpoint and least-privilege scope are confirmed. Otherwise report unavailable instead of inferring activity from visual placeholders. |

### Normalized data shape

Use a separate metric record rather than overloading the existing event schema:

```json
{
  "schema": "neural-grid/metric/v1",
  "provider": "render",
  "serviceId": "configured-service-id",
  "metric": "cpu.utilization",
  "value": 0.42,
  "unit": "ratio",
  "observedAt": "2026-10-19T12:00:00Z",
  "periodStart": "2026-10-19T11:55:00Z",
  "periodEnd": "2026-10-19T12:00:00Z",
  "source": "provider-api",
  "staleAfterSeconds": 900
}
```

Also allow explicit `value: null` with an `availability` / bounded `reason` for unsupported, unauthorized, stale, or not-configured measurements. Never turn missing data into zero. Keep provider IDs and metric names stable, preserve source timestamps and units, redact secrets and sensitive IDs from logs, and record freshness per sample.

### Adapter and gateway boundaries

- Add one server-side adapter per provider; browser code only consumes the gateway's read-only normalized response.
- Use webhooks for GitHub's event-oriented workflow updates where possible, with deduplication and bounded history. Poll provider metric snapshots at provider-appropriate intervals with jitter, pagination, caching, timeouts, and rate-limit/backoff handling. Do not poll every browser tab.
- Keep source credentials outside the repository and browser. Add narrow gateway routes protected by the existing origin/session checks; do not add execution routes or broaden current read-only session scopes.
- Map configured services to connector/station IDs explicitly. Preserve null, unsupported, and stale state so the interface never fabricates a healthy/zero metric.
- Validate each adapter first with recorded or synthetic fixtures. Live read-only credentials, provider setup changes, workflows with broader permissions, Render configuration, and deployment each require separate approval.

### Official references checked 2026-10-19

- [GitHub Actions workflow runs API](https://docs.github.com/en/rest/actions/workflow-runs) — list workflow runs requires Actions read permission for fine-grained credentials.
- [Render public API](https://render.com/docs/api), [service metrics](https://render.com/docs/service-metrics), and [metrics stream reference](https://render.com/docs/metrics-streams-reference).
- [Netlify API quick start](https://docs.netlify.com/api-and-cli-guides/api-guides/get-started-with-api/) — HTTPS bearer authentication, sites, deploy listing and deploy details.
- [OpenAI Usage API](https://platform.openai.com/docs/api-reference/usage) and [platform RBAC](https://developers.openai.com/api/docs/guides/rbac) — Usage is a read permission; usage endpoints use organization usage data.
- [Higgsfield API quick start](https://open.higgsfield.ai/quick-start) and [Higgsfield API docs index](https://docs.higgsfield.ai/docs/llms.txt) — verify request/status behavior and available read-only history support before integration.
