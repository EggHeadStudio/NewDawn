# Test report — Batch 001B

## Executed

- `npm test`: 21 tests in seven Vitest files passed. These cover camera-relative vectors and angle/zoom helpers, deterministic terrain and dry spawn selection, finite resource restoration and excavation, crafting and costs, placement checks, day/night and seasons/weather, NPC activity selection, save validation, and electrical graph/battery behavior.
- `npm run build`: TypeScript validation and Vite production build passed. Vite reported a chunk-size warning for the main bundle.
- Integrated browser on the local Vite server: created a world, moved with WASD, gathered a resource, checked insufficient-material construction, saved and continued after reload.
- Browser with a test save fixture: placed a shelter and observed the correct resource deduction; crafted an axe and verified it after save/reload; recruited Mira and assigned a gathering job; observed a wood-gathering NPC deliver resources to storage; entered, drove and exited the rover, then observed the saved vehicle position change.
- Browser resized to a portrait mobile viewport: exercised the on-screen joystick using pointer input and opened the build menu with its place/rotate actions.
- Production preview at `/NewDawn/`: opened a new game, moved, gathered wood, and opened the build menu without a page error; checked that the pause button and resource row fit a 390px viewport.

The browser fixture altered the test browser's local save. No external deployment or push was performed.

## Not verified

- Real mobile/touch hardware, multi-touch and pinch gestures, long-running performance, all terrain slopes or camera-obstacle edge cases.
- Complete end-to-end manual power wiring, combat and full-day/season transitions in the browser; the power and calendar logic have unit coverage only.
- Offline installability, every browser, multiplayer, or GitHub Actions deployment.
