# impl: onboarding-tour
Plan: docs/plans/onboarding-tour.md (multi-agent, waves: 1… 2 3 4 5)   Spec: 2026-10-01-onboarding-tour-facts + 2026-10-01-onboarding-tour-narrative
Phase: done — awaiting user decision (commit / PR / stop)   Verify round: 2/2 (verified)   Review round: 2/3 (exit: no CRITICAL/WARNING open)
Extra instructions: none

## Log
- 2026-10-01 intake ok: both specs approved, tree clean, plan has files/skills/done-when per step
- 2026-10-01 R-B1/R-B2 researcher launched alongside wave 1 (blocks S29 error mapping, wave 2)

- 2026-10-01 wave 1 done (W1–W5), checks green; R-B1/R-B2 answered (see reports)
- 2026-10-01 wave 2: W7, W12, W13, W14 (S36+S37) done; W6 done
- 2026-10-01 wave 3 (W8, W9, W10) done, checks green
- 2026-10-01 wave 4: W11 temporarily owns client/messages/en/onboarding.json (W7 done, no later owner) to add keys W9/W10 flagged: AC-15 noGraph text, translated status words, clipboard failure
- 2026-10-01 wave 4 (W11, W15, W17) done; main session fixed banner resync (D1/AC-39) and StatusBanner status words; checks green
- 2026-10-01 wave 5 (W16) done; implementation complete, final full checks green (client suite 3x stable after one unexplained non-zero first run by W16)
- 2026-10-01 verify round 1: verified with gaps (0 unmet). Fixing A:NFR-7, B:NFR-7, B:AC-91/EC-18/T43, A:AC-72, B:AC-85 via a fresh implementer; rest = it/e2e/manual/live-call, left to Phase 6 or user
- 2026-10-01 verify round 2: 7 fixed rows verified; checks green @ 7037cdd9…; entering Phase 3 round 1
- 2026-10-01 review round 1: architecture approve (0 findings), security 1 WARNING (fixed, F1), code-review 5 low suggestions; server checks green @ aaef5425…
- 2026-10-01 user picked F4 only; F4 applied, reviewer-core + server checks green @ 306d3b95…; round 2 delta re-review (security F1 + code-review on fix files) launched
- 2026-10-01 review round 2: security delta approve (F1 fixed); code-review delta added F8–F11 (suggestions, no CRITICAL/WARNING open)
- 2026-10-01 user skipped F8–F11 ("якщо нічого важливого то пропускаємо"); Phase 3 exit met; entering Phase 4
- 2026-10-01 Phase 4 manual verification (existing dev stack on :3000/:3001, no restart): see reports; F12 found and fixed; client lint/typecheck/test green @ 7945f3fc…
- 2026-10-01 Phase 5 docs done (specs moved to implemented; D1–D4 spec revision still recommended); entering Phase 6
- 2026-10-01 /pr-self-review: PASS (verdict approve, 0 CRITICAL, 7 SUGGESTION); all 13 CI checks exit 0; gate.sh check exit 0
- 2026-10-01 user: skip integration/e2e tests for now; layout does not match the mockup (image). Restyle round launched via a fresh implementer (client tour files only); /pr-self-review report becomes stale and must be re-run afterwards. Nothing committed.
- 2026-10-01 restyle (F13) done, all 13 CI checks exit 0, /pr-self-review report refreshed, gate.sh check PASS @ e40ac7c7…
- 2026-10-02 LIVE RUN (user approved, key already configured): POST narrative on gm-vocabulary → ready in ~40 s, real cost $0.0004 (estimate $0.0012), 7352 in / 4192 out tokens, no invented paths; found F14 (Chinese output), F15 (no task ids in input), F16 (run_locally fell back). F14/F15 fixed offline; waiting for user OK to re-run once.
- 2026-10-02 SECOND LIVE RUN (user approved): ready in ~26 s, 7127 in / 2174 out tokens, $0.00048, English only, fallback_sections = [], all 5 sections AI-written, no invented paths. F14/F15 confirmed fixed; F16 not reproduced. Changes uncommitted; gate report stale.
- 2026-10-01 plan gap: S37 (W14) needs fileUrl from S16 (W7), same wave. W14 runs S36 only now; S37 runs after W7 as a fresh implementer.

## Check table
wave 1 full run: server lint/typecheck/arch:check/unit(45 files, 439 tests), client lint/typecheck/test, mcp-server typecheck/test, check-shared-sync — all exit 0
gate.sh fingerprint: f617d319e4b3fa1924249cba4cd04b5103b261a75b5f5473d636a2a44fcd7c28

wave 2 full run: server lint/typecheck/arch:check/unit, client lint/typecheck/test, reviewer-core typecheck/test, mcp-server typecheck, shared-sync — all exit 0
gate.sh fingerprint: 31a72b1533aa8573b7124c896f161960362f206e37711a3bb8ebbeca2620ed53

wave 3 full run: server lint/typecheck/arch:check/unit, client lint/typecheck/test, shared-sync — all exit 0
gate.sh fingerprint: 574f22eeef0d199b5414e92c88daf0cb572a0910851f7281851b5dd51bea9f91

wave 4 full run: server lint/typecheck/arch:check/unit, client lint/typecheck/test, reviewer-core typecheck/test, mcp-server typecheck, shared-sync — all exit 0
gate.sh fingerprint: 7bdd6a3e3ca0ffd41898fe50bc0595bc9ced846a700ce7c43252ff7dcc72e87c

final full run: server lint/typecheck/arch:check/unit, client lint/typecheck/test(x3), reviewer-core typecheck/test, mcp-server typecheck/test, e2e typecheck, shared-sync — all exit 0 (*.it.test.ts and e2e flows not run)
gate.sh fingerprint: 0992e3f44ab1d67ff7c7283a28f610579eb2fb431006d2d769878c4b4d863914

after verify fixes: server lint/typecheck/arch:check/unit, client lint/typecheck/test, shared-sync — all exit 0
gate.sh fingerprint: 7037cdd9496975500871b715b5d07ab0713305927977acdd5cbe55dbe0c0a122

after F1 fix: server lint/typecheck/arch:check/unit — exit 0
gate.sh fingerprint: aaef54258c334b1d7e6838124b83118f520f03cbb6de0655e69bb2e308febf75

after F12 fix: client lint/typecheck/test — exit 0
gate.sh fingerprint: 7945f3fcfc3aa04a4c8b0fb76797fd432012763fa2f2828169d8a06e5204c764

## Review ledger
| F# | Source | Sev | file:line | Summary | Status | Round |
|---|---|---|---|---|---|---|
| F1 | security | WARNING | server/src/modules/onboarding/facts/ecosystems.ts:95 | globMatchesDir backtracks exponentially on nested `**` in untrusted workspace globs (confirmed: a 60-segment pattern did not finish in 40 s) | fixed (collapse `**` runs + memoised matcher; regression test) | 1 |
| F2 | code-review | SUGGESTION | server/src/modules/onboarding/narrative-service.ts:~143 | Rate-limit token is taken before repo lookup / join-in-flight, so joins, 404 and 409 consume the 10/min budget | declined by user (kept as planned: B-REC7 limiter first) | 1 |
| F3 | code-review | SUGGESTION | server/src/modules/onboarding/narrative/overlay.ts:~25 | An in-flight run older than 90 s is persisted as `interrupted` and may later flip to `ready` | declined by user (kept as planned: plan C26 / B:AC-84) | 1 |
| F4 | code-review | SUGGESTION | reviewer-core/src/llm/openrouter.ts:~14 | `/requested parameters/i` on 400/404/422/503 can misclassify a genuine bad-request as no_structured_provider | fixed (regex tightened + negative test), round 1 user pick | 1 |
| F5 | code-review | SUGGESTION | server/src/modules/onboarding/service.ts:~256 | cache version falls back to 0 when updatedAt is not a Date | disputed: IndexState.updatedAt is typed `Date` (repo-intel/types.ts:51); fallback is defensive only | 1 |
| F6 | code-review | SUGGESTION | reviewer-core/src/llm/openrouter.ts:~106 | timeoutMs is now forwarded as SDK per-request timeout for all callers | disputed: only callers are intent (30 s) and conventions (90 s = the existing client default) and onboarding (60 s); effective timeouts unchanged | 1 |
| F7 | architecture | SUGGESTION | server/src/modules/onboarding/service.ts:20 | Value import of BlobTooLargeError from adapters/git (ring 3 → 4); no rule forbids it, intent/ and project-context/ do the same | declined by user (pre-existing pattern in intent/ and project-context/) | 1 |
| F8 | code-review (r2) | SUGGESTION | server/src/modules/onboarding/facts/ecosystems.ts:~109 | Negated workspace patterns (`!**/test/**`) return false and are ignored, so excluded dirs stay in memberDirs and are reported as packages | declined by user (not important) | 2 |
| F9 | code-review (r2) | SUGGESTION | server/src/modules/onboarding/facts/ecosystems.ts:~322 | Go main / Spring app files are attributed to a parent module even when a nested go.mod / module owns them | declined by user (not important) | 2 |
| F10 | code-review (r2) | SUGGESTION | server/src/modules/onboarding/facts/ecosystems.ts:~252 | uvicorn module name derived from file path (`src.main:app`) may not import for a src/ layout; command is labelled by_convention | declined by user (not important) | 2 |
| F11 | code-review (r2) | SUGGESTION | reviewer-core/src/llm/openrouter.ts:~118 | tightened NO_ENDPOINT_RE can still match "Provider returned error … requested parameters" (ordinary bad request) | declined by user (not important) | 2 |
| F12 | manual | WARNING | client/src/app/repos/[repoId]/tour/_components/OnboardingTourView/styles.ts:10 | The "On this page" nav never stuck: its wrapper had `alignItems: flex-start` from the layout row, so it was only as tall as the nav and `position: sticky` had no room to travel (A:AC-46 "sticky panel"; plan manual check) | fixed (`alignSelf: stretch` on the nav wrapper); re-checked live: wrapper 3141 px, nav pinned at top while content scrolled 1500 px | 4 (manual) |
| F13 | manual (user) | WARNING | client/src/app/repos/[repoId]/tour/** | Page layout/visual styling does not match the design mockup (rail, header, card chrome, rows, first-task grid, diagram box) | fixed — restyle done and verified live against the mockup; two mockup details not applied (mermaid dark theme, inline code chips in the summary); edgeless diagram no longer drawn | 5 |
| F14 | manual (live run) | WARNING | server/src/prompts/onboarding.system.md:3 | Live run (deepseek/deepseek-v4-flash via OpenRouter): the whole narrative came back in Chinese although the repo has no Chinese text and the prompt said "English only" (one sentence in the intro) — violates B:AC-13 / B:NFR-9 | fixed (LANGUAGE rule at top and bottom of the prompt + English reminder as the last line of the user message); CONFIRMED by a second live run: 0 CJK characters in every section | 6 (manual) |
| F15 | manual (live run) | WARNING | server/src/modules/onboarding/narrative/input.ts:~121 | The model input had no first-tasks block, so task ids were never shown and `first_tasks` could only fall back to facts (T33 did not check it) | fixed (first-tasks block in the model input + 2 tests); CONFIRMED live: first_tasks has 4 tasks with real task ids | 6 (manual) |
| F16 | manual (live run) | WARNING | server/src/modules/onboarding/narrative/ground.ts:~51 | `run_locally` fell back to facts in the live run; cause unknown (raw model output is not stored; command ids are in the input) | not reproduced: the second live run returned run_locally with 10 grounded commands and fallback_sections = []; the first-run cause is unconfirmed (likely tied to the Chinese output); no diagnostic was needed | 6 (manual) |
