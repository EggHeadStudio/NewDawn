# NewDawn permanent feature register — detailed requirements

**Scope preservation:** This file is additive. Existing `IDEA.md`, `VISUAL_ART_BIBLE.md`, `MASTER_ROADMAP.md`, `IMPLEMENTATION_TRACKER.md` and `DEVELOPMENT_STATUS.md` remain authoritative. Each ID represents a requirement or a cohesive testable subfeature; it is **NOT** a claim of implementation. The real status must be read from code + current evidence in `IMPLEMENTATION_TRACKER.md`. Do not delete rows merely because a milestone moves. Keep this file and the existing tracker cross-referenced.

**Conventions:** `[CORE]` core architecture or already-partial feature requiring completion; `[GAME]` functionality; `[ART]` visual target; `[FUTURE]` deferred. For every deliverable write an end-to-end acceptance journey, save/streaming requirements, mobile and desktop usability, and honest visual/performance evidence. One screen with a feature name is not acceptance.

## Planet, navigation and terrain

| ID | Requirement | Definition and acceptance target |
|---|---|---|
| PL-01 [CORE] | True planetary navigation | Canonical latitude/longitude + local meter scale; seamless seam and both poles; consistent headings, player/NPC/projectiles/rover, no scale distortion in actual visible collision; save/reload and real runtime traversal. |
| PL-02 [CORE] | Unified simulation/render frame | World, constructions, entities, collisions, camera, water, placement rays use shared tangent-frame transforms; staged `setTangentFrame` paths must be migrated as one validated slice, not switched independently. |
| PL-03 [CORE] | Hierarchical terrain | Nearby editable terrain, midground, far mountain/coast horizon, stitching, bounded cache, worker jobs and disposal; user edits persist across all LODs and world copies. |
| PL-04 [GAME] | Geology and landmasses | Coherent continents, archipelagos, valleys, mountain chains, cliffs, plateaus, coastlines, erosion-style shapes; reasonable horizon and varied land cover. |
| PL-05 [GAME] | Freshwater | Rivers with direction/flow, lakes, wetlands and shore transitions; consistent terrain, wading/swimming, possible fishing, navigation and frozen-season behavior where appropriate. |
| PL-06 [GAME] | Caves/underground | Enterable persistent caves, mining, lighting, hazards, surface/underground coordinate and save consistency; expensive geometry streamed. |
| PL-07 [GAME] | Volcanoes | Active/dormant volcanoes, rock/scree/ash/lava-field ecology and visual VFX; later abstract thermal consequences and local terrain persistence. |
| PL-08 [CORE] | Atlas | Actual sampled seed terrain, explored fog, zoom levels, named markers, heading/distance/routes, discovery layers; never fabricate settlements/ownership overlay. |
| PL-09 [FUTURE] | Atlas politics/logistics | Real borders, settlements, membership, alliances, diplomatic status, roads, trade, transport and risk layers from saved simulation. |
| PL-10 [CORE] | Terrain editing | Dig/raise/lower/flatten/smooth/slope, radius/amount, undo, costs where applicable, protection of buildings/roads/deposits, chunk/LOD/save coherence. |
| PL-11 [CORE] | Physical world scale | Heights, vehicles, animals, terrain features and buildings consistently proportional to realish humans; fast travel only where gameplay supports it. |
| PL-12 [FUTURE] | Photo journal | Save noteworthy locations, photos, metadata, discoveries and notes with privacy/local persistence. |

## Biome, vegetation and climate

| ID | Requirement | Definition and acceptance target |
|---|---|---|
| ENV-01 [ART] | Naturalistic terrain | Grass/soil/forest/mud/sand/gravel/rock/snow/ice/volcanic/urban PBR textures with appropriate normal/roughness scale, triplanar steep slopes and transitions. |
| ENV-02 [ART] | Eight foundational tree families | Visually distinct pine, spruce, birch, oak, maple, palm, acacia and tropical broadleaf, not one mesh recolored. Correct bark, branches, needles/leaves and climate ranges. |
| ENV-03 [ART] | Tree age and believable forests | Seedlings, young, adult, ancient/dead/broken variations with crown diversity, density clearings and understory; no pop-in at normal camera distance or entire-crown ghosting. |
| ENV-04 [CORE] | Plant LOD and streaming | Near/mid/far LOD/impostors where useful, instancing, materials/geometry shared, bounded texture memory, asset load fallback and clean disposal. |
| ENV-05 [ART] | Ground ecology | Plausible varied grass blades, flowers, ferns, shrubs/berries, fallen twigs, moss, roots, leaf litter, reeds, mushrooms, natural cactus; varied by moisture and season. |
| ENV-06 [ART] | Real rocks and deposits | Eroded textured rock assets, geology and partly embedded placement; ore identified by believable veins not simple colored gem polyhedra. |
| ENV-07 [GAME] | Biomes | Temperate/boreal/tropical/savanna/desert/tundra/alpine/polar/wetland/volcanic/coastal distinct in real game, matching atlas and seasonal conditions. |
| ENV-08 [GAME] | Climate model | Latitude, altitude, continentality, rain, temperature, soil, relief and hemispheric seasons; tropical wet/dry variability and region-aware wildlife. |
| ENV-09 [GAME] | Seasons/weather | Calendar, sun altitude, smooth day/night, clear/cloudy/rain/storm/snow/wind, transitions and weather effects on survival/vegetation/crops/visibility. |
| ENV-10 [ART] | Shared wind | Trees, grass, clouds, smoke, water and flames respond to one spatial weather/wind field; storms gust, calm day gentle. |
| ENV-11 [ART] | Water visuals | Motion, waves, Fresnel/depth, shore wetness/foam, player/wildlife/vehicle ripples, splashes and reflected light with bounded cost. |
| ENV-12 [FUTURE] | Water ecosystems | Fish, aquatic mammals, sharks/rays/turtles, fishing, diving, boats, currents and ecological interactions in coherent ocean/freshwater simulation. |
| ENV-13 [GAME] | Temperature/survival | Clothing, wetness, shelter, fire, weather and regional climate meaningfully affect player/NPC systems; optional accessibility/difficulty controls. |

## Sky, atmosphere and cinematic phenomena

| ID | Requirement | Definition and acceptance target |
|---|---|---|
| SKY-01 [ART] | Sun/moon | Sun follows time, latitude and season, coherent light/shadow; moon with plausible changing phase/altitude, sometimes veiled by clouds or below horizon. |
| SKY-02 [ART] | Beautiful night sky | Visible stars and Milky Way on clear moonless nights, moonlit haze, weather/cloud attenuation, camera can look up; ordinary night remains navigable with available light. |
| SKY-03 [ART] | Convincing clouds | Atmospheric depth, soft/cloudy layers, sunrise and sunset shading, cloud motion, storms/overcast; no featureless flat polygons. |
| SKY-04 [ART] | Fog/atmospheric perspective | Natural distance haze, weather/altitude variation, no hard abrupt horizon bands and no fog hiding ungenerated terrain as final solution. |
| SKY-05 [ART] | Exposure, shadows and AA | Coherent sun shadows, moonlight, practical torches, PBR tonemapping, foliage alpha and anti-aliasing; scene remains readable at Low and realistic at High. |
| SKY-06 [FUTURE] | Rare high-altitude phenomena | Distant aircraft/helicopter, UFO-like craft, unusual lights, occasional chase; low probability, distance/season/time-aware, optional discovery, performance bounded. |
| SKY-07 [GAME] | Ambient sky birds | Distant groups of circling birds and seasonal migrating V-flocks/cranes; separate low-cost ambient representation from nearby interactive wildlife. |
| SKY-08 [ART] | Optional cinematic DOF | Game depth of field restrained, focus tracks character/interactable; defaults off on lower mobile presets, HUD always sharp; advanced focus in Photo Mode. |
| SKY-09 [FUTURE] | Photo mode | Hide HUD, free/safe camera, FOV/focus/exposure, saved screenshots and journal linkage without sim-breaking gameplay. |

## Wildlife, remains and ecology

| ID | Requirement | Definition and acceptance target |
|---|---|---|
| WLD-01 [ART] | Twelve realistic species | Deer, rabbit, wolf, bird, brown bear, snake, squirrel, reindeer, moose, cow, sheep and fox; anatomically credible meshes/materials, correct size and silhouettes; no spheres with legs as final. |
| WLD-02 [ART] | Species animation | Walk/run/idle/graze/sniff/flee/attack/hurt/death/swim/flight as appropriate; foot contact, turns and believable body mass. |
| WLD-03 [GAME] | True predator/prey | Feeding, sensing, attack, retreat, flee, thirst/rest, habitats, scavenging and danger; balanced world ecology, no synthetic resource generation. |
| WLD-04 [GAME] | Herds and life cycle | Herd cohesion, reproduction, nesting, maturation, migration, seasonal resource use and bounded regional/distant updates. |
| WLD-05 [GAME] | Persistent wildlife | Stable identities where relevant, deterministic spawn caps, streaming ownership, save state, no duplication or population reset exploits. |
| WLD-06 [FUTURE] | Farmable animals | Capture/tame, breeding, feeding, pastures, shelter, products, domestication and NPC husbandry. |
| WLD-07 [FUTURE] | Animal mounts | Horses (first), then other appropriate species. Wild mounts resist/buck; taming, trust, balance, gear, safe dismount, stamina and saved ownership. |
| WLD-08 [FUTURE] | Expanded fauna | Camels, large cats, elephants, tropical/arctic species, reptiles, amphibians, insect life and species-rich marine/freshwater ecosystems. |
| WLD-09 [GAME] | Carcass lifecycle | Death leaves a stable bounded entity that progresses fresh -> decayed -> skeletal -> soil/cleanup; interactions, loot, scavengers, streaming and save persist; no forever-ragdoll. |
| WLD-10 [ART] | Insects around remains | Flies/swarming insects near remains in warm humid habitats, suppressed by cold/wind/storm where sensible; bounded particles and sound with optional intensity setting. |
| WLD-11 [ART] | Bird migration visuals | V-shapes, circling groups, scale/distance/motion and actual migration schedules; preserve nearby bird gameplay separately. |

## Player, appearance, inventory and interaction

| ID | Requirement | Definition and acceptance target |
|---|---|---|
| CH-01 [ART] | Modern survivors | Human player, Mira, raiders and villagers use realistic proportions, skin/hair/face geometry, properly rigged hands/feet and weathered modern outfits rather than fantasy peasant stand-ins. |
| CH-02 [GAME] | Real customization | Identity, body, height, face, skin, hair/beard, clothing/accessories match actual preview, gameplay and saved state; unsupported options unavailable or explicit. |
| CH-03 [GAME] | Wearable inventory | Backpack capacity, item stacks/icons, weight/volume, left/right hand, clothing/equipment slots, hotbar, visible attachment and item metadata. |
| CH-04 [GAME] | Generic object interactions | Inspect/grab/carry/drop/throw/place/equip/use/repair/refill/operate/transfer with mass/material/ownership/type contracts; no special fake UI-only items. |
| CH-05 [ART] | Movement animations | Idle, turning, walk/run/sprint, jump/land, swim, crouch, climb, chop, mine, dig, gather, craft, carry, melee, throw, operate, drive, mount and defeat transitions. |
| CH-06 [GAME] | Combat | Physical-range contact windows, LOS, collision, projectile arcs, cover, reactions/damage; believable animation/tool matching and optional ragdoll later. |
| CH-07 [GAME] | Physics | Bounded rigid-body for relevant objects, impulses, collision filtering, gravity, natural-object collisions and safe cleanup; evaluate Rapier integration before applying widely. |
| CH-08 [GAME] | Equipment durability | Tools, weapons, wear, repair, salvage, material-dependent physics and actual resource transactions. |
| CH-09 [GAME] | Onboarding | Opt-in guided/free start, skip/restart, real gather/Pack/floor/Mira steps, no removed Shelter requirement, touch and desktop, persisted progress; future expanded tutorial. |
| CH-10 [GAME] | Enemy identity | Human raiders versus invasion-alien remnants, faction logic and era-in-world lore; reconcile undead/necromancer/night-creature prototypes intentionally. |
| CH-11 [GAME] | Fighting/stealth | Melee, throwing, ranged, hearing/light/dark cover, threats and retreat; real collisions, player-comfort settings for tension. |

## Construction, terrain engineering and materials

| ID | Requirement | Definition and acceptance target |
|---|---|---|
| BLD-01 [GAME] | Modular homes | Enterable foundations, floors, walls, doors, frames/windows/glass, stairs, levels, roofs, room detection, terrain fit, saving and actual placement costs. |
| BLD-02 [GAME] | Real roof geometry | Rectangular and irregular L/T shapes, gables/valleys/hip/shed where supported, weather, roof preview and clear failure explanations, piece-level camera clearance. |
| BLD-03 [GAME] | Foundation and grading | Smart house foundation, natural slopes, realistic terrain fill/flatten costs, protection of water, roads and neighbors; reversible. |
| BLD-04 [GAME] | Materials | Timber, stone, clay/brick, manufactured glass, concrete, steel, roofing and progressively modern construction appearance/strength/cost. |
| BLD-05 [GAME] | Painting | Real per-face texture/UV painting, colors/materials, normal brush interpolation, eraser, undo/redo, stable material coordinates and no bleed through walls. |
| BLD-06 [GAME] | Roads | Dirt/gravel/stone/asphalt, smoothly connected curves, intersections, grading, collision and vehicle/NPC routing, stable worldwide save. |
| BLD-07 [GAME] | Indoor systems | Functional doors, windows, furniture, lighting, storage, workstations, shelter and weather, camera/roof fade, accessibility on touch. |
| BLD-08 [GAME] | Electrical networks | Practical local house power distribution, generators/turbines/batteries/wiring, device loads and fault/charge UX; no purely decorative cables. |
| BLD-09 [GAME] | Durability | Impact/damage, fire, repair, dismantle, support, partial collapse, finite cost and pooled debris rather than global dynamic destruction. |
| BLD-10 [FUTURE] | Defenses | Wood/metal fences, operable gates, watchtowers, barricades, traps and later automated defense, damage and safe interaction. |
| BLD-11 [FUTURE] | NPC construction | Villagers build/carry materials/repair real pieces, preserve ownership and edit conflicts, follow the same cost constraints as players. |

## World physics, material particles, fire and destruction

| ID | Requirement | Definition and acceptance target |
|---|---|---|
| FX-01 [ART] | Material impact VFX | Wood splinters, chipped stone, soil/mud dust, leaf debris, sparks, limited blood when relevant; no square cubes dominating visual impacts. |
| FX-02 [ART] | Local physical effects | Impulse, lifetime, bounces, decal fade and pooled particles, matching tool material and impact strength. |
| FX-03 [GAME] | Fire weather simulation | Fictional combustible matter, wind/humidity/rain/fuel and bounded local propagation with chunk-persistent state; audio/visual state changes. |
| FX-04 [GAME] | Fire suppression | Collect bucket, reach water, fill, carry, pour; later extinguisher, pump and hose; observable reduction/extinguishment and resource accounting. |
| FX-05 [GAME] | Explosions/destruction | Fictional bounded damage, debris, flash, smoke, shockwave/impact, cleanup; abstract late-game large-scale events, no real harmful synthesis details. |
| FX-06 [ART] | Smoke/embers/flames | Torches/campfires/building fire emit appropriate light, smoke, sparks and wind response; GPU bounded, near/far LOD. |
| FX-07 [GAME] | Water interactions | Splash from walking/jumping/swimming, buoyancy, wakes for wildlife/boats/vehicles, persistent appropriate flow/weather effects later. |

## Economy, research, vehicles and autonomous society

| ID | Requirement | Definition and acceptance target |
|---|---|---|
| ECO-01 [GAME] | Finite resources | Wood/stone/food, sand/clay/coal/copper/iron/limestone plus advanced materials with real deposits, geology, tool gates, depletion/replenishment rules and persistence. |
| ECO-02 [GAME] | Production chains | Woodworking/sawing, kiln/bricks, smelting/copper/iron, glass, machining, assembly, mechanical components, fuel, batteries and real inventory flow. |
| ECO-03 [GAME] | Research/technology | Discoveries and unlocked recipes/workstations that change actual gameplay; no rigid mandatory historical era or imaginary science output. |
| ECO-04 [FUTURE] | Chemistry/experiments | Fictional abstract recipes and materials, safe discovery model, useful real in-game outputs and consequences, no real hazardous production details. |
| ECO-05 [GAME] | Salvage and repair | Loot abandoned industrial/home/transport POIs, condition/parts/tools requirements, repair and reuse without prematurely manufacturing an entire vehicle. |
| ECO-06 [FUTURE] | Transport progression | Mounts, carts, bikes, cars, trucks, tractor/trailers, trains, boats/ships, aircraft/helicopters with manufacturing/repair/fuel and proper control/cargo. |
| ECO-07 [FUTURE] | Infrastructure | Bridges/roads/rail, harbors, airports, fuel and storage facilities, navigation and NPC logistics. |
| SOC-01 [FUTURE] | NPC identities | Distinct persistent people, appearances, personalities, needs, relationships, profession skills, household and property. |
| SOC-02 [FUTURE] | NPC careers | Lumberjack, miner, farmer, fisherman, hunter, builder, repairer, mechanic, trader, scientist, guard and governance roles with real actions/resources. |
| SOC-03 [FUTURE] | Autonomous settlements | Seeded towns/villages grow without player intervention, construct real housing, choose locations and roads, manage needs, defense, resources and history. |
| SOC-04 [FUTURE] | Offline/distant progression | Deterministic bounded distant economy/population updates, no free resources, no NPC duplication between chunks/saves, explainable event log. |
| SOC-05 [FUTURE] | Economy/ownership | Household property, storage, barter, coins/money, market prices, stock transfers and trading routes conserving real goods and balances. |
| SOC-06 [FUTURE] | Trust/reputation | Separate town-specific respect, fame, hostility, membership, citizenship and rights; player actions have inspectable causes. |
| SOC-07 [FUTURE] | Territory/politics | Territory claims, property rights, councils, mayors, elections with meaningful voter rationale, legitimate leadership, kingdoms/succession later. |
| SOC-08 [FUTURE] | Diplomacy/conflict | Alliances, treaties, resource disputes, raids, wars, peace and civilian/economic effects, real atlas overlays and history. |
| SOC-09 [FUTURE] | Alien story systems | Nests, environmental clues, remnants, contamination, rare portals and later teleportation between saved Atlas-linked places with meaningful rules. |

## Interface, audio, multiplayer and production integrity

| ID | Requirement | Definition and acceptance target |
|---|---|---|
| UX-01 [CORE] | Mobile action pad | Always usable joystick left, four-way Jump/A/B/Weapon right; real simultaneous touches, no ghost taps, stable safe areas/orientation. |
| UX-02 [GAME] | Tool Hub | Compact transparent quick tools, Pack/Build/Atlas, readable/scrollable modals, no essential action hidden offscreen, no overlapping controls. |
| UX-03 [GAME] | Desktop/gamepad | WASD, mouse look/camera and intuitive interactions; eventual mapped controller support and accessible remapping. |
| UX-04 [GAME] | Localization | Finnish/English interface and tutorials, readable icons/labels, accessibility and input hints; translation not replaced by untranslated debug text. |
| UX-05 [GAME] | Settings | Persist camera, fog, view distance, audio, sensitivity, UI scale, graphics presets, motion comfort and accessibility without wiping saved worlds. |
| AUD-01 [ART] | Audio environments | Original/licensed forest, wind, rain, wave, insect, bird, NPC, wildlife, footsteps and material impact sounds; positional distance/weather cues. |
| AUD-02 [GAME] | Responsive music | Calm day exploration, mysterious night, combat/alien tension and discovery; nonintrusive transitions, controls, offline packaging, user interaction unlocking audio. |
| PERF-01 [CORE] | Realistic mobile quality | Actually measured midrange-phone 30 FPS goal and suitable desktop 60 FPS goal, credible close-range art, adaptive resolution if proven, managed overdraw/memory. |
| PERF-02 [CORE] | Asset distribution | Model/texture compression, region lazy loading, bounded critical offline shell, cache eviction/update, no hidden 1 GB source buffers or mandatory all-world downloads. |
| PERF-03 [CORE] | Measurement | Stable representative frame-time p50/p95/spikes, draw calls, triangles, textures, memory estimates, startup and streaming metrics across low/medium/high. |
| PWA-01 [CORE] | Offline PWA | GitHub Pages `/NewDawn/`, local world/save IndexedDB, safe update, ability to export/import, no clearing user saves, usable fallback and provenance. |
| PWA-02 [GAME] | Save compatibility | Versioned schema validation, canonical geographic position, resource/build/animal/NPC identity, backward migration with backups and manual export. |
| MP-01 [FUTURE] | Authoritative multiplayer | Decouple simulation from rendering, Cloudflare Worker/Durable Object WebSocket rooms, authoritative inventory/physics/build/combat, secure shared persistence only when ready. |
| REL-01 [CORE] | Verified acceptance | Unit + browser + real screenshots + persistence + regression evidence, physical iOS/Android checks before final release, no false implementation labels. |
| REL-02 [CORE] | Safe change policy | No agent commits, pushes, publishes, deploys, modifies cloud settings, deletes developer saves or installs paid assets without explicit approval. |

## Test definition template for every work item

1. **Player-facing behavior:** what can a player do that worked differently before?
2. **Real-world contracts:** valid ranges, resources, collision, AI, weather, persistence, mobile interaction.
3. **Normal gameplay screenshot:** correct seed/coordinates/time/viewport, no model-viewer-only proof.
4. **Unit tests:** pure state, deterministic boundaries, existing-save migration.
5. **Browser tests:** production behavior and relevant touch/desktop scenarios; avoid brittle timers.
6. **Performance:** representative baseline/after, realistic Low/Medium/High trade-off, no unsupported benchmark claims.
7. **Dependencies and limitations:** exact unfinished gaps in `IMPLEMENTATION_TRACKER.md` and `DEVELOPMENT_STATUS.md`.
