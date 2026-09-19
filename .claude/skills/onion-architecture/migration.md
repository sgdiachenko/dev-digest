# Migration — what this repo violates today

Measured with the shipped config against `server/src`:
**149 modules, 464 dependencies, 24 violations.**

Rings 0 and 1 are **clean**: `vendor/shared` imports only `zod` and itself, and
`reviewer-core` imports only `zod`, `openai`, and the contracts. The core is
already what Onion asks for — every violation is in the outer rings, which is
the cheap direction to fix.

## The 24, grouped by fix

### A. Routes query the database — 8 hits (CRITICAL)

```
onion-no-persistence-in-http: modules/workspace/routes.ts → db/schema.ts, drizzle-orm
onion-no-persistence-in-http: modules/settings/routes.ts  → db/schema.ts, drizzle-orm
onion-no-persistence-in-http: modules/pulls/routes.ts     → db/schema.ts, drizzle-orm
onion-no-persistence-in-http: modules/polling/routes.ts   → db/schema.ts, drizzle-orm
```

These four modules have **no** `service.ts` and **no** `repository.ts` — the
handler is the whole stack. `pulls/routes.ts` is 415 lines and holds status
derivation, finding aggregation, and file/commit syncing inside handlers.

Fix per module: extract `repository.ts` first (mechanical, no behavior change),
then lift the rules into `service.ts` where there are any. `modules/repos/` is
the shape to copy.

### B. Persistence types inside use cases and helpers — 7 hits (CRITICAL)

```
onion-db-only-in-repository: modules/reviews/service.ts        → db/rows.ts
onion-db-only-in-repository: modules/reviews/run-executor.ts   → db/rows.ts, db/schema.ts
onion-db-only-in-repository: modules/reviews/diff-loader.ts    → db/schema.ts
onion-db-only-in-repository: modules/repos/helpers.ts          → db/schema.ts
onion-db-only-in-repository: modules/settings/feature-models.ts → db/schema.ts, drizzle-orm
```

Two different causes:

- **Row types used as the shared vocabulary** (`AgentRow`, `PullRow` from
  `db/rows.ts`). Fix by naming the ring-0 contract instead — several already
  exist. See the `db/rows.ts` tension in
  [ports.md](ports.md#the-dbrowsts-tension).
- **A helper doing data access** (`settings/feature-models.ts` queries directly
  and takes the container). Fix: it becomes a repository method, and `settings/`
  gets the `repository.ts` it never had.

`repos/helpers.ts:44` (`toRepoDto`) is the mapper this architecture wants — it
just has to move into `repository.ts` so the row type stops crossing the
boundary.

### C. Port interfaces declared in their own adapter — 2 hits (HIGH)

```
onion-concretes-only-in-composition-root: modules/repo-intel/pipeline/repo-map.ts → adapters/tokenizer/index.ts
onion-concretes-only-in-composition-root: modules/reviews/diff-loader.ts          → adapters/git/diff-parser.ts
```

- `Tokenizer` (and `DepGraph`) are declared next to their implementations, so
  inner code imports outward just to name a type. **Move the two interfaces to
  `vendor/shared/adapters.ts`**; the classes stay put. One-line diff at each
  call site, and the rule goes quiet.
- `parseUnifiedDiff` is a **pure function filed under `adapters/`**. Purity, not
  subject matter, decides the ring: move it to `reviewer-core` (it is diff
  domain logic) or `platform/`, and the import becomes legal because it is no
  longer outward.

### D. Adapters importing a feature module — 2 hits (HIGH)

```
onion-adapters-know-no-app: adapters/astgrep/index.ts  → modules/repo-intel/constants.ts
onion-adapters-know-no-app: adapters/depgraph/index.ts → modules/repo-intel/constants.ts
```

Both read a repo-intel constant (extensions / limits). Pass it in as a
parameter, or move the constant to `vendor/shared`. This is the cheapest group —
fix it first for a quick win.

### E. Cycles — 5 hits (CRITICAL)

```
no-circular: modules/repo-intel/service.ts → platform/container.ts → modules/repo-intel/service.ts
no-circular: modules/repo-intel/pipeline/incremental.ts → platform/container.ts → … → incremental.ts
no-circular: modules/repo-intel/pipeline/incremental.ts → pipeline/full.ts → container.ts → … 
no-circular: modules/repo-intel/pipeline/full.ts → platform/container.ts → … → full.ts
no-circular: modules/agents/helpers.ts → modules/agents/repository.ts → modules/agents/helpers.ts
```

Four of the five are **the same root cause**: `RepoIntelService` (and the
pipeline steps) take `Container`, while the container constructs
`RepoIntelService`. Replacing `Container` injection with explicit ports removes
all four at once — the single highest-leverage change in this list.

The fifth is a small helper/repository cycle in `agents/`: move the shared type
or function to `constants.ts`/a mapper so the arrow points one way.

## Order of work

Each phase ends green (baseline shrinks, CI stays passing).

| Phase | Work | Kills | Why this order |
|---|---|---|---|
| **P0** | Install the config, write the baseline, add `arch:check` + the CI step | 0 | Stops new violations before fixing old ones |
| **P1** | Move `Tokenizer`/`DepGraph` interfaces inward; parameterize the two adapter constants; relocate `parseUnifiedDiff` | C + D (4) | Pure moves, no behavior change, no review risk |
| **P2** | `RepoIntelService` + pipeline take ports instead of `Container` | E (4 of 5) | Removes the container cycle; unblocks testing repo-intel without a container |
| **P3** | `pulls/` → `repository.ts` + `PullsService`; then `polling/`, `settings/`, `workspace/` | A (8) + part of B | Biggest debt, and the pattern is already proven in `repos/` |
| **P4** | Repository ports + row→domain mapping for `reviews/`, `agents/`, `repos/`; promote the `db/rows.ts` concepts to contracts | B (rest) | Needs P3's repositories to exist first |
| **P5** | Services take ports everywhere; construct use cases in the container; flip `--ignore-known` off | last cycle + drift | The baseline file should be empty by here |
| **P6** | Update `server/AGENTS.md` and `server/docs/architecture.md` to describe ports, not `Container` | — | Docs currently promise what P5 delivers |

## While migrating

- **New code follows the rules from day one.** The baseline is for existing
  debt; a new module with a route that queries the DB is not "consistent with
  the codebase", it is a new baseline entry.
- **Extract the repository before the service.** Mechanical, reviewable, and it
  alone clears the route violations.
- **Do not rename while moving.** A file move plus a rename is unreviewable;
  make them separate commits.
- **Log what surprises you** in [server/INSIGHTS.md](../../../server/INSIGHTS.md)
  via the [engineering-insights](../engineering-insights/SKILL.md) skill — the
  next phase reads it.
