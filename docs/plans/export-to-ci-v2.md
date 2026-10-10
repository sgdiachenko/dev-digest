# Implementation Plan: Export to CI v2 (H07 runner + run traceability)

Status: approved by user (2026-10-09). Spec: `docs/specs/2026-10-09-export-to-ci-v2.md` (approved, supersedes `2026-10-09-export-to-ci`).

## Goal & scope
- In scope: all AC/EC/NFR of the v2 spec except manual items (AC-110, NFR-2, NFR-7, Q-31), listed under *Manual acceptance*.
- Out of scope: a CI workflow for `agent-runner/` (Q7, handoff); root `AGENTS.md` package list (5 → 6 packages, handoff); e2e flows; aligning the studio prompt (Q-23); running migrations.

## Decisions
- REC1: reuse `GitHubClient.commitFiles` / `openPullRequest` / `findOpenPr`. New CI reads go to a separate port `GitHubCiClient`. No automatic retries (NFR-5, AC-32).
- REC2: every limit is a named constant in one place, `CI_LIMITS` in `eval-ci.ts`, read by server, runner and client.
- REC3: reuse `fflate`. Artifacts: declared-size two-pass unzip. Zip in client: add `fflate`.
- REC4: `runner_build` = sha256 of the shipped `index.js` + `300.index.js` bytes, computed at runtime.
- REC5: runner bundle behind a `RunnerBundleSource` port with an fs adapter; directory from `DEVDIGEST_RUNNER_DIR` (default `<repo>/agent-runner/dist`).
- REC6: bundle generator is pure (`modules/ci/bundle.ts`), unit-tested without DB or GitHub.
- REC7: AC-109 parity test lives in `agent-runner`, compares with `server/src/adapters/git/diff-parser.ts`, shared fixtures.
- Defaults: Q-22h skeleton while loading, error + Retry on failure; Q-30 `runner_bundle_unavailable` → 503; Q-26 2 MB cap; Q-27 fork = head repo id ≠ base repo id, or head repo null; Q-28 compare with current snapshot, no marker without `manifest_sha256`; Q-29 `memory_invalid`; Q-14 skill front matter `source:`, non-manual skills wrapped as untrusted; `github_token_missing` → 400; slug = `slugify(name)`, duplicate skill slug gets `-2`, `-3`; agent slug clash → `409 agent_slug_conflict`; null memory `confidence` written as `0`.
- Migration (Q3): generated only after worktree A (`emdash-multi-agents-review-putg6`) has merged (S1.5 stop rule).
- Runner built manually: `pnpm -C agent-runner build`. Until then preview and install answer `runner_bundle_unavailable`.

## Execution mode
Multi-agent, 4 implementers. W1 first; then W2, W3, W4 in parallel. No test-writer. Total ≤ 5 agents.

## Context
- Contracts, tables, gate and i18n strings exist; nothing connects them (spec *Problem*). H07 runner is commit `a251426`, not yet on this branch.
- `eval-ci.ts` is not mirrored to `mcp-server` (`server/INSIGHTS.md:33`).
- `@testing-library/user-event` not installed: client tests use `fireEvent` (`client/INSIGHTS.md:47`).
- `messages/*` one `../` deeper than `src/lib` (`client/INSIGHTS.md:27`).
- New route folder needs `pnpm exec next typegen` before local typecheck (`client/INSIGHTS.md:49`).
- Vendored `Modal` has no focus trap: reuse `useModalFocus` (`client/INSIGHTS.md:55`).
- Design: JSX only, `docs/designs/eval-pipeline/jsx/screen_agents.jsx:121-160` (CI tab), `screen_cizruns.jsx:18-60` (CI Runs). No PNGs in the repo.

## Named constants (`eval-ci.ts`, mirrored to client)
`CI_LIMITS = { RAW_DIFF_MAX_BYTES: 2*1024*1024, RESULT_ENTRY_MAX_BYTES: 256*1024, WORKFLOW_EDIT_MAX_BYTES: 64*1024, ARTIFACT_ARCHIVE_MAX_BYTES: 1024*1024, RUNS_PER_SYNC: 20, RUNS_PAGE_MAX: 100, MEMORY_ITEMS_MAX: 200, REASON_MAX_CHARS: 500, JOB_TIMEOUT_MIN: 10 }`.
`CI_PATHS` (workflow `.github/workflows/devdigest-review.yml`, branch `devdigest/ci`, runner dir `.devdigest/runner`, `RUNNER_FILES = ['index.js','300.index.js']`, result dir `.devdigest-results`), `CI_ACTION_PINS` (AC-44 SHAs).

## Constraints
- C1: imports point inward. `routes.ts` = Zod + one service call. Services take ports, never `Container`. Only `repository.ts` names Drizzle. Only `container.ts` calls `new` on adapters. `pnpm -C server arch:check`.
- C2: wire fields `snake_case`; Zod const and type share PascalCase; enum values `lower_snake_case`.
- C3: both `eval-ci.ts` copies byte-identical: `./scripts/check-shared-sync.sh`. `adapters.ts` server-only.
- C4: never hand-write or rename a migration; never run `db:migrate`.
- C5: lockfiles change only via `pnpm add`.
- C6: no `run:` line expands PR-controlled data; every action pinned by SHA; permissions exactly `contents: read`, `pull-requests: write`.
- C7: never log or store tokens, artifact redirect URL, artifact contents or the diff.
- C8: a repository maps rows to domain/contract types; rows never cross rings.
- C9: one component per `_components/<Name>/<Name>.tsx` + colocated test; data fetching in hooks; strings from `ci.json`; `fireEvent`.
- C10: status/flags/marker use text or icon, never colour alone; results announced via `aria-live="polite"`.
- C11: do not touch `server/src/modules/reviews/**`, `client/src/app/repos/[repoId]/pulls/**`, `platform.ts`, `observability.ts` (worktree A, NFR-13).
- C12: `safeParse` every untrusted input (event payload, manifest, memory, artifact).

## Work packages
| WP | Steps | Owns | Depends on | Wave |
|---|---|---|---|---|
| W1 contracts + schema + runner import | S1.1–S1.5 | `agent-runner/**` (cherry-pick only), `server/src/vendor/shared/contracts/eval-ci.ts`, `client/src/vendor/shared/contracts/eval-ci.ts`, `server/src/db/schema/ci.ts`, `server/src/db/migrations/**` (S1.5 only) | — | 1 |
| W2 server | S2.1–S2.9 | `server/src/modules/ci/**`, `server/src/modules/index.ts`, `server/src/vendor/shared/adapters.ts`, `server/src/adapters/github/octokit.ts`, `server/src/adapters/runner-bundle/**`, `server/src/adapters/mocks.ts`, `server/src/adapters/index.ts`, `server/src/platform/config.ts`, `server/src/platform/container.ts`, `server/package.json`, `server/pnpm-lock.yaml`, `server/test/ci-*.test.ts` | W1 | 2 |
| W3 agent-runner | S3.1–S3.9 | `agent-runner/**` | W1 | 2 |
| W4 client | S4.1–S4.9 | `client/src/app/agents/[id]/**`, `client/src/app/ci-runs/**`, `client/src/lib/hooks/ci.ts`, `client/src/lib/hooks/ci.test.tsx`, `client/src/lib/hooks/index.ts`, `client/src/vendor/ui/nav.ts`, `client/src/components/app-shell/helpers.ts`, `client/src/components/app-shell/helpers.test.ts`, `client/messages/en/ci.json`, `client/messages/en/shell.json`, `client/package.json`, `client/pnpm-lock.yaml` | W1 | 2 |

Overlap: W2, W3, W4 own disjoint trees. `agent-runner/**` is W1 in wave 1 and W3 in wave 2, never concurrent.

### W1 — contracts + schema + runner import (wave 1)
- S1.1 Cherry-pick `a251426` without the INSIGHTS line: `git cherry-pick -n a251426`, `git restore --staged --worktree server/INSIGHTS.md`, commit. Done when `git show --stat HEAD` lists only `agent-runner/**` and `server/INSIGHTS.md` is unchanged from HEAD~1. (AC-146–148, AC-184)
- S1.2 Constants `CI_LIMITS`, `CI_PATHS`, `CI_ACTION_PINS`, `CiTrigger = z.enum(['opened','synchronize','reopened'])` in server `eval-ci.ts`. Done when exported and file typechecks. (NFR-4, AC-36, 44, 46, 79, 84, 89, 90, 117, 139, 157)
- S1.3 Contract changes per spec *Contracts*: `AgentManifest` (+`agent_version`, required `post_as`, `triggers`); `CiExportInput` (`triggers` min 1, `workflow_contents` nullish ≤ 64 KB, drop `base`); `CiExport` (`installation` nullable, `pr_number`, `pr_reused`); `CiInstallation` (new fields + snapshot); `CiRunStatus` (+`skipped`, `cancelled`); `CiRun` (v2 shape + `differs_from_export`); `CiResultArtifact` (v2; `HEX64 = /^[0-9a-f]{64}$/` on every sha; `reason` ≤ 500; drop `pr_number`, `version`); add `CiSkillEntry`, `CiUnavailableReason`, `CiRefreshResult`. Copy to client vendor. Done when `./scripts/check-shared-sync.sh` and `pnpm -C server typecheck` exit 0 (agent-runner typecheck expected to fail until W3). (AC-38, 131, 145, 151, 169, 177, 178)
- S1.4 Schema source `server/src/db/schema/ci.ts`: `ci_installations` gains `github_repo_id`, `agent_slug`, `agent_version`, `ci_fail_on`, `post_as`, `triggers` jsonb, `workflow_path`, `pr_url`, `pr_number`, `exported_model`, `exported_skills` jsonb, `updated_at`; unique (`agent_id`, `repo`). `ci_runs` gains `repo`, `github_repo_id`, `workflow_run_id` bigint, `run_attempt` int not null default 1, `head_sha`, `head_repo`, `duration_s`, `verdict`, `critical`/`warning`/`suggestion`, `agent_version`, `unavailable_reason`, `model`, `ci_fail_on`, `skills` jsonb, `memory_sha256`, `manifest_sha256`, `runner_build`; unique (`github_repo_id`, `workflow_run_id`, `run_attempt`, `ci_installation_id`); index on `ran_at`. Done when `pnpm -C server typecheck` exits 0. (AC-28, 135, 136, 176, 179; NFR-5, NFR-11)
- S1.5 Migration with stop rule. If worktree A has not merged into `main`: stop after S1.4, do not run `db:generate`, report "migration pending". If merged: merge `main` into the branch, run `pnpm -C server db:generate`, never `db:migrate`. Done when a new auto-named `NNNN_*.sql` and journal entry exist after A's entries, or report "skipped: A not merged". (NFR-11)

### W2 — server (wave 2)
- S2.1 Pure bundle generator (`modules/ci/bundle.ts`, `helpers.ts`, `constants.ts`): manifest YAML (`pnpm -C server add yaml`); skill files with `source:` front matter, agent order, enabled only, `-2` dedupe; `memory.jsonl` (global + repo, newest first, ≤ 200, null confidence → 0); workflow (`pull_request`, union of types, AC-43 permissions, `concurrency: devdigest-${{ github.event.pull_request.number }}` with cancel-in-progress, `timeout-minutes: 10`, pinned checkout / setup-node 24 / upload-artifact, `run: node .devdigest/runner/index.js` with `OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}`, one `if: always()` upload step per installed agent slug, final `if: always()` step failing when any `.devdigest/agents/*.yaml` lacks `.devdigest-results/<slug>/devdigest-result.json`); PR body with trust model. Done when T1 passes. (AC-35, 38–40, 42–51, 103, 117–119, 121, 131, 132, 142, 146, 148, 161, 167, 184)
- S2.2 `RunnerBundleSource` port + fs adapter; `DEVDIGEST_RUNNER_DIR` in `platform/config.ts`; missing file → `AppError(503,'runner_bundle_unavailable')`. Done when T2 passes. (AC-149, 150, 183)
- S2.3 `GitHubCiClient` port in `vendor/shared/adapters.ts`, implemented in `octokit.ts` and `mocks.ts`: `getRepo`, `branchExists`, `readBranchFiles`, `listWorkflowRuns`, `listRunArtifacts`, `downloadArtifact(id, maxBytes)` (follows redirect at once, never returns or logs URL), `findPrByHead`. Errors: 404 → `repo_not_accessible`; 403 workflow → `github_scope_missing`; 429/5xx → 503 `github_unavailable`. No retries. Done when `pnpm -C server typecheck` and `arch:check` exit 0. (AC-30–32, 111–113, 141; NFR-5)
- S2.4 Export service (`modules/ci/service.ts`). `files`: no GitHub call, nothing stored. `open_pr` in order: token check (400 `github_token_missing`); target `gha`; workflow override ≤ 64 KB non-empty (else 422); agent provider `openrouter`; branch without PR → 409; slug conflict → 409; unchanged files → skip commit (tree SHA compare, REC2); `commitFiles` + `openPullRequest`/`findOpenPr`; upsert installation with snapshot (skill sha256 over generated bytes). After the branch exists, errors name `devdigest/ci` and record nothing. Commit only regenerated paths. Done when T3 passes. (AC-19, 23–37, 122, 125, 129, 130, 179; NFR-3, NFR-9)
- S2.5 Repository (`modules/ci/repository.ts`): installations CRUD + upsert; runs upsert on unique key; delete `running` row; list runs ≤ 100 newest first; latest run per installation; join agent name (null if deleted). Done when `server/test/ci-repository.it.test.ts` is written (run only after S1.5). (AC-79, 99, 100, 135; NFR-5)
- S2.6 Sync service (`modules/ci/sync-service.ts`), per installation: read ≤ 20 runs; filter on path, repo id, 40-hex sha; skip runs awaiting approval (`waiting`/`action_required`, inference, Q-20); status per AC-86; PR from run PR list, else `findPrByHead`, else null; per-agent artifact `devdigest-result-<slug>`: missing → `artifact_missing`; expired/410 → `artifact_expired`; > 1 MB → `artifact_too_large` (not downloaded); unzip only `devdigest-result.json`, declared size ≤ 256 KB else `artifact_too_large`; JSON + schema + trace shape, else `artifact_invalid` (numbers and trace null); keep stored numbers when artifact unavailable; attempt defaults to 1; other agents' artifacts only → store nothing, drop `running` row; `differs_from_export` vs current snapshot, false when `manifest_sha256` null; per-installation error codes, others continue. Done when T4 passes. (AC-84–98, 111, 113, 114, 116, 123, 124, 135–141, 176–178, 180–182; NFR-9)
- S2.7 Routes (`modules/ci/routes.ts`), registered in `modules/index.ts`: `POST /agents/:id/export-ci`; `GET /agents/:id/ci-installations` (computes `outdated`, `pending_update`, `latest_run`); `GET /ci-runs?limit=`; `POST /ci-runs/refresh`; one log line per install and refresh with NFR-9 fields. Done when T5 passes. (AC-37, 75, 76, 82, 177; NFR-9)
- S2.8 Container wiring in `platform/container.ts`. Done when `pnpm -C server arch:check` exits 0. (C1)
- S2.9 Boundary: `pnpm -C server exec vitest run --exclude '**/*.it.test.ts'` passes; no edits under `server/test/` except new `ci-*` files. (NFR-13, EC-51)

### W3 — agent-runner (wave 2)
- S3.1 Manifests: read every `.devdigest/agents/*.yaml`, hash bytes, `safeParse` with `AgentManifest`; missing/invalid `post_as` → `manifest_invalid`; `post_as` from manifest only; remove `DEVDIGEST_POST_AS`. Done when T6 passes. (AC-52, 53, 118, 151, 152, 173)
- S3.2 Pre-review gates per agent, in spec CI-run order: fork (repo ids or null head, Q-27); trigger not selected; missing key; skill file missing (strip front matter, sha256 bytes); memory missing/invalid (one `MemoryItem` per line, sha256). None makes an LLM call or post. Done when T6 passes. (AC-54, 55, 120, 143, 144, 158, 159, 162, 163, 168, 171, 172)
- S3.3 Diff: fetch failure, non-2xx, or > `RAW_DIFF_MAX_BYTES` → `diff_unavailable`, exit 1; strip `.devdigest/**` and `.github/workflows/**`; zero files → `no_findings`, `empty_diff`, exit 0, no post. Done when T6 passes. (AC-56, 106–108, 153–157)
- S3.4 Review call: title/body/branch names only inside `wrapUntrusted`, no `Review PR #N: <title>` trusted task line; non-manual skills wrapped untrusted; memory passed; grounding gate before counting. Done when T7 passes (captured prompt has title absent from trusted lines; LLM stub called once). (AC-56, 66, 67, 133, 166; NFR-3)
- S3.5 Post and exit: review event per gate; on 422 retry once body-only, no `post_failed`; else `post_failed`; `pr_comment` and `none` modes; exit from gate; under `never` exit 0 after completed review; any failure exits 1. Done when T7 passes. (AC-57–62, 104, 105, 164, 165)
- S3.6 Artifact: write `.devdigest-results/<slug>/devdigest-result.json` on every path; v2 fields only; `model` from manifest; `runner_build` = sha256 of shipped files (REC4); `reason` truncated to 500; redact `OPENROUTER_API_KEY` and `GITHUB_TOKEN` everywhere. Done when T8 passes. (AC-63, 65, 145, 169, 170, 175)
- S3.7 Isolation and logging: loop all agents; process exit = max over agents; log only NFR-10 fields. Done when T8 passes (agent A fails, B posts, exit 1). (AC-121, 142, 160; NFR-10)
- S3.8 Diff parity: fixtures in `agent-runner/test/fixtures/diffs/*.diff`; test compares `src/diff.ts` with `../server/src/adapters/git/diff-parser.ts` (import in test only). Done when T9 passes. (AC-109)
- S3.9 Build and run check: `pnpm -C agent-runner build`; `dist/` contains `index.js` and `300.index.js` (stop rule below); copy both into empty temp dir with no `package.json`, run `node .devdigest/runner/index.js` on Node 24, expect controlled `failed` result, not a module error; rebuild after a source change and `runner_build` differs. (AC-147, 174, 184)

### W4 — client (wave 2)
- S4.1 Hooks in `lib/hooks/ci.ts` (+ one line in `index.ts`): `useCiInstallations`, `useExportCi` (files / open_pr), `useCiRuns`, `useRefreshCiRuns`. Done when T10 passes. (AC-72, 82)
- S4.2 CI tab: add `ci` to `TABS` and `VALID_TABS` (`app/agents/[id]/constants.ts:2`; `constants.test.ts` keeps passing); update stale "later lessons" comment. New `_components/CiTab/` per `screen_agents.jsx:121-160`: empty state; rows with badge, PR link, latest run, `outdated`/`pending update`; "Installed in N repos"; Fail-CI-on radio (`any` shows note); Update CI config with per-repo results; skeleton while loading, error + Retry on failure. Done when T11 passes. (AC-1, 68–78, 101, 134; NFR-8)
- S4.3 Wizard Target and Configure (`_components/ExportCiWizard/` + one sub-component per step). Close sends no write; `useModalFocus`. Done when T12 passes. (AC-2–9, 16; NFR-7 static)
- S4.4 Wizard Preview: file list; workflow editable, others read-only; loading and error + Retry; `runner_bundle_unavailable` shows its message; edits survive Back; regenerate asks confirmation; client-side 64 KB hint. Done when T12 passes. (AC-11–15, 127, 146, 149; EC-17)
- S4.5 Wizard Install: `pnpm -C client add fflate`; options PR (repo, branch, file count) or zip of exactly the Preview files; permissions list and "Installing…"; done state checklist; errors show server message with Settings link for token/scope errors. Done when T12 passes. (AC-17, 18, 20–22, 126, 128)
- S4.6 Nav entry: append `{ key: "ci-runs", labelKey: "nav.ciRuns", icon: <existing icon>, href: "/ci-runs" }` to SKILLS LAB in `nav.ts`; `nav.ciRuns` in `shell.json`; `/ci-runs` → `ci-runs` in `activeKeyFor`. Done when T13 passes. (AC-79)
- S4.7 CI Runs page (`app/ci-runs/page.tsx` thin, `_components/CiRunsView/`, `CiRunRow/`), per `screen_cizruns.jsx:18-60`, no auto-refresh, no filters: columns per AC-80; "—" + reason; "unlinked"; ellipsis with accessible name; "differs from export" with text and icon; Refresh disabled while running ("Refreshing…"), rows kept; per-repo errors; token-missing link to Settings; empty state. Done when T14 passes. (AC-79–83, 94, 97, 100–102, 115, 180, 182; NFR-8)
- S4.8 i18n: all new strings in `ci.json` (incl. "differs from export", Q-22h skeleton and error, `runner_bundle_unavailable`). Done when grep finds no literal user strings in new components and tests load `ci.json`. (NFR-12)
- S4.9 Boundary: `pnpm -C client test` passes with no edits to `app/repos/[repoId]/pulls/**` tests. (NFR-13)

### Integration (main session, after wave 2)
- S5.1 In order:
  1. `pnpm -C server typecheck && pnpm -C server lint && pnpm -C server arch:check && pnpm -C server exec vitest run --exclude '**/*.it.test.ts'`
  2. `pnpm -C agent-runner typecheck && pnpm -C agent-runner test && pnpm -C agent-runner build`
  3. `pnpm -C client typecheck && pnpm -C client lint && pnpm -C client test`
  4. `./scripts/check-shared-sync.sh`
- Done when every command exits 0. Integration tests (`*.it.test.ts`) run only after S1.5 generated the migration; not run by implementers.

## Test plan
| T# | AC/EC | File | Level | Assertion | Written in |
|---|---|---|---|---|---|
| T1 | AC-38–51, 103, 117–119, 131, 132, 146, 148, 161, 167, 184 | `server/test/ci-bundle.test.ts` | unit | S2.1 assertions: permissions, SHAs, node "24", timeout, concurrency, trigger union, no PR-controlled expansion in `run:`, no `pull_request_target`, both runner files; manifest round-trips `AgentManifest` | S2.1 |
| T2 | AC-149, 150, 183 | `server/test/ci-export.test.ts` | unit | one runner file missing → 503 `runner_bundle_unavailable`; 0 GitHub calls; 0 upserts | S2.2 |
| T3 | AC-19, 23–37, 122, 125, 129, 130, 179 | `server/test/ci-export.test.ts` | unit (mock ports) | one test per error code/status; identical files → no commit and `pr_reused`; only `devdigest/ci` written; other agents' paths not in commit; snapshot stored | S2.4 |
| T4 | AC-84–98, 111, 113, 114, 116, 123, 124, 135–141, 176–178, 180–182 | `server/test/ci-sync.test.ts` | unit | status mapping; filters; each reason; 63-char hash → `artifact_invalid` with nulls; numbers kept on expiry; redirect URL absent from rows and logs; `differs_from_export` cases | S2.6 |
| T5 | AC-37, 75, 76, 82, 177; NFR-9 | `server/test/ci-routes.test.ts` | unit (inject) | response shapes parse with contracts; flags; no token in logs | S2.7 |
| T6 | AC-52–55, 106–108, 118, 120, 143, 144, 151–159, 162, 163, 168, 171–173 | `agent-runner/src/run.test.ts`, `manifest.test.ts` | unit | status, reason, exit per gate; LLM and post stubs called 0 times | S3.1–S3.3 |
| T7 | AC-56–62, 66, 67, 104, 105, 133, 164–166 | `agent-runner/src/run.test.ts` | unit | review event per gate; 422 → one body-only retry; title only in untrusted block; Never → exit 0 / failure exit 1 | S3.4, S3.5 |
| T8 | AC-63, 65, 121, 142, 145, 160, 169, 170, 175 | `agent-runner/src/artifact.test.ts`, `run.test.ts` | unit | artifact on every path; schema-valid; secrets `***`; one agent fails, other posts; max exit | S3.6, S3.7 |
| T9 | AC-109 | `agent-runner/src/diff-parity.test.ts` | unit | deep-equal parse output across fixtures | S3.8 |
| T10 | AC-72, 82 | `client/src/lib/hooks/ci.test.tsx` | unit | method, path, body; invalidation | S4.1 |
| T11 | AC-1, 68–78, 101, 134 | `client/.../CiTab/CiTab.test.tsx` | component | empty state, rows, flags, radio rollback on error, `any` note, per-repo results, skeleton, error + Retry | S4.2 |
| T12 | AC-2–9, 11–18, 20–22, 126–128, 146 | `client/.../ExportCiWizard/*.test.tsx` | component | step order; disabled Continue; edits kept across Back; confirm before regenerate; zip equals Preview files; error codes → messages | S4.3–S4.5 |
| T13 | AC-79 | `client/src/components/app-shell/helpers.test.ts` | unit | `ci-runs` item exists; `activeKeyFor('/ci-runs') === 'ci-runs'` | S4.6 |
| T14 | AC-79–83, 94, 97, 100–102, 115, 180, 182 | `client/src/app/ci-runs/_components/CiRunsView/CiRunsView.test.tsx` | component | columns; "—" + reason; "unlinked"; marker shown/hidden; Refreshing with rows kept; per-repo errors; token link | S4.7 |
| T15 | AC-147, 174 | S3.9 commands | integration (build) | two builds give different `runner_build`; run without `package.json` loads on Node 24 | S3.9 |
| T16 | AC-28, 135; NFR-5, NFR-11 | `server/test/ci-repository.it.test.ts` | it (not run by implementer) | upsert idempotent on key | S2.5 |
| T17 | NFR-13, EC-51 | existing suites unchanged | unit | listed suites pass with no diff | S2.9, S4.9 |

Commands per package:
- server: `pnpm -C server lint`, `typecheck`, `arch:check`, `exec vitest run --exclude '**/*.it.test.ts'`; integration `exec vitest run .it.test` (main session, after migration).
- client: `pnpm -C client lint`, `typecheck`, `test`.
- agent-runner: `pnpm -C agent-runner typecheck`, `test`, `build`.
- shared: `./scripts/check-shared-sync.sh`.

Implementers run targeted tests and their package typecheck. The main session runs S5.1.

## Manual acceptance (user, after merge + `pnpm db:migrate` + `pnpm -C agent-runner build`)
- Spec flow step 4 (Q-31): Refresh CI Runs; compare row's `head_sha` with PR head commit and checked-out merge commit; record which.
- Spec flow step 8 (AC-110, Q-19): install with classic PAT (only `repo`), then fine-grained PAT without `Workflows: write`; record status and body; check `github_scope_missing` message.
- Other spec flow steps 1–3, 5–7, 9. NFR-2 (Refresh over 5 installations ≤ 30 s), NFR-7 keyboard walk-through.

## Shared-file touchpoints with worktree A
- `client/src/vendor/ui/nav.ts`: W4 appends one item to SKILLS LAB. On conflict keep both.
- `client/src/lib/hooks/index.ts`: A appends `./multi-agent`; W4 appends `./ci`. Keep both.
- `server/src/db/migrations/meta/_journal.json`: A adds an entry. Generate only after A merged (S1.5); merge `main` first.
- Contract files: A owns `platform.ts`, `observability.ts`; this change edits only `eval-ci.ts`.
- `server/INSIGHTS.md`: restored away in S1.1.
- `client/src/components/app-shell/AppShell.test.tsx`: not edited; nav test goes in `helpers.test.ts`.
- `server/src/modules/reviews/**`, `client/src/app/repos/[repoId]/pulls/**`: not touched (C11).

## Order and waves
- Wave 1: W1 (S1.1 → S1.2 → S1.3 → S1.4 → S1.5 or stop).
- Wave 2: W2, W3, W4 in parallel (4 implementers total).
- Wave 3: S5.1 in main session. If S1.5 was skipped, generate migration after A merges, then run `.it.test.ts`.

## Risks
- `300.index.js` chunk name: if `pnpm -C agent-runner build` emits a different name or count, W3 stops and reports; nobody renames files or edits `CI_PATHS.RUNNER_FILES` alone; spec revision via spec-creator. (inference)
- Design is JSX, not PNG: pixel fidelity is a manual visual check.
- Worktree-A conflicts in `nav.ts`, `hooks/index.ts`, journal: keep both sides.
- Migration stop: until A merges, integration tests for CI and local feature run are blocked; unit tests and typecheck are not.
- "Awaiting approval" run status is unconfirmed (Q-20); mapping `waiting`/`action_required` is an inference.
- Parity test imports server parser across packages; if `diff-parser.ts` pulls server-only imports, vendor its pure function. (inference)
- Runner typecheck fails from W1 until W3 finishes; expected.

## Review handoff (optional, after implementation, in order)
1. architecture-reviewer: onion rings for new ports/services; client feature boundaries.
2. security-reviewer: workflow generator, artifact ingest, runner redaction, title framing, fork detection.
3. plan-verifier (last): AC/EC/NFR → step → T# traceability against the final diff.

Docs (doc-writer, after verification): feature spec → implemented; `agent-runner` in root `AGENTS.md` (6 packages); server docs for `ci` module; manual runner build step; token permissions.

## Handoffs (not in this change)
- CI workflow for `agent-runner/` (Q7).
- Root `AGENTS.md` package list.
- Studio prompt alignment (Q-23).
- This repo's own `@v4` workflows (out of spec scope).

## Gaps found while planning
- Pass-1 REC1–REC7 text was not in the planning prompt; labels here are the planner's restatement — verify against what the user accepted.
- No YAML library in server (`yaml` will be added), no zip library in client (`fflate` will be added).
- No existing `/ci-runs` route, CI tab or CI module.
