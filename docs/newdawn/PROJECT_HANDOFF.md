# NewDawn A3.2 -> MacBook Pro / Copilot App handoff

**Baseline date:** 2026-11-26. **Compiled:** 2026-11-27. **Evidence provenance:** supplied project reports and Copilot session transcript, not a fresh local clone/source audit. Keep this document factual and update after the first Mac checkout audit.

## Existing repository and runtime

- GitHub repository: `EggheadStudio/NewDawn` (verify the correct owner/permissions and remote in the actual checkout).
- Pages production base: `/NewDawn/` and intended deployment via `.github/workflows/deploy.yml` on `main` push. **Pre-release**; no assertion that current branch was already deployed.
- Stack: TypeScript, Three.js, Vite, Vitest, Playwright, local PWA, IndexedDB, bundled GLB/texture assets. Asset references must work offline and under `/NewDawn/`.
- Historical Windows project path: `C:\Users\mfi0alta\Desktop\SoftwareDevelopment\New Dawn`. Mac location must be selected by user; do not rely on the Windows path or session-state temp files.
- Latest save format described as **version 12**. Existing versions 1–11 are migrated with appropriate validation and backups. Never wipe browser storage or silently rewrite saves.
- User manages Git commits/push/deployment. Local agents must not commit/push/merge/deploy automatically.

## Final A3.2 report — verified **by the reported run**, not by this handoff ZIP

- **170/170 Vitest** tests pass (36 test files).
- `npm.cmd run build` TypeScript/Vite production build passes; report notes ~873.55 kB main JS bundle and Vite size warning.
- Focused Edge forest and vegetation tests **9/9** pass.
- Complete serial Edge Playwright regression **92/92** passes in 39.1 minutes.
- Offline production preview `/NewDawn/`: 11 environment files returned from service worker cache; new game, save, reload and Continue completed without reported application page errors.
- 623 previous art-review files were restored and SHA-256 verified after browser tests.
- Reported emulator benchmark at 390x844, Medium Edge/SwiftShader recorded 42.3 average FPS, 59.5 median, 49.8ms p95 and 37 frames >50ms in one run. Another sample varied. These are **browser software-renderer timing observations, NOT measured iPhone/Android FPS or GPU memory**.
- 1280x720 same-scene renderer workload: High ~645,799 triangles, Low ~584,183 (9.5% lower). Low is not automatically perceptually accepted and the difference is not a mobile performance certificate.

## What A3.2 added in the live game

- Two experimental adult-tree representations: a Jacaranda-derived broadleaf used for some oak-classified resource nodes, and a Pine Tree 01-derived tall adult pine used for some pine-classified nodes. Both CC0 Poly Haven sources are credited in `ASSET_CATALOG.md`; the pine model is 14.7MB and ~106,749 triangles per source prototype, with sparse needle canopy. Not a finished eight-species tree library.
- `src/tree-occlusion.ts` with authored-foliage localized shader clearance instead of fading whole trees; procedural fallback still uses smooth per-mesh fading; residual ghosting and edge cases remain.
- Fog controlled by weather, daylight, altitude and quality; subtle horizon haze, **not** final cinematic grading.
- Alpha-to-coverage for masked vegetation on multisampled WebGL. Mobile quality bounds remain accessible in Edge viewport emulation.
- Preliminary starfield and faint galactic band in `src/sky.ts`, with sun/moon/weather attenuation. Night sky, moon, clouds and look-up experience remain visually unaccepted.
- Built-in bounded optional 30s performance monitor, frame-time reports and user-initiated copy. It does NOT measure GPU timing/VRAM.

## What remains incomplete and MUST NOT be relabeled as complete

1. **Batch 005D-A / A3.2 visual gates:** adult conifer crown too sparse, broadleaf is Jacaranda not oak, mature forest/undergrowth density and climate distribution, natural grass/cactus, mobile render quality, moon/cloud/Milky Way/readable night, matched scene matrix, physically tested device quality. Optional cinematic DOF not implemented.
2. **Planetary engine 005C-P3:** runtime tangent actor motion exists, but staged `World.setTangentFrame` and `ConstructionRenderer.setTangentFrame` render geometry paths are **disabled in gameplay**; projected terrain, construction and most collision remain. No real hierarchical near/mid/far terrain LOD or workers. Polar seamless gameplay not accepted.
3. **Wildlife:** twelve **procedural/toy** species exist, with limited simulation and articulation. No accepted high-quality anatomical rig/animations, herd/breeding/taming/riding ecology or chunk-wide population handling.
4. **Humans:** player/Mira/raiders use bundled transitional CC0 Quaternius fantasy outfits, incomplete customization and no finished modern/post-apocalyptic clothing, backpack, animation set or LOD. Other enemies remain procedural.
5. **Physics:** lightweight `src/physics.ts` + tangent projectile frame, not full rigid-body / Rapier / ragdoll.
6. **Building:** enterable modular wooden pieces, doors/windows, paid roofs and visual shelter exist but L/T roof joints, smart foundations, advanced materials, realistic paint, structure integrity, energy distribution and better camera still require acceptance.
7. **Gameplay:** gathering, basic smelter, iron pickaxe, primitive power graph, rover, Mira gathering, optional intro, partial roads/paint/terrain and persistent saves. Real crafting economy, tech research, vehicles/boats, systemic alien events, villages, elections and multiplayer are future work.
8. **Assets and PWA:** all nine environment GLBs + two terrain atlases currently total about **49.08 MB** of mandatory environment precache; reports also estimate ~20MB character assets. This is a warning for real mobile startup/storage/VRAM. Do not accidentally commit the original ~948MB pine source geometry or `.copilot/session-state` temp assets.
9. **Player acceptance:** demo/playtest readiness is a distinct future user decision from unit/build/E2E success. A `main` push may publish a pre-release site through Pages, but no claim of public release quality is justified.

## High-risk integration points

- `src/main.ts` still entangles scene orchestration, input, save transactions and parts of simulation. Refactor by tested small boundaries, not wholesale rewrite.
- `src/world.ts`, `src/runtime-frame.ts`, `src/planet.ts`, `src/geography.ts`, `src/construction-render.ts`, `src/physics.ts`: changing one coordinate transform without the related rendering and ray tests can misalign terrain/actors/walls near poles or longitude seam.
- `src/nature-assets.ts`, `src/vegetation-lod.ts`, `src/tree-occlusion.ts`: shared source materials, instanced cover and disposal need coordinated ownership, consistent load order and camera sightline tests.
- `src/save.ts`: maintain v1–v12 validation and intentional import backups. Save compatibility is not a substitute for data corruption tests and actual reload.
- `vite.config.ts`, `src/pwa.ts`: `/NewDawn/` base, cache precache list, service-worker versioning; don't silently increase 50MB assets by several hundred MB or remove offline access.
- `tests/` and `art-review/`: browser tests create/modify screenshot evidence. Back up and preserve accepted before/after captures; do not allow full regression while changing source.

## Project documentation truth hierarchy

- **Product/visual wish list:** `IDEA.md`, `VISUAL_ART_BIBLE.md`, `docs/newdawn/COMPLETE_GAME_VISION.md`, `docs/newdawn/FEATURE_REQUIREMENTS.md`.
- **Order and dependencies:** `MASTER_ROADMAP.md`, `docs/newdawn/DEVELOPMENT_MASTER_PLAN.md`, `IMPLEMENTATION_TRACKER.md`.
- **What is reported done:** `DEVELOPMENT_STATUS.md`, `ASSET_CATALOG.md`, `ARCHITECTURE.md`, `TEST_REPORT.md`.
- **What is actually done:** compiled source + working game + inspected evidence; these override stale documentation. Update the affected documents, never claim a test not run.
- `VISUAL_ART_BIBLE.md` v2.0/2.1 supersedes old 'premium stylized' wording in older design documents; preserve all gameplay ideas from those documents.

## Mac first checkout acceptance

- `git log -1 --oneline` matches the just-pushed approved Windows commit.
- `.github/agents/*.agent.md` and `docs/newdawn/*.md` are visible locally; `README.md`, `IDEA.md`, `VISUAL_ART_BIBLE.md`, tracking docs still present.
- `npm ci`, `npm test`, `npm run build`, `npm run dev` succeed or failures have genuine diagnosis.
- Run limited visual smoke check on Mac browser, then physical iPhone only **after a developer-only Pages test deployment has been explicitly approved**. Do not conflate desktop viewport emulation with physical iOS Safari.
- Initial Game Director agent reconciles tracker (including stale old status rows) against actual sources, preserving the full future vision.
