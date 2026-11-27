# Asset catalog

Runtime environment geometry combines locally bundled authored nature assets with original procedural fallbacks. Authored character assets and ground textures are listed below.

## Batch 005D-A3.2 authored mature-tree evaluation

[Jacaranda Tree](https://polyhaven.com/a/jacaranda_tree), modeled by Rico Cilliers with guidance by Rob Tuytel, is [CC0](https://polyhaven.com/license). The checked 1k glTF and textures were converted with `scripts/optimize-nature.mjs` (6,000 target triangles, error 0.3, source leaf alpha). The resulting `public/assets/environment/trees/mature-broadleaf.glb` is 8,582,168 bytes and approximately 32,156 triangles. A deterministic subset of oak-classified resource nodes uses this Jacaranda-derived *visual*, not a botanically accurate oak; other nodes use the existing prototypes. Placing it at every broadleaf node obscured gameplay, so selective placement is experimental and has not passed mature-forest or performance acceptance.

[Pine Tree 01](https://polyhaven.com/a/pine_tree_01), a CC0 asset by Poly Haven, supplies the experimental mature-conifer prototype `public/assets/environment/trees/mature-pine.glb`. The checked 1k glTF's three trunk variants are alternatives; runtime currently uses `pine_tree_01_a_LOD0`. Its source has a 948,849,556-byte geometry buffer and millions of twig triangles. `scripts/optimize-nature.mjs` retains 1/16 of deterministic disconnected needle/twig clusters, simplifies retained structural clusters to at most 24 triangles and smaller clusters to at most 12, and combines the 1k twig alpha map with base color. The resulting alpha-masked, double-sided GLB is 14,733,468 bytes and 106,749 triangles. A deterministic subset of pine-classified resources uses this visual at nine nominal units; ordinary pine seedlings, fallback rendering and resource IDs remain. The live boreal capture shows the tall branching silhouette but the crown is still too sparse for mature-forest acceptance. This asset is mandatory precached content, not a streamed optional download.

## Batch 005D-A2 terrain textures — partial

The following 1,024 × 1,024 JPEG sets are unchanged Poly Haven files, checked 2026-11-26 against the source API MD5 checksums. Each includes diffuse, OpenGL normal and roughness maps. All are [CC0 1.0](https://polyhaven.com/license); author credits are retained here even though attribution is not required.

| Asset | Author | Source | Runtime files | Total bytes |
|---|---|---|---|---:|
| Grass Ground | Charlotte Baglioni | [grass_ground](https://polyhaven.com/a/grass_ground) | `public/assets/environment/terrain/grass_ground_*_1k.jpg` | 2,515,290 |
| Forest Ground 01 | Rob Tuytel | [forrest_ground_01](https://polyhaven.com/a/forrest_ground_01) | `public/assets/environment/terrain/forrest_ground_01_*_1k.jpg` | 2,519,639 |
| Coast Sand 01 | Rob Tuytel | [coast_sand_01](https://polyhaven.com/a/coast_sand_01) | `public/assets/environment/terrain/coast_sand_01_*_1k.jpg` | 2,491,332 |
| Rocky Terrain | Amal Kumar | [rocky_terrain](https://polyhaven.com/a/rocky_terrain) | `public/assets/environment/terrain/rocky_terrain_*_1k.jpg` | 2,404,121 |

Batch 005D-A3 adds [Park Dirt](https://polyhaven.com/a/park_dirt) by Christopher Melani (3,050,301 bytes) and [Snow 02](https://polyhaven.com/a/snow_02) by Rob Tuytel (1,553,444 bytes), also CC0 and checked against the source API MD5 values. Source downloads can be reproduced from `https://api.polyhaven.com/files/<asset-id>` using the `Diffuse`, `nor_gl` and `Rough` 1k JPEG entries; no runtime requests use the API.

`scripts/pack-terrain.mjs` packs the six source sets into padded 1,632 × 1,088 color and normal-XY/roughness atlases. Their combined download is 2,900,686 bytes and only these atlases, not the source JPEGs, are mandatory offline entries. Two uncompressed RGBA atlases with mipmaps would require approximately 18 MiB before driver overhead; this is an estimate, not a measured GPU allocation.

## Batch 005D-A2 authored nature — partial

These Poly Haven models and their original 1k texture dependencies were checked against the source API checksums on 2026-11-26. Their license is [CC0 1.0](https://polyhaven.com/license). Source glTFs and buffers were downloaded to the development session workspace; they are not required at runtime or tracked here. Runtime GLBs are local and precached; there is no runtime hotlinking.

| Asset and original node | Credit | Runtime path | Size | Runtime triangles |
|---|---|---|---:|---:|
| [Fir Sapling](https://polyhaven.com/a/fir_sapling), `fir_sapling_a` | Rob Tuytel (photography), Rico Cilliers (model) | `public/assets/environment/trees/fir-sapling.glb` | 4,993,840 bytes | 23,001 |
| [Pine Sapling Small](https://polyhaven.com/a/pine_sapling_small), `pine_sapling_small_a` | Rob Tuytel (photography), Rico Cilliers (model) | `public/assets/environment/trees/pine-sapling.glb` | 5,557,424 bytes | 12,399 |
| [Tree Small 02](https://polyhaven.com/a/tree_small_02), `tree_small_02_LOD0` | Rico Cilliers | `public/assets/environment/trees/tree-small.glb` | 7,876,820 bytes | 35,240 |
| [Jacaranda Tree](https://polyhaven.com/a/jacaranda_tree), selectively used as a broadleaf visual | Rico Cilliers, Rob Tuytel | `public/assets/environment/trees/mature-broadleaf.glb` | 8,582,168 bytes | 32,156 |
| [Pine Tree 01](https://polyhaven.com/a/pine_tree_01), `pine_tree_01_a_LOD0` | Poly Haven | `public/assets/environment/trees/mature-pine.glb` | 14,733,468 bytes | 106,749 |
| [Rock Moss Set 01](https://polyhaven.com/a/rock_moss_set_01), six nodes | Kless Gyzen | `public/assets/environment/ground/rocks.glb` | 584,704 bytes | 700 per rock |
| [Grass Medium 02](https://polyhaven.com/a/grass_medium_02), `grass_medium_02_a` | Rico Cilliers | `public/assets/environment/ground/grass.glb` | 819,384 bytes | 95 per clump |
| [Fern 02](https://polyhaven.com/a/fern_02), `fern_02_a` | Rob Tuytel (scanning), Rico Cilliers (model) | `public/assets/environment/ground/fern.glb` | 1,269,108 bytes | 162 per clump |
| [Shrub 03](https://polyhaven.com/a/shrub_03) | Rico Cilliers | `public/assets/environment/ground/shrub.glb` | 1,758,900 bytes | optimized foliage |

`scripts/optimize-nature.mjs` reads a downloaded glTF and its neighboring buffer/textures, selects an optional named node, welds and simplifies geometry, and writes GLB. The foliage-specific path samples disconnected tree leaf/needle clusters, enlarges retained clusters, simplifies each, and preserves larger conifer twigs; plant conversion retains each disconnected component. Grass and fern conversion merges the source 1k alpha PNG into base color and uses alpha masking. Source glTF/texture dependencies and alpha PNGs are available from the source API. With the source asset directories under `$trees` and `$ground`, reproduce the current assets with:

```powershell
node scripts\optimize-nature.mjs "$trees\fir_sapling\fir_sapling_1k.gltf" public\assets\environment\trees\fir-sapling.glb 2500 0.5 fir_sapling_a
node scripts\optimize-nature.mjs "$trees\pine_sapling_small\pine_sapling_small_1k.gltf" public\assets\environment\trees\pine-sapling.glb 2500 0.5 pine_sapling_small_a "$trees\pine_sapling_small\pine_sapling_small_twig_alpha_1k.png"
node scripts\optimize-nature.mjs "$trees\tree_small_02\tree_small_02_1k.gltf" public\assets\environment\trees\tree-small.glb 2500 0.5 tree_small_02_LOD0
node scripts\optimize-nature.mjs "$ground\rock_moss_set_01\rock_moss_set_01_1k.gltf" public\assets\environment\ground\rocks.glb 700 0.5
node scripts\optimize-nature.mjs "$ground\grass_medium_02\grass_medium_02_1k.gltf" public\assets\environment\ground\grass.glb 300 0.5 grass_medium_02_a "$ground\grass_medium_02\grass_medium_02_alpha_1k.png"
node scripts\optimize-nature.mjs "$ground\fern_02\fern_02_1k.gltf" public\assets\environment\ground\fern.glb 500 0.5 fern_02_a "$ground\fern_02\fern_02_alpha_1k.png"
node scripts\optimize-nature.mjs "$trees\pine_tree_01\pine_tree_01_1k.gltf" public\assets\environment\trees\mature-pine.glb 1200 0.3 pine_tree_01_a_LOD0 "$trees\pine_tree_01\pine_tree_01_twig_alpha_1k.png" pine_tree_01_twig
```

Regenerate the two terrain atlases from the six checked-in source sets with `node scripts\pack-terrain.mjs`.

Batch 005D-A3 retains one in four leaf/needle clusters and enlarges retained clusters; broadleaf uses alpha masking. The mature pine uses a more conservative 1/16 twig-cluster selection. Plant conversion preserves source alpha and pads transparent RGB pixels; normalized vertex-color types are retained. The pine sapling uses a five-unit nominal height, experimental mature broadleaf seven and mature pine nine, and the other trees four. Shrub foliage replaces the former fern stand-in, with procedural berries attached to sampled plant vertices. Trees have shared near/mid foliage geometry with hysteresis; ground cover varies its instance count by distance and quality. Geometry and textures are shared per world; fallbacks remain on load failure and for unsupported climates. Five tree prototypes do not represent eight authored species: spruce still shares the fir and the adult pine uses only one of its three source trunk variants. Forest density, broadleaf crowns, mature-conifer needles, grass and primitive cacti need further visual work. The nine GLBs total 46,175,816 bytes; with the two terrain atlases they add 49,076,502 mandatory offline bytes. This is a package-size sum, not a measured transfer/startup or device-memory benchmark.

## Nature
- Streamed procedural terrain with original starter region, broad continental forms, and desert and polar/snow colors
- Five authored tree prototypes replace/selectively enrich temperate broadleaf and conifer resource visuals; other geographic variants and load failures retain fallbacks. Eight distinct authored species and global climate distribution are unfinished.
- Instanced authored grass and ferns; procedural flowers remain.
- Six authored moss-rock shapes for stone and deposits; fallback rocks remain procedural.
- Gatherable bushes use authored shrub foliage and small procedural berries; close-up visual acceptance remains open.
- Six locally textured terrain families blend in streamed terrain. Animated ocean shading includes terrain-depth shoreline transparency; no authored rivers or water-travel assets yet.
- Original shader sky with moving sun, moon and cloud pattern; bounded procedural water-entry ripples and particles
- The World Atlas uses a cached one-degree raster of generated world biomes; current exploration fog and coarse raster resolution are visible limitations

## Characters
- Player, seeded NPC and raider: Quaternius Universal Base Characters Standard, Modular Character Outfits - Fantasy Standard, and Universal Animation Library Standard. The specific archives each include a CC0 1.0 license; their license texts are retained alongside the files in `public/assets/characters/quaternius/`. Source pages: [base characters](https://quaternius.itch.io/universal-base-characters), [fantasy outfits](https://quaternius.itch.io/modular-character-outfits-fantasy), and [animations](https://quaternius.itch.io/universal-animation-library). Models and animations are by Quaternius; the animation page also credits Gonzalo Furnier.
- The bundled exports comprise masculine/feminine superhero base meshes, peasant/ranger outfits, five rigged hair/beard assets and the non-root-motion standard animation library. Texture images were resized to at most 512×512 and broken `_png.png` image references corrected; the base body mesh is filtered to retain the head at runtime. glTF buffers, meshes and clips otherwise come from the standard packs.
- Undead, necromancers, armored fighters, night creatures and champions retain original procedural models. There is no character LOD, specialized authored modern outfit or complete mapping for all appearance options. The premium visual acceptance gate remains open.

## Wildlife
- Twelve procedural species: deer, rabbit, wolf, bird, brown bear, snake, squirrel, reindeer, moose, cow, sheep and fox. Articulated movement and ecology are limited; premium models and rigs are not implemented.

## Buildings
- Modular wooden roofs: original procedural flat tiles and sloped gable/single-slope surfaces with end caps. Irregular gable requests use a single-slope fallback. Roofing currently has one plain dark wood material, without authored shingles or additional material variants.
- Shelter
- Storage
- Lamp
- Generator
- Wind turbine
- Battery and cable post
- Wooden torch post and hand-held torch: original procedural meshes, flame geometry and pooled spark particles. No authored fire asset or fuel-dependent variations.

## Transport
- Four-wheel rover

## Application
- Original SVG and PNG application icons for the PWA
