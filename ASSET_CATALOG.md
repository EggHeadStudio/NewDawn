# Asset catalog

Runtime environment geometry combines locally bundled authored nature assets with original procedural fallbacks. Authored character assets and ground textures are listed below.

## Weekend gameplay — regional fan palm

[Fan Palm](https://vinish.dev/free-3d-models/trees) by vinish.dev is distributed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), including commercial use and adaptation with attribution. The original GLB is **1,001,256 bytes / 20,398 triangles**, SHA-256 `519b2ccb2cdcc823d3531fd7e2a5556315b61a7dc05366794b3d454d15967371`.

The locally bundled `public/assets/environment/trees/vinish-fan-palm.glb` is **477,236 bytes / 6,054 triangles**, SHA-256 `ce23dc98ae6cad130f13ddd2832c4a031d51ec05b7c20be377c6e65228e2fcb2`. `node scripts/optimize-vinish-palm.mjs input.glb output.glb` verifies the original hash and simplifies geometry; a second conversion with the current lockfile reproduced the bundled hash. Six primitives/materials and four 512² maps imply about **5.33 MiB** of mipmapped RGBA8 before driver overhead; actual VRAM, alpha overdraw and shadow-pass GPU time are unmeasured. There are up to six visible mesh draws per instance before shadows. The asset adds **477,236 bytes** and the adjacent **384-byte** attribution to the mandatory offline shell; the Pause menu links the author, source and license.

Existing palm resource IDs receive this visual only after demand loading, with procedural fallback and online retry. Deterministic scaling varies height and new harvest yields; quantities already recorded for felled trees and logs remain authoritative. The fronds use the shared foliage wind and near/mid detail path. This improves the palm itself, not the predominantly primitive tropical broadleaf/acacia forest or the wider visual acceptance.

## Rejected study — acacia

[Acacia Tree](https://vinish.dev/free-3d-models/trees) by vinish.dev is also CC BY 4.0; the original is **532,172 bytes / 7,506 triangles**, SHA-256 `322eec6c76b6e3bf9524383dc5984dbe213c6c13c03ad1a9b79c9017f60f36e7`. A simplified scratch candidate was **330,756 bytes / 2,434 triangles**, SHA-256 `0087f5f454b9a22e57ba438d5b84baa900891dbff2d1d498656c94fd3164e679`. The original acacia together with the original palm more than doubled the sampled scene's triangles; simplifying the acacia made its leaves visibly too sparse. Neither acacia candidate is bundled. See the [original](art-review/weekend-trees/regional-palm/rejected-original-acacia-canopy.png) and [simplified](art-review/weekend-trees/regional-palm/rejected-simplified-acacia-canopy.png) gameplay trials.

## Rejected study — garter snake

[Garter Snake](https://vinish.dev/free-3d-models/snakes) by vinish.dev is CC BY 4.0; the original is **static**, **1,032,168 bytes / 21,618 triangles**, SHA-256 `9d3dea75ba33a8942b4c30501774d1b21f002cf7d59e2cc7d967c983e07d5e98`. A locally modified experimental candidate simplified and batched the geometry and added synthetic idle/slither motion: **557,428 bytes / 5,516 triangles**, two materials, 17 joints, SHA-256 `26d451c5d247cdd8bbd2d44bfa0a069c724a514a7f5f504e6456dd12c7e31afe`. The candidate and its runtime changes were removed because it was barely distinguishable from ground and vegetation at normal gameplay distance, even at 1.4× source scale. It is not part of the offline shell. See `TEST_REPORT.md` for the actual comparison and unresolved terrain-contact concerns.

## Weekend gameplay — animated reindeer

[Reindeer](https://tevy.dev/models/reindeer) v1 LOD1 is distributed by tevy.dev under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/), including commercial use and adaptation. The pinned original GLB is **582,680 bytes**, SHA-256 `81530c28c8328400d00a6a9a870eee2645c040b603d99c10610841af93e37f8c`. The publisher specifies in-place walk and trot clips at 1.2 and 3.2 m/s.

The locally bundled `public/assets/animals/reindeer.glb` is **469,136 bytes / 7,000 triangles**, SHA-256 `052e22f6c58b1211a87505c13ec84dacd07ac49a8e9e3c8f45b659aa569b15fb`. It has one skinned mesh/material, 29 joints and three JPEG maps at 512², 512² and 256². `node scripts/convert-wildlife.mjs reindeer input.glb output.glb` verifies the original hash, decodes Meshopt/KTX2 offline with locked dependencies and resizes maps to at most 512 pixels; a second conversion reproduced the bundled hash. The existing reindeer uses idle, graze and speed-scaled walk/trot without changing its saved identity or behavior; a procedural fallback remains available. Only one adult appearance is represented, with no juvenile, seasonal antler change or runtime distance LOD. It adds one main-pass draw per visible reindeer plus shadows; the maps imply approximately **3 MiB** mipmapped RGBA8 before driver overhead and skeletal resources. Actual VRAM and GPU time are unmeasured; the GLB adds **469,136 bytes** to the mandatory offline shell.

## Weekend gameplay — animated grizzly bear

[Grizzly Bear](https://vinish.dev/free-3d-models/bears) by vinish.dev is distributed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), including commercial use and adaptation with credit. The public original GLB is **2,622,632 bytes / 64,611 triangles**, SHA-256 `8dd80eabb177228760d63f8abf0f2b71064d0fa252e980f3dbeb37f339663538`; its embedded `asset.copyright` also identifies the author and license.

The locally bundled `public/assets/animals/grizzly-bear.glb` is **847,884 bytes / 11,748 triangles**, SHA-256 `d2f099d2714266d5c62b884c8a1224c3b67bea258fa49eb3d329ab9539a64fce`. It has six primitives/materials, 29 joints and five JPEG maps: two 512² and three 256². `node scripts/optimize-vinish-animal.mjs input.glb output.glb` verifies the original hash, simplifies geometry to approximately 18% and lowercases clip names; a second conversion with the current lockfile reproduced the bundled hash. The existing bear uses idle and speed-scaled walk/trot while keeping its simulation and saved identity; the procedural fallback remains available. The file adds **847,884 bytes** to the mandatory offline shell and six visible main-pass draws per bear before shadow passes. Maps imply approximately **3.67 MiB** of mipmapped RGBA8 before driver overhead and skeletal resources; actual VRAM and GPU time are unmeasured. There is no attack animation or distance LOD. The adjacent offline license and Pause menu identify the author, source, license and modifications.

## Weekend gameplay — animated moose

[Bull Moose](https://tevy.dev/models/moose) v1 LOD1 is distributed by tevy.dev under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/), including commercial use and adaptation. The pinned original GLB is **560,684 bytes**, SHA-256 `42540823dc064c98fc58f7d7a7166aa494d175b892b3716bfb06f24fa05a449d`. The publisher specifies in-place walk and trot clips at 1.5 and 4 m/s.

The locally bundled `public/assets/animals/moose.glb` is **431,580 bytes / 7,000 triangles**, SHA-256 `f25acd0fb886e7c034ade5082419e0294bddd1df91baebe6cf25868dd41e5fb7`. It has one skinned mesh/material, 29 joints and three JPEG maps at 512², 512² and 256². `node scripts/convert-wildlife.mjs moose input.glb output.glb` verifies the original hash, decodes Meshopt/KTX2 offline with locked dependencies and resizes maps to at most 512 pixels; a second conversion reproduced the bundled hash. The existing moose uses idle, graze and speed-scaled walk/trot without changing saved identity or behavior; a procedural fallback remains available. Only an adult bull is represented, with no cow, calf, seasonal antler change or distance LOD. It adds one main-pass draw per visible moose plus shadows; the maps imply approximately **3 MiB** mipmapped RGBA8 before driver overhead and skeletal resources. Actual VRAM and GPU time are unmeasured; the GLB adds **431,580 bytes** to the mandatory offline shell.

## Weekend gameplay — animated roe deer

[Roe Deer](https://tevy.dev/models/roe-deer) v1 LOD1 is distributed by tevy.dev under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/), including commercial use and adaptation. The pinned original GLB is **465,916 bytes**, SHA-256 `2761025c7be21b96af5b21493c3f8765c8219938c5ba50a7cff7cf65daecdce4`. The publisher specifies in-place walk and trot clips at 1.2 and 3 m/s.

The locally bundled `public/assets/animals/roe-deer.glb` is **359,112 bytes / 4,500 triangles**, SHA-256 `c6665034f1c6c11ca664b8783b7ed9d1454bd5443b9de2683da6c0484a8f02eb`. It contains one skinned mesh/material, 29 joints and three JPEG maps at 512², 512² and 256². `node scripts/convert-wildlife.mjs deer input.glb output.glb` verifies the original hash, decodes Meshopt/KTX2 offline with locked dependencies and resizes maps to at most 512 pixels; a second conversion reproduced the bundled hash. The existing deer uses idle, graze and speed-scaled walk/trot without changing saved identity or behavior; a procedural fallback remains available. The only authored variation is a summer-coated buck, with no female, juvenile, seasonal coat or distance LOD. It adds one main-pass draw per visible deer plus shadows; the maps imply approximately **3 MiB** mipmapped RGBA8 before driver overhead and skeletal resources. Actual VRAM and GPU time are unmeasured; the GLB adds **359,112 bytes** to the mandatory offline shell.

## Weekend gameplay — animated red fox

[Red Fox](https://tevy.dev/models/red-fox) v1 LOD1 is distributed by tevy.dev under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/), including commercial use and adaptation. The original GLB is **550,600 bytes**, SHA-256 `901920897cc62ba153ffd0ba705d26f0ee0d6bca1d6f50ad7888ac8196ce5ccb`. The publisher specifies in-place walk and trot clips at 1 and 2.5 m/s.

The locally bundled `public/assets/animals/red-fox.glb` is **404,492 bytes / 4,500 triangles**, SHA-256 `84646e0027cb0b82f1d0073260d900c0dabbc9cc2635f71f2ae505186f8a4fca`. It has one skinned mesh/material, 32 joints and three JPEG maps at 512², 512² and 256². `node scripts/convert-wildlife.mjs fox input.glb output.glb` verifies the original hash, decodes Meshopt/KTX2 offline with locked dependencies and resizes maps to at most 512 pixels; a second conversion reproduced the bundled hash. The existing fox uses idle and speed-scaled walk/trot, retaining behavior, identity and the procedural load-failure fallback. It has no attack animation or distance LOD. It adds one main-pass draw per visible fox, plus shadows; the maps imply approximately **3 MiB** mipmapped RGBA8 before driver overhead and skeletal resources. Actual VRAM and GPU time are unmeasured; the GLB adds **404,492 bytes** to the mandatory offline shell.

## Rejected modern jacket retarget study

[Dog Walker](https://tevy.dev/models/dog-walker) v1 LOD1 is distributed by tevy.dev under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). It was evaluated only in scratch files and is not included in the game. A weighted bind-pose transfer from its 56-bone A-pose full-body mesh to the existing Quaternius T-pose rig tore the waist and legs and introduced neck/hand clipping. See the [baseline preview](art-review/weekend-character/jacket-retarget-before-preview.png), [rejected preview](art-review/weekend-character/jacket-retarget-rejected-preview.png) and [gameplay trial](art-review/weekend-character/jacket-retarget-rejected-game.png). Modern clothing remains unfinished.

## Weekend gameplay — mature silver birch

[Silver Birch](https://tevy.dev/models/silver-birch) v1 LOD1 is distributed by tevy.dev under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/), including commercial use and adaptation. The original GLB is **1,303,800 bytes / 11,108 triangles**, SHA-256 `ba9ccd03ba2d0ad21f82eb6fd9934712822946b6c869069a17f3d5580b7ddedc`; the publisher describes a mature silver birch with a white, dark-based trunk and drooping twigs.

The locally bundled `public/assets/environment/trees/mature-birch.glb` is **896,204 bytes / 11,108 triangles**, SHA-256 `040fb446ae77c4e82475cab2b91eb31e86463d636322d5f814c5a8872712cd8b`. `node scripts/convert-wildlife.mjs birch input.glb output.glb` checks the source hash, decodes Meshopt/KTX2 offline with locked dependencies, resizes maps to at most 512 pixels, renames the woody twig material so it is not treated as leaves, and removes unused wind attributes. A second conversion reproduced the bundled hash. Four primitives use two 256×512 and two 512×512 maps, implying approximately **4 MiB** mipmapped RGBA8 before overhead; actual VRAM, alpha overdraw and shadow-pass GPU time are unmeasured. There are four visible mesh draws per instance before shadow passes. The asset adds **896,204 bytes** to the mandatory offline shell.

A deterministic 32% of birch resource nodes use this visual at nominal height seven; the rest still use the generic broadleaf. New mature-birch felling yields more wood, while already saved fallen/log totals and remaining quantities are retained. The white trunk and denser crown improve local variation but parts of the foliage remain dark or obstructed in sampled views; this is not complete birch or mature-forest acceptance.

## Weekend gameplay — animated gray wolf

[Gray Wolf](https://vinish.dev/free-3d-models/wolves-and-foxes) by vinish.dev is distributed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), including commercial use and adaptation with credit. The original GLB is **4,229,060 bytes / 91,359 triangles**, SHA-256 `cd9f5d6d49dd736cc4b4557321e2b529dfcd041068a70c63b22432b2c7127d14`; the publisher gives a **0.35 × 1.61 × 1.07 m** extent.

The locally bundled `public/assets/animals/gray-wolf.glb` is **1,427,860 bytes / 16,515 triangles**, SHA-256 `f516979e3460fab671e7d74c25bd6526c4e65f06dc5a7efa751616ea306c350e`. It contains seven primitives/materials, 31 joints and seven JPEG maps: two 512², three 256² and two 128². `node scripts/optimize-vinish-animal.mjs input.glb output.glb` verifies the source hash, simplifies geometry and lowercases clip names; a second conversion with the current lockfile reproduced the bundled hash. The existing wolf uses idle and speed-scaled walk/trot without altering simulation or saved identity; runtime gait speeds are approximations. The model has no distance LOD and adds seven visible mesh draws per wolf before shadow passes. Its maps imply about **3.83 MiB** of mipmapped RGBA8 before overhead; skeletal textures, actual VRAM, GPU cost and moving packs remain incompletely measured. An adjacent offline attribution identifies author, source, license and modifications; the Pause menu links to it.

## Weekend gameplay — animated red squirrel

[Red Squirrel](https://vinish.dev/free-3d-models/rabbits-mice-and-squirrels) by vinish.dev is distributed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), including commercial use and adaptation with credit. The original GLB is **2,724,080 bytes / 55,168 triangles**, SHA-256 `2e5b0ed56d93d700d17dc080693bd148d5019baac1d723a346a3fad2c0f8a99c`. The publisher gives a **0.10 × 0.23 × 0.23 m** extent.

The locally bundled `public/assets/animals/red-squirrel.glb` is **1,012,116 bytes / 9,942 triangles**, SHA-256 `7b74cb9cfa66d04d63009133c356c2b1b9d22d5644a09e887fb549852e92fda6`. It has six primitives/materials, 32 joints and five JPEG maps: two 512² and three 256². `node scripts/optimize-vinish-animal.mjs input.glb output.glb` checks the source hash, simplifies geometry and lowercases clip names; a second conversion with the current lockfile reproduced the bundled hash. The existing squirrel uses idle/sniff/walk/run without altering simulation or saved identity; runtime speeds are approximations, not publisher-specified gait rates. The five maps imply about **3.67 MiB** of mipmapped RGBA8 storage before overhead; skeletal textures, actual VRAM, GPU cost and moving groups remain unmeasured. An adjacent offline attribution identifies author, source, license and modifications; the Pause menu links to it.

## Weekend gameplay — animated hooded crow

[Hooded Crow](https://tevy.dev/models/hooded-crow) v1 LOD1 is distributed by tevy.dev under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). The original file is **226,344 bytes / 3,200 triangles**, SHA-256 `8f7d6213f923e5a3e6328c2ee5d2b3c367b9a60dc694d97162dd2ac31feb7a36`. Its idle, peck and fly clips animate in place.

The locally bundled `public/assets/animals/hooded-crow.glb` is **229,980 bytes / 3,200 triangles**, SHA-256 `1239b66c8b16affe8b2936576ce28a2069b04983fe95e736a95639f160e3b650`. It has one skinned mesh/material, 21 joints and JPEG maps at 512², 256² and 128². `node scripts/convert-wildlife.mjs crow input.glb output.glb` verifies the original hash, decodes Meshopt/KTX2 offline with existing dependencies and converts maps to JPEG; a second conversion with the current lockfile reproduced the bundled hash. The existing `bird` species uses the visual without changing saved identity or behavior. The three maps imply approximately **1.75 MiB** of mipmapped RGBA8 storage before driver overhead, plus skeletal resources; actual VRAM and GPU time are unmeasured.

## Weekend gameplay — animated dairy cow

[Dairy Cow](https://tevy.dev/models/dairy-cow) v2 LOD1 is distributed by tevy.dev under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). The original file is **712,912 bytes / 7,000 triangles**, SHA-256 `4dd5e3d6770f7c262fbe775a8c0a9e83112d9978d2349f82938fba1de58dc8db`. Its idle, graze, walk and trot clips play in place; the publisher specifies 1.1 m/s walking and 2.6 m/s trotting.

The locally bundled `public/assets/animals/dairy-cow.glb` is **519,852 bytes / 7,000 triangles**, SHA-256 `ed5895965b60f828512abb7cf1a467ef11f10ae403f7d74ae1acd2a984b02d26`. It contains one skinned mesh/material, 29 joints and three JPEG maps at 512², 512² and 256². `scripts/convert-wildlife.mjs cow input.glb output.glb` verifies the original hash, decodes Meshopt/KTX2 offline with existing dependencies and resizes maps to at most 512 pixels; a second conversion with the current lockfile reproduced the bundled hash. The existing `cow` gameplay species uses this visual without a save-format change. The maps imply approximately **3 MiB** of mipmapped RGBA8 storage before driver overhead, plus skeletal resources; actual VRAM and GPU time are unmeasured.

## Weekend gameplay — animated mountain hare

[Mountain Hare](https://tevy.dev/models/mountain-hare) v1 LOD0 is distributed by tevy.dev under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). The original file is **557,036 bytes / 7,000 triangles**, SHA-256 `acf4fda3777b4b7a7eb95c36e74f2d6e3e8ca5b38d30e549a6fc1fd06fff87bb`. It represents a brown summer coat and has idle and in-place hop clips; the publisher specifies a 4 m/s reference speed for hopping.

The locally bundled `public/assets/animals/mountain-hare.glb` is **407,300 bytes / 7,000 triangles**, SHA-256 `88a002d89cc2ba3d6af34754ca2852f43e528136f682163e1b0e9296b579529f`. It contains one skinned mesh/material, 29 joints and three JPEG maps at 512², 512² and 256². `scripts/convert-wildlife.mjs hare input.glb output.glb` verifies the original hash, decodes Meshopt/KTX2 offline with existing dependencies and resizes maps to at most 512 pixels; with the current lockfile it reproduces the bundled hash. The existing `rabbit` gameplay species uses this hare visual without a save-format change. The maps imply approximately **3 MiB** of mipmapped RGBA8 storage before driver overhead, plus skeletal resources; actual VRAM and GPU time are unmeasured.

## Weekend gameplay — animated sheep

[Sheep](https://tevy.dev/models/sheep) v1 LOD1 is distributed by tevy.dev under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). The original file is **674,252 bytes / 6,000 triangles**, SHA-256 `66176a23355581ed0e18366d6ccf53f33d1aa30c2362bb841cbac0ff295305a4`. Its authored idle, graze, walk and trot clips play in place; the publisher specifies 1.0 m/s walking and 2.5 m/s trotting.

The locally bundled `public/assets/animals/sheep.glb` is **533,520 bytes / 6,000 triangles**, SHA-256 `728b3439bfb5935f2b09bf024f1877fceae449e1e64f390bbc4f2f5d5746d480`. It contains one skinned mesh/material, 29 joints and three JPEG maps at 512², 512² and 256². `scripts/convert-wildlife.mjs sheep input.glb output.glb` verifies the original hash, decodes Meshopt/KTX2 offline with existing dependencies and resizes maps to at most 512 pixels; with the current lockfile it reproduces the bundled hash. Runtime does not fetch external assets or require these decoders. The maps imply approximately **3 MiB** of mipmapped RGBA8 storage before driver overhead, plus skeletal resources; actual VRAM and GPU time are unmeasured.

## Weekend gameplay — survivor backpack

[Hiking Backpack](https://mint.gg/free-3d-models/hiking-backpack) by Mint is explicitly distributed under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/), including commercial use, adaptation and redistribution. The original static GLB is **2,020,908 bytes / 19,732 triangles**, SHA-256 `3818afef88e666b6ab0bf147b05748dba91fe45bac7c69ac93213beead84c87e`. The credited source describes a 1.09 × 1.9 × 1.3 m file extent and says no attribution is required.

The local `public/assets/characters/equipment/hiking-backpack.glb` is **550,492 bytes / 7,000 triangles**, one mesh/material with three 512² JPEG maps, SHA-256 `4b08475f41942d02338a3c0e4e14fe9d2f2d8a1556499c18702278626a28aae2`. `scripts/optimize-backpack.mjs` verifies the original hash, reduces geometry, downsizes maps and selectively changes the orange cloth to a muted khaki; running it with the original input and destination reproduces the checked hash with the current lockfile. Runtime scales and attaches it to the player's animated torso, and the offline shell includes it. Estimated mipmapped RGBA8 map storage is **4 MiB**, excluding driver overhead; the main pass adds one visible mesh draw and 7,000 triangles, while shadow cost is separate. The player can toggle this starter cosmetic on or off; it does not change capacity, and the fallback character has no backpack. See the test report for gameplay and device limitations.

## Weekend gameplay — wooden construction

The locally bundled `public/assets/environment/construction/weathered-wood-color.jpg` and `weathered-wood-normal.jpg` are adapted from [Weathered Plank Siding](https://polyhaven.com/a/weathered_plank_siding) by Dimitrios Savva, distributed by Poly Haven under [CC0](https://polyhaven.com/license). They are 512×512 JPEGs, **90,937 bytes combined**, and are included in the mandatory offline shell. Walls, floors, doors and roofs share these maps; structural trim is original procedural geometry.

The official 1k diffuse and OpenGL normal source files matched MD5 `90f818fd61602ac7268ee89857e77396` and `e2db9c3a055a85707eb453ee09624cfb`, respectively. The installed `sharp` resized both to 512×512; the diffuse also used `.linear(1.1, 100)` and JPEG quality 88, while the normal used JPEG quality 88 with 4:4:4 chroma. Packaged SHA-256 values are `ff2c25ac8eb6c8926b97e7812b45625d184b4e0f56eba849430962eb60b8b6b6` (color) and `b6a24c016efdbdcf70f4a0f07537aa3515503a8aa89ac6fad4a3ca15dbcfc8e4` (normal). Two mipmapped RGBA8 images are approximately **2.67 MiB** before driver overhead; actual GPU allocation is unmeasured.

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

Placement now selects a deterministic 32% subset of fir-classified resources, increased from 8% after matched forest-composition comparisons; this is not 32% of all trees. Nominal height nine, shared near/mid foliage, wind, resource IDs and the sapling fallback are unchanged. The GLB is fetched on demand and content-versioned/cached after use, not included in the mandatory offline shell. The 64% trial added more geometry without a proportionate improvement in the sampled view and was not retained. Matched desktop crown and normal-gameplay comparisons show fuller, more frequent firs; mixed-forest composition, pine quality, moving-camera and physical-device acceptance remain open. See `TEST_REPORT.md`. Spruce now shares the same 32% mature selection, and half of the remaining spruce/fir resources reuse the same cached prototype as a 0.6-scale young fir (deterministic `treeAgeClass()`; sapling fallback until cached). Tree size also affects newly calculated timber yield.

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
- Twelve species: deer, rabbit, wolf, bird, brown bear, snake, squirrel, reindeer, moose, cow, sheep and fox. Eight use the animated CC0 models above; squirrel, wolf and bear use the credited CC BY models. Snake and all load-failure fallbacks remain procedural. Population streaming, expanded animation and ecology remain incomplete.

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
