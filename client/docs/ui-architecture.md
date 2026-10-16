# client — UI architecture

Deeper reference for the route map summarized in [`../AGENTS.md`](../AGENTS.md)
and diagrammed in [`../README.md`](../README.md#ui-route-map).

## Data flow

`page.tsx` → a hook from `src/lib/hooks/*` → `src/lib/api.ts` → the Fastify
API at `NEXT_PUBLIC_API_BASE`. No component calls `fetch` directly — this is
what makes the vitest suite work without a real API (only `src/lib/api.ts`'s
`fetch` needs mocking).

Hooks are grouped by domain, not by page:

- `hooks/core.ts` — repos, pulls, polling
- `hooks/reviews.ts` — runs, findings, accept/dismiss
- `hooks/agents.ts` — agent CRUD + `useAgentSkills`/`useSetAgentSkills` (an
  agent's linked, ordered skills)
- `hooks/skills.ts` — skill CRUD, versions/restore, file import (L02), and
  `useSkillStats(id, period)` (`GET /skills/:id/stats?from&to`, enabled only
  with an id and a resolved period; see
  [Agent Performance](#agent-performance-and-skill-stats))
- `hooks/agent-stats.ts` — `useAgentPerformance(period)`, `useAgentStats(id, period)`,
  `useAgentRunHistory(id, period, page)` and the `agentStatsKeys` query keys
- `hooks/repo-intel.ts` — index state, resync
- `hooks/tour.ts` — `useRepoTour`, `useGenerateNarrative` (see
  [Onboarding Tour](#onboarding-tour-hooks-and-view))
- `hooks/trace.ts` — SSE run-trace subscription
- `hooks/intent.ts` — `usePrIntent(prId)` (query on `GET /pulls/:id/intent`,
  cached `PrIntentRecord | null`, never triggers the model) and
  `useDeriveIntent(prId)` (mutation on `POST /pulls/:id/intent`; on success
  writes the response straight into the `["pr-intent", prId]` query cache, on
  error surfaces a toast via `notify.error`) — backs the Overview tab's
  `IntentCard` (see [`../specs/pages.md`](../specs/pages.md#pullsnumber))

TanStack Query owns all server-state caching; there is no separate global
store (Redux/Zustand). Local-only UI state (open/closed, form drafts) stays
in component state or `src/lib/*.tsx` context providers (`repo-context.tsx`,
`theme.tsx`, `toast.tsx`).

## Onboarding Tour: hooks and view

Route `/repos/:repoId/tour` (`src/app/repos/[repoId]/tour/page.tsx`, a thin entry
inside `<Suspense>`). Behaviour contract: [pages.md](../specs/pages.md#reposrepoidtour).
Server side: [api-contracts.md](../../server/docs/api-contracts.md#onboarding-tour).
Route map: [README](../README.md#ui-route-map).

- **Hooks** (`src/lib/hooks/tour.ts`, re-exported from `hooks/index.ts`).
  `useRepoTour(repoId)` queries `GET /repos/:id/tour` under key
  `["repo-tour", repoId]` and sets `refetchInterval` to 1,500 ms only while
  `narrative.status === "generating"`; otherwise it fetches once per mount or
  invalidation (`tour.ts:11-20`, covered by `lib/hooks/tour.test.tsx`).
  `useGenerateNarrative(repoId)` posts `POST /repos/:id/tour/narrative` and
  invalidates that key on success; the refetch flips the status and starts the
  polling (`tour.ts:23-31`). Neither hook calls an LLM on read.
- **View.** `OnboardingTourView` (`_components/OnboardingTourView/`) owns the
  expanded-section state, the scroll-spy and the live-region announcements. Section
  components are presentational and live under its `_components/`: `TourHeader`,
  `StatusBanner`, `TourUnavailable`, `OnThisPage`, `NarrativeControls`,
  `NarrativeStatus`, `NarrativeMarkdown` and one component per section. Pure helpers
  (`parseHash`, `buildMarkdown`, `fileUrl`, `summaryArgs`, `relativeTime`, `formatUsd`,
  `currentPathsOf`) are in `helpers.ts`, with tests.
- **Resync wiring (D1).** In the `not_cloned` state the button calls
  `useRefreshRepo` (`POST /repos/:id/refresh`); the index-status banner calls
  `useResyncRepoIntel` (`POST /resync`)
  (`OnboardingTourView.tsx`, `resync` and `StatusBanner onResync`). For `not_indexed`
  the view polls `useRepoIntelStatus` (1,500 ms) and refetches the tour when the
  indexed SHA changes; a completion between the first fetch and the first poll is
  missed (reports, W11 review notes).
- **Summary text (D2).** The architecture summary is rendered from
  `messages/en/onboarding.json` using `summaryArgs`, not from the server's
  `architecture.summary`; the server string is used only by the Markdown export.
- **Narrative rendering (D4).** `NarrativeMarkdown` links only `repo:` hrefs, turned
  into SHA-pinned GitHub URLs by `fileUrl` (`target=_blank`, `noopener noreferrer`)
  after percent-decoding; every other `href` renders as text, `javascript:` and
  `data:` are dropped, and raw HTML is shown as text. A directory link relies on a
  trailing `/` in the path.
- **Diagrams.** The facts diagram is built client-side by
  `ArchitectureSection/mermaid.ts` (generated node ids; paths only in escaped quoted
  labels). The shared `MermaidDiagram` got an additive `onInvalid` prop, called once
  per transition into the invalid state, so the AI diagram can fall back to the
  facts diagram ("AI diagram unavailable"). The consumer must pass a stable
  callback. Mermaid runs with `securityLevel: "strict"`
  (`components/mermaid-diagram/MermaidDiagram.tsx:51`).
- **Navigation.** `vendor/ui/nav.ts` has a new `onboarding-tour` item between Pull
  Requests and Project Context. `activeKeyFor` matches
  `/repos/:id/tour` for it and maps the `/onboarding` add-repository route to no
  active item (`components/app-shell/helpers.ts:26-33`). `lib/github-urls.ts` gained
  `githubTreeUrl` for directory links.
- **Layout gotcha.** The "On this page" rail is sticky; its wrapper needs
  `align-self: stretch` or it never sticks (`styles.ts:10-11`; see
  [INSIGHTS](../INSIGHTS.md)).

## Agent Performance and Skill Stats

Three screens share one set of building blocks, layered
`lib/agent-stats` -> `components/agent-stats` -> `app/*`:

- `/agent-performance` (`src/app/agent-performance/`), the agent Stats tab
  (`app/agents/[id]/_components/AgentEditor/_components/StatsTab/`) and the skill
  Stats tab and rail footer (`app/skills/**`).
- `src/lib/agent-stats/` — pure period, accept, breakdown and format helpers
  (`period.ts`, `accept.ts`, `breakdown.ts`, `format.ts`, none reads the clock;
  callers pass `now`) and three hooks: `usePeriodUrl`, `useRefreshFallback`,
  `useStatsFormat` (`Intl` formatters).
- `src/components/agent-stats/` — domain-neutral pieces (`PeriodControl`,
  `KpiCard`, `ShareDonut`, `AcceptRing`, `TrendSparkline`, `CostLabel`,
  `HoverHint`, `StatsErrorPanel`, `UpdatedStatus`, `NoRunsInPeriod`, ...,
  exported from `index.ts`). Messages come from `messages/en/agentPerformance.json`
  (the skill screens add `skills.json`), so a test provider that mounts these
  components needs the `agentPerformance` namespace (`renderWithMessages.tsx`).

### URL period params

The URL is the source of truth for the period: `range` is `1d`, `30d` or
`custom`; `from` and `to` are canonical ISO-8601 timestamps
(`lib/agent-stats/period.ts:89-110`, `parsePeriodParams`). `usePeriodUrl`
(`lib/agent-stats/usePeriodUrl.ts`) reads them and behaves like this:

- Missing or invalid params fall back to 30 days. `notice` is set when a link
  carried an unusable period. The fallback's "now" is taken at mount and
  **re-taken in the render where `enabled` flips to true**, so a hook mounted on
  another tab never queries a window anchored at mount. One effect then writes
  the window already shown to the URL, so the write does not change the query
  key a second time.
- `select(period)` writes the new period to the URL.
- `refresh({ isFetching, refetchSame })` is a no-op while a fetch runs. A preset
  (`1d`, `30d`) re-resolves to now and rewrites the URL, with the previous
  period saved in `refreshFrom` so `useRefreshFallback` can show its cached data
  while the new window loads; a custom range refetches as is.
- The pages pass `enabled`: always on `/agent-performance`; `tab === "stats"` on
  the agent page; `tab === "stats" && !!selectedId` in `SkillsView`.

### Topbar Refresh

`AppShell` takes an optional `onRefresh` prop and shows a Refresh action in the
Topbar when it is set (label from `shell.json` `topbar.refresh`). The callback
must be stable, or the shell context churns. The dashboard and `SkillsView`
pass one; the agent page passes one only on the Stats tab.

On the agent page Refresh also re-resolves the **left list's card period** (the
30-day figures of every `AgentCard`): `cardPeriod` is state, resolved once per
mount and again on Refresh, never in render. Repeated clicks while any
`agent-stats` query is fetching are a no-op, and the cards keep the last figures
(`lastPerf`) while the new window loads instead of blanking
(`agents/[id]/page.tsx:46-70`). The rail link to another agent keeps every
current query param (`agentHref`, `agents/[id]/helpers.ts`); the skills rail does the
same through `skillHref` (`skills/_components/SkillsView/helpers.ts:28-31`).

### Data rules

- Query keys put the period in the key (`agentStatsKeys`, `skillKeys.stats`);
  a 4xx is never retried, a network or 5xx failure once.
- Names (agent, model, skill, category, repository) render as plain text.
- The dashboard's state is decided by `dashboardState`
  (`pending`, `invalid`, `error`, `noAgents`, `noReviews`, `noRuns`, `data`);
  with figures on screen a failed refresh keeps them and shows a banner.
- Behavioural guarantees per screen: [specs/pages.md](../specs/pages.md#agent-performance).

## Route → component structure

Pages under `src/app/**/page.tsx` stay thin: data fetching + layout only.
Feature logic lives in colocated `_components/<Name>/` folders next to the
page that uses them, each with its own `*.test.tsx` — so a feature's tests
live next to the feature, not in a parallel test tree.

Cross-cutting chrome (top nav, breadcrumbs, the `g`-then-key shortcut
dispatcher) lives in `src/components/app-shell`, mounted once from
`layout.tsx`, not re-implemented per route.

## Vendored code

`src/vendor/ui` (`@devdigest/ui`) and `src/vendor/shared` (`@devdigest/shared`)
are copied in, not npm-installed — there's no version to bump, only a diff to
reconcile by hand against the source (the server's copy, for `shared`). See
root [AGENTS.md](../../AGENTS.md) for the sync convention.

## i18n

`next-intl` messages live in `messages/<locale>/*.json`. A page or component
that renders user-facing copy pulls it from there via the `next-intl` hooks —
it does not inline English strings, even though the starter only ships one locale.
