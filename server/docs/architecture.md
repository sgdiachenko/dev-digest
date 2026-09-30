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
  the read port other modules (the future attachments feature) may use;
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
  1,000 entries (`constants.ts:12-22`). `used_by` is always `null` until the
  [attachments spec](../../docs/specs/2026-09-30-project-context-attachments.md)
  (approved, not implemented) lands (`contracts/project-context.ts:33`).
- **Tokenizer port.** `Tokenizer` now lives in `vendor/shared/adapters.ts:268`
  next to the other ports; `adapters/tokenizer` keeps the implementation.
- **Persistence.** Tables `context_catalogs` and `context_docs`
  (`db/schema/project-context.ts`, migration `0016_famous_spot.sql`). Migrations
  do not run on boot.
- **Unreachable commit (Q-3).** If the scanned commit is gone after gc or
  re-shallow, the file route answers `404` with `reason: commit_unavailable`
  (`service.ts:115`) and the UI offers Rescan.

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
