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

Rotating the cached cloud noise domain and octaves was also tested in a desktop gameplay comparison; the cloud pattern remained visibly rectangular. The scratch-only trial was rejected and no source was changed.

The second bounded indoor-camera approach, projected silhouette overlap, revealed the player but faded too much of the player-built house. It was rejected; the prior camera remains unchanged and interior framing is still open. See the test report.

Scratch-only cloud sampling and frequency-filter studies did not remove the unnatural pattern without other visible defects; they were rejected and cinematic sky remains open. See the test report.

Direct and smoothed forest-cell texture-blend studies were not retained: the former made visible square patches, while the latter had little meaningful impact on sparse ground cover. Biome-linked materials and ecological undergrowth remain open; see the test report.

Small procedural flower clusters replace conspicuous solid white polyhedrons in sampled gameplay; placement, winter hiding and floor masking remain unchanged. The retained change has targeted save/offline checks and matched desktop/touch-emulated comparisons, but it does not solve sparse forest-floor composition or the mature-pine and indoor-camera goals. Two mineral appearance studies were rejected or left unintegrated; see the test report. A3.2 and its art, current-source full regression and physical-device gates remain open.

Snow particles now use soft circular silhouettes instead of square point sprites, with the existing particle pool and shelter mask; rain remains unchanged. Matched desktop and touch-emulated gameplay and targeted checks are documented in the test report. This is a narrow weather-art improvement, not complete snowfall, weather or A3.2 acceptance.

The sky now matches the unlit fog horizon under tone mapping, reducing a conspicuous streamed-water boundary in the sampled moonless scene without hiding the water. Actual day/night and touch-emulated portrait comparisons and focused sky/camera checks pass, but distant terrain, broader sky art and physical-device acceptance remain open; see the test report for GPU timing uncertainty.

A normally built two-cell house has now been traversed, orbited, saved, reloaded and exited on desktop and touch-emulated portrait/landscape, but doorway beams still obscure the player. A denser camera-ray trial was rejected. Decorative cover under ground-level floors is now reversibly suppressed; this does not complete the forest-floor or interior-camera goals. The current targeted unit, build, construction and offline checks pass; the full current-source regression, art review and physical-device gates remain open.

A further completed A3.2 checkpoint replaces the plain Moon surface with an 11,458-byte locally bundled, credited CC BY 4.0 map. Actual desktop/portrait sky views show maria/crater detail; 179 units/build, 12 targeted serial Chrome cases and two matched retained-source gameplay/timing fixtures pass, including offline art/attribution, both phase directions and disposal/failure. A final nine-case sky rerun additionally confirms Low releases only the cloud cache, retaining lunar detail. Four 30-second samples stayed refresh-limited at 60 FPS; this is not GPU/device acceptance. The 122-test full gate below predates this texture/credit change. Mature-pine/forest-floor and wider art/device gates remain open.

A later original curved-leaf undergrowth study also failed visual acceptance: four serial desktop/portrait fixtures loaded a 29 kB/448-triangle shoot clump, but normal gameplay still showed sparse marks rather than convincing forest-floor coverage. It remains scratch-only; do not repeat it as an accepted solution. Retained cloud source still has the complete 122-test gate below. Continue meaningful locally feasible A3.2 art work, not a future major milestone.

The 2026-11-27 Mac takeover verified the unit/build baseline and captured a new boreal scene and an emulated-browser timing sample. A trial enlargement of the existing pine's small foliage clusters was visually insufficient and was not retained in the runtime. The interrupted trial test was subsequently removed and the 170-test unit suite and build passed again. 005D-A3.2 remains open.

A subsequent source evaluation led to a selectively placed mature fir with on-demand, offline-cached art and guarded worker upgrades. A foliage-occlusion bounds optimization improved repeated touch-emulated boreal quality-tier traversal samples, but its crown remains sparse; denser fir trials and a flat projected-card crown did not pass review. The moon's phase now faces the projected sun direction; stronger directional and phase-sensitive ambient moonlight improve the sampled full-moon scene, but moonless scenes remain dark. Moving-camera behavior, profiling beyond this scene, wider sky review and physical-device performance still require broader acceptance. A3.2 remains open.

The sparse fir has now been superseded by an offline-authored whorled skeleton with small CC0 needle sprays, reducing the asset to 3,177,252 bytes and 43,452 triangles. Matched gameplay/crown images show a substantially fuller fir. A later composition comparison retained a 32% adult subset of fir resources instead of 8%; a 64% trial added unnecessary cost in the sampled view. Local authored-wood/foliage clearance improves sampled player visibility. Focused persistence/offline and quality traversal checks pass. This does not accept the whole forest: mature pine, ecological age/density composition, undergrowth, wider moving-camera/sky review and physical devices still need work. Continue these locally feasible A3.2 tasks while device acceptance remains open. Spruce now shares the same 32% mature selection, and half of the remaining spruce/fir resources reuse the same cached prototype as a 0.6-scale young fir (visual-only, deterministic `treeAgeClass()`; sapling fallback until cached).

Authored wood now shares localized foliage-style camera clearance: sampled day/night touch views no longer have branches across the character, without whole-tree transparency. Wider camera review, unchanged shadows and a transient first Low-quality traversal stall remain limitations. Continue undergrowth and forest composition rather than advancing to a new major milestone.

Authored foliage now also casts wind-aware cutout sunlight shadows, improving canopy grounding without new downloads; Low retains its shadows-off policy. This checkpoint passes 178 units/build and 20 targeted serial Chrome tests, plus matched quality samples; the prior full 109-test regression predates it. Additional forked-pine shapes, two external licensed pines and low-shrub ground cover were not visually accepted and were not integrated. Mature-pine/forest-floor art and broader camera/sky/device gates remain unfinished; keep working within A3.2.

Moonless nights now receive a weather-attenuated artistic starlight floor (new-moon player area about 4x brighter in the initial clear scene, bright full-moon nights unchanged), and spruce/fir stands now use mature, young and sapling age classes from the cached whorled fir, adding fuller boreal crowns at equal draw calls. A later increase to the Cloudy/Rain/Storm floor makes sampled moonless terrain more legible without adding assets or draw calls, but remains very dark and needs broader visual and physical-display review.

The follow camera can now look into high crowns and near the zenith without orbiting below terrain; normal follow framing and save data are unchanged. This exposed and repaired pole-stretched stars using angular cube-face candidates. Current 179 units/build and 17 serial Chrome camera/sky/construction checks pass; matched old/new sky-view timing samples remained refresh-limited near 60 FPS. This is a functional/visual checkpoint, not cinematic sky, complete camera or physical-device acceptance. Clouds/weather, mature-pine/forest-floor art and the full current-source regression remain open.

Dense storm-cloud cores now obscure celestial discs instead of retaining the fixed 18% sky leak; Clear/Cloudy opacity and original shapes are unchanged. Five sky regressions and two actual-game storm comparisons pass after this repair. A separate density/gradient-shading cloud trial was visually rejected and was not integrated. Convincing cloud form, broader weather, mature forests and undergrowth remain required within A3.2.

The preceding camera/star/storm source passed **179 units, production build and the complete 120/120 serial Chrome regression** (27 files, 19.1 minutes), including production offline/cache and save journeys. A subsequent Medium/High cloud checkpoint caches a finite-layer approximation in a bounded 1.5 MiB color cube; Low retains the old path. Current units/build, targeted and matched gameplay checks, and the complete **122/122 serial Chrome regression** (27 files, 19.3 minutes) pass on unchanged frozen source. GPU-query means improved in the sampled scenes, but Storm p95 increased; physical-device and broader art acceptance remain open. Larger/lifted fir age profiles were also evaluated and rejected, leaving the 9 m runtime asset unchanged. Continue A3.2; do not begin a future milestone or recommend publication from functional passes alone.

The approved Batch 005D-A3.2 continues Grounded Realism and supersedes the earlier stylized visual target. Six authored tree prototypes include experimental selectively placed mature broadleaf, pine and fir visuals; corrected plant alpha, a shrub, six PBR terrain families, preliminary vegetation LOD and material impacts are integrated. Local foliage sightline and selective upper-floor clearance, weather/daylight/altitude-sensitive haze, multisampled alpha-to-coverage and a stronger Low-quality vegetation reduction are also implemented but have not completed device/art acceptance. Current mature-pine captures still show sparse crowns, and ceiling edges can still obscure the player. A bounded sustained benchmark and initial starfield are available, but convincing mature forests, ground vegetation, cinematic quality, sky and indoor-camera visual acceptance, quality-tier profiling and release validation remain incomplete. Continue the approved A3.2 checkpoints before starting a future major milestone; see the status and test report for evidence. The following planetary work remains mandatory and must not be represented as complete:

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
