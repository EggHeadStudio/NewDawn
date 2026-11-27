# NewDawn development master plan — dependency-first execution

**Version:** 2026-11-27 Mac handoff, pre-release. **Requirement policy:** `IDEA.md`, `VISUAL_ART_BIBLE.md`, `FEATURE_REQUIREMENTS.md` and the existing tracker contain the retained whole-game scope; this plan schedules rather than deletes it. These phases are priorities, not deadlines. Work can overlap only after dependency and merge review.

## Current baseline: 005D-A3.2 (partial)

Reported final build + 170 unit / 92 serial Edge tests pass. Grounded-realism environment groundwork is visible but not visually accepted. Sparse mature pine/broadleaf crowns; procedural wildlife; transitional fantasy humans; poor sky/cloud acceptance; real phone performance unknown. Planetary scene/physics frame integration and terrain LOD incomplete. See `PROJECT_HANDOFF.md`.

## First Mac session: stabilization, not feature reinvention

**MAC-0.1 — Repository takeover:** first agent verifies correct branch/commit, project docs, dependency install, TypeScript/build, test commands, assets and missing ignore rules. Inspect all changed source/files and A3.2 evidence. Do not silently mark A3.2 complete.

**MAC-0.2 — Real-device and asset budget audit:** run normal gameplay route across Low/Medium/High in desktop Mac browser, check first-load and offline asset sizes, identify overdraw, geometry, memory pressure and startup stutter. Fix obvious critical performance regressions before adding a lot more art. The first physical iPhone Safari test is a separate user-approved Pages test deployment checkpoint, not a precondition for local code audit.

**MAC-0.3 — Current milestone choice:** default continue the existing **005D-A3 visual gate**, prioritizing believable adult conifers/broadleaves and playable camera. However preserve 005C-P3 as foundational **engine blocker**. If dense forests cannot be streamed without serious performance failure, explicitly propose switching back to shared frame/terrain LOD infrastructure. **Do not start unrelated 005E or 007+ while forest/engine gates remain open.**

## Dependency-aware milestones and acceptance gates

| Milestone | Main work | Required proof before closing |
|---|---|---|
| **005D-A3.3** (suggested next approved visual slice, not automatically authorized) | Adult conifer broad crowns, true leafy varied broadleaf, tree-age/clearings; grass/cacti cleanup; close camera occlusion; adaptive asset budget and repeatable photo review | Normal gameplay forest/boreal/desert/close-up captures at matched seed/time; tree selection consistent; Low/Medium/High scene comparisons; baseline and after p95 FPS; save/stream/reload; no 1GB raw assets. |
| **005D-A4** | Sky / climate / night and cinematic layer, grounded in usable sun/moon/cloud/weather; subtle optional DOF and foliage AA after forest gate | Sunrise/noon/sunset/moonlit clear night/new moon/storm screenshots from actual game; camera look-up, moon-cloud occlusion, navigation at night, mobile Low visual acceptance. |
| **005C-P3 completion** (mandatory) | Shared tangent scene transform: terrain, water, construction, actors, collision, camera, rays, projectiles; seam/polar/floating origin; save compatibility | Real equatorial/±60°/±85°/both pole runtime journeys with player/rover/NPC/build/terrain edits/projectiles; all hit/render positions consistent; full regression. |
| **005C-P4** (terrain expansion) | Hierarchical near/mid/far terrain with worker queues, editing invalidation, crack-free LOD, distant mountains and cache limits | Large-scale 100km+ traversal visible at altitude, no repeated island edges, deterministic persistence and consistent atlas; measurable no-stutter streaming, bounded memory, real mobile tests later. |
| **005D-B** | Post-invasion ruins and salvage: one fully explorable weathered house/workshop/roadside POI, optional alien-night clues, rare distant sky event | Enter/inspect/salvage one real POI, seeded stable location and save/stream, collision/lighting/modern scale, mobile menu; no fake cinematic-only props. |
| **005E** | All 12 realistic animal models and species animations, real ecology foundations, flocks/insects/carcass lifecycle in staged sub-gates | One by one model/rig/animation visual at correct scale; test predators/prey, habitat and carcass decay reload, bounded distant and mobile performance. |
| **005F** | Modern player/Mira/raiders, complete customization, backpack/hand rig, animation set and character LOD | Creator vs actual game vs reload exact options, modern outfits/face/height/equipment, animation/attachment, real phone performance. |
| **006A** | General object handling, real item inventory/equipment, crafting/workstation UX, world pickups | Grab/stash/equip/throw/repair/transfer with resource accounting and save/reload, portrait/landscape touch, no phantom items. |
| **006B** | Real physics evaluation and bounded integration, ragdoll, navigation, combat, animal taming/mounts | Rigid-body/contact checks within shared frame, mobile fallback quality, AI pathfinding around player-built walls, riding journey, ragdoll cleanup and save. |
| **006C** | High-quality construction, roofs L/T, foundations, roads, materials, UV painting, electric house systems | Full built irregular house + weather shelter + material workshop + connected road + touch + save/reload + camera interior. |
| **006D** | Regional fire simulation and firefighting, weather/environment impacts, fictional cinematic destruction | Ignite a controlled in-game patch, spreading bounded and saved, bucket suppresses fire, explosion/damage cleanup and measurable render budget. |
| **007A** | Salvage economy, research, manufacturing, vehicles/boats/transport | Real material economy and repair/manufacture/drive/sail journeys, stores and consumables, no free endgame rovers. |
| **007B** | NPC careers, autonomous settlements, distant jobs, shops/households and trade | Persistent multi-NPC village growth with no duplicate resources; player can participate or ignore it. |
| **007C** | Citizenship/reputation/government, elections, factions/war/diplomacy | Explainable votes and actual rights/territory/market consequences, valid Atlas overlays. |
| **008+** | Advanced world, aircraft, trains, oceans, alien portals, multiplayer only after authoritative separation | Each subsystem independently accepted with long-running tests, real phone and operational security controls. |

## Permanent thematic threads across milestones

- **Visual identity:** contemporary reclaimed Earth, not toy geometry; every new model coherent with humans and environment. Preserve nine native environment GLBs, terrain atlases and asset provenance until replaced by better licensed equivalents.
- **Physicality:** small-object grab/carry/throw; material particles; building durability; storms and waves; wind, fire and water interoperate; creature remains and scavengers affect world ecology.
- **World ambience:** birds flying in flocks; migrating V-formations; temperature-aware flies; animated moon, Milky Way; rare far-away UFO/helicopter/aircraft sightings; sound clues for offscreen events.
- **Accessibility:** guided/free tutorial, persistent controls, captions, motion comfort and audio/night intensity settings; no forced horror or unskippable progression.
- **Performance:** real-game screenshot and frame data before/after every asset-heavy milestone. No cosmetic DOF as a substitute for geometry/streaming optimization. Lightweight Low-tier still has realistic close-range trees and humans.
- **Save/multiplayer-readiness:** deterministic IDs, compact regional world state, predictable transactions, no duplicated resources; future authoritative server boundary.

## Deliverable unit (definition of a vertical slice)

Each slice has: feature IDs + dependencies -> design sketch -> source edit -> targeted unit tests -> normal game screenshot/browser journey -> reload/streaming check -> performance sample if material -> documented outcomes. All core source remains runnable. When art quality misses the Visual Art Bible, record partial, capture screenshot and iterate, even when the unit suite is green.

## Scheduling/parallelism policy

Parallel worktrees may safely handle **design documentation/asset evaluation** against a snapshot while Engine Developer fixes a separate math module and QA constructs independent tests. Do **not** simultaneously edit `main.ts`, `world.ts`, global save schema, core package dependencies or Vite precache in two worktrees. Merge carefully and rerun changed test surface. Game Director must stop automatic milestone escalation at the explicitly approved milestone boundary and request user acceptance for the next one.
