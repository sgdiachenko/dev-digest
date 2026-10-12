# Verification Report

Plan: `docs/plans/multi-agent-review.md` · Spec: `docs/specs/2026-10-09-multi-agent-review.md` · gate.sh fingerprint: `3a95a23e423c6a98ca51e05839965e603af2d59772b8dfbf5d626f4e8b4ce95c`

## Verdict
verified with gaps — met: 108, partial: 5, unmet: 0, not-verifiable: 20

Rows with identical evidence are listed together; every ID appears.
`IT` = `server/test/multi-agent.it.test.ts` (written, compile-checked per the prompt, run in CI only: needs Docker).
Implementation Reports for W1-W3 were not pasted; "Deviations" below is judged against the plan and `git status` only.

## Traceability matrix

### Spec requirement rows
| ID | Item (short) | Source | Verdict | Evidence | Missing |
|---|---|---|---|---|---|
| AC-1, AC-49 | `agent_ids` (2+) creates one group, linked runs; 200 with `multi_agent_run_id` | spec | met | `service.ts` `runGroupReview` returns `multi_agent_run_id: groupId`; `multi-agent.repo.ts:71-90` inserts group + N linked runs; `multi-agent-service.test.ts:93`; IT:102 | IT unrun (CI) |
| AC-2, AC-3, AC-4, AC-5, AC-50, EC-15, EC-16, EC-19 (server half) | dedupe; "agent not found" identical and ahead of "agent is disabled"; <2/ combined -> 422; foreign PR 404 | spec | met | `service.ts` `resolveGroupTargets` (`not found` check before `disabled`); `multi-agent-service.test.ts:47,58,67,75,111`; IT:117 | |
| AC-6, EC-9, EC-17 (server half) | 409 + active group id while a member runs | spec | met | `multi-agent.repo.ts:49-68` (FOR UPDATE, running member -> conflict); `service.ts` `ConflictError(..., {multi_agent_run_id})`; `multi-agent-service.test.ts:117`; IT:140 | |
| AC-7, NFR-10 (single/all), AC-64 (server) | `agentId`/`all` unchanged, `multi_agent_run_id: null`, sequential | spec | met | `routes.ts` old path returns `multi_agent_run_id: null`; `run-executor.ts` `if (!opts?.parallel) for…await`; `run-executor-parallel.test.ts:158`; IT:153 | |
| AC-8, NFR-3 | diff + intent once, all starts concurrent | spec | met | `run-executor-parallel.test.ts:149` (barrier, 3 LLM calls, one diff/intent) | |
| AC-9, EC-3, EC-11 | one failure/cancel does not stop others | spec | met | `run-executor.ts` `runJob` catches, `Promise.allSettled`; test `:167`, `:175` | |
| AC-10 | diff-load failure fails all runs | spec | met | test `run-executor-parallel.test.ts:182` | |
| AC-11, NFR-5 | per-member trace/log isolation | spec | met | `runJob` closure + `runLog.forRun`; test `:190` | |
| AC-72, AC-73 (server) | own grounding and own dropped-finding lines | spec | met | test `run-executor-parallel.test.ts:190`; IT:165-186 asserts `grounding === '1/2 passed'` and one `grounding dropped` line per trace | drawer display part is e2e (see AC-72/73 row below) |
| AC-12 | GET returns columns with status/error/duration/cost/findings | spec | not-verifiable | `helpers.ts` `buildMultiAgentRun`; `multi-agent-helpers.test.ts:188-238`; IT:165 asserts columns | IT unrun; unit covers only the pure builder |
| AC-13 | max duration (0 none), sum cost (null none) | spec | met | `multi-agent-helpers.test.ts:189` | |
| AC-14, AC-51 | foreign PR 404; no group 200 `null` | spec | met | `service.ts` `multiAgentForPull`; `multi-agent-service.test.ts:127`; IT:190 | R5 (Fastify serialization of `null` body) asserted only in IT:190 (unrun) |
| AC-15, AC-16, EC-6, EC-14 | anchor rule, deterministic order, no chaining | spec | met | `helpers.ts` `groupFindings`; `multi-agent-helpers.test.ts:36,51,63` | |
| AC-17 | grouping by references only, findings untouched | spec | met | `multi-agent-helpers.test.ts:238` (no mutation); IT:165 (`findings` rows unchanged after GET) | |
| AC-18, AC-19, EC-5, EC-7 | takes and conflict rule | spec | met | `takesFor`, `isConflict`; `multi-agent-helpers.test.ts:112,124,137,143` | |
| EC-8 | running group: groups from stored findings | spec | met | `multi-agent-helpers.test.ts:226` | |
| AC-53, EC-12 (server) | deleted agent keeps column, nulls | spec | not-verifiable | left join `multi-agent.repo.ts:114`; IT:200 asserts nulls and takes | IT unrun (Docker) |
| AC-55 | titles, paths, error returned in full | spec | partial | IT:177 asserts 4000-char `title` | path and error length not asserted (T4 names all three) |
| AC-20 | PR selector + checkbox per agent | spec | met | `ConfigureForm.test.tsx:76`, `AgentChecklist.test.tsx:32` | e2e (spec verify) not planned; component evidence used |
| AC-21 | "≈" + average per agent (client) | spec | met | `AgentChecklist.test.tsx:32` | |
| AC-21 (server read) | last-5-done averages | spec | not-verifiable | `multi-agent.repo.ts:161-193` (window fn, rn<=5, status done); IT:227 | IT unrun |
| AC-22 | "no data", excluded from totals | spec | met | `helpers.test.ts:13` (multi-agent), `EstimateSummary.test.tsx:23` | |
| AC-23 | totals max duration / sum cost | spec | met | `multi-agent/helpers.test.ts:13`, `EstimateSummary.test.tsx:18` | |
| AC-24, AC-25, EC-1 | button label N; disabled with reason; 2-agent note | spec | met | `ConfigureForm.test.tsx:76,126`; `helpers.test.ts:27` | |
| AC-26 | running group disables + links | spec | met | `ConfigureForm.test.tsx:106` | e2e not planned |
| AC-27 | sends `agent_ids`, opens results | spec | met | `multi-agent.test.tsx:69` (body exactly `{agent_ids}`); `ConfigureForm.test.tsx:76` (push) | |
| AC-28, EC-10, EC-15, EC-16 (client) | rejected start shows text, keeps selection | spec | partial | `ConfigureForm.test.tsx:132` covers one error + 409 | no test per status 422/404/429/network (T8 lists them) |
| AC-48 | 409 links to active group | spec | met | `ConfigureForm.test.tsx:132` | |
| AC-29 | poll 3-4 s while running, stop after | spec | met | `multi-agent.ts` `multiAgentPollInterval`; `multi-agent.test.tsx:60` (3500 / false) | e2e not planned |
| EC-13 | restart: polling stops once none running | spec | met | `multi-agent.test.tsx:60` | |
| AC-30 | status text + icon | spec | met | `AgentColumnCard.test.tsx:38` | |
| AC-31 | View trace opens drawer | spec | met | `AgentColumnCard.test.tsx:52`; `MultiAgentResults.test.tsx:134` | |
| AC-32 | `?view=`/`?agent=` (run_id), restored | spec | met | `[number]/helpers.test.ts:45`; `MultiAgentResults.test.tsx:117` | |
| AC-33 | Tabs show selected run's full cards | spec | met | `TabsView.test.tsx:72,94` | |
| AC-34 | accept/dismiss refreshes reviews and group | spec | met | `multi-agent.test.tsx:95`; `reviews.ts` invalidates `["multi-agent", prId]`; `TabsView.test.tsx:72` | |
| AC-35 | Learn disabled "coming soon", no Reply | spec | met | `TabsView.test.tsx:85` | |
| AC-36 | groups of 2+ listed with agent + title, openable | spec | met | `GroupedFindings.test.tsx:45` | |
| AC-37, AC-38, AC-39 | disagreement cells, conflicts toggle, all-agree vs none | spec | met | `DisagreementBlock.test.tsx:61,76`; `[number]/helpers.test.ts:63` | |
| AC-40 | all failed: group message + errors, no block | spec | met | `MultiAgentResults.test.tsx:108`; `[number]/helpers.test.ts:75` | |
| AC-41 | polling error keeps last data | spec | met | `MultiAgentResults.test.tsx:101` | |
| AC-42 | null group -> empty state + Configure link | spec | met | `MultiAgentResults.test.tsx:86` | |
| AC-43, NFR-11 (nav) | one GLOBAL item "Multi-Agent Review" | spec | met | `nav.ts` diff; `AppShell.test.tsx` new case | |
| AC-44 | header says "parallel" | spec | met | `MultiAgentResults.test.tsx:95` | |
| AC-45, NFR-1 | 1-vs-3 measurement | spec | not-verifiable | manual-only per state file (Waived / manual-only) | user runs with real LLM key; writes `docs/multi-agent-review-measurement.md` (file absent, expected) |
| AC-46 | failed column shows error | spec | met | `AgentColumnCard.test.tsx:52` | |
| AC-47 | drawer shows live log while run is running | spec | not-verifiable | wiring only: `MultiAgentResults.test.tsx:134` mounts drawer with `running` | live SSE needs a browser/real run |
| AC-52, EC-12 (client) | "Deleted agent" label | spec | met | `[number]/helpers.test.ts:58`; `AgentColumnCard.test.tsx:63` | |
| AC-54, EC-4 | one-line ellipsis, expand | spec | met | `TruncatedText.test.tsx:12`; `AgentChecklist.test.tsx:46`; `AgentColumnCard.test.tsx:63`; `AgentPicker.test.tsx:143` | |
| AC-56 | disabled agents disabled + label | spec | met | `AgentChecklist.test.tsx:32` | |
| AC-57, AC-58, AC-59, AC-60 | picker heading, Clear, "~", "no data", disabled | spec | met | `AgentPicker.test.tsx:53` | |
| AC-61 | Clear unchecks all | spec | met | `AgentPicker.test.tsx:71` | |
| AC-62, AC-63, EC-18 | label N; disabled below 2 | spec | met | `AgentPicker.test.tsx:134`; `RunReviewDropdown.test.tsx:74` | |
| AC-65 | checking never starts a run | spec | met | `AgentPicker.test.tsx:53` | |
| AC-64 | Run all / row run unchanged | spec | met | `RunReviewDropdown.test.tsx:48`; `AgentPicker.test.tsx:90` | |
| AC-66 | sends `agent_ids`, navigates | spec | met | `AgentPicker.test.tsx:80`; `multi-agent.test.tsx:69` | |
| AC-67 | footer link with PR preselected | spec | met | `AgentPicker.tsx:121`; `AgentPicker.test.tsx:96` | |
| AC-68, AC-69 | errors in dropdown, selection kept, 409 link | spec | met | `AgentPicker.test.tsx:104` | per-status variants not enumerated |
| AC-70 | running group disables + links | spec | met | `AgentPicker.test.tsx:122` | |
| AC-71 | unknown `?pr=` preselects nothing | spec | met | `multi-agent/helpers.test.ts:39`; `ConfigureForm.test.tsx:99` | |
| EC-2 | skeletons while loading, button disabled | spec | met | `AgentChecklist.test.tsx:52`; `ConfigureForm.test.tsx:116`; `AgentPicker.test.tsx:134` | |
| NFR-2 | GET p95 <= 300 ms, 5 agents / 200 findings | spec | partial | indexes `multi_agent_runs_pr_ran_idx`, `agent_runs_multi_agent_run_idx` in `0019_far_puff_adder.sql`; bounded queries `multi-agent.repo.ts:110-154` | no timing test exists in IT (T4 lists 20 GETs p95) |
| NFR-4 | no cap, 5 agents accepted | spec | met | `multi-agent-service.test.ts:53` | |
| NFR-6 | no retry; failed member stays failed | spec | partial | code has no retry path (`run-executor.ts` `runJob`) | no test (T4 line "NFR-6") |
| NFR-7 | untrusted inputs | spec | met | `multi-agent-service.test.ts:58,138`; `routes.ts` uses `getById` workspace-scoped | |
| NFR-8 | keyboard/focus/24px/aria-live/tabs | spec | not-verifiable | roles + roving tabIndex asserted (`AgentTabs.test.tsx:28`); `aria-live` `ColumnsView.test.tsx:34`; `aria-pressed` in `DisagreementBlock.tsx:45` | focus ring, 24 px targets, tab order: manual (spec: manual + e2e) |
| NFR-9 | one group log line, no diff text | spec | met | `run-executor-parallel.test.ts:204` | |
| NFR-11 | all strings from catalogs | spec | met | `multiAgent.json`, `multiAgentResults.json`, `common.json` (`truncate.*`); components use `useTranslations` | `RunReviewDropdown.tsx:135` still hard-codes "No agents yet — create one" (pre-existing text, preserved per AC-64/EC-18) |
| AC-72/73 (drawer display) | drawer shows grounding / dropped line | spec | not-verifiable | drawer is the unchanged `RunTraceDrawer`; server data asserted above | needs browser/e2e (spec verify: e2e) |

### Plan Constraints
Skill sources: C1, C4, C5, C6, C8-C16 judged against read sources (root/server/client AGENTS.md, preloaded skills, plan text). See *Skill sources read*.

| ID | Rule | Verdict | Evidence |
|---|---|---|---|
| C1 | onion layering, no new port/container change | met | `service.ts` takes no container; drizzle only in `multi-agent.repo.ts`; `container.ts` not in diff; `arch:check` exit 0 (reused) |
| C2 | thin routes, Zod schemas, errors from `errors.ts` | met (AGENTS.md part) | `routes.ts` GET routes declare `params`/`response`; one service call each; `RunRequest.parse(req.body ?? {})` kept. `fastify-best-practices` not read: skill-only clauses unjudged |
| C3 | one transaction, `FOR UPDATE`, service throws 409 | met | `multi-agent.repo.ts:48-91`; service throws `ConflictError` |
| C4 | contracts verbatim, MCP via `cp` | met | `diff server/.../platform.ts mcp-server/.../platform.ts` empty; `git diff` of MCP copy shows only the 2 `agent_ids` lines; `check-shared-sync.sh` exit 0 (reused); Appendix A §2 text matches |
| C5 | one generated migration, FK indexed, never applied | met (content) | `0019_far_puff_adder.sql` = ADD COLUMN, FK ON DELETE set null, 2 CREATE INDEX, nothing else; journal entry idx 19 added in form of generator output; no hand edits visible. "Not applied" - see Not verifiable |
| C6 | naming | met | contracts snake_case, Zod const/type pairs, `cancelled`/`no_result` |
| C7 | backward compatibility | met (plan text; `breaking-change`/`response-schema` not read) | `routes.ts` old path unchanged + `multi_agent_run_id: null`; sequential default; `resolveTargets` untouched |
| C8 | isolation, `allSettled`, no new shared state | met | `run-executor.ts` diff: state in `runJob` closure; `Promise.allSettled` |
| C9 | untrusted input | met (plan text; `security` not read) | `getById` scoped; same message; no server truncation; `git grep dangerouslySetInnerHTML` over new client dirs: no match; URL params through `parseView`/`resolveAgentTab`/`resolveTraceRun`/`preselectPr` |
| C10 | data only via hooks | met | only `ApiError` imported from `@/lib/api` (`ConfigureForm.tsx:13`, `AgentPicker.tsx:12`), no `fetch(` |
| C11 | i18n | met | catalogs above; provider namespaces in `AgentPicker.test.tsx` / `RunReviewDropdown.test.tsx` (tests pass) |
| C12 | component layout | met | `_components/<Name>/<Name>.tsx` + test; largest component `MultiAgentResults.tsx` 182 lines |
| C13 | tests | met | vitest, `fireEvent`; IT file ends `.it.test.ts`; four server test files compile per prompt |
| C14 | compose vendor UI | met | only `vendor/ui` edit is `nav.ts` (`git status`) |
| C15 | a11y | partial -> see NFR-8 | `role="tab"`, `aria-selected`, `aria-live`, `aria-pressed`, Escape closes (`RunReviewDropdown.test.tsx:48`); 24 px / focus ring unverifiable statically |
| C16 | D-12, D-14 hold | met | D-12: footer `picker.configure` = "Configure multi-agent run…" -> `/repos/${repoId}/multi-agent?pr=${prNumber}` (`AgentPicker.tsx:121`, `multiAgent.json:43`); "Configure agents…" (`prReview.json:39`) still `router.push("/agents")` (`RunReviewDropdown.tsx:139-142`). D-14: byte-identical to server copy, +2 lines |

C15 verdict counted as not-verifiable in the totals (manual part), C2/C7/C9 counted met.

### Plan Steps (done-when)
| ID | Verdict | Evidence |
|---|---|---|
| S1 | met | MCP/server `platform.ts` diff empty; typecheck/test exit 0 (reused) |
| S2 | met | migration content above; typecheck exit 0; no apply artifact in repo |
| S3 | met | `multi-agent.repo.ts` + façade methods `repository.ts`; typecheck/arch exit 0; exercised by IT (unrun) |
| S4 | met | T1 passes (unit run exit 0, reused) |
| S5 | met | T2 passes; barrier/sequential case `run-executor-parallel.test.ts:158` |
| S6 | met | T3 passes |
| S7 | partial | T4 written (`multi-agent.it.test.ts`, 9 cases) and compiled; NFR-2 p95 and NFR-6 cases and path/error length of AC-55 absent; IT not run here |
| S8 | met | client typecheck exit 0; client copy matches (`check-shared-sync.sh` exit 0) |
| S9 | met | T5 passes |
| S10 | met | T6 passes |
| S11 | met | T7 passes |
| S12 | met | T8 passes; largest per-status error variants missing (see AC-28) |
| S13 | met | T9 passes; existing smoke case retained (`RunReviewDropdown.test.tsx:43`) |
| S14 | met | T10 passes |
| S15 | met | T11 passes |
| S16 | met | T12 passes |
| S17 | met | T13 passes |
| S18 | met | T14 passes; `grep dangerouslySetInnerHTML` finds nothing; client full table exit 0 (reused) |

### Plan Test-plan rows
| ID | Verdict | Evidence / gap |
|---|---|---|
| T1 | met | `multi-agent-helpers.test.ts` (all listed bullets present) |
| T2 | met | `run-executor-parallel.test.ts` (7 cases; AC-72/73 inside `:190`) |
| T3 | met | `multi-agent-service.test.ts` (all bullets) |
| T4 | partial | `multi-agent.it.test.ts` lacks NFR-2 p95, NFR-6, AC-55 path/error; unrun |
| T5 | met | `multi-agent.test.tsx:60,69,95` |
| T6 | met | `TruncatedText.test.tsx:12` |
| T7 | met | `AppShell.test.tsx` new describe |
| T8 | partial | per-status 422/404/429/network error variants (AC-28/EC-10/15/16) not individually asserted; the rest present |
| T9 | met | `AgentPicker.test.tsx` + `RunReviewDropdown.test.tsx` (AC-68 per-status variants not enumerated) |
| T10 | met | `[number]/helpers.test.ts` |
| T11 | met | `ColumnsView.test.tsx`, `AgentColumnCard.test.tsx` |
| T12 | met | `GroupedFindings.test.tsx`, `DisagreementBlock.test.tsx` |
| T13 | met | `TabsView.test.tsx`, `AgentTabs.test.tsx` |
| T14 | met | `MultiAgentResults.test.tsx:86-155` |

### Out of scope (stayed not done)
`e2e/` untouched, `review-api.ts` untouched, `adapters.ts` untouched, `client/src/vendor/ui/kit` untouched, no SSE/stale banner/group cancel/Learn backend in diff: met. `docs/multi-agent-review-measurement.md` absent as planned.

## Skill sources read
- `.claude/skills/onion-architecture/SKILL.md` (preloaded) - C1, C8
- `.claude/skills/frontend-architecture/SKILL.md` (preloaded) - C10, C12
- `.claude/skills/ears-requirements/SKILL.md` (preloaded) - verdict rules for all spec rows
- `server/AGENTS.md`, `client/AGENTS.md`, root `AGENTS.md` - C1, C2, C3, C4, C5, C6, C10, C11, C14
- Not read (source skill unread, so judged only against the plan's own rule text, not the skill): `fastify-best-practices` (C2 skill part), `drizzle-orm-patterns` (C3), `postgresql-table-design` (C5), `security` (C9), `breaking-change` and `response-schema` (C7), `react-best-practices`, `react-testing-library`, `next-best-practices` (C11-C13, C15 skill parts).

## Checks re-run
| Command | Report exit | Actual exit |
|---|---|---|
| server lint/typecheck/arch:check/vitest, client lint/typecheck/vitest, mcp-server typecheck/test, `check-shared-sync.sh` | 0 (table given in prompt) | reused @ `3a95a23e423c6a98ca51e05839965e603af2d59772b8dfbf5d626f4e8b4ce95c` (fingerprint matches the tree I read; the prompt gave no fingerprint, so the match is not confirmable) |
| `diff` server vs MCP `platform.ts` | - | 0 (empty) |
| `git grep dangerouslySetInnerHTML` over new client dirs | - | 1 (no match) |

## Report discrepancies
- None found. W1-W3 reports were not supplied as text; Deviations could not be compared.

## Unplanned changes
- `client/src/app/repos/[repoId]/multi-agent/[number]/_components/AllFailedNotice/` (`AllFailedNotice.tsx`, `index.ts`, `styles.ts`) - component not named by any plan step (S18 lists `MultiAgentResults` only); used by `MultiAgentResults.tsx:144`. Has no `AllFailedNotice.test.tsx` (C12 asks a test beside each component); behaviour covered through `MultiAgentResults.test.tsx:108`.
- `server/INSIGHTS.md` - one dated bullet added (engineering-insights skill); not a plan step.
- `docs/specs/README.md` - registry row for the spec; not a plan step.
- Not unplanned: `index.ts` / `styles.ts` files inside planned component folders; `docs/plans/*`, `docs/specs/2026-10-09-multi-agent-review.md`; `meta/0019_snapshot.json` and `_journal.json` (generated, S2).

## Not verifiable
- AC-45, NFR-1 - manual-only (state file) - user runs the 1-vs-3 measurement with a real key.
- AC-12, AC-53, EC-12 (server), AC-21 (server read) - integration only; IT is unrun here - CI run of `server/test/multi-agent.it.test.ts` (Docker).
- AC-47, AC-72/AC-73 drawer display - live SSE / drawer UI - e2e or manual run on a running group in a visible tab (R8).
- NFR-8 (and C15 focus ring, 24 px targets, tab order) - manual + e2e per spec.
- C5 "migration not applied / `db:migrate` not run" - no repo artifact records it; the repo holds only the generated SQL, journal and snapshot. Confirm with the user's shell history or `\d agent_runs` on the dev DB.

## Not found / gaps
- NFR-2 (partial): no p95 test. NFR-6 (partial): no test. AC-55 (partial): path/error not asserted. AC-28 (partial): per-status error tests missing. T4/S7 follow from these.
- `AllFailedNotice` has no component test file.
