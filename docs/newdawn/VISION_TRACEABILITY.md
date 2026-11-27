# NewDawn vision traceability and no-lost-features index

**Rule:** All previously agreed ideas stay somewhere in the durable repository. Use this map to locate their specification, update tracking rows, and ensure later agents do not silently discard scope. A concept is still planned until genuine source/visual/test acceptance demonstrates otherwise.

| Discussion theme | Source of detail | Requirements/owner | Milestone | Reported A3.2 reality |
|---|---|---|---|---|
| Earth-scale planet, poles, seam, transforms | `IDEA.md` §3, `MASTER_ROADMAP.md`, `ARCHITECTURE.md` | PL-01/02/03; Engine | 005C-P3/P4 | Partial projected scene, staged tangent paths disabled; no hierarchical terrain LOD |
| Geography, climate, seasonal regional materials | `IDEA.md` §3, `VISUAL_ART_BIBLE.md` §4/6 | PL-04–07, ENV-01/07–13; Engine/Visual | 005D, 005C, later ecology | Six PBR terrain atlases, partial climates; no rivers/volcanic simulation |
| World Atlas and exploration | `IDEA.md` §3, `MASTER_ROADMAP.md` §1 | PL-08/09/12; Gameplay | 005A+, 007 | Coarse one-degree atlas and saved markers; no true political maps |
| Real tree species, adult forests, wind and foliage | `VISUAL_ART_BIBLE.md` §5, asset catalog | ENV-02/03/04/10; Visual | 005D-A3 | Experimental adult pine and Jacaranda; canopy/density visually unaccepted |
| Ground detail, stones, cacti, wetlands | `VISUAL_ART_BIBLE.md` §4/6 | ENV-01/05/06/07; Visual | 005D | Authored partial; grass/cacti not accepted |
| Real sun/moon/cloud/stars/Milky Way | `VISUAL_ART_BIBLE.md` §10/§16, user discussion | SKY-01/02/03/04/05; Visual | 005D-A4 | Primitive stars/band, moon/cloud/night scenes incomplete |
| Rare UFO/helicopter/aircraft sky encounters | User discussion, `COMPLETE_GAME_VISION.md` | SKY-06; World/Visual | 005D-B+ | Not implemented |
| Migrating birds, V-flocks, distant birds | User discussion, this index, complete vision | SKY-07, WLD-11; Ecology | 005E | Not implemented |
| Flies and scavenger insects in warm areas | User discussion, complete vision | WLD-10; Ecology | 005E | Not implemented |
| Corpse/animal carcass decay to bones/soil | User discussion, complete vision | WLD-09; Ecology | 005E | Not implemented |
| All twelve anatomically real animated animals | `IDEA.md` §5, Art Bible §8 | WLD-01–05; Ecology/Visual | 005E | Only procedural toy models and partial behavior |
| Horses and wild/tame mounts and riding resistance | `IDEA.md` §5 | WLD-06/07/08; Ecology/Gameplay | 006B+ | Not implemented |
| Human faces, modern clothing, backpacks, hand slots | `IDEA.md` §4, Art Bible §7 | CH-01–05; Creatures/Gameplay | 005F | Quaternius fantasy foundation, incomplete |
| Real object grab/carry/throw/pack/backpack | `IDEA.md` §6 | CH-03/04/07/08; Gameplay/Engine | 006A–006B | Basic tool selection and thrown stones only |
| Contact-based combat, impacts, ragdoll | `IDEA.md` §4/6/8 | CH-06/07/11, FX-01/02; Engine/Creatures | 006B | Partial non-rigidbody collisions/projectiles/particles |
| Splinters/dust/stone chips/blood, not cubes | User discussion, Art Bible §11 | FX-01/02; Visual/Gameplay | 005D+ | Basic material particles, visual gate open |
| Modular home, foundation, roofs, rooms, camera | `IDEA.md` §7, Art Bible §9 | BLD-01/02/03/07; Gameplay | 006C | Wood house + limited roof, irregular gable fallback |
| Road design/terrain/paint/materials | `IDEA.md` §7, `MASTER_ROADMAP.md` | BLD-04/05/06/09; Gameplay | 006C | Partial road/paint and stone/sand/glass |
| Wind/solar/batteries and house electricity | `IDEA.md` §7/9 | BLD-08, ECO-02/03; Gameplay | 006C+ | Simple power graph, no building-level wiring |
| Fire spread, extinguishing buckets, explosions | `IDEA.md` §8, Art Bible §11 | FX-03–07; Gameplay/Visual | 006D | Torches and simple particles, no spread/suppression |
| Ruins, modern abandoned homes, alien portals | `IDEA.md` §2, Art Bible §9/16 | ECO-05, SOC-09; World/Gameplay | 005D-B+, 007 | No accepted functional ruin or portal |
| Technology, chemistry, industry, repair | `IDEA.md` §9, `MASTER_ROADMAP.md` | ECO-01–05; Gameplay | 007A | Basic mining/smelter/glass/iron pickaxe |
| Boats, vehicles, trains, aircraft, transport networks | `IDEA.md` §9 | ECO-06/07; Gameplay | 007A+ | Simple rover only |
| Self-developing NPCs, jobs, households and resources | `IDEA.md` §10, `MASTER_ROADMAP.md` §10 | SOC-01–05; Gameplay/World | 007B | Mira simple gathering, no independent settlements |
| Local reputation, elections, kings, diplomacy, war | `IDEA.md` §10, existing tracker S-01–S-16 | SOC-06/07/08; World | 007C+ | Vision documented, systems absent |
| Audio: footsteps/wind/wildlife/alien tension/music | User discussion, `IDEA.md` §11 | AUD-01/02; Visual/Gameplay | ART-6 / future | No audio/music system established |
| Cinematic optional depth-of-field, no blurry mobile HUD | `VISUAL_ART_BIBLE.md` v2.1 | SKY-08/09, PERF-01–03 | 005D-A4+ | DOF not implemented |
| Tutorial guided or free/skippable | User discussion, `DEVELOPMENT_STATUS.md` | CH-09; Gameplay | 005D-A3+, QA | Optional intro present, complete touch journey open |
| Touch joystick and 4-button pad, responsive menus | `IDEA.md` §11, existing tracker | UX-01/02/03/04/05 | cross-cutting | Browser emulation passed; real devices open |
| Offline/PWA/save/safe updates and Pages | `ARCHITECTURE.md`, `README.md` | PWA-01/02 | all stages | A3.2 offline browser save/Continue passes |
| Future multiplayer/cloud authoritative server | `MULTIPLAYER_SETUP.md` if present, `IDEA.md` §12 | MP-01; Engine | future | Not implemented, not needed now |

**Audit instruction:** If a feature has no current status row, append a row with stable ID and dependency. Never remove or silently demote an accepted requirement while optimizing or simplifying a milestone. Superseded *art style* (early stylized-low-poly) is intentionally replaced by Grounded Realism, but underlying mechanics and future ideas stay.
