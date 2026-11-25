# Test report — Batch 005C geographic movement checkpoint

## Batch 005C subsequent planetary integration slice

- Focused Vitest run: **42 tests passed** across geography, world, wildlife, save and Atlas suites. This includes canonical great-circle actor movement across the antimeridian and at high latitude, optional Mira/wildlife geographic save-state validation, biome-family selection and streamed cactus generation.
- `npm.cmd run build`: TypeScript and production build passed. The main bundle is about 814 kB minified; the existing Vite chunk-size warning remains.
- Microsoft Edge Playwright: **3 targeted tests passed**. Mira moved at high latitude and retained canonical position across reload; an Atlas canvas pixel matched the generated-world biome sample; and a seeded desert region streamed procedural cactus geometry.
- Captured and reviewed actual browser screenshots: [atlas-shared-world.png](art-review/batch-005c/atlas-shared-world.png) and [arid-vegetation-gameplay.png](art-review/batch-005c/arid-vegetation-gameplay.png). The Atlas shows only explored cells and remains visibly coarse. The desert screenshot confirms cactus geometry is present, while terrain and vegetation remain simplified.
- The previous full Edge suite remains 47/47 **before** this slice; no full regression rerun or physical-device testing has been performed after these changes.
- Still incomplete: a shared local-tangent transform for terrain, structures, collision and rendering; full dynamic/static entity integration; LOD, worker generation, global biome and weather acceptance, both-pole runtime journeys, and ocean traversal. Batch 005C is not complete.

## Batch 005C partial implementation checkpoint

- `npm.cmd test`: **106 tests passed** in 25 files. Coverage includes great-circle movement and heading transport, ECEF/tangent round-trips, high-latitude metric distances, save validation/migration, remote chunk streaming and terrain-edit persistence, resource range queries, seam-aware power links, and construction occlusion with a translated render origin.
- `npm.cmd run build`: TypeScript validation and production build passed; the main bundle is about 812 kB minified and Vite retains its existing bundle-size warning.
- Microsoft Edge Playwright: **47/47 passed** in 12.7 minutes. Coverage includes the antimeridian settlement journey and a 60°-latitude travel/save/reload scenario that drives the rover, walks the player, and verifies persisted canonical positions against measured geographic distances. Browser emulation is not physical-device testing.
- Captured an actual noon gameplay screenshot at [antimeridian-gameplay.png](art-review/batch-005c/antimeridian-gameplay.png). It verifies the distant render origin displays the player and streamed terrain; it also shows the current simplified terrain/vegetation quality, not a graphics acceptance pass.
- Version 12 saves persist canonical player and vehicle geography alongside projected coordinates. Versions 1–11 remain loadable from their existing projected positions, with a pre-geographic-movement backup before migration.
- Still incomplete: a runtime local-tangent transform across terrain, structures, NPCs, wildlife and collision; both-pole gameplay acceptance; hierarchical LOD; worker generation; ocean travel; and the full 005C graphics, wildlife, physics, construction and UI acceptance gates. The 005C batch is **not complete**.

## Batch 005B gameplay physics checkpoint
 
## Batch 005B partial implementation checkpoint

- `npm.cmd test`: 99 tests pass in 25 files, including wall/door/line-of-sight collision coverage.
- `npm.cmd run build`: production build passes after physics, jump/swim, stone throwing and compact tool-hub integration.
- `npx.cmd playwright test physics.e2e.ts`: desktop and mobile tool-hub, jump and contextual weapon-control tests pass.
- Final stable Edge run: **46/46 passed** in 12.9 minutes on stable source, including the 2 new physics tests and all existing construction, touch, fire, mining, atlas and world regressions.
- Implemented: player/vehicle/enemy structure collision, open-door passage, wall/window/roof attack obstruction, contact-timed melee, ballistic stones, jump/gravity, water immersion state and a compact mobile tool hub. [Desktop tool hub](art-review/batch-005b/desktop-tool-hub.png) and [mobile tool hub](art-review/batch-005b/mobile-tool-hub.png) screenshots were captured.
- Not verified or incomplete: full Rapier rigid-body simulation, complete AI routefinding, fall/ragdoll, premium animal rework, true UV texture painting, building-level power graph, complete roof/foundation and road grading acceptance, and physical-device testing.

## Batch 005A planetary foundation checkpoint

- Stable baseline unit run: 90 tests passed in 23 files before planetary-source edits. The subsequent geography/atlas implementation run: 97 tests pass in 24 files.
- Final stable Edge run: **44/44 passed** in 15.9 minutes, including 2 new atlas tests, all existing building/construction/touch, fire, mining, seam and save/migration coverage.
- `npm.cmd run build`: production build passes after Earth-scale geography, climate and atlas integration. Vite retains the existing main-bundle-size warning.
- Added geography tests for Earth radius/circumference, longitude wrapping, pole crossing, great-circle bearing, local tangent conversion and opposite hemispheric seasons.
- Added two Edge atlas browser tests: desktop marker add/zoom/save/reload and portrait/landscape viewport visibility. Both pass.
- The baseline full Edge run was stopped after edits began, so this checkpoint does not claim a complete 42/42 stable rerun. Existing suite failures observed during the interrupted baseline were reproducible construction/touch instability and not yet attributable to a stable source result.
- Implemented at this checkpoint: canonical geographic utilities, hierarchical tile IDs, climate-zone helpers, geographic-season/weather adaptation, terrain climate tinting and a save-persistent World Atlas.
- Captured actual atlas screenshots in `art-review/batch-005a/`: desktop, mobile portrait and mobile landscape. These validate atlas UI rendering, not global terrain or physical-device quality.
- Not implemented or claimed: Earth-scale long-distance player travel, worker generation, hierarchical LOD, ocean/continent high-detail streaming, rivers/caves, full terrain materials, real terrain screenshots, physical-device atlas checks or civilization/political overlays.

## Batch 004C partial implementation checkpoint

- `npm.cmd test`: 90 tests pass in 23 files, including twelve-species wildlife spawning, terrain edit/undo, road connection/cost and bounded paint payload coverage.
- `npm.cmd run build`: TypeScript and production build pass after adding wildlife, terrain, roads, paint and graphics controls. Vite retains the existing main-bundle-size warning.
- Browser validation: focused Edge building regressions passed across portrait, landscape, tablet and desktop. The final 42-case run had 38 passes and four failures: save/migration assertions for the intentionally new version 10 format, plus a single 300-second timeout in the 3-minute player-built room journey. Version assertions were corrected and the room journey passed alone in 3.2 minutes; the three save/migration/glass cases passed in a focused rerun. No new 004C terrain/road/paint browser acceptance test is yet included.
- Implemented: twelve wildlife species types, procedural species silhouettes and expanded predator/prey behavior; terrain edit primitives with brush radius and undo; road placement with straight/corner/junction layout data and material costs; per-piece paint presets, strokes and undo; persistent fog/quality settings and version-10 optional save fields.
- Not yet claimed: authored/animated wildlife assets, natural full-roster runtime encounters, chunk-aware population persistence, complete road grading/crossroads/rover traversal, UV-raster painting, full paint replacement cleanup, complete browser/E2E UI audit or physical-device checks.

## Camera, night lighting and fire

- `npm.cmd test`: 87 tests passed in 22 files, including weather-dependent lighting, torch and post state, save validation, pooled sparks, and construction/tree occlusion.
- `npm.cmd run build`: TypeScript and the production build passed. Vite still warns that the main bundle exceeds 500 kB.
- Earlier focused Edge runs exercised torch crafting, equipment and persistence on desktop and emulated mobile; desktop torch-post ignition, extinguishing and reload; and emulated portrait post placement and ignition. Fixtures supply wood and coal and move the NPC and vehicle away. Day and night screenshots of the same scene showed a substantial brightness difference; the held torch visibly illuminated nearby terrain. These are browser emulation, not physical-device checks.
- Reviewed actual noon screenshots of a player-built rectangular house: [outside](art-review/batch-004b-r2/player-built-gable.png) and [inside](art-review/batch-004b-r2/player-inside-gable.png). The player is visible inside, unlike the R1 screenshot, but translucent geometry overlaps the view and trees still obscure part of the exterior. Only wood, glass and noon time were supplied; the house itself was built via the UI.
- A prior full Edge baseline had 33 passes and one intermittent mobile-landscape glass-placement failure. Both mobile glass cases passed in a focused rerun, but the intermittent issue was not proven fixed. An expanded fire run had seven passes and one mobile-landscape post-approach failure: diagnostic positions showed the joystick moving toward the post, but its test stopped after 20 short steps before arriving. The test travel limit was increased without bypassing touch placement, walking or interaction.
- A subsequent full Edge run finished with **40 passed and two failed**. Both mobile post journeys and both mobile glass cases passed, as did the player-built rectangular house. One failure exposed the new contextual hint overwriting the mouse-look hint; the hint logic was corrected afterward. The other desktop post test excavated instead of igniting; the original test did not verify the actual post distance or contextual action before interacting, so it was strengthened afterward.
- After those changes, three repetitions each of the mouse-look and desktop post tests passed, including JSON export/import of the burning torch and post. A later combined-hint test verified the action while pointer-locked but timed out when it tried to click Pause before releasing the pointer; the test was adjusted to release it with Escape, as a player would.
- The next full Edge run had **41 passed and one failed**: the intermittent landscape window test. A focused reproduction showed the same screen tap selecting a neighboring grid slot after the frame was built, rather than the frame's slot. The test now adjusts touch aim and checks the actual frame coordinates and valid status before placing the pane; this is a test correction, not proof that all frame-targeting usability issues are resolved.
- With the corrected touch-aim test, eight portrait and eight landscape repetitions passed, constructing the frame and pane and checking costs and reload each time.
- Final `$env:PLAYWRIGHT_BROWSER_CHANNEL='msedge'; npm.cmd run test:e2e`: **42 passed**. This includes the player-built rectangular house, desktop mouse-look and contextual torch action, handheld and post persistence including JSON export/import, and emulated portrait and landscape post interactions. Some scenarios supply resources or other fixtures as described above; the full R2 visual, weather and device gates are not covered by this suite.
- The [storm-night screenshot](art-review/batch-004b-r2/storm-night.png) is darker than clear night and retains faint terrain silhouettes, but is still very dark without a light; comfortable navigation on actual displays is not established.
- Full R2 acceptance is still open: player-built L/T and connected-room/upper-floor journeys; comprehensive indoor rain/snow and openings; torch-lit interiors; multiple-post travel, chunk revisit and performance; and physical-device checks. Weather does not extinguish fire, and distant post models are hidden rather than chunk-unloaded. Existing electrical lamp integration and premium visual acceptance have not been independently established by this checkpoint.

## Pitched roofs and shelter

- `npm.cmd test`: 74 tests passed in 15 files. Added coverage for deterministic rectangular profiles, L/T single-slope fallback continuity, paid reshaping and pitched retry, save validation, overhead coverage, rain/snow masking, adjacent-room fading and camera height.
- `npm.cmd run build`: TypeScript and the production build passed. Vite still warns that the main bundle exceeds 500 kB.
- The first full Edge run had 24 passes and nine failures. It exposed optional default roof settings in downgraded test saves and the expanded toolbar overlapping mobile A in landscape; both were corrected. Several tests were also interrupted by source hot-reloads while that run was active, so it was rerun on stable source.
- `$env:PLAYWRIGHT_BROWSER_CHANNEL='msedge'; npm.cmd run test:e2e`: all 34 tests passed in the final run. The new desktop journey builds two connected floor tiles and six walls via the UI, replaces two walls with door/window frames, installs a door and pane, selects gable, reshapes the two paid roof tiles, opens the door, walks inside, observes shelter, exports/imports JSON and reloads with the door and pitched roof intact. Only starting wood and glass were supplied.
- [Exterior](art-review/batch-004b-r1/player-built-gable.png) and [interior](art-review/batch-004b-r1/player-inside-gable.png) are real in-game screenshots at sunrise; roof fade is visible in the interior image, but trees and walls heavily obscure the house and player. They do not meet the polished visual gate. No L-shaped, rain/snow or mobile screenshot set, full indoor-weather browser acceptance, touch-specific pitched-roof journey or physical-device testing was performed. Earlier attempts also exposed a JSON negative-zero comparison issue in the test, which was corrected.

## Automatic roof retry

- `npm.cmd test`: 65 tests passed in 14 files. New tests verify insufficient-wood behavior, single payment, independent room payments, manual roof and upper-floor exclusions, disabled roofing, demolition refunds and pending-request save validation.
- `npm.cmd run build`: TypeScript and the production build passed. Vite still warns that the main bundle exceeds 500 kB.
- `$env:PLAYWRIGHT_BROWSER_CHANNEL='msedge'; npm.cmd run test:e2e`: all 33 tests passed. The added desktop scenario closes a partially fixture-built room with insufficient wood, saves and reloads the pending request, gathers a real tree, observes the roof and resource deduction, and reloads again without duplicate tiles or charges. The fixture supplies the incomplete room, positions and initial resources; it is not the requested fully player-built house journey.
- An initial focused run exposed an old-save regression from emitting an empty new field into a test downgraded to version 6. Empty requests are now omitted and both focused scenarios and the full suite pass.
- No new gameplay screenshots or physical-device checks were made. Roofs remain flat; pitched roofs, irregular junctions, shelter and precipitation protection are not implemented or validated.

## Mouse-look, construction and glass

- `npm.cmd test`: 62 tests passed in 13 files. New tests cover exposed floor-edge suggestions, atomic wall/frame replacement, protected inserts, glass production and insufficient ingredients, and version-9 save validation.
- `npm.cmd run build`: TypeScript and the production build passed. Vite still warns that the main bundle exceeds 500 kB.
- `$env:PLAYWRIGHT_BROWSER_CHANNEL='msedge'; npm.cmd run test:e2e`: all 32 tests passed. Desktop coverage exercises pointer lock and release, mouse-relative walking, wall replacement, sand-and-coal glass production, pane installation, resource deduction, unaffordable placement, reload and version-8 migration/backup. The production journey supplies starting materials and repositions the player via a save fixture; it does not inject finished glass.
- Portrait and landscape emulated-touch tests place window frames and panes, deduct glass and wood, and reload; those tests supply finished glass in the fixture. The existing suite also covers touch gestures, doors, mining and a fuelled smelter. These are browser emulation, not physical-device checks.
- An initial full run found a real touch click-through: opening the smelter could activate the forge button under the tap. The action timing was corrected, a regression assertion was added, seven focused touch tests passed, and the full suite was rerun successfully. The new portrait window test also exposed an overly narrow frame-targeting radius; it was corrected and both touch orientations passed.
- Before and after real-gameplay screenshots are in the session evidence directory as `batch004-before.png` and `batch004-after.png`. They are different scenes and viewport configurations, not a controlled visual comparison. The after image shows a window and smelter at gameplay distance, with some character occlusion; it does not validate the full requested art direction.
- No complete player-built house, actual device touch/performance, visual wildlife overhaul, pitched roof, torch, vehicle damage, road or boat acceptance was performed. See [DEVELOPMENT_STATUS.md](DEVELOPMENT_STATUS.md) for unfinished work.

## Mining and smelting

- `npm.cmd test`: 57 unit tests passed in 13 files. New checks cover tool gating, finite deposit progress through streaming and reload, longitude-seam progress, saved-construction exclusions, save validation and atomic smelting inputs/output.
- `npm.cmd run build`: TypeScript and the production build passed. Vite still warns that the main bundle exceeds 500 kB.
- `$env:PLAYWRIGHT_BROWSER_CHANNEL='msedge'; npm.cmd run test:e2e`: all 22 browser tests passed before the subsequent addition of two mobile cases.
- `$env:PLAYWRIGHT_BROWSER_CHANNEL='msedge'; npm.cmd run test:e2e -- mining`: all five updated mining tests passed. Desktop and emulated mobile portrait/landscape tests craft a pickaxe, mine an iron deposit over three strikes and reload mid-progress. Desktop and emulated landscape-touch fixture-assisted tests construct a smelter, reserve ore and fuel, reload a running job, produce two ingots, forge the iron pickaxe and verify its doubled mining yield. Fixtures provide starting resources and position the player; output is not injected.
- These tests do not establish the full requested manufacturing/research/construction journey. No physical hardware was tested. Natural long-distance resource discovery, device performance and interactions with existing complex settlements need more testing.

## Authored character integration

- `npm.cmd test`: 52 tests passed in 12 files, including animation-state selection.
- `npm.cmd run build`: TypeScript and the production build passed; Vite warns that the main bundle exceeds 500 kB.
- `$env:PLAYWRIGHT_BROWSER_CHANNEL='msedge'; npm.cmd run test:e2e -- authored-character`: two browser tests passed. They load real glTF models and clips, check independent skeletons and shared geometry, animate after another instance is disposed, and verify an asset failure reports an error and leaves the procedural fallback.
- `$env:PLAYWRIGHT_BROWSER_CHANNEL='msedge'; npm.cmd run test:e2e`: all 19 browser tests passed. After adding the creator's approximation notice, the nine building/creator browser tests were rerun and passed. An earlier full-suite run had one timeout while source files were being edited during the run; the subsequent stable run passed.
- In an isolated Edge production-preview context, waited for the service worker, switched offline, reloaded and opened the creator. All 47 character runtime files were in the shell cache and the authored preview rendered without a page error.
- Captured creator, masculine/feminine presets, the modern-option approximation, mobile creator, real daytime gameplay with Mira, and nighttime gameplay in `art-review/batch-003b/`. Nighttime used a local save with the calendar advanced to day 3; its necromancer is partially obscured. These are emulated browser views, not physical-device tests. The modern option renders a peasant outfit, not modern clothing. The complete enemy screenshot set, appearance matching, character LOD, physical-device performance and premium visual acceptance remain unverified.
- The mining/manufacturing/research journey was not implemented or tested.

## Character geometry milestone

- `npm.cmd test`: 51 tests passed in 11 files, including character appearance geometry and enemy part checks.
- `npm.cmd run build`: TypeScript and the production build passed. Vite still warns that the main bundle exceeds 500 kB.
- `$env:PLAYWRIGHT_BROWSER_CHANNEL='msedge'; npm.cmd run test:e2e`: all 17 browser tests passed, including appearance save/continue and existing building, construction and world regressions. Some construction and world scenarios use fixtures.
- Screenshots were captured with local Playwright and Microsoft Edge: customization, masculine/feminine/Viking/modern options, and normal-distance daytime and nighttime gameplay. The night image uses a modified local save time. Enemy close-ups were rendered in a separate review scene, not captured from actual encounters. The screenshots are in the session evidence directory `C:\Users\mfi0alta\.copilot\session-state\a0513ca4-0a0a-482f-8c04-734e1218fa31\files\batch003-evidence`; they are not shipped with the game.
- Visual review found improved body shapes but simplified faces and remaining toy-like features. No physical device, performance benchmark, authored rig, LOD, full character art acceptance or complete Batch 003 gameplay journey was verified.

## Modular construction milestone

- `npm.cmd test`: 50 tests passed in 11 files. Focused tests cover cell and edge snapping, costs, occupied slots, vertical placement, door frames and collision, partial refunds, walkable stair surfaces, irregular/connected room detection and version-7 save validation.
- `npm.cmd run build`: TypeScript and the production build passed; Vite still reports the existing bundle-size warning.
- `$env:PLAYWRIGHT_BROWSER_CHANNEL='msedge'; npm.cmd run test:e2e`: all 17 browser tests passed. They exercised player-placed floors at two levels, a frame and door, costs, a version-6 backup, door operation and reload on desktop and emulated mobile portrait and landscape. A fixture-assisted scenario walked up stairs and reloaded on an upper surface with the roof shader present; another completed and removed a partly fixture-built room, checking automatic roof costs and refunds. The room scenario was then extended and rerun successfully to check the roof after reload before demolition.
- These are not a complete player-built, multi-level house journey: the room and stair tests used saved-state fixtures. Roof fading has not been visually assessed across multiple rooms and elevations; chunk revisit, long-session settlement performance, polar construction, and actual touch hardware remain unverified. Mining, processing, chemistry and the requested full progression do not exist yet.

## Current world and save checks

- `npm.cmd test`: 41 tests passed in 10 files. World tests check the original starter resource layout, adjacent chunk vertices, longitude periodicity, polar reflection, chunk unload/reload and limits, rebasing, terrain/resource persistence across a seam, and tree fading. Power tests include a network across longitude copies.
- `npm.cmd run build`: TypeScript and the production build passed. Vite warns that the main bundle exceeds 500 kB.
- `$env:PLAYWRIGHT_BROWSER_CHANNEL='msedge'; npm.cmd run test:e2e`: all 12 tests passed. These include four viewport sizes, building/camera/gameplay regressions, a version-5 settlement backup and migration, an actual walk beyond the former island boundary, a fixture-assisted longitude crossing with a nearby saved building, and JSON export/import with invalid-import rejection and backup.
- A local production preview was tested through two builds: Later, Update Now, automatic restoration of the active game, and offline Continue all passed in an isolated Edge context. No IndexedDB clearing was involved. GitHub Actions deployment and physical installation were not tested.
- Reviewed a normal-distance in-game screenshot after adding sightline tree fading. The character is less obscured in the reviewed scene, but the art remains simplified and other camera arrangements need testing.

**Still needed:** a full end-to-end settlement/technology/transport journey, actual polar-crossing gameplay, long-duration traversal and performance profiling, full seam behavior for wildlife/NPCs, physical-device touch/performance checks, and deployed Pages validation. Technology, manufactured transport and additional wildlife do not yet exist.

## Earlier character/enemy checks

- `npm.cmd test`: 33 unit tests passed in 10 files. Added coverage for day-gated enemy selection, enemy model parts, melee/ranged intent, projectile movement/hits/obstructions/expiry and version 1–5 save validation.
- `npm.cmd run build`: TypeScript and the production build passed; Vite still warns that the main bundle exceeds 500 kB.
- `$env:PLAYWRIGHT_BROWSER_CHANNEL='msedge'; npm.cmd run test:e2e`: all nine browser tests passed, including a new cosmetic preview/save/continue scenario and the existing building and gameplay regressions across portrait, landscape, tablet and desktop emulation.
- Inspected screenshots of the character preview and real gameplay at night in isolated local browser contexts. Raider and undead encounters damaged the player; trees obscured parts of the scene. The resulting models remain simplified and have not met the requested premium visual target.
- The necromancer's projectile collision and other late enemy encounters have not been independently exercised end-to-end in a browser. Real mobile hardware, long-session performance and character LOD remain unverified.

## Earlier gameplay and UI acceptance checks

- `npm.cmd test`: 29 unit tests passed, including placement rejection reasons and existing simulation/save coverage.
- `npm.cmd run build`: TypeScript and the production build passed. Vite still warns that the main bundle exceeds 500 kB.
- `npm.cmd run test:e2e` using installed Microsoft Edge through Playwright: all eight tests passed. The suite exercises 390×844 portrait, 844×390 landscape, 1024×768 tablet and 1440×900 desktop. Browser contexts and their saves are isolated; test fixtures provide construction materials and selected NPC/vehicle/combat positions.
- The building scenarios check catalog collapse, unobstructed center, a rendered ghost via screenshot comparison, terrain aiming and snapped coordinate changes, rotation, resource deduction, overlap rejection, cancel, save/reload and building persistence. They also exercise mouse and keyboard placement, wheel zoom, right-drag/right-click, touch A/B, touch dragging and two-finger pinch/drag, including unaffordable placement.
- Browser regression exercises the character panel, crafting, minimap, pause settings, gathering, digging, recruiting and assigning Mira, driving and exiting the rover, combat and a night-time save. These are representative flows, not exhaustive gameplay or camera-physics validation.
- `npm.cmd audit --omit=dev` reported no production dependency vulnerabilities. A full audit reported three development dependency findings through the existing Vitest/tinypool toolchain; its proposed major-version upgrade was not applied in this gameplay batch.

**Still needed:** real phone/tablet checks for touch, pinch, safe-area insets, orientation and performance; broader browser coverage; long-session gameplay and edge-case collision testing.

## Earlier Batch 001C checks

- `npm.cmd test`: 28 tests in nine Vitest files passed. Coverage includes camera helpers, deterministic island terrain and seasonal ground cover, resource restoration and excavation, crafting and placement, day/night and calendar, NPC activity selection, electrical graph/battery behavior, character appearance, wildlife, and save validation.
- `npm.cmd run build`: TypeScript validation and Vite production build passed. Vite reported a chunk-size warning for the main bundle.
- Integrated browser: customized a named character, saved and continued it; verified the restored appearance. A wildlife fixture exercised four species, wolf damage and removal after combat. Existing fixture data was restored afterward.
- Production preview on isolated local origins: verified a cached offline menu launch; exercised two successive builds, the update notification, Later without reloading, and Update Now with saved game restoration. An earlier update test preserved three gathered wood; a later test exercised the final cache-first worker and restored the named player and inventory. After stopping the preview server, the updated version launched from cache and continued the saved game. No physical installation was tested.
- Production browser regression: saved position, resumed using the on-screen button, held W while it retained focus, and confirmed the saved position changed.
- Integrated browser on the local Vite server: created a world, moved with WASD, gathered a resource, checked insufficient-material construction, saved and continued after reload.
- Browser with a test save fixture: placed a shelter and observed the correct resource deduction; crafted an axe and verified it after save/reload; recruited Mira and assigned a gathering job; observed a wood-gathering NPC deliver resources to storage; entered, drove and exited the rover, then observed the saved vehicle position change.
- Browser resized to a portrait mobile viewport: exercised the on-screen joystick using pointer input and opened the build menu with its place/rotate actions.
- Production preview at `/NewDawn/`: opened a new game, moved, gathered wood, and opened the build menu without a page error; checked that the pause button and resource row fit a 390px viewport.

The browser fixture altered the test browser's local save. No external deployment or push was performed.

## Not verified

- Real mobile/touch hardware, multi-touch and pinch gestures, long-running performance, all terrain slopes or camera-obstacle edge cases.
- Complete end-to-end manual power wiring, combat and full-day/season transitions in the browser; the power and calendar logic have unit coverage only.
- Physical installation and update behavior, update save-failure handling, every browser, multiplayer, or GitHub Actions deployment.
