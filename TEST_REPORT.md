# Test report — Batch 003C partial economy milestone

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
