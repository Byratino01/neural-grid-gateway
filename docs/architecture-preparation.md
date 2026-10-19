# Architecture preparation and risk review

## Baseline
- Repository: Byratino01/neural-grid-gateway
- Starting branch: feature/monitor-mode-gateway-v2
- Starting commit: ab1e9451fdff17d0c3c763ce541474059787b627
- Work branch: feature/modular-architecture-regression-v1
- Scope: preserve approved viewer appearance, scene behavior, security boundaries, and service configuration. No deployment, merge, workstation or Earth changes, credentials, or external authenticated staging access.

## Current architecture map
- `server.js` owns HTTP routes, session/authentication checks, webhook verification, and WebSocket history.
- `connector-registry.js` provides server-side connector identities and status derived from explicit configuration; it does not infer connectivity from webhook setup.
- `viewer/v88.8/v70.html` is the main page and still contains substantial inline layout, scene setup, and application code. It loads Three.js modules and initializes the orbital scene.
- `viewer/v88.8/v70-dashboard.js` builds six dashboard panels and renders activity, event-flow, station metrics, and fixture data.
- `viewer/v88.8/v71-monitor.js` handles monitor state, registry refresh, read-only WebSocket updates, and the monitor session window; it also has its own presentation catalog.
- `viewer/v88.8/v88-icons.js` maps presentation icon references and hides or adds visual entries. Higgsfield remains visual-only.
- Telemetry adapters live in `viewer/orbital-telemetry-adapter.js` and `viewer/v88.8/orbital-v70-telemetry-v88.js`.
- Workflow data and panel controllers already have reusable modules: `viewer/github-workflow-activity.js`, `viewer/github-workflow-visual.js`, and `viewer/v88.8/github-dashboard-controller-v88.js`.
- Existing Node tests and `.github/workflows/gateway-tests.yml` plus `.github/workflows/v88-8-validation.yml` provide server and browser/layout coverage.
- The main page references `./orbital-nexus.glb`, but no `.glb` or `.gltf` asset is tracked in this repository. The existing browser check tolerates this missing optional asset.

## Proposed minimal changes
1. Keep existing module boundaries and add a concise architecture guide documenting ownership, data flow, and the larger inline page as a future extraction seam rather than restructuring it wholesale.
2. Add a focused regression check for scene initialization anchors (module loader, camera, lighting, controls, GLB path and render loop) and explicitly record that a source-level check does not establish that the missing GLB loads or that visuals are pixel-identical.
3. Improve connector metadata/status propagation at the existing registry/monitor boundary without changing connector identities, authentication, route behavior, or visual design.
4. Extend the two existing workflows to run on the new feature branch, retaining the current viewport matrix and test behavior.
5. Run the existing unit/integration checks and the same five-viewport browser validation locally; compare screenshots before and after where the environment supports a consistent capture.

## Risks and limits
- The large inline page and its script ordering make extraction risky; this work should not move scene/UI code across files.
- Registry and monitor status labels must remain compatible with current clients and must not imply live connectivity when only configured.
- Scene-anchor checks can detect accidental source changes but cannot prove WebGL rendering, successful model loading, or semantic equivalence.
- With the model asset absent, real model rendering cannot be verified from this repository; browser checks may only confirm the current fallback behavior.
- Browser captures can vary with browser/GPU/font environment; compare layout and visible behavior, not demand byte-identical images.
- Validation will use local controlled fixtures only; no real staging auth or third-party/private target is in scope.
