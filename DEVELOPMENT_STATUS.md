# Development status — Batch 001B

Batch 001 is **not complete**. This is a playable, bounded-island milestone, not the full game described in the master prompt.

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

## Incomplete / limitations

- **World:** a single 96-unit island with hard bounds; no chunk streaming, longitude wrapping, polar traversal, real planetary coordinates, expanded climate, rivers or true full-world traversal. Terrain and objects are not instanced; individual prop resources are disposed when removed.
- **Camera and controls:** no physical-device testing or simultaneous multi-touch verification; slope clearance and building raycasts are approximations, not full collision physics. Camera settings are not persisted. No camera mouse-picking or complete map screen.
- **Gameplay:** only axe and pickaxe crafting; no hunger, stamina simulation, food consumption, construction progress, repair, demolition, explosions, throwable weapons or comprehensive collision with natural props. The map is a local minimap and coordinate toast, not an explored-world map.
- **NPC:** one survivor, two gathering jobs, shared inventory on delivery, basic avoidance and fleeing; no home, needs, advanced navigation, storage capacity or full settlement management.
- **Power:** connections are automatic by distance, not player-drawn wires or independently modeled mechanical networks; battery and lamp behavior is minimal and no power inspection UI is available.
- **Rover:** no vehicle health, trailer or cargo; simplified movement and collision, no full terrain physics.
- **Visuals and effects:** the original simple low-poly art remains; no major asset-family expansion, water simulation, explosion, smoke, fire, sparks, camera shake or substantial building-model polish.
- **Weather:** changes occur at day boundaries rather than smooth transitions; no hemispheres or simulation effects on crops/survival.
- **UI:** no Finnish translation, real map, full inventory, settings persistence, complete character preview, sound controls or comprehensive accessibility pass. The world-name input is currently unused.
- **Audio, multiplayer, PWA:** audio and multiplayer are absent. A basic service worker and manifest exist, but installability and offline behavior have not been comprehensively verified; the manifest has no icons.
- Browser smoke checks used a local development server and test save fixtures; they do not prove mobile-device performance or complete all user flows. See [TEST_REPORT.md](TEST_REPORT.md).

## Next milestone

Complete end-to-end Batch 001 gameplay: robust NPC pathfinding/storage, combat and tool feedback, configurable saved settings, touch-device QA, and save recovery. Then implement streamed deterministic chunks and wrapping longitude with a tested coordinate model before claiming a planet. Expand art and effects after correctness, followed by full engineering and multiplayer batches.
