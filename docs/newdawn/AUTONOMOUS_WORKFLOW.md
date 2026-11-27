# NewDawn: safe autonomous Copilot development operating rules

**Objective:** maximize self-directed coding and validation within a **user-approved milestone**, keep all product requirements and existing behavior, and deliver reliable playable slices. Autonomy is execution autonomy, not authority to publish or silently rewrite the game's identity.

## Agent roles and routing

1. **Game Director** (orchestrator): read vision/status/source; choose current approved milestone; divide into independent deliverables; delegate where agent functionality is available; reconcile findings; update roadmap/tracker/status with actual evidence. Never claim to have executed another agent unless a real subagent tool ran.
2. **Engine Developer:** geographic frame integration, rendering transforms, planet terrain LOD/workers, entity physics, movement/collision, performance budgets, save and PWA architecture.
3. **Visual Director:** art library, world PBR/foliage/clouds/sky/water, model optimization, animation and screenshot-based visual acceptance; performance-aware realistic art.
4. **Creatures & Ecology:** animals, rigs/animation, habitats, flocks, insects and carcass ecology, herds and later taming/riding.
5. **Gameplay & Civilization:** crafting, tools/items, construction, economy, NPCs, autonomous settlements, governance, transport, safe fire/weather systems and progression.
6. **QA & Release:** tests, screenshots, run health, reproducibility, save migrations, performance evidence, UI and accessibility checks. Reports exact pass/fail and limits, **never deploys**.

The `.github/agents` definitions are project-local. Separate sessions can run in **different Git worktrees**; shared local code is merged only after tests and user review. If the platform cannot delegate subagents, Game Director should prepare discrete tasks for individual sessions and ask for a planned manual handoff. Do not invent automation tools.

## One autonomous milestone cycle

**Phase 0 – Source of truth**: Read `IDEA.md`, `VISUAL_ART_BIBLE.md`, the roadmap, tracker, architecture, latest development/test reports, all `docs/newdawn` handoff references and relevant source/test files. Produce a 10-line checkpoint stating current real state, known blockers, milestone and proposed slice. Source and executable behavior override stale status. Update contradictory documentation only with evidence.

**Phase 1 – Dependency and worktree map**: For each slice record feature IDs, file ownership, potential merge conflicts, acceptance criteria, test mode and estimated asset/memory risks. Prefer one essential engine integration worktree at a time. Parallelize only independent artwork/research/tests, not two concurrent modifications of `src/main.ts` or `src/world.ts`.

**Phase 2 – Implement**: Make coherent, playable changes. Maintain existing controls, migration paths and runtime fallbacks. Require real models for accepted visuals, real state transitions for accepted gameplay. Do not substitute procedural placeholders while claiming premium art. Add explicit schema migrations when necessary, with backup, import and reload tests.

**Phase 3 – Fast iteration**: Run relevant Vitest files and targeted Playwright scenarios. Keep test server/browser stable; do not modify sources during a full browser suite. Inspect real gameplay screenshots at normal camera distance. Fix the code or actual test setup; never suppress a valid assertion just to pass.

**Phase 4 – Gate**: For major finished milestone, run `npm test`, `npm run build`, and one serial complete Playwright suite on stable final source. Check `/NewDawn/` production preview and offline save/Continue if runtime/asset/PWA behavior changed. Use physical phones for claims about phone acceptance. Record exact runs, timestamps, viewport, browser, quality tier and screenshots. **No automated Git push/merge/deploy.**

**Phase 5 – Trace and report**: Update `IMPLEMENTATION_TRACKER.md`, `DEVELOPMENT_STATUS.md`, `TEST_REPORT.md`, relevant `ARCHITECTURE.md`, `ASSET_CATALOG.md` and art Bible only where needed, with what was really observed. Each task is one of `NOT STARTED`, `IN PROGRESS`, `PARTIALLY IMPLEMENTED`, `IMPLEMENTED — UNVERIFIED`, `VERIFIED`, `BLOCKED`. Visual acceptance is separate from code/test verification.

**Phase 6 – Continue automatically if safe**: Within the same approved milestone select the highest-priority unfinished dependency-satisfied checkpoint. Stop at milestone completion, a genuine blocker, budget/resource limits, destructive permission need or conflicting requirements. At stop produce exact outstanding steps and safe Git review instructions.

## Efficient tests

- Pure math/state edits: targeted Vitest near changed files; medium changes: focused browser journeys and build.
- Visual shader and nature work: normal-player-camera same-seed before/after plus touch sizes; no model-viewer-only proof.
- Architecture/save/planet changes: targeted high-latitude, both poles, longitude seam, resource/collision/terrain rebase, old-save migration, real save/reload tests.
- Final big batch: full Vitest, `npm run build`, full serial Playwright **once** on stable code; ~39-minute A3.2 Edge run is not a necessary repetition for MD-only updates.
- Report each browser result as Edge-emulated, Safari, physical iOS, etc. **Never** label SwiftShader/viewport testing as measured iPhone FPS.
- Do not start two Playwright suites simultaneously or edit source during full regression. Back up `art-review/` evidence when tests overwrite images.

## Git, secrets and external-action controls

- User owns commits, pushes, merges, Pages/Cloudflare/Firebase/account changes, licenses, paid assets and public sharing decisions.
- Agent may use git read-only (status, diff, show, log) and edit code/docs locally, but must not run `git add`, `git commit`, `git push`, `git merge`, force/reset/clean, modify remote/branch protection or start deployment without explicit approval. Creating a disposable worktree/session through the app is fine when user selected it.
- No unreviewed credentials, `.env`, session cookies, personal data or server tokens in repo, logs, screenshots or prompts.
- No giant unwanted original asset buffers, duplicate node_modules, dist output or screenshot flood. Work to stay under GitHub file-size limits and avoid excessive PWA mandatory precache.
- Avoid autonomous connection to external paid integrations. Using verified CC0 source assets is allowed when source and license are documented and the build/offline budget is checked.

## Risk management

- The pre-release project allows deliberate refactors, but **preserve existing save compatibility and make backups for intentional data-breaking changes**. Do not reset data unless user explicitly approves.
- Major world-frame changes must switch rendering, camera, terrain, structure, collision, picking and persistence coherently. Reject a locally 'working' fix that visibly separates player and wall coordinates.
- `main.ts` remains a large orchestration module. Prefer extraction with focused tests to replacing its entire scene stack.
- Don't use cinematic blur to hide unfinished models or claim it is a performance optimization. On mobile, foliage alpha overdraw and triangle counts matter.
- Avoid unsafe real-world instructions; fictional weapons/explosions/chemistry are abstract game systems only.

## Mandatory final report structure

1. `Milestone / revision / branch-worktree`: what exactly was approved and attempted.
2. `Implemented`: precise source files, playable consequences, save impact, asset provenance.
3. `Tested`: exact commands and pass/fail counts, build status, tested browser/device, artifacts.
4. `Visual assessment`: normal gameplay scenes passed or failed with screenshots, reasons.
5. `Performance`: frame metrics/presets/hardware or explicitly not measured.
6. `Limitations`: still partial requirements by IDs and root technical blockers.
7. `Next checkpoint`: smallest concrete meaningful slice, its acceptance target.
8. `Git`: state that no commit/push/deploy was performed, unless user directly approved an exception.
