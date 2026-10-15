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
agents. Each card shows a stats line (`13 runs · 76% accept · $0.038 avg`) from
the agent's 30-day dashboard row (`AgentCard/_components/StatsLine`); the line
is absent while the figures load and for an agent with no row. The same card is
used in the `/agents/:id` left list.

## `/agents/:id`

Editor for one agent: Config (model, system prompt, `repo_intel` toggle) and
Skills tabs. Config must persist on save and must not silently drop the toggle
state. The Skills tab links/unlinks/reorders this agent's skills; every write
posts the **full** ordered `skill_ids` set (there is no per-link enable —
"enabled for this agent" is link/unlink), and a real change (added, removed,
or reordered — not a same-set re-post) must bump the agent's version.

**Stats tab** (`?tab=stats`): the agent's performance for one period, from
`GET /agents/:id/stats` and `GET /agents/:id/stats/runs`. Guarantees:

- The period control, its URL params (`range`, `from`, `to`) and the fallback to
  30 days are those of [Agent Performance](#agent-performance); the figures equal
  the agent's row on the dashboard for the same period.
- It shows KPI cards (runs, accept rate, average cost, average duration), most
  used skills (with a "runs without skill data" note), findings by severity and
  by category, and a paged run history (20 per page). Every null figure renders
  `—`, never `0`.
- "View trace" on a run opens that run's trace drawer on this page (`?trace=<run id>`),
  not the PR page; the drawer closes with its close button, a tab switch or an agent
  switch. On the dashboard, the run chart of an expanded row opens the agent's Stats tab.
- An unknown agent (`404`) leaves the tab; a rejected period (`422`) shows the
  period control's error and no figures; a load failure shows an error panel
  with Retry, or keeps the old figures with a failed-refresh status.
- Topbar Refresh is available only on this tab. A preset period re-resolves to
  now and updates the URL; a custom range refetches as is. It also re-resolves
  the left list's 30-day card figures, and the cards keep their last figures
  while the new window loads.
- Switching agents in the left list keeps `tab`, `range`, `from` and `to`.

## `/skills`

Lists workspace skills as a searchable rail, each card showing its type,
source, and a stats footer (`n agents · x% pull · y% accept`, with run and
decision counts on hover and focus) from the `GET /skills` list response for the
last 30 days — must not fire one stats request per card. A small sample (under
10 decided findings) shows a grey "small sample" text instead of an accept
percent, and an empty figure renders `—`. `Add
Skill` offers **Create from scratch** and **Import from file** (`.md`/`.zip`)
only; nothing is persisted from an import until the preview is confirmed, and
an archive's non-markdown entries must be listed as skipped, never executed.

## `/skills/:id`

Same rail, with a skill selected and a four-tab editor: **Config** (name,
description, type, body, enabled, an optional "what changed?" note — a body
edit bumps the version), **Preview** (rendered markdown, exactly as the
reviewing agent receives it — an imported skill's untrusted-wrap notice shows
here), **Stats** (`?tab=stats`: four cards — used by, pull frequency, accept rate,
findings — the agents using the skill and findings by category for a period;
every null-data field must render `—`, never a misleading `0%`),
and **Versions** (body-snapshot history; `Diff` compares a past snapshot
against the current body, `Restore` appends a new version rather than
rewinding history — never available on the current version's own row).

The skill Stats tab follows the same period rules as the agent Stats tab: the
period is in the URL, the default is 30 days, Refresh is wired in the Topbar, and
switching skills in the rail keeps the tab and the period (`skillHref`). Its
figures follow the agent rules (counted runs, decided findings): pull frequency
only counts runs that recorded a skill list, and the tab says how many runs have
no skill data. "Not used yet" replaces the date when the skill never ran.

## `/agent-performance`

Opens from the sidebar item "Agent Performance" or `g` then `m`. Shows, for one
period, how each review agent is doing, from `GET /agents/performance`.

- **Period.** Presets `1d` and `30d` (default `30d`) and a custom range of
  local dates, at most 366 calendar days and not ending in the future. The
  period is in the URL (`range`, `from`, `to`); a link with missing or unusable
  params falls back to 30 days and says so. A period the server rejects
  (`422`) shows no figures.
- **States.** Skeletons while loading; no agents (with a link to create one); no
  reviews yet (with a link to the pull requests); "No runs in this period" with
  a link to the last 30 days; an error panel with Retry. A refresh that fails
  with figures on screen keeps them and shows a banner.
- **KPI cards.** Runs (with a trend sparkline and the in-progress count), total
  cost (with the unknown-cost count and the change against the previous period),
  accept rate (pooled over all agents, with a small-sample note) and the
  most active agent.
- **Agents table.** One row per agent, enabled or not, plus a "Deleted agent"
  row when its runs exist. Sortable; a row expands to its last runs; the accept
  cell shows `76% · 13/17` and, under 10 decided findings, "small sample". A
  "View stats" link opens that agent's Stats tab with the same period.
- **Cost breakdown.** Donuts by agent and by model: top five plus "Other".
- **Cost label.** Every cost section carries the label with the meaning: cost
  is what DevDigest recorded (the amount OpenRouter reported, otherwise a
  DevDigest estimate from its price table), is not reconciled with provider
  billing, and runs without a recorded cost count as unknown
  (`messages/en/agentPerformance.json`, `cost.info`).
- **Text.** Agent, model and repository names render as plain text.
- Cost, duration and percent use `Intl` formatters, so values depend on the
  locale. Topbar Refresh re-resolves a preset period and refetches a custom one.

Not verified by a live check: 320 px and 200 % zoom on the Stats tabs, contrast
ratios, 24 px targets, keyboard-focus tooltips, native date inputs in all three
browsers, custom range, and skeleton timing (see the plan's *Open issues* in the
implementation record).

## `/settings/:section`

`api-keys` and `models` sections. Must never render a stored secret value —
only whether a key is set.

## `/repos/:repoId/tour`

The Onboarding Tour of one repository, reached from the sidebar item
**Onboarding Tour** (between Pull Requests and Project Context; active on this
route only). Design records:
[facts spec](../../docs/specs/2026-10-01-onboarding-tour-facts.md),
[narrative spec](../../docs/specs/2026-10-01-onboarding-tour-narrative.md); wiring in
[`../docs/ui-architecture.md`](../docs/ui-architecture.md#onboarding-tour-hooks-and-view).
Reading the page must never trigger a model call.

- **Facts sections.** Five collapsible sections in a fixed order: Architecture
  overview, Critical paths, How to run locally, Reading path, First tasks, each
  labelled "From repository facts" until its AI text exists. Paths are middle-truncated
  and link to GitHub pinned to the tour's commit; run-locally commands are numbered,
  show their source and a Copy button, and warn on lifecycle hooks and remote-code
  pipes.
- **Header.** Repository name, commit, "N indexed of M files", index status, Copy
  link, Export as Markdown (a client-side download) and **Generate narrative**
  with the model name and an approximate cost ("approx.").
- **"On this page".** A sticky rail on wide screens with scroll-spy
  (`aria-current` on the section in view); below 1,024 px it becomes a "Jump to"
  select. Activating an item expands the section, updates the hash and moves focus
  to the section heading. A known `#hash` scrolls to its section after load; an
  unknown one is ignored.
- **States.** Loading skeleton; load error with retry; `not_cloned` ("This
  repository is not cloned yet" plus a Resync button that calls `/refresh`, D1);
  `not_indexed` (polls the index state and reloads when a new SHA is indexed); a
  status banner for a `partial`, `degraded` or `failed` index (its Resync calls
  `/resync`).
- **Narrative.** Generate starts a background run; the button shows "Generating…",
  the page polls and announces the result in a polite live region without moving
  focus. A section with AI text is labelled AI-written, shows the model and
  generation time, and never replaces facts it cannot ground (it falls back to the
  facts version). A failed run keeps the last good narrative, shows the reason with
  Retry (plus a Settings link for `missing_key` and `no_structured_provider`), and a
  narrative for an older commit shows an **Outdated** chip and marks paths no longer
  in the index. A `429` shows a "too many requests" message. An invalid AI diagram
  falls back to the facts diagram with "AI diagram unavailable".

**Not verified.** In a live browser (read-only, no generation) these were checked:
sidebar item and highlight, header, facts rendering and the facts diagram,
"On this page" focus and scroll position, scroll-spy, the sticky rail (after a fix),
the narrow "Jump to" select (in a 900 px iframe) and the `not_cloned` state. Not
verified: live narrative generation with a real key (button state, polling,
announcement, AI labels, Outdated chip, diagram fallback, the 300 ms acknowledgement),
screen-reader, keyboard and contrast checks (facts NFR-6, narrative NFR-6), Export
download, Copy link and both Resync buttons, load-time console errors, latency
targets, and the e2e flow for this route (none exists; `06-onboarding` covers the
add-repository form only). Source: `docs/plans/onboarding-tour.reports.md`, *Phase 4*.

## `/onboarding`

Add-repository form. Submitting must not require the repo to already be
indexed — indexing happens after import, asynchronously.
