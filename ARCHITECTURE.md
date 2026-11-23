# Architecture

- `src/main.ts` owns the current animation loop, scene orchestration, browser controls, UI and IndexedDB transactions. The loop is variable-step with a capped frame delta, **not fixed-step**; extracting simulation, input and persistence remains important.
- `src/world.ts` creates deterministic bounded terrain and resource props, instanced ground cover, seasonal coloring and environmental motion; it tracks edits and depleted nodes and disposes resources.
- `src/appearance.ts`, `src/characters.ts` and `src/character-preview.ts` define serializable modular appearances, procedural articulated characters and a disposable preview renderer. `src/enemies.ts` defines enemy models, profiles and intent; spawning, attacks and projectile updates remain in `main.ts`.
- `src/wildlife.ts` holds serializable animal state and simulation; `src/animal-assets.ts` creates and animates the corresponding procedural models. Population and simulation remain island-wide rather than chunk-based.
- `src/camera.ts` contains camera-relative movement, angle interpolation and zoom bounds; the camera and input orchestration still live in `main.ts`.
- `src/gameplay.ts` contains inventory costs, crafting, building checks and day/night helpers.
- `src/npc.ts` contains the survivor's basic activity selection and movement helper; scene-level task execution is still in `main.ts`.
- `src/power.ts` computes distance-linked electrical components, wind generation, battery storage and lamp consumption.
- `src/calendar.ts` supplies deterministic season and daily weather selection; `src/effects.ts` renders lightweight particles.
- `src/save.ts` validates version 1–5 save shapes before loading; version 5 permits the expanded appearance options and stores wildlife. Versions 1–4 remain readable. Browser I/O remains in `main.ts`; enemies and projectiles are transient.
- `src/pwa.ts` handles optional installation and user-approved update activation. `vite.config.ts` emits a versioned service worker which precaches a matching shell and hashed assets; saves remain in IndexedDB. Multi-tab coordination is not yet implemented.
- `src/style.css` styles the interface; `public/` contains the PWA shell; `.github/workflows/deploy.yml` deploys the built Pages artifact.

This is not yet a multiplayer-ready simulation boundary, a streamed world, or a full planetary coordinate system. Those require deliberate separation of simulation state from Three.js objects and rendering.
