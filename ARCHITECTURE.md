# Architecture

- `src/main.ts` owns the current animation loop, scene orchestration, browser controls, UI and IndexedDB transactions. The loop is variable-step with a capped frame delta, **not fixed-step**; extracting simulation, input and persistence remains important.
- `src/world.ts` creates the deterministic bounded terrain and resource props, samples interpolated heights, tracks terrain edits and depleted nodes, applies seasonal coloring, and disposes removed resources.
- `src/assets.ts` holds procedural model factories. Assets are not yet instanced or centrally shared.
- `src/camera.ts` contains camera-relative movement, angle interpolation and zoom bounds; the camera and input orchestration still live in `main.ts`.
- `src/gameplay.ts` contains inventory costs, crafting, building checks and day/night helpers.
- `src/npc.ts` contains the survivor's basic activity selection and movement helper; scene-level task execution is still in `main.ts`.
- `src/power.ts` computes distance-linked electrical components, wind generation, battery storage and lamp consumption.
- `src/calendar.ts` supplies deterministic season and daily weather selection; `src/effects.ts` renders lightweight particles.
- `src/save.ts` validates version-1 and version-2 save shapes before loading. Browser I/O remains in `main.ts`.
- `src/style.css` styles the interface; `public/` contains the PWA shell; `.github/workflows/deploy.yml` deploys the built Pages artifact.

This is not yet a multiplayer-ready simulation boundary, a streamed world, or a full planetary coordinate system. Those require deliberate separation of simulation state from Three.js objects and rendering.
