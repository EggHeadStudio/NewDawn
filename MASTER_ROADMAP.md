# New Dawn master roadmap

This is the durable vision, not a claim that the features exist. See [IMPLEMENTATION_TRACKER.md](IMPLEMENTATION_TRACKER.md), [DEVELOPMENT_STATUS.md](DEVELOPMENT_STATUS.md) and [TEST_REPORT.md](TEST_REPORT.md) for current evidence and limitations.

At the start of every development batch, read these four documents, identify the highest-priority unfinished dependencies and continue from the existing code. At the end, update the tracker, completed and partial work, blockers, executed tests and next milestone. Preserve unfinished requirements and save compatibility.

## 1. Planet and exploration

Create a massive procedural Earth-like world with streamed chunks, continents, oceans, islands, mountains, forests, deserts, tundra, polar regions, rivers, lakes and caves. Support longitude wrapping, proper polar traversal, climate zones and northern/southern hemispheres, distant terrain LOD, persistent terrain modifications, efficient loading, seamless exploration, map discovery and navigation.

## 2. Time and environment

Model dawn, day, dusk and night; four seasons; rain, storms, snow and wind; atmospheric lighting and seasonal vegetation. Add temperature, weather effects on survival and activities, and water and natural environmental simulation.

## 3. Characters and visuals

Deliver grounded realistic human characters rather than Playmobil-like figures, using authored rigged GLB/GLTF, smooth animation and mobile optimization. Support masculine and feminine variation, faces, bodies, skin tones, hairstyles, beards and accessories; modern and post-apocalyptic default outfits, profession-specific, industrial and optional historical clothing; real equipment and armor; customization and persistent identity. NPCs and enemies require comparable visual quality.

## 4. Enemies and combat

Include raiders, undead, necromancers, armored fighters, night creatures, elites and bosses; distinct melee/ranged combat behavior, weapons and equipment progression, factions, hostile settlements, animations and effects.

## 5. Wildlife and ecology

Support deer, rabbits, wolves, birds, bears, snakes, squirrels, reindeer, moose, cows, sheep and foxes, with biome-dependent spawning, predator/prey interactions, herds, breeding, taming, livestock, migration and chunk-based simulation.

## 6. Modular construction

Provide block-by-block foundations, floors, walls, corners, doorframes and operating doors, windows and glass, multiple levels, stairs and platforms. Support wood, stone, brick, metal and advanced materials, durability and repair, automatic and varied roof styles, indoor/nearby roof transparency, weather shelter, demolition and refunds, blueprints, interior furniture/equipment, chunk persistence and eventual NPC/automated construction.

## 7. Resource economy

Gather wood, stone, clay, sand, coal, limestone, copper and iron ores and advanced minerals. Add mining tools, lumber production, kilns, furnaces/smelters, metalworking, glassmaking, recipes, manufacturing equipment, production facilities, storage and transportation.

## 8. Chemistry and research

Provide chemistry research stations, interactive material experiments, discoverable recipes, useful compounds, coatings, improved construction materials, battery/electrical materials, advanced alloys and research-driven technology. Energetic materials must use fictional abstract ingredients rather than real hazardous synthesis instructions.

## 9. Civilization progression

Progress through primitive survival, woodworking, stoneworking, farming, metal discovery, mechanical technology, wind and water power, industrial manufacturing, combustion, electricity, automated production, modern civilization and advanced engineering. Unlocks must affect real gameplay.

## 10. NPC civilization

Support multiple recruitable NPCs with unique persistent appearances, skills and personalities; gathering, mining, farming, construction, processing, storage and deliveries; work/rest schedules, housing and food needs, settlement management, NPC construction and automated villages/cities, trade, roads, logistics and inter-civilization relations.

### Autonomous society and politics

- Independent settlements have stable identities, suitable geographic sites, residents, homes, shared resources, buildings, security, production, growth and persistent history. Near residents use visible jobs and movement; distant communities advance through bounded, deterministic coarse simulation without duplicating people or resources on streaming or reload.
- Individuals have persistent identities, appearance, personality, skills, needs, routines, goals, relationships, occupation, property, inventory and wealth. Personality influences actual decisions. Lumberjacks, farmers, miners, merchants, builders and guards perform real tasks, production and deliveries rather than decorative animations.
- Households and communities own finite goods and currency. Barter and money transfer real value, prices respond in bounded ways to supply, demand, season, capacity and access, and offscreen inter-settlement trade conserves stocks and wealth.
- Local reputation distinguishes fame, trust, respect, influence and hostility per settlement. Contextual actions and bounded histories explain changes; membership and citizenship confer explicit rights and responsibilities.
- Territory follows sites, property, infrastructure, influence and competing claims; expansion and disputes must not overwrite player property. Governance may be tribal, council-based, elected or monarchical as appropriate, with credible laws and settlement-specific authority.
- Periodic elections have eligible candidates and voters whose seeded decisions reflect trust, relationships, security, economy, performance and personality. A legitimately elected player can exercise real administrative powers. Regional and kingdom progression requires legitimate formation, succession and ownership, not wealth alone.
- Bilateral diplomacy records causes, agreements, trade, alliances, grievances and leadership. Disputes, raids and war have consequences for resources, trade, safety, territory and civilians; peace, reparations and treaties must change simulation state. Supernatural enemies remain distinct from human factions.
- The world must develop independently of the player. Persistent bounded events explain meaningful economic, political and military changes rather than relying on random decorative NPC spawns.

## 11. Transportation

Develop craftable handcarts, rafts, rowboats, motorboats, cargo boats, cars, trucks, tractors, trailers, aircraft, seaplanes and helicopters. Include manufactured components and engines, fuel production/storage/consumption/refueling, repairs, cargo, ownership, NPC operation, roads, ports and airports. Survival vehicles should follow technology progression rather than spawning freely.

## 12. Engineering

Build mechanical gears and shafts, wind and water power, electricity, batteries, power networks, electrical machinery, water networks, production automation and later industrial systems.

## 13. Multiplayer

After the simulation is ready, support a future authoritative backend using Cloudflare Workers, Durable Objects and WebSockets, authentication, shared persistent worlds, collaborative construction, NPC/wildlife synchronization, security/anti-cheat and efficient state updates. Do not implement multiplayer before the simulation boundary is ready.

## 14. UI, audio and PWA

Provide excellent mouse/keyboard and touch controls, contextual A/B actions, practical gamepad support, responsive menus, inventory/crafting, character creator, technology/research UI, full map, sound effects, ambience and potentially original music. Persist settings, support Finnish and English, installation, supported fullscreen, offline operation, safe GitHub Pages updates, IndexedDB save preservation and mobile performance.

## Current priority

The approved Batch 005D-A3.2 continues Grounded Realism and supersedes the earlier stylized visual target. Five authored tree prototypes include experimental selectively placed mature broadleaf and pine visuals; corrected plant alpha, a shrub, six PBR terrain families, preliminary vegetation LOD and material impacts are integrated. Local foliage sightline clearance, weather/daylight/altitude-sensitive haze, multisampled alpha-to-coverage and a stronger Low-quality vegetation reduction are also implemented but have not completed device/art acceptance. Current mature-tree captures still show sparse crowns. A bounded sustained benchmark and initial starfield are available, but convincing mature forests, ground vegetation, cinematic quality, sky visual acceptance, quality-tier profiling and release validation remain incomplete. Continue the approved A3.2 checkpoints before starting a future major milestone; see the status and test report for evidence. The following planetary work remains mandatory and must not be represented as complete:

Batch 005C-P3 is in progress. Player, rover and nearby actors step in a relocating local tangent frame; distant actors retain great-circle movement. Canonical positions persist for player/rover and optionally Mira/animals. Terrain and construction have staged tangent geometry paths, but they are not enabled in gameplay; player/rover collision, line-of-sight and rendering still use projected x/z. Complete and test a shared local-tangent entity/render transform across terrain, structures and collision before bounded hierarchical terrain LOD. The Atlas samples generated biomes, and streamed vegetation has initial latitude-aware forest families and desert cactus; do not claim planet acceptance. Preserve the unfinished mining-to-manufacturing and research loop, authored-character limitations, and all documented art requirements.

### Batch 005C-P2C mobile HUD acceptance

- Keep the minimap in a sensible corner and move resource counts into a compact, optionally expandable group that does not sit beneath the map or block the gameplay center. Keep the joystick at bottom left and A/B at bottom right; keep secondary actions in the Tool Hub.
- Use responsive safe-area positioning, translucent readable panels, touch-sized controls and non-obstructive notifications. Expanded Build, Terrain, Road, Paint, Inventory and Atlas interfaces must fit, scroll where needed and retain reachable close/exit controls.
- Verify actual running-game layouts and critical bounding-box intersections, horizontal overflow, scrolling, closing and simultaneous joystick/action touch in Playwright at 360×800, 390×844, 430×932, 844×390, 932×430 and 1024×768. Save before/after gameplay and expanded-panel screenshots under `art-review/batch-005c-p2c/mobile-ui/`.
- Browser emulation is not physical-device acceptance; report the distinction and retain device testing as an open limitation.

## Batch 004C permanent requirements

- Wildlife: implement twelve distinct species groups, authored or original procedural models, species-specific movement, biome habitats, herd/predator behavior, chunk-aware bounded populations and persistent important state.
- Terrain engineering: provide brush, flatten, raise/lower, smooth and slope operations, construction/road/deposit protection, fill accounting, undo and chunk-persistent edits.
- Roads: provide dirt, gravel, stone and future advanced road materials, automatic segments/intersections, grading and rover/NPC navigation compatibility.
- Building customization: provide per-surface color and material presets, normalized freehand strokes, eraser and undo/redo, bounded paint storage and stable piece-ID persistence.
- Graphics/UI: provide persisted fog and draw-distance controls, device-sensitive quality presets, professional tool modes and responsive safe-area layouts.

## Batch 005A permanent requirements

- Planet engine: use a 6,371-km-radius Earth model with 40,030-km equatorial scale for canonical geographic calculations, local floating origins and one-meter world positions.
- World streaming: support hierarchical coarse/medium/high-detail tiles, bounded caches, worker generation, seamless LOD stitching and canonical tile-persistent modifications.
- Geography/climate: add deterministic continents and oceans, latitudinal/elevation climate zones, hemispheric seasons, geographic weather compatibility and biome-dependent terrain vegetation.
- Atlas: provide World/Continent/Region/Local scales, pan/zoom, explored fog of war, markers, route estimates and future real settlement/political overlays.
- Ecology: bind wildlife habitats to climate and biome, with marine/freshwater and future civilization ecosystems.
