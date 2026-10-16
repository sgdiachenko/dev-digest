# Verification Report

Plan: `docs/plans/agent-performance-dashboard.md` · Specs: `docs/specs/2026-10-15-agent-performance-dashboard.md` (agent), `docs/specs/2026-10-15-skill-stats-tab.md` (skill, IDs written `skill AC-n`) · Tree fingerprint checked: `118f2e6d0da678139cbb981a4e7456acd23154ac23f184bb9ed766017eaff2d5` (matches the fingerprint of the supplied check run).

Evidence convention: server tests are cited `path:line`; client test titles carry the spec ID in their title (grep-verified), cited by file. Rows are grouped where the evidence is identical; every listed ID is judged. Struck-through IDs of the agent spec (AC-29, AC-58–AC-97, AC-105, AC-116, AC-137, AC-158, EC-34–EC-41, NFR-4, NFR-9, NFR-18) are skipped, as in the plan's Out of scope.

## Verdict
verified with gaps — met: 115, partial: 1, unmet: 0, not-verifiable: 32

(Open reasons: one step file missing (S16), unplanned helper files (see *Unplanned changes*), and Docker/CI/manual-only rows. No row is `unmet`.)

## Traceability matrix

Policy for `not-verifiable (Docker)`: the decisive logic is a SQL predicate/join/bucket expression whose only behavioural test is an `*.it.test.ts` that was not run here. Where the JS assembly is unit-tested, that is cited as supporting evidence.

### Agent spec — acceptance criteria
| ID | Item (quoted, shortened) | Source | Verdict | Evidence | Missing |
|---|---|---|---|---|---|
| AC-1, AC-2, AC-3 | "count a run … status done/failed/cancelled … from ≤ start < to"; running left out; in-progress count | S5, S6 | not-verifiable | JS: `server/test/agent-stats-helpers.test.ts:35,46`. SQL filters `agent-stats/repository.ts:59,90,143` (status, `source`, workspace) | `agent-stats.it.test.ts` (T8) not run — Docker/CI |
| AC-4, AC-5 | Runs; failed and cancelled apart | S5 | met | `agent-stats-helpers.test.ts:63` | — |
| AC-6, AC-7, AC-8 | exact total; null when no known cost; avg over known | S5, C6 | met | `agent-stats-helpers.test.ts:81,96`; no SQL `sum/avg` on cost (`rg` over `agent-stats/` hits only JS count sums in `helpers.ts:280-311`) | — |
| AC-9, AC-10 | Avg duration over `done`; null if none | S5 | met | `agent-stats-helpers.test.ts:106` | — |
| AC-11 | accepted/dismissed/pending by decision at read time over done runs | S6, C22 | not-verifiable | JS part `agent-stats-helpers.test.ts:135`; FILTER expressions + join are SQL | T8 not run (Docker) |
| AC-12, AC-13, AC-14 | rate = a/(a+d); null at 0 decided; small sample < 10 | S5 | met | `agent-stats-helpers.test.ts:135,147,153,507` | — |
| AC-15, AC-16 | Deleted-agent row (null id); unknown-cost count | S5 | met | `agent-stats-helpers.test.ts:160,63` | — |
| AC-17 | Stats figures equal the agent's dashboard row | S5 | met | `agent-stats-helpers.test.ts:395` (same `buildRow`) | T8 same-data case unrun (adds no new logic) |
| AC-18, AC-19, AC-20, AC-21 | summary = sums of rows; pooled rate; Most-active + tie-breaks; null | S5 | met | `agent-stats-helpers.test.ts:225,233,239,257` | — |
| AC-22 | one row per agent, enabled or not, 0-run included, keyed by id | S5 | met | `agent-stats-helpers.test.ts:173` | — |
| AC-23 | Last run = latest finished run at any time | S6 | not-verifiable | assembly `agent-stats-helpers.test.ts:190`; `max(ran_at)` is SQL | T8 not run (Docker) |
| AC-24 | ≤5 latest done runs, oldest first | S5 | met | `agent-stats-helpers.test.ts:204` | — |
| AC-25, AC-26 | cost by agent / by model sum exactly to total | S5, C6 | met | `agent-stats-helpers.test.ts:278,288` (fold of rows, agents, models === total) | — |
| AC-27 | runs per bucket | S5 | met | `agent-stats-helpers.test.ts:323,340` | — |
| AC-28 | agent count; workspace last finished run incl. deleted agents | S6 | not-verifiable | assembly in `agent-stats/helpers.ts:300-315`; source query is SQL | T8 not run (Docker) |
| AC-30, AC-31 | findings per severity per bucket; per category | S6 | not-verifiable | bucket-size rule `agent-stats-helpers.test.ts:331`, zero buckets `:414`, category order `:438`; the `floor(extract(epoch …))` grouping is SQL (implementer's own "first real run is CI" flag) | T8 not run (Docker) |
| AC-32 | per-skill run counts; with/without skill data | S5, C8 | met | `agent-stats-helpers.test.ts:457,476` (`["s1",1]` = without data); ids compared as text, bound: `agent-stats/repository.ts:113` | — |
| AC-33 | runs newest first, 20 per page, fields | S6 | not-verifiable | `RunHistoryPage` contract `agent-stats-contracts.test.ts:135`; service passes 20 `agent-stats-service.test.ts:97`; ordering/LIMIT/OFFSET is SQL | T8 not run (Docker) |
| AC-34 | previous-period figures | S5 | met | `agent-stats-helpers.test.ts:361,377` | — |
| AC-35, AC-36, AC-37 | 422 on bad/missing `from`/`to`, bad range, bad `page` | S7, C3 | met | `agent-stats-routes.test.ts:47-103` (describe blocks AC-35/36/37); `periodIssue` `agent-stats-helpers.test.ts:488,496` | — |
| AC-38 | 404 for unknown/other-workspace agent | S7 | met | `agent-stats-routes.test.ts:111`; `agent-stats-service.test.ts:89`; workspace scoping in every query (27 `workspaceId` refs in `repository.ts`) | cross-workspace case is T8 (unrun) |
| AC-39 | period, previous period, `as_of` in every response | S1, S7 | met | `agent-stats-contracts.test.ts:84`; `agent-stats-routes.test.ts:133-166`; `agent-stats-service.test.ts:77` | — |
| AC-40 | no review run / no outbound call | S7, C4 | not-verifiable | static only: `rg "\.insert\(|\.update\(|\.delete\(|fetch\(|executeRuns|llm"` over `modules/agent-stats` and `skills/stats-service.ts` → no hits | T8 (`MockLLMProvider.calls`, fetch spy) not run (Docker) |
| AC-41, AC-42, AC-43 | GET only; one read per in-flight period; no timer | S11 | met | `client/src/lib/hooks/agent-stats.test.tsx:33,62,72`; `AgentPerformanceView.test.tsx:95` | — |
| AC-44 .. AC-49 | period control, presets, custom range, disabled Apply + reason | S9, S12 | met | `lib/agent-stats/period.test.ts`; `components/agent-stats/PeriodControl/PeriodControl.test.tsx:12,31` | — |
| AC-50, AC-51, AC-52, AC-53 | period written to URL, read back, fallback, notice | S9, S11 | met | `lib/agent-stats/usePeriodUrl.test.tsx`; `period.test.ts`. Interpretation noted: `range` without `from`/`to` is treated as invalid (reports W6) — AC-52 and AC-53 are not contradicted | — |
| AC-54, AC-55, AC-57 | period named in labels; resolved range text; "Updated HH:MM" | S12, S13, S16 | met | `PeriodControl.test.tsx:12`; `UpdatedStatus.test.tsx:11`; `AgentPerformanceView.test.tsx:95` | — |
| AC-56 | Refresh re-reads, re-resolving presets | S4, S11, S16 | met | `usePeriodUrl.test.tsx`; `AppShell.test.tsx` (Refresh button) | live Refresh flow on the agent page (no `page.tsx` test) — see manual note in plan *Risks* |
| AC-98, AC-99 | sidebar item "Agent Performance", active state | S4 | met | `components/app-shell/AppShell.test.tsx:64` ; `helpers.test.ts` | — |
| AC-188 | `g` then `m` opens the screen | S4 | met | `AppShell.test.tsx` (AC-188 case) | — |
| AC-100, AC-101, AC-102, AC-103 | scope note; runs card; sparkline; in-progress line | S12, S13, S16 | met | `components/agent-stats/RunsKpiCard/RunsKpiCard.test.tsx:11`; `AgentPerformanceView.test.tsx:84` | — |
| AC-104, AC-190 | Total cost with cost label; "cost unknown for n runs" | S13 | met | `lib/agent-stats/format.test.ts`; `agent-performance/_components/KpiCards/KpiCards.test.tsx:35,39` | — |
| AC-106, AC-107, AC-108, AC-109 | accept card, small sample, Most-active, null Most-active | S12, S13 | met | `AcceptKpiCard.test.tsx:11`; `KpiCards.test.tsx` | — |
| AC-110 .. AC-120, AC-191 | table columns, cells, tooltips, View link, Deleted row, cost label header | S14 | met | `agent-performance/_components/AgentsTable/AgentsTable.test.tsx:20,29,49,58` | — |
| AC-121 .. AC-126 | default sort and ordering rules | S14 | met | `AgentsTable/helpers.test.ts`; `AgentsTable.test.tsx` | — |
| AC-127 | ellipsis + full name on hover/focus/accessible name | S12 | met | `components/agent-stats/TruncatedName/TruncatedName.test.tsx` | — |
| AC-128, AC-129, AC-130, AC-131 | row expansion, sparkline, caption, 0/1-run text | S14 | met | `AgentsTable.test.tsx:80-97` | — |
| AC-132 .. AC-136, AC-192 | breakdown cards, Other, largest remainder, `< $0.01`, empty text, heading label | S12, S15 | met | `ShareDonut.test.tsx:9`; `lib/agent-stats/breakdown.test.ts`; `CostBreakdown/CostBreakdown.test.tsx` | — |
| AC-138 .. AC-142 | cost change, accept arrows, Avg cost change | S9, S12, S14 | met | `CostDelta.test.tsx`; `lib/agent-stats/accept.test.ts`; `AgentsTable.test.tsx:30` | — |
| AC-143 | "Stats" tab between Evals and CI, `?tab=stats` | S19 | met | `agents/[id]/constants.test.ts`; `AgentEditor.test.tsx` | — |
| AC-144 .. AC-155, AC-196 | Stats tab cards, skills panel, severity bars, category ring, empty text, unknown-cost line | S18 | met | `agents/[id]/_components/AgentEditor/_components/StatsTab/StatsTab.test.tsx:146,172` (+ AC-tagged cases 144-154) | — |
| AC-156 .. AC-163, AC-193, AC-194 | Run history columns, PR link, tokens, View trace, null PR, paging, page error, cost header, "—" cost | S17 | met | `StatsTab/_components/RunHistory/RunHistory.test.tsx:76` (+ AC-tagged cases); View-trace column header is icon-less with `aria-label` (`RunHistory.tsx:101`) — column present, per-row link text "View trace" (`:55`) | — |
| AC-164 | switching agent keeps tab and period | S21 | met | `agents/[id]/helpers.test.ts:5` | `page.tsx` has no test (plan *Not found*) |
| AC-165 .. AC-169, AC-195 | agent-card stats line, small sample, no runs, loading, failure, cost label | S20 | met | `agents/_components/AgentCard/AgentCard.test.tsx` (AC-165..169, AC-195 tags) | — |
| AC-170 .. AC-182 | skeletons, error states, 422, refresh banner, empty dashboards, Stats empty states, 404 callback | S16, S18 | met | `AgentPerformanceView.test.tsx:84-120` (AC-170..179); `StatsTab.test.tsx` (AC-172..182) | — |
| AC-183, AC-184 | seed adds demo runs; no second copy | S3 | not-verifiable | code: `server/src/db/seed-agent-stats.ts`, call only in CLI block `server/src/db/seed.ts:732`; test `server/test/seed-agent-stats.it.test.ts:71` | T3 not run (Docker) |
| AC-185 | existing e2e flows pass unchanged | S3 handoff | not-verifiable | no `e2e/` file changed (`git status`) ; seed excluded from `seed()` | `./scripts/e2e.sh` not run |
| AC-186, AC-187 | e2e flows for dashboard → Stats and empty custom period | Out of scope (test-writer) | not-verifiable | plan *Out of scope* names both; flow files not yet written (handoff) | `e2e/specs/*.flow.json` by `test-writer`, then `./scripts/e2e.sh` |
| AC-189 | one cost info text from every cost label | S10, S12 | met | `CostLabel.test.tsx`; catalog `agentPerformance.json` `cost.info` (line 22) matches the AC's intent | — |

### Agent spec — edge cases
| ID | Item (shortened) | Source | Verdict | Evidence | Missing |
|---|---|---|---|---|---|
| EC-1, EC-2, EC-3, EC-4, EC-12, EC-13, EC-15, EC-33 | Deleted row; Unknown model; null vs $0 cost; 0-run agent; $0 total; top 5 + Other; separators; `< $0.01` | S5, S9, S12-S15 | met | `agent-stats-helpers.test.ts:160,278`; `format.test.ts`; `breakdown.test.ts`; `CostBreakdown.test.tsx`; `AgentsTable.test.tsx` | — |
| EC-5, EC-6, EC-7, EC-8, EC-9, EC-18, EC-20, EC-25 | three empty dashboards; in-progress; Updated/Refresh; no timer; invalid range; GET-only; failed read; fixed preset times | S9, S11, S16 | met | `AgentPerformanceView.test.tsx:84-120`; `usePeriodUrl.test.tsx`; `agent-stats.test.tsx:72`; `period.test.ts` | — |
| EC-10, EC-11, EC-14, EC-16, EC-17, EC-24, EC-27, EC-31, EC-32, EC-48 | Most-active tie; null Most-active; long names; rename; model change; boundary; pending; bucket sizes; Last run; 0 decided | S5, S9, S12, S14 | met | `agent-stats-helpers.test.ts:35,135,147,173,190,239,257,323`; `TruncatedName.test.tsx`; `AgentsTable.test.tsx:49` | — |
| EC-19, EC-22, EC-23, EC-28, EC-29, EC-30 | restart; run-less reviews; re-triage; one consistent read; multi-agent group; deleted run | S6, S8 | not-verifiable | SQL-only behaviour; snapshot transaction present (`agent-stats/repository.ts:26,39,127,176`) | T8 not run (Docker) |
| EC-21 | unknown agent → 404 + existing error state | S7, S18, S21 | met | `agent-stats-routes.test.ts:111`; `StatsTab.test.tsx` (AC-182 callback) | — |
| EC-26 | seeding must not change PR #482 / existing flow values | S3, C12 | not-verifiable | seed call only in CLI block (`seed.ts:732`); no rows on #482-#484 asserted in `seed-agent-stats.it.test.ts` | T3 + `./scripts/e2e.sh` not run |
| EC-42, EC-43, EC-44, EC-45 | deleted PR; deleted skill; pre-tracking runs; failed run 0 tokens | S5, S17, S18 | met | client: `RunHistory.test.tsx` (AC-161/159), `StatsTab.test.tsx` (AC-149/151); server `agent-stats-helpers.test.ts:457` | SQL side (LEFT JOIN / null PR) in T8, unrun |
| EC-46, EC-47 | agent switch keeps tab+period; 200-row cap | S14, S21 | met | `agents/[id]/helpers.test.ts:5`; `AgentsTable/helpers.test.ts:46`, `AgentsTable.test.tsx:102` | — |

### Agent spec — NFR
| ID | Item (shortened) | Source | Verdict | Evidence | Missing |
|---|---|---|---|---|---|
| NFR-1, NFR-2 | p95 ≤ 500 ms (dashboard; Stats; Run history page) | S8 | not-verifiable | `server/test/agent-stats-perf.it.test.ts` + `helpers/stats-dataset.ts` written; indexes in `0022_perfect_kylun.sql` | T9 not run (Docker/CI) |
| NFR-3 | skeleton ≤ 100 ms; sort/expand ≤ 100 ms | manual-only (state file) | not-verifiable | waived in `.impl.md` | live browser timing |
| NFR-5 | 0 LLM calls, 0 reviews, 0 outbound per action | S7, S8 | not-verifiable | static: no writes/fetch in module; client GET-only `agent-stats.test.tsx:33` | T8 assertion unrun |
| NFR-6 | limits (366/367 days, 20 per page, 5 runs) | S9 | met | `period.test.ts`; `agent-stats-contracts.test.ts:122,135`; `RunHistory.test.tsx` | — |
| NFR-7 | up to 200 rows + "Showing 200 of n" | S14 | met | `AgentsTable/helpers.test.ts:46`; `AgentsTable.test.tsx:102` | — |
| NFR-8 | one consistent read; deterministic order | S5, S6, C5 | not-verifiable | determinism `agent-stats-helpers.test.ts:299`; snapshot transaction `repository.ts:26,39,127,176` | T8 "two reads equal" unrun |
| NFR-10 | untrusted inputs handled | S7 | met | 422 cases `agent-stats-routes.test.ts:47-125`; bound ids `repository.ts:113`; no `sql.raw` | — |
| NFR-11, NFR-12, NFR-13, NFR-14 | keyboard, no colour-only, chart text, polite live region | S12-S14 | met | `AgentsTable.test.tsx` (th aria-sort button), `AcceptKpiCard.test.tsx:11`, `RunsKpiCard.test.tsx:11`, `ShareDonut.test.tsx:9`, `UpdatedStatus.test.tsx:11,18` | — |
| NFR-15 | 320 px, 200 % zoom, contrast, targets | manual-only (state file) | not-verifiable | waived in `.impl.md` | live visual check |
| NFR-16 | custom range inline, no popup | S12 | met | `PeriodControl.test.tsx:36` (no `role=dialog`) | — |
| NFR-17 | one log line per request, no PR/finding text | S7 | met | `agent-stats-service.test.ts:53` | — |
| NFR-19 | other contracts and `/runs/estimates` unchanged | S1 | met | `agent-stats-contracts.test.ts:142`; no change under `modules/reviews`, `e2e/` (git status) | `/runs/estimates` parse in T8 unrun |
| NFR-20 | strings from catalog; locale formatting | S10 | met | `components/agent-stats/messages.test.ts`; `useStatsFormat.test.tsx:15` | — |

### Skill spec — acceptance criteria
| ID | Item (shortened) | Source | Verdict | Evidence | Missing |
|---|---|---|---|---|---|
| skill AC-1 | Used by = linked agents A→Z, `agent_count` | S23 | met | `server/test/skill-stats.test.ts` (T29 case AC-1) | — |
| skill AC-2, AC-3 | pull base, `pull_runs(_total)`, `runs_without_skill_data` | S23, C8 | met | `skill-stats.test.ts` (T29 cases AC-2/AC-3, EC-1/4/5/6/7/20/27) | — |
| skill AC-4, AC-5 | skill findings and categories; accepted/dismissed/pending/rate | S23, S24, C22 | not-verifiable | JS part `skill-stats.test.ts` (T29); join + FILTER in `skills/repository.ts:362-391` is SQL | `skill-stats.it.test.ts` (T32) not run (Docker) |
| skill AC-6, AC-7 | `skill_runs`; `last_used_at` any time | S23 | met | `skill-stats.test.ts` (T29 cases AC-6/AC-7) | — |
| skill AC-8 | `period` + `as_of`; default 30 × 24 h | S25 | met | `skill-stats-service.test.ts` (T31) | — |
| skill AC-9 | 422 on one-of-pair or bad period | S25, C3 | met | `skill-stats-routes.test.ts` (T30); `skills/routes.ts:85-102` | — |
| skill AC-10 | 404 unknown/other-workspace skill | S25 | met | `skill-stats-service.test.ts` (T31 `NotFoundError`) | cross-workspace case is T32 (unrun) |
| skill AC-11 | `GET /skills` stats over the card period, one facts call | S25 | met | `skill-stats-service.test.ts` (T31 `forList`) | — |
| skill AC-12 | no review run / no outbound call | S25, C4 | not-verifiable | static: no writes/fetch in `skills/stats-service.ts` | T32 assertion unrun (Docker) |
| skill AC-13, AC-14 | skill and agent figures agree for a fixed period | S26, C22 | not-verifiable | shared rules in `_shared/stats-rules.ts`; FILTER expressions copied (`skills/repository.ts:370` comment) | T32 not run (Docker) |
| skill AC-15, AC-16, AC-17 | period control and labels; period kept on rail/tab switch; GET-only | S27, S28 | met | `StatsTab.test.tsx` (skills); `SkillsView/helpers.test.ts`; `lib/hooks/skills.test.tsx:33,53,63,73,93` | live Refresh/rail check (plan manual list) |
| skill AC-18 .. AC-23 | Used by card, Pull frequency, hint, Accept rate, Findings | S28 | met | `SkillKpiCards/SkillKpiCards.test.tsx`; skills `StatsTab.test.tsx` | — |
| skill AC-24, AC-25, AC-26 | agents panel + Open links; not-linked text; category panel | S28 | met | `_components/AgentsUsingPanel/AgentsUsingPanel.test.tsx`; skills `StatsTab.test.tsx` | — |
| skill AC-27, AC-28 | attribution note; disabled hint | S28 | met | skills `StatsTab.test.tsx` (AC-27/AC-28 cases) | — |
| skill AC-29 .. AC-34 | skeleton; error/422; 404; refresh banner; no-usage; no-runs-in-period | S28 | met | skills `StatsTab.test.tsx`; `helpers.test.ts` | — |
| skill AC-35 .. AC-39 | rail-card footer, small sample, nulls, hidden, breakdown hover | S29 | met | `skills/_components/SkillCard/SkillCard.test.tsx:120` (+ AC-tagged cases) | — |
| skill AC-40 | `08-skills` e2e passes with catalog-case labels | S28, C26 | not-verifiable | no `text-transform` in skill StatsTab (rg); computed-style assert `StatsTab.test.tsx:107-112`; `e2e/specs/08-skills.flow.json` unchanged | `./scripts/e2e.sh` not run |

### Skill spec — edge cases and NFR
| ID | Item (shortened) | Source | Verdict | Evidence | Missing |
|---|---|---|---|---|---|
| skill EC-1, EC-2, EC-3, EC-4, EC-5, EC-6, EC-7, EC-8, EC-11, EC-14, EC-20, EC-24, EC-25, EC-26 | link mid-period; unlinked/deleted agent; disabled; empty list; no data; boundary; many agents; null rate | S23 | met | `skill-stats.test.ts` (T29); client `StatsTab.test.tsx` | — |
| skill EC-9, EC-10, EC-12, EC-13, EC-27, EC-28 | CI/running runs excluded; run-less review; multi-agent; duplicate findings; malformed list; demo unlinked skill | S24, S3 | not-verifiable | JS: `isRecordedSkillList` `agent-stats-helpers.test.ts:501`; SQL source/review filters unrun | T32, T3 not run (Docker) |
| skill EC-15, EC-16, EC-17, EC-19, EC-21, EC-22, EC-23 | 404 state; period kept; no timer; separators; truncation; top 5 + Other | S25, S27, S28 | met | `skill-stats-service.test.ts`; `SkillsView/helpers.test.ts`; `skills.test.tsx:63`; skills `StatsTab.test.tsx`, `AgentsUsingPanel.test.tsx` | — |
| skill EC-18 | card 30 d vs tab 30 d can differ; Refresh realigns | S28 | not-verifiable | by design; Refresh path unit-tested in `usePeriodUrl.test.tsx` | live check (plan manual list) |
| skill NFR-1, NFR-2 | p95 ≤ 500 ms tab and `GET /skills` | S26 | not-verifiable | `skill-stats-perf.it.test.ts` written | T33 not run (Docker/CI) |
| skill NFR-3 | skeleton ≤ 100 ms | manual-only | not-verifiable | waived in `.impl.md` | live browser timing |
| skill NFR-4 | 0 model calls / reviews / outbound | S26 | not-verifiable | static no-write grep | T32 not run |
| skill NFR-5 | limits; no per-card request | S29 | met | `SkillCard.test.tsx:120` | — |
| skill NFR-6 | one consistent read; invariants | S23, S24, C5 | not-verifiable | invariants in T29; snapshot `skills/repository.ts:87,401` | T32 not run |
| skill NFR-7 | untrusted input | S25 | met | `skill-stats-routes.test.ts` (rejected before store call); bound params | — |
| skill NFR-8 | a11y (agent NFR-11..14) | S28 | met | skills `StatsTab.test.tsx`; `AgentsUsingPanel.test.tsx` | — |
| skill NFR-9 | 320 px / zoom / contrast / target size | manual-only | not-verifiable | waived in `.impl.md` | live visual check |
| skill NFR-10 | one log line, no finding text | S25 | met | `skill-stats-service.test.ts` (T31 log case); `stats-service.ts:31` | — |
| skill NFR-11 | old keys kept; `findings_30d` deprecated alias; 3 identical copies | S22, C25 | met | `skill-stats-contracts.test.ts`; `knowledge.ts:503-504` (`@deprecated`); `check-shared-sync.sh` exit 0 (reused); parity test in server suite (reused, exit 0) | — |
| skill NFR-12 | strings from catalog incl. footer | S27, S29 | met | `SkillCard.test.tsx:120`; `client/messages/en/skills.json` | — |

### Plan steps (done-claims and `files`)
| ID | Item | Source | Verdict | Evidence | Missing |
|---|---|---|---|---|---|
| S1, S2 | contracts both copies; two-index migration | plan | met | `0022_perfect_kylun.sql` has exactly the two `CREATE INDEX`; `check-shared-sync.sh` exit 0 (reused); `agent-stats-contracts.test.ts` | — |
| S3 | demo seed, CLI-only call, T3 | plan | met | files exist; `git grep seedAgentStatsDemo server/src` → import + `seed.ts:732` only | T3 unrun (see AC-183) |
| S4 | nav item, `g m`, Refresh, `onRefresh` | plan | met | `nav.ts`, `Topbar.tsx`, `AppShell.tsx`, `shell.json` modified; `AppShell.test.tsx` | — |
| S5, S6, S7 | pure helpers + shared rules; repository; service/routes/container | plan | met | all named files exist; `modules/index.ts:22,58`; `container.ts:88,432-439`; no hits for `jsonb_array_elements`/whole-trace select | — |
| S8 | `stats-dataset.ts`, T8, T9 written | plan | met | files exist | not run by design |
| S9, S10, S11, S12 | pure helpers, catalog, hooks/URL state, shared components | plan | met | all named files exist under `lib/agent-stats`, `lib/hooks/agent-stats.ts`, `components/agent-stats/*`; T10-T16, T27 present | — |
| S13, S14, S15 | KPI cards, table, breakdown | plan | met | all named files exist incl. sub-component folders | — |
| S16 | route + container with `helpers.test.ts` | plan | partial | `page.tsx`, `AgentPerformanceView.tsx`, `helpers.ts`, `styles.ts`, `index.ts`, `.test.tsx` exist | `AgentPerformanceView/helpers.test.ts` listed in S16 `files` is absent (reported as a deviation; `dashboardState` covered via `AgentPerformanceView.test.tsx`) |
| S17, S18, S19, S20, S21 | Run history, Stats tab, tab wiring, card line, page integration | plan | met | named files exist; `agents/[id]/helpers.ts` + `.test.ts`; `AgentsListView.tsx`, `page.tsx` modified | — |
| S22 | `SkillStats` in three copies | plan | met | `mcp-server/src/vendor/shared/contracts/knowledge.ts` modified; shared-sync exit 0 (reused) | — |
| S23, S24, S25 | skill aggregation, facts read, service/route | plan | met | `skills/{types,stats-service}.ts`, `helpers.ts`, `repository.ts`, `service.ts`, `routes.ts`; `rg "agent-stats" server/src/modules/skills` → only a comment at `repository.ts:370` | — |
| S26 | skill it/perf tests written | plan | met | `skill-stats.it.test.ts`, `skill-stats-perf.it.test.ts` exist | not run by design |
| S27, S28, S29 | hook + catalog; rebuilt tab + wiring; rail footer | plan | met | named files exist; `skillHref` `SkillsView/helpers.ts:31`; `StatsFooter` folder | — |

### Test plan rows
| ID | Item | Verdict | Evidence | Missing |
|---|---|---|---|---|
| T1, T5, T6, T7 | server contract/helpers/routes/service tests | met | files exist; suite green (reused @ fingerprint) | — |
| T3, T8, T9, T32, T33 | `*.it.test.ts` | not-verifiable | files exist (`seed-agent-stats`, `agent-stats`, `agent-stats-perf`, `skill-stats`, `skill-stats-perf`) | Docker/CI |
| T4, T10-T16, T17-T25, T27, T34-T37 | client tests | met | files exist; client vitest green (reused @ fingerprint) | T21/T35 sub-component tests only partly separate files (covered inside container tests) |
| T28, T29, T30, T31 | skill contract/helpers/routes/service tests | met | files exist; server unit suite green (reused) | — |

### Constraints
| ID | Item (shortened) | Source | Verdict | Evidence | Missing |
|---|---|---|---|---|---|
| C1 | onion layering, no sideways imports | onion-architecture; dep-cruiser | met | `arch:check` exit 0 (reused); sideways-import `rg` empty | — |
| C2 | memoized getters + `agentStatsStore` override | onion-architecture container; server INSIGHTS | met | `container.ts:88,115-116,432-439` | — |
| C3 | Zod params/querystring/response, 422 before handler | server/AGENTS.md (read) | met | `agent-stats/routes.ts`, `skills/routes.ts:85-102,179` | — |
| C4 | read-only, no outbound | specs | met | static grep empty; client GET-only tests | runtime proof is T8/T32 (see AC-40) |
| C5 | one repeatable-read read-only transaction per response | specs | met | `READ_ONLY_SNAPSHOT` used at `agent-stats/repository.ts:39,127,176`, `skills/repository.ts:401` | — |
| C6 | no SQL `sum/avg` on cost; JS fold | server INSIGHTS; specs | met | `rg` over repositories: none on cost; `helpers.ts` `foldCosts` | — |
| C7 | bound SQL; workspace filters; `source='local'` | specs (security skill not read) | met | `repository.ts` 27 + 23 workspace refs; `REVIEW_RUN_SOURCE` at `agent-stats/repository.ts:59,90,143,210,252,271`, `skills/repository.ts:362,391`; no `sql.raw` | — |
| C8 | path-only trace read; `isRecordedSkillList`; text id compare | specs | met | `repository.ts:83` / `skills/repository.ts:355` select `->'config'->'skills'` only; `:113` text compare, bound | — |
| C9 | contracts snake_case, byte-identical copies | root AGENTS.md | met | `check-shared-sync.sh` exit 0 (reused) | — |
| C10 | generated migration only, not run | root AGENTS.md | met | `0022_perfect_kylun.sql` + snapshot + journal; reports state `db:migrate` not run | — |
| C11 | `.it.test.ts` naming; fakes implement port | server/AGENTS.md (read) | met | file names; `test/helpers/agent-stats-fakes.ts` | — |
| C12 | idempotent seed, `RunTrace`-typed, linked skills only | server INSIGHTS | not-verifiable | code present | T3 unrun (Docker) |
| C13 | client layering, folder-per-component | client/AGENTS.md (read); eslint | met | client lint exit 0 (reused); largest new component 139 lines | — |
| C14 | fetch only via hooks; no interval; 4xx no retry | client/AGENTS.md (read) | met | `hooks/agent-stats.ts:22-53`, `hooks/skills.ts:31,121`; no `refetchInterval` | — |
| C15 | period from URL, no `new Date()` in render for keys | specs | met | `new Date()` only in `useState` initializers (`AgentsListView.tsx:27`, `page.tsx:51`, `PeriodControl.tsx:38`) | — |
| C16 | strings from catalog; no `<letter` | client/AGENTS.md (read) | met | `messages.test.ts` | — |
| C17 | untrusted text as plain text; ids in hrefs | specs | met | no `dangerouslySetInnerHTML` (rg empty); `agentHref`/`skillHref` take ids | — |
| C18 | client test conventions | react-testing-library (not read) | not-verifiable | source not read | read `.claude/skills/react-testing-library/SKILL.md` |
| C19 | a11y: aria-sort buttons, aria-expanded, tooltips, live region | specs | met | see NFR-11..14 rows | — |
| C20 | `TABS` and `VALID_TABS` change together | client INSIGHTS | met | `constants.test.ts`; both files modified | — |
| C21 | rendering hygiene (keys, ≤200 lines) | react-best-practices (not read) | not-verifiable | source not read (observed largest new component 139 lines) | read `.claude/skills/react-best-practices/SKILL.md` |
| C22 | one rule set per layer | specs | met | `_shared/stats-rules.ts`; both repositories import it; T29/T5 | FILTER parity pinned by unrun T32 |
| C23 | amount format | agent spec Terms | met | `format.test.ts` | — |
| C24 | skills-module layering | onion-architecture | met | `arch:check` exit 0; no `agent-stats` import | — |
| C25 | `SkillStats` compatibility | skill spec | met | `knowledge.ts:503-504`; `skill-stats-contracts.test.ts` | — |
| C26 | e2e label stability | skill spec AC-40 | met | no `text-transform` in skill tab (`rg`); `StatsTab.test.tsx:107-112` | e2e run itself (skill AC-40) |

### Out-of-scope guards
| ID | Item | Verdict | Evidence |
|---|---|---|---|
| OOS-1 | `reviewer-core/`, `agent-runner/`, `e2e/`, `client/src/lib/format.ts`, `GET /runs/estimates`, `modules/reviews` untouched | met | `git status --porcelain e2e reviewer-core agent-runner` empty; `git diff --stat` over those paths and `format.ts` empty |
| OOS-2 | no commits, no migration run, no PR (brief) | met | working tree changes only; reports state `db:migrate` not run |
| OOS-3 | AC-186/187 flow files not written | met | no new `e2e/specs/*.flow.json` |

## Skill sources read
- `.claude/skills/onion-architecture/SKILL.md`, `frontend-architecture/SKILL.md`, `ears-requirements/SKILL.md` — preloaded; rows C1, C2, C13, C24 and spec-row reading.
- `server/AGENTS.md` (Non-default conventions) — C3, C11. `client/AGENTS.md` (Non-default conventions) — C13, C14, C16. Root `AGENTS.md` — C9, C10.
- Not read (source skill not preloaded and not opened): `react-testing-library` → C18 `not-verifiable`; `react-best-practices` → C21 `not-verifiable`. Rows C4, C5, C7, C8, C15, C17, C19 were judged on their spec/INSIGHTS/AGENTS sources and the plan's concrete rule text; the `security`, `fastify-best-practices`, `zod`, `breaking-change`, `response-schema`, `deprecation-policy`, `drizzle-orm-patterns` skill files were not read.

## Checks re-run
Fingerprint of the current tree equals the supplied one (`118f2e6d0da678139cbb981a4e7456acd23154ac23f184bb9ed766017eaff2d5`), so the supplied results are reused, not re-run.

| Command | Report exit | Actual exit |
|---|---|---|
| `pnpm -C server lint` | 0 | reused @ 118f2e6d0da678139cbb981a4e7456acd23154ac23f184bb9ed766017eaff2d5 |
| `pnpm -C server typecheck` | 0 | reused @ same |
| `pnpm -C server arch:check` | 0 | reused @ same |
| `pnpm -C server exec vitest run --reporter=dot --exclude '**/*.it.test.ts'` | 0 | reused @ same |
| `pnpm -C client lint` / `typecheck` / `vitest` | 0 | reused @ same |
| `pnpm -C mcp-server typecheck` / `test` | 0 | reused @ same |
| `npm --prefix e2e run typecheck` | 0 | reused @ same |
| `./scripts/check-shared-sync.sh` | 0 | reused @ same |
| `*.it.test.ts`, `./scripts/e2e.sh` | not run | not run (Docker/CI) — not forbidden-bypassed |

## Report discrepancies
- None: the implementation reports (`docs/plans/agent-performance-dashboard.reports.md`) and the supplied check table agree; the one `S16` file gap is stated in the W7 report ("`AgentPerformanceView/helpers.test.ts` not written") and is carried as the `partial` S16 row.

## Unplanned changes
Files not named by any step and not (clearly) listed under the reports' Deviations:
- `client/src/app/agents/[id]/_components/AgentEditor/_components/StatsTab/testing.tsx` — test helper, not in S18 `files`, not in W8 Deviations.
- `client/src/app/skills/_components/SkillsView/_components/SkillEditor/_components/StatsTab/testing.tsx` — test helper, not in S28 `files`, not in W9 Deviations.
- `client/src/components/agent-stats/renderWithMessages.tsx` — mentioned only as a "Note" in W6, not in S12 `files`.
- `client/src/components/agent-stats/PeriodControl/helpers.ts`, `client/src/components/agent-stats/ShareDonut/helpers.ts` — not in S12 `files`.
- `client/src/app/skills/_components/SkillCard/styles.ts` — modified; S29 names `SkillCard.tsx`, `helpers.ts`, `SkillCard.test.tsx` only.
- `client/src/app/skills/_components/SkillsView/_components/SkillEditor/_components/StatsTab/_components/FindingsByCategoryPanel/` and `…/SkillKpiCards/_components/SkillKpiCard/` — sub-components not named in S28 (the plan names `SkillKpiCards/` with four cards, `AgentsUsingPanel/`, `SkillUsageEmpty/`).

Covered by reported Deviations (not unplanned): `client/src/app/agent-performance/testing.ts` (W7), `server/INSIGHTS.md` (W5), `client/INSIGHTS.md` (W8, W9), `client/src/lib/agent-stats/useStatsFormat.test.tsx` (W6). Workflow files `docs/plans/agent-performance-dashboard.{brief,impl,reports}.md` are run artefacts.

## Not verifiable
- AC-1, AC-2, AC-3, AC-11, AC-23, AC-28, AC-30, AC-31, AC-33, EC-19, EC-22, EC-23, EC-28, EC-29, EC-30, NFR-8, skill AC-4, AC-5, AC-13, AC-14, skill EC-9, EC-10, EC-12, EC-13, EC-27, EC-28, skill NFR-6, C12 — SQL-decided behaviour; verified by `server/test/agent-stats.it.test.ts`, `seed-agent-stats.it.test.ts`, `skill-stats.it.test.ts` under Docker (CI `server-integration.yml`).
- AC-40, NFR-5, skill AC-12, skill NFR-4 — runtime "no LLM/outbound call" assertions are in unrun `*.it.test.ts`; static grep is clean.
- AC-183, AC-184, EC-26 — T3 (Docker).
- NFR-1, NFR-2, skill NFR-1, NFR-2 — T9, T33 (Docker/CI, p95 budgets).
- AC-185, skill AC-40 — `./scripts/e2e.sh`.
- AC-186, AC-187 — flow files to be written by `test-writer`, then `./scripts/e2e.sh`.
- NFR-3, NFR-15, skill NFR-3, NFR-9 — manual-only (state file *Waived / manual-only*): live browser timing and visual checks.
- skill EC-18 — card/tab period difference; live Refresh check.
- C18, C21 — rule source skills (`react-testing-library`, `react-best-practices`) not read.

## Not found / gaps
- S16 — `client/src/app/agent-performance/_components/AgentPerformanceView/helpers.test.ts` is missing (partial row).
- `client/src/app/agents/[id]/page.tsx` has no test file; AC-56 (agent page Refresh), AC-164 and EC-46 rest on `helpers.test.ts` and `StatsTab.test.tsx` plus the plan's manual live check.
- No `unmet` rows: every active agent AC/EC/NFR and skill AC/EC/NFR is covered by a step `covers:` or named in Out of scope.
