# EggHeadStudio: New Dawn

A work-in-progress 3D survival and settlement game. The current playable world is a **bounded island**, not yet a streamed or wrapping planet. See [development status](DEVELOPMENT_STATUS.md) for the full audit and remaining work.

## Local development

```powershell
npm.cmd ci
npm.cmd run dev
```

Open the URL printed by Vite. Node.js 20.19+ or 22.12+ is required. On systems where `npm` works directly, `npm` can replace `npm.cmd`.

### Play

- **Walk:** WASD or arrows; hold Shift to run. Movement is camera-relative.
- **Camera:** right-drag to rotate and mouse wheel to zoom. The pause menu provides auto-follow, distance, rotation-speed and smoothing controls. Auto-follow resumes after manual rotation.
- **Gather or fight:** Space near trees, rocks, berries, or enemies. Open **Pack** to craft an axe and pickaxe, which increase gathering yields.
- **Interact:** E near Mira or the rover; elsewhere, E digs. Recruit Mira, build storage, then assign wood or stone gathering.
- **Build:** B or the Build button, choose a structure, move until the ghost is green, then use Space or Place. R or Rotate turns the ghost. Press B or the close button to exit.
- **Rover:** E enters/exits; W/S accelerate or brake/reverse, A/D steer.
- **Power:** place a turbine within four units of a generator; connect generator, battery, cable posts, and lamps by placing neighboring devices within four units. Gold lines indicate connections. Wind varies, lamps consume power, and batteries store surplus.
- **Touch:** left joystick moves; right-side drag rotates the camera, pinch zooms, and A/B are contextual. Use the Build and Pack buttons for menus. In the rover, hold A to accelerate, B to brake/reverse, and Exit to leave.
- Pause to save. Saves are stored in the browser's IndexedDB; Continue restores the last save. Autosave runs approximately once per minute.

## Validation

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run preview
```

## GitHub Pages

Vite uses the production base path `/NewDawn/`. The included `.github/workflows/deploy.yml` installs dependencies, builds the game, and deploys `dist` on every push to `main`.

In repository Settings > Pages, choose **GitHub Actions** as the source. The workflow runs on pushes to `main`; no push or external deployment is performed automatically by local development.
