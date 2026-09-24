# spec — pages

What each route must show. Behavioral contract, not implementation notes —
see [`../docs/ui-architecture.md`](../docs/ui-architecture.md) for how it's wired.
Cross-check against [`../../e2e/specs/coverage.md`](../../e2e/specs/coverage.md) for
what's actually exercised by browser e2e.

## `/` (root)

Redirects to the first repo's PR list once repos exist; otherwise routes to
`/onboarding`.

## `/repos/:repoId/pulls`

Lists the repo's imported PRs. Each row shows PR number/title and, once
`repo-intel` finishes, the **Indexed** badge — must not block on indexing to
render the list itself.

The **Findings** column shows the latest review's severity breakdown
(`! CRITICAL · ⚠ WARNING · 💡 SUGGESTION`), or `—` when the PR has no review
yet. See [`findings-counters.md`](findings-counters.md) for the counter/popover
contract shared with the PR detail Timeline.

## `/pulls/:number`

Three views over one PR: overview, diff (`Files changed`), findings
(`Agent runs`). Must render even if no review has run yet (empty findings
state, not an error). Running a review must be triggerable from here and
must reflect live progress (SSE), not just a final state after refresh.

The Overview tab's **Intent** card (`_components/IntentCard`) reads
`GET /pulls/:id/intent` (`usePrIntent`) and must not itself trigger a model
call. States: loading (skeleton), error (`ErrorState` + retry), never
derived (`EmptyState` with a Derive CTA), and derived (one-sentence intent
quote, a confidence badge with a hint copy when `low`, In scope/Out of scope
lists — each rendering an explicit "none" copy when empty rather than a blank
list — and a collapsible sources list showing each source's ref, resolved/
unresolved icon, and optional note). A `stale` row (re-derived against an
older `head_sha`) additionally shows a stale badge. Derive/Re-derive
(`useDeriveIntent`, `POST /pulls/:id/intent`) is synchronous from the UI's
perspective — the button shows a loading state until the model call resolves,
then the card re-renders from the mutation's response. See
[`../docs/ui-architecture.md#data-flow`](../docs/ui-architecture.md#data-flow)
for the hook, and [`../../server/README.md#intent-layer`](../../server/README.md#intent-layer)
for how the record is derived.

The `Files changed` tab (`_components/DiffTab`) reads `usePrSmartDiff`
(`GET /pulls/:id/smart-diff`, `src/lib/hooks/smart-diff.ts`) to group files by
role — see [`../../server/specs/review-flow.md#smart-diff-read-side`](../../server/specs/review-flow.md#smart-diff-read-side)
for what the endpoint itself guarantees, and
[`../../server/README.md#smart-diff`](../../server/README.md#smart-diff) for the
read-flow diagram.

- **Smart order is the default.** Five possible role groups (core, tests,
  wiring, docs, boilerplate) render in that fixed order with a sticky,
  collapsible header (chip, name, description, `● N files with findings`
  before `N files`); docs and boilerplate start collapsed, every other group
  starts expanded (`DiffTab/constants.ts`'s `COLLAPSED_BY_DEFAULT`). A
  **Smart order / Original order** toggle (`role="group"`, `aria-pressed`)
  switches to the flat, unmodified GitHub file order.
- **Smart order degrades gracefully.** While `usePrSmartDiff` is loading or
  returns an error, the tab renders Original order and **both** toggle
  buttons are disabled (not just the Smart one) — a user can't switch into a
  grouping that isn't available yet
  (`DiffTab/_components/DiffOrderToggle`, `DiffTab.tsx`'s `smartAvailable`).
  A changed-file path the smart-diff response didn't classify (a stale
  response racing a newer commit) still renders, appended to the `core`
  group, never silently dropped (`DiffTab/helpers.ts`'s `orderFilesByRole`).
- **One toggle covers both annotation kinds.** "Show/Hide annotations" gates
  GitHub inline comment threads and finding cards together — it defaults ON
  the first time the PR has any findings, off otherwise, so a clean PR shows
  a clean diff by default (`DiffTab.tsx`'s `showAnnotations` effect). The
  group header's `● N`, a file's severity dot, and a line's colored
  stripe+label stay visible regardless of the toggle.
- **A finding renders exactly where the endpoint says it belongs.** A finding
  whose `start_line` falls inside the rendered patch gets a severity-colored
  line stripe, a right-aligned severity label (`blocker`/`warning`/
  `suggestion`), and a `FindingCard` underneath; one whose line isn't in the
  current diff (an older round's finding on a line this diff no longer
  touches) renders instead in a per-file "N finding(s) outside the diff"
  block at the end of that file (`diff-viewer/findings.ts`'s
  `partitionFindings`, `FileCard.tsx`, `OutsideDiffFindings`). Accept/Dismiss
  from either location calls the same `useFindingAction` mutation.
- **Empty and unreviewed states are distinct from an error.** A PR with no
  review yet still shows the full role grouping, plus a "Review not run yet"
  line (`DiffTab.tsx`'s `noReviewYet`) — this is not the same code path as
  the Smart-Diff-unavailable fallback above.
- `FindingCard` (`src/components/finding-card/FindingCard/`) is shared
  between this tab and the Agent-runs `FindingsPanel` below — it moved out of
  `_components/` for that reason, since `src/components/` cannot import from
  `src/app/`.

The Agent-runs Timeline shows a per-run severity counter under the reviewer's
name for any settled run with a matching review — see
[`findings-counters.md`](findings-counters.md). Within the "Review runs"
section, expanding a run card shows a clickable `N CRITICAL · N WARNING ·
N SUGGESTION` pill row under its verdict/PR SCORE; clicking a pill filters
that card's finding list to one severity (click again to clear) — see
[`findings-counters.md`](findings-counters.md#filter-pills-review-runs).

## `/agents`

Lists built-in (`General Reviewer`, `Security Reviewer`, `Performance
Reviewer`, `Test Quality Reviewer`, `API Contract Reviewer`) and user-created
agents.

## `/agents/:id`

Editor for one agent: Config (model, system prompt, `repo_intel` toggle) and
Skills tabs. Config must persist on save and must not silently drop the toggle
state. The Skills tab links/unlinks/reorders this agent's skills; every write
posts the **full** ordered `skill_ids` set (there is no per-link enable —
"enabled for this agent" is link/unlink), and a real change (added, removed,
or reordered — not a same-set re-post) must bump the agent's version.

## `/skills`

Lists workspace skills as a searchable rail, each card showing its type,
source, and Stats-tab counters (agent count, pull %, accept %) from the
`GET /skills` list response — must not fire one stats request per card. `Add
Skill` offers **Create from scratch** and **Import from file** (`.md`/`.zip`)
only; nothing is persisted from an import until the preview is confirmed, and
an archive's non-markdown entries must be listed as skipped, never executed.

## `/skills/:id`

Same rail, with a skill selected and a four-tab editor: **Config** (name,
description, type, body, enabled, an optional "what changed?" note — a body
edit bumps the version), **Preview** (rendered markdown, exactly as the
reviewing agent receives it — an imported skill's untrusted-wrap notice shows
here), **Stats** (agent count, pull frequency, accept rate, findings by
category — every null-data field must render `—`, never a misleading `0%`),
and **Versions** (body-snapshot history; `Diff` compares a past snapshot
against the current body, `Restore` appends a new version rather than
rewinding history — never available on the current version's own row).

## `/settings/:section`

`api-keys` and `models` sections. Must never render a stored secret value —
only whether a key is set.

## `/onboarding`

Add-repository form. Submitting must not require the repo to already be
indexed — indexing happens after import, asynchronously.
