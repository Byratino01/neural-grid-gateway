# Phase 4.5 Blender Production Preparation Report

## Scope and preservation

Prepared on `feature/v88-8-chatgpt-readonly` from Phase 4C commit `facb2d9a572f10b05622576a3717cdc63578aa4e`. The approved source remains `viewer/v88.8/orbital-nexus.glb`; its SHA-256 is still `a64b5e8c90c42132cd3a12c9fa29d21d5803e64890443cfb8bf7ff1645961cf6`.

The candidate is a separate file at `viewer/v88.8/candidates/orbital-nexus-phase-4-5-candidate.glb` (22,000,192 bytes; SHA-256 `fbdf534f9f4f54746b4b0837eb67be8e202adc41ee39dac8eb1d2c17d02ba9ad`). It is not the default asset and does not replace the approved file.

## Blender availability and import inspection

Blender 5.2.2 LTS is installed. No saved `.blend` project existed in the repository. The approved GLB was imported into Blender, the two glass materials were adjusted in the imported scene, and a review project was saved at `artifacts/phase-4-5/orbital-nexus-phase-4-5-candidate.blend`. The preparation script is `scripts/prepare-phase-4-5-blend.py`.

Blender's loaded scene reports 3,104 objects, 3,076 mesh objects, and 118 actions. `R13_glass_blue` and `V7_optical_cyan_glass` both import with Transmission Weight 0 and alpha 0.38; roughness is at least 0.24 and metalness at least 0.12. This confirms import and authored Blender material state.

A Blender GLB export was attempted from the imported scene, but Blender did not complete an export or produce a file. No Blender-exported asset was accepted. Consequently, a Blender round-trip export comparison is **not verified** in this preparation.

## Candidate construction and preservation checks

To avoid accepting an incomplete Blender round trip, the candidate GLB was constructed from the approved GLB by changing only the JSON material definitions. The source binary chunk was copied byte-for-byte. The candidate keeps the original node and mesh tables, transforms, animation channels, station names and identifiers, material indices, accessors, embedded image/texture references, and geometry data. The two target glass materials use the Phase 4C B values: alpha 0.38, metallic 0.12, roughness 0.24, emissive color multiplied by 1.35, and `alphaMode: BLEND`. Transmission and zero-thickness volume extensions are removed from those glass materials; other materials and asset data remain unchanged.

Automated candidate checks confirm:

- 3,104 nodes, 3,076 meshes, 118 animation clips, 2 embedded images, and 20 textures retained.
- Candidate binary chunk is identical to the approved source binary chunk.
- Node hierarchy/transforms, mesh primitives and material assignments, animation tracks, accessors, buffer views, image records, and texture records match the approved GLB.
- Both glass materials have no transmission extension.
- The original GLB checksum remains unchanged.

The Blender `.blend` scene is useful for inspection and further authoring. The deliverable candidate GLB is the byte-preserving material-JSON variant, not a Blender-exported GLB. This distinction matters for final production sign-off.

## Viewer selection

The existing viewer now supports an explicit, reversible candidate selection. The approved asset remains the default; adding `asset=phase-4-5` to the viewer URL loads the candidate. Removing that parameter restores the approved GLB after reload. For example:

- Approved default: `/viewer/v70.html?fixture=1&renderStats=1`
- Candidate review: `/viewer/v70.html?fixture=1&renderStats=1&asset=phase-4-5`

The viewer retains Monitor Mode and the existing Explore Mode controls and UI. The candidate is served from the isolated viewer directory at `/viewer/candidates/orbital-nexus-phase-4-5-candidate.glb`.

The browser automation service and the attached Windows Chrome could not reach the local viewer server at `127.0.0.1:18765` (connection timed out). Therefore a Three.js candidate load, matched screenshots, and in-view rendering-stat capture were not completed in this run. The route and asset selection are covered by automated source checks, but this is not a substitute for a successful live viewer review.

## Performance and visual comparison

The candidate removes transmission from the two GLB glass materials. The Phase 4C B report measured 3,259 scene/shadow draws, 3,099 model draws (zero transmission-target submissions), 517,958 scene triangles, 14 postprocessing draws, and 3,134 geometries / 20 textures for its runtime material variant. Those are Phase 4C runtime measurements, **not measurements of this candidate GLB**. The candidate's expected material behavior is comparable, but its renderer counts were not captured in the viewer here.

No candidate FPS or frame-time benchmark is available. No 60 FPS claim is made. The candidate's visual appearance was not captured in the viewer during this run; the prior Phase 4C B screenshots remain the reference appearance for the same material recipe, not candidate screenshots.

## Automated checks and remaining gate

The focused Phase 4.5 preservation and candidate-selection tests pass. The full `npm.cmd test` suite passes: 55 passed, 0 failed. The existing source assertion that expected the old literal asset fetch now checks the explicit candidate selector and approved default. The static serving test also verifies the separate candidate URL and checksum. No final candidate activation is authorized by this report.

Before final adoption, complete a Blender export round trip or formally retain the JSON-only material candidate, load the candidate in the actual Three.js viewer, review the matched visual at default and orbit/zoom angles, capture draw/resource counters, and run a foreground Windows benchmark. Keep `orbital-nexus.glb` as the default until those reviews pass and the user approves adoption.

## Follow-up

The preparation report above records the state at the time it was created. Candidate adoption, live Three.js viewer checks, updated renderer counters, and staging deployment status are tracked in [phase-4-5-adoption-report.md](phase-4-5-adoption-report.md). The preparation report's pre-adoption gate and failed-local-viewer note are historical, not the latest status.
