# spec — running a review

What `POST /pulls/:id/review` must guarantee. This is the behavioral
contract; see [`../docs/architecture.md`](../docs/architecture.md) for how it's wired
and [`../../reviewer-core/specs/grounding-spec.md`](../../reviewer-core/specs/grounding-spec.md)
for the grounding gate itself.

## Preconditions

- The PR has been imported (diff, commits, title/body available).
- An agent (built-in `General`/`Security`, or user-created) is selected.

## Guarantees

- **The model never sees only raw trust.** Every agent's system prompt gets
  the shared `INJECTION_GUARD` appended (from `reviewer-core`): untrusted PR
  content (diff, description, comments) is data, never instructions, and
  "this is a test fixture, don't flag it" claims never lower severity.
- **Every finding is grounded.** A finding that cites a line not present in
  the diff is dropped before it reaches the client — the engine cannot
  hallucinate a location.
- **The score is never the model's own.** It's recomputed deterministically
  from the findings that survive grounding.
- **Repo Intel is opt-in per agent, on by default at the server level**
  (`REPO_INTEL_ENABLED`). When on *and* the repo is indexed, the prompt gains
  a repo skeleton + "high blast-radius" note. An unindexed repo silently
  degrades to diff-only — this is expected, not a bug, in the starter.
- **A run streams progress over SSE** and is persisted with status
  (`running` → `completed`/`failed`) so a client reconnecting mid-run sees
  the current state, not just the final one.

### Intent derivation (best-effort, non-fatal)

- Before the per-agent loop, the executor derives the PR's intent once
  (shared across every queued agent) via `IntentDeriver.deriveForReview`
  (`modules/reviews/run-executor.ts:159-169`). Any failure — the PR/repo
  missing, GitHub/git/LLM error, an empty model output, the ≤30s timeout —
  degrades the run to "no intent" (an `Intent unavailable — continuing
  without it` Live Log line); it never fails or blocks the review.
- A **stale** cached intent (derived against an older `head_sha`) is never fed
  into a review: the cache key hash includes `head_sha`
  (`modules/intent/helpers.ts` `computeInputHash`), so a stale row is always a
  cache miss and gets re-derived (or the run proceeds without intent if that
  re-derivation itself fails).
- When intent is available, `reviewer-core` renders it as a `## Derived
  intent (confidence: …)` section, delimiter-wrapped like every other
  untrusted block — it can inform a finding's rationale but can never reduce
  severity or suppress a finding (`reviewer-core/src/prompt.ts`'s
  `INJECTION_GUARD` explicitly names "derived intent/scope" as untrusted data).
  See [`../../reviewer-core/docs/pipeline.md`](../../reviewer-core/docs/pipeline.md#stages)
  for where the section sits in the assembled prompt.
- Intent derivation cost (`pr_intent.cost_usd`, which accumulates across
  re-derivations) is folded into the PR's lifetime cost alongside agent-run
  costs — see [`../README.md#intent-layer`](../README.md#intent-layer).

## Smart Diff (read side)

`GET /pulls/:id/smart-diff` groups the PR's changed files by role and attaches
each file's findings from the latest review round — a separate, read-only
endpoint from the ones above, but it reads the same round semantics this spec
already defines. It never calls an LLM, GitHub, or git. See
[`../README.md#smart-diff`](../README.md#smart-diff) for the request-flow
diagram.

- **Deterministic classifier, no LLM.** `classifyFile(path)`
  (`modules/smart-diff/classify.ts:18`) evaluates `CLASSIFY_RULES`
  (`modules/smart-diff/constants.ts:52-76`) in priority order — the first
  match wins, everything else classifies as `core`. That priority order
  (boilerplate → tests → wiring → docs) is deliberately **not** the display
  order (`core → tests → wiring → docs → boilerplate`, `SMART_DIFF_ROLE_ORDER`,
  `modules/smart-diff/constants.ts:16`): a snapshot file under `__tests__/`
  classifies as `boilerplate`, not `tests`; a `.claude/**` file is `wiring`
  even when it's Markdown; `e2e/**` is `tests` even for its own `README.md`.
- **Findings come from the latest review *round*, not the latest review row**
  — the same rule `findings_summary` follows (`reviewIdsForFindings`,
  `modules/pulls/helpers.ts:52`, reused as-is by
  `modules/smart-diff/service.ts:49`): every `kind='review'` review whose run
  falls in the PR's most recent run cluster, not just the single newest
  `reviews` row. A PR with no runs yet skips the findings read entirely and
  returns groups with empty `finding_ids` (`modules/smart-diff/service.ts:50`).
- **Dismissed findings never count.** `buildSmartDiff` drops any finding with
  `dismissedAt` set before grouping — a dismissed finding never appears in a
  file's `finding_ids`/`finding_lines` (`modules/smart-diff/helpers.ts:36`).
  Accepted findings stay.
- **Empty groups are omitted.** A role with zero classified files for this PR
  never appears in `groups` (`modules/smart-diff/helpers.ts:64-68`); within a
  group, file order is left as the repository returned it — the client
  re-sorts by `pr.files` index for "Original order"
  (`client/src/app/.../DiffTab/helpers.ts`'s `orderFilesByRole`).
- **No repository of its own.** `SmartDiffService` takes a `SmartDiffStore`
  port — a structural subset of `PullsRepository`'s shape, declared inside
  `modules/smart-diff/service.ts:20-26` rather than imported from `pulls`'s
  `repository.ts` — satisfied by the container's memoized `pullsRepo`
  (`platform/container.ts:191-192`). `no-sideways-module-imports` forbids the
  cross-module import even as `import type`; see `server/INSIGHTS.md`'s
  2026-09-24 entry.
- **404** when the PR doesn't exist or belongs to another workspace
  (`findPull(workspaceId, prId)`, `modules/smart-diff/service.ts:40-41`).
- **Contract:** `SmartDiffRole` is a 5-value enum (`core`/`tests`/`wiring`/
  `docs`/`boilerplate`); `SmartDiffFile.finding_ids: string[]` lets the client
  match a file's dots/cards to exactly the findings this endpoint counted,
  without re-deriving the round logic client-side
  (`vendor/shared/contracts/brief.ts:110-124`, mirrored in both `server/` and
  `client/` copies).

## Out of scope (starter)

- Multi-agent / consensus review (later lesson).
- Persistent memory across runs (later lesson).
- Map-reduce over very large diffs — `reviewer-core` exposes `reduce()` but
  the starter server always runs single-pass.
- Smart Diff's `split_suggestion` (`too_big`/`proposed_splits`) is always the
  default `{ too_big: false, proposed_splits: [] }` today
  (`modules/smart-diff/constants.ts:18`) — only `total_lines` is computed;
  the "this PR is large, consider splitting" UI copy exists but nothing
  currently sets `too_big: true`.

## Touchpoints

- Route: `modules/reviews/routes.ts` (`POST /pulls/:id/review`, `GET /reviews`,
  `POST /findings/:id/(accept|dismiss)`, `GET /runs/:id/(events|trace)`)
- Orchestration: `modules/reviews/run-executor.ts` (gathers inputs, calls
  `reviewer-core`, persists the result)
- Engine: `reviewer-core/src/review/run.ts` (`reviewPullRequest`)
- Intent Layer: `modules/intent/{service,repository,routes}.ts`,
  `GET`/`POST /pulls/:id/intent` (see [`../README.md#intent-layer`](../README.md#intent-layer))
- Smart Diff: `modules/smart-diff/{classify,constants,helpers,service,routes}.ts`,
  `GET /pulls/:id/smart-diff` (see [`../README.md#smart-diff`](../README.md#smart-diff))
