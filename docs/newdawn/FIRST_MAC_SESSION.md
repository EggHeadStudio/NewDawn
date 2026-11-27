# First Mac Copilot App session — copyable launch prompt

**Instructions:** After the user completes the Windows A3.2 commit+push, clones/opens the up-to-date repo on the Mac, runs `npm ci` and confirms the agent files exist, select the **NewDawn Game Director** agent. For the first run, use local `New worktree` and `Plan` so the user can inspect the decision. When approved, switch to Autopilot to implement a bounded, measurable slice.

## Initial prompt (English)

> NEWDAWN — MAC REPOSITORY TAKEOVER & FIRST VERIFIED DEVELOPMENT SLICE
>
> You are the NewDawn Game Director, working in the existing repository. Read `.github/copilot-instructions.md`, `IDEA.md`, `VISUAL_ART_BIBLE.md`, `MASTER_ROADMAP.md`, `IMPLEMENTATION_TRACKER.md`, `DEVELOPMENT_STATUS.md`, `TEST_REPORT.md`, `ARCHITECTURE.md`, `ASSET_CATALOG.md`, and every file under `docs/newdawn/`. Treat Grounded Realism as the current art direction and retain all future requirements, especially realistic 12-species wildlife, corpse decay/insects/flocks, moon/Milky Way and rare aerial phenomena, modern characters, manufacturing, settlements, politics and mobile performance.
>
> First confirm repository identity, branch/worktree, latest Windows A3.2 commit, installed Node/npm, local runtime assets and the actual implementation state. Do not assume source is correct merely because documents report 170 unit and 92 Edge passes. Audit the 005D-A3.2 visual limitations and 005C-P3 terrain-frame/LOD blocker. Identify any stale contradictory tracker lines; update them from source and evidence without inventing success.
>
> Propose the smallest **currently approved** high-value user-visible checkpoint for the 005D-A3 forest/graphics milestone (prefer mature pine/forest canopy, camera sightline and measured quality, unless the engine dependency truly blocks it). Specify affected files, acceptance criteria, targeted tests and performance checks. If this session is in Plan mode, STOP for my approval before edits. If already approved in Autopilot, implement and iterate through that coherent checkpoint; use specialist subagents only if genuinely available, with non-overlapping file ownership and no false claims of delegation. Capture actual normal gameplay and mobile-emulated screenshots, run targeted tests and update status/tracker/evidence. Do not start an unrelated major milestone.
>
> Do not commit, push, merge, deploy, publish, install paid assets, alter Cloudflare/Firebase/GitHub settings, delete developer saves or expose credentials. Preserve GitHub Pages `/NewDawn/`, v12 save compatibility and the joystick + four-way mobile action pad. Final report: exact source changes, tests actually executed, normal gameplay visual assessment, measured vs estimated performance, uncompleted goals, next checkpoint and no external publication.

## After the first plan is approved

Tell the agent to execute the **approved** checkpoint in **Autopilot** (or use `/autopilot` as supported by your version). Do not convert the initial audit into an open-ended permission to change every future major milestone or publish. The user's handoff package covers the overall game vision, but milestone escalation remains user-controlled.

## Optional specialist tasks to run in separate worktrees later

- Visual Director: mature-tree source optimization and matched before/after scene evidence without touching planet-coordinate modules.
- Engine Developer: profiling/prioritized tangent-frame integration design and targeted pure geography tests without modifying active `main.ts` while visual work is underway.
- Creatures & Ecology: licensed animated animal asset evaluation and actual species rig/LOD acceptance plan, without prematurely integrating into the currently approved A3 milestone.
- QA & Release: test screenshot provenance, actual save/update smoke tests, device test matrix and verification of asset package budgets.

Parallel planning/evaluation is safe; concurrent edits to common world orchestration files require explicit integration scheduling.
