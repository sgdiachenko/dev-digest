# Retro: Multi-Agent Review — 2026-10-09
Session: 20910cea · Workflow: spec-creator ×8 → implementation-planner → /run-plan (implementer W1∥W2 → W3 → plan-verifier → architecture ∥ security ∥ /code-review → fix ×2 → doc-writer → /pr-self-review) → 3 restyle rounds

## Summary (5 lines max)
Tokens: 2 824k in-new · 70 934k cache-read · 216k out · Agents: 24 started / 23 launched / 0 launch failures · Wall/active: 4.6 h / 1.8 h (main)
Biggest cost: implementation-planner (249k in-new, 12 min, 49 tool uses) · Biggest lesson: the design images never reached the planner or the implementers; three UI rounds came after review had already passed.
Vs previous: cheaper in in-new tokens and far fewer launches, same order of cache-read. Details under "Comparison".

## Metrics (collect.mjs, verbatim totals)
- Main session: 881k in-new · 37 980k cache-read · 113k out (cache hit 98%), 135 turns, active 1.8 h / wall 4.6 h
- Subagents: 1 943k in-new · 32 954k cache-read · 103k out
- All: 2 824k in-new · 70 934k cache-read · 216k out (thinking inside output: 47k)
- Launches: 23 in 19 batches; started 24; launch failures 0
- Cost: **$21.61** for all sessions (main $8.68). Rates from https://claude.com/pricing, fetched 2026-10-09, in `assets/prices.json`. Haiku 5.5 uses the ≤100K tier. Earlier this report said "no rates set"; that is superseded.

## Tokens and cost per agent (all agents; from `collect.mjs --json`)

Tokens in thousands. in-new = input + cache write; cache-read = re-read context.

| batch | agent | model | in-new | cache-read | out | cost (USD) | tool uses |
|---|---|---|---|---|---|---|---|
| 1 | spec-creator (analyze, first, stopped) | opus | 107 | 1 087 | 0 | 0.75 | 30 |
| 2 | spec-creator (analyze, second) | opus | 125 | 2 239 | 17 | 1.41 | 35 |
| 3 | spec-creator (write) | opus | 64 | 745 | 18 | 0.82 | 23 |
| 4 | spec-creator (Q-1..Q-5) | opus | 73 | 429 | 19 | 0.82 | 9 |
| 5 | spec-creator (Q-6, Q-7) | opus | 52 | 381 | 6 | 0.46 | 18 |
| 6 | spec-creator (Q-8) | opus | 47 | 184 | 3 | 0.33 | 11 |
| 7 | spec-creator (PR picker, owned paths) | opus | 83 | 1 191 | 17 | 0.99 | 32 |
| 8 | spec-creator (approve) | opus | 32 | 193 | 3 | 0.25 | 13 |
| 9 | implementation-planner | opus | 249 | 8 116 | 1 | 2.89 | 49 |
| 10 | implementer W1 (server) | sonnet | 180 | 5 079 | 2 | 0.98 | 51 |
| 10 | implementer W2 (client) | sonnet | 139 | 3 545 | 1 | 0.71 | 39 |
| 11 | implementer W3 (results) | sonnet | 117 | 2 340 | 1 | 0.53 | 30 |
| 12 | plan-verifier | sonnet | 135 | 1 210 | 10 | 0.56 | 26 |
| 13 | architecture-reviewer | sonnet | 36 | 84 | 0 | 0.10 | 6 |
| 13 | security-reviewer | sonnet | 39 | 155 | 0 | 0.11 | 7 |
| — | general-purpose (/code-review) | haiku | 131 | 2 960 | 4 | 0.05 | 32 |
| 14 | implementer (server fixes) | sonnet | 58 | 454 | 1 | 0.20 | 14 |
| 14 | implementer (client fixes) | sonnet | 30 | 127 | 1 | 0.09 | 8 |
| 15 | implementer (estimates query) | sonnet | 26 | 229 | 0 | 0.09 | 10 |
| 15 | implementer (formatters, start flow) | sonnet | 43 | 378 | 0 | 0.15 | 10 |
| 16 | doc-writer | sonnet | 47 | 288 | 0 | 0.15 | 8 |
| 17 | implementer (Configure restyle) | sonnet | 34 | 339 | 0 | 0.12 | 12 |
| 18 | implementer (column card restyle) | sonnet | 37 | 347 | 0 | 0.13 | 13 |
| 19 | implementer (Tabs restyle) | sonnet | 60 | 852 | 0 | 0.24 | 21 |
| — | main session | not recorded | 939 | 54 788 | 141 | 8.68 | — |

The most expensive: main session ($8.68), implementation-planner ($2.89), spec-creator agents together (~$5.0), implementers together (~$3.5).

## Tokens and cost by model (subagents; from `collect.mjs --json`)

| model | agents (by type) | input | output | cache-read | cache-write | cost (USD) |
|---|---|---|---|---|---|---|
| claude-opus-5-5 | 9 — spec-creator ×8, implementation-planner ×1 | 300 | 82 772 | 14 565 206 | 831 512 | 8.73 |
| claude-sonnet-5-5 | 14 — implementer ×10, plan-verifier, architecture-reviewer, security-reviewer, doc-writer | 442 | 16 143 | 15 428 592 | 980 317 | 4.16 |
| claude-haiku-5-5 | 1 — general-purpose (`/code-review` fork) | 66 | 3 709 | 2 960 170 | 130 609 | 0.05 |

Main session: 366 input · 134 503 output · 49 007 431 cache-read · 925 474 cache-write · cost $8.68. **The transcript does not name the main session's model**, so its cost uses the script's default; treat that figure as unverified.

Rates used (`assets/prices.json`, from https://claude.com/pricing, fetched 2026-10-09; USD per 1M tokens):

| model | input | cache write (5 min) | cache read | output |
|---|---|---|---|---|
| Opus 5.5 | 4 | 5 | 0.20 | 20 |
| Sonnet 5.5 | 2 | 2.50 | 0.10 | 10 |
| Haiku 5.5 (≤100K tier) | 0.10 | 0.125 | 0.01 | 0.50 |

## Launch order
```mermaid
flowchart TD
  s1[spec analyze ×2 (1st stopped)] --> s2[spec write P2]
  s2 --> s3[spec revisions ×5 + approve]
  s3 --> p[implementation-planner]
  p --> w12[W1 server ∥ W2 client]
  w12 --> w3[W3 results]
  w3 --> v[plan-verifier]
  v --> r[architecture ∥ security ∥ /code-review]
  r --> f[fix round 1: server ∥ client]
  f --> f2[estimates + dedupe: server ∥ client]
  f2 --> d[doc-writer] --> g[/pr-self-review]
  g --> ui[UI restyle ×3 (Configure, column card, Tabs) — sequential]
```
Critical path: planner → W1 → W3 → verify → review → fix. W1 and W2 ran in parallel as planned; W3 waited for W2, as planned.

## What was hard
- **R1 — spec churn (8 spec-creator launches).** Each open-question round became its own revision launch (Q-1..Q-5, Q-6+Q-7, Q-8, PR picker/owned paths, approve). Spec-work in-new: ~583k across the 8 launches.
- **R2 — a stopped analysis was lost.** The first analyze pass (spec-creator:a24979, 107k in-new) was stopped by request before it reported; its work was discarded and a second analyze pass ran (125k in-new).
- **R3 — design never reached the planner or the implementers.** The run-plan intake check says a mock-up that exists only in chat must be saved under `docs/` before the plan is accepted. The plan said "Design: none" and nobody stopped to ask. The screenshots stayed in chat. Result: the Configure, column-card and Tabs designs were all off after review had passed (three restyle launches).
- **R4 — skill rules skipped.** The Tabs implementer and the W3 implementer reported they did not open the `SKILL.md` files for their lane skills and applied them "from memory". Two of the review findings (estimate query shape, formatter duplicates) came from exactly this kind of gap.
- **R5 — integration tests not run until the end.** Docker was up. plan-verifier and the fix round both left `*.it.test.ts` unrun; when run at the end, 2 test-side bugs appeared (wrong 404 ordering in the test, an assertion on a field that is not in the contract).

## What was easy
- Narrow scoped prompts with a fixed output shape (W1/W2/W3 reports with per-step status and exit codes): every implementer returned a parseable report and no hand-back needed a follow-up.
- Verbatim contract appendix in the plan (Appendix A): W1 and W2 wrote byte-identical contract copies in parallel; `check-shared-sync.sh` passed on the first run after wave 1.
- Review fix round scoped to a finding list with file:line: both fix agents closed every item on the first pass.

## Duplication
- **R6 — the same files read by 10–12 agents.** `server/src/modules/reviews/service.ts` (12 agents), `observability.ts` (11), `client/.../multi-agent/helpers.ts` (11), `docs/specs/README.md` (11), `routes.ts` and `run-executor.ts` (10 each). Most reviewers re-read whole files; the plan already gave line ranges for the contracts.
- **R7 — repeated boilerplate.** The sentence naming the approved spec path appears in 10 launch prompts (~540 chars). The report-format sentence appears in 3 prompts (~369 chars). Low token impact, but these belong in the agent files or in one shared line.
- **Context re-read.** Resumes: none. Fresh agents each time (0 resumes), which is the intended pattern.

## What was missed
- **Gap-closure table**

| # | Gap (agent) | Closed by | Status |
|---|---|---|---|
| 1 | Spec open questions Q-1…Q-8 (spec-creator) | User answers, applied in revisions | closed |
| 2 | Checkboxes missing on PR dropdown (spec-creator, D-13) | Implemented as new (W2) | closed |
| 3 | MCP platform.ts re-copy (spec-creator, D-14) | User accepted; W1 re-copied with `cp` | closed |
| 4 | Partial test rows AC-55, AC-28, NFR-2, NFR-6 (plan-verifier) | Fix round 1 + integration run | closed |
| 5 | Integration tests never run (plan-verifier) | Ran with Docker; 2 test bugs fixed | closed |
| 6 | Cross-route `RunTraceDrawer` import (architecture-reviewer, R6) | Accepted by plan | open-deferred |
| 7 | "Review Agents" page with logs toggle not in code (planner, spec D-5) | Replaced by the new results page; user never confirmed | open-deferred (owner: user) |
| 8 | 1-vs-3 measurement, AC-45 / NFR-1 (planner) | Manual, after deploy with a key | open-deferred (owner: user) |
| 9 | Keyboard, focus and 24 px targets, NFR-8 (plan-verifier) | Manual | open-deferred (owner: user) |
| 10 | Design files never saved under `docs/` (planner; run-plan intake) | Not closed at intake; fixed late by restyles | closed late, process gap (R3) |
| 11 | Learn vs design (design shows active Learn and Reply to author; spec D-1 says stub and hidden) | Spec decision stands | open-blocking (owner: user) |
| 12 | Live check of Columns and Tabs in the browser (no group exists; a run calls the LLM) | Not run; needs spend approval | open-blocking (owner: user) |
| 13 | Skill files not opened by two implementers (R4) | Not closed | open-deferred |

- Things a later phase found that an earlier one should have: the design (R3) and the integration tests (R5) — both were cheap to check at the start.
- Requirements with no owner: none left unowned; rows 7, 11, 12 need the user.

## Comparison with previous runs
Baseline: `docs/retros/ledger.md`, 3 rows (2026-09-30, 2026-10-02, 2026-10-03).

| Run | in-new | cache-read | out | Launches (fail) | Wall |
|---|---|---|---|---|---|
| 2026-09-30 Project Context | 6 118k | 241 333k | 449k | 41 (6) | 28.7 h |
| 2026-10-02 Onboarding Tour | 2 946k | 62 272k | 136k | 27 (0) | 12.4 h |
| 2026-10-03 PR Brief | 3 124k | 64 594k | 204k | 16 (0) | 16.8 h |
| **2026-10-09 Multi-Agent Review** | **2 824k** | **70 934k** | **216k** | **23 (0)** | **4.6 h** |

Verdict: cheaper than the first run and at the same level as the last two on in-new tokens. Cache-read is slightly above the last two runs (+10% vs 2026-10-03), far below 2026-09-30. The single change that explains most of the gap to 2026-09-30 is the number of launches (23 vs 41) with no launch failures. Note: 8 of 23 launches were spec-creator; without R1 this run would have been roughly 15% cheaper in in-new.

## Recommendations

| R# | Change | Where | Expected effect | Cost | Confidence |
|---|---|---|---|---|---|
| R1 | Batch all open spec questions into one `AskUserQuestion` with a recommended default per question before the write pass; one revision per user round | `/spec-creator` flow doc (run-plan intake) | ~5 fewer spec-creator launches, about 300k in-new | none | high |
| R2 | Do not stop a running analyze pass; if it must stop, say what is lost and whether to re-run | workflow note | avoids re-running analysis (~100k) | none | medium |
| R3 | Run-plan intake: if a design appears in chat, save it under `docs/design/<feature>/` and put the path in the plan's Context → Design before any implementer launch | `.claude/skills/run-plan/SKILL.md`, planner instructions | fewer restyle rounds after review; fewer reviewer re-runs | none | high |
| R4 | Make reading each lane `SKILL.md` a visible step in the implementer report; fail the step if not read | `.claude/agents/implementer.md` | fewer rule misses caught late | small | medium |
| R5 | Run the module's `*.it.test.ts` in the implementer step when Docker is up (CI form), not only at the end | `.claude/agents/implementer.md`, run-plan check table | catches test bugs one phase earlier | medium (Docker time) | high |
| R6 | Reviewers and implementers read line ranges from the plan's appendix, not whole shared files | agent prompts | ~40% fewer reads of `service.ts` and `observability.ts` | none | medium |
| R7 | Move the approved spec path and the report-format sentence into the agent files; keep the prompt to the question and paths | agent files | ~1k chars less per batch | none | high |
| R8 | Planner on a smaller model or a size cap for the plan (862 lines here) | `implementation-planner` model or output format | planner is the largest single in-new cost (249k) | may lower plan depth | low — needs a trial |

## Not checked
- Cost in USD: no rates in `assets/prices.json`; no figure stated.
- Thinking share: 47k of 216k output, not broken down per agent.
- Wall time of the user's own waits is not separated from main-session active time by the script.
- Whether the design-fidelity misses would have been caught by the new R3 step: a hypothesis, not tested.

## Applied
- R1 (spec-creator: one question batch per round), R2 (spec-creator: finish analysis in one run): `.claude/agents/spec-creator.md`
- R3 (run-plan intake: chat designs saved under `docs/design/<feature>/` before launch), R6 (line ranges, not shared files), R7 (short prompts): `.claude/skills/run-plan/SKILL.md`
- R4 (implementer report lists every skill file read): `.claude/agents/implementer.md`
- R5 (implementer runs the touched module's `*.it.test.ts` when Docker is up): `.claude/agents/implementer.md`
- R8 not applied (planner model or length cap): needs a trial first.
