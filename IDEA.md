# EggHeadStudio: NewDawn
## Master Game Vision and Product Design (pre-release)

> **Status:** This is a design vision and authoritative scope reference, **not** evidence that any feature is implemented. For current implementation, consult `IMPLEMENTATION_TRACKER.md`, `DEVELOPMENT_STATUS.md`, `ARCHITECTURE.md`, and `TEST_REPORT.md`. Do not overwrite those evidence documents with aspirational text.

**Working tagline:** *Live any life. Rebuild any future. Explore an entire world.*

## 1. Core fantasy and identity

NewDawn is a large-scale, grounded-realism, third-person open-world survival, rebuilding, exploration, engineering, and living-civilization sandbox. The setting is an Earth-like planet with a genuinely vast physical scale. Decades after a mysterious alien invasion shattered technological civilization, nature has reclaimed abandoned roads, cities, factories, airfields, ships and homes. Survivors, wildlife, and autonomous communities adapt, trade, fight, and rebuild. Remnant alien creatures and contaminated regions make certain nights and landscapes dangerous.

The player starts with modest possessions and must be able to choose a life: wanderer, explorer, builder, artist, farmer, hunter, naturalist, trader, mechanic, engineer, scientist, sailor, driver, pilot, mayor, diplomat or ruler. No mandatory linear medieval-to-modern storyline. Primitive tools may be necessary at first, yet contemporary salvage and knowledge exist. The player can scavenge and repair a machine before being capable of manufacturing one; full independence eventually requires real production chains, research, power, components and skills. World history is created by both the player and persistent autonomous societies.

### Design pillars

1. **One coherent physical world.** Geography, climate, terrain, construction, economy, wildlife, actors, vehicles and the Atlas derive from shared world state and deterministic rules.
2. **Player agency and systemic interaction.** Inspect, pick up, carry, equip, combine, throw, place, repair, paint, dismantle, ride and operate appropriate objects rather than rely on bespoke text-only buttons.
3. **The world lives independently.** NPCs have identity, needs, households, work, local opinions, property, economies and events even when out of sight.
4. **Visible quality.** Grounded realistic proportions; legible characters and animals, rich biomes, convincing lighting, motion, water and effects. Do not use crude primitive placeholder geometry as final art.
5. **Long-term technical integrity.** Streaming, bounded caches, deterministic data, compact persistence, local simulation frames and eventual multiplayer-ready separation, without pretending those are complete today.
6. **Freedom of pace.** A peaceful lake cabin and a thriving industry are equally valid experiences; alien-night horror should be tense but tunable and should not preclude relaxed play.
7. **Actual playability.** Touch + desktop controls, responsive menus, accessible iconography, safe saving and tested gameplay journeys matter as much as source code.

## 2. Narrative and world-building

- **The Fall:** An alien invasion destroyed much global infrastructure; the cause and aftermath can be uncovered through discoverable scenes and optional narrative clues, not forced exposition.
- **The Renewal:** Time has passed; forests overgrow highways, broken trains rest in depots, aircraft wrecks lie in wilderness, some settlements preserve power and workshops while others live with handmade technology.
- **Old-world salvage:** Durable procedural points of interest include deserted homes, shops, barns, workshops, schools, hospitals, rail stations, harbors, industrial sites, service stations, mines, aircraft wrecks, camps and alien remnants. Loot is finite or follows explicit respawn rules. Important POIs have stable seeds/IDs and remain persistent.
- **Transport as a progression:** Discoverable bicycles/carts, cars, buses, trucks, trains, boats, ships, helicopters and aircraft may be damaged, empty, locked or missing parts. Repair, refuel, restore routes and build infrastructure before practical use. No unrestricted free endgame vehicles.
- **Enemy identity:** Distinguish human raiders/factions from alien invasion remnants. Recontextualize existing undead, night creatures, necromancers and similar prototypes only through a deliberate consistent fiction and model/behavior pass. Some creatures prefer dark hours or infested biomes. Nests, sensory behavior, stealth, lighting and shelter matter.
- **Environmental storytelling:** Signs of lost lives and recovery appear through object placement, damage, vegetation, lighting, audio and NPC activity. Avoid a world composed only of randomly scattered generic ruins.
- **Opt-in lore:** Exploration journal, world history, ruins and discoveries allow players to investigate the invasion without forcing a linear quest.

## 3. The planet, biomes, Atlas and seasons

- Canonical spherical planetary geography with approximately Earth radius (6,371 km); meter-based local movement, correct longitudes/poles, camera-relative controls, local tangent frames and floating-origin rendering.
- Preserve the **1:1 Earth-sized planet**, not a scaled-down world. Its vast distances should make ships, railways, aircraft and appropriately earned fast travel meaningful. Aim for an exceptionally large, explorable game world without claiming a size record before it can be verified; geography and intercontinental crossings must be demonstrated in gameplay.
- Streaming near gameplay tiles, medium terrain, distant landscape LOD, workers/priority queues, bounded cache/mesh memory, no whole-planet high-resolution allocations.
- Coherent continents, seas, archipelagos, plateaus, natural mountains, lakes, rivers, wetlands, caves, coastlines, deserts, tundra, permanent polar ice, active and dormant volcanoes, lava fields and volcanic succession ecology.
- Climate linked to latitude, altitude, relief, continentality, rainfall, biomes and season. Northern/southern seasonal reversal; four seasons, tropical rainy/dry seasons, gradual weather and ecological response.
- Distinct regional ground materials (grass, soil, moss, sand, mud, rock, scree, gravel, ice, snow, lava rock), coherent texture blending and appropriate LOD. Rich species-specific trees (pine, spruce, birch, oak, maple, palm, acacia, tropical broadleaf and more); biome density and clearings. Natural vegetation, grass, flowers, shrubs, fallen timber, stones, and resource distribution.
- True moving sun below the horizon at night, moon with plausible position/phases, skies with day/night colors, visible clouds on fine days, thicker storm cloud cover, diffuse sun/moon glow, rain/snow/fog, local wind field and geographically consistent daylight duration.
- Oceans, rivers and lakes with animated waves, reflections, flow/wakes/ripples, shore blending, splashes on entering water and swimming, underwater visuals and later currents, flooding, fishing and marine animals. Physically plausible feeling with performance-safe approximations, not expensive whole-world fluid dynamics.
- **World Atlas:** Original illustrated fantasy-cartographic visual style, accurately derived from world seed/terrain; global to local zoom, exploration fog, discovered wildlife/resources/POIs, player position, markers, route and transport estimates, named geography, and later actual towns, states, borders, alliances, diplomatic attitude, trade, population, technology and conflict overlays. No fake simulated political map.
- Discoverable journals and a player photo mode linked to the map and world history.

## 4. Characters, equipment and animations

- Grounded realistic proportions, expressive readable faces, body/height/skin/hair/facial hair variations and persistent unique identity. Both masculine and feminine forms, inclusive choices without making an option silently render an unrelated asset.
- Default clothing is **modern and post-apocalyptic**: worn jeans, outdoor gear, jackets, hoodies, work trousers, boots, rainwear, utility belts, protective equipment and functioning visible backpacks. Salvaged uniforms, industrial safety clothing and specialist outfits appear with progression. Historic/primitively made clothing is still plausible in isolated societies but not the default visual identity.
- Modular, rig-compatible authored or high-quality original models; actual creator-preview-to-gameplay match; persistent visible equipped items; LOD and shared asset caches. Existing CC0 Quaternius assets are a transition foundation, not the art-quality target.
- Animation state machines for locomotion, idle, turns, jogging/sprinting, climbing, crouching, jumping, landing, swimming, carrying, chopping, mining, digging, building, mounting, riding, gathering, shooting/throwing, melee, injury, recovery and death. Appropriate root and foot alignment; minimal foot sliding and clipping.
- Real equipment/hand attachment slots; one-handed/two-handed rules, backpacks and visible carried objects; improve other NPCs and alien/human enemies to comparable quality.
- Shared collision and motion behavior; impact occurs at real contact frames or projectile impacts, not on animation start. Rig-compatible physics-assisted death/ragdoll where feasible and proven stable.

## 5. Wildlife, taming, riding and water life

- Existing target roster: deer, rabbit, wolf, bird, bear, snake, squirrel, reindeer, moose, cow, sheep and fox, each with visibly distinct anatomical models, correct human-relative scale, gait, idle, eating, rest, flee, attack/hurt/death where relevant.
- Additional biome-specific species: horses, camels, big cats, elephants, tropical birds, desert wildlife, arctic fauna, amphibians, insects and many more; ecosystem distribution is climate-aware.
- Predator/prey behavior, herds, breeding, migration, feeding, water requirements, rest, nesting and bounded distant simulation. Farmable livestock and eventually real husbandry/logistics.
- Mounting/riding interacts with physical presence, animal behavior and player equipment. Tame horses become responsive. A wild mount initially resists steering and may buck; player balancing and calming influence safety and trust. Large wild animals such as bears and moose may be hazardous to approach or mount; any game-specific taming is intentionally difficult and not a claim of real-world safe behavior.
- Fish, sharks, dolphins, whales, manta rays, turtles, rays, freshwater species and marine food webs; diving, angling, underwater visibility and boat interactions at later stages.
- All animals require chunk-aware lifecycle, conservation of identities and resources, and actual visual acceptance, not merely a species enum.

## 6. Physical interaction, inventory and crafting

- **Common interaction contracts** for inspect, grab, carry, release, place, throw, equip/unequip, ignite, refill, extinguish, repair, dismantle, harvest, mount, enter, operate and container access. Actions depend on object tags, material, size, weight, ownership and context. Not every huge or dangerous object is pickable.
- Small objects such as sticks, loose stones and tools can be picked up, held in either hand, thrown, stored, used or dropped. Hand limits, object masses and two-handed items matter. Vehicles and mounts use distinct enter/exit interfaces, not ad-hoc hidden actions.
- Modern inventory: icon grid with quantities, item metadata and stacking, weight/volume limits, backpack capacity and wearable storage; left/right-hand and body equipment slots, quickbar/tool hub, touch tap/drag, keyboard/mouse equivalents. Concise accessible descriptions and FI/EN localizations remain available for clarity; remove sprawling text-action lists.
- Crafting: visual recipes and material requirements, context-specific workstations, timers, fuel, actual output and persistent progress. Discovery and blueprints support complex items.
- Contextual A/B plus dedicated weapon and Jump controls on touch, multi-pointer simultaneous input with left joystick, adjustable HUD, clear hit/throw feedback and no accidental menu click-through.

## 7. Construction, creativity and destruction

- Enterable modular buildings replace non-enterable 'habitable' prefab huts. Keep/convert useful storage or other real functional prefabs after source audit. Walls, foundations, stairs, doors, windows and roofs have colliders, shelter, opening behavior and persistence; roof fades when the player enters, not a separate forced indoor camera.
- Material progression: wood, salvaged metal, stone, clay, kiln-fired bricks, glass, concrete and industrial materials. Real brick wall elements; clay + kiln + fuel and salvage as sources. Quality/power/durability vary with material.
- Smart foundation grading and terrain tools (dig, raise, flatten, smooth, slope, brush radius, material accounting, safe undo). Continuous dirt/gravel/stone roads with curves/intersections, terrain fit and vehicle/nav compatibility.
- Working gable/shed/advanced roofs, roof generation preview, cost/fallback feedback, indoor weather protection; physical occupancy/line-of-sight for enemies. Furniture, locks, lighting, storage, workshops and eventually NPC construction.
- Long-term creative range: combine different materials and piece shapes into small homes, skyscrapers, shopping centers and other large buildings, with furnished interiors and functional lighting in individual rooms. Players should eventually be able to build together; shared multiplayer construction remains a later goal, not an existing feature.
- True per-face UV texture painting, material presets, brush cursor, front-surface targeting, stroke interpolation, bounded textures, undo/redo and save. Protect surrounding terrain and opposite faces.
- Concealed building-level electricity from external supply; wind/solar/generators, power meters, devices, batteries, networks and later water, machinery and automation.
- Structural durability, impacts, repair, dismantling, partial collapses and performance-limited debris. Avoid gigantic permanent rigid-body counts.

## 8. Environmental simulation, fire, wind and effects

- One coherent weather/wind model drives clouds, trees, grass, water waves, smoke, fire behavior, rain/snow, temperatures and later agriculture/navigation.
- Improved fire visuals: emissive flames, flicker, embers, sparks, smoke and lighting, pooled particles and spatial LOD. Fire sources include torches, campfires, burning debris and deliberate ignition.
- Bounded, deterministic **fictional game fire simulation**: ignition risk based on dry combustible material, humidity, precipitation, local wind, heat/proximity, fuel and barriers; spread to grass, shrubs, trees and timber structures; persistence and cleanup. Avoid global per-tree per-frame loops.
- Fire fighting: pick up bucket, fill at reachable water source, carry and pour; later finite-charge extinguishers, pumps and hoses. The player should observe a real change in fire intensity/spread.
- Original stylized explosion visuals with flash, smoke, radial shockwave, debris and environment damage; later larger fictional endgame area-destruction events including a nuclear-scale fictional event. Model abstract in-game effects and gameplay costs, not real-world explosives, synthesis, weapon mechanics or nuclear engineering instructions.
- Water impacts, footsteps, weather audio, impacts and explosions respond to material and distance.

## 9. Engineering, transport and progression

- Primitive to sophisticated technology through logical research: wood tools, kiln/brick, metallurgy, mechanics, steam/wind/water power, electrification, chemistry, advanced alloys, combustion engines, electronics, automation and advanced engineering.
- Materials and production: raw ore, coal, stone, clay, sand, limestone, planks, kiln-fired bricks, metal ingots, glass, components, mechanical assemblies, batteries, engine parts, pipes, fuel and equipment. Real workstations and inventories. Chemistry uses fictional abstract ingredients for hazardous outcomes.
- Salvage/repair can jump ahead of manufacturing capability but remains limited by condition, scarce spare parts, fuel and tools. Later production chains can manufacture replacement components.
- Carts, mounts, cars, trucks, tractors, buses, trailers, trains, rafts, boats, cargo ships, aircraft, helicopters and infrastructure (roads, bridges, rails, ports, airports). Real ownership, cargo, energy/fuel, wear, damage, repairs and NPC use.
- Vehicles should be visually convincing and feel like distinct machines, with weight, suspension or suitable water/air motion, tilt, traction and responses to terrain where applicable. The existing rover is a foundation, not the final quality target.
- **Passenger travel as a future life experience:** multiple ships can serve routes around the planet, with ticket prices, a captain and crew, cabins, lifeboats, shops and entertainment such as a disco. Players can board, move around and live aboard during potentially multi-day voyages. Passenger trains follow real rail routes, charge fares and offer explorable cabins or other onboard spaces for travel between settlements and countries. Exact schedules, passage of time and optional time-skipping remain design decisions. Simulate nearby journeys in detail and distant services at bounded scale.
- Meaningful research discoveries and creative experiments with persistent unlocks and visible gameplay consequences. Do not tie all content to rigid historical eras.

## 10. NPCs, self-developing society and politics

- Persistent identities, skills, personalities, relationships, needs, homes, professions, belongings, life events and schedules. NPCs understand barriers, work, eat, rest, move goods, use workstations and build.
- Independent settlements choose suitable sites, establish actual buildings, produce/consume finite goods, grow, trade, migrate, build roads and experience weather/raids while far away through bounded coarse simulation. No resource cloning on load or despawn.
- Household property and wealth, trading, barter, currency, bounded dynamic prices, merchants and routes. Honest stock and payment conservation.
- Future countries have their own currencies, with exchange rates influenced by their economic conditions and trade rather than unexplained randomness alone. Whether rates can also fluctuate randomly, and the precise monetary rules, remain open design decisions.
- Local reputation/fame/trust/influence/hostility, citizenship, territorial rights, player property protection, councils, mayors/chiefs and legitimate elections with personality/context-based voters, kingdoms/succession and bilateral diplomacy.
- Alliances, treaties, disputes, raids, war, peace, territorial shifts and tangible civilian/economic effects; alien factions are not automatically identical to human politics.
- Over time, autonomous groups may grow into large armies, contest settlements and territory, undertake underground projects or develop advanced space technology. Represent distant populations and campaigns at an appropriate aggregate level while keeping nearby people and consequences tangible; these are long-term simulation goals, not current capabilities.
- The World Atlas shows **actual** settlement state, diplomatic relations, history and active risks and supports map-driven planning, trade-route proposals, markers and someday political decisions when the player has legitimate authority.
- Every meaningful player and world event can enter a bounded world-history journal.

## 11. Audio, camera, UI, quality and accessibility

- Consistent original environmental audio: forests, birds, insects, wind, rain, waves, engines, machines, settlements, alien nights and fire. Situation-sensitive original music, volume/mute controls, offline-safe assets.
- Professional responsive interface: stylized transparent dark materials, consistent original iconography, compact non-obstructive HUD, responsive inventory/workstations, normal game continues behind appropriate non-modal panels, separate explicit pause.
- Touch: always-available joystick and four-way Jump/A/B/Weapon action pad, genuine concurrent touch contacts; compact Tool Hub and camera gestures. Desktop: comfortable keyboard/mouse, optional gamepad mapping. Safe-area layouts, portrait and landscape.
- Real-time changes to fog, draw distance, camera distance, lighting, torch and tool previews. Optimized presets and visual accessibility, readable labels/tooltips, FI/EN translations.
- Photo Mode with free camera, focus/exposure options, HUD hide and images taken from the actual game; exploration journal and codex.
- Progressive asset streaming and LOD, model/texture compression, pooled effects, quality presets, device-aware budgets. Support offline PWA, saves in IndexedDB, safe updates and export/import.
- The visual quality of the 3D world, environments and motion remains a central product priority alongside rapid progress across playable systems. Work toward a potentially commercial game without treating a business model, platform or release date as already decided; preserve appropriate asset rights.

## 12. Game architecture and future multiplayer

- Keep the existing TypeScript/Three.js/Vite/GitHub Pages and offline-first PWA as the working platform unless a different design is explicitly justified.
- Distinguish canonical geographic state, local gameplay/collision, render frame and UI. Separate authoritative deterministic simulation from Three.js where feasible. Avoid ever-growing `main.ts` orchestrating everything directly.
- Region-based persistence and distant life simulation, stable IDs, bounded histories, deterministic world seeds, no duplicate depletion or generated settlements when streaming. Document migration and back up development saves before breaking schema.
- Future optional Cloudflare Workers/Durable Objects/WebSockets and server-authoritative shared worlds are **not an immediate milestone**; no authentication or credentials required now.

## 13. Delivery order and quality gates

These are **milestones**, not promises that one Copilot run can complete the game.

| Phase | Intended focus | Must demonstrate |
| --- | --- | --- |
| 005C-P3 (unfinished) | Shared tangent scene/collision integration, real near/mid/far LOD | Running game uses coherent spatial frame and real LOD; full regression and performance evidence |
| 005D-A | Visible art rebirth: Art Bible, sky/sun/moon/clouds, terrain materials, trees/vegetation, water and tasteful ambient effects | Actual screenshots from matched daytime, weather, biome, shore and mobile scenes; better visual quality, no regressions |
| 005D-B | Ruins and post-apocalyptic set dressing, salvage, alien-night ambience | Stable meaningful interactable POI and night journey |
| 005E | Premium wildlife assets, anatomy, animation and biome distribution | All 12 species readable and animated at player scale |
| 005F | Modern player/NPC customization, backpack, rig and animations | Every enabled creator choice visible in preview, gameplay and save |
| 006A | Shared item interactions, icon-grid inventory, equipment and crafting | Pick, equip, transfer, craft, operate, save/reload, mobile touch |
| 006B | Physics/ragdoll, routefinding, combat animation, riding/taming | Integrated real player/animal/structure interactions and behavior |
| 006C | Advanced construction, bricks, roofs, terrain grading, texture paint, electricity | Full built and inhabited structure, road and material loop |
| 006D | Fire spread, suppression, water impacts, destruction and fictional explosion effects | Bounded simulated consequences, save/reload and observable mitigation |
| 007+ | Engines, transport, industrial research and living societies; later complex politics and multiplayer | Real end-to-end gameplay economies, persistence and world events |

Order may change for dependencies, but **never silently drop deferred features**. Every milestone must have gameplay acceptance criteria, quality/performance budgets and screenshots. Tests are run selectively during coding and as a complete stable regression at major acceptance. Do not treat browser-emulated phone tests as physical-device verification.

## 14. Current baseline at 2026-11-26 (report-derived, not independent source verification)

- Current code has version-12 saves, geographic player/rover and nearby NPC/wildlife movement, a relocatable runtime frame for actors/projectiles, and projected rendering/most collision.
- `World.setTangentFrame` and `ConstructionRenderer.setTangentFrame` are staged **but not enabled in gameplay**; full planetary shared scene and near/mid/far LOD remain unfinished.
- Streamed 24-meter chunks, a coarse Atlas, partial seasons, torch/fire lighting, simple riverless water/oceans, basic mining/smelting, modular wood buildings and partial roads/paint exist.
- Twelve wildlife species are reported implemented procedurally, but only four appear in the stale asset catalog. Neither premium animal art nor chunk-wide ecology has been accepted.
- Modern clothing/backpack, true inventory/equipment, post-apocalyptic ruins, major destruction, realistic cloud/moon/sun sky visuals, fire spread and autonomous societies are not established as implemented.
- Most recent *full unit run in supplied report*: 139 passing tests; after staged frame changes, focused unit and browser runs/build pass. **Full final Playwright regression after these changes was not reported.**
- This section must be reconciled against actual source at each batch; never turn report text into a false VERIFIED claim.

## 15. Non-negotiable collaboration rules

- The user controls Git commits, pushes and deployment. Agents must not do these automatically.
- Work in existing repo; avoid recreating systems from scratch or undoing the tested four-way mobile pad.
- Read `IDEA.md`, `MASTER_ROADMAP.md`, `VISUAL_ART_BIBLE.md`, implementation tracker, architecture, status and tests before significant milestones.
- Prefer a few complete player-visible vertical slices to many superficial features. When a task cannot be finished, report the exact residual blocker and next code-level action.
- Never hide limits; list implemented/verified/visual-accepted separately. Use actual gameplay captures and stable regression tests, not decorative mockups or test-only code paths.
- Use licensed local assets (prefer CC0), preserve attribution where needed, no expensive hosted dependencies.
- A final release requires physical mobile and desktop QA, performance and accessibility work, save integrity, playable progression, visual art acceptance, world-building coherence and a reliable update process.
