# Verification Report

Plan: `docs/plans/eval-pipeline.md` · Spec: `docs/specs/2026-10-08-eval-pipeline.md` · Reports: `docs/plans/eval-pipeline.reports.md` · Waived / manual-only: `docs/plans/eval-pipeline.impl.md` (waived: none; manual-only: AC-139, AC-141, AC-142, NFR-12, NFR-13).
Gate fingerprint checked: `18c949d355c1089d67fecddc141a79f2391256ff3c5412de54a167577c5e5e85` (matches the caller's value).

## Verdict
verified with gaps — met: 164, partial: 4, unmet: 0, not-verifiable: 21
(Counted per individual ID: 161 active ACs, 34 ECs, 16 NFRs, C1–C21, S1–S37, D1–D6. Test-plan T# rows are folded into the AC rows they cite.)

Gaps behind the verdict:
- Partial: AC-114 (no UI), NFR-12, NFR-13, S18 (`verify:l06` not run as one command).
- Unplanned changes: `client/INSIGHTS.md`, `docs/homework-l06-eval-pipeline.md`.
- No row is `unmet`. No report discrepancy.

## Traceability matrix
Rows that share the same verdict and evidence are grouped on one line. Spec rows are quoted by their ID; the full text is in the spec.

### Spec ACs (U = unit, I = integration; "tag" = the AC id appears in the named test title)
| ID | Item | Source | Verdict | Evidence | Missing |
|---|---|---|---|---|---|
| AC-1, AC-2, AC-5, AC-54 | Turn-into-eval-case button states, modal opens without creating, Cancel persists nothing (verify: e2e) | spec | not-verifiable | No eval flow in `e2e/specs/` (`rg -i eval e2e` finds nothing). Component evidence: `FindingCard.test.tsx` and `useEvalCaseLauncher.test.tsx` (AC-1/2/4), `EvalCaseModal.test.tsx:141` (AC-5, no POST), `:351` (AC-54) | e2e flow (test-writer handoff, out of `/run-plan`) |
| AC-3, AC-4 | Button in all three render sites; missing-agent reason | spec | met | `FindingCard.test.tsx` (AC-1–4 tags), wiring in `DiffTab.tsx`, `FindingsPanel.tsx`, `OutsideDiffFindings.tsx` | |
| AC-6, AC-7, AC-8, AC-9, AC-10, AC-11, AC-12, AC-14, AC-16 | Draft from a finding (type, expectation, name, fragment, diff source, `diff_unavailable`, `existing_case`) | spec | met | `eval-helpers.test.ts` and `eval-service.test.ts` (tags); `eval.it.test.ts` ran on Testcontainers (17 passed, not skipped) | |
| AC-13, AC-143, AC-144, AC-153, AC-154 | Modal warning for `current_pr_files`, `diff_unavailable` reason with Run/Save disabled, duplicate warning that does not block Save | spec | met | `EvalCaseModal.test.tsx:298`, `:312` | |
| AC-18, AC-19, AC-20, AC-21 | Fixed inputs, no repo-intel/intent/memory, untrusted wrapping, one engine call | spec | met | `eval-fixed-inputs.test.ts` (tags); `attempt-service.ts` | |
| AC-23 | 90 s limit becomes `error/timeout`, late answer ignored | spec | met | `eval-fixed-inputs.test.ts:243` (fake timers, failure branch) | |
| AC-25–AC-34 | Matching, pass rules, recall, precision, citation, cases passed, null on 0 denominator, 0 LLM calls | spec | met | `eval-scoring.test.ts` (tags; spy LLM = 0 calls for AC-34) | |
| AC-36, AC-37, AC-41, AC-42, AC-43, AC-44, AC-45 | Modal layout, read-only agent, result line, finding marks, Save gating, outdated | spec | met | `EvalCaseModal.test.tsx:141`, `:179`; `helpers.test.ts` | |
| AC-39, AC-57, AC-67 (server) | Unpersisted attempt, 202 + attempt id, per-case attempt | spec | met | `eval-attempts.test.ts`, `eval.it.test.ts` | |
| AC-46 | Attempt `error` with reason code, no pass/fail | spec | met | `eval-fixed-inputs.test.ts` (ConfigError → `missing_key`, provider → `provider_error`, repair failure → `invalid_output`) | |
| AC-48, AC-50, AC-52, AC-63, AC-65, AC-140 | Create / duplicate-name 409 / 422 / update / delete / types from accepted and dismissed | spec | met | `eval.it.test.ts` (tags); `eval-contracts.test.ts` | |
| AC-53, AC-155, AC-156, AC-157, AC-158 | Single save request, close on success, new case "never run", `name_taken` at Name with draft kept | spec | met | `EvalCaseModal.test.tsx:141`, `:330`; `helpers.test.ts` (AC-53); `EvalCasesSection.test.tsx` (AC-156 tag) | |
| AC-55, AC-56, AC-145, AC-146, AC-147, AC-148, AC-149, AC-150, AC-159, AC-160 | Discard confirm, discard on close mid-run, expected-output errors, progress, error reason, API-keys link, "Run interrupted" | spec | met | `EvalCaseModal.test.tsx:215`, `:232`, `:249`, `:269`, `:284`, `:351` | |
| AC-59, AC-60, AC-61, AC-62, AC-64, AC-68, AC-69, AC-70, AC-71 | Evals tab, case rows, header count, edit, delete confirm, empty state, provenance, hint, manual case | spec | met | `constants.test.ts`, `EvalsTab.test.tsx`, `EvalCasesSection.test.tsx`, `EvalCaseModal.test.tsx:386`, `:422` | |
| AC-72–AC-76, AC-78–AC-80, AC-82, AC-87, AC-88, AC-89, AC-90, AC-161, AC-162 | Suite run start, pinned config and case set, sequential order, partial/failed, `no_cases`, `run_active`, boot sweep, per-case storage, immutability, null cost | spec | met | `eval-suite-executor.test.ts` (tags, e.g. `:193`, `:206`, `:221`, `:233`, `:251`, `:268`); `eval.it.test.ts`; boot sweep at `server/src/app.ts:91` | |
| AC-77, AC-84 and other struck-through IDs | Split into later ACs | spec | n/a | Skipped per verifier rules (struck through in the spec) | |
| AC-81, AC-83, AC-85, AC-86, AC-92, AC-151, AC-152 | "Run all evals" disabled states, follow active run on 409, per-case run status, polite announce, "k / N cases" | spec | met | `EvalCasesSection.test.tsx`, `eval.test.tsx` (AC-83), `AgentView.test.tsx:121`, `:136`, `EvalsTab.test.tsx` | |
| AC-91 | Cancel a running suite run (could) | spec | met | Server: `eval-suite-executor.test.ts:284`; UI: `AgentView.tsx:128`, `AgentView.test.tsx:121` | |
| AC-93, AC-95, AC-96, AC-97, AC-99, AC-175, AC-176, AC-177, AC-178 | Evals tab tiles, notes, Runs section, dashboard link, null "—" with reason, deltas | spec | met | `EvalsTab.test.tsx`, `RunsSection.test.tsx` | |
| AC-100, AC-101 | Sidebar item after Conventions, `/eval` active and breadcrumb | spec | met | `AppShell.test.tsx` (tags) | |
| AC-102, AC-103, AC-104, AC-115, AC-116, AC-118, AC-179, AC-180 | Overview content, card click, `Agent not found`, skeletons, ellipsis, error with Retry | spec | met | `EvalDashboardView.test.tsx:29`, `:64`, `:73`, `:80`, `:88` | |
| AC-105 | Recent runs feed (6 newest, integration) | spec | met | `eval.it.test.ts` (tag AC-105); `EvalDashboardView.test.tsx:29` | |
| AC-106, AC-107, AC-108, AC-111, AC-112, AC-113, AC-119, AC-120, AC-121, AC-164 | Agent view, table, dropdown, 30-days filter, trend chart, regression alert, selection rules | spec | met | `AgentView.test.tsx:24`, `:54`, `:72`, `:84`, `:112`, `:158` | |
| AC-110 | Empty overview with reason and link to Agents (verify: e2e) | spec | not-verifiable | No e2e. Component evidence `EvalDashboardView.test.tsx:105-114` (T42) | e2e on an empty stack (plan *Risks*) |
| AC-163 | "No eval runs for X yet" (verify: e2e) | spec | not-verifiable | No e2e. Component evidence `AgentView.test.tsx:158` | e2e flow (test-writer) |
| AC-114 | "Run all agents" starts one run per eligible agent (could) | spec | partial | Server `runAll` is covered: `eval-suite-executor.test.ts:315`. `rg -F "Run all agents"` finds no UI string and no client hook caller | The user-activated button is not built (reports W11 gap, S35) |
| AC-122 | Compare modal title and ordering (verify: e2e) | spec | not-verifiable | No e2e. Component evidence `CompareRunsModal.test.tsx:9` | e2e flow (test-writer) |
| AC-123, AC-124, AC-125, AC-128, AC-129, AC-131, AC-166 | Compare tiles, word diff, identical-config banner, deep link, unknown run, close and focus return, case-set banner | spec | met | `CompareRunsModal.test.tsx:9`, `:28`, `:38`, `:61`; `AgentView.test.tsx:178`; `helpers.test.ts` (wordDiff) | |
| AC-127, AC-130, AC-165 | Flips, `different_agents`, case-set diff | spec | met | `eval-helpers.test.ts`, `eval.it.test.ts` | |
| AC-132, AC-133, AC-134, AC-135 | Agent delete cascade, workspace 404, contract parity, case immutability against re-triage | spec | met | `eval.it.test.ts` (tags); `eval-contract-parity.test.ts`; `./scripts/check-shared-sync.sh` exit 0 (reused) | |
| AC-136 | Refresh case list, tab and dashboard after a mutation | spec | met | `eval.test.tsx`, `EvalCasesSection.test.tsx:183` | |
| AC-137 | `verify:l06` script runs the eval tests and exits 0 | spec | partial | Script present in `server/package.json` and lists the 8 files; its unit files are green; `eval.it.test.ts` passed on Docker | The script was never run as one command (reports, last line). I may not run `*.it.test.ts` |
| AC-138 | `verify:l06` includes the AC-34 test | spec | met | `eval-scoring.test.ts` is in the script | |
| AC-139, AC-141, AC-142 | ≥ 8 cases from real findings; prompt change moves a metric; broken prompt lowers precision | spec | not-verifiable | manual-only per the state file (D2–D4) | Real triage and a real LLM |
| AC-167, AC-168, AC-169, AC-170, AC-171, AC-172 | No review/finding/agent-run record, reviewed state unchanged, temperature 0, recorded params, errored case never pass and excluded | spec | met | `eval-fixed-inputs.test.ts`, `eval-scoring.test.ts`, `llm-params.test.ts`, `eval-support.test.ts`, `eval.it.test.ts`; `rg` finds no `markReviewed` or reviews/findings writes in `server/src/modules/eval` | |
| AC-173, AC-174 | Row opens with Enter/Space; labelled Run/Edit/Delete visible on focus | spec | met | `EvalCasesSection.test.tsx:146` | The hover state is not visible to jsdom (manual, plan *Review handoff*) |

### Edge cases (each maps to ACs above)
| ID | Verdict | Evidence |
|---|---|---|
| EC-2, EC-4–EC-12, EC-13–EC-21, EC-23, EC-24–EC-29, EC-31–EC-34 | met | Via the AC rows they point at (EC-2 → AC-6/135; EC-4 → AC-12/13/14; EC-15/16 → AC-74/75; EC-18 → AC-87/159; EC-20 → AC-165/166; EC-34 → AC-115/129, etc.) |
| EC-1, EC-3, EC-30 | met (unit) | `useEvalCaseLauncher.test.tsx`, `FindingCard.test.tsx`. The e2e side is covered by the AC-1/AC-2 not-verifiable row |
| EC-22 | met | `AgentView.test.tsx:47` |

### NFRs
| ID | Verdict | Evidence | Missing |
|---|---|---|---|
| NFR-1 | met | `eval-perf.it.test.ts:119`, passed on Docker (reused) | |
| NFR-2 | met | `eval-scoring.test.ts:177-187` | |
| NFR-3 | met | `eval-contracts.test.ts`; `eval.it.test.ts` (limits, 409/422) | |
| NFR-4, NFR-5, NFR-7 | met | `eval-fixed-inputs.test.ts:161,168,243`; `eval-support.test.ts`; `llm-params.test.ts` | |
| NFR-6 | met | `eval.test.tsx` (polling 2000 ms); `eval.it.test.ts` | |
| NFR-8 | met | `eval.it.test.ts` (workspace 404 on endpoints) | |
| NFR-9 | met | `useModalFocus.test.tsx`; `EvalCaseModal.test.tsx:370`; `CompareRunsModal.test.tsx:61`; `EvalCasesSection.test.tsx:183` | |
| NFR-10 | not-verifiable | Component keyboard paths: `EvalCaseModal.test.tsx:370`, `AgentView.test.tsx:84`. The spec says verify: e2e and no e2e flow exists | e2e flow (test-writer) |
| NFR-11 | met | `EvalCaseModal.test.tsx:232`; `AgentView.test.tsx:121`, `:136` | |
| NFR-12 | partial | `app/eval/_components/styles.ts:85` wraps the 16px vendored Checkbox in a 24x24 cell; row actions are labelled buttons. Contrast in both themes and the 3:1 non-text items are not checkable statically | Visual check (D5) |
| NFR-13 | partial | `EvalCaseModal/styles.ts:7` uses `auto-fit minmax(300px,1fr)`, which is a one-column reflow. The dashboard "Recent runs" table has `minWidth: 1180` inside `overflowX: auto` (`app/eval/_components/styles.ts:81-82`), and the `RunsSection` scrolls horizontally. The BarRow label column is a fixed 150px (`styles.ts:67`) | Browser check at 320 px and 200 % zoom (D5); the table contradicts "no horizontal scrolling" unless the check passes |
| NFR-14 | met | `eval-suite-executor.test.ts:340` (logs ids and numbers only) | |
| NFR-15 | met | `eval.it.test.ts:621`; `eval-contract-parity.test.ts`; `contracts.test.ts` | |
| NFR-16 | met | `rg '<[a-z]+>' client/messages/en/eval.json` finds nothing; strings come from `eval.json`, `prReview.json`, `shell.json` | |

### Constraints
| ID | Verdict | Evidence / reason |
|---|---|---|
| C1, C3 | met | `pnpm -C server arch:check` 0 errors (reused); services take ports via `types.ts` |
| C2 | met | `routes.ts` has 20 `schema:`/`params`/`body`/`response` entries for 16 route registrations and no `.parse(req` call; rule text read in `server/AGENTS.md:46` |
| C4, C5, C6, C19 | met | `check-shared-sync.sh` 0; the migration `0018_last_proemial_gods.sql` has only `CREATE TABLE`, `ADD COLUMN`, `ADD CONSTRAINT`, `CREATE INDEX`; no lockfile in the diff; `server/package.json` changes only the script |
| C7 | met | `repository.ts:436` creates the run and its case rows in one `db.transaction` (`server/AGENTS.md:50`) |
| C8, C10, C11, C12, C13 | met | Tests in `eval-fixed-inputs.test.ts` and `eval-suite-executor.test.ts`; no review-table writes in `modules/eval` |
| C9 | met | `container.ts` memoises the three services (`app.ts:91` calls `evalSuiteRunService()`) |
| C14 | met | `client/AGENTS.md:37-38`; the only `fetch(` hits in the eval client code are `refetch(` |
| C15 | met | Components under `_components/<Name>/`, shared code in `components/eval-case-modal` and `components/modal-focus` (frontend-architecture) |
| C21 | met | `eval.it.test.ts` and `eval-perf.it.test.ts` follow the naming rule (`server/AGENTS.md:68`) |
| C16 | not-verifiable | Source `client/INSIGHTS.md:39,41` not read. See NFR-16 for the i18n evidence |
| C17 | not-verifiable | Source react-best-practices not read. See NFR-9, NFR-12, NFR-13 rows |
| C18 | not-verifiable | Source react-testing-library and `client/INSIGHTS.md:47` not read. `rg user-event` in the new tests finds nothing |
| C20 | not-verifiable | Source breaking-change not read. See NFR-15 (existing shapes test) |

### Steps (done-when and files)
| ID | Verdict | Evidence |
|---|---|---|
| S1–S11, S13–S17, S19–S27, S29–S37 | met | Planned files exist; wave checks green and reused at the same fingerprint; step tests T1–T45 are present. Deviations are recorded in the reports (types placed in `knowledge.ts`, `EvalCaseForm` split, custom metric tiles) |
| S12 | met | `seed-eval.ts` and its wiring in `seed.ts` exist; typecheck and lint green; the seed was not run (as the plan says) |
| S18 | partial | Test files and the `verify:l06` script exist; `verify:l06` was not run as a single command |
| S28 | met | `client/src/test/smoke.test.tsx` is not modified (plan lists it), but the done-when is satisfied: client tests 520 green |

### Out of scope and Delivery
| ID | Verdict | Evidence |
|---|---|---|
| Out of scope (skill cases, Run on save, Promote vB, Files tab, Linked issue, resume, cross-agent compare, `evals/` harness) | met (not done) | `rg -i "promote|run on save|input_files|linked issue"` finds nothing in `client/src/app/eval`, `components/eval-case-modal`, `eval.json`, `server/src/modules/eval` |
| D1 (migrate, seed), D2, D3, D4, D5, D6 | not-verifiable | Manual-only per the state file (user). Migration 0018 has `eval_runs.suite_run_id` as `NOT NULL` with no default (line `ALTER TABLE "eval_runs" ADD COLUMN "suite_run_id" uuid NOT NULL`). That is fine on an empty table, as the plan assumes (S5), and it fails on a DB that already holds `eval_runs` rows |

## Skill sources read
- `onion-architecture`, `frontend-architecture`, `ears-requirements`, `engineering-insights` — preloaded; used for C1, C3, C15 and the spec-row evidence rule.
- `server/AGENTS.md` lines 46–54, 68 (via `rg`) — C2, C7, C21.
- `client/AGENTS.md` lines 37–38 (via `rg`) — C14.
- Not read, so not judged: fastify-best-practices (C2 is judged through `server/AGENTS.md` only), react-best-practices (C17), react-testing-library and `client/INSIGHTS.md` (C16, C18), breaking-change (C20).

## Checks re-run
| Command | Report exit | Actual exit |
|---|---|---|
| server lint, typecheck, arch:check, unit tests (739) | 0 | reused @ 18c949d355c1089d67fecddc141a79f2391256ff3c5412de54a167577c5e5e85 |
| `vitest run test/eval.it.test.ts test/eval-perf.it.test.ts` (17) | 0 | reused @ same fingerprint (I did not run `*.it.test.ts`) |
| client next typegen, lint, typecheck, vitest (520) | 0 | reused @ same fingerprint |
| reviewer-core typecheck, test (52) | 0 | reused @ same fingerprint |
| mcp-server typecheck, test (26) | 0 | reused @ same fingerprint |
| `./scripts/check-shared-sync.sh` | 0 | reused @ same fingerprint |
| `gate.sh fingerprint` | — | `18c949d3…5e85`, matches |

## Report discrepancies
- None. The `Checks` table in `eval-pipeline.reports.md` and the caller's table agree on all exit codes.

## Unplanned changes
- `client/INSIGHTS.md` — modified; no step lists it and the reports do not name it under Deviations. It comes from the engineering-insights skill. (`server/INSIGHTS.md` is named in the W1 deviation, d.)
- `docs/homework-l06-eval-pipeline.md` — untracked, named by the spec (*Delivery notes*) but by no plan step.
- `docs/plans/eval-pipeline.impl.md`, `docs/plans/eval-pipeline.reports.md` — process artifacts of `/run-plan`, not code.
- `client/src/components/eval-case-modal/EvalCaseModal/_components/EvalCaseForm/` — listed in the reports under Deviations (split not in the plan); no behaviour outside S25.

## Not verifiable
- AC-1, AC-2, AC-5, AC-54, AC-110, AC-122, AC-163, NFR-10 — e2e flows are a test-writer handoff and `e2e/` has no eval flow — add `e2e/specs/10-eval-*.flow.json` on the S12 seed.
- AC-139, AC-141, AC-142 — real triage and real LLM — D2–D4.
- D1–D6 — user delivery steps; run `pnpm -C server verify:l06` with Docker for D6.
- C16, C17, C18, C20 — source not read.
- NFR-12, NFR-13 — partial evidence only; visual and 320 px / 200 % zoom checks (D5). The 150px BarRow column and the `minWidth: 1180` table are the layout risks.

## Not found / gaps
- AC-114 — the "Run all agents" button is missing (priority could); the server side exists and is tested.
- AC-137 / S18 — `verify:l06` has not been run as a single command with Docker.
- AC-37 and AC-69 evidence is in the tests above; the modal shows no finding provenance line (reports W9). AC-69 only requires it on the case row, which is tested.
