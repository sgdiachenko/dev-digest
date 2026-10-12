# Implementation Plan: Multi-Agent Review

## Goal & scope
- **In scope:**
  - `POST /pulls/:id/review` accepts `agent_ids` and creates a group (`multi_agent_runs` plus linked `agent_runs`).
  - Group members run in parallel, isolated from each other.
  - New `GET /pulls/:id/multi-agent` returns the latest group with deterministic finding groups and per-member takes.
  - New `GET /runs/estimates` returns per-agent averages over the agent's last 5 `done` runs. This is the additive read the spec allows at spec line 410.
  - Client: Configure screen `/repos/:repoId/multi-agent`, results page `/repos/:repoId/multi-agent/:number`, the PR-page picker in `RunReviewDropdown`, and a GLOBAL nav item.
  - All copy goes in `client/messages/en`.
- **Out of scope:**
  - Everything the spec lists as non-goals (spec lines 33-49): SSE for the group, a stale banner, semantic matching, a group-size cap, Learn and Reply backends, group cancel, retry, server truncation.
  - e2e flow files. Those belong to `test-writer`; see Review handoff.
  - AC-45 and NFR-1, the 1-vs-3 measurement. It is manual by spec decision D-8 (spec line 582), needs a real LLM, and is a post-implementation task for the user.
  - Changing `review-api.ts`. The response's `multi_agent_run_id` lives in the local route schema (`server/src/modules/reviews/routes.ts:21-27`), so the MCP-mirrored `review-api.ts` is untouched.

## Decisions
- **Spec:** 2026-10-09-multi-agent-review (approved), `docs/specs/2026-10-09-multi-agent-review.md`.
- **REC:** none were raised.
- **Accepted deviations. Do not revert either.**
  - **D-12:** the picker footer link is labelled "Configure multi-agent run…" and opens `/repos/:repoId/multi-agent?pr=<number>`. The existing "Configure agents…" item stays and still opens `/agents` (`client/src/app/repos/[repoId]/pulls/[number]/_components/RunReviewDropdown/RunReviewDropdown.tsx:81`).
  - **D-14:** `mcp-server/src/vendor/shared/contracts/platform.ts` is re-copied byte-for-byte from the server copy, with no MCP logic change. This is required by `scripts/check-shared-sync.sh:68-87`.
- **Planner decisions inside the spec:**
  - `all: true` and single `agentId` runs keep the sequential loop. Only groups run in parallel (AC-7).
  - A `running` member's take is `no_result`, because no review row is stored until the run finishes (`server/src/modules/reviews/run-executor.ts:364`).
  - Grouping uses every stored finding of the member reviews; dismissed findings are not filtered out. This follows AC-17, "references only".
  - Columns are ordered by agent name (case-insensitive), with deleted agents last, then by `run_id`. Takes follow column order.
  - `FindingGroup.id` equals the anchor finding's id, so it is stable and never persisted.
  - The preselected PR travels as `?pr=<number>`. The trace drawer on the results page uses `?trace=<run_id>`, accepted only for member runs.

## Execution mode
**Multi-agent.** The user decided this, with at most three packages. Server and client slices are independent once the contracts are fixed verbatim (Appendix A).

## Work packages
| WP | Steps | owns | depends-on | wave |
|---|---|---|---|---|
| W1 — server | S1–S7 | `server/src/vendor/shared/contracts/observability.ts`, `server/src/vendor/shared/contracts/platform.ts`, `mcp-server/src/vendor/shared/contracts/platform.ts` (re-copy only), `server/src/db/schema/runs.ts`, `server/src/db/migrations/**` (new generated files + `meta/`), `server/src/modules/reviews/**`, `server/test/multi-agent-helpers.test.ts`, `server/test/run-executor-parallel.test.ts`, `server/test/multi-agent-service.test.ts`, `server/test/multi-agent.it.test.ts` | — | 1 |
| W2 — client foundation, Configure, PR picker | S8–S13 | `client/src/vendor/shared/contracts/observability.ts`, `client/src/vendor/shared/contracts/platform.ts`, `client/src/lib/hooks/multi-agent.ts`, `client/src/lib/hooks/multi-agent.test.tsx`, `client/src/lib/hooks/index.ts`, `client/src/lib/hooks/reviews.ts`, `client/src/components/truncated-text/**`, `client/src/vendor/ui/nav.ts`, `client/src/components/app-shell/AppShell.test.tsx`, `client/messages/en/multiAgent.json`, `client/messages/en/common.json`, `client/src/app/repos/[repoId]/multi-agent/page.tsx`, `client/src/app/repos/[repoId]/multi-agent/helpers.ts`, `client/src/app/repos/[repoId]/multi-agent/helpers.test.ts`, `client/src/app/repos/[repoId]/multi-agent/_components/**`, `client/src/app/repos/[repoId]/pulls/[number]/_components/RunReviewDropdown/**`, `client/src/app/repos/[repoId]/pulls/[number]/_components/PrDetailHeader/**`, `client/src/app/repos/[repoId]/pulls/[number]/page.tsx` | — | 1 |
| W3 — results page | S14–S18 | `client/src/app/repos/[repoId]/multi-agent/[number]/**`, `client/messages/en/multiAgentResults.json` | W2 (needs W1 only at runtime) | 2 |

- **Overlap check:** no path is owned by two packages. W2 owns only the direct children of `multi-agent/` listed above; `multi-agent/[number]/**` belongs only to W3. Each contract file has exactly one owner per copy.
- **Dependency check:** W3 (wave 2) uses only W2's outputs (client contract types, hooks, `TruncatedText`, `common` keys). W1 and W2 share nothing except the contract text, which is fixed verbatim in Appendix A.
- **End-of-wave-1 gate (main session):** run `./scripts/check-shared-sync.sh`. If it reports drift, the server copy is authoritative: run `./scripts/check-shared-sync.sh --fix`, which copies server → client and the MCP subset (`scripts/check-shared-sync.sh:40-49`), then re-run client typecheck and tests.

## Context
- **Today's code:**
  - `RunRequest` has only `agentId` and `all` (`server/src/vendor/shared/contracts/platform.ts:289-293`).
  - The route parses the body by hand and reports a ZodError as 422 (`server/src/modules/reviews/routes.ts:55`, `server/src/app.ts:144-160`).
  - The executor loop is sequential (`server/src/modules/reviews/run-executor.ts:203-240`).
  - The diff and intent are loaded once and fanned out over a `RunLogger` (`run-executor.ts:142-201`).
  - Each member narrows the logger to its own run with `forRun` (`run-executor.ts:259`, `server/src/platform/run-logger.ts:56-58`).
  - RunBus state is keyed per run (`server/src/platform/sse.ts:20-24`).
  - Grounding drops are logged per run (`reviewer-core/src/review/run.ts:249-253`), so AC-72 and AC-73 need tests only, no new code.
  - `multi_agent_runs` exists but nothing writes it (`server/src/db/schema/runs.ts:43-51`).
  - The multi-agent contracts have no consumers (`git grep` finds only the contract files).
- **INSIGHTS that shaped the plan:**
  - Pure-add schema diffs avoid drizzle-kit's interactive prompt (`server/INSIGHTS.md`, 2026-09-18 drizzle-kit entry).
  - `server/test/**` is not type-checked; use a temporary tsconfig (2026-09-30 entry).
  - `no-sideways-module-imports` applies (2026-09-24 entry).
  - `MockLLMProvider` returns one fixture for every agent (2026-09-16 "latest round" entry). The parallel and isolation tests therefore use fakes, as in `server/test/run-executor-project-context.test.ts:120-160`.
  - `fireEvent` instead of `userEvent` (`client/INSIGHTS.md`, 2026-09-27).
  - Test providers must include every namespace that gets mounted (2026-09-24).
  - No literal `<tag>` inside message strings (2026-09-18).
  - Run `pnpm exec next typegen` when a new route folder makes typecheck fail (2026-09-30).
  - The hidden automation tab pauses polling (2026-09-30).
  - Already in place: `activeKeyFor` maps `/multi-agent` (`client/src/components/app-shell/helpers.ts:28`) and `shell.json` has `nav["multi-agent"]` (`client/messages/en/shell.json:31`). Message files load automatically per namespace (`client/src/i18n/request.ts:17-25`).
- **Vendored UI limits:**
  - `Dropdown` items are buttons that close the panel on click (`client/src/vendor/ui/kit/Dropdown.tsx:12-15`), so the picker needs its own popover.
  - Vendored `Tabs` has no ARIA tab roles (`client/src/vendor/ui/kit/Tabs.tsx:24-45`), so the results page needs its own tabs.
- **Design:** none. The spec says no design file was supplied in this pass (spec line 432).

## Affected modules
| Package | Lanes (routing.md) | Package manager | Checks |
|---|---|---|---|
| server | 1, 2, 4, 5, 6, 7, 13, 14, 17–20 | pnpm | `pnpm -C server lint` · `pnpm -C server typecheck` · `pnpm -C server arch:check` · `pnpm -C server exec vitest run --exclude '**/*.it.test.ts'` (integration via `pnpm -C server exec vitest run .it.test`, CI only) |
| mcp-server (contract copy only) | 21 | pnpm | `pnpm -C mcp-server typecheck` · `pnpm -C mcp-server test` |
| client | 1, 2, 9, 10, 11, 12, 13, 17–20 (contracts) | pnpm | `pnpm -C client lint` · `pnpm -C client typecheck` · `pnpm -C client test` |
| repo root | 2 | — | `./scripts/check-shared-sync.sh` |

## Constraints
- **C1.** Onion layering:
  - The service takes ports, never the container.
  - Only `repository.ts` and `repository/*.repo.ts` import drizzle or `db/*`.
  - `helpers.ts` stays pure.
  - No new port and no change to `container.ts`; `AgentsReader` already exposes `getById` and `listEnabled` (`server/src/modules/reviews/service.ts:37-40`).
  - `pnpm -C server arch:check` must stay clean.
  - Source: onion-architecture; `server/AGENTS.md`.
- **C2.** Thin routes:
  - Declare Zod `params` and `response` schemas.
  - Keep the existing tolerant `RunRequest.parse(req.body ?? {})`.
  - One service call per route.
  - Errors are `ValidationError` (422), `NotFoundError` (404) or `ConflictError` (409, `details: { multi_agent_run_id }`) from `server/src/platform/errors.ts`.
  - Source: fastify-best-practices; `server/AGENTS.md`.
- **C3.** One fact, one transaction:
  - The group row and its member `agent_runs` rows are written in ONE `db.transaction` inside the repository.
  - The transaction first locks the PR row (`SELECT … FOR UPDATE`, drizzle `.for('update')`).
  - It then checks whether the PR's latest group has a `running` member and returns a discriminated result. The service, not the repository, throws the 409.
  - Source: `server/AGENTS.md` (non-default conventions); drizzle-orm-patterns.
- **C4.** Shared contracts:
  - Paste Appendix A verbatim into both copies.
  - Re-copy the MCP `platform.ts` from the server with `cp`; never hand-edit it (D-14).
  - Do not touch `review-api.ts` or `adapters.ts`.
  - Source: root `AGENTS.md`; `scripts/check-shared-sync.sh:68-87`.
- **C5.** Migration:
  - One schema edit, then `pnpm -C server db:generate` exactly once. Because the diff is pure ADD, drizzle-kit does not prompt.
  - Never hand-name, edit or apply a migration; never run `db:migrate`.
  - Index the new FK column.
  - Source: root `AGENTS.md`; postgresql-table-design; `server/INSIGHTS.md` (2026-09-18).
- **C6.** Naming:
  - snake_case for wire fields and DB columns; camelCase for TS fields.
  - Zod consts and their types share a PascalCase name.
  - Enum values `cancelled` and `no_result` are lower_snake.
  - Source: root `AGENTS.md`.
- **C7.** Backward compatibility:
  - `agentId` and `all` behave exactly as today, including the 404 "Agent not found" and the 400 for an empty body (`service.ts:57-68`).
  - The response only gains `multi_agent_run_id` (`null` for the old modes).
  - `all: true` stays sequential.
  - New reads are additive.
  - Source: breaking-change; response-schema.
- **C8.** NFR-5 isolation:
  - Per-member state lives only in the logger returned by `runLog.forRun(runId)` and in the run's own RunBus key.
  - Add no new mutable instance or module state to the executor.
  - Each member job catches its own error; combine them with `Promise.allSettled`.
  - Source: spec NFR-5; onion-architecture.
- **C9.** Untrusted input:
  - Agent ids are resolved through the workspace-scoped `getById`.
  - Unknown and foreign ids get the identical reason "agent not found", which takes precedence over "agent is disabled".
  - No server-side truncation.
  - Logs never contain the diff, a prompt or a secret.
  - The client renders LLM and error text as text, never with `dangerouslySetInnerHTML`.
  - URL params are whitelisted (`view`, `agent`, `trace`, `pr`).
  - Source: security; spec *Untrusted inputs*.
- **C10.** Client data:
  - Data is fetched only through `src/lib/hooks/*` → `src/lib/api.ts`.
  - Server state lives in TanStack Query.
  - Source: `client/AGENTS.md`.
- **C11.** i18n:
  - Every visible string comes from `client/messages/en/<ns>.json`.
  - No `<word>` inside a message string.
  - Every test's `NextIntlClientProvider` includes every namespace that gets mounted. That means `multiAgent` and `common` in the `RunReviewDropdown` test, and `common` wherever `TruncatedText` renders.
  - Source: `client/AGENTS.md`; `client/INSIGHTS.md` (2026-09-18, 2026-09-24).
- **C12.** Component layout:
  - One component per file under `_components/<Name>/<Name>.tsx`, with `<Name>.test.tsx` beside it.
  - Pages stay thin.
  - Pure logic goes in `helpers.ts`.
  - No more than about 200 lines per component.
  - Compute derived values; don't store them in state. View and agent selection live in the URL.
  - Source: root `AGENTS.md`; react-best-practices; frontend-architecture.
- **C13.** Tests:
  - vitest; `fireEvent`, not `userEvent`.
  - Mock at the boundary (hooks or fetch).
  - DB tests end in `.it.test.ts`.
  - Prove new server test files compile with a temporary tsconfig (`include: ["src/**/*.ts", "<test files>"]`), then delete it.
  - Source: `client/INSIGHTS.md` (2026-09-27); `server/INSIGHTS.md` (2026-09-30); react-testing-library.
- **C14.** Compose vendor UI; don't patch it:
  - Reuse `Checkbox`, `Button`, `Drawer` and the like from `@devdigest/ui`.
  - The picker popover and the ARIA tabs are new components in the feature.
  - The only `vendor/ui` edit is the `NAV` data in `nav.ts`.
  - Source: `client/AGENTS.md` (do-not-touch).
- **C15.** Accessibility (NFR-8):
  - Interactive targets are at least 24×24 px with a visible focus ring.
  - Status is shown as text plus an icon.
  - Column status changes go to a polite `aria-live` region.
  - Escape closes the picker.
  - Tabs follow the WAI-ARIA pattern (roles, `aria-selected`, arrow keys, Home, End).
  - Disabled checkboxes expose their disabled state.
  - Source: spec NFR-8; react-best-practices (accessibility).
- **C16.** Do not revert D-12 or D-14.
  - Source: spec lines 586 and 588.

## Steps

### S1 — Server contracts and MCP re-copy
- **package:** W1
- **files:**
  - modify `server/src/vendor/shared/contracts/observability.ts`: replace the block from the top of the file through `export type MultiAgentRun …;` (current lines 1-86) with Appendix A §1.
  - modify `server/src/vendor/shared/contracts/platform.ts`: replace the `RunRequest` block (current lines 288-293) with Appendix A §2.
  - re-copy `mcp-server/src/vendor/shared/contracts/platform.ts` with `cp server/src/vendor/shared/contracts/platform.ts mcp-server/src/vendor/shared/contracts/platform.ts`.
- **skills:** zod (lane 2), typescript-expert (lane 13), response-schema (lane 18)
- **constraints:** C4, C6, C7, C16
- **covers:** contract part of AC-12, AC-13, AC-18, AC-21, AC-49, AC-53, AC-55; NFR-10
- **reuse:** `Severity` (`server/src/vendor/shared/contracts/findings.ts:11`)
- **done-when:**
  - `diff` of the server and MCP `platform.ts` is empty.
  - `pnpm -C server typecheck` passes.
  - `pnpm -C mcp-server typecheck` and `pnpm -C mcp-server test` pass.
- **depends-on:** —

### S2 — Schema link and generated migration
- **package:** W1
- **files:**
  - modify `server/src/db/schema/runs.ts`:
    - Add `multiAgentRunId: uuid('multi_agent_run_id').references(() => multiAgentRuns.id, { onDelete: 'set null' })` to `agentRuns`. Either move `multiAgentRuns` above `agentRuns` or rely on the arrow reference.
    - Add index `agent_runs_multi_agent_run_idx` on `multi_agent_run_id`.
    - Add index `multi_agent_runs_pr_ran_idx` on `(pr_id, ran_at)`.
    - Use the object-style index callback, as in `server/src/db/schema/context.ts:46`.
  - create `server/src/db/migrations/<auto-named>.sql` and its `meta/` updates, only through `pnpm -C server db:generate`.
- **skills:** postgresql-table-design and drizzle-orm-patterns (lane 7)
- **constraints:** C5, C6
- **covers:** AC-1 (the link); NFR-10 (nullable, set null)
- **done-when:**
  - Exactly one new migration exists. It holds an `ADD COLUMN "multi_agent_run_id" uuid`, an FK with `ON DELETE set null`, and two `CREATE INDEX` statements, and nothing else.
  - `pnpm -C server typecheck` passes.
  - Nothing was applied.
- **depends-on:** —

### S3 — Repository: group create, group read and estimates
- **package:** W1
- **files:**
  - create `server/src/modules/reviews/repository/multi-agent.repo.ts` with:
    - `createGroupWithRuns(db, { workspaceId, prId, agents: { agentId, provider, model }[] })`. One transaction: lock the PR row `FOR UPDATE`; read the latest group (`ran_at desc, id desc`); if that group has a `running` member, return `{ kind: 'conflict', groupId }`; otherwise insert the group and N runs (`status 'running'`, `source 'local'`, `multiAgentRunId`) and return `{ kind: 'created', groupId, runIds }`.
    - `latestGroupForPull(db, workspaceId, prId)`.
    - `groupMembers(db, groupId)`: runs left-joined with agent name.
    - `reviewsForRuns(db, runIds)`: `kind = 'review'` with findings.
    - `doneRunEstimates(db, workspaceId)`: one query using `row_number() over (partition by agent_id order by ran_at desc)`, keeping `rn <= 5` and `status = 'done'`, then `avg(duration_ms)`, `avg(cost_usd)` and `count(*)` per agent. `avg` already ignores nulls.
  - modify `server/src/modules/reviews/repository.ts`: add façade methods for these.
- **skills:** drizzle-orm-patterns and onion-architecture (lane 6), typescript-expert (lane 13)
- **constraints:** C1, C3, C6
- **covers:** AC-1, AC-6, AC-12, AC-21 (data), AC-53 (left join), NFR-2 (bounded queries)
- **reuse:** `createAgentRun` insert shape (`server/src/modules/reviews/repository/run.repo.ts:136-158`); left-join pattern (`run.repo.ts:42-66`); `reviewsForPull` (`server/src/modules/reviews/repository/review.repo.ts`)
- **done-when:**
  - `pnpm -C server typecheck` and `arch:check` are clean.
  - Exercised by T4 in S7.
- **depends-on:** S2

### S4 — Pure grouping, takes and aggregates
- **package:** W1
- **files:**
  - modify `server/src/modules/reviews/helpers.ts`. Add:
    - `groupFindings(findings)`. Implements the EC-6 anchor rule: sort by `(file, start_line, end_line ?? start_line, id)` with string comparison; a finding joins only if it overlaps the **anchor** and its run is not yet in the group; group range is min/max; group id is the anchor id.
    - `takesFor(group, members)`. Highest severity, else `ignored` for `done`, else `no_result`. `running`, `failed` and `cancelled` all count as `no_result`. `note` is `''`.
    - `isConflict(takes)`.
    - `buildMultiAgentRun(group, pull, members, reviews)`. Builds columns, status mapping (unknown → `failed`), `total_duration_ms` as the max of known durations (0 when none), `total_cost_usd` as the sum of known costs (`null` when none), and one `Conflict` per finding group.
  - create `server/test/multi-agent-helpers.test.ts`.
- **skills:** onion-architecture (lane 5), typescript-expert (lane 13)
- **constraints:** C1, C6
- **covers:** AC-13, AC-15, AC-16, AC-17 (pure part), AC-18, AC-19, EC-5, EC-6, EC-7, EC-8, EC-14
- **done-when:** T1 passes under the server unit command.
- **depends-on:** S1

### S5 — Parallel executor mode
- **package:** W1
- **files:**
  - modify `server/src/modules/reviews/run-executor.ts`:
    - `executeRuns(workspaceId, pull, repo, jobs, logger?, opts?: { parallel?: boolean; groupId?: string })`.
    - Move the body of the current `for` loop (lines 203-240) into a local `runJob(job)` that returns the run's final status.
    - Sequential mode (the default) keeps `for…of await`.
    - Parallel mode runs `await Promise.allSettled(jobs.map(runJob))`, then logs one line, `logger?.info({ multiAgentRunId, runs: [{ runId, status }] }, 'review: group finished')`.
    - The diff, intent and `failAll` code stays untouched.
  - create `server/test/run-executor-parallel.test.ts`.
- **skills:** onion-architecture (lane 5)
- **constraints:** C7, C8, C9
- **covers:** AC-7 (sequential unchanged), AC-8, AC-9, AC-10, AC-11, AC-72, AC-73 (unit), EC-3, EC-11, NFR-3, NFR-5, NFR-9
- **reuse:** fakes and `ReviewRunExecutor` wiring from `server/test/run-executor-project-context.test.ts:120-160`; real `RunBus` (`server/src/platform/sse.ts`)
- **done-when:** T2 passes. In the barrier case, the sequential default must time out, which proves the parallel path is what makes T2 pass.
- **depends-on:** —

### S6 — Service: validate, start the group, read the group, estimates
- **package:** W1
- **files:**
  - modify `server/src/modules/reviews/service.ts`:
    - **`resolveGroupTargets(workspaceId, body)`:**
      - `agent_ids` combined with `agentId` or `all` → `ValidationError`.
      - Dedupe the ids; fewer than 2 distinct → `ValidationError`.
      - Resolve every id with `agents.getById`. If any is missing → `ValidationError('agent not found')`. Only then: if any is disabled → `ValidationError('agent is disabled')`.
    - **`runGroupReview(workspaceId, prId, agents, logger)`:**
      - `getPull` → `NotFoundError`; `getRepo`.
      - `createGroupWithRuns`; a conflict result → `ConflictError('…', { multi_agent_run_id })`.
      - Fire-and-forget `executeRuns(…, { parallel: true, groupId })`.
      - Return `{ runs, reviews: [], multi_agent_run_id }`.
    - **`multiAgentForPull(workspaceId, prId)`:** `getPull` → `NotFoundError`; no group → `null`; otherwise `buildMultiAgentRun`.
    - **`agentRunEstimates(workspaceId)`.**
    - Existing methods stay unchanged.
  - create `server/test/multi-agent-service.test.ts` (fakes, no DB).
- **skills:** onion-architecture (lane 5), security (lane 14), typescript-expert (lane 13)
- **constraints:** C1, C3, C7, C9
- **covers:** AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-14, AC-49, AC-50, AC-51, EC-15, EC-16, NFR-4, NFR-6, NFR-7
- **reuse:** `runReview` flow (`server/src/modules/reviews/service.ts:114-149`); errors (`server/src/platform/errors.ts:20-35`)
- **done-when:** T3 passes.
- **depends-on:** S3, S4, S5

### S7 — Routes and integration test
- **package:** W1
- **files:**
  - modify `server/src/modules/reviews/routes.ts`:
    - `RunReviewResult` gains `multi_agent_run_id: z.string().nullable()`.
    - In `POST /pulls/:id/review`: if `body.agent_ids !== undefined`, call `resolveGroupTargets` then `runGroupReview`. Otherwise use the existing path and add `multi_agent_run_id: null`.
    - New `GET /pulls/:id/multi-agent`: `{ params: IdParams, response: { 200: MultiAgentRun.nullable() } }`.
    - New `GET /runs/estimates`: `response: { 200: z.array(AgentRunEstimate) }`.
    - Update the route list in the header comment.
  - create `server/test/multi-agent.it.test.ts`.
- **skills:** fastify-best-practices and onion-architecture (lane 4), security (lane 14), breaking-change (lane 17), response-schema (lane 18)
- **constraints:** C2, C7, C9
- **covers:** AC-1–AC-7, AC-12, AC-14, AC-17, AC-49, AC-50, AC-51, AC-53, AC-55, AC-72, AC-73, EC-9, EC-12, NFR-2, NFR-6, NFR-10
- **reuse:** harness, `REVIEW_FIXTURE` (one finding is dropped by grounding) and `setupRepoAndPr` from `server/test/reviews.it.test.ts:1-80`; `waitForPrRuns` (`server/test/helpers/runs.ts`)
- **done-when:**
  - T4 is written and compiles under a temporary tsconfig. It is run in CI, not by the implementer.
  - The full server check table passes.
- **depends-on:** S6

### S8 — Client contract copies
- **package:** W2
- **files:**
  - modify `client/src/vendor/shared/contracts/observability.ts` with Appendix A §1 (same replacement as S1).
  - modify `client/src/vendor/shared/contracts/platform.ts` with Appendix A §2.
- **skills:** zod (lane 2)
- **constraints:** C4, C6
- **covers:** contract part of the client ACs (types only)
- **done-when:**
  - `pnpm -C client typecheck` passes.
  - Both edited regions match Appendix A character for character. The byte check runs at the wave-1 gate.
- **depends-on:** —

### S9 — Data hooks
- **package:** W2
- **files:**
  - create `client/src/lib/hooks/multi-agent.ts`:
    - `multiAgentPollInterval(data)`: 3500 if any column is `running`, else `false`.
    - `useMultiAgentRun(prId)`: key `["multi-agent", prId]`, `refetchInterval` from the poll function.
    - `useAgentRunEstimates()`: key `["agent-run-estimates"]`.
    - `useStartMultiAgentReview()`: POST `{ agent_ids }` only. On success, invalidate `multi-agent`, `reviews`, `pr-active-runs` and `pr-runs` for the PR. Response type is a local interface, `ReviewRunResponse & { multi_agent_run_id: string | null }`.
  - modify `client/src/lib/hooks/index.ts`: export the new module.
  - modify `client/src/lib/hooks/reviews.ts`: `useFindingAction.onSuccess` also invalidates `["multi-agent", prId]`.
  - create `client/src/lib/hooks/multi-agent.test.tsx`.
- **skills:** frontend-architecture (lane 11), react-testing-library (lane 12)
- **constraints:** C10, C13
- **covers:** AC-27, AC-29, AC-34, AC-66 (request body), EC-8, EC-13
- **reuse:** `useRunReview` and `useFindingAction` patterns (`client/src/lib/hooks/reviews.ts:139-185`); `api` (`client/src/lib/api.ts:66-74`)
- **done-when:** T5 passes; `pnpm -C client typecheck` passes.
- **depends-on:** S8

### S10 — Shared `TruncatedText`
- **package:** W2
- **files:**
  - create `client/src/components/truncated-text/TruncatedText/TruncatedText.tsx`, `index.ts` and `TruncatedText.test.tsx`. Behaviour: one line with an ellipsis; a keyboard-operable expand button with `aria-expanded` that shows the full text.
  - modify `client/messages/en/common.json`: add `truncate.expand` and `truncate.collapse`.
- **skills:** react-best-practices and frontend-architecture (lane 10), react-testing-library (lane 12)
- **constraints:** C11, C12, C15
- **covers:** AC-54, EC-4, NFR-8 (expand control)
- **done-when:** T6 passes.
- **depends-on:** —

### S11 — Copy and navigation
- **package:** W2
- **files:**
  - create `client/messages/en/multiAgent.json`. It holds the `configure.*` and `picker.*` keys, including "PICK AGENTS TO RUN", "Clear", "Configure multi-agent run…", "disabled", "no data", "Run multi-agent review ({count})", "≈", "~" and the disabled-reason texts.
  - modify `client/src/vendor/ui/nav.ts`: append `{ section: "GLOBAL", items: [{ key: "multi-agent", label: "Multi-Agent Review", labelKey: "nav.multi-agent", icon: "Layers", href: "/repos/:repoId/multi-agent" }] }`. Use an existing `IconName`.
  - modify `client/src/components/app-shell/AppShell.test.tsx`: add a case for the new section.
- **skills:** frontend-architecture (lane 11), react-testing-library (lane 12)
- **constraints:** C11, C14
- **covers:** AC-43, NFR-11
- **reuse:** `nav["multi-agent"]` (`client/messages/en/shell.json:31`); `activeKeyFor` (`client/src/components/app-shell/helpers.ts:28`)
- **done-when:** T7 passes.
- **depends-on:** —

### S12 — Configure screen
- **package:** W2
- **files:**
  - create `client/src/app/repos/[repoId]/multi-agent/page.tsx`. Thin: `AppShell` plus `ConfigureForm`, and reads `?pr=`.
  - create `client/src/app/repos/[repoId]/multi-agent/helpers.ts` and `helpers.test.ts`, with these functions:
    - `estimateTotals(estimates, checkedIds)`
    - `startBlockReason({ checked, prSelected, loading, runningGroup })`
    - `preselectPr(param, pulls)`
    - `formatSeconds`
    - `formatCost`
  - create `_components/ConfigureForm/`, `_components/AgentChecklist/` and `_components/EstimateSummary/`, each with `<Name>.tsx` and `<Name>.test.tsx`:
    - The PR selector is built from `usePulls(repoId)`.
    - One checkbox per agent; disabled agents get a disabled checkbox and the "disabled" label.
    - A "≈" estimate per agent; "no data" when the agent has none.
    - Totals: the max of durations and the sum of costs.
    - The start button reads "Run multi-agent review (N)" and shows its disabled reason beside it.
    - While the selected PR's latest group has a running member (`useMultiAgentRun`), the button is disabled and links to the results page.
    - On success: `router.push('/repos/:repoId/multi-agent/:number')`.
    - On error: show `ApiError.message` as plain text and keep the selection.
    - On 409: show a link to the active group.
- **skills:** next-best-practices and frontend-architecture (lane 9), react-best-practices (lane 10), react-testing-library (lane 12)
- **constraints:** C9, C10, C11, C12, C13, C15
- **covers:** AC-20, AC-21, AC-22, AC-23, AC-24, AC-25, AC-26, AC-27, AC-28, AC-48, AC-54, AC-56, AC-71, EC-1, EC-2, EC-9, EC-10, EC-15, EC-16, NFR-8, NFR-11
- **reuse:**
  - `usePulls` (`client/src/lib/hooks/core.ts:100`), `useAgents` (`client/src/lib/hooks/agents.ts:8`), `Checkbox` (`client/src/vendor/ui/kit/Checkbox.tsx`)
  - `ApiError` (`client/src/lib/api.ts:8`)
  - the number → id lookup (`client/src/app/repos/[repoId]/pulls/[number]/page.tsx:38-39`)
- **done-when:**
  - T8 passes.
  - `pnpm -C client typecheck` passes; if `.next` is stale, run `pnpm -C client exec next typegen` first.
- **depends-on:** S9, S10, S11

### S13 — PR-page agent picker
- **package:** W2
- **files:**
  - modify `client/src/app/repos/[repoId]/pulls/[number]/_components/RunReviewDropdown/RunReviewDropdown.tsx`:
    - Replace the vendored `Dropdown` with a feature-local popover: a trigger button with `aria-expanded`; the panel closes on an outside click and on Escape.
    - Keep these items with identical behaviour: the merged warning, "Run all" → `{ all: true }`, each agent row's run button → `{ agentId }` (disabled agents too), "No agents yet — create one", and "Configure agents…" → `/agents`.
    - Add new props `repoId` and `prNumber`.
  - update `RunReviewDropdown.test.tsx`: also mock `lib/hooks/multi-agent` and add the `multiAgent` and `common` namespaces to the provider.
  - update `constants.ts` and `styles.ts` as needed.
  - create `RunReviewDropdown/_components/AgentPicker/AgentPicker.tsx` and `AgentPicker.test.tsx`:
    - The "PICK AGENTS TO RUN" heading and a "Clear" control.
    - One checkbox per agent with a "~" duration from `useAgentRunEstimates`, or "no data".
    - Disabled agents are not checkable.
    - The "Run multi-agent review (N)" button is disabled when N < 2, while agents are loading, or while the latest group is running. In the running case it shows a link to the results page.
    - Checking a box changes only the selection.
    - The run sends `agent_ids` and navigates to the results page.
    - Errors show inside the dropdown with the selection kept; a 409 shows a link.
    - Footer link "Configure multi-agent run…" → `/repos/:repoId/multi-agent?pr=<number>` (D-12).
  - modify `client/src/app/repos/[repoId]/pulls/[number]/_components/PrDetailHeader/PrDetailHeader.tsx`: add a `repoId` prop and pass `repoId` and `prNumber={pr.number}` to `RunReviewDropdown` (current line 90).
  - modify `client/src/app/repos/[repoId]/pulls/[number]/page.tsx`: pass `repoId` to `PrDetailHeader` (current line 156).
- **skills:** react-best-practices and frontend-architecture (lane 10), next-best-practices (lane 9, for `page.tsx`), react-testing-library (lane 12)
- **constraints:** C7, C10, C11, C12, C13, C14, C15, C16
- **covers:** AC-54, AC-57, AC-58, AC-59, AC-60, AC-61, AC-62, AC-63, AC-64, AC-65, AC-66, AC-67, AC-68, AC-69, AC-70, EC-2, EC-17, EC-18, EC-19, NFR-8, NFR-11
- **reuse:** current item logic (`RunReviewDropdown.tsx:41-83`); `Checkbox`; `Button`
- **done-when:** T9 passes, and the existing smoke case in `RunReviewDropdown.test.tsx` still passes.
- **depends-on:** S9, S10, S11

### S14 — Results copy and pure helpers
- **package:** W3
- **files:**
  - create `client/messages/en/multiAgentResults.json`. It covers the header ("parallel" run, never "fan-out"), view labels, statuses, "Deleted agent", "did not flag", "no result", "No findings", "Show only conflicts", "All agents agree", the no-findings empty text, "all agents failed", the empty state and its Configure link, "View trace", "Learn", "coming soon", the polling error, and the live-region text.
  - create `client/src/app/repos/[repoId]/multi-agent/[number]/helpers.ts` and `helpers.test.ts`, with these functions:
    - `parseView(param)`: returns `columns` or `tabs`; anything else gives `columns`.
    - `resolveAgentTab(param, columns)`: must be a member `run_id`, else the first column.
    - `resolveTraceRun(param, columns)`
    - `agentLabel(col, t)`: returns "Deleted agent" when `agent_id` is null.
    - `visibleConflicts(conflicts, onlyConflicts)`
    - `agreementState(conflicts, onlyConflicts)`: returns `list`, `allAgree` or `noFindings`.
    - `allMembersFailed(columns)`
    - `findingsForRun(reviews, runId)`
    - `statusMeta(status)`: icon and message key.
- **skills:** frontend-architecture and next-best-practices (lane 9), react-testing-library (lane 12)
- **constraints:** C9, C11, C12
- **covers:** AC-32, AC-33 (selection), AC-38, AC-39, AC-40, AC-44, AC-52, NFR-11
- **done-when:** T10 passes.
- **depends-on:** W2

### S15 — Columns mode
- **package:** W3
- **files:**
  - create `.../[number]/_components/AgentColumnCard/` and `.../[number]/_components/ColumnsView/`, each with `<Name>.tsx` and `<Name>.test.tsx`:
    - Each card shows the name via `TruncatedText`, a status label plus icon, duration and cost.
    - A failed column shows its `error` via `TruncatedText`.
    - A done column with zero findings shows "No findings".
    - Finding titles and paths are truncated.
    - A "View trace" button calls `onOpenTrace(run_id)`.
    - `ColumnsView` holds one polite `aria-live` region that summarises column statuses.
- **skills:** react-best-practices and frontend-architecture (lane 10), react-testing-library (lane 12)
- **constraints:** C9, C11, C12, C13, C15
- **covers:** AC-30, AC-31, AC-46, AC-52, AC-54, EC-3, EC-5, EC-12, NFR-8
- **reuse:** `TruncatedText` (S10); severity UI from `@devdigest/ui` (`SeverityBadge`)
- **done-when:** T11 passes.
- **depends-on:** S14

### S16 — Grouped findings and "Where agents disagree"
- **package:** W3
- **files:**
  - create `.../[number]/_components/GroupedFindings/` and `.../[number]/_components/DisagreementBlock/`, each with `<Name>.tsx` and `<Name>.test.tsx`:
    - `GroupedFindings` shows each group of 2 or more findings as one entry, listing every member's agent label and original title. Each item calls `onOpenFinding(run_id, finding_id)`.
    - `DisagreementBlock` lists file:lines and one cell per take: the severity, "did not flag" or "no result". It has a "Show only conflicts" toggle (`aria-pressed`) and distinct texts for "all agree" and "no findings".
- **skills:** react-best-practices and frontend-architecture (lane 10), react-testing-library (lane 12)
- **constraints:** C9, C11, C12, C13, C15
- **covers:** AC-36, AC-37, AC-38, AC-39, AC-52, AC-54, EC-7, NFR-8
- **done-when:** T12 passes.
- **depends-on:** S14

### S17 — Tabs mode
- **package:** W3
- **files:**
  - create `.../[number]/_components/AgentTabs/` and `.../[number]/_components/TabsView/`, each with `<Name>.tsx` and `<Name>.test.tsx`:
    - `AgentTabs` implements the ARIA tablist (roving `tabIndex`, arrow keys, Home and End).
    - `TabsView` renders `FindingCard` for the selected run's findings. `onAction` calls `useFindingAction` with `prId`. "Turn into eval case" uses `useEvalCaseLauncher` and `EvalCaseModal`. A focused or expanded card is passed in from `onOpenFinding`.
    - Each card gets a disabled "Learn" button with the text "coming soon". There is no Reply control.
- **skills:** react-best-practices and frontend-architecture (lane 10), react-testing-library (lane 12)
- **constraints:** C10, C11, C12, C13, C14, C15
- **covers:** AC-33, AC-34, AC-35, AC-52, AC-54, NFR-8
- **reuse:** `FindingCard` (`client/src/components/finding-card/FindingCard/FindingCard.tsx:26-47`); `useEvalCaseLauncher` and `EvalCaseModal` (`client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx:10,34-35,96,103`)
- **done-when:** T13 passes.
- **depends-on:** S14

### S18 — Results container and page
- **package:** W3
- **files:**
  - create `.../[number]/_components/MultiAgentResults/MultiAgentResults.tsx` and `MultiAgentResults.test.tsx`:
    - Data: `useMultiAgentRun(prId)` and `usePrReviews(prId)`.
    - Loading shows skeletons.
    - `null` data shows the empty state with a link to `/repos/:repoId/multi-agent`.
    - A query error while data exists keeps the last data and shows plain error text; polling continues.
    - If every member failed, show the group message with each column's error and hide the disagreement block.
    - The header says "parallel".
    - A mode switch drives `?view=` and the tabs drive `?agent=`, both through `router.replace`.
    - `?trace=<member run_id>` mounts `RunTraceDrawer` with `running` set to that column's `status === 'running'`, that run's findings and its agent label.
  - create `client/src/app/repos/[repoId]/multi-agent/[number]/page.tsx`. Thin: params; `usePulls` maps the number to `prId`; `AppShell` wraps `MultiAgentResults`.
- **skills:** next-best-practices and frontend-architecture (lane 9), react-best-practices (lane 10), react-testing-library (lane 12)
- **constraints:** C9, C10, C11, C12, C13
- **covers:** AC-29 (display), AC-31, AC-32, AC-40, AC-41, AC-42, AC-44, AC-47, EC-2, EC-8, EC-13
- **reuse:**
  - `RunTraceDrawer`, imported from `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer` (props at `RunTraceDrawer.tsx:19-29`); see R6.
  - `usePrReviews` (`client/src/lib/hooks/reviews.ts:44`).
  - the PR page's number → id and `?trace=` pattern (`page.tsx:38-39,82,224-232`).
- **done-when:**
  - T14 passes.
  - The full client check table passes.
  - `grep -rn dangerouslySetInnerHTML client/src/app/repos/[repoId]/multi-agent` finds nothing.
- **depends-on:** S15, S16, S17

## Test plan
- **T1, written in S4, unit, `server/test/multi-agent-helpers.test.ts`:**
  - **AC-15:** only same-file findings overlapping the anchor and from a different run join; a missing `end_line` counts as `start_line`.
  - **AC-16 / EC-6:** shuffled input gives identical groups and ids.
  - **EC-14:** the a/b/c chain gives exactly `{A,B}` and `{C}`.
  - **AC-18:** a flagging run's take is its highest severity; a done run that did not flag gets `ignored`; failed, cancelled and running runs get `no_result`.
  - **AC-19:** a group is a conflict if a done member did not flag it, or if severities differ; `no_result` takes are ignored.
  - **EC-5:** a done run with 0 findings gives `ignored` in every group.
  - **EC-7:** a failed member never triggers a conflict.
  - **EC-8:** with one member running, groups are built from the stored findings only.
  - **AC-13:** total duration is the max of known durations (0 when none); total cost is the sum of known costs (`null` when none).
  - **AC-17 (pure):** the input findings deep-equal their state before grouping, and groups hold ids only.
- **T2, written in S5, unit, `server/test/run-executor-parallel.test.ts`:**
  - **AC-8:** with a barrier, all 3 LLM calls start before any resolves.
  - **AC-8 / NFR-3:** the diff is loaded once, intent is derived once, and there are exactly 3 LLM calls.
  - **AC-9 / EC-3:** when agent B's provider throws, B ends `failed` with its error while A and C end `done`.
  - **EC-11:** `bus.cancel(B)` → B `cancelled`, the others `done`.
  - **AC-10:** a throwing diff load fails all runs with "Failed to load PR diff: …".
  - **AC-11 / NFR-5:** each saved trace log contains only its own `Starting review with agent "X"` line plus the shared diff and intent lines.
  - **AC-72 / AC-73:** each run's `grounding` and its own `grounding dropped "<title>": <reason>` line, and none from another member.
  - **NFR-9:** exactly one logger line carries the group id, member ids and statuses, and no diff text.
  - **AC-7:** the default mode runs the calls sequentially.
- **T3, written in S6, unit, `server/test/multi-agent-service.test.ts`:**
  - **AC-2:** duplicate ids give one run per distinct id.
  - **AC-3:** unknown and foreign ids give 422 "agent not found", with an identical message.
  - **AC-50:** a disabled id gives 422 "agent is disabled".
  - **EC-16:** a disabled plus an unknown id gives "agent not found".
  - **AC-4:** fewer than 2 distinct ids, or `agent_ids` combined with `agentId` or `all`, gives 422 and `createGroupWithRuns` is never called.
  - **AC-5:** a missing PR gives 404.
  - **AC-6:** a conflict result gives 409 with `details.multi_agent_run_id`.
  - **NFR-4:** 5 enabled agents are accepted.
  - **AC-14 / AC-51:** a foreign PR gives 404; a PR with no group gives `null`.
  - **NFR-7:** no body field other than `agent_ids` is used.
- **T4, written in S7, integration, `server/test/multi-agent.it.test.ts`. Runs in CI; not run by the implementer.**
  - **AC-1 / AC-49:** a POST with 3 ids returns 200, one group row, 3 linked runs, and `multi_agent_run_id` equal to the group id.
  - **AC-2 / AC-3 / AC-4 / AC-5 / AC-50:** status codes and `error.message`, with zero new `agent_runs`.
  - **AC-6 / EC-9:** a second POST while the group runs returns 409 with details.
  - **AC-7:** `agentId` and `all` return `multi_agent_run_id: null`, with no group and unlinked runs.
  - **AC-12:** the GET returns columns with status, error, duration, cost and findings.
  - **AC-14:** a foreign PR returns 404.
  - **AC-51:** a PR with no group returns 200 with body `null`.
  - **AC-53 / EC-12:** after the agent is deleted, the column's `agent_id` and `agent_name` are null while its takes and findings are kept.
  - **AC-55:** a 4,000-character title, path and error come back in full.
  - **AC-17:** finding rows are unchanged after the GET.
  - **AC-72 / AC-73:** each member trace has `stats.grounding` "1/2 passed" and its own line 999 dropped-finding entry.
  - **NFR-2:** p95 ≤ 300 ms over 20 GETs (5 runs, 200 findings).
  - **NFR-6:** a failed member stays failed with no new run.
  - **NFR-10:** deleting the group keeps the runs with a null link; older runs are not grouped.
  - **AC-21 (server):** `GET /runs/estimates` averages over the last 5 done runs and ignores failed ones.
- **T5, written in S9, unit, `client/src/lib/hooks/multi-agent.test.tsx`:**
  - **AC-29 / EC-8 / EC-13:** the poll interval is 3500 while any column is running, and `false` otherwise or for null data.
  - **AC-27 / AC-66:** the POST body is exactly `{ agent_ids }`.
  - **AC-34:** `useFindingAction` invalidates both `["reviews", prId]` and `["multi-agent", prId]`.
- **T6, written in S10, component, `TruncatedText.test.tsx`:**
  - **AC-54 / EC-4:** the collapsed text has an ellipsis style; Enter on the expand button sets `aria-expanded="true"` and shows the full text.
- **T7, written in S11, component, `AppShell.test.tsx`:**
  - **AC-43 / NFR-11:** exactly one GLOBAL item, labelled "Multi-Agent Review" from the `shell` catalog, links to `/repos/<repo>/multi-agent`.
- **T8, written in S12, unit and component, `multi-agent/helpers.test.ts`, `ConfigureForm.test.tsx`, `AgentChecklist.test.tsx`, `EstimateSummary.test.tsx`:**
  - **AC-20:** a PR selector plus one checkbox per agent.
  - **AC-21:** "≈" plus the average per agent.
  - **AC-22:** "no data" for an agent without done runs, excluded from the totals.
  - **AC-23:** totals are the max of durations and the sum of costs.
  - **AC-24:** the button label shows N.
  - **AC-25:** disabled with a reason; with 1 agent the reason points to Run Review.
  - **AC-56 / EC-1:** disabled agents have a disabled checkbox and the "disabled" label; the note about needing 2 enabled agents appears.
  - **EC-2:** skeletons while loading, and the button stays disabled.
  - **AC-26:** a running group disables the button and shows a results link.
  - **AC-27:** the POST sends `agent_ids` and the router pushes `/repos/r/multi-agent/482`.
  - **AC-28 / EC-10 / EC-15 / EC-16:** 422, 404, 429 and network errors show their reason text with the selection kept.
  - **AC-48:** a 409 shows a link.
  - **AC-71:** `?pr=999` preselects nothing; `?pr=482` preselects that PR.
  - **AC-54:** a long agent name is truncated.
- **T9, written in S13, component, `RunReviewDropdown.test.tsx`, `AgentPicker.test.tsx`:**
  - **AC-57:** the heading, "Clear" and one checkbox per agent.
  - **AC-58:** "~6s".
  - **AC-59:** "no data".
  - **AC-60:** a disabled agent's checkbox is disabled.
  - **AC-61:** Clear unchecks every agent.
  - **AC-62:** the label shows N.
  - **AC-63:** disabled below 2.
  - **AC-65:** checking a box never calls the mutation.
  - **AC-64:** "Run all" sends `{ all: true }`; a row click sends `{ agentId }`, including for a disabled agent.
  - **AC-66:** the run sends `agent_ids` and navigates.
  - **AC-67:** the footer links to `/repos/r/multi-agent?pr=482`.
  - **AC-68 / EC-19:** the reason shows inside the dropdown and the checked agents stay checked.
  - **AC-69 / EC-17:** a 409 shows a link.
  - **AC-70:** a running group disables the button and shows a link.
  - **EC-18:** fewer than 2 enabled agents keeps the button disabled; with no agents, the "No agents yet" item shows.
  - **D-12:** "Configure agents…" still goes to `/agents`.
  - **NFR-8:** Escape closes the popover.
  - **AC-54:** long names are truncated.
- **T10, written in S14, unit, `multi-agent/[number]/helpers.test.ts`:**
  - **AC-32:** an invalid view or non-member agent falls back to the defaults.
  - **AC-52:** a null agent gives "Deleted agent".
  - **AC-38 / AC-39:** the agreement states.
  - **AC-40:** every member failed.
  - **AC-33:** findings are filtered by `run_id`.
- **T11, written in S15, component, `ColumnsView.test.tsx`, `AgentColumnCard.test.tsx`:**
  - **AC-30:** each of the 4 statuses shows its text plus an icon.
  - **AC-46 / EC-3:** a failed column shows its error text.
  - **EC-5:** "No findings".
  - **AC-31:** "View trace" calls the callback with the `run_id`.
  - **AC-52 / EC-12:** "Deleted agent".
  - **AC-54:** expand works.
  - **NFR-8:** the `aria-live="polite"` region updates.
- **T12, written in S16, component, `GroupedFindings.test.tsx`, `DisagreementBlock.test.tsx`:**
  - **AC-36:** a group of 2 or more lists each agent and title and opens the original finding.
  - **AC-37:** cells show the severity, "did not flag" or "no result".
  - **AC-38:** the toggle filters the list.
  - **AC-39:** "all agree" and "no findings" are different texts.
  - **AC-52:** a "Deleted agent" cell.
  - **EC-7:** a failed member shows "no result".
- **T13, written in S17, component, `TabsView.test.tsx`, `AgentTabs.test.tsx`:**
  - **AC-33:** the selected run's cards show confidence, the suggestion, Accept, Dismiss and "Turn into eval case".
  - **AC-34:** Accept calls the mutation with `prId`.
  - **AC-35:** Learn is disabled with "coming soon"; there is no Reply control.
  - **NFR-8:** roles, `aria-selected`, and ArrowRight, Home and End.
- **T14, written in S18, component, `MultiAgentResults.test.tsx`:**
  - **AC-42:** `null` data shows the empty state with the Configure link.
  - **AC-41:** an error after data keeps the data and shows the error.
  - **AC-40:** all members failed shows the message, the errors, and no disagreement block.
  - **AC-44:** the header contains "parallel" and not "fan-out".
  - **AC-32:** view and agent are restored from the URL and updated through `router.replace`.
  - **AC-31 / AC-47:** `?trace=<running member>` mounts the drawer with `running`.
  - **AC-29 (display):** a refetch updates the statuses.
- **Commands:** as in the *Affected modules* table, plus `./scripts/check-shared-sync.sh`.
- **Multi-agent:** implementers run their targeted tests and the typecheck of their package. The main session runs the full table once per wave, and the sync gate after wave 1.

## Risks & open questions
- **R1. Contract drift between parallel W1 and W2, plus the MCP copy.**
  - Mitigation: Appendix A verbatim; the wave-1 gate; `--fix` from the server as the fallback.
  - The MCP copy must come from `cp`, never from editing (`scripts/check-shared-sync.sh:68-87`).
  - For: main session.
- **R2. NFR-5 concurrency.**
  - RunBus and `forRun` are already per run (`server/src/platform/sse.ts:20-24`, `server/src/platform/run-logger.ts:56-58`).
  - Remaining shared state, by inference:
    - The `container.llm()` and repo-intel caches may build twice under concurrency; this is benign.
    - `markReviewed` writes the same row concurrently; it is idempotent.
    - The DB pool has `max: 10` (`server/src/db/client.ts:27`). Large groups queue on it.
  - T2 pins log and trace isolation.
  - For: architecture reviewer.
- **R3. The 409 guard is a check-then-insert.**
  - Without the `FOR UPDATE` lock in C3, a double click can create two groups (EC-9).
  - For: implementer and security reviewer.
- **R4. Migration.**
  - Generated, never applied: developers and e2e must run `pnpm db:migrate` by hand. The integration fixture runs migrations itself (`server/test/helpers/pg.ts:3`).
  - The FK references `multi_agent_runs`, which is declared later in `runs.ts`; this is why the arrow reference is needed.
  - For: user.
- **R5. Fastify serialization of a 200 `null` body with `MultiAgentRun.nullable()` (AC-51) is unverified.**
  - T4 asserts it. If it fails, ask the researcher how fastify-type-provider-zod and Fastify 5 serialize a `null` payload.
  - For: researcher.
- **R6. `RunTraceDrawer` is imported across routes, from `pulls/[number]/_components`.**
  - ESLint allows `app → app` (`client/eslint.config.mjs:56-84`), but it is a frontend-architecture Rule-of-Two smell.
  - Moving the drawer to `src/components/` is out of the spec's owned paths.
  - For: architecture reviewer.
- **R7. Spec gaps decided in the plan.**
  - A running member's take is `no_result`.
  - Dismissed findings still count as "flagged".
  - Columns are ordered by agent name.
  - For: user, to confirm or revise through `spec-creator` if wrong.
- **R8. Polling looks stuck in browser-automation tabs.**
  - React Query pauses intervals when the tab is hidden (`client/INSIGHTS.md`, 2026-09-30).
  - For: manual verifier.

## Review handoff
- **Architecture:**
  - The executor's parallel mode, `allSettled` and the per-run logger (S5).
  - Repository transaction and lock (S3).
  - No new port or container change.
  - `helpers.ts` purity.
  - Cross-route `RunTraceDrawer` import (R6).
  - Custom picker popover and ARIA tabs instead of patching vendor UI.
- **Security:**
  - `agent_ids` validation and the identical not-found message (C9, AC-3).
  - The PR scope on both GETs. `GET /runs/estimates` is scoped by `workspace_id`.
  - The group request multiplies LLM cost: rate limit 10/min (`server/src/modules/reviews/routes.ts:51`) plus the 409.
  - URL params `view`, `agent`, `trace` and `pr`.
  - LLM and error text rendered as plain text.
- **API compatibility:**
  - `POST /pulls/:id/review` gains a request field and a response field, both additive.
  - New `GET /pulls/:id/multi-agent` and `GET /runs/estimates`.
  - The `MultiAgentRun`/`AgentColumn`/`ConflictTake` nullability and enum widening have no consumers.
  - MCP `ReviewRunResponse` strips the unknown field (`mcp-server/src/api/client.ts:46-50`).
  - Lanes 17–20.
- **Tests (e2e, for `test-writer`):** flows under `e2e/specs/` for AC-20, AC-26, AC-27, AC-29, AC-31, AC-33, AC-47, AC-57, AC-66, AC-67, AC-70, AC-72 and AC-73. The spec lists these at spec line 555. `e2e/` is a separate package; its check is `npm --prefix e2e run typecheck`.
- **Docs (`doc-writer`):** `server/docs/api-contracts.md` (new routes and the `agent_ids` body), `client/README.md` route map, the spec registry status. `docs/multi-agent-review-measurement.md` (AC-45) is written by the user after a real-LLM run.
- **Manual verification:**
  - NFR-8: keyboard order, focus rings, 24 px targets, the aria-live announcement.
  - Live polling and drawer streaming on a running group in a visible tab.
  - AC-45 / NFR-1 measurement.
  - No DOM-measurement steps.

## Not found / gaps
- A per-agent "last 5 done runs" read. Searched the `agents` and `reviews` routes and `AgentStats` (`server/src/vendor/shared/contracts/observability.ts:96-118`); nothing fits. Hence `GET /runs/estimates` in S7.
- A shared contract for the POST review response used by the server route. The route uses a local `RunReviewResult` (`routes.ts:21-27`); `ReviewRunResponse` (`review-api.ts:56-61`) is client- and MCP-side only. It is kept unchanged.
- A checkbox-capable dropdown or an ARIA-compliant tabs component in `client/src/vendor/ui/kit`. None exists.
- A design image for this feature. None in the repo (spec line 432).

## Appendix A — verbatim contract text (W1 S1 and W2 S8 paste exactly this)

§1 `contracts/observability.ts`: replaces everything from line 1 through `export type MultiAgentRun = z.infer<typeof MultiAgentRun>;`. The rest of the file, from `// Per-agent Stats` onward, is unchanged.
```ts
import { z } from 'zod';
import { Severity } from './findings.js';

/**
 * A5 — Observability / Multi-agent contracts (L07).
 *
 * These are NEW contracts (A5 owns this file; the barrel re-exports it). They
 * sit alongside A2's `review-api.ts`:
 *   - MultiAgentRun        the response of GET /pulls/:id/multi-agent
 *   - AgentColumn          one member run's column in the multi-agent view
 *   - FindingGroup         findings of different member runs grouped by location
 *   - Conflict / ConflictTake  what each member run said about one finding group
 *   - AgentRunEstimate     per-agent averages over its last 5 done runs (GET /runs/estimates)
 *   - AgentStats           per-agent quality aggregates (GET /agents/:id/stats)
 *   - CuratorResult        the cross-session memory curator outcome
 *
 * The single-document run trace itself stays in `contracts/trace.ts` (RunTrace).
 */

// ---------------------------------------------------------------------------
// Multi-Agent Review
// ---------------------------------------------------------------------------

/** A finding as surfaced in a multi-agent column (subset of FindingRecord). */
export const AgentColumnFinding = z.object({
  id: z.string(),
  severity: Severity,
  category: z.string(),
  title: z.string(),
  file: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int().nullable(),
  kind: z.string().nullish(),
});
export type AgentColumnFinding = z.infer<typeof AgentColumnFinding>;

/** One member run's result column. `agent_id`/`agent_name` are null when the agent was deleted. */
export const AgentColumn = z.object({
  run_id: z.string(),
  agent_id: z.string().nullable(),
  agent_name: z.string().nullable(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  status: z.enum(['running', 'done', 'failed', 'cancelled']),
  error: z.string().nullable(),
  verdict: z.string().nullable(),
  score: z.number().int().nullable(),
  summary: z.string().nullable(),
  duration_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  findings: z.array(AgentColumnFinding),
});
export type AgentColumn = z.infer<typeof AgentColumn>;

/** Findings of different member runs about one location (anchor rule; not persisted). */
export const FindingGroup = z.object({
  id: z.string(),
  file: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int(),
  finding_ids: z.array(z.string()),
  run_ids: z.array(z.string()),
});
export type FindingGroup = z.infer<typeof FindingGroup>;

/** One member run's stance on a finding group. */
export const ConflictTake = z.object({
  run_id: z.string(),
  agent_id: z.string().nullable(),
  persona: z.string(),
  /** Highest severity if the run flagged it; 'ignored' when a done run did not; 'no_result' otherwise. */
  verdict: z.union([Severity, z.literal('ignored'), z.literal('no_result')]),
  note: z.string(),
});
export type ConflictTake = z.infer<typeof ConflictTake>;

/**
 * One entry per finding group. `is_conflict` = at least one done member did
 * NOT flag it, or the flagging members gave different severities
 * ('no_result' takes do not count). Computed from persisted findings; not stored.
 */
export const Conflict = z.object({
  group_id: z.string(),
  file: z.string(),
  line: z.number().int(),
  end_line: z.number().int(),
  title: z.string(),
  is_conflict: z.boolean(),
  takes: z.array(ConflictTake),
});
export type Conflict = z.infer<typeof Conflict>;

/** Response of GET /pulls/:id/multi-agent (the PR's latest group). */
export const MultiAgentRun = z.object({
  id: z.string(),
  pr_id: z.string(),
  pr_number: z.number().int().nullish(),
  ran_at: z.string(),
  agent_count: z.number().int(),
  /** Max of the members' known durations; 0 when none is known. */
  total_duration_ms: z.number().int(),
  /** Sum of the members' known costs; null when none is known. */
  total_cost_usd: z.number().nullable(),
  columns: z.array(AgentColumn),
  finding_groups: z.array(FindingGroup),
  conflicts: z.array(Conflict),
});
export type MultiAgentRun = z.infer<typeof MultiAgentRun>;

/** Per-agent averages over the agent's last 5 `done` runs (GET /runs/estimates). */
export const AgentRunEstimate = z.object({
  agent_id: z.string(),
  runs: z.number().int(),
  avg_duration_ms: z.number().nullable(),
  avg_cost_usd: z.number().nullable(),
});
export type AgentRunEstimate = z.infer<typeof AgentRunEstimate>;
```

§2 `contracts/platform.ts`: replaces the `RunRequest` block.
```ts
// ---- Run request (review trigger; owned by A2, contract lives here) ----
export const RunRequest = z.object({
  agentId: z.string().optional(),
  all: z.boolean().optional(),
  /** Multi-agent group: ids of 2+ enabled agents of the workspace (checked by the service). */
  agent_ids: z.array(z.string().min(1)).optional(),
});
export type RunRequest = z.infer<typeof RunRequest>;
```