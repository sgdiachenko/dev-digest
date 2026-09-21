# onion-architecture — research and sources

Why this skill says what it says, and where to read further. The skill itself is
[SKILL.md](SKILL.md); this file is the bibliography and the rationale for the
judgement calls.

## How the ring map was derived

The map in [layers.md](layers.md) is not a template — it was read off this
codebase, then checked with the linter:

| Observation in `server/` + `reviewer-core/` | Ring it implies |
|---|---|
| `reviewer-core` declares "no DB/GitHub/FS; the only side effect is an injected `LLMProvider`" and its tests run with no keys and no network | textbook ring 1 domain services |
| `vendor/shared/contracts/*` are Zod schemas shared by server, client, and the CI runner | ring 0 domain model |
| `vendor/shared/adapters.ts` declares `LLMProvider`, `GitHubClient`, `GitClient`, `CodeIndex`, `Embedder`, `SecretsProvider`, `AuthProvider` with implementations under `adapters/` | ring 2 ports / ring 4 adapters, already inverted correctly |
| `platform/container.ts` is the single place deciding which implementation backs each port, with `overrides` for tests | ring 5 composition root |
| `modules/<n>/{routes,service,repository}.ts` | ring 4 / 3 / 4 |

So dev-digest was already onion-shaped in intent — `server/AGENTS.md` even
states "services depend on adapter *ports*, never concrete adapters" and "never
`new` an adapter directly inside a service". What was missing was (a) ports for
persistence, (b) explicit constructor injection instead of passing `Container`,
and (c) anything that checks either. Hence the skill's emphasis: it is mostly a
*conformance* skill, not a redesign proposal.

Measured state at authoring time (`depcruise src`, shipped config): 149 modules,
464 dependencies, **24 violations**, zero of them in rings 0–1. Breakdown and
fix order: [migration.md](migration.md).

## Judgement calls worth knowing about

- **`db/rows.ts` is a real trade-off, not an oversight.** It shares row types so
  modules need not import each other's data layer — solving a coupling problem
  by making the table shape the shared vocabulary. The skill keeps the Onion
  answer (promote the concept to a contract) but says so explicitly rather than
  pretending the existing choice was careless.
- **Pure functions do not need ports.** `parseUnifiedDiff`, `estimateCost`, and
  `groundFindings` are imported directly. Purity, not subject matter, decides
  the ring — which is why the skill asks for `parseUnifiedDiff` to move *inward*
  rather than to be wrapped in an interface.
- **The repository port is worth it here; not every port is.** Postgres +
  tenancy scoping + mock-driven service tests pay for it. A one-method
  passthrough does not. Both sides are linked below.
- **dependency-cruiser over ESLint** — `server/` has no ESLint setup at all, and
  dependency-cruiser is already a dependency (it backs repo-intel's import
  graph). Alternatives and why they lost: [enforcement.md](enforcement.md#alternatives-considered).

## Sources

### Canonical

- [The Onion Architecture: part 1](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/) — Jeffrey Palermo, 2008. The origin. "All coupling is toward the center"; "The database is not the center. It is external."
- [part 2](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-2/) — a worked example (CodeCampServer).
- [part 3](http://jeffreypalermo.com/blog/the-onion-architecture-part-3/) — Onion vs. traditional layered architecture.
- [part 4 — After Four Years](http://jeffreypalermo.com/blog/onion-architecture-part-4-after-four-years/) — what held up in practice.
- [Original Onion Architecture example (code)](https://github.com/Jordiag/Jeffrey-Palermo-Onion-Architecture) — mirror of Palermo's sample repo.
- [Onion Architecture — Herberto Graça](https://medium.com/the-software-architecture-chronicles/onion-architecture-79529d127f85) — places Onion next to Hexagonal/Ports-and-Adapters and DDD.
- [The Dependency Rule in Clean Architecture — Milan Jovanović](https://milanjovanovic.tech/blog/dependency-rule-clean-architecture) — the clearest short statement of the inward-only rule.
- [Clean Architecture: The Dependency Rule and Concentric Layers — Bitloops](https://bitloops.com/resources/software-architecture/clean-architecture)
- [Designing the infrastructure persistence layer — Microsoft](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/infrastructure-persistence-layer-design) — repository interface inward, implementation outward.
- [awesome-software-architecture: onion-architecture](https://github.com/mehdihadeli/awesome-software-architecture/blob/main/docs/onion-architecture.md) — curated further reading.

### Node.js / TypeScript

- [Implementing SOLID and the onion architecture in Node.js with TypeScript and InversifyJS](http://blog.wolksoftware.com/implementing-solid-and-the-onion-architecture-in-node-js-with-typescript-and-inversifyjs) — the reference write-up for this stack; source of the "inner circles define interfaces, outer implement them" framing used in the ring table.
- [Clean architecture with TypeScript: DDD, Onion — André Bazaglia](https://bazaglia.com/clean-architecture-with-typescript-ddd-onion/)
- [Onion Architecture in Node.js with TypeScript — Sankhadip Samanta](https://sankhadip.medium.com/onion-architecture-in-node-js-with-typescript-5508612a4391)
- [Onion Architecture in Node.js — Rajesh Chaudhari](https://medium.com/@myjob.rajesh/onion-architecture-in-node-js-05a475ada097)
- [onion-architecture-boilerplate (Node + TS)](https://github.com/Melzar/onion-architecture-boilerplate)
- [Onion Architecture in AWS Lambdas with TypeScript — practical guide with trade-offs](https://dev.to/cheru94/onion-architecture-in-aws-lambdas-with-typescript-a-practical-guide-with-tradeoffs-29h3) — honest about the costs.
- [Onion Architecture in Domain-Driven Design](https://dev.to/yasmine_ddec94f4d4/onion-architecture-in-domain-driven-design-ddd-35gn)

### Fastify specifically

- [fastify-boilerplate — Fastify 5, clean architecture, DDD, CQRS](https://github.com/marcoturi/fastify-boilerplate) — closest production-grade analogue to `server/`; framework-agnostic core, Fastify confined to routes.
- [clean-architecture-fastify](https://github.com/borjatur/clean-architecture-fastify-mongodb) — smaller, easier to read end to end.
- [fastify-clean-architecture](https://github.com/revell29/fastify-clean-architecture)
- [Fastify docs](https://fastify.dev/) — plugin encapsulation, which is what keeps a module a module.

### Persistence, Drizzle, transactions

- [Drizzle ORM Best Practices: Principles, Patterns, Case Studies](https://paulserban.eu/blog/post/drizzle-orm-best-practices-principles-patterns-and-real-world-case-studies/) — source of the leaky-abstraction argument: returning row types from handlers couples the API contract to the schema.
- [Top TypeScript ORM 2026 — Bytebase](https://www.bytebase.com/blog/top-typescript-orm/) — "Drizzle is a typed query builder, not an entity mapper", i.e. nothing maps for you.
- [Drizzle ORM — Transactions (docs)](https://orm.drizzle.team/docs/transactions)
- [Correct TypeScript type for `tx` when passing Drizzle transactions (discussion #3271)](https://github.com/drizzle-team/drizzle-orm/discussions/3271) — background for the `DbTx` helper type in [ports.md](ports.md#transactions-and-unit-of-work).
- [Repository Pattern with Drizzle ORM](https://medium.com/@vimulatus/repository-pattern-in-nest-js-with-drizzle-orm-e848aa75ecae)
- [Transactions with DDD and Repository Pattern in TypeScript, part 2](https://medium.com/@joaojbs199/transactions-with-ddd-and-repository-pattern-in-typescript-a-guide-to-good-implementation-part-2-da0af3e10901) — the unit-of-work shape.
- [Implementing DTOs, Mappers & the Repository Pattern — Khalil Stemmler](https://khalilstemmler.com/articles/typescript-domain-driven-design/repository-dto-mapper/) — the row→domain mapper as an explicit object.
- [The Repository Pattern — Klaviyo Engineering](https://klaviyo.tech/the-repository-pattern-e321a9929f82)
- [You might not need… the repository pattern](https://dev.to/jayfreestone/you-might-not-need-the-repository-pattern-46b) — the counter-argument, deliberately included so "when not to apply" is informed rather than reflexive.

### Enforcement

- [Dependency Cruiser: Restrict Imports in JavaScript — Atomic Object](https://spin.atomicobject.com/dependency-cruiser-imports/)
- [How to maintain clean architecture with dependency rules — cubic.dev](https://www.cubic.dev/blog/how-to-maintain-clean-architecture-with-dependency-rules-in-your-codebase)
- [Validate Dependencies According to Clean Architecture — Ken Miyashita](https://betterprogramming.pub/validate-dependencies-according-to-clean-architecture-743077ea084c)
- [dependency-cruiser configuration example — Synapse Studios](https://docs.synapsestudios.com/implementation/frameworks/nest/dependency-cruiser-config)
- [dependency-cruiser guide: use it or skip it](https://mrkeyoor.com/libs/dependency-cruiser/)
- [fresh-onion — enforce clean architecture in TypeScript](https://dev.to/remojansen/enforce-clean-architecture-in-your-typescript-projects-with-fresh-onion-45pi) — an alternative enforcement tool, unmaintained but instructive on rule design.

### In-repo companions

- [AGENTS.md](../../../AGENTS.md) · [server/AGENTS.md](../../../server/AGENTS.md) · [reviewer-core/AGENTS.md](../../../reviewer-core/AGENTS.md)
- [server/docs/architecture.md](../../../server/docs/architecture.md) — the request/DI lifecycle this skill formalizes
- [TESTING.md](../../../TESTING.md) — cross-package test strategy
