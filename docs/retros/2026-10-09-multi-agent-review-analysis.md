# Run analysis: Multi-Agent Review (2026-10-09)

Purpose: a self-contained record of how the Multi-Agent Review feature was specified, planned, implemented, reviewed and styled in one session (`20910cea`), so a later chat can analyse the run without the transcript. Raw sources and their locations: [`multi-agent-review-logs/MANIFEST.md`](2026-10-09-multi-agent-review-logs/MANIFEST.md). Workflow retro: [`2026-10-09-multi-agent-review.md`](2026-10-09-multi-agent-review.md).

## 1. What was built

- Feature: run several review agents in parallel on one PR, group similar findings by location, show where agents disagree, and show results in Columns and Tabs views with live statuses.
- Spec: `docs/specs/2026-10-09-multi-agent-review.md`, status `implemented`. 7 user stories, 73 acceptance criteria, 19 edge cases, 11 NFRs. Deviations recorded as D-1…D-14.
- Plan: `docs/plans/multi-agent-review.md`, three work packages (W1 server, W2 client foundation + Configure + PR picker, W3 results page).
- Server: `POST /pulls/:id/review` accepts `agent_ids`; `GET /pulls/:id/multi-agent`; `GET /runs/estimates`; parallel executor with `Promise.allSettled`; repository with `FOR UPDATE` transaction; pure grouping helpers.
- Migrations (generated, applied manually to the local dev database): `0019_far_puff_adder.sql` (FK column + index), `0020_abnormal_morg.sql` (index for estimates). Both verified present in `devdigest` on `localhost:5432`.
- Client: Configure screen, PR-page picker in `RunReviewDropdown`, results page with Columns and Tabs, sidebar item.

Not done: commit, pull request, the 1-vs-3 measurement (AC-45, NFR-1, needs a real LLM key), and a live check of Columns and Tabs with a real group.

## 2. Verification

| Check | Result | Source |
|---|---|---|
| shared contract sync | exit 0 | `multi-agent-review-logs/sync.txt` |
| server lint / typecheck / arch:check | exit 0 | pr-self-review, `multi-agent-review-logs/pr-self-review.md` |
| server unit tests | 773 passed | `multi-agent-review-logs/s-test.txt` |
| client lint / typecheck / tests | exit 0; 592 tests | `multi-agent-review-logs/c-test.txt` |
| reviewer-core typecheck / tests | exit 0; 52 tests | `multi-agent-review-logs/rc2.txt` |
| mcp-server typecheck / tests | exit 0 | `multi-agent-review-logs/m-test.txt` |
| multi-agent integration (real Postgres, Docker) | 12 of 12 passed | `multi-agent-review-logs/s-it.txt` |
| all server integration (real Postgres) | 158 passed, 1 failed once | `multi-agent-review-logs/s-it-all.txt`, `multi-agent-review-logs/ca-2.txt` |

The one integration failure was `context-attachments` NFR-1 p95 timing. It passed on two reruns, and the file is not changed by this feature. Record it as a flaky timing test, not as a regression.

Reviews (in `docs/plans/multi-agent-review.verification.md` and the subagent outputs):
- `plan-verifier`: verified with gaps (AC-55, AC-28, NFR-2, NFR-6 partial; integration tests not run). Gaps closed in fix round 1.
- `architecture-reviewer`: approve; one suggestion (cross-route import of `RunTraceDrawer`), accepted per plan R6.
- `security-reviewer`: one warning (unbounded `agent_ids`, non-uuid ids). Fixed: uuid check, count bound, single lookup.
- `/code-review`: seven findings, all fixed, plus duplicate-helper suggestions fixed in round 2.
- `/pr-self-review`: verdict `approve`, gate PASS (`multi-agent-review-logs/pr-self-review.md`). Note: the gate is stale after the later `.claude` edits and the UI restyles. Run it again before any PR.

## 3. Defects found by review and fixed

| Found by | Defect | Fix |
|---|---|---|
| review (correctness) | run ids paired with agents by index; `RETURNING` order is not guaranteed | map by agent id |
| security | `agent_ids` unbounded; non-uuid id could give 500 | uuid check, bound by enabled agents, one lookup |
| `/code-review` | Tabs and trace showed stale or empty findings after a group finished | invalidate reviews when the group leaves `running` |
| `/code-review` | `$1e-7` shown as exponent cost | fixed-decimal formatting |
| `/code-review` | estimates query scanned all done runs | `LATERAL … LIMIT 5` plus index |
| `/code-review` | formatter and start-flow duplicates | single helpers and `useStartGroup` |
| integration run (mine) | test asserted a 404 after a disabled agent (422 comes first) | test ordering fixed |
| integration run (mine) | test asserted `rationale`, which is not in the contract | assertion removed |

## 4. Design fidelity: what happened

The design screenshots came in the chat, not as files in the repository. The plan recorded "Design: none", and the implementers worked from a text description. Three UI rounds followed after review had passed:
1. Configure screen: rows instead of coloured cards; step headers and "Select all" missing. Restyled. One regression (per-agent `≈` prefix removed) was caught and restored, since AC-21 requires it.
2. Column card: rewritten to the design (accent border, icon, score ring, severity bars, footer). Differences left: time shown as `8s` not `8.2s` (shared formatter rounds), and titles truncated to one line (AC-54) where the design wraps to two.
3. Tabs view: rewritten (tab score, summary card, collapsible findings, SUGGESTED FIX, actions). "Reply to author" not shown (decision D-1). Learn is a disabled stub (D-1).

Still open: the design shows an active Learn and a Reply action. Those change approved decision D-1 and need the user's decision. The Columns and Tabs views were not compared with a live group, because creating one calls the LLM.

## 5. Process incidents

- Design images never saved under `docs/`; run-plan intake did not stop for them (fixed by a rule in `run-plan`, see §7).
- Spec churn: `spec-creator` ran 8 times. One analyze pass was stopped by a request and its output was lost; the second pass was used.
- Integration tests were not run until the end, although Docker was up. Two test-side bugs surfaced then.
- A missing `reviewer-core/node_modules` made the server typecheck fail with 10 errors that were environmental. Fixed with `npm ci` (lock file unchanged).
- A browser tab-group error at the start of UI checks (no tab group existed); resolved by creating one.
- The Tabs-restyle implementer did not open the lane `SKILL.md` files for react-best-practices, frontend-architecture and react-testing-library, and said so in its report.

## 6. Cost and tokens

Latest collector run (`multi-agent-review-logs/metrics.json`, `multi-agent-review-logs/metrics.md`):

| | in-new | cache-read | out | cost |
|---|---|---|---|---|
| Main session | 939k | 54 788k | 141k | $8.68 |
| Subagents (24 agents) | 1 943k | 32 954k | 103k | $12.93 |
| All | 2 868k | 81 013k | 236k | $21.61 |

Per-agent and per-model tables are in the retro report. Note: the retro report's summary line still shows the earlier totals (2 824k / 70 934k / 216k); the figures above are the latest run. Rates: `workflow-retro/assets/prices.json`, from https://claude.com/pricing (2026-10-09). The main session's model is not recorded in the transcript, so its cost is not verified. The Haiku row uses the ≤100K tier.

The largest single cost was `implementation-planner` (249k in-new, 12 min, $2.89).

## 7. Retro decisions applied

R1–R7 applied to `spec-creator.md`, `implementer.md` and `run-plan/SKILL.md`: one question batch per spec round; no stopping an analyze pass; design saved under `docs/design/<feature>/` before launch; line ranges instead of whole shared files; short prompts; implementers list every skill file read; implementers run the touched module's integration tests when Docker is up. R8 (smaller planner model or plan length cap) not applied; needs a trial.

Note: the `.claude/agents` changes need `pnpm eval:workflow` per the project's CLAUDE.md. Not run (it calls models).

## 8. Open items for the next chat

1. Commit and pull request (after a fresh `/pr-self-review`).
2. Decide: Learn and Reply (design vs D-1).
3. Decide: `8.2s` time format (changes shared formatter used elsewhere) and whether titles may wrap (AC-54 says one line).
4. Live check of Columns and Tabs: needs a test group, which calls the LLM; needs spend approval.
5. AC-45 / NFR-1 measurement (1 vs 3 agents) with a real key, results to `docs/multi-agent-review-measurement.md`.
6. NFR-8 keyboard, focus and target-size check (manual).
7. "Review Agents" page with a logs toggle: the brief mentions it, but no such page exists in code. Confirm whether it is needed.
8. Eval run for changed agent files (`pnpm eval:workflow`), if the project wants it before merge.
9. Haiku row cost and main session model: check when the collector can name the model.
