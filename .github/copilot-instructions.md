# Copilot instructions

## Authoritative project references

Before implementation, read `ARCHITECTURE.md`, `MASTER_ROADMAP.md`, `IMPLEMENTATION_TRACKER.md`, `DEVELOPMENT_STATUS.md`, and the latest evidence in `TEST_REPORT.md`. Treat these as the authority for architecture, long-term requirements, current milestone, dependencies, known gaps, and completed verification. Inspect relevant source and tests; documentation claims alone do not prove a feature works.

## Autonomous development protocol

1. Continue only the current approved milestone identified by the roadmap and development status. Use the tracker to select its highest-priority unfinished feature whose dependencies are satisfied.
2. Resolve prerequisites and scope before editing. Implement one coherent, playable vertical slice rather than a checklist of placeholders.
3. Keep the game runnable and preserve existing behavior and saves. Add or update focused tests for behavior changed.
4. Run relevant targeted unit and browser tests during implementation. Inspect actual gameplay/UI and capture screenshots when visual behavior is material.
5. Fix regressions, then update the tracker, development status, and test report with the actual change, remaining limitations, and tests really executed.
6. Continue to the next incomplete checkpoint in the same approved milestone without waiting for another prompt. Stop when that milestone's acceptance criteria pass, a genuine blocker needs user input, or safe execution is no longer possible. Do not start an unrelated future milestone without authorization.

## Efficient verification

- Use targeted tests while iterating and run the production build at meaningful checkpoints.
- Avoid rerunning the full Playwright suite after each small change. Run the full regression suite after final changes to a major milestone and before recommending publication.
- Never run competing Playwright suites against the same test environment, and do not modify application source while a full suite is running.
- Never weaken, skip, or remove a valid assertion to manufacture a pass. Diagnose failures and distinguish code defects from demonstrable test instability.
- Verify persistence by reloading. Inspect visual work in the running game at normal gameplay distance. Treat browser emulation as distinct from physical-device testing.
- Record browser validation in `TEST_REPORT.md` only after it has actually run; state the tested browser/viewports and any remaining device limitations.

## Quality and project boundaries

- Preserve TypeScript strictness, the procedural Three.js asset registry, and the offline-first Three.js/Vite architecture unless a justified and tested architectural change is needed.
- Keep gameplay playable after each major change. Implement real gameplay consequences; do not claim placeholders or partially working features as complete.
- Preserve `/NewDawn/` as Vite's production base path and use Vitest for deterministic world and save tests.
- Preserve backward compatibility for existing saves. Keep resource use bounded for streamed worlds and mobile performance.
- Preserve unfinished NewDawn requirements and the agreed long-term vision; do not silently narrow scope.
- Work in the existing repository and branch. Do not clone or create another project directory.
- Do not automatically commit, push, deploy, publish, delete valuable developer data, install paid services, or use paid assets.
