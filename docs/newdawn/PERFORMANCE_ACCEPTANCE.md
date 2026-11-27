# NewDawn mobile and desktop performance acceptance

**Purpose:** make believable high-quality rendering accessible to older phones and modern desktops. Numbers below are **goals**, not claims. The 2026-11-26 A3.2 Edge/SwiftShader FPS observation is *not* an iPhone benchmark. Optimize by measurement and visual comparison.

## Target hardware classes

| Class | Goal | Validation (not assumed) |
|---|---|---|
| Mid-range or older phone | Stable ~30 FPS in ordinary survival gameplay on a sensible Low/Medium setting | **Physical device**, Safari/Chrome as applicable; same saved scene, camera route, night/rain/forest and combat; check device heating, UI and battery over sustained use. |
| Current flagship phone (including user's own iPhone) | Good-looking High/Medium profile, stable responsive touch | Physical mobile Safari PWA and browser, orientations, memory pressure, scene traversal, quality controls and offline restart. |
| Suitable laptop/desktop | Around 60 FPS in representative scenes at suitable preset | Actual Mac/Windows Chrome/Safari/Edge where available; do not compare unnormalized hardware as a universal metric. |
| Low-power desktop/tablet | Playable Lower resolution/preset with adequate readable art | Browser + physical tests as available. |

## Measurements to log with every expensive visual change

1. Device model, OS/browser/version, renderer (hardware/software), pixel dimensions, DPR, internal render pixel ratio, Low/Medium/High, shader settings, weather, biome, seed, time, world position and camera.
2. First-load request bytes, shell/asset-cache bytes, startup time until playable, GPU upload pauses and cache warm/cold distinction.
3. 30- or 60-second gameplay capture: average/median FPS, p95/p99 frame time when possible, >50ms spikes and player-relevant input responsiveness.
4. Renderer calls, triangles, geometries, textures, instanced cover counts and active chunk counts. Memory numbers must say if they are estimates or measured.
5. Repeated fixed movement: forward traverse, turn camera through trees, enter/exit water, dawn/night, approach construction, fight, build, stream chunks, return to camp, save/reload.
6. Include **same camera same scene** before/after image comparison and explain visual compromises. No replacing nearby realistic foliage with green cones to improve a triangle count.

## Engineering priorities

- **Topology first:** pooled/instanced ground cover and inexpensive foliage cards, carefully optimized authored meshes, LOD0/LOD1/impostor transitions. The current mature pine ~106,749 triangles prototype may be too costly if many unique meshes are rendered; profile visible instances, not just asset file size.
- **Alpha overdraw:** tree needles, thin leaves and grass can cost more than triangle count suggests; test alpha masking, conservative density, batching, alpha-to-coverage where supported and reasonable shadow casting.
- **Textures:** dimension-aware mips, texture atlases, KTX2/Basis when supported with fallback, share materials, release stale region textures; never allocate all world textures eagerly.
- **Terrain:** finish shared tangent frame before turning on hierarchical LOD; worker generation, background-priority queues, near/mid/far tiles, bounded cache, seam stitching and cheap deterministic mesh invalidation.
- **Resolution:** maintain UI CSS pixel bounds while capping internal render pixel ratio; use player-chosen quality and optional controlled adaptive changes with hysteresis. No continual resolution pumping or switching that breaks targeting.
- **Effects:** use pooled impact particles, instanced distant flocks and flies, spatial/audio LOD, limited dynamic lights. DOF is optional and mostly off on mobile, not a physics/asset optimization.
- **Asset loading/PWA:** as of A3.2 the mandatory environment package was ~49.08MB before character art. Move non-critical regional models toward explicitly managed lazy download/cache with offline fallback. Protect correct SW upgrade and IndexedDB saves; measure first-load after every asset addition.
- **Simulation:** bounded active actors and corpses, chunk-based dormant ecology, limited NPC update cadence, no one rigidbody/AI tick per faraway animal every frame. Real phone CPU and RAM often constrain just as much as GPU.

## A3.2 existing performance evidence (report-derived)

- Emulated 390x844 Edge/SwiftShader Medium 30 seconds: ~42.3 average FPS, 59.5 median, 49.8ms p95, 37 >50ms frame spikes in one reported run; another run differed. This **cannot validate real mobile performance**.
- Renderer triangle counts 1280x720 High ~645,799, Low ~584,183 (9.5% difference). Requires same loaded scene, asset warmup and physical-device confirmation before drawing performance conclusions.
- Full serial Edge browser regression 92/92 pass; functional rather than FPS certification.

## Acceptance decisions

**Green** = measured on stated real hardware, target frame pacing sustained, no control clipping, save/offline/asset startup correct and visual quality accepted. **Yellow** = software-emulated or desktop-only with incomplete physical-device measurement, or material visual deficits. **Red** = repeatable OOM/tab reload, severe input delay, broken offline fallback, unavoidable ghosting/clipping or obvious primitive substitution. A3.2 remains **Yellow / not final art accepted**.
