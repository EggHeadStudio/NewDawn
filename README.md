# EggHeadStudio: New Dawn

A work-in-progress 3D survival and settlement game. Terrain now streams beyond the original island and has periodic longitude and reflected polar coordinates. This is a **partial planetary foundation**, not yet a fully simulated or freely traversable planet. See [development status](DEVELOPMENT_STATUS.md) for limitations.

The long-term vision and unfinished dependencies are recorded in the [master roadmap](MASTER_ROADMAP.md) and [implementation tracker](IMPLEMENTATION_TRACKER.md).

The player, Mira and raiders use bundled skinned character assets; other enemies and the emergency fallback remain procedural. The asset and customization upgrade is incomplete. See [asset catalog](ASSET_CATALOG.md) and [development status](DEVELOPMENT_STATUS.md).

## Local development

```powershell
npm.cmd ci
npm.cmd run dev
```

Open the URL printed by Vite. Node.js 20.19+ or 22.12+ is required. On systems where `npm` works directly, `npm` can replace `npm.cmd`.

### Play

- Choose a character name and use **Customize character** to change appearance and rotate the preview before starting. Clothing and armor options are starting cosmetics, not craftable or equippable items. Authored models approximate some selections; caps, beanies, helmets, facial shape and modern clothes do not yet have matching assets.
- **Walk:** WASD or arrows; hold Shift to run. Movement is camera-relative.
- **Camera:** click the world to activate desktop mouse-look; Escape releases the cursor. Menus release it automatically, and another world click resumes it. The pause menu provides mouse sensitivity, vertical inversion, an optional legacy right-drag mode, auto-follow, distance, rotation-speed, smoothing and terrain-distance controls. Mouse wheel zooms; terrain and buildings can shorten the camera, enclosed rooms bring it closer, and trees and structural pieces blocking the character can fade. Right-drag is the fallback if pointer lock is unavailable.
- **Gather or fight:** Space near trees, rocks, berries, or enemies. Open **Pack** to craft an axe and pickaxe, which increase gathering yields.
- **Mine and smelt:** Colored-veined deposits contain stone, clay, sand, coal, copper ore, iron ore or limestone. Use Space or A nearby; each deposit yields material over three hits and stays depleted after reloading. A pickaxe is required for stone, coal, ores and limestone; clay and sand can be collected by hand. Pack shows the materials. Build a **Smelter** (6 wood, 8 stone), approach it and press E or B. Two iron or copper ore plus one coal make one ingot; two sand plus one coal make one glass. Each job takes eight seconds of active simulation; close the panel to let it run. At the smelter, spend two iron ingots and two wood to upgrade an existing pickaxe, doubling deposit yields. Copper ingots, clay and limestone currently have no further recipes.
- **Fire light:** Craft a torch in Pack for two wood and one coal, equip it, then ignite or extinguish it there. Unequipping extinguishes it; it has no fuel timer. A wooden torch post costs three wood. Approach an unlit post with the handheld torch equipped and burning and use E or B to light it; use E or B again to extinguish it. The torch and post states are saved. Only four nearby posts provide dynamic light at once, and distant posts are hidden; post light does not use electricity.
- **Interact:** E near Mira or the rover; elsewhere, E digs. Recruit Mira, build storage, then assign wood or stone gathering.
- **Terrain:** the `◇ Terrain` quick control opens Dig, Raise, Flatten, Smooth and Slope editing with a brush radius. Existing structures and roads are protected. Recent edits can be undone.
- **Roads:** the `╬ Road` quick control places automatically connected dirt, gravel or stone road segments. Gravel costs 2 stone and stone roads cost 4 stone.
- **Atlas:** press M or tap the `◎ Atlas` quick control to open the illustrated world map. Pan and zoom in World/Continent/Region/Local scales, reveal explored regions, add named markers and estimate straight-line route time. The atlas is a partial planet foundation: geographic utilities and rendering are functional, while global streaming remains limited to the existing local terrain engine.
- **Movement and combat:** press V or use the mobile Jump control to jump. C throws a stone if stones are available. The compact tool hub selects fists, stick, axe, throwing stones and other build/world tools. Walls and closed structures block player/enemy movement and obstruct melee/projectile attacks.
- **Paint:** the `◒ Paint` quick control targets walls, floors, doors and roofs; it provides starter wood, paint and stone presets, erasing, surface strokes and undo.
- **Graphics:** Pause provides persistent fog start/end, terrain distance and Low/Medium/High quality presets. Settings are stored locally and do not reset the world.
- **Build:** B or Build opens the catalog. Choosing a structure closes it and shows a snapped ghost with its cost and placement status. On desktop, aim at terrain with the mouse, left-click or press Space to place, R to rotate, and Escape or a right-click to cancel; right-drag orbits the camera. On touch, drag on the world to aim above your finger, use A to place and B to cancel, and use the edge toolbar to rotate or change buildings. Two-finger gestures orbit and zoom. Green means the position and resources are valid; red explains why placement is blocked.
- **Modular pieces:** the catalog includes wooden floors, walls, door and window frames, doors, glass windows, stairs and flat roofs alongside the existing prefab buildings. Pieces snap to a two-unit grid; use the level buttons (or `[` and `]` on desktop) for levels 0–3. Walls and frames suggest nearby exposed floor edges; Rotate overrides the suggestion and **Auto edge** restores it. Aim a different wall/frame type at an existing edge to replace it, crediting half the old wood cost. A window requires a matching window frame, one wood and one manufactured glass. Remove the pane before removing or replacing its frame; glass is not refunded. Rotate stairs to lead from a lower level to an adjacent upper floor. Install a door in a matching frame, then use E or mobile B nearby to open or close it. To remove a piece, select the same kind, orientation and level, aim at its slot and press **Remove**; half its wood is returned. Remove a door before its frame.
- **Auto roof:** open **Roof style** in the structural placement toolbar to choose flat, gable or single-slope and an automatic or manual slope axis. Closing a modest enclosed wall/frame perimeter buys its missing roof tiles for two wood each. A gable on an irregular footprint falls back to one connected single slope; incompatible existing roofs or upper structures can force flat sections. The game reports a fallback. To change a complete automatic roof, aim inside its room and select **Apply to aimed room**; reshaping uses the existing materials, costs no wood and gives no refund. Manual roofs and partial rooms are not reshaped. An adjacent room roof or upper structure can prevent pitching. Unpaid requests retain their chosen settings and retry on resource changes; disabling Auto roof pauses retries. Toggle it off and on to retry missing tiles on the aimed elevation, paying for replacements. Breaking the perimeter removes automatic tiles with half-wood refunds, while manual roofs remain. Remove pitched roofs before building above them.
- **Shelter:** enclosed rooms and roofs/upper floors are indexed when construction changes. The HUD distinguishes sheltered rooms, open rooms and overhead cover; roof tiles in the occupied room fade when the camera is above them. Rain and snow particles are hidden locally below overhead cover while exterior weather continues. Frames count as enclosure even with an open door or unglazed window: this is visual overhead protection, not thermal insulation or a survival-stat effect. Large or widely separated wall networks can exceed the existing room-detection limit; construction is not chunk-streamed.
- **Rover:** E enters/exits; W/S accelerate or brake/reverse, A/D steer.
- **Power:** place a turbine within four units of a generator; connect generator, battery, cable posts, and lamps by placing neighboring devices within four units. Gold lines indicate connections. Wind varies, lamps consume power, and batteries store surplus.
- **Touch:** left joystick moves; right-side drag rotates the camera, pinch zooms, and A/B are contextual. Tap the minimap for local coordinates. Use the Build and Pack buttons for menus. In the rover, hold A to accelerate, B to brake/reverse, and Exit to leave.
- Pause to save. Saves are stored in the browser's IndexedDB; Continue restores the last save. Autosave runs approximately once per minute, and mining and smelting changes also trigger saves. The main menu can export a JSON save or import a validated save after confirmation. Version 1–11 saves and prefab buildings remain readable; version 11 adds atlas exploration and marker state, and older worlds receive browser-local engineering/planet-engine backups. Export a copy externally because browser storage can be cleared.
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
