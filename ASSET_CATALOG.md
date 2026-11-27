# Asset catalog

Runtime environment geometry combines locally bundled authored nature assets with original procedural fallbacks. Authored character assets and ground textures are listed below.

## Creator-supplied branding — 2026-11-27

The creator supplied the NewDawn Branding Assets pack and requested its integration. `public/assets/branding/newdawn-logo.png` is the unchanged `NEWDAWN_Logo_Transparent_1024px.png` (1024x341, 511,309 bytes). The dark primary ND artwork supplies the browser favicons, 180x180 iOS image and 192/512 standard and separately padded maskable PWA icons. These files are copied without artwork changes and included in the offline shell. The pack's README describes fresh artwork based on the creator's reference; no third-party or CC0 license is inferred.

## Batch 005D-A3.2 lunar surface

**Moon by Solar System Scope / INOVE**, from the publisher's [texture collection](https://www.solarsystemscope.com/textures/), is explicitly distributed under [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/), including commercial adaptation/sharing. Original download: `https://www.solarsystemscope.com/textures/download/2k_moon.jpg`, **2048x1024 / 1,053,869 bytes**, SHA-256 `2764ba6535ea0481a062846ee033cc7a909dae05b31a8fd13f3e98f3a7fd92bd`.

The bundled `public/assets/environment/sky/moon.jpg` is resized/JPEG-recompressed to **256x128 / 11,458 bytes**, SHA-256 `6ac539595f6ff914fab9c9740c8b3b82b8ebd10feaf60016622291cccbc4caaf`. Reproduce with the installed/locked `sharp` using `sharp(source).resize(256, 128).jpeg({ quality: 90 }).toFile(output)`, after verifying the source hash. The existing shader applies phase, cloud occlusion, cool tint and artistic surface intensity. No geometry, external runtime request or new dependency is added. Estimated mipmapped RGBA8 storage is **0.167 MiB**, not measured VRAM.

The adjacent `moon-LICENSE.txt` records author, source, license and modifications; Pause links it, and both files are in the mandatory offline shell. The publisher describes the pack as NASA-data-based, artistically adjusted and potentially gap-filled: do not claim scientific mapping/photometry or NASA/INOVE endorsement. The [gameplay comparisons](art-review/batch-005d-a3-2/moon-surface/390-mapped.png) include this credited adapted texture. A 512x256 scratch trial was reduced after review; no NASA GitHub local-terrain photo or inaccessible SVS map was bundled.

## Rejected A3.2 original curved-leaf shoot study

A scratch-only original bilberry-like clump used seven branching shoots, 35 folded silhouette leaves, one merged primitive/material and an opaque original 128px atlas: **448 triangles / 28,992 bytes**, native **0.693 x 0.367 x 0.637 m**. No external asset inputs or download/license dependency. The specialist supplied a deterministic generator and provenance/metrics. Four serial actual-game desktop/portrait comparisons showed insufficient visible forest-floor improvement, so neither the GLB nor generator entered the runtime asset package. See [test evidence](TEST_REPORT.md#mac-a32--original-curved-leaf-ground-shoots-rejected). Do not count this as an integrated plant or food resource.

## Batch 005D-A3.2 authored mature-tree evaluation

[Jacaranda Tree](https://polyhaven.com/a/jacaranda_tree), modeled by Rico Cilliers with guidance by Rob Tuytel, is [CC0](https://polyhaven.com/license). The checked 1k glTF and textures were converted with `scripts/optimize-nature.mjs` (6,000 target triangles, error 0.3, source leaf alpha). The resulting `public/assets/environment/trees/mature-broadleaf.glb` is 8,582,168 bytes and approximately 32,156 triangles. A deterministic subset of oak-classified resource nodes uses this Jacaranda-derived *visual*, not a botanically accurate oak; other nodes use the existing prototypes. Placing it at every broadleaf node obscured gameplay, so selective placement is experimental and has not passed mature-forest or performance acceptance.

[Pine Tree 01](https://polyhaven.com/a/pine_tree_01), a CC0 asset by Poly Haven, supplies the experimental mature-conifer prototype `public/assets/environment/trees/mature-pine.glb`. The checked 1k glTF's three trunk variants are alternatives; runtime currently uses `pine_tree_01_a_LOD0`. Its source has a 948,849,556-byte geometry buffer and millions of twig triangles. `scripts/optimize-nature.mjs` retains 1/16 of deterministic disconnected needle/twig clusters, targets at most 24 indices (8 triangles) for retained structural clusters and 12 indices (4 triangles) for smaller clusters, and combines the 1k twig alpha map with base color. The resulting alpha-masked, double-sided GLB is 14,733,468 bytes and 106,749 triangles. A deterministic subset of pine-classified resources uses this visual at nine nominal units; ordinary pine seedlings, fallback rendering and resource IDs remain. The live boreal capture shows the tall branching silhouette but the crown is still too sparse for mature-forest acceptance. This asset is mandatory precached content, not a streamed optional download.

The mature fir now uses an original, deterministic whorled branch skeleton from `scripts/generate-mature-fir.mjs`, textured with [Fir Tree 01](https://polyhaven.com/a/fir_tree_01) photographs by Rob Tuytel/model materials by Rico Cilliers, licensed [CC0](https://polyhaven.com/license). It replaces the sparse sampled source geometry, not the resource identity. The local `public/assets/environment/trees/mature-fir.glb` is **3,177,252 bytes / 43,452 triangles**: 17,076 bark and 26,376 foliage triangles, two materials, three 512-square bark maps and three 340x390 needle maps. Small crossed sprigs follow curved primary/secondary branches; these are not the rejected whole-crown projected cards. Needle color, alpha, normal and packed roughness are cropped from the existing 1k atlas, with transparent RGB padding. Estimated RGBA mipmapped texture storage is **6.02 MiB**, versus 48 MiB for the former nine 1k maps; actual driver allocation and overdraw are unmeasured.

The generator checks all seven source texture SHA-256 values before processing. Obtain the original 1k JPEG bark/twig diffuse, OpenGL normal and ARM maps and the twig alpha PNG through [the source file API](https://api.polyhaven.com/files/fir_tree_01), retaining their `fir_tree_01_*_1k` filenames. No original geometry buffer is needed. With the current lockfile the output was reproduced byte-for-byte, SHA-256 `6adacf1733681e7d3fcf69fd47b426134d6c1e60eee71416e6daa049cb9d4280`. Geometry is authored offline; no EZ-Tree source, textures or new dependency is bundled. MIT-licensed [EZ-Tree](https://github.com/dgreenheck/ez-tree/tree/dcf309bd86bd521083d9c70f01f2de45fdc7c457) was evaluated in scratch, but its tested presets read as leafy clumps and were not shipped.

Placement now selects a deterministic 32% subset of fir-classified resources, increased from 8% after matched forest-composition comparisons; this is not 32% of all trees. Nominal height nine, shared near/mid foliage, wind, resource IDs and the sapling fallback are unchanged. The GLB is fetched on demand and content-versioned/cached after use, not included in the mandatory offline shell. The 64% trial added more geometry without a proportionate improvement in the sampled view and was not retained. Matched desktop crown and normal-gameplay comparisons show fuller, more frequent firs; mixed-forest composition, pine quality, moving-camera and physical-device acceptance remain open. See `TEST_REPORT.md`. Spruce now shares the same 32% mature selection, and half of the remaining spruce/fir resources reuse the same cached prototype as a 0.6-scale young fir (visual-only, deterministic `treeAgeClass()`; sapling fallback until cached).

### Fir age-profile studies — rejected, not bundled

The retained 9 m whorled fir was compared at 12/16 m in actual desktop/portrait play and crown views. Uniform scaling brought oversized foreground boughs rather than a convincing adult forest. A separate original-authoring experiment lifted unchanged-size branches/crowns by 4/7 m onto extended, modestly thickened boles (13/16 m total), but exposed clean pole-like trunks and moved foliage out of ordinary framing. Neither approach was retained.

Both lifted models use the same checked CC0 Fir Tree 01 photos, two materials and 43,452 triangles; files are 3,177,252 / 3,177,256 bytes. Experimental models/generator remain outside runtime. [Normal-play](art-review/batch-005d-a3-2/fir-age-profile-trials/rejected-lifted-13m-normal.png) and [crown](art-review/batch-005d-a3-2/fir-age-profile-trials/rejected-lifted-13m-crown.png) evidence is preserved; the current 3,177,252-byte 9 m asset is unchanged. The new bounded cloud cache is authored shader output, not an additional downloaded asset or disk/PWA texture.

### Additional conifer research — not yet evaluated

Further acquisition research identified [Pine tree (Pinus sylvestris), Georgeous/intice184](https://sketchfab.com/3d-models/pine-tree-6c0ca146235e49529828136cd0cee63a) as a **not-yet-evaluated** alternative. Its public Sketchfab model metadata explicitly lists CC BY 4.0, commercial use with author credit, 20,517 reported faces, two materials and four textures. The author describes LOD0/LOD1, a 512x2048 bark set and a 2048px branch atlas containing four clusters. The public preview was inspected, but is not gameplay acceptance; source archive bytes and actual converted geometry are unmeasured. The official download API returned HTTP 401 without authentication. No authenticated download or viewer-data extraction was attempted and no model was integrated.

The same metadata research verified [PlantCatalog Norway spruce (2/43)](https://sketchfab.com/3d-models/realistic-hd-norway-spruce-243-522f917e745a4cfc89ba12e2d7c88d76) as CC BY 4.0, with 76,941 reported faces, ten materials and 24 textures; its description says **juvenile, 5.9 m**, with LODs. It must not be presented as an evaluated mature-tree replacement. Both are research leads, not shipped assets or inferred permission to bypass source-site authentication.

Additional public previews were screened without integrating assets. [TerrainTale Pine Tree](https://terraintale.com/library/realistic-surfaces/pine-tree) is a directly downloadable, 637 KB CC0 conical EZ-Tree model; its preview does not show the mature Scots-pine structure sought here. [Summer Engine Realistic Scots Pine Tree](https://www.summerengine.com/asset-store/realistic-scots-pine-tree-27ad3211) has a public preview with an overtly stylized tiered silhouette, despite the prompt describing realism. Its current page says "Free" rather than specifying reuse terms, while a search index describes CC0; do not assume the conflicting license is resolved. Neither candidate was downloaded or tested in-game.

Additional public leads screened without in-game integration: [vinish.dev's separate Pine Tree](https://vinish.dev/free-3d-models/trees) is offered under CC BY 4.0, but its conical preview looks spruce-like rather than like the target mature Scots pine. [Pixel Fantasy Scots pine](https://www.freegameassets.com/pixel-fantasy-3d-models/scots-pine) uses pixel-art textures inconsistent with the visual target. A [Scots-pine generator](https://tmhsdigital.github.io/Blender-Developer-Tools/gallery/pine-tree/) is stylized and its repository license is noncommercial/no-derivatives; a [lodgepole generator](https://blendswap.com/blend/34925) requires login and advertises a different species with high face counts. These leads do not establish that the previously identified authenticated asset is indispensable.

[Realistic Tree Pack — Oak, Birch, Pine & Willow](https://sketchfab.com/3d-models/realistic-tree-pack-oak-birch-pine-willow-57b29f264f6b49fa8e15f59d56986d7c) by sattorov-murodjon is another public CC BY 4.0 lead. The page reports 96.5k triangles for its displayed model and describes four separate GLBs; the public thumbnail shows a broadleaf tree, not enough to judge the pine. The official download endpoint returned HTTP 401 without authentication. Archive size, pine geometry and gameplay appearance are unknown; no archive was obtained, access bypassed or model integrated. Attribution would be required if used.

### Additional pine source research — rejected, not bundled

Three original forked-pine prototypes used the already checked [Pine Tree 01](https://polyhaven.com/a/pine_tree_01) CC0 photographs on newly authored geometry. The final scratch shape was 30,930 triangles / 2,150,260 bytes with two materials and six small maps, but its layered/clumped canopy did not pass actual-game review. No prototype generator or GLB replaced the runtime pine.

Two other sources were checked at their original publisher pages and compared in desktop gameplay:

| Source / credit | Publisher's license | Download and conversion | Decision |
|---|---|---|---|
| [Scots Pine v1](https://tevy.dev/models/scots-pine), tevy | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/), stated on asset page | Pinned `https://tevy.dev/models/scots-pine/v1/lod0.glb`, 4,342,348 bytes / 46,910 triangles; SHA-256 `937d65ec30f47b72800e684d9cb1c1b4524bcfbb1bcd65bd4532c1e28dd47f7b`. Existing meshopt/Basis decoders converted geometry/KTX2 offline to an 8,221,904-byte PNG-textured GLB; foliage renamed for existing wind/LOD. No runtime decoder added. | Crown still sparse in gameplay; not bundled. |
| [Scots Pine](https://vinish.dev/free-3d-models/conifers), vinish.dev | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), stated by author on collection page | `https://vinish-models.pages.dev/conifers/scots-pine.glb`, 770,692 bytes / 14,572 triangles; SHA-256 `f9fa5f871a75ee993be46f02d1308d0c43b5906292a085f56a1484020f8fca35`. Only foliage material renamed for the existing runtime hooks; review GLB 770,696 bytes. | Repeated upward blade-like tiers, not accepted; not bundled. |

The [vinish-derived gameplay image](art-review/batch-005d-a3-2/pine-architecture-trials/pine-sources-vinish-pine-canopy.png) credits **"Scots Pine" by vinish.dev**, CC BY 4.0, with material-name adaptation and NewDawn lighting/camera rendering. The source GLBs and conversion scripts remain evaluation scratch. These download hashes identify the retrieved files, not independently supplied publisher checksums. Existing CC0 Shrub 03 was also tried as reduced-density low undergrowth; it remained visually sparse at higher geometry cost and was not integrated.

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

These Poly Haven models and their original 1k texture dependencies were checked against the source API checksums. Their license is [CC0 1.0](https://polyhaven.com/license). Source glTFs and buffers were downloaded to the development session workspace; they are not required at runtime or tracked here. Runtime GLBs are local; all below except the optional mature fir are precached. There is no runtime hotlinking.

| Asset and original node | Credit | Runtime path | Size | Runtime triangles |
|---|---|---|---:|---:|
| [Fir Sapling](https://polyhaven.com/a/fir_sapling), `fir_sapling_a` | Rob Tuytel (photography), Rico Cilliers (model) | `public/assets/environment/trees/fir-sapling.glb` | 4,993,840 bytes | 23,001 |
| [Pine Sapling Small](https://polyhaven.com/a/pine_sapling_small), `pine_sapling_small_a` | Rob Tuytel (photography), Rico Cilliers (model) | `public/assets/environment/trees/pine-sapling.glb` | 5,557,424 bytes | 12,399 |
| [Tree Small 02](https://polyhaven.com/a/tree_small_02), `tree_small_02_LOD0` | Rico Cilliers | `public/assets/environment/trees/tree-small.glb` | 7,876,820 bytes | 35,240 |
| [Jacaranda Tree](https://polyhaven.com/a/jacaranda_tree), selectively used as a broadleaf visual | Rico Cilliers, Rob Tuytel | `public/assets/environment/trees/mature-broadleaf.glb` | 8,582,168 bytes | 32,156 |
| [Pine Tree 01](https://polyhaven.com/a/pine_tree_01), `pine_tree_01_a_LOD0` | Poly Haven | `public/assets/environment/trees/mature-pine.glb` | 14,733,468 bytes | 106,749 |
| Original whorled fir; [Fir Tree 01](https://polyhaven.com/a/fir_tree_01) textures | NewDawn geometry; Rob Tuytel, Rico Cilliers materials | `public/assets/environment/trees/mature-fir.glb` (on demand) | 3,177,252 bytes | 43,452 |
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
node scripts\generate-mature-fir.mjs "$trees\fir_tree_01\textures" public\assets\environment\trees\mature-fir.glb
```

Regenerate the two terrain atlases from the six checked-in source sets with `node scripts\pack-terrain.mjs`.

Batch 005D-A3 retains one in four leaf/needle clusters and enlarges retained clusters; broadleaf uses alpha masking. Mature pine uses 1/16 twig-cluster selection; the mature fir instead uses the authored whorled generator above. Plant conversion preserves source alpha and pads transparent RGB pixels; normalized vertex-color types are retained. The pine sapling uses a five-unit nominal height, experimental mature broadleaf seven and mature pine and fir nine, and the other trees four. Shrub foliage replaces the former fern stand-in, with procedural berries attached to sampled plant vertices. Trees have shared near/mid foliage geometry with hysteresis; ground cover varies its instance count by distance and quality. Geometry and textures are shared per world; fallbacks remain on load failure and for unsupported climates. Six tree prototypes do not represent a complete authored species library: spruce still shares the fir sapling and the adult pine uses only one of its three source trunk variants. Forest density, broadleaf crowns, mature pine needles, grass and primitive cacti need further visual work. The original nine mandatory GLBs total 46,175,816 bytes; with the two terrain atlases they add 49,076,502 mandatory offline bytes. The fir adds 3,177,252 optional bytes when fetched. These are package-size sums, not measured transfer/startup or device-memory benchmarks.

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
