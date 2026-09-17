# Layers — the full import matrix

Reference for "is this import allowed?". The regexes here are the same ones the
linter uses ([enforcement.md](enforcement.md)).

## Ring assignment, file by file

| Path | Ring | Why |
|---|---|---|
| `server/src/vendor/shared/contracts/**` | 0 | Zod contracts — the wire format and the domain vocabulary |
| `server/src/vendor/shared/adapters.ts` | 2 | port interfaces (`LLMProvider`, `GitHubClient`, `GitClient`, `CodeIndex`, `Embedder`, `SecretsProvider`, `AuthProvider`) |
| `reviewer-core/src/**` | 1 | pure review engine; only side effect is the injected `LLMProvider` |
| `server/src/modules/<n>/service.ts` | 3 | use cases |
| `server/src/modules/<n>/helpers.ts`, `constants.ts`, `status.ts`, `findings.ts` | 3 | pure transforms and literals owned by the use case |
| `server/src/modules/<n>/repository.ts` | 4 | persistence adapter |
| `server/src/modules/<n>/routes.ts` | 4 | presentation adapter |
| `server/src/adapters/**` | 4 | implementations of ring-2 ports |
| `server/src/db/**` | 4 | Drizzle schema, client, migrations |
| `server/src/platform/container.ts`, `app.ts`, `server.ts` | 5 | composition root |

### `platform/*` is not one ring

`platform/` is a grab bag; classify each file by what it depends on, not by the
folder:

| File | Ring | Note |
|---|---|---|
| `errors.ts` | 0 | the error taxonomy is domain vocabulary — every ring may import it |
| `config.ts` | 5 | reads `process.env`; produces `AppConfig` that others receive |
| `grounding.ts`, `prompt.ts`, `structured.ts`, `price-book.ts`, `model-router.ts` | 1 | pure logic — keep them free of `db` and `fastify` |
| `jobs.ts` (JobRunner) | 4 | takes `Db`, polls a table — an adapter with a port-shaped surface |
| `sse.ts` (RunBus) | 4 | transport |
| `run-logger.ts`, `trace-builder.ts` | 3 | orchestration-level concerns |
| `resilience.ts` | 1 | retry/backoff helpers, pure |
| `container.ts` | 5 | the only module allowed to know every concrete class |

If a `platform/` file needs both `db` and pure logic, split it — that is the
signal, not an exception.

### `modules/_shared/*`

`_shared/schemas.ts` (`IdParams`, …) is ring 0/2 — shared request contracts.
`_shared/context.ts` resolves the workspace/user from a request; it takes the
container, so it is ring 4 glue for the presentation layer. A **service** must
receive `workspaceId` as an argument rather than calling `getContext` itself.

## The matrix

`✔` allowed · `✘` forbidden · `root` only from the composition root

| from ↓ / to → | 0 contracts | 1 core | 2 ports | 3 services | 4 repo | 4 routes | 4 adapters | 5 container | npm framework |
|---|---|---|---|---|---|---|---|---|---|
| **0 contracts** | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | `zod` only |
| **1 core** | ✔ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | `zod`, `openai` only |
| **2 ports** | ✔ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | `zod` only |
| **3 services** | ✔ | ✔ | ✔ | own module | ✘ | ✘ | ✘ | ✘ | ✘ |
| **4 repository** | ✔ | ✘ | ✔ | ✘ | ✔ | ✘ | `db/*` | ✘ | `drizzle-orm` |
| **4 routes** | ✔ | ✘ | ✔ | ✔ own module | ✘ | ✔ | ✘ | ✘ | `fastify*` |
| **4 adapters** | ✔ | ✘ | ✔ | ✘ | ✘ | ✘ | ✔ | ✘ | its own SDK |
| **5 container** | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |

Reading the two rows that cause most PR comments:

- **services → repository is ✘.** A service depends on the repository *port*,
  which is more central. The class arrives by injection. This is what makes the
  use case unit-testable with no Postgres.
- **routes → services is ✔, routes → repository is ✘.** Even for a two-line
  read. If it feels absurd to add a service for one `SELECT`, let the route call
  the repository **port** the container hands it — but never `container.db`.

## Cross-module rules

- A module may import another module's `constants.ts` (`repos/service.ts`
  importing `repo-intel/constants.js` is fine — job-kind strings).
- A module may **not** import another module's `service.ts` / `repository.ts`.
  Entities used by several modules get their repository built in the composition
  root and exposed there (this is why `container.agentsRepo` and
  `container.reviewRepo` exist).
- Two modules that need the same behavior means the behavior is not
  module-specific: move it inward (ring 1 or `platform/`), do not import
  sideways.

## Diagnosing a violation

`pnpm arch:check` prints `rule: from → to`. Map it to a fix:

| Reported rule | What it means | Usual fix |
|---|---|---|
| `onion-no-persistence-in-http` | a route queries the DB | extract a repository, then a service if there is any logic |
| `onion-db-only-in-repository` | a use case, helper, or pipeline step names Drizzle/`db/*` | define a repository port, return domain types |
| `onion-no-infra-in-http` | a route uses an SDK | move the call into a service behind a port |
| `onion-concretes-only-in-composition-root` | someone `new`s or imports a concrete adapter | inject it; if the target is an interface, move the interface inward |
| `onion-adapters-know-no-app` | an adapter imports a module | pass the value as a parameter |
| `onion-domain-*-is-pure` | the core grew an I/O dependency | invert it into a port the caller supplies |
| `no-circular` | usually service ↔ container | replace `Container` injection with explicit ports |

## Why one direction

The cost of a change is the size of its blast radius, and blast radius is
coupling. With every arrow pointing inward:

- The core can be tested with no Docker, no keys, no HTTP — `reviewer-core`'s
  suite runs hermetically today for exactly this reason.
- Postgres, OpenRouter, Octokit, and Fastify become replaceable: each is one
  file behind one interface.
- A cycle means neither module can be changed, tested, or deleted alone —
  which is why `no-circular` is an error and not a warning.
