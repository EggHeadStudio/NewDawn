# Test report — Character and enemy upgrade

## Current character/enemy checks

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
