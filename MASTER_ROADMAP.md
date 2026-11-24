# New Dawn master roadmap

This is the durable vision, not a claim that the features exist. See [IMPLEMENTATION_TRACKER.md](IMPLEMENTATION_TRACKER.md), [DEVELOPMENT_STATUS.md](DEVELOPMENT_STATUS.md) and [TEST_REPORT.md](TEST_REPORT.md) for current evidence and limitations.

At the start of every development batch, read these four documents, identify the highest-priority unfinished dependencies and continue from the existing code. At the end, update the tracker, completed and partial work, blockers, executed tests and next milestone. Preserve unfinished requirements and save compatibility.

## 1. Planet and exploration

Create a massive procedural Earth-like world with streamed chunks, continents, oceans, islands, mountains, forests, deserts, tundra, polar regions, rivers, lakes and caves. Support longitude wrapping, proper polar traversal, climate zones and northern/southern hemispheres, distant terrain LOD, persistent terrain modifications, efficient loading, seamless exploration, map discovery and navigation.

## 2. Time and environment

Model dawn, day, dusk and night; four seasons; rain, storms, snow and wind; atmospheric lighting and seasonal vegetation. Add temperature, weather effects on survival and activities, and water and natural environmental simulation.

## 3. Characters and visuals

Deliver premium stylized human characters rather than Playmobil-like figures, using authored rigged GLB/GLTF, smooth animation and mobile optimization. Support masculine and feminine variation, faces, bodies, skin tones, hairstyles, beards and accessories; Viking-inspired early outfits, profession-specific, industrial and modern clothing; real equipment and armor; customization and persistent identity. NPCs and enemies require comparable visual quality.

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

## 11. Transportation

Develop craftable handcarts, rafts, rowboats, motorboats, cargo boats, cars, trucks, tractors, trailers, aircraft, seaplanes and helicopters. Include manufactured components and engines, fuel production/storage/consumption/refueling, repairs, cargo, ownership, NPC operation, roads, ports and airports. Survival vehicles should follow technology progression rather than spawning freely.

## 12. Engineering

Build mechanical gears and shafts, wind and water power, electricity, batteries, power networks, electrical machinery, water networks, production automation and later industrial systems.

## 13. Multiplayer

After the simulation is ready, support a future authoritative backend using Cloudflare Workers, Durable Objects and WebSockets, authentication, shared persistent worlds, collaborative construction, NPC/wildlife synchronization, security/anti-cheat and efficient state updates. Do not implement multiplayer before the simulation boundary is ready.

## 14. UI, audio and PWA

Provide excellent mouse/keyboard and touch controls, contextual A/B actions, practical gamepad support, responsive menus, inventory/crafting, character creator, technology/research UI, full map, sound effects, ambience and potentially original music. Persist settings, support Finnish and English, installation, supported fullscreen, offline operation, safe GitHub Pages updates, IndexedDB save preservation and mobile performance.

## Current priority

Finish a playable mining-to-manufacturing and research loop with safe migration and meaningful browser acceptance; then continue construction materials and settlement progression. Preserve the authored-character foundation and its documented unfinished art requirements.
