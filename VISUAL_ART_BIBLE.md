# EggHeadStudio: NewDawn — VISUAL ART BIBLE
## Version 2.0 — Grounded Realism / Reclaimed Earth
**Date:** 2026-11-26
**Status:** Mandatory target and visual acceptance specification. NOT an implementation-complete report.

> **Art-direction decision — supersedes the earlier stylized-low-poly interpretation.**
> NewDawn is to look like a **beautiful, naturalistic, modern 3D survival game** set on an Earth reclaimed by nature after an alien invasion. The visual target is **grounded, semi-realistic / realistic PBR game art**, NOT a low-poly-looking game, voxel game, Playmobil aesthetic, cartoon diorama, or an assemblage of primitive Three.js shapes. Realistic *appearance* is mandatory; sensible geometry/LOD optimization is encouraged and must not be visible as a crude art style.
>
> The earlier `VISUAL_ART_BIBLE.md` v1 phrase "Grounded Stylized Reclamation" must never be used to justify faceted trees, untextured hills, toy animals or flat polygon ground. This document replaces that visual interpretation. `IDEA.md` defines game mechanics and story; `MASTER_ROADMAP.md` is the durable roadmap; `IMPLEMENTATION_TRACKER.md`, `DEVELOPMENT_STATUS.md`, and `TEST_REPORT.md` reflect actual implementation and evidence.

---

## 1. Visual promise and identity

**Art direction:** **Grounded Realism — Reclaimed Earth.** Think carefully designed contemporary survival-game environments with believable landscapes, readable PBR materials, convincing vegetation, anatomically recognizable animals, correctly scaled contemporary human characters, weathered architecture, and cinematic but coherent natural light.

**Narrative identity:** Hope and rediscovery after a catastrophic alien invasion. Old roads, homes, vehicles, factories, bridges and ports are weathered and overgrown; survivor settlements rebuild with salvage, wood, brick, metal and modern technology. Ancient-looking alien technology contrasts clearly with human materials. Nights sometimes feel eerie and dangerous; days can be breathtakingly beautiful.

**Rendering target:** Naturalistic realism suitable for a browser-based Three.js game. Aim for the **appearance** of high-quality current 3D game art, within measured web/mobile constraints. A high-quality realistic material on an optimized mesh is preferable to an enormous unoptimized photogrammetry model. Do not sacrifice truthful art direction to meet an arbitrary low-poly target.

**Non-negotiable prohibitions in the default final art path:**

- No tree crowns made primarily of undetailed icosahedrons, cones, spheres, cylinders or stretched blobs.
- No forests differentiated mainly by changing the color or scale of the same generic primitive.
- No plain biome vertex colors as the only visible ground appearance.
- No exposed flat-shaded triangular hill patches as the final landscape surface.
- No untextured dodecahedrons as final rocks.
- No toy-like animals made of a handful of spheres/cylinders as final characters.
- No fantasy peasant/ranger clothing presented as finished modern post-apocalyptic clothing.
- No combination of semi-realistic people with a primitive diorama world.
- No fake "premium" acceptance based on hue changes, a brighter sun, post-processing alone, new code class names, or an isolated model-viewer screenshot.

Procedural low-detail assets are allowed ONLY as explicit fallbacks, loading placeholders, distant LODs or deliberate debug assets. They must not dominate the normal close-up gameplay view.

---

## 2. Why the supplied gameplay screenshots fail the target

**User visual references dated 2026-11-26:** noon (`12:00`), night (`00:01`) and sunrise (`06:16`) at ordinary gameplay camera distance.

| Observed current problem | Required replacement |
| --- | --- |
| Trees show smooth angular, solid green balloon/cone crowns and bare straight trunks | Authored or carefully modeled branch systems, real visible leaves/needle clusters, bark textures, natural silhouette variation and wind motion |
| Terrain looks like smoothed green color fields and large visible triangles | Detailed multi-material PBR surfaces with grass/soil/moss/rock/sand, believable normal/roughness detail, local debris and controlled biome blends |
| Rocks are simple polyhedrons | Varied weathered rock geometry with rough stone materials, moss/soil contact and natural embedding |
| Grass cover is sparse isolated triangular spikes | Dense close-range blades/clumps, flowers, leaf litter and shrubs appropriate to each biome, with wind and distance LOD |
| Bright daylight is flat and the character looks stylistically disconnected | Unified lighting, contact shadows, correctly exposed PBR materials and characters/art assets with matching quality |
| Night is almost featureless black tree silhouettes | Atmosphere, recognizable moon/cloud layers, restrained night visibility, believable practical lights and meaningful contrast |
| Sunrise sky has simplistic flat cloud shapes and a harsh horizon division | Atmospheric scattering approximation, clouds with volume/soft shading, haze and natural sun occlusion |
| Far terrain lacks convincing regional mass and depth | Engine-linked terrain LOD, mountain/coast silhouette, atmospheric perspective and coherent terrain material scale |

**These three screenshots are a BEFORE baseline, not proof of final quality.** Subsequent development must capture matched after shots from the actual game at the same seed/time/location/camera when possible.

---

## 3. Art production pipeline — actual assets, not just procedural primitives

NewDawn's planet is procedurally generated; its **visual asset library should not be exclusively primitive-generated**. Build a repeatable pipeline for original or appropriately licensed authored 3D models and textures.

### Accepted production sources

1. Original Blender or other author-created, exported GLB/glTF assets.
2. Existing high-quality assets with verifiable usage rights, preferably CC0. Keep exact asset source, author, license and modifications in `ASSET_CATALOG.md` and any required attribution/license text locally.
3. Bespoke shaders, texture layering, instancing and procedural placement that create realistic-looking output.
4. Generated/modelled variations of detailed base assets where the result passes the same visual review.

**Verified starting libraries for real-looking assets/materials (not automatic proof that a specific model exists):**

- [Poly Haven](https://polyhaven.com/) — CC0 PBR textures, HDR environments and 3D assets; check available subject matter and optimize original downloads for WebGL/mobile.
- [ambientCG](https://ambientcg.com/) — CC0 PBR material maps and other environment assets; verify map channels and export resolution per material.

These are suitable places to find bark, rock, soil, sand, concrete, rust, brick and other believable material surfaces. They do not by themselves guarantee eight suitable animated tree meshes, modern rigged human models or all animal species; those assets still require explicit acquisition/authoring and review.

Do not download copyrighted models, textures, photographs, scans or sounds without confirmed permission. Do not claim an asset is CC0 without verifying its source. Never hotlink runtime assets from external websites; bundle them for GitHub Pages/offline PWA. If quality assets cannot be obtained in the available environment, state the obstacle, produce a technically sound asset-ingestion pipeline and request/schedule the missing authored source; **do not substitute green cones and call them premium trees**.

### Preferred runtime format

- GLB/glTF meshes and skeletal animation; sensible geometry topology and UVs.
- PBR textures: base color (sRGB), normal, roughness, metallic where applicable, ambient occlusion; optional opacity/alpha, emissive and height details.
- Shared material atlases and texture compression where supported (e.g., KTX2/Basis); robust locally packaged fallbacks.
- Appropriate texture resolution: choose by actual screen-space size and hardware. Small repeated assets may need 512–1024 maps; hero assets may need higher resolution; do not impose one universal size.
- LODs, geometry instancing, GPU-driven foliage where practical, frustum culling, bounded particle pools, lazy loading and clear disposal rules.
- Character and animal rigs should have animation names/retargeting data and real foot contact alignment.
- Texture and material scale must remain stable across terrain chunks, scene-origin relocation and eventual terrain LOD.

**Asset register fields:** ID, role, family/biome, source link, author, license, local path, poly/triangle count, textures/resolutions, compressed size, number of materials/draw calls, LODs, rig/animations, collision type, runtime use, reviewed screenshots and acceptance status.

---

## 4. Terrain and ground — detailed natural surfaces everywhere

The terrain must read as **actual ground**, not colored geometry.

**Minimum material families:**

- Lush grass and dry grass.
- Temperate forest leaf litter, humus, twigs and moss.
- Bare compact soil, loose soil, mud and wet soil.
- Fine sand, coarse sand, pebbles and gravel.
- Shale, granite-like rock, weathered boulders, cliff faces and scree.
- Snow, crusted snow, exposed frozen ground and ice.
- Dark volcanic basalt, ash, pumice-like terrain and cooled lava.
- Coastal wet sand and rocky shoreline.
- Urban debris, worn asphalt, cracked concrete and reclaimed roads around ruins.

**Rendering requirements:**

- Use tiled PBR detail maps with convincing close-up grain, normal-map relief, micro-roughness and color breakup.
- Blend layers by **biome, slope, elevation, moisture, geology and season**. Use sensible smooth splat masks and/or triplanar texturing on steep rock; avoid hard rectangular texture seams.
- Correct world-space scale: sand grains, stones and grass should not appear gigantic. Break obvious tiling using larger-scale noise, macro-color variation, decals and sparse meshes.
- Make nearby texture density high enough that the terrain remains detailed at normal camera distance. Terrain must NOT look blurred.
- Integrate local detail meshes: scattered small stones, roots, twigs, leaves, grass tufts, mushrooms and soil variations, with reproducible placement and sparse regions where appropriate.
- Preserve actual terrain editing, resource depletion, footprint exclusion, roads, collision and saved geo ownership. Changes must invalidate the relevant visual overlays safely.
- Large mountains have real-looking geological stratification, steep rock faces, ridgelines, talus/scree, snow line and environmental perspective. Include credible volcanic regions and craters when their geological generator is built; active lava simulation is separate work.
- The visual surface must work with current near chunks and the future near/mid/far terrain LOD. Do not mislabel the not-yet-working LOD as finished.

**FAIL condition:** At midday from the ordinary third-person camera, most ground still appears as flat large green/brown triangles or a blurred gradient, with only a few spikes of grass.

---

## 5. Trees — real branches, individually readable foliage and wind

The user's central request: **trees need leaves**, visible branching and believable movement in the wind.

### Botanical structure

Each nearby tree should have:

- A trunk with natural taper, non-perfect curvature and bark material.
- Major branches with believable branching angles and varied heights.
- Smaller boughs/twigs that carry actual foliage.
- **Leaf cards/clusters or efficiently instanced leaf meshes** with believable silhouettes, cutout opacity and correct double-sided handling as required. Needles use detailed clusters/sprigs, not green cones.
- Species-appropriate crown shape, canopy density, root flare and asymmetry.
- Natural color, age, scale and seasonal variation without visually random noise everywhere.

Realistic leaf rendering does **not** mean modelling every individual leaf as a unique high-poly object. Efficient foliage cards, atlases, alpha-tested materials, clustered sprigs and instanced branches are standard techniques. Near trees should visibly have leaves, while distant trees may use lower detail or impostors if transitions are convincing.

### Minimum species families

| Tree | Appearance requirement | Regions |
| --- | --- | --- |
| Pine | Textured bark, distinct long branches, needle clusters, sparse irregular crown | Boreal/mixed forests |
| Spruce | Dense drooping needle boughs, conical natural silhouette but not a solid cone | Boreal/alpine |
| Birch | Distinct white/dark bark, delicate branches, small leaf clusters | Temperate/boreal |
| Oak | Twisted thicker branches, broad uneven leaf crown | Temperate |
| Maple | Detailed lobed-leaf clusters, seasonal autumn variation | Temperate |
| Palm | Segmented/curved trunk, actual arching separated fronds | Tropical coasts/oases |
| Acacia | Flat spreading branch canopy, visible separate leaf clusters | Savanna |
| Tropical broadleaf | Layered broadleaf canopy, asymmetry, buttress/root structures as appropriate | Tropical forest |

Require multiple believable age/shape variants per family, ideally from a reusable authored source set. Young saplings must not simply be uniformly scaled mature trees. Forests have density structure, clearings, broken limbs, dead trees, undergrowth and different age groups.

### Wind-driven motion

- Wind comes from a common weather/wind state; do not invent independent unrelated animation per tree.
- Trunks stay mostly stable; large branches bend subtly; foliage flutters and small branches sway more.
- Apply GPU vertex deformation or efficient skeletal/instance-level wind weighting when possible, with per-instance phase and height/branch attenuation.
- Wind responds to gusts and storms; calm weather has gentle movement.
- Leaves should not all sway in lockstep, clip heavily through the trunk or stretch visibly.
- Deciduous trees change foliage with season, using natural colors and leaf loss where appropriate; evergreens mostly retain foliage.
- Wood gathering/depletion, construction exclusions and terrain edits still work.

**FAIL condition:** A normal camera screenshot still predominantly shows solid green cones, egg shapes, flat 3D blobs or cartoon crowns without leaf/needle geometry.

---

## 6. Ground vegetation, rocks, biomes and life

**Grass:** visible individual blades/clumps close to camera, species/height variation, wind response, color/specular detail, density controlled by surface and habitat. Patchy ground in dry areas. No permanent triangular spikes as final art.

**Other plants:** ferns, herbs, flowers, bushes, moss, reeds, tropical undergrowth, cactus with natural anatomy, deadwood, fallen leaves, root debris. Use a small **high-quality asset library**, then vary its distribution procedurally instead of creating many poor models.

**Rocks:** irregular eroded meshes, sharp and rounded variants, fractured strata where geologically appropriate, high-quality stone PBR, partly embedded in ground, weathering and moss. Mineral nodes should look like plausible ore-bearing rock rather than colored dodecahedrons.

**Global regions:** temperate forest, boreal forest, tundra, polar ice, alpine, hot/cold deserts, tropical rainforest, savanna, wetlands, volcanic slopes and coasts must have visibly different terrain/trees/undergrowth/horizon. Place vegetation with latitude/elevation/moisture/soil/water/slope and biome rules, not randomly everywhere.

**Ecological consistency:** no trees through structures, roads or deep water; no tropical plants in permanent polar ice. Preserve wildlife habitats, interaction and save state. Future grazing/browsing can alter vegetation.

---

## 7. Human characters, clothes and equipment — one coherent realism level

Current authored Quaternius characters are **transitional**, not an automatically accepted final look. Replace or improve them when they visibly conflict with the new environment.

- Believable anatomy, joints, hands, boots, faces, hair, eyes and proportions. Avoid plasticky skin, featureless faces and blocky body shapes.
- Default survivor, Mira, raiders and NPCs wear **modern/post-apocalyptic** clothing: durable trousers, jackets, hoodies, workwear, tactical/utility fabrics, boots, gloves, patched layers, weathered backpacks. No mandatory medieval peasant outfit in the normal current-era world.
- Clothing has material realism: seams, pockets, cloth folds, leather, stitching, dirt and wear. Vary outfits by occupation, climate, damage and available supplies.
- Backpack and hand equipment have actual sockets/attachments and visual correspondence with inventory; held tools align to animation poses.
- Creator sliders/options must visibly change real meshes, textures or accessories; do not claim modern clothes, helmets or facial options if only a peasant GLB is shown.
- Movement: natural idle shifts, walk/run gait, start/stop transitions, jump and landing, swimming, crouch, gather, melee, throwing, carrying, climbing and eventually riding; hands and feet should meet objects/ground believably.
- Character LOD, shadow quality and mesh/material budgets adapt to distance and device without changing silhouette unexpectedly.
- Target scale: realistic humans ~1.6–2.0 m according to individual type, with consistent animal, door, car and furniture scaling.

**FAIL condition:** The detailed character and crude angular environment still look like assets from unrelated games.

---

## 8. Animals and alien creatures — anatomically recognizable and animated

All twelve currently planned animals need eventual **actual finished models**, not just procedural species names: deer, rabbit, wolf, bird, brown bear, snake, squirrel, reindeer, moose, cow, sheep and fox.

- Readable anatomy, fur/feather/skin materials, correct size relative to humans and species-specific silhouette.
- Rigged, authored or genuinely high-quality animation: idle, walk, run, graze, sniff, flee, attack, hit, death and other relevant species actions.
- Foot placement respects terrain; no ice skating, weightless turns or constant robotic oscillation.
- Bear and moose should look substantial, rabbit and squirrel small, deer and reindeer distinct; snakes move with smooth body articulation and birds with convincing wing mechanics.
- Herds, habitats, breeding, taming, wild riding, balance and eventual horse mounts remain separate **gameplay** milestones. The art pipeline must anticipate saddles/attachments and mount interaction.
- Alien remnants have a distinctive unfamiliar but biologically coherent anatomy, surface materials and silhouettes; horror comes from movement, lighting, sound and behavior, not primitive floating shapes.
- Marine mammals, fish, sharks, rays and other aquatic life are future quality targets with matching art direction.

**FAIL condition:** At gameplay distance, animal types can only be identified by color or are mostly untextured geometric solids.

---

## 9. Architecture, ruins, transportation and alien technology

- **Modern ruins:** believable wrecked houses, concrete/brick walls, beams, window frames, broken asphalt, corrosion, cracked plaster, moss, vines, fallen materials and accessible interiors.
- **Player construction:** textured timber with grain and joints, natural stone, real brickwork/mortar, concrete, steel, roofing and glass. Roofs, stairs, frames and doors must connect cleanly and have convincing thickness, trim and material variation.
- **Old prefab shelters:** inaccessible decorative buildings are not accepted as finished functional housing. Deprecate/migrate safely rather than deleting saved structures blindly.
- **Vehicles:** physically plausible proportions, glass, rubber, metal, rust, dirt and interior access. Abandoned cars, buses, trains, ships and aircraft are distinct authored props; future repair/fuel/driving are separate gameplay milestones.
- **Defenses:** wooden/metal fences, operable gates, stone walls, watchtowers and traps need consistent material style, collision and later damage/repair systems.
- **Alien portals:** rare, distinctive geometries and emissive energy fields contrasting with terrestrial ruins; save/network interaction/Atlas destinations and NPC usage are future mechanics, not just a glow effect.
- Detail is layered deliberately: main silhouette, secondary structural geometry, surface material and small wear/debris accents. Decals should help realism, not cover architecture in noisy repetition.

---

## 10. Sun, moon, atmosphere, clouds and weather

- The **sun must be visible** in the sky, aligned with the actual directional sunlight, and travel through realistic-looking morning/noon/evening arcs based on game time, latitude, season and heading; below horizon at night.
- The **moon** has changing apparent location, reasonable illumination and phases. Sometimes it is below the horizon or behind clouds.
- A true-looking atmosphere with gradual blue hour, sunrise haze, daylight gradients, sunset gold, high-altitude blue, distance fog and aerial perspective. No harsh untextured horizon band.
- Clouds should feel volumetric and naturally lit even if implemented with affordable impostors/layered shaders. They need soft edges, varied thickness, plausible shapes and motion. Flat stretched featureless polygons are not final-quality clouds.
- Cloud cover correlates with actual weather. Bright days have some clouds; overcast/rain has broad coverage. Sun/moon behind clouds are appropriately veiled with soft glow and diffuse light, **not a disc pasted in front of clouds**.
- Rain/snow/storm/wind gradually affect ambient brightness, visibility, wet surfaces, water and vegetation. Include distant weather haze, believable near rain and optional puddles.
- Night is truly nighttime but should remain visually legible by moonlight, artificial light, emissive alien structures or realistic dark adaptation. The player should not disappear into a single black silhouette on ordinary screens.
- Shadows: stable sun direction, coherent character/vegetation contact shadows, soft enough filtering, nearby quality without enormous mobile shadow cost. Match any origin rebasing.

**Visual review moments:** clear sunrise, noon, sunset, blue hour, moonlit night, overcast midday, hard rain, storm, snowy winter and windy day.

---

## 11. Water, fire, wind and environmental effects

**Water:** real-looking animated wave normals and modest geometry motion, water depth color, reflections where affordable, fresnel response, shoreline foam/wetness, natural ripples and splashes on swimming/jumping/falling, buoyancy cues and future boat wakes. Avoid featureless flat-blue planes and incorrect transparent intersections.

**Wind:** one environmental signal controls moving clouds, tree branches, grass, smoke, sparks and water behavior. Variation must be continuous and biome/weather-consistent.

**Fire:** layered flame shapes, thermal glow, realistic smoke, embers, heat distortion where affordable, light flicker and shadow interaction; real torch/campfire/building fire must use world-coherent attachment and bounded VFX pools. Fire spread through dry plants/wood, moisture/rain effects, player ignition, buckets and extinguishers are important future gameplay systems. Do not claim implemented merely from a better shader.

**Explosions:** cinematic in-game flash, dust, expanding pressure pulse, debris, impact, temporary lighting and environmental damage, scaling to future fictional very large explosions. Detailed destruction simulation and late-game fictional nuclear-style weapons remain future features; no real-world hazardous construction details are needed for the visual direction.

**Particles:** physically coherent origin/direction/lifetime, optimized geometry/materials, level-based density and proper cleanup.

---

## 12. Camera, composition, UI and sound-related cues

- Third-person player must remain legible among foliage; fix occlusion at source. Transparent occlusion should be selective and unobtrusive, not ghostly overlapping whole crowns or walls.
- Keep coherent exposure and tone mapping across biomes, day/night and effects. Avoid washed-out noon terrain and crushed-black evenings.
- Cinematic composition: foreground detail, midground variety, realistic distant terrain/horizon, atmospheric perspective; no uniform repeated shapes to the skyline.
- UI retains compact professional semi-transparent panels, minimap, left thumbstick, right four-way Jump/A/B/Weapon pad, responsive safe areas and real simultaneous multi-touch.
- New icon-based inventory, backpack, left/right hand equipment and contextual crafting are future interface milestones. Visual item art should be recognizable at small icon sizes, with tooltips accessible for clarity.
- Sound should eventually reflect wind, footsteps, foliage, water, animals, ruined infrastructure, alien-night tension and environment impacts. Pure art changes must not pretend sound exists when it does not.

---

## 13. Browser / mobile performance is an engineering constraint, not an art style

The target platform remains TypeScript, Three.js, Vite, GitHub Pages and offline-first PWA, with Windows desktop and mobile browsers.

- Use **realistic-looking optimized models**, not deliberately unrealistic primitives as the default aesthetics.
- Set device-driven Low / Medium / High / Ultra-equivalent quality tiers according to measured capability; leave existing settings functional.
- Maintain material atlases, LOD/instancing, sensible plant density, low-cost shadows on mobile and bounded water/cloud/fire effects.
- Profile rather than guess. Starting goals: playable stable ~30 FPS on an actually tested midrange phone and ~60 FPS on a suitable desktop, with device/scene context recorded. These are goals, **not presently verified results**.
- Record approximate draw calls, triangles, geometry/textures memory, frame-time distribution, scene object count and first-load/download size on test scenes.
- Avoid a gigantic mandatory PWA precache. Distinguish critical offline shell from optional region and environment art assets; provide explicit cache strategy and safe offline fallbacks.
- Preserve existing v12 save compatibility, scene-origin rebasing, mobile controls, structures, world seed, crafting, combat and resource depletion. Do not accidentally switch on unfinished 005C-P3 tangent geometry or imply terrain LOD works when it does not.

**Performance optimizations must preserve visual appearance**: low-detail models may appear at distance; foreground realistic branches, leaves, bark, rock and ground must still have enough fidelity.

---

## 14. Required visual acceptance — compare like with like

Every graphical checkpoint requires **actual application evidence**, not only tests or code screenshots.

### Mandatory benchmark scenes

| Scene | What must be visible | Reject if... |
| --- | --- | --- |
| Temperate forest at noon, normal third-person camera | Bark, actual leaf/needle clusters, rich ground textures, rocks and convincing light | Flat polygon terrain or balloon-cone crowns dominate |
| Close tree inspection | Branch hierarchy, real leaves/needles, bark PBR, wind over a short sequence | Foliage is only a solid geometric sphere |
| Ground close-up and normal distance | Soil/grass/pebble detail, normal/roughness, natural blend | Ground is mainly color gradients or visibly blurry |
| Dawn and sunset | Sun in correct sky position, atmospheric hues, cloud occlusion and shadows | Static disc/flat band/artificial light mismatch |
| Midnight and moonlit night | Moon/clouds, night atmosphere, practical light and readable foreground | Everything disappears in undifferentiated black |
| Rain/storm | Believable cloud coverage, moving rain, wetness, dimmer light, wind | Only the screen tint changes |
| Coast/river/water entry | Surface movement, shoreline quality, splash and spreading ripples | Flat water and no interaction |
| Desert, boreal, alpine, tropical | Different geology/vegetation/materials and matching Atlas/biomes | Same trees and textures recolored |
| Modern ruin interior/exterior | Modern-scale architecture, weathered materials, vegetation and accessible openings | Decorative primitive blocks with fake entrances |
| Human + wildlife together | Matching realistic art, believable anatomy and scale, natural animation | Character and landscape still belong to different visual styles |
| Desktop + mobile portrait/landscape | Readability, sensible LOD, touch controls and stable performance | Essential controls occluded or scene broken |

### Evidence protocol

1. Save **before/after** screenshots with the **same seed, same world position, same camera, same weather/time and viewport** when comparing quality.
2. Capture genuine default gameplay, not a detached model viewer or imported reference image.
3. For motion (leaves/clouds/ripples), capture time-separated frames and verify live render state; a single still cannot prove animation.
4. Include at least 1280x720 or similar desktop, 390x844 portrait and 844x390 landscape views; retain other responsive viewport tests.
5. Inspect and critique every screenshot. If the view still fails the conditions, fix and recapture rather than declaring success because unit tests pass.
6. Record asset provenance and whether each subject is **planned / modeled / runtime integrated / gameplay tested / performance tested / visually accepted**.
7. Build and regression verification remain required; physical device validation cannot be claimed from Edge emulation.
8. If a gate requires missing licensed source models or artist-generated meshes, record that dependency explicitly instead of lowering the art quality target.

**FINAL GRAPHICS ACCEPTANCE** requires the game to look coherent and convincingly naturalistic in ordinary gameplay, not merely less low-poly than the previous build. Art direction is judged by what appears on screen.

---

## 15. Delivery sequencing — substantial improvements, not a false all-at-once finish

This document covers the **final target for every visual domain**; it is not a claim that one development batch can complete all domains.

### Art production sequence

**ART-0 — Audit and quality reference:** preserve current screenshot baseline, audit runtime assets/materials, establish a truthful licensed-asset ingestion and material pipeline.

**ART-1 — Landscape and foliage transformation (first visible priority):** detailed ground PBR and texture blending; genuinely leafy broadleaf/conifer trees, bark, branches, wind response; varied shrubs/grass, realistic rocks; normal player-camera before/after.

**ART-2 — Atmospheric environment:** visible moving sun and moon, convincing clouds, weather/haze, shadows and day-night readability; dynamic wind and coherent exposure.

**ART-3 — Water and regional landscape:** believable shoreline, movement/splash/ripples, strong mountains/biome variation, later volcanoes and terrain LOD/horizon integration.

**ART-4 — Human and wildlife asset replacement:** modern/post-apocalyptic humans, backpacks, equipment, all twelve realistic-looking animals with rigs, animations and believable scale; enemy/alien art consistency.

**ART-5 — Architecture and effects:** realistic construction materials, ruins, salvaged vehicles, fences/walls/defenses, fire/VFX, eventual destruction and portal appearance.

**ART-6 — Full polish:** environmental sound, animations, fine decal variety, final UI, seasonal coherence, camera and mobile performance and acceptance.

The existing **Batch 005D-A** can work on art foundations now, but **the latest captured screenshots do not satisfy ART-1**. Its sky improvements must NOT be accepted as proof that the terrain/forests are finished. The unfinished shared terrain/structure/collision frame and real hierarchical terrain LOD remain a **separate required 005C-P3 engine milestone**. Do not conflate future plans with implemented functionality.

**Do not commit, push, deploy or publish automatically.**

---

## 16. Permanent future-world visual elements

The following belong in the long-term roadmap and must be represented in the art system when implemented:

- Rare alien teleportation gates with distinct materials/energy VFX, unknown destinations and dangerous alien nests; later player-built Atlas-linked destinations and NPC/multiplayer usage.
- Defensive wooden/metal fences, stone walls, gates, traps, towers and later automated defenses.
- Modern/post-apocalyptic survivor gear, realistically worn backpacks, hand-held pickup items, icon inventory and visible equipment slots.
- Mountable horses and complex wild-animal riding/taming, with motion and equipment animation.
- Brick-and-clay kiln building chain, repairable structures, realistic ruins and abandoned vehicles.
- Nature-driven fires, extinguishing with water buckets and extinguishers, weather and wind-driven spread.
- Volcanoes and ash, grand mountain ranges, caves, rivers, oceans and marine wildlife.
- Fictional cinematic explosion/destruction VFX, including optional enormous late-game blasts as safe abstract game mechanics.
- Autonomous settlements, practical machinery, transport infrastructure, commerce and rebuilding civilization.

All are future visual/gameplay requirements until their respective trackers and acceptance tests say otherwise.

**Core promise:** A beautiful, believable reclaimed Earth worth exploring, with realistic trees that have actual leaves, detailed ground beneath the player's feet and cohesive animals, people, architecture, lighting, water and weather everywhere the player goes.

---

## Cinematic Rendering & Adaptive Visual Quality — Version 2.1 addition

This addition extends Version 2.0; it does not replace its grounded-realism requirements or declare them implemented.

- Compose ordinary gameplay with readable foreground detail, an identifiable player and interactables, varied middle-distance vegetation and a coherent background. Use gradual, weather- and time-aware atmospheric perspective without hiding missing terrain or landmarks.
- Stabilize fine foliage with appropriate antialiasing, alpha handling and mipmaps. Use natural exposure, color management and tone mapping; daylight must not wash out ground or snow, and night must remain dark but navigable under suitable light.
- Keep sunlight and shadows coherent, stable under render-origin relocation and appropriately soft. Scale shadow cost by quality and device capability.
- Detect camera obstructions geometrically and fade or otherwise resolve only what is needed to keep the character readable. Avoid whole-forest ghosting, popping and hiding the player's interaction target.
- Gameplay depth of field, if used, must be optional, restrained, focused smoothly and excluded from the HUD; default mobile and reduced-quality gameplay should avoid expensive blur. A future Photo Mode may offer manual focus, aperture-like control and exposure. **Depth-of-field blur is not a substitute for LOD, streaming or geometry optimization.**
- Use measured, performance-first mobile rendering with a bounded internal resolution, meaningful quality controls and reversible, hysteretic adaptive behavior where implemented. Low quality retains credible nearby realistic art rather than substituting cartoon primitives. Explicit player choices must be respected.
- Preserve the future cinematic moon, stars, Milky Way and cloud-occluded celestial bodies. Validate sky behavior across time, weather and camera orientation without letting sky polish replace forest work.
- Record representative frame-time distributions, rendering workload, loading and cache costs. Browser emulation is useful functional evidence, not physical-device performance acceptance; test real older/midrange and modern phones as well as suitable desktops before accepting device targets.
