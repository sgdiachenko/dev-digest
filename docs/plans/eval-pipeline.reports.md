# Implementation reports: Eval Pipeline

Condensed from the implementers' Implementation Reports (waves 1–4). Full per-step detail is in `docs/plans/eval-pipeline.impl.md` (Log) and the packages' own INSIGHTS.md lines.

## Wave 1

### W1 — contracts (S1, S2) — done
- Files: `server/src/vendor/shared/contracts/{eval-ci,knowledge}.ts`, client and mcp mirrors, `server/test/{eval-contracts,eval-contract-parity,contracts}.test.ts`.
- Deviation: helper types (`EvalCaseType`, `EvalExpectation`, `EvalDiffSource`, `EvalCaseBase`, …) live in `knowledge.ts` (avoids an import cycle; the mcp mirror copies `knowledge.ts` only). Barrel exports unchanged.
- `EvalRunComparison.flips[]` gets an extra `flip` field (AC-127).
- `EvalCaseInput` is a ZodEffects; `.extend`/`.omit` go through `EvalCaseBase`.
- Checks: shared-sync 0; server/client/mcp typecheck 0; T1, T2 green.

### W2 — reviewer-core (S3, S4) — done
- Files: `reviewer-core/src/{grounding,prompt,index}.ts`, `src/review/run.ts`, `test/eval-support.test.ts`.
- `isFullFileKind`, `buildLineIndex`, `unwrapUntrusted` exported; `ReviewInput` gets optional `temperature`, `timeoutMs`, `httpRetries`; `ReviewOutcome.request` added.
- Handoff: `unwrapUntrusted` does not round-trip content already containing a literal `<\/untrusted>`.
- Checks: typecheck 0, tests 52 green (current).

### W3 — schema (S5) — done
- Files: `server/src/db/schema/eval.ts`, `server/src/db/migrations/0018_last_proemial_gods.sql`, `meta/0018_snapshot.json`, `meta/_journal.json`.
- Add-only; generated with `db:generate`, no interactive prompt. `db:migrate` NOT run.
- Handoff: `eval_runs.suite_run_id` is NOT NULL without default — the migration fails on a DB that already has `eval_runs` rows.
- Status values: suite run `queued|running|completed|failed|interrupted|cancelled`; case run `queued|running|pass|fail|error|timeout`.

### W4 — client foundation (S19, S20, S21) — done
- i18n: `client/messages/en/eval.json` rewritten, `prReview.json`, `shell.json` (`nav.evalDashboard`).
- Sidebar item via optional `labelKey` + `ctx.labelFor`; T30 green.
- `useModalFocus` moved to `components/modal-focus`; T31 green.
- Deviations: curly quotes in eval messages (ICU `'{` escape).

## Wave 2

### W5 — server eval core (S6–S11) — done
- Files: `server/src/modules/eval/{types,constants,helpers}.ts`, `server/src/modules/reviews/{helpers,run-executor}.ts` (`toSkillBlock`), `server/src/platform/llm-params.ts`, `server/src/adapters/llm/openai.ts`, tests T4–T6.
- Richer shapes than the plan: `CaseScore`, `RunAggregate`; `compareRuns` returns `{case_set, flips, identical_config}`.
- On `failed` runs recall/precision/citation/cases_passed are null; cost and duration still summed.
- Checks: targeted 32 green; arch:check 0 errors.

### W6 — seed (S12) — done
- Files: `server/src/db/seed-eval.ts` (new), `server/src/db/seed.ts` (wiring).
- Idempotent; seed NOT run. Seeded runs carry fixture metrics and fixture `system_prompt`/`agent_version` (not derived from the real scorer).

### W7 — client data hooks (S22, S23) — done
- Files: `client/src/lib/hooks/eval.ts`, `eval.test.tsx`, `index.ts`.
- `useStartEvalRun` resolves `{run_id, already_active}` on 409 `run_active` instead of throwing; `useCancelEvalRun` included.

## Wave 3

### W8 — server eval API (S13–S18) — done
- Files: `server/src/modules/eval/{repository,service,attempt-service,suite-run-service,routes}.ts`, `modules/index.ts`, `platform/container.ts`, `app.ts` (boot-sweep), `server/package.json` (`verify:l06`), tests T7–T10, `eval.it.test.ts` (T12), `eval-perf.it.test.ts` (T13).
- Deviations: `SuiteRunStore extends EvalStore` (adds `cancelRun`, `agentIdsWithCases`); `partial` stored as text (enum has no `partial`, cast in `finishRun`); `cases_passed` NOT NULL stored as 0, API returns null unless completed/partial; public `Container.logger` added.
- Handoff: `runAll` implemented server-side (AC-114); no UI button.

### W9 — EvalCaseModal + FindingCard (S24–S28) — done
- Files: `client/src/components/eval-case-modal/**` (incl. `EvalCaseForm` split, not in plan), `useEvalCaseLauncher`, FindingCard + diff-viewer wiring, `DiffTab`, `FindingsPanel`, `ReviewRunAccordion`.
- Deviations: Files tab and Run-on-save omitted (DD-1, DD-10); provenance line not shown (draft contract has no finding title).
- Fix in main session: `classifySaveError` now reads the first zod issue from a 422 array (AC-52/157); +4 unit tests.

### W11 — Eval Dashboard (S34–S37) — done, with gaps
- Files: `client/src/app/eval/**`.
- Gaps: AC-114 "Run all agents" (could) UI not built; `eval.overview.crumbLab` and `runAllAgents` missing at the time (keys added in main session).
- Layout risks for D5: vendored `Checkbox` is 16px (wrapped in 24px cell); `BarRow` fixed 150px label column (table in horizontal-scroll wrapper, min width 1180).

## Wave 4

### W10 — Agents › Evals tab (S29–S33) — done
- Files: `client/src/app/agents/[id]/**` (page, `constants.ts` with `VALID_TABS`, AgentEditor wiring, EvalsTab and sub-components, tests T37–T40).
- Deviations: custom metric tiles instead of vendored `MetricCard` (Δ in pts, tooltip slot); `EvalsTab` takes `agentName`; small-set hint threshold 8 cases or one-sided set (AC-70); no Cancel button for the active run (not in S29–S31).
- `missing-i18n`: "EVAL METRICS" heading — key `eval.metrics.title` added in main session.

## Checks at the end of implementation (wave 4 table)
- server: lint 0, typecheck 0, arch:check 0 errors (7 warnings outside the package), unit 739/739, `eval.it.test.ts` 16/16 + `eval-perf.it.test.ts` 1/1 on Testcontainers Postgres.
- client: next typegen 0, lint 0, typecheck 0, tests 520/520.
- reviewer-core: typecheck 0, tests 52/52. mcp-server: typecheck 0, tests 26/26. check-shared-sync: 0.
- Not run by the implementation: `pnpm -C server verify:l06` as a single command (its unit files are covered above), e2e flows (test-writer handoff, out of `/run-plan`).
