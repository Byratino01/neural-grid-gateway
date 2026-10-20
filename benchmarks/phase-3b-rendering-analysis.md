# Phase 3B rendering analysis

## Draw-call reconciliation

The approved GLB remains unchanged (SHA-256 `a64b5e8c90c42132cd3a12c9fa29d21d5803e64890443cfb8bf7ff1645961cf6`). Its JSON contains 3,076 mesh nodes and one primitive per mesh. It uses 53 materials. There are no repeated geometry/material primitive signatures suitable for safe instancing; all 118 animation clips remain in the asset.

The 6,236 `renderer.info` scene submissions are real `renderBufferDirect` dispatches. A diagnostic-only hook, sampled once every 1.5 seconds, separates the current baseline frame into 6,076 model submissions (including transmission), 160 viewer-overlay submissions, and zero shadow submissions. A same-configuration capture identifies 2,977 of the model submissions targeting the transmission render target. Those are included within 6,076, not additional to it. Bloom/output postprocessing adds 14 more submissions, reported separately.

This explains the apparent mesh/draw mismatch: the GLB includes 118 uses of the `R13_glass_blue` material (glTF `KHR_materials_transmission` factor approximately 0.78), plus one `V7_optical_cyan_glass` use (factor approximately 0.32). Three.js renders an opaque-scene capture to a separate target for transmissive surfaces. The capture uses the same camera, so camera-only instrumentation would not distinguish it. The new target-aware renderer hook does. Transparent double-sided surfaces also submit front/back draws. The GLB has 119 transmissive primitives; hidden/frustum-culled components and overlays make the runtime number differ from a simple `3076 × 2` estimate.

The scene pass has zero shadow draws because the 3,076 model meshes have zero cast-shadow flags at runtime. The light itself is configured to cast, but it has no mesh casters in this scene. Bloom's 14 post draws are small compared with the thousands of scene/transmission submissions. The PMREM reflection environment is generated during setup, not every animation frame.

## Candidate ranking

1. **Transmission cost — highest measured draw opportunity, material appearance risk.** The opaque scene capture accounts for 2,977 submissions. Removing or weakening transmission could reduce that work but changes the approved glass appearance. No such change was made; an isolated visual/performance experiment should precede any product change.
2. **Pixel ratio — measured GPU improvement, resolution tradeoff.** Two 30-second runs per setting showed mean FPS 28.9 at 1.25 and 30.45 at 1.0 (+5.36%); average GPU time changed from 27.54 ms to 25.785 ms (−6.37%). The starting 1.25 ratio was restored. The default remains unchanged pending approval because the lower ratio reduces rendering resolution.
3. **Mesh batching/instancing — no safe candidate identified.** The imported primitive signatures are unique, and 118 mesh nodes are animated. Broad merging or instancing risks station selection, transforms, and animation.
4. **Shadows — no current mesh-pass opportunity.** There are no mesh shadow casters; disabling shadows was already shown not to produce a repeatable gain.
5. **Postprocessing and CPU traversal — lower measured priority.** Fourteen post draws are present. No repeated geometry identity or per-frame PMREM render was found. No scene graph rewrite or object deletion is warranted by current evidence.

## Benchmark caveats

The benchmark kept the same page, camera, viewport, baseline mode, and animation with three seconds of warm-up and thirty seconds per run. GPU timer queries consistently favored ratio 1.0. CPU P95 and 1% low FPS varied between repeats. The local page also emitted repeated 404s while polling unrelated API paths, so the browser-side CPU/frame figures may include that background activity. Results are directional and do not establish 60 FPS readiness.

## Files and tests

The browser diagnostic hook and ratio comparison are opt-in through `?renderStats=1`; the normal viewer's render ratio and effects remain as before. The comparison restores the original ratio even if interrupted. The approved GLB checksum and 118-clip integrity test pass. Full test suite: 49 passed, 0 failed.
