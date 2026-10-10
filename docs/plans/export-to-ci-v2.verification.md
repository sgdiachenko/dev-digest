# Verification Report

Plan: `docs/plans/export-to-ci-v2.md` · Spec: `docs/specs/2026-10-09-export-to-ci-v2.md` · gate.sh fingerprint: `157105a993b66ffe57a57ce8dac25ab405c34da8c04da8ce753492cc5e63296e`

## Verdict
verified with gaps — met: 29 groups (about 175 requirement IDs), partial: 6, unmet: 0, not-verifiable: 8 (rows are grouped by shared evidence; every ID appears in exactly one row)

## Traceability matrix
| ID | Item (quoted) | Source | Verdict | Evidence | Missing |
|---|---|---|---|---|---|
| AC-1, AC-68, AC-69, AC-70, AC-71, AC-72, AC-73, AC-74, AC-75, AC-76, AC-77, AC-78, AC-134 | CI tab: empty state, rows, "Installed in N repos", Fail-CI-on, flags, Update CI config | spec, S4.2, T10, T11 | met | `CiTab.test.tsx:29,44,61,95,103,119,133,144`; `ci.test.tsx:36,45` | AC-72/AC-77 are `verify: integration`; evidence is a component test with a mocked fetch (no live agent update route) |
| AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9, AC-11, AC-12, AC-13, AC-14, AC-15, AC-16, AC-17, AC-18, AC-20, AC-21, AC-22, AC-126, AC-127, AC-128, EC-17 | Wizard Target/Configure/Preview/Install | spec, S4.3–S4.5, T12 | met | `ExportCiWizard.test.tsx:50,66,75,83,105,126,142,160,169,198,213,232,276,294,310` (failure branches AC-5, 6, 8, 13, 22 are asserted) | none |
| AC-79, AC-80, AC-81, AC-82, AC-83, AC-94, AC-97, AC-100, AC-101, AC-102, AC-115, AC-180, AC-182 | CI Runs page | spec, S4.6, S4.7, T13, T14 | met | `CiRunsView.test.tsx:93,130,152,195,209,229,267`; nav test `helpers.test.ts`; `ci.test.tsx:72` | none |
| AC-19 | zip path records no installation and makes no GitHub write | spec, S4.5 | met | `ExportCiWizard.test.tsx:310` (zip, installs nothing); `ci-export.test.ts:57` (files action: no GitHub call, nothing stored) | none |
| AC-23, AC-24, AC-25, AC-26, AC-27, AC-29, AC-30, AC-31, AC-32, AC-33, AC-34, AC-35, AC-36, AC-37, AC-122, AC-125, AC-129, AC-130, AC-119 | Install service (branch, PR, conflicts, errors) | spec, S2.4, T3 | met | `ci-export.test.ts:57,105,125,134,165,174,186,223,232,243,259,281,295,303,314,323`; `ci-routes.test.ts:106` (AC-34 422) | `verify: integration` against real GitHub is not exercised; mocked ports only |
| AC-28, AC-176, AC-179 | store one installation per agent and repo, upsert; store trace / snapshot | spec, S2.4, S2.5, T16 | partial | install and snapshot stored via fake store `ci-export.test.ts:186`; trace fields `ci-sync.test.ts:281`; `repository.ts` uses `onConflictDoUpdate` | `ci-repository.it.test.ts` written but not run (migration pending, S1.5); upsert and persistence of the new columns not shown against Postgres |
| AC-135, NFR-5, NFR-11 | idempotent keyed storage, survives restart, migration | spec, S1.4, S1.5, S2.5, T16 | not-verifiable | unit idempotency `ci-sync.test.ts:175,183`; schema `server/src/db/schema/ci.ts` | needs the generated migration (S1.5 pending, worktree A not merged) and `*.it.test.ts` on Postgres |
| AC-38, AC-39, AC-40, AC-42, AC-43, AC-44, AC-45, AC-46, AC-47, AC-48, AC-49, AC-50, AC-51, AC-103, AC-117, AC-118, AC-131, AC-132, AC-148, AC-161, AC-167 | Bundle generator and workflow | spec, S2.1, T1 | met | `ci-bundle.test.ts:80,102,109,133,159,178,184,188,196,207,212,220,229,238,245,251,257`; `bundle.ts:103-166` | none |
| AC-146, AC-184 | bundle has both `index.js` and `300.index.js`; Preview lists them | spec, S2.1, S2.2, S3.9 | met (user-decided deviation: third file) | `CI_PATHS.RUNNER_FILES` = `index.js`, `300.index.js`, `package.json` (`server/src/vendor/shared/contracts/eval-ci.ts:391`, client copy identical); `ci-bundle.test.ts:77-102` asserts the 8-file order incl. `.devdigest/runner/package.json`; `ci-export.test.ts:104` 503 when package.json absent; Preview list `ExportCiWizard.test.tsx:105` | Spec text of AC-146 and AC-184 still says two files; user decided 2026-10-09 on a third file, so the spec needs a superseding revision (not rated unmet for that reason) |
| AC-147 | runner runs on Node 24 from an empty dir without `package.json` | spec, S3.9, T15 | not-verifiable | `package.json` `{"type":"module"}` now ships beside `index.js` (`ci-bundle.test.ts:41,98`); `agent-runner/insights/INSIGHTS.md:14`; main session reports agent-runner build exit 0 with `dist/` holding `index.js`, `300.index.js`, `package.json` | executing the built runner on Node 24 in an empty dir is outside my command allow-list; a human/implementer run of `node .devdigest/runner/index.js` would verify |
| AC-174 | `runner_build` differs between two different bundles | spec, S3.6, S3.9, T15 | met | `artifact.test.ts:98-113` (stable for one bundle; differs when `index.js`, `300.index.js` or `package.json` differs); `build-id.ts:17` hashes `CI_PATHS.RUNNER_FILES` in order | none |
| AC-149, AC-150, AC-183 | missing runner file → `runner_bundle_unavailable`, no GitHub write, no installation | spec, S2.2, T2 | met | `ci-export.test.ts:70,86` | none |
| AC-52, AC-53, AC-151, AC-152, AC-173 | manifest parse, `post_as` validation | spec, S3.1, T6 | met | `manifest.test.ts:14,21,33,40,45`; `run.test.ts:65,77` | none |
| AC-54, AC-55, AC-120, AC-143, AC-144, AC-158, AC-159, AC-162, AC-163, AC-171, AC-172 | pre-review gates make no LLM call or post | spec, S3.2, T6 | met | `run.test.ts:84,94,100,107,115,124,130,141,147,155` | none |
| AC-56, AC-106, AC-107, AC-108, AC-153, AC-154, AC-155, AC-156, AC-157 | diff fetch, strip, empty, oversize | spec, S3.3, T6 | met | `run.test.ts:163,173,182,191,198,204` | none |
| AC-57, AC-58, AC-59, AC-60, AC-61, AC-62, AC-66, AC-67, AC-104, AC-105, AC-133, AC-164, AC-165, AC-166 | review call, post modes, exit codes, untrusted framing | spec, S3.4, S3.5, T7 | met | `run.test.ts:215,231,248,262,269,277,284,293,299,308,316,329,340` | none |
| AC-63, AC-65, AC-121, AC-142, AC-145, AC-160, AC-169, AC-170, AC-175, NFR-10 | artifact on every path, redaction, agent isolation, logging | spec, S3.6, S3.7, T8 | met | `artifact.test.ts:35,55,77,97`; `run.test.ts:349,360,377,396,409,420,428` | none |
| AC-109 | parsed diff equals the studio's parser output on shared fixtures | spec, S3.8, T9 | met | `diff-parity.test.ts:25-29` runs both parsers on fixtures WITH their final newline and asserts `toEqual`; both pop the phantom trailing entry (`server/src/adapters/git/diff-parser.ts:19`, `agent-runner/src/diff.ts:73`) | none |
| AC-168 | runner reads manifest, skills and memory from the merge-ref checkout | spec, S3.1, S2.1 | met | `index.test.ts:20-40` chdir into a checkout with a PR-changed manifest, asserts artifact `agent` and `manifest_sha256` equal the PR copy, not the base copy; workflow uses default `actions/checkout` (`bundle.ts:141`) | skills and memory reads from cwd not asserted separately in that test |
| AC-84, AC-86, AC-87, AC-88, AC-91, AC-92, AC-93, AC-95, AC-96, AC-98, AC-100, AC-111, AC-113, AC-114, AC-116, AC-123, AC-124, AC-136, AC-137, AC-138, AC-139, AC-140, AC-178, AC-181 | ingest / sync behaviour | spec, S2.6, T4 | met | `ci-sync.test.ts:101-481` (AC-86 mapping, filters, 20-run cap, reasons, 1 MB and 256 KB caps, 410, per-installation errors, `differs_from_export`) | AC-116 signal (`waiting`/`action_required`) is the plan's inference (Q-20), as the spec marks it pending research |
| AC-85, AC-89, AC-90 | identity from API; 1 MB not downloaded; only `devdigest-result.json` read | spec, S2.6 | met | `sync-service.ts:109-124,159`; `ci-sync.test.ts:226,242,275` | none |
| AC-99 | CI runs stored separately from local runs | spec, S1.4 | met | `server/src/db/schema/ci.ts` (`ci_runs` own table); no change under `server/src/modules/reviews/**` | none |
| AC-112, AC-141 | follow redirect at once; redirect URL never stored or logged | spec, S2.3 | met | `ci-octokit-artifact.test.ts:22` (follows 302 Location once, `redirect: 'manual'`, returns only bytes, logs nothing), `:40,:50` (410 -> null), `:56` (thrown error never carries the URL); `octokit.ts:529-575`; service level `ci-sync.test.ts:399` | none |
| AC-177 | `GET /ci-runs` returns trace fields and flag | spec, S2.7, T5 | met | `ci-routes.test.ts:158` | none |
| NFR-3, NFR-4, NFR-6, NFR-9 | 0 LLM calls on studio paths; limits; untrusted inputs; logging | spec, T1–T8 | met | no LLM port in `modules/ci/**`; limits via `CI_LIMITS` asserted at `ci-export.test.ts:125,134`, `ci-sync.test.ts:162,226,242,481`, `ci-bundle.test.ts:159,188`, `artifact.test.ts:50`; logging `ci-export.test.ts:342`, `ci-sync.test.ts:412`, `run.test.ts:396` | none |
| NFR-8 | status, counts, flags, marker never colour alone; results announced | spec, S4.7, C10 | partial | `aria-live="polite"` asserted for the Refresh region `CiRunsView.test.tsx:229-235`; implemented in `UpdateResults.tsx:16` and `InstallDone.tsx:20`; text markers `CiRunsView.test.tsx:209` | no test asserts `aria-live` for `UpdateResults` or `InstallDone`; text+icon is asserted only for the "differs from export" marker |
| NFR-12 | all user strings from `ci.json` | spec, S4.8 | met | `rg` for JSX literal text and `title`/`aria-label`/`placeholder` literals in `ci-runs/` and `CiTab/` finds none | none |
| NFR-13 | existing review suites unchanged | spec, S2.9, S4.9, T17 | partial | no file under `server/src/modules/reviews/**`, `client/src/app/repos/[repoId]/pulls/**` or `server/test/` existing files modified; server unit 79 files and client 98 files pass | `reviews.it.test.ts` and e2e flows `02`/`04` not run (forbidden here) |
| NFR-1 | preview p95 ≤ 1 s on the seeded DB | spec | not-verifiable | no test exists | integration run with the seeded DB after migration |
| NFR-2 | Refresh over 5 installations ≤ 30 s | spec | not-verifiable | manual-only (state file) | real GitHub run |
| NFR-7 | wizard keyboard walk-through | spec | not-verifiable | manual-only (state file); static `useModalFocus` use in the wizard | human keyboard walk-through |
| AC-110 | 403 detection for classic PAT without `workflow` / fine-grained without `Workflows: write` | spec | not-verifiable | manual-only; mapping unit-tested `ci-export.test.ts:303` | real tokens on a throwaway repo |
| Q-31 | `head_sha` meaning (spec flow step 4) | plan Manual acceptance | not-verifiable | manual-only (state file) | compare a stored `head_sha` with PR head and merge commit on a real run |
| AC-10, AC-41, AC-64 | struck through | spec | skipped | struck in the spec | none |
| C1 | imports inward; services take ports; arch:check | plan | met | `arch:check` exit 0, 0 errors (7 existing warnings, none in `modules/ci`) | none |
| C2, C3 | snake_case wire fields; `eval-ci.ts` copies identical | plan | met | `check-shared-sync.sh` exit 0 | none |
| C4 | no hand-written migration, no `db:migrate` | plan | met | no `server/src/db/migrations/**` change in `git status` | none |
| C5 | lockfiles only via package manager | plan | not-verifiable | `server/pnpm-lock.yaml`, `client/pnpm-lock.yaml` modified alongside `package.json` | source for the lockfile rule is AGENTS.md "Do-not-touch", read; hand-edit vs `pnpm add` cannot be told from a diff |
| C6 | no PR-controlled `run:` expansion, SHA pins, permissions exactly two | plan | met | `ci-bundle.test.ts:184,196,238` | none |
| C7 | never log token, redirect URL, artifact contents, diff | plan | met | `ci-sync.test.ts:399`, `run.test.ts:396`, `ci-routes.test.ts:81` | adapter-side leg: see AC-141 |
| C8 | repository maps rows to contract types | plan | met | `repository.ts` returns `StoredInstallation` / `StoredRun`-typed values; arch:check exit 0 | none |
| C9, C10 | component layout, strings in `ci.json`, `fireEvent`; status via text/icon | plan | met | component folders under `CiTab/_components/` and `ci-runs/_components/` each with a colocated test; see NFR-12, NFR-8 | NFR-8 gap above |
| C11 | do not touch reviews, PR pages, `platform.ts`, `observability.ts` | plan | met | `git status` lists none of those paths | none |
| C12 | `safeParse` every untrusted input | plan | met | `sync-service.ts:176`; `manifest.test.ts:33-45`; `run.test.ts:155,459` | none |
| S1.1 | cherry-pick of `a251426` | plan | met | `agent-runner/**` present in tree | `server/INSIGHTS.md` is now modified (see Unplanned changes) |
| S1.2, S1.3, S1.4 | constants, contracts, schema source | plan | met | `check-shared-sync.sh` exit 0; `server typecheck` exit 0 | none |
| S1.5 | migration with stop rule | plan | partial | report: "migration pending", no `NNNN_*.sql` generated | Plan allows this outcome ("skipped: A not merged"); migration absent |
| S2.1–S2.9 | server steps | plan, reports | met | files under `server/src/modules/ci/**`, `server/src/adapters/runner-bundle/fs.ts`, tests as listed; `server` checks exit 0 | S2.5 Done-when is "test written" — met; run pending |
| S3.1–S3.8 | runner steps | plan, reports | met | tests as listed; `agent-runner` typecheck/test exit 0 | S3.9 see AC-147 |
| S3.9 | build and run check | plan | partial | AC-174 met; AC-146/AC-184 met (user-decided third file); build exit 0 reported by main session | the empty-dir Node 24 run (AC-147) is not re-verifiable here |
| S4.1–S4.9 | client steps | plan, reports | met | tests as listed; client checks exit 0 | none |
| T1–T14, T17 | planned tests | plan | met | files exist: `ci-bundle`, `ci-export`, `ci-sync`, `ci-routes` tests, `run/manifest/artifact/diff-parity` tests, `ci.test.tsx`, `CiTab`, wizard, `helpers.test.ts`, `CiRunsView` | none |
| T15 | build commands | plan | partial | build exit 0 (main session, `dist/` has 3 files); `artifact.test.ts:98` | the run-from-empty-dir leg (AC-147) rests on the report only |
| T16 | `ci-repository.it.test.ts` | plan | not-verifiable | file exists `server/test/ci-repository.it.test.ts`; not run | migration pending |
| Out of scope | no agent-runner CI workflow, no root `AGENTS.md` edit, no e2e, no migration run, no Q-23 prompt change | plan | met | none of those paths in `git status` | none |

## Skill sources read
- AGENTS.md (root, "Do-not-touch" and "Naming conventions", preloaded in context) — rows: C2, C4, C5.
- `.claude/skills/onion-architecture/SKILL.md` and `.claude/skills/frontend-architecture/SKILL.md` (preloaded) — rows: C1, C8, C9.
- `.claude/skills/ears-requirements/SKILL.md` (preloaded) — all spec rows.
- Plan Constraints C6, C7, C10, C12 cite no skill file; they were judged against the plan text and spec ACs.

## Checks re-run
Re-check pass at fingerprint `157105a9...296e`. The prompt gave "Checks already run" (all exit 0) without a fingerprint value, so they are taken as reported by the main session and not re-run by me.

| Command | Report exit | Actual exit |
|---|---|---|
| `pnpm -C server lint` | 0 | 0 |
| `pnpm -C server typecheck` | 0 | 0 |
| `pnpm -C server arch:check` | 0 | 0 |
| `pnpm -C server exec vitest run --reporter=dot --exclude '**/*.it.test.ts'` | 0 (79 files, 848 tests) | 0 (79 files, 848 tests) |
| `pnpm -C client lint` | 0 | 0 |
| `pnpm -C client typecheck` | 0 | 0 |
| `pnpm -C client exec vitest run --reporter=dot` | 0 (98 files, 559 tests) | 0 (98 files, 559 tests) |
| `pnpm -C agent-runner typecheck` | 0 | 0 |
| `pnpm -C agent-runner test` | 0 (5 files, 67 tests) | 0 (5 files, 67 tests) |
| `./scripts/check-shared-sync.sh` | 0 | 0 |
| `pnpm -C agent-runner build` | 0 | not re-run (not in my command list); `dist/` holds `index.js`, `300.index.js`, `package.json` |
| `npm --prefix reviewer-core test` | 0 | not re-run (package untouched by the diff) |
| `*.it.test.ts` | not run | not run (forbidden; migration pending) |

## Report discrepancies
- none on exit codes.
- The reports list no deviation for the edits to `server/INSIGHTS.md`, `agent-runner/insights/INSIGHTS.md` and `docs/specs/README.md` (only `client/INSIGHTS.md` is listed under W4 Deviations).

## Unplanned changes
- `server/INSIGHTS.md` — modified (one 2026-10-09 line); plan S1.1 requires it unchanged from HEAD~1 for that step and lists no later edit; not named in a Deviation.
- `agent-runner/insights/INSIGHTS.md` — modified; not a step file, not named in a Deviation.
- `docs/specs/README.md` — modified (registry row for the v2 spec); not a step file, not named in a Deviation.
- `client/INSIGHTS.md` — modified; named under W4 Deviations (listed, so not counted).
- `agent-runner/pnpm-workspace.yaml`, `server/test/helpers/ci-fakes.ts`, `agent-runner/src/test-helpers.ts` — named under W2/W3 Deviations (listed, so not counted).

## Not verifiable
- AC-147 — executing the built runner on Node 24 in an empty dir is outside my allow-list; a run of `node .devdigest/runner/index.js` there verifies.
- AC-135, NFR-5, NFR-11, T16 — need the migration (S1.5) and a Postgres run of `ci-repository.it.test.ts`.
- NFR-1 — needs the seeded DB and a timing run.
- NFR-2, NFR-7, AC-110, Q-31 — manual-only (state file), need real GitHub and a human.
- C5 — a diff cannot show whether the lockfiles were produced by the package manager.

## Not found / gaps
- Skill safety assessment (`assessSkillSafety`): neither the spec (no match for "safety") nor the plan requires it for CI skill export, so no row is rated against it; the W2 report states skills are exported without it.
- AC-146, AC-184: spec text says two files, code ships three (user decision 2026-10-09); the spec needs a superseding revision.
- NFR-8: no `aria-live` test for `UpdateResults` / `InstallDone`.
- S1.5: no migration file; `ci-repository.it.test.ts` not run.
