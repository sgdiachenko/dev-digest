# Ports — the interfaces the core owns

A **port** is an interface declared in an inner ring and implemented in an outer
one. It is how ring 1 and ring 3 reach the outside world without depending on it.

## Where a port lives

**The interface goes inward, the class goes outward.** Always.

```
vendor/shared/adapters.ts     ← interface GitHubClient      (ring 2)
adapters/github/octokit.ts    ← class OctokitGitHubClient   (ring 4)
adapters/mocks.ts             ← class MockGitHubClient      (ring 4)
```

This repo already does that for `LLMProvider`, `GitHubClient`, `GitClient`,
`CodeIndex`, `Embedder`, `SecretsProvider`, and `AuthProvider`.

It does **not** for two ports, and both are live violations:
`DepGraph` is declared in `adapters/depgraph/index.ts` and `Tokenizer` in
`adapters/tokenizer/index.ts`. So `modules/repo-intel/pipeline/repo-map.ts` must
import *outward* just to name the type it depends on
(`import { type Tokenizer } from '../../../adapters/tokenizer/index.js'`). The
fix is a move, not a rewrite: the interface goes to `vendor/shared/adapters.ts`,
the class stays where it is.

## Naming (HIGH)

Name a port for the **capability the core wants**, not for the technology that
happens to provide it:

| Good | Bad | Why |
|---|---|---|
| `GitHubClient` | `OctokitClient` | survives swapping Octokit |
| `LLMProvider` | `OpenAIClient` | one interface, three providers today |
| `CodeIndex` | `RipgrepSearcher` | the core wants search, not ripgrep |
| `SecretsProvider` | `SecretsFileReader` | file today, keychain tomorrow |

If renaming the vendor forces renaming the interface, the interface is not an
abstraction — it is a passthrough.

Keep the port **narrow**: the methods the core actually calls, in the core's
vocabulary. A port that mirrors an SDK's full surface is a leaky abstraction
wearing an interface.

## Repository ports

A repository is an adapter like any other, so the same split applies. Today the
services hold concrete repository classes; that is the CRITICAL violation to
retire first.

```ts
// modules/repos/ports.ts — ring 2. Domain types in, domain types out.
import type { Repo } from '@devdigest/shared';

export interface NewRepo {
  workspaceId: string;
  owner: string;
  name: string;
  fullName: string;
  createdBy: string;
}

export interface RepoStore {
  findByFullName(workspaceId: string, fullName: string): Promise<Repo | undefined>;
  list(workspaceId: string): Promise<Repo[]>;
  getById(workspaceId: string, id: string): Promise<Repo | undefined>;
  insert(values: NewRepo): Promise<Repo>;
  updateClonePath(repoId: string, path: string): Promise<void>;
  remove(workspaceId: string, id: string): Promise<boolean>;
}
```

```ts
// modules/repos/repository.ts — ring 4. The only file that knows the table.
import { and, eq } from 'drizzle-orm';
import type { Repo } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { NewRepo, RepoStore } from './ports.js';
import { toRepoDto } from './mapper.js';

export class DrizzleRepoStore implements RepoStore {
  constructor(private db: Db) {}

  async list(workspaceId: string): Promise<Repo[]> {
    const rows = await this.db
      .select()
      .from(t.repos)
      .where(eq(t.repos.workspaceId, workspaceId));
    return rows.map(toRepoDto);      // ← the boundary
  }
}
```

Notice what stays the same: every query is still `workspaceId`-scoped (the
tenancy guard this repo already enforces), and `repository.ts` is still the only
file that touches the table. What changes is the **direction** of the dependency
and the **type** that crosses it.

## Row→domain mapping

A Drizzle row is the shape of a table. A contract is the shape of a business
concept. They drift, and when a handler returns a row the API breaks the moment
a column is renamed. Modern ORMs like Drizzle are typed query builders, not
entity mappers — nothing maps for you, so the discipline is yours.

Rules:

1. **`$inferSelect` types never appear in a ring-2 or ring-3 signature.** Keep
   them inside `repository.ts`.
2. **One mapper per entity**, next to the repository (`mapper.ts`), converting
   `camelCase` columns → `snake_case` contract fields and `Date` → ISO string.
   `modules/repos/helpers.ts:44` (`toRepoDto`) is already exactly this function —
   it just lives one ring too far in, because it takes a row.
3. **Map errors at the same boundary.** A unique-violation becomes a
   `ValidationError`, a missing row becomes `undefined` (the service decides
   whether that is a `NotFoundError`). A raw Postgres error code must not reach
   ring 3.

### The `db/rows.ts` tension

`server/src/db/rows.ts` deliberately exports shared row types
(`AgentRow`, `PullRow`, `FindingRow`, …) so cross-cutting consumers can name a
row without importing another module's data layer. That solves a real
cross-module problem, but it does it by making the *table* shape the shared
vocabulary — which is why `reviews/service.ts:4` currently imports it and trips
`onion-db-only-in-repository`.

The Onion-consistent resolution: promote the *concepts* those rows stand for to
ring 0 contracts (several already exist in `vendor/shared/contracts/`), let
`rows.ts` stay a ring-4 convenience for repositories only, and have ring 3 name
the contract. Until that promotion happens, the import is a documented baseline
entry, not a green light — see [migration.md](migration.md).

## Transactions and unit of work

Two operations that must commit together cannot each own a connection. But the
service must not hold `Db` either. Put the transaction **inside the port**, in
the core's vocabulary:

```ts
// ring 2
export type DbTx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface ReviewStore {
  /** Persist a review and its kept findings atomically. */
  saveReviewWithFindings(review: NewReview, findings: NewFinding[]): Promise<Review>;
}
```

The repository opens the transaction and threads `tx` to its own private
helpers. The use case just calls one method and stays ignorant of `tx`.

When a use case genuinely must span **several** repositories atomically,
introduce a narrow unit-of-work port rather than handing out `db`:

```ts
// ring 2
export interface UnitOfWork {
  run<T>(fn: (repos: { reviews: ReviewStore; runs: RunStore }) => Promise<T>): Promise<T>;
}
```

```ts
// ring 4 — one Drizzle transaction, repositories rebound onto tx
export class DrizzleUnitOfWork implements UnitOfWork {
  constructor(private db: Db) {}
  run<T>(fn: (repos: { reviews: ReviewStore; runs: RunStore }) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) =>
      fn({ reviews: new DrizzleReviewStore(tx), runs: new DrizzleRunStore(tx) }),
    );
  }
}
```

Each store takes `Db | DbTx` so the same class works inside and outside a
transaction. Query syntax and isolation levels:
[drizzle-orm-patterns](../drizzle-orm-patterns/SKILL.md).

## When you do not need a port (MEDIUM)

A port earns its keep when it buys a swap, a test double, or a boundary the core
must not cross. It costs a file and an indirection. Skip it when:

- The dependency is a **pure function** with no I/O — `parseUnifiedDiff`,
  `estimateCost`, `groundFindings`. Import it directly; better, move it inward
  where pure logic belongs.
- There is **one** implementation, **no** test-double need, and the call is
  already behind a repository.
- It would be a **one-method passthrough to another port** you already inject.

Do not invert this into "repositories are always over-engineering" — with
Postgres, tenancy scoping, and mock-driven service tests in play, the repository
port is the cheapest of the three. The counter-argument is worth reading
([README.md](README.md)) precisely so the decision is deliberate.
