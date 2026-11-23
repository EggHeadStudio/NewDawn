# EggHeadStudio: New Dawn

A work-in-progress 3D survival and settlement game. Terrain now streams beyond the original island and has periodic longitude and reflected polar coordinates. This is a **partial planetary foundation**, not yet a fully simulated or freely traversable planet. See [development status](DEVELOPMENT_STATUS.md) for limitations.

## Local development

```powershell
npm.cmd ci
npm.cmd run dev
```

Open the URL printed by Vite. Node.js 20.19+ or 22.12+ is required. On systems where `npm` works directly, `npm` can replace `npm.cmd`.

### Play

- Choose a character name and use **Customize character** to change appearance and rotate the preview before starting. Clothing and armor options are starting cosmetics, not craftable or equippable items.
- **Walk:** WASD or arrows; hold Shift to run. Movement is camera-relative.
- **Camera:** right-drag to rotate and mouse wheel to zoom. The pause menu provides auto-follow, distance, rotation-speed, smoothing and terrain-distance controls. Auto-follow resumes after manual rotation; terrain and buildings can shorten the camera, and trees along its sightline fade.
- **Gather or fight:** Space near trees, rocks, berries, or enemies. Open **Pack** to craft an axe and pickaxe, which increase gathering yields.
- **Interact:** E near Mira or the rover; elsewhere, E digs. Recruit Mira, build storage, then assign wood or stone gathering.
- **Build:** B or Build opens the catalog. Choosing a structure closes it and shows a snapped ghost with its cost and placement status. On desktop, aim at terrain with the mouse, left-click or press Space to place, R to rotate, and Escape or a right-click to cancel; right-drag orbits the camera. On touch, drag on the world to aim above your finger, use A to place and B to cancel, and use the edge toolbar to rotate or change buildings. Two-finger gestures orbit and zoom. Green means the position and resources are valid; red explains why placement is blocked.
- **Modular pieces:** the catalog includes wooden floors, walls, door frames, doors, stairs and flat roofs alongside the existing prefab buildings. Pieces snap to a two-unit grid; use the level buttons (or `[` and `]` on desktop) for levels 0–3. Rotate stairs to lead from a lower level to an adjacent upper floor. Install a door in a matching frame, then use E or mobile B nearby to open or close it. To remove a piece, select the same kind, orientation and level, aim at its slot and press **Remove**; half its wood is returned. Remove a door before its frame.
- **Auto roof:** with the toolbar option enabled, completing a small enclosed wall/frame perimeter adds flat roof tiles if enough wood is available (two wood per tile). If materials are missing, toggle Auto roof off and on after gathering them to retry. Frames count as enclosed edges even when doors are open. Breaking the perimeter removes automatically generated tiles and refunds half their cost; manually placed roofs remain. Remove a roof tile before placing an upper floor in the same slot. Roofs near the player fade for visibility. Automatic roofing is limited to modest areas and wood; floor/roof support physics are not implemented.
- **Rover:** E enters/exits; W/S accelerate or brake/reverse, A/D steer.
- **Power:** place a turbine within four units of a generator; connect generator, battery, cable posts, and lamps by placing neighboring devices within four units. Gold lines indicate connections. Wind varies, lamps consume power, and batteries store surplus.
- **Touch:** left joystick moves; right-side drag rotates the camera, pinch zooms, and A/B are contextual. Tap the minimap for local coordinates. Use the Build and Pack buttons for menus. In the rover, hold A to accelerate, B to brake/reverse, and Exit to leave.
- Pause to save. Saves are stored in the browser's IndexedDB; Continue restores the last save. Autosave runs approximately once per minute. The main menu can export a JSON save or import a validated save after confirmation. Version 1–6 saves and prefab buildings remain readable; a one-time browser-local backup is kept before upgrading to the modular format. Export a copy externally because browser storage can be cleared.
- Travel beyond the original island on land. Oceans still block walking and the rover; boats are not implemented. The minimap shows normalized local planetary coordinates.
- Deer and rabbits flee and can be hunted for food; wolves may attack the player or prey. Birds fly and rest.
- Different enemy types appear at night as days pass; necromancers attack at range. Their progression is based on days, not civilization eras, and active enemies are not saved.

### Install and update

The production build includes an offline shell. Supported browsers may offer **Install Game**; on iOS use Safari's Share menu and **Add to Home Screen**. Availability varies by browser. Fullscreen is attempted after a play action and can be exited from pause settings; unsupported browsers remain in their normal viewport.

An available update prompts **Update Now** or **Later**. Updating saves an active game before switching versions and restores it after reload; a failed save cancels the update. Keep browser storage enabled. Installation and device behavior have not been verified on physical phones.

## Validation

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run preview
```

Browser acceptance tests use Playwright. Install its Chromium browser once with `npx.cmd playwright install chromium`, then run `npm.cmd run test:e2e`. To use an installed Microsoft Edge instead, set `$env:PLAYWRIGHT_BROWSER_CHANNEL='msedge'` before running the test command. The tests use isolated browser contexts and a local Vite server.

## GitHub Pages

Vite uses the production base path `/NewDawn/`. The included `.github/workflows/deploy.yml` installs dependencies, builds the game, and deploys `dist` on every push to `main`.

In repository Settings > Pages, choose **GitHub Actions** as the source. The workflow runs on pushes to `main`; no push or external deployment is performed automatically by local development.
