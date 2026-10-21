# Phase 4.5 Candidate Adoption and Staging Report

## Result

The locally reviewed Phase 4.5 GLB candidate is now the default asset in the existing V88.8 viewer. The original remains preserved and is still available through an explicit viewer rollback URL. This is an adoption candidate on the active feature branch; it does not replace or overwrite the preserved GLB.

- Candidate: `viewer/v88.8/candidates/orbital-nexus-phase-4-5-candidate.glb`
- Candidate SHA-256: `fbdf534f9f4f54746b4b0837eb67be8e202adc41ee39dac8eb1d2c17d02ba9ad`
- Preserved original: `viewer/v88.8/orbital-nexus.glb`
- Original SHA-256: `a64b5e8c90c42132cd3a12c9fa29d21d5803e64890443cfb8bf7ff1645961cf6`
- Viewer default: candidate
- Viewer rollback: add `?asset=rollback` or `?asset=original` to the viewer URL
- Viewer candidate: default, or `?asset=phase-4-5`

The only viewer selection change is the bundled GLB URL/name selection in `viewer/v88.8/v70.html`. Monitor Mode, Explore Mode, existing UI, and runtime Three.js effects remain intact. No telemetry, Render service configuration, Explore UI, or production deployment changes were made.

## Candidate and fidelity

The candidate is the JSON-only material variant described in the [preparation report](phase-4-5-blender-production-report.md), not a Blender-exported GLB. Its binary geometry chunk is byte-for-byte identical to the approved original, and automated structural validation confirms 3,104 source nodes, 3,076 meshes, 118 animation clips, 2 embedded images, preserved node transforms and animation tracks, and unchanged mesh/material assignments. Candidate glass has no glTF transmission extension. Blender import and authored material settings were inspected, but Blender GLB export did not complete; this is an explicit limitation.

## Viewer review and rendering statistics

Loaded both assets in the existing Three.js viewer in fixture mode. Candidate and original each loaded with 3,076 meshes and 118 animation clips. The browser audit reported 435,096 mesh audit triangles for both.

| Renderer counter | Candidate | Approved original | Change |
|---|---:|---:|---:|
| Scene/shadow draws | 3,259 | 6,236 | 47.7% fewer |
| Model draws | 3,099 | 6,076 | 49.0% fewer |
| Transmission target draws | 0 | 2,977 | removed |
| Scene triangles | 517,958 | 917,502 | 43.5% fewer |
| Postprocessing draws | 14 | 14 | unchanged |
| Geometries | 3,134 | 3,134 | unchanged |
| Runtime textures | 19 | 20 | one fewer |
| Pixel ratio | 1.25 | 1.25 | unchanged |

A visual inspection of the candidate showed the intended readable, non-transmissive glass appearance and no obvious loss versus the approved Phase 4C B visual direction. Runtime effects that GLB cannot represent remain in Three.js.

A valid foreground Windows benchmark was not obtained. Browser FPS samples were taken while the automation tab lacked foreground focus and are not performance evidence. No 60 FPS claim is made. Rendering counters are scene comparisons, not a foreground timing benchmark.

## Tests and staging deployment

`npm.cmd test`: 55 passed, 0 failed. This includes preservation checksum, candidate structural checks, viewer candidate/rollback selection, static asset serving and access-boundary checks, and the existing gateway regression suite.

Staging target verified in Render **My Workspace**: `neural-grid-monitor-staging` (`srv-dba0pl2jnfac73dttsug`), URL `https://neural-grid-monitor-staging.onrender.com`. Its configured source branch is `feature/monitor-mode-gateway-v2` and auto-deploy is disabled. The production services on `main` were excluded. A service-side branch change is out of scope. Deploy only the validated active feature-branch commit through Render's specific-commit manual deploy flow, if that flow accepts the commit after the active branch push; otherwise stop and report the blocker. Do not trigger a deploy of the configured staging branch by accident.

## Rollback and limitations

To restore the original asset in the viewer, use `?asset=rollback` / `?asset=original`; remove the query and reload to return to the candidate. Reverting this local adoption commit also restores the original as default. Render deploy rollback remains available through Render's prior live deployment if staging deployment succeeds.

The Blender export round trip, valid foreground Windows FPS benchmark, and Render live deployment remain separate verification gates until explicitly recorded below. No service reconfiguration, telemetry integration, merge, or production deployment is included.

### Deployment record

- Validated local adoption commit: `58492743e979a8c5786c4e5b769f117bfbac0445`
- Push result: blocked. The local Git credential helper failed to launch and GitHub rejected the push because this checkout had no promptable credentials.
- Staging deploy ID/status: not started. No Render deployment was triggered because the service is configured for another branch (`feature/monitor-mode-gateway-v2`), and triggering that configuration could deploy the wrong revision.
- Staging viewer verification: pending credentialed push of the active feature branch, followed by a manual deploy of the exact validated commit through Render's specific-commit flow.

