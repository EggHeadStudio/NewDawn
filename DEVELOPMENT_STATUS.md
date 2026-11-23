# Development status — character and enemy art milestone

Batch 001 is **not complete**. This is a playable, bounded-island milestone, not the full game described in the master prompt.

Batch 001C adds character customization, a limited wildlife simulation, environmental art, and an offline/update foundation. It does **not** complete the requested planet, full wildlife roster, or technology/vehicle progression.

## Character and enemy upgrade

- Original procedural humanoids now have shaped faces, layered clothing, belts, cloaks, fur, additional braided/shaved hair, braided facial hair, hoods and helmets. Knees and elbows are articulated; walking, running, carrying, gathering, building, attacks and hurt reactions use the rig. The new options are starting cosmetics, not manufactured or equipped items.
- Existing NPC appearance seeds still use the original option pools. Version 5 saves include the expanded cosmetics; versions 1–4 remain readable.
- Night spawns can include raiders, undead, necromancers, armored fighters, night creatures and a larger champion. Later types become eligible by elapsed game day, **not** civilization era. Their health, speed, attack range and cooldown differ; necromancers keep distance and fire damaging projectiles. Existing enemies and projectiles are transient and are not saved.
- Screenshots were inspected in the customization preview and in actual gameplay. The models are more detailed than the starting assets but still have simplified, somewhat toy-like proportions and limited expression; they do **not** meet the requested final premium character-art quality. Trees can obstruct characters and enemies at gameplay camera distance.
- There is no equipment inventory, profession-based appearance, manufactured armor, civilization-era progression, unique boss encounter or full enemy-faction system. Models have no LOD or shared character mesh resources; mobile performance has not been measured on physical devices.

## Gameplay and UI quality correction

- The building catalog now closes on selection; an edge toolbar shows the chosen structure, costs, snapped coordinates, validity and rotate/change controls. The translucent ghost has a high-contrast footprint. Mouse hover/click, touch drag, keyboard rotation/cancellation, A/B placement/cancellation and two-finger orbit/zoom are supported.
- Placement checks dry ground, island bounds, slope, player, Mira, rover, resource nodes, existing buildings and affordability before spending. The same building can be placed again after moving the target. Auto-follow resumes when placement ends.
- Catalog, crafting, NPC and pause panels block gameplay input and simulation while open. Focus after pointer use no longer traps desktop movement/actions; minimap coordinates are available by touch, and driving displays speed with a contextual HUD.
- Menu layouts, close targets and placement controls were checked at portrait, landscape, tablet and desktop viewport sizes. Existing save format is unchanged. See [TEST_REPORT.md](TEST_REPORT.md) for what was actually tested.

## Audit of the starting prototype

- **Working foundations:** Three.js terrain and procedural models, movement, a minimap, simple menus, IndexedDB and a Pages workflow.
- **Broken or misleading:** desktop building had no confirmation; mobile lacked interaction; unbounded stone/food could be generated anywhere; removed trees were not saved; save transactions could report success after errors; the HUD claimed health without tracking it. The map claimed longitude wrapping, but movement was clamped to an island.
- **Decorative:** the survivor wandered without tasks; energy machines did not generate or consume energy; enemies chased but did not fight; the rover moved like a character; the inventory and objective UI were minimal. There were no crafting, meaningful seasons or weather.
- **Architecture and quality:** the single main module mixed UI, rendering, simulation, and persistence; terrain and assets were not chunked or instanced; camera controls did not meet the third-person specification. The menu's world-name field did not affect the game.

## Implemented in this milestone

- Camera-relative walking and running, smooth third-person follow, manual desktop right-drag and mobile camera gestures, zoom, terrain/building obstruction checks, and camera settings. Auto-follow holds the movement basis during a continuous input gesture to avoid a feedback loop.
- Finite wood, stone and food nodes; persisted depletion and excavations; two craftable yield-improving tools; real building costs and placement rejection for water, other buildings, the player and island edges.
- Recruit Mira and assign wood or stone gathering. She walks to a node, carries it to storage, deposits it in the shared resource counts and reacts to nearby enemies. A simple obstacle avoidance heuristic is not full pathfinding.
- A distance-connected electrical graph with wind turbine, generator, cable posts, battery and lamp. A turbine must be directly adjacent to a generator; power travels between electrical nodes within four world units. Batteries store surplus, lamps consume it, and calm wind eventually turns an unbuffered lamp off.
- Night enemies can damage the player; the primary action can defeat nearby enemies. Zero health returns the player to the starting area.
- A rover with entry/exit, acceleration, reverse/braking, steering, basic building/water collision, rolling wheels and a chase camera.
- Configurable calendar speed, four seasonal terrain/foliage palettes, deterministic daily clear/cloudy/rain/storm/snow, precipitation, and day/night lighting. Weather effects are primarily visual.
- Low-poly berry bushes, particle bursts for gathering/digging/building/combat, seasonal color changes, and responsive camera/build/NPC/crafting controls.
- Versioned IndexedDB saves with validation, transaction failure reporting, old version-1 compatibility, and persisted inventory, tools, buildings, battery charge, gathered nodes, NPC assignment/cargo, terrain, health and calendar.

## Batch 001C additions

- Modular character appearance with named player, body/face/skin/hair/facial hair/hat/clothing/height options, a rotatable live 3D preview, articulated animation and a deterministic saved NPC appearance seed. Version 5 saves store appearance and wildlife; older versions 1–4 remain supported.
- Deer, rabbits, wolves and birds have procedural models, habitat-based bounded spawning, movement, flight/rest/flee or chase behavior, health and persistent state. Wolves attack the player and prey; hunting non-wolves yields food. This is a small fixed island population, not a complete ecology.
- Broader tree silhouettes, instanced seasonal ground cover, subtle tree/water motion and wildlife animation complement the existing particles and lighting.
- Install manifest, original icons, iOS instructions, optional browser install prompt and fullscreen controls. A versioned offline shell checks for updates, asks before activation, saves an active game first and reloads after activation. It never clears IndexedDB. Browser and platform support vary.
- Fixed keyboard movement after a gameplay button keeps focus, while preserving keyboard activation of buttons.

## Incomplete / limitations

- **World:** a single 96-unit island with hard bounds; no chunk streaming, longitude wrapping, polar traversal, real planetary coordinates, expanded climate, rivers or true full-world traversal. Ground cover is instanced, but resource props and terrain are not; individual prop resources are disposed when removed.
- **Camera and controls:** simultaneous touch gestures were emulated, but physical-device testing is still needed. Camera collision and building clearance are approximations, not full physics; trees can obscure the player. Camera settings are not persisted; the map remains a local minimap and coordinate readout.
- **Gameplay:** only axe and pickaxe crafting; no hunger, stamina simulation, food consumption, construction progress, repair, demolition, explosions, throwable weapons or comprehensive collision with natural props. The map is a local minimap and coordinate toast, not an explored-world map.
- **NPC:** one survivor, two gathering jobs, shared inventory on delivery, basic avoidance and fleeing; no home, needs, advanced navigation, storage capacity or full settlement management.
- **Power:** connections are automatic by distance, not player-drawn wires or independently modeled mechanical networks; battery and lamp behavior is minimal and no power inspection UI is available.
- **Rover:** no vehicle health, trailer or cargo; simplified movement and collision, no full terrain physics.
- **Wildlife:** bears, snakes, squirrels, reindeer, moose, cows, sheep and foxes are absent. No breeding, taming, herds, migration, climate ecology or chunk-based simulation. No respawning after depletion.
- **Visuals and effects:** improved but still simplified low-poly art; no simulated water, explosion, smoke, fire, sparks, camera shake or substantial building-model polish. Ground cover does not follow subsequent digging.
- **Weather:** changes occur at day boundaries rather than smooth transitions; no hemispheres or simulation effects on crops/survival.
- **UI:** no Finnish translation, real map, full inventory, settings persistence, sound controls or comprehensive accessibility pass. The world-name input is currently unused.
- **Audio, multiplayer and progression:** audio and multiplayer are absent. No technology tree, vehicle manufacturing, fuel or civilization eras; the existing rover is freely available.
- **PWA:** offline shell and a two-build update were exercised locally, not deployed to GitHub Pages or installed on physical devices. Native installation prompts, iOS behavior and update failure paths remain unverified. Multi-tab update coordination is not implemented.
- **Placement:** the circular clearance and four-point slope checks approximate footprints; they do not model exact rotated geometry or collisions with wildlife. Aiming is limited to the currently visible island terrain. Device-specific gesture behavior and extended play sessions need physical-device QA.
- Browser smoke checks used a local development server and test save fixtures; they do not prove mobile-device performance or complete all user flows. See [TEST_REPORT.md](TEST_REPORT.md).

## Next milestone

Design a versioned chunk/planet coordinate model and save migration first; implement deterministic neighbor-consistent streamed chunks, unloading, persistent edits/depletion, longitude seams and explicit polar rules with long-travel tests. Preserve the island save format or provide a tested migration. Then add remaining animals/ecology, full update-failure and mobile-device QA, and technology/vehicle manufacturing without breaking the existing survival loop.
