# Reports: PR Brief

## Wave 1 — W1 (S1, S2): contracts + i18n — done
- S1: `brief.ts` extended in 3 byte-identical copies (`ReviewFocusItem`, `BriefMissingInputName`, `BriefMissingReason` ×16, `BriefMissingInput`, `BriefSpecUsed`, changed `PrBrief`, new `PrBriefRecord`); `server/test/brief-contracts.test.ts` created.
- S2: new `card` object in `client/messages/en/brief.json` (additions only, no `<`).
- Deviation/note: where the spec gives no exact copy, wording was written by the implementer (`error.*` other than missingKey/rateLimited/loadFailed, `missing.reason.*`, `missing.input.*`, `aiLabel`, `expandRisk`/`collapseRisk`, `empty.body`, `title`).
- Checks (targeted): check-shared-sync, typecheck server/client/mcp-server, brief-contracts test, client suite — all exit 0.
- Handoff: `PrBrief` now requires `summary` + `review_focus`; no non-vendor readers found besides `client/src/lib/types.ts:5`.

## Wave 1 — W3 (S3, S4): LLM adapters + attachments — done
- S3: OpenAI/Anthropic `completeStructured` honor `httpRetries` (0 → no `withRetry`, `{ maxRetries: 0 }`; >0 passed through; unset unchanged). `server/test/llm-http-retries.test.ts` (8 tests).
- S4: `listEnabledIdsOrdered` in agents repository; `ProjectContextForRepo` / `RepoContextResult` in `types.ts`; `ContextAttachmentsService.resolveForRepo` (priority no_clone > no_catalog > none; timeout/error → unavailable); tests extended (47 pass incl. unchanged `run-executor-project-context.test.ts`).
- Checks (targeted): server typecheck, arch:check, eslint, full unit suite — exit 0. `*.it.test.ts` not run.
- Handoff: Anthropic non-structured `complete()` still uses `withRetry` (by plan); W4 must wire the same `ContextAttachmentsService` instance into the brief service's `ProjectContextForRepo` port.

## Wave 2 — W2 (S5, S6, S7): brief pure logic — done
- S5 `brief/constants.ts`; S6 `brief/helpers.ts` + `test/brief-helpers.test.ts` (22 tests); S7 `brief/prompt.ts` + `test/brief-prompt.test.ts` (15 tests).
- Deviations (for reviewers/verifier):
  - Budget probing counts each section separately (memoized, +2 tokens per `\n\n` join, galloping bisect); final `estTokens` and guard use one exact count of system+user. Reason: TiktokenTokenizer on CJK worst case took 15 s with whole-message counting; now ≈2.5 s.
  - Specs added greedily after other sections; a document that does not fit is skipped whole (AC-40). If base input without specs does not fit, no specs are sent.
  - Step 7 shortens intent to ≤ INTENT_FLOOR_TOKENS in one shot only if still over budget.
  - `specsUsed` is `BriefSpecUsed[]` (snake_case); `budget` = `{ limit, reduced: [{ step, removed }] }` (counts only).
  - `intent/stale` and `intent/not_derived` missing reasons are NOT emitted by the builder — S13 must add them.
- Residual risk: the +2 join allowance is an estimate; if BPE merged across sections the exact final guard would throw `input_over_budget` (500) rather than trim further.
- Touched outside owns: one appended line in `server/INSIGHTS.md` (tokenizer slow on CJK; memoize per-section counts).
- Checks: targeted tests, eslint, server typecheck, arch:check (0 errors), full unit suite (617 pass) — exit 0.
- Handoff for S13: pass `blastPaths: blastPathsOf(sentBlast)`, store `sentBlast`/`sentIntent`, `rangesByPath` is `Map<string, LineRange[]>`, map `BriefInputOverBudgetError` → 500 `input_over_budget`, `InvalidBriefOutputError`/`classifyBriefFailure` → `invalid_output`.

## Wave 2 — W5 (S8, S9, S10, S19, S11): client data + Overview + IntentCard — done
- S8 `lib/hooks/brief.ts` (+barrel); S9 `OverviewTab/helpers.ts` + test (9); S10 8 components + 4 test files (14 tests); S19 `IntentCard` `children` slot + `id="intent"` + test (4); S11 `OverviewTab` composition + test (11, flows a–k).
- `OverviewTab` new props (`changedFiles`, `latestReview`, `onOpenFile`) optional with no-op defaults until S18 (W6) makes them required.
- Deviations: OverviewTab test stubs `BlastRadiusCard`; `BriefHeader` has `status` prop (`idle|pending|success|error`); `riskModelLabel` returns model name only; `latestReview` considers only `kind === "review"`; relative time uses `Intl.RelativeTimeFormat("en")`, not a message key.
- Checks: client typecheck, lint, full vitest (78 files / 392 tests) — exit 0.
- Manual-only: `#intent` focus/scroll, 320px/200% reflow (AC-69, AC-105, NFR-6).

## Wave 3 — W4 (S12, S13, S14): brief I/O, service, routes, DI — done (it test written, run by main-session gate)
- S12 `brief/repository.ts` (get via `parseStoredBrief`, single-upsert `replace`); S13 `brief/service.ts` + `test/brief-service.test.ts` (30 tests); S14 `brief/routes.ts`, `modules/index.ts`, memoized `briefService()` in `platform/container.ts` (same memoized `contextAttachments`, `intentService()`, `blastService()`), `test/brief.it.test.ts` (written, not run by implementer).
- Service: 75 s deadline + `abandoned` flag re-checked before `replace`; single-flight; rate limit; one `completeStructured` with `maxRetries: 0, httpRetries: 0`, timeout = min(60 s, remainder); adds `intent` `not_derived`/`stale` and `diff_stats/truncated`; metadata-only logs.
- Deviations: appended one line to `server/INSIGHTS.md` (outside owns); `specs_sha` stored only when ≥1 spec doc sent; added `intent/unavailable` on intent read error (not in spec); extra service-level 5 s timeout around `resolveForRepo`; it-test settings override cleared after test.
- Review notes: `service.ts` ~400 lines, 12 positional ctor args; `now` feeds only rate-limit window and `generated_at`, deadline uses `Date.now()`.
- Checks: server lint, typecheck, arch:check, unit suite (66 files / 647 tests) — exit 0. `*.it.test.ts` not run.

## Wave 3 — W6 (S15–S18): navigation + required props — done
- S15 `file-target.ts` + test (6), `use-pr-file-navigation.ts` + test (3); S16 diff-viewer `target` support (+5 tests); S17 `useDiffTarget.ts`, `DiffTab`, `RoleGroup` (+5 tests); S18 `page.tsx` wiring, `OverviewTab` props now required.
- Deviations: `RoleGroup` lost `defaultCollapsed` prop (derived from `COLLAPSED_BY_DEFAULT[role]`); `DiffTarget` adds `highlighted`, `CodeLine.focusTarget` is a ref callback; target applied only after Smart Diff loaded (reading of AC-99); `usePrFileNavigation` uses `useTranslations("brief")`; `page.tsx` imports `latestReview` from OverviewTab helpers (cross-folder); `OverviewTab` has 8 props (>7 guideline C13).
- No negative control run for new tests.
- Checks: client lint, typecheck, full vitest (80 files / 411 tests) — exit 0.
- Manual-only: AC-90/AC-91 scroll under sticky headers, AC-97 Back, focus ring.

## Wave 3 — full checks + integration gate (main session)
- Full check table (server lint/typecheck/arch:check/unit; client lint/typecheck/test; mcp-server typecheck/test; shared-sync): all exit 0 @ f98cefbea3ac94216d226047017b01bd41c6114307071e40582b6e0e9f18860d.
- Gate `pnpm -C server exec vitest run .it.test` (Docker up): exit 1 — 5 files / 10 tests failed on the parallel run; `brief.it.test.ts` (13 tests) green.
- Baseline: the same files on a clean `git worktree` of HEAD (no PR Brief changes) fail too (9 failures; set varies with load).
- Isolated per-file runs on the working tree: brief 13/13, project-context-run 3/3, project-context 10/10, skills-review 2/2 pass; still failing: `reviews.it.test.ts` (4: cost_usd null-vs-value, findings_summary, anthropic dual-provider) and `context-attachments.it.test.ts` (1: AC-8 foreign view repo expects 404, got 200) — both also red on clean HEAD.
- Status: pre-existing failures, not caused by this change; pending the user's decision (waive vs fix).

## plan-verifier — round 1 (verdict: verified with gaps — met 181, partial 17, unmet 0, not-verifiable 6)
Open rows → fixes in review-fix round (this report is superseded by the final report in `docs/plans/pr-brief.verification.md`):
- AC-62 / S11 / T6: no test for the loading state (skeleton, no Generate button).
- AC-92 / S16 / S17 / T12 / T13: reduced-motion branch untested.
- AC-104 / NFR-9: relative time built with `Intl.RelativeTimeFormat("en")` (`OverviewTab/helpers.ts:25-34`), not from `brief.json`.
- AC-106 / NFR-7 / C6 / S13 / T9: log split into two records on success; failure record lacks provider, model, est, budget, missing; no field-level test.
- EC-24: no restart test.
- C13: `OverviewTab` has 8 props (limit 7).
- AC-39 nuance: `specs_sha` null when specs resolved but every doc skipped over budget (spec says "store that SHA").
- Unplanned file: `client/src/components/diff-viewer/target.ts` (DiffTarget type; inside W6 `diff-viewer/**`, not named in S16 files) — accepted deviation.
- Manual-only (Phase 4): AC-69 visual, AC-90, AC-91, NFR-1, NFR-6.
- Waived pre-existing it failures (reviews.it ×4, context-attachments.it ×1): out of scope.

## Review-fix round (verifier round 1 gaps) — server
- AC-106/NFR-7/C6: one `brief.completed` record per run (success and failure; replaces `brief.generated`/`brief.stored`/`brief.failed`) with outcome, reason (failure), provider, model, tokens_in/out, cost_usd, input_tokens_est, budget, trimmed_sections, missing_sections, dropped counts, durationMs; metadata only. Tests: AC-106 success, failure, early failure.
- AC-39: `specs_sha` stored whenever specs resolved; null otherwise. Test added.
- EC-24: restart test (fresh BriefService over the same store; abandoned run left no row). 
- Files: `server/src/modules/brief/service.ts`, `server/test/brief-service.test.ts`. Checks: server lint/typecheck/arch:check/unit (66 files, 651 tests) exit 0.

## Review-fix round (verifier round 1 gaps) — client
- AC-62: OverviewTab test (l) loading state → skeleton, no Generate/Regenerate.
- AC-92: DiffViewer test with stubbed matchMedia (reduced motion → no transition; otherwise transition present).
- AC-104/NFR-9: `relativeTime` pure, returns `{key, count}`; `BriefHeader` formats via `card.relativeTime.*` (ICU plural) in `brief.json`; floors instead of rounding; future/<1 min → "just now". Test (m) "Generated 2 hours ago for commit".
- C13: `OverviewTab` props 8 → 7 (`repoFullName`+`headSha` → optional `repo` object); `page.tsx` updated; navigation props still required.
- Checks: client lint/typecheck/vitest (80 files, 414 tests) exit 0.
