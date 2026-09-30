# Follow-ups

Open-deferred items that no current spec, plan or PR owns. One line each:
what, where, why it was not done, who decides. Remove a line when it is done
or filed as an issue.

| # | Item | Where | Why deferred | Source |
|---|---|---|---|---|
| 1 | `conventions` reads `CONFIG_SAMPLE_PATHS` through `GitClient.readFile` (working tree) with no symlink / `..` guard; a repo can commit `.eslintrc.json` as a symlink to a local secret file | `server/src/modules/conventions/service.ts` (`readFile`), `adapters/git/simple-git.ts` | outside the Project Context specs; the catalog/attachments code reads git objects by oid instead | researcher RQ2, 2026-09-30 |
| 2 | `POST /repos/:id/resync` does not check that the repo belongs to the workspace | `server/src/modules/repo-intel/routes.ts` | pre-existing; flagged once by both security reviews, deliberately not fixed in this work | security-reviewer ×2 |
| 3 | `server/test/agents-versions.it.test.ts:227` does not type-check (`test/**` is outside `tsconfig`, so `pnpm typecheck` never sees it) | `server/test/agents-versions.it.test.ts` | pre-existing; found by a temporary tsconfig | implementer W4, 2026-09-30 |
| 4 | The vendored `Modal` sets `role="dialog"` but has no Escape, focus-in, Tab trap or focus return; only the run-drawer prompt dialog got this (`useModalFocus`) | `client/src/vendor/ui/kit/Modal.tsx` and ~7 dialogs | vendored primitive is composed, not patched; needs a decision to promote the local hook | manual verification, 2026-09-30 |
| 5 | `onion-architecture` skill text is out of step with the code: `Tokenizer` now lives in `vendor/shared/adapters.ts`; `enforcement.md` uses rule names that differ from `.dependency-cruiser.cjs` | `.claude/skills/onion-architecture/{ports,migration,enforcement}.md`, `SKILL.md` | `.claude/skills/` was out of the docs scope | architecture-reviewer ×2 |
| 6 | `project-context-run.it.test.ts` (T11) lacks the AC-23, NFR-1 and MCP-route cases the plan lists; none of the four `*.it.test.ts` for Project Context has been run | `server/test/project-context-run.it.test.ts` and the three other files | integration tests need Docker and were left for CI | plan-verifier, 2026-09-30 |
| 7 | AC-28 of the attachments spec cannot see a rename or deletion of an injected document in the PR diff: the diff carries no old path | `server/src/vendor/shared/adapters.ts` (`UnifiedDiff`), `run-executor.ts` | no cheap source for the old path | planner G9 |
| 8 | NFR-6 axe scan, contrast measurement, screen-reader run and mouse drag-and-drop for the Context tabs; a real review run (LLM key) to see the Live log lines and `× N calls` | manual | not runnable in the automation session | manual verification |
| 9 | Two `next dev` servers from `client/` share `client/.next`: `scripts/e2e.sh` (and any manual isolated stack) can break a dev server already running on :3000 with a `ChunkLoadError`; give the isolated server its own dist dir (e.g. a `distDir` read from an env var in `next.config`) or make the script refuse to start while :3000 is up | `scripts/e2e.sh`, `client/next.config.*` | found when the user's dev server broke after the manual verification run | 2026-09-30 |
