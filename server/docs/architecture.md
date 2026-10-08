# server — architecture

Deeper reference for the request/DI flow summarized in [`../AGENTS.md`](../AGENTS.md)
and diagrammed in [`../README.md`](../README.md#request--di-flow).

## Request lifecycle

1. **Plugins register before modules** (`helmet`, `cors`, `rate-limit`, SSE)
   so every feature module inherits them plus the shared error handler.
2. **Route-level Zod validation** (`fastify-type-provider-zod`) runs before
   the handler — invalid `params`/`body` short-circuits to `422`. The same
   schema also drives response serialization, so one definition does both jobs.
3. **The module handler** calls into its service, never an adapter directly.
4. **The service** gets every adapter it needs from `platform/container.ts`
   via constructor injection — it depends on a port (interface), never a
   concrete implementation.
5. **Adapters** are the only code that talks to the outside world: LLM
   (OpenAI/Anthropic via OpenRouter), GitHub (Octokit), git (simple-git),
   ast-grep/dependency-cruiser/graphology (repo-intel), Postgres (Drizzle).
   In tests, the container wires `src/adapters/mocks.ts` instead.
6. **Errors** thrown by a service reach the shared error handler: an `AppError`
   maps to its status, a validation failure is a `422`, anything else is a `500`
   inside a structured envelope — handlers never format their own error JSON.
7. Long-running review runs stream progress over **SSE** (`fastify-sse-v2`)
   rather than the service returning once at the end.

## DI container (`platform/container.ts`)

The container is the single place that decides which concrete adapter backs
each port. Swapping an adapter (e.g. a different LLM provider, or the mock
set for tests) means changing container wiring, not the services that consume
it. Services must never `new` an adapter — if a service needs something the
container doesn't provide yet, add it to the container, don't reach around it.

## Modules (`src/modules/<name>/`)

Each module is a self-contained Fastify plugin: `routes.ts` + a service, with
its own Zod schemas. Registered once each in `src/modules/index.ts` — adding
a feature module means one import + one `app.register`, not touching existing
modules. On boot, the engine reaps any run left in a `running` state from a
previous process (crash recovery for SSE-streamed reviews).

## Project Context catalog (`modules/project-context/`)

The module builds a per-repository catalog of Markdown documents and serves it
over three routes (`routes.ts:22-49`; see [api-contracts.md](api-contracts.md#project-context)).

- **Port.** `ProjectContextCatalog` (`modules/project-context/types.ts:16`) is
  the read port other modules (`context-attachments`) use;
  `ProjectContextService` implements it (`service.ts:49`). Other modules import
  only `constants.ts` or that port surface (`no-sideways-module-imports` counts
  type imports).
- **Memoized getter.** `container.projectContext` (`platform/container.ts:238-245`)
  is created once: routes, the scan job handler and any future consumer must
  share one instance because its single-flight scan map is per-instance.
- **Triggers.** A rebuild is enqueued as job `project-context-scan` after clone
  (`modules/repos/service.ts:86`) and after resync
  (`modules/repo-intel/service.ts:168-174`, best-effort, never changes the
  resync result). Resync does not depend on `REPO_INTEL_ENABLED` (spec Q-4).
  Rescan (`POST .../rescan`) fetches, advances the clone, then rebuilds.
- **Reads come from git objects.** `GitClient.listTree(repo, sha)` and
  `GitClient.readBlob(repo, oid, maxBytes?)` (`vendor/shared/adapters.ts:256-262`)
  list and read objects at the scanned SHA, never the working tree. Symlinks,
  gitlinks, dot-directories other than `.devdigest`, and `node_modules` /
  `vendor` / `.git` are excluded; a document is capped at 64 KB and a catalog at
  1,000 entries (`constants.ts:12-22`). `used_by` is filled from
  `ProjectContextStore.listUsage` (`repository.ts:115`, `service.ts:92`) with
  direct attachments only; `null` still means "usage unavailable".
- **Tokenizer port.** `Tokenizer` now lives in `vendor/shared/adapters.ts:268`
  next to the other ports; `adapters/tokenizer` keeps the implementation.
- **Persistence.** Tables `context_catalogs` and `context_docs`
  (`db/schema/project-context.ts`, migration `0016_famous_spot.sql`). Migrations
  do not run on boot.
- **Unreachable commit (Q-3).** If the scanned commit is gone after gc or
  re-shallow, the file route answers `404` with `reason: commit_unavailable`
  (`service.ts:115`) and the UI offers Rescan.

## Project Context attachments (`modules/context-attachments/`)

Lets a workspace owner pin catalog documents to an agent or a skill and injects
them into review runs. Routes and DTOs:
[api-contracts.md](api-contracts.md#project-context-attachments). Design record:
[attachments spec](../../docs/specs/2026-09-30-project-context-attachments.md#implementation).
Do not confuse the skill the attachments hang on (DB `skills` table) with
`.claude/skills/*` (see [`../INSIGHTS.md`](../INSIGHTS.md), 2026-09 entry on the word "skills").

- **Module.** `types.ts` (ports), `constants.ts` (`MAX_ATTACHMENTS = 20`,
  `RESOLVE_TIMEOUT_MS = 5_000`), `helpers.ts` (pure: `orderRunCandidates`,
  `planInjection`, `findDuplicates`, `touchedByDiff`, `formatContextLine`),
  `service.ts`, `routes.ts`. Registered in `modules/index.ts:17,48`; the service
  is a memoized container getter (`platform/container.ts:251`) because
  `ReviewRunExecutor` and the routes must share one instance.
- **Ports.** The service takes `AgentContextStore`, `SkillContextStore`
  (`types.ts:35,46`, implemented by `AgentsRepository` / `SkillsRepository`) and
  `ProjectContextCatalog`, never the container. `ReviewRunExecutor` takes the
  read port `ProjectContextForRun` (`types.ts:80`; constructor parameter
  `run-executor.ts:123`), which `ContextAttachmentsService` implements.
- **Catalog port additions.** `ProjectContextCatalog.resolveDocs`
  (`project-context/types.ts:29`, `service.ts:142`) reads documents only by
  `blobOid` at the catalog's `scanned_sha` through `GitClient.readBlob`, never
  the working tree. A path absent from the catalog or a failed blob read is
  `missing` per document (SPEC Q-2 settled as per-document `missing`);
  `symlink` stays in the skip-reason enum but is unreachable here because the
  scan excludes symlinks. `ProjectContextStore.listUsage` joins
  `agent_context_docs` / `skill_context_docs` for `used_by` (an accepted
  read-join of another module's tables inside `ProjectContextRepository`).
- **Persistence.** Migration `0017_rich_korg.sql` adds `agent_context_docs` and
  `skill_context_docs` (`db/schema/context-attachments.ts`): PK
  `(agent_id | skill_id, repo_id, path)`, `position`, and cascade foreign keys
  to agents/skills, repos and workspaces. There is **no foreign key to
  `context_docs`**, so a rescan (`replaceCatalog` deletes and reinserts every
  row) cannot delete a selection; a vanished document shows as `missing`. The
  migration is never applied on boot: run `pnpm -C server db:migrate`.
- **Agent save is one transaction.** `AgentsRepository.replaceContextDocs`
  (`agents/repository.ts:290`) locks the agent row `FOR UPDATE`, backfills a
  missing v1 snapshot from the pre-change state (seeded agents may have none),
  replaces the rows (`position` = index), and bumps the version and snapshots
  (`context_docs` in `config_json`) only if the ordered list changed. The skill
  equivalent does not touch the skill version.
- **Validation order (`putAgent` / `putSkill`).** Owner exists (404) ->
  duplicates (422) -> every `repo_id` resolves in the workspace through the
  catalog (422) -> only newly added pairs must exist in the catalog (422) ->
  replace -> return the view.

### Run-time flow: resolve -> fit -> inject -> trace

Diagram: [server/README.md](../README.md#run-time-injection-flow).

1. **Resolve.** `ReviewRunExecutor.runOneAgent` calls `buildProjectContext`
   (`run-executor.ts:307,531`) right after the skill blocks are built, once per
   agent run, so the document list and SHA are fixed for that run.
   `resolveForRun` is wrapped in `withTimeout(..., 5_000)` (`service.ts:205-207`).
   Candidates are the agent's attachments for the PR repository, then those of
   only the skills injected into this run, in order, deduplicated by path.
   Whole-block failure (no clone, no catalog row, timeout, any error) yields
   `kind: 'unavailable'` and the review continues without a block. On timeout the
   underlying `resolveDocs` is not cancelled.
2. **Fit.** `planInjection` keeps documents greedily within 8,000 estimated
   tokens (`PROJECT_CONTEXT_BUDGET_TOKENS`, `repo-intel/constants.ts:68`),
   skipping an oversized document as `over_budget` and continuing. The server
   then applies the engine's `fitProjectContext` (48,000 characters, whole
   documents dropped from the end); those drops are recorded as `over_budget`.
3. **Inject.** `specs` is passed to `reviewPullRequest` only when at least one
   document is kept (`run-executor.ts:347`), so a run with none builds a
   byte-identical prompt. The block goes into the user message only, each
   document in its own untrusted wrapper. In map-reduce the block is part of
   every chunk's prompt.
4. **Trace.** The success trace stores `specs_read` and `project_context`
   (`run-executor.ts:422-423`); the failure/cancel trace stores them too once
   resolution ran, and the block text only if the engine was entered
   (`engineEntered`, `run-executor.ts:321,475-480`).

The NFR-2 budget is read as at most 8,000 estimated input tokens **per LLM
call**; with map-reduce the Live log line says `× N calls`. The Live log also
carries `Project context: N docs, ≈T tokens`, a note per injected path that the
PR diff also touches, and a path-only note for documents with a secret warning
(`run-executor.ts:551-597`); none carries document text.

**Known limits.** The diff-path note cannot see a rename or deletion (the diff
has no old path). Secret notes cover only documents that survived the
48,000-character fit. `serialized_est_tokens` and `total_est_tokens` sum catalog
estimates, not rendered text. The editor's `would_skip` uses the token plan,
while the engine's character cap drops from the end, so a very character-dense
document can show as fitting in the editor yet be dropped at run time (review
ledger F1, accepted; matches AC-25).

## Onboarding Tour (`modules/onboarding/`)

Builds a five-section tour of a repository from facts, and overlays an optional
AI narrative. Routes and DTOs: [api-contracts.md](api-contracts.md#onboarding-tour).
Diagram: [server/README.md](../README.md#tour-read-and-narrative-generation-flow).
Design records: [facts spec](../../docs/specs/2026-10-01-onboarding-tour-facts.md),
[narrative spec](../../docs/specs/2026-10-01-onboarding-tour-narrative.md).

- **Two services, narrow ports.** `OnboardingService` (`service.ts`) builds and
  caches the facts; `OnboardingNarrativeService` (`narrative-service.ts`) reads and
  generates the narrative. Neither takes the container: they take
  `TourRepoStore` / `NarrativeStore` (implemented by `OnboardingRepository`, the
  only file that touches the database, `repository.ts:16`), `RepoIntel`, `GitClient`
  and injected functions (LLM factory, feature-model resolver, price estimate,
  token counter, `wrapUntrusted`, prompt loader) (`service.ts:66-72`,
  `narrative-service.ts:99-111`).
- **Container wiring.** `container.onboarding` and `container.onboardingNarrative` are
  memoized getters (`platform/container.ts:257-288`): the facts cache, the
  single-flight maps and the rate-limit windows are per-instance. The narrative
  needs the facts service and the facts service needs the narrative as its overlay,
  so the overlay is passed as a **lazy closure** (`{ forTour: (...a) =>
  this.onboardingNarrative.forTour(...a) }`) to avoid a construction cycle.
- **Pure folders.** `facts/` and `narrative/` hold pure functions only. The
  `pure-folders-are-pure` rule in `.dependency-cruiser.cjs` (new) forbids them
  from importing `db`, `adapters`, `platform`, a module's service, routes or
  repository, `fs`, or `fastify` / `drizzle-orm` / `postgres` / `simple-git` /
  `octokit` / `openai`. Two existing rules were widened so `narrative-service.ts`
  falls under them (`[a-z-]+-service`): no persistence in a use case, and no
  container in a service. `repo-intel/types.ts` is imported with `import type` only.
  Run `pnpm -C server arch:check`.
- **Facts are read from git objects, never executed.** `listTree` and `readBlob`
  (existing) plus the new `GitClient.grepAt` (`vendor/shared/adapters.ts`) list and
  read content at the index SHA. A file over 512 KiB, unreadable or not UTF-8 is
  skipped and counted in `index.files_skipped_by_tour`, never an error
  (`service.ts:150-165`). `grepAt` is called with three fixed server-chosen pattern
  sets (`TODO|FIXME`, `^package main`, `@SpringBootApplication`; `constants.ts:4-9`),
  each capped at 500 results and 3 per file; a failed grep returns `[]` and counts
  as one skipped item (`service.ts:167-181`).
- **Graph facts.** `repoIntel.getGraphFacts(repoId)` (`repo-intel/service.ts:724`) returns
  edges, ranks and per-file route/cron facts. See
  [repo-intel README](../src/modules/repo-intel/README.md#facade-repointel).
- **Cache.** Facts are cached in memory (LRU of 32) under
  `repoId:indexedSha:indexUpdatedAt`, so a reindex of the same SHA does not serve a
  stale entry; concurrent computes share one promise. Unavailable results are never
  cached (`service.ts:100-116, 199-205`, `constants.ts:2`). The cache and the single-flight
  maps assume one server process (plan R-B6, an inference).
- **Narrative storage.** The narrative is `jsonb` in the existing `onboarding` table:
  `{ narrative, generation }` validated by `StoredNarrativeState` on read
  (`narrative/types.ts`, `repository.ts:32-42`); an invalid stored value reads as
  absent. No migration was added.
- **Generation (`requestGeneration` -> `run`).** Order: rate limit (10 per minute
  per workspace) -> repo lookup -> facts -> join an in-flight run for that repo, or
  claim the slot synchronously -> write `generating` -> return `202`; the work runs
  detached (`narrative-service.ts:159-193`, `run` at `:208`). `run` calls
  `completeStructured` exactly once with `maxRetries: 0`, `httpRetries: 0`,
  `requireStructuredProviders: true`, a 60 s `withTimeout` and `maxTokens` 8,000.
  `JobRunner` is deliberately not used because it adds its own timeout and retries.
  Before each write the row is re-read and a result for a superseded generation id
  is discarded. A failure writes only `generation`, so the last good narrative
  survives; `classifyFailure` maps errors to a stored reason by error name
  (`narrative-service.ts:67-80`).
- **Untrusted input.** The model input (`narrative/input.ts`) contains only the
  facts, a 2,000-token repo map and at most 20 excerpts of 8 KiB, each framed with
  `wrapUntrusted`. `.env*` files are never sent, except example files by name. The
  system prompt is `src/prompts/onboarding.system.md`, rewritten for this feature.
- **Grounding of output.** `narrative/ground.ts` keeps only paths, command ids and
  task ids that exist in the facts, takes facts order over the model's, bounds text
  lengths, and falls back to the facts version per section (`fallback_sections`).
  `rewriteLinks` (`markdown-links.ts`) is D4: known paths become `repo:` links and
  every other link is reduced to text. `checkFlowchart` (`mermaid.ts`) accepts only a
  `flowchart` / `graph` of at most 20 nodes with no `click` or `%%{` line at line
  start (the client also renders with mermaid `securityLevel: strict`).
- **Logs.** Counts, reasons, ids and durations only (`sectionCounts`,
  `degradationReason`, `source_sha`, tokens, cost); never file text, prompts or model
  output.
- **Known limits.** The rate-limit token is taken before the repo lookup, so a join,
  `404` or `409` counts toward the 10 per minute (ledger F2, accepted). A generation
  older than 90 s is persisted as `interrupted` and may later flip to `ready` (F3,
  accepted). `BlobTooLargeError` is imported by value from `adapters/git` (ring 3
  -> 4); no rule forbids it and `intent/` and `project-context/` do the same (F7,
  accepted). `test/onboarding.it.test.ts` and `test/onboarding-narrative.it.test.ts` were type-checked but never run.

## Intent Layer pre-work

`ReviewRunExecutor.executeRuns` derives the PR's intent as shared pre-work,
right after loading the diff and before the per-agent loop, via the
`IntentDeriver` port (`deriveForReview`) — `modules/reviews/run-executor.ts:44-50,159-169`.
The port may throw; it is the executor's own `try/catch` around the call that
makes derivation non-fatal (an `Intent unavailable — continuing without it`
Live Log line, plus a `logger.warn`), not the port swallowing the error
itself — see [`../specs/review-flow.md`](../specs/review-flow.md#intent-derivation-best-effort-non-fatal)
for the guarantee and [`../README.md#intent-layer`](../README.md#intent-layer)
for the full derivation sequence + diagram.

`IntentService` is wired in `platform/container.ts`'s `intentService()`, from
ports (`IntentStore`, a `GitHubClient` factory, `GitClient`, an `LLMProvider`
factory, a feature-model resolver) — never the container itself
(`container.ts:138-146`). It is **memoized**, like every other
container-provided repository/service: `modules/intent/routes.ts` and
`reviewService()` (→ `ReviewRunExecutor`) each resolve it once, at their own
plugin's registration, and both must land on the same instance — its
single-flight in-memory map is per-instance, so an unmemoized factory would
let a manual `POST` and a background review-triggered derive each hit the
model instead of sharing one in-flight run.

`resolveFeatureModel`/`getFeatureModelOverride` (`modules/settings/feature-models.ts`)
take a local `HasDb` interface rather than `Container`, specifically so
`container.ts` can call them directly (composition-root-only wiring) without
creating a `feature-models.ts ⇄ container.ts` import cycle that
`pnpm arch:check`'s `no-circular` rule would reject — `Container` still
satisfies `HasDb` structurally, so every pre-existing route-level call site
(`resolveFeatureModel(c, …)`) keeps compiling unchanged
(`modules/settings/feature-models.ts:19-21`).

## Secrets

`SecretsProvider` is the only abstraction services see. The **one** place
that reads `process.env` for a secret is `LocalSecretsProvider`
(`src/adapters/secrets/local.ts`); it prefers `~/.devdigest/secrets.json`
(mode `0600`, written by the Settings UI) and falls back to env vars.
`GITHUB_TOKEN` is canonical; `GITHUB_PAT` is accepted as a fallback.

## Database

Drizzle schema lives in `src/db/schema/`, one file per domain (`core`,
`repos`, `pulls`, `reviews`, `agents`, `runs`, `repo-intel`, `context`,
`knowledge`, `eval`, `ci`, `skills`, `ops`). The starter server only reads
and writes a subset of these tables; the rest exist because later course
lessons feed them — they sit empty, not unused code to delete.

Migrations are plain SQL under `src/db/migrations/`, generated by
`drizzle-kit generate` and applied by `tsx src/db/migrate.ts`. Never hand-edit
a migration that's already been generated — generate a new one instead.
