---
name: onion-architecture
description: "Backend code architecture for dev-digest — which ring a file belongs to and which import is allowed. Use when adding or changing a Fastify route, a module service, a Drizzle repository, an adapter, a port interface, or DI container wiring; when a service needs a new dependency; and when reviewing backend code for layer violations. Covers the ring map (contracts → domain services → ports → use cases → adapters/presentation), the inward-only dependency rule, constructor injection of ports, row→domain mapping, transactions, and dependency-cruiser enforcement. Applies to server/ and reviewer-core/. NOT about Fastify APIs (see fastify-best-practices), Drizzle query syntax (see drizzle-orm-patterns), or frontend structure (see frontend-architecture). Trigger terms: onion architecture, clean architecture, hexagonal, ports and adapters, layer, ring, dependency rule, dependency inversion, port, adapter, repository, use case, service, container, DI, composition root, routes.ts, service.ts, repository.ts, layer violation, depcruise."
metadata:
  tags: architecture, onion, clean-architecture, ports-and-adapters, ddd, fastify, drizzle, typescript, backend
---

# Onion Architecture (backend)

This skill answers two questions about `server/` and `reviewer-core/`, and only these two:

1. **Which ring does this code belong to?**
2. **Is this import allowed?**

How to write the Fastify route belongs to
[fastify-best-practices](../fastify-best-practices/SKILL.md); how to write the
query belongs to [drizzle-orm-patterns](../drizzle-orm-patterns/SKILL.md). This
skill is the backend counterpart of
[frontend-architecture](../frontend-architecture/SKILL.md) — same job, different
side of the wire. Do not restate their rules here.

## Severity Levels

- **CRITICAL** — inverts the dependency rule; the core rots into framework code and stops being testable
- **HIGH** — couples a ring to a technology choice, making the technology unswappable
- **MEDIUM** — hurts navigability; the ring is right but the file is in the wrong place

---

## The One Rule (CRITICAL)

**All coupling points toward the center. Code may depend on a more central ring; it may never depend on a ring further out.**

> "All code can depend on layers more central, but code cannot depend on layers
> further out from the core. In other words, all coupling is toward the center."
> — Jeffrey Palermo, [The Onion Architecture part 1](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/)

Three corollaries, all of which this repo already claims in
[server/AGENTS.md](../../../server/AGENTS.md) and now enforces:

- **The database is not the center. It is external.** Postgres, Drizzle, and the
  `db/schema` tables are outer-ring detail. The core does not know they exist.
- **Inner rings declare interfaces; outer rings implement them.** A port is
  named for the capability the core wants (`GitHubClient`), never for the
  library that satisfies it (`OctokitClient`).
- **Dependency inversion is the mechanism.** When ring 3 needs the network, it
  does not import an SDK — it takes a ring-2 interface in its constructor and
  the composition root passes the SDK-backed implementation.

## The Ring Map

```
            ┌──────────────────────────────────────────────────┐
            │  5  composition root — container.ts, app.ts      │
            │  ┌────────────────────────────────────────────┐  │
            │  │  4  adapters + presentation                │  │
            │  │     routes.ts · repository.ts · adapters/  │  │
            │  │  ┌──────────────────────────────────────┐  │  │
            │  │  │  3  application services (use cases) │  │  │
            │  │  │     modules/<name>/service.ts        │  │  │
            │  │  │  ┌────────────────────────────────┐  │  │  │
            │  │  │  │  2  ports (interfaces)         │  │  │  │
            │  │  │  │  ┌──────────────────────────┐  │  │  │  │
            │  │  │  │  │ 1 domain services        │  │  │  │  │
            │  │  │  │  │   reviewer-core/src      │  │  │  │  │
            │  │  │  │  │  ┌────────────────────┐  │  │  │  │  │
            │  │  │  │  │  │ 0 domain model     │  │  │  │  │  │
            │  │  │  │  │  │   Zod contracts    │  │  │  │  │  │
            │  │  │  │  │  └────────────────────┘  │  │  │  │  │
            │  │  │  │  └──────────────────────────┘  │  │  │  │
            │  │  │  └────────────────────────────────┘  │  │  │
            │  │  └──────────────────────────────────────┘  │  │
            │  └────────────────────────────────────────────┘  │
            └──────────────────────────────────────────────────┘
                        every arrow points inward
```

| Ring | Code in this repo | May import | Must never import |
|---|---|---|---|
| 0 — Domain model | `server/src/vendor/shared/contracts/*` (Zod contracts, DTOs) | `zod`, itself | anything else |
| 1 — Domain services | `reviewer-core/src/**` (`prompt`, `grounding`, `reduce`, `review/run`) | ring 0, ports | `fastify`, `drizzle-orm`, `postgres`, `octokit`, `simple-git`, `node:fs`, `process.env` |
| 2 — Ports | `server/src/vendor/shared/adapters.ts` + repository port files | ring 0 | any implementation |
| 3 — Use cases | `server/src/modules/<name>/service.ts`, `helpers.ts`, `constants.ts` | rings 0–2, `platform/errors` | `drizzle-orm`, `db/*`, `fastify`, concrete adapters, `Container` |
| 4 — Adapters | `server/src/adapters/**`, `db/**`, `modules/<name>/repository.ts` | rings 0–2 | `modules/*/service.ts`, `modules/*/routes.ts` |
| 4 — Presentation | `server/src/modules/<name>/routes.ts`, `platform/sse.ts` | ring 3 + ring 0 contracts | `drizzle-orm`, `db/*`, `adapters/**` |
| 5 — Composition root | `server/src/platform/container.ts`, `app.ts`, `server.ts` | everything | (nothing imports it except itself) |

Full allowed/forbidden matrix, plus what to do with `platform/*` and
`modules/_shared/*`: [layers.md](layers.md).

## Where Does This Go?

| I am adding… | Ring | Home |
|---|---|---|
| A field on the wire format | 0 | `vendor/shared/contracts/<domain>.ts` — **and** the `client/` copy, by hand |
| A pure calculation on a diff, prompt, or finding | 1 | `reviewer-core/src/` — no I/O, no injected clients |
| A new outside-world capability the core needs | 2 | an interface in `vendor/shared/adapters.ts` → [ports.md](ports.md) |
| Persistence for a new entity | 2 + 4 | port next to the use case, class in `modules/<name>/repository.ts` |
| Orchestration of several ports (a use case) | 3 | `modules/<name>/service.ts` → [services.md](services.md) |
| An HTTP endpoint | 4 | `modules/<name>/routes.ts` — Zod schemas + one service call |
| A third-party SDK call | 4 | `adapters/<capability>/<library>.ts`, behind a ring-2 port |
| The decision which implementation to use | 5 | `platform/container.ts` → [container.md](container.md) |
| A secret or an env var read | 4 | `adapters/secrets/local.ts` / `platform/config.ts` — nowhere else |
| A test double | 4 | `adapters/mocks.ts`, implementing the port |

## The Five Commandments For This Repo

Each one is machine-checked — see [enforcement.md](enforcement.md).

1. **A service takes ports, not the container (CRITICAL).** `constructor(private container: Container)` is a service locator: the use case can now
   reach anything, its real dependencies are invisible in its signature, and it
   creates an import cycle with the composition root. Take the two or three
   ports you actually use. → [services.md](services.md#constructor-injection)
2. **Only `repository.ts` names persistence (CRITICAL).** Inside a module, no
   service, helper, or pipeline step imports `drizzle-orm`, `db/schema`,
   `db/rows`, or `container.db`. Persistence is reached through a repository
   **port**. → [ports.md](ports.md#repository-ports)
3. **A row never crosses a ring boundary (HIGH).** `typeof t.repos.$inferSelect`
   is the shape of a table, not of a business concept. Repositories map row →
   domain type at the boundary, and map database errors to `AppError`s there
   too. → [ports.md](ports.md#rowdomain-mapping)
4. **A route is a transport adapter (HIGH).** Parse with Zod, call one service
   method, map the status code. No SQL, no SDKs, no business rules, no error
   JSON hand-rolled. → [services.md](services.md#routes-are-adapters)
5. **Only the composition root says `new` on a concrete adapter (HIGH).**
   Everything else receives it. Test wiring is the same rule with a different
   implementation. → [container.md](container.md)

## Anti-Patterns (CRITICAL unless noted)

- **`import { db } from '../../db/client.js'` in a service or route.** The
  classic inversion: the outermost detail becomes the most-depended-on module.
- **Service locator in a constructor** (`container: Container`). Hides
  dependencies and produces the `service → container → service` cycle that
  `no-circular` already flags in this repo.
- **A port interface declared inside its own adapter file.** `DepGraph` and
  `Tokenizer` live in `adapters/depgraph/index.ts` and
  `adapters/tokenizer/index.ts` today, so ring-3 code must reach *outward* just
  to name the type it depends on. The interface belongs inward, the class
  outward. → [ports.md](ports.md#where-a-port-lives)
- **A port named after its library** (`OctokitClient`, `DrizzleStore`). If the
  name changes when you swap the vendor, the abstraction bought you nothing.
- **Business rules in `routes.ts`.** Not reusable by the job runner, the CI
  runner, or a CLI; testable only through HTTP.
- **An adapter importing a module** (`adapters/astgrep` → `modules/repo-intel/constants`).
  Outward code reaching inward-of-it code welds the adapter to one feature; pass
  the value in as a parameter instead.
- **Pure logic filed under `adapters/` (MEDIUM).** `parseUnifiedDiff` has no
  I/O — it is domain logic that happens to live in the infrastructure folder.
  Purity, not subject matter, decides the ring.
- **A second module's internals imported directly (HIGH).** Modules share
  through container-provided repositories, never by importing
  `../other/service.js`. Shared *constants* are fine.
- **Mapping skipped "for now" (MEDIUM).** The `$inferSelect` shortcut is how a
  schema rename becomes an API break two lessons later.

## Review Checklist

Check in this order; the first two are blocking:

1. Does any import point outward? Run `pnpm arch:check`. (blocking)
2. Does a service constructor list ports, or does it take `Container` / `db`? (blocking)
3. Is `reviewer-core` still free of framework, DB, and `process.env`?
4. Does every repository method return a domain type rather than a Drizzle row?
5. Is the route thin — Zod schema, one service call, status code, nothing else?
6. Is a new interface declared in a ring at least as central as its consumers?
7. Is a new concrete adapter `new`-ed only in `platform/container.ts`, with a
   mock counterpart in `adapters/mocks.ts`?
8. Does a new dependency read `process.env` outside `platform/config.ts` /
   `adapters/secrets/local.ts`?
9. Is anything shared between two modules imported sideways instead of coming
   from the container?

## When NOT To Apply This

Onion pays for itself in long-lived code with real behavior; it is overhead
everywhere else. Do not add rings to:

- **`db/seed.ts`, `db/migrate.ts`, `scripts/*`** — one-shot operational code.
  They may talk to Drizzle and `process.env` directly.
- **A module that is a pure read-through** — `workspace/routes.ts` returns a
  list and nothing more. It still must not query in the route, but it needs a
  repository, not a repository *and* a service *and* a use-case type.
- **A port with exactly one implementation and no test-double need** — inject
  the function instead of minting an interface. See the "you might not need the
  repository pattern" argument in [README.md](README.md).

Palermo's own caveat: the pattern "is not appropriate for small websites" but is
appropriate for "long-lived business applications as well as applications with
complex behavior". The review engine is the second kind; the seed script is the
first.

## Detail References

- [layers.md](layers.md) — the full import matrix, where `platform/*` sits, how to diagnose a violation
- [ports.md](ports.md) — defining a port, repository ports, row→domain mapping, transactions / unit of work
- [services.md](services.md) — writing a use case with explicit ports, error taxonomy, thin routes, SSE
- [container.md](container.md) — the composition root, lazy adapter resolution, test wiring per ring
- [enforcement.md](enforcement.md) — the dependency-cruiser config, `arch:check`, baseline, CI
- [migration.md](migration.md) — the 24 violations this repo has today, and the order to fix them
- [README.md](README.md) — the research behind this skill, with sources
- [assets/dependency-cruiser.layers.cjs](assets/dependency-cruiser.layers.cjs) — ready-to-copy config

## Project Conventions Override This Skill

The repo's own [AGENTS.md](../../../AGENTS.md) and
[server/AGENTS.md](../../../server/AGENTS.md) win over every default here —
including naming (`snake_case` on the wire, `camelCase` in TS) and the
hand-copied `@devdigest/shared` rule. This skill supplies the dependency
reasoning, not the last word.
