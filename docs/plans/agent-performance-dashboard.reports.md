# Implementation reports — agent-performance-dashboard

## Wave 1 — W1 (S1) contracts — done
Replaced reserved AgentPerf/AgentPerfRow/AgentStats; added StatsPeriod, LastRun, RunsTrendPoint, MostActiveAgent, AgentPerfSummary, CostByAgentEntry, CostByModelEntry, SeverityBucketCount, FindingCategoryCount, AgentSkillUsage, AgentSkillsUsage, RunHistoryStatus, AgentRunHistoryItem, AgentRunHistoryPage in productionize.ts / observability.ts (server + client copies). T1: server/test/agent-stats-contracts.test.ts. Deviations: none. Note: AgentStats.findings_by_severity is now an array of buckets; PerfCostSegment kept but unused. Implementer read only the opening sections of its skills.

## Wave 1 — W2 (S2) indexes — done
reviews_run_id_idx, findings_review_id_idx in schema/reviews.ts; generated migration 0022_perfect_kylun.sql (+ snapshot, journal). Two CREATE INDEX statements only. db:migrate not run. Deviations: none.

## Wave 1 — W3 (S3) demo seed — done
server/src/db/seed-agent-stats.ts (AGENT_STATS_DEMO, seedAgentStatsDemo), CLI-block call in seed.ts, T3 server/test/seed-agent-stats.it.test.ts (not run: Docker). 18 runs on PR #479, figures match plan (cost 0.52, 2 unknown, 18/6/5, models 0.46/0.06). Deviations: none.

## Wave 1 — W4 (S4) shell — done
nav.ts item + `g m`, Topbar refresh label, AppShell onRefresh prop, shell.json topbar.refresh, T4 tests in AppShell.test.tsx / helpers.test.ts. Deviations: none. Note: onRefresh must be a stable callback.

## Wave 2 — W5 (S5–S8) server agent-stats — done
Created `_shared/stats-rules.ts`, `modules/agent-stats/{types,constants,helpers,repository,service,routes}.ts`; registered in `modules/index.ts`; container getter + `agentStatsStore` override. Tests: T5 (35), T6 (17), T7 (5) pass; T8/T9 (`*.it.test.ts`) and `test/helpers/stats-dataset.ts` written, not run (Docker). Deviations: one line appended to `server/INSIGHTS.md` (outside owns; harmless); `AgentStatsRaw` standalone; service takes ISO strings; residual-correction loop in cost_by_model. Reviewer spots: bucket expression `group by 1, 2`, `max(ran_at)` mapWith, `sql<unknown>` jsonb parse — first real run is CI.

## Wave 2 — W6 (S9–S12) client groundwork — done
`lib/agent-stats/*`, `lib/hooks/agent-stats.ts` (+ index export), `components/agent-stats/*` (15 components), `agentPerformance.json` catalog. T10–T16, T27 pass. Deviations: extra `useStatsFormat` test; formatters return structured shapes (words added in hook); `localDateText` exported; HoverHint render-prop child; `parsePeriodParams` treats range without from/to as invalid (own reading of AC-53); extra catalog keys. Note: any test provider mounting these must include `agentPerformance` (use `renderWithMessages.tsx`).

## Wave 3 — W7 (S13–S16) dashboard screen — done
`client/src/app/agent-performance/**` (page, KpiCards, AgentsTable, CostBreakdown, AgentPerformanceView; extra `testing.ts`). T17–T20 pass (31 tests). Deviations: `AgentPerformanceView/helpers.test.ts` not written (dashboardState covered via T17); AcceptCell imports LEVEL_COLOR from a deep path; per-agent icon squares not rendered (no data); CostLabel text longer than design. Refresh `onRefresh` is stable.

## Wave 3 — W8 (S17–S21) agent page, Stats tab, cards — done
RunHistory, StatsTab (+KPI, MostUsedSkills, FindingsBySeverity/Category), TABS/VALID_TABS, StatsLine on AgentCard, `agents/[id]/helpers.ts` + page.tsx wiring. T21–T25 pass. Deviations: test-only `timeZone` prop; StatsLine does not use AcceptText; "View trace" header empty with aria-label; one INSIGHTS line in client/INSIGHTS.md (outside owns). page.tsx has no test (live check needed). Most-pulled memory / Source column not built (non-goals).

## Wave 3 — W9 (S22–S29) skill Stats tab — done
SkillStats in three knowledge.ts copies (identical), stats-rules `computeSkillStats`, skills repository/stats-service/routes, `useSkillStats(id, period)`, skills.json, rebuilt StatsTab, SkillCard StatsFooter. T28–T37 written; T32/T33 (`*.it.test.ts`) not run (Docker). Deviations: StatsFooter colours "74% accept" together via local colour map (LEVEL_COLOR not exported); `usePeriodUrl enabled` also requires selectedId; extra client/INSIGHTS.md line (outside owns). Catalog string for one run reads "1 run without skill data are not included" (plan text, ICU plural). conventions.md:238 not edited (doc-writer's).
