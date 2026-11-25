# Asset catalog

Runtime environment geometry is original and procedural. Authored character assets are listed below.

## Nature
- Streamed procedural terrain with original starter region, broad continental forms, and desert and polar/snow colors
- Conifer and broadleaf tree silhouettes with seasonal foliage
- Latitude-selected deciduous and evergreen conifer families, plus sparse low-poly cactus geometry in generated arid regions
- Instanced grass and flowers
- Dodecahedron rocks
- Berry bushes
- Ocean, beach, grass, forest, rock, desert and snow biome colors; no authored rivers or water-travel assets yet
- The World Atlas uses a cached one-degree raster of generated world biomes; current exploration fog and coarse raster resolution are visible limitations

## Characters
- Player, seeded NPC and raider: Quaternius Universal Base Characters Standard, Modular Character Outfits - Fantasy Standard, and Universal Animation Library Standard. The specific archives each include a CC0 1.0 license; their license texts are retained alongside the files in `public/assets/characters/quaternius/`. Source pages: [base characters](https://quaternius.itch.io/universal-base-characters), [fantasy outfits](https://quaternius.itch.io/modular-character-outfits-fantasy), and [animations](https://quaternius.itch.io/universal-animation-library). Models and animations are by Quaternius; the animation page also credits Gonzalo Furnier.
- The bundled exports comprise masculine/feminine superhero base meshes, peasant/ranger outfits, five rigged hair/beard assets and the non-root-motion standard animation library. Texture images were resized to at most 512×512 and broken `_png.png` image references corrected; the base body mesh is filtered to retain the head at runtime. glTF buffers, meshes and clips otherwise come from the standard packs.
- Undead, necromancers, armored fighters, night creatures and champions retain original procedural models. There is no character LOD, specialized authored modern outfit or complete mapping for all appearance options. The premium visual acceptance gate remains open.

## Wildlife
- Procedural deer, rabbit, wolf and bird models with articulated movement
- Eight requested species are not yet implemented

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
