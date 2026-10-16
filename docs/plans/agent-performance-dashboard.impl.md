# impl: Agent Performance dashboard + agent Stats tab + skill Stats tab
Plan: docs/plans/agent-performance-dashboard.md (multi-agent, waves: 1 2 3)   Spec: 2026-10-15-agent-performance-dashboard, 2026-10-15-skill-stats-tab
Phase: PR gate   Verify round: 1/2 (verified with gaps; 32 rows not verifiable here: Docker/CI/manual)   Review round: 3/3
Extra instructions: none
Brief: docs/plans/agent-performance-dashboard.brief.md

## Waived / manual-only
- waived by user: F1 (skills all-time run scan, REC16; measured by T33), F5 (all runs read into Node, REC2/T9), F6 (SkillStatsService built in routes, plan C2), F7 (SkillStats semantic break, plan C25) — kept as planned
- waived by user: H2, H4, H5 (round 3); H1/H3 fixed without a further review pass
- manual-only rows: agent NFR-3, NFR-15; skill NFR-3, NFR-9 (live browser, Phase 4)
- not-verifiable here (accepted, run in CI/manual): *.it.test.ts rows (T3,T8,T9,T32,T33), AC-185/186/187, skill AC-40, NFR-3/NFR-15, skill NFR-3/NFR-9
- not run by /run-plan: *.it.test.ts (Docker), ./scripts/e2e.sh, AC-186/187 flow files (test-writer, by hand)

## Log
- 2026-10-15 intake ok; wave 1 starting (W1 contracts, W2 indexes, W3 seed, W4 shell)

- 2026-10-15 wave 1 done (W1-W4), full checks green: server lint/typecheck/arch/unit, client lint/typecheck/test, shared-sync. fingerprint 1ae092ade1b2bf6d4bc0d4a4af76e9133d836f16b0c74894e91824a27debe8de
- 2026-10-15 wave 2 done (W5, W6), full checks green, fingerprint 6fd1b3e9f2364cd6d11fa70281d93e91c392101d10634da12a186954f45428b6
- 2026-10-15 wave 3 done (W7, W8, W9), full checks green (server lint/tc/arch/unit, client lint/tc/test, mcp-server tc/test, e2e tc, shared-sync), fingerprint 118f2e6d0da678139cbb981a4e7456acd23154ac23f184bb9ed766017eaff2d5
- 2026-10-15 verify: 115 met, 1 partial (S16 helpers.test.ts, fixed in main session), 0 unmet, 32 not-verifiable. Report: docs/plans/agent-performance-dashboard.verification.md. fingerprint a0687aa18e23d99e8cd42f9147ba33ab52111d51689d32979ecb977a12c2dbdb
- 2026-10-15 review round 1: architecture approve (0), security approve (0), code-review 9 findings; F2 fixed
- 2026-10-15 review round 1 fixes applied (F2 main session; F3 page.tsx; F4+F8 agent-stats repository/helpers/test; F9 skills helpers/stats-service). Full checks green, fingerprint 9a36dcabf32ef09f9c013622b6228bdc4645616e2b624db0600023eaf57698bb. Risk: F8 may break exact-sum asserts at agent-stats.it.test.ts:305,468 (Docker, CI only).
- 2026-10-15 review round 2 fixes applied (G1-G6). Full checks green, fingerprint 3d3b3524ef919ab9fdc6d3fa3517b5e025768514e920310d94b56ea6947541e0
- 2026-10-15 review round 3 (delta): 5 findings; H1, H3 fixed in main session; client checks green, fingerprint client-only b2a7db454f65a39d587abf917f6881d2ff2d58179893621c08997bfb7e2b483d (server unchanged since 3d3b3524...)
- 2026-10-15 hermetic e2e: run 1 8/9 (05-pr-diff "Files changed" click flaked), run 2 9/9 incl. 02, 04, 05, 08-skills -> AC-185 and skill AC-40 hold
- 2026-10-15 Phase 4 manual verification (hermetic stack, claude-in-chrome):
  - verified live: dashboard figures match the demo data (18 runs, $0.52, cost unknown for 2, 18 of 24 decided, 75%; Security 13/$0.038/6.2 s/76% 13/17; Performance 60% 5/10 small sample); agent Stats tab (13, $0.038, 6.2 s, 76%, 13 of 17 decided, secret-leakage-gate 100% of 9 of 13); skill rail footers + skill Stats tab (used by 1 agent, pull 100% 9 of 9, accept 76% 13 of 17, findings 18); agent Stats topbar Refresh re-resolves the preset period in the URL; cost tooltip opens on hover, unclipped; donut renders; period params carried to the agent page.
  - found + fixed: Cost breakdown grid minmax(300px) overflowed 320 px (MAIN 328 vs 310) -> minmax(min(300px,100%),1fr) in CostBreakdown/styles.ts; re-measured MAIN 310=310.
  - NOT verified (tool: iframe stayed blank after repeats; stopped per rule): agent Stats tab and skill Stats tab at 320 px; 200% zoom; contrast ratios; 24 px targets; focus (keyboard) tooltips; native date inputs in Chrome/Firefox/Safari; custom range; skill Refresh and rail keeps the period; skeleton-within-100 ms timing (skeleton seen, not timed).
  - env note: hermetic stack and the dev web server share client/.next; a webpack cache rename error appeared and pages hung until the stack was restarted.
- 2026-10-15 docs done (doc-writer; both specs -> implemented). /pr-self-review: PASS, verdict comment (WARNING: it.test exact-sum asserts unproven after F8; SUGGESTION: live-check gaps). Gate fingerprint f76d0ee85a1cfd00d7ecfe80906d2732d595189e5c671e26c473e93e84a9c100

## Review ledger
| F# | Source | Sev | file:line | Summary | Status | Round |
|---|---|---|---|---|---|---|
| F1 | code-review | WARNING | server/src/modules/skills/repository.ts:355 | statsFacts reads all counted runs of all time per skill read | waived by user (disputed: plan REC16 risk; T33 measures; fallback named in plan) | 1 |
| F2 | code-review | WARNING | client/src/lib/agent-stats/usePeriodUrl.ts:41 | fallback 30d anchored at mount, written to URL later | fixed (main session; fresh resolvePreset inside effect; delta re-review pending) | 1 |
| F3 | code-review | SUGGESTION | client/src/app/agents/[id]/page.tsx:50 | left-list card period resolved once per mount, not refreshed by Refresh | fixed (round 1 fix; delta re-review pending) | 1 |
| F4 | code-review | SUGGESTION | server/src/modules/agent-stats/repository.ts:53 | loads all agents to find one | fixed (round 1 fix; delta re-review pending) | 1 |
| F5 | code-review | WARNING | server/src/modules/agent-stats/repository.ts:113 | all run rows for two periods pulled into Node | waived by user (disputed: plan REC2: costs folded in JS, no SQL sums) | 1 |
| F6 | code-review | WARNING | server/src/modules/skills/routes.ts:108 | SkillStatsService built in route, not container | waived by user (disputed: plan C2: skills services built in routes.ts as today) | 1 |
| F7 | code-review | WARNING | server/src/vendor/shared/contracts/knowledge.ts:491 | SkillStats keeps old keys with new meaning | waived by user (disputed: plan C25: intentional recorded break) | 1 |
| F8 | code-review | SUGGESTION | server/src/modules/agent-stats/helpers.ts:211 | cost_by_model residual loop adjusts last entry | fixed (round 1 fix; delta re-review pending) | 1 |
| F9 | code-review | SUGGESTION | server/src/modules/skills/helpers.ts:281 | computeSkillStats re-filters runs per skill (S*R) | fixed (round 1 fix; delta re-review pending) | 1 |
| G1 | code-review r2 | SUGGESTION | server/src/modules/agent-stats/helpers.ts:244 | cost_by_model last entry could be <=0 | fixed (guard) | 2 |
| G2 | code-review r2 | WARNING | client/src/app/agents/[id]/page.tsx:50 | repeated Refresh moved card window | fixed (main) | 2 |
| G3 | code-review r2 | WARNING | client/src/app/agents/[id]/page.tsx:54 | cards blanked on Refresh (new key) | fixed (main; last figures kept) | 2 |
| G4 | code-review r2 | WARNING | client/src/lib/agent-stats/usePeriodUrl.ts:54 | stale mount-time window queried first | fixed (main; fallback now re-taken when enabled flips) | 2 |
| G5 | code-review r2 | SUGGESTION | server/src/modules/skills/helpers.ts:355 | runFindings still scanned per skill | fixed (r3 delta re-reviewed) | 2 |
| G6 | code-review r2 | SUGGESTION | server/src/modules/skills/helpers.ts:320 | index not tied to window | fixed (r3 delta re-reviewed) | 2 |
| H1 | code-review r3 | WARNING | client/src/lib/agent-stats/usePeriodUrl.ts:54 | effect wrote a second Date.now() window (extra fetch) | fixed (main; effect writes the shown window; not re-reviewed) | 3 |
| H2 | code-review r3 | SUGGESTION | client/src/app/agents/[id]/page.tsx:46 | onRefresh no-op while any agent-stats query fetches | waived by user: intended no-op while fetching | 3 |
| H3 | code-review r3 | SUGGESTION | client/src/app/agents/[id]/page.tsx:59 | ref read in render | fixed (main; state instead of ref; not re-reviewed) | 3 |
| H4 | code-review r3 | SUGGESTION | server/src/modules/skills/helpers.ts:337 | index/facts identity check is brittle | waived by user: identity guard is what G6 asked for | 3 |
| H5 | code-review r3 | SUGGESTION | server/src/modules/agent-stats/helpers.ts:253 | last model entry absorbs any gap | waived by user: plan C6 rule | 3 |
