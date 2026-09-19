# Application services (use cases) and the presentation adapter

Ring 3 is where a business operation lives: "add a repo", "run a review on this
PR", "dismiss a finding". Ring 4 presentation just carries it over HTTP.

## Constructor injection

**A use case declares its dependencies in its constructor, as ports.** That
signature is the honest list of what the operation touches.

```ts
// ✔ ring 3 — three ports, zero technology
export class RepoService {
  constructor(
    private repos: RepoStore,
    private git: GitClient,
    private secrets: SecretsProvider,
    private jobs: JobQueue,
  ) {}
}
```

```ts
// ✘ what the repo does today — modules/repos/service.ts:37
export class RepoService {
  private repo: RepoRepository;
  constructor(private container: Container) {
    this.repo = new RepoRepository(container.db);   // ring 3 building ring 4
  }
}
```

Four things go wrong in those three lines, and all four are why commandment 1 is
CRITICAL:

1. **Hidden dependencies.** The signature says "container". Reading the class is
   the only way to learn it needs git, secrets, and the job queue.
2. **Ring 3 reaches ring 4.** `new RepoRepository(...)` and `container.db` make
   the use case depend on Drizzle transitively — the thing Onion exists to
   prevent.
3. **An import cycle.** `container.ts` imports the services it builds, the
   services import `Container`. `no-circular` already reports this for
   `repo-intel/service.ts → platform/container.ts → repo-intel/service.ts`.
4. **Unbounded blast radius in tests.** A unit test must build a whole container
   instead of passing two fakes.

The rule also covers the sneaky variants:

- `constructor(private container: Container)` with only `container.secrets` used
  — still a locator. Take `SecretsProvider`.
- `private agents: Container['agentsRepo']` (`reviews/service.ts:30`) — the type
  is borrowed from the container, so the cycle survives. Name the port.
- A service reading `container.config` — take the two fields you need as
  constructor args, or a small `ReviewLimits` value object.

### Async ports

Some container getters are async (`github()`, `llm(id)`, `embedder()`) because
they resolve a secret first. Do not leak that into ring 3. Inject a resolver
port instead:

```ts
// ring 2
export interface LLMProviderResolver {
  resolve(id: 'openai' | 'anthropic' | 'openrouter'): Promise<LLMProvider>;
}
```

The use case takes `LLMProviderResolver`; the container's `llm()` method *is*
the implementation. The service still never learns that a secrets file exists.

## What belongs in a use case

**Yes:** orchestration order, authorization/tenancy checks, domain rules that
span ports, mapping domain errors, emitting progress events, deciding what to
persist.

**No:** SQL, HTTP status codes, response shaping for one client, SDK calls,
`process.env`, `new` on anything infrastructural.

A use case method takes and returns domain types:

```ts
async add(workspaceId: string, userId: string, url: string): Promise<{ repo: Repo; created: boolean }>
```

`workspaceId` arrives as an **argument**, resolved by the route via
`getContext`. A service that calls `getContext` itself has coupled the operation
to an HTTP request and can never be run by the job runner or the CI runner.

## Errors

Throw from the taxonomy in `platform/errors.ts` — `NotFoundError`,
`ValidationError`, `ExternalServiceError`, `ConfigError`, or `AppError` with an
explicit code. Never return an HTTP status, never build error JSON. The shared
error handler turns an `AppError` into `{ error: { code, message, details } }`
with the right status; anything else becomes a 500.

An adapter translates *its* failures into that taxonomy at its own boundary: a
404 from Octokit becomes `NotFoundError`, a timeout becomes
`ExternalServiceError`. Ring 3 must never `instanceof RequestError`.

## Routes are adapters

A route does exactly four things: declare Zod schemas, resolve context, call one
service method, map the status code. `modules/repos/routes.ts` is the reference
implementation in this repo — 48 lines for four endpoints.

```ts
export default async function reposRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = app.container.repoService;          // built by the root

  app.post('/repos', { schema: { body: RepoInput } }, async (req, reply) => {
    const { workspaceId, userId } = await getContext(app.container, req);
    const { repo, created } = await service.add(workspaceId, userId, req.body.url);
    reply.status(created ? 201 : 200);
    return repo;
  });
}
```

Rules:

- **Every route declares `params` / `body` / `response` Zod schemas** via
  `fastify-type-provider-zod`; invalid input is a 422 before the handler runs.
  Never hand-roll `Schema.parse(req.body)`.
- **No `container.db`, no `drizzle-orm`, no `db/schema`.** Four route files
  break this today (`pulls`, `polling`, `settings`, `workspace`) — see
  [migration.md](migration.md).
- **No adapters.** A route that needs GitHub calls a service that injects
  `GitHubClient`.
- **No business rules.** `pulls/routes.ts` is 415 lines because status
  derivation, finding aggregation, and file/commit syncing all ended up in
  handlers. The test for "is this a rule?": would the job runner or the CI
  runner need it too?
- Framework specifics — hooks, plugin encapsulation, serialization:
  [fastify-best-practices](../fastify-best-practices/SKILL.md).

### A module with no logic

`workspace/routes.ts` is a single list read. It does not need a service — but it
does need to stop querying in the handler. Inject the store and call it:

```ts
const workspaces = app.container.workspaceStore;
app.get('/workspace', async () => workspaces.listForCurrentUser());
```

Adding a service here would be ceremony. Adding a repository is the minimum that
keeps the ring boundary real.

## SSE and long-running work

A review run streams progress rather than returning once. Keep the split:

- The **use case** emits domain events (`RunEventKind`) to an injected event
  sink port — it does not know what SSE is.
- `platform/sse.ts` (`RunBus`) and the route own the transport.
- The **job runner** is an adapter too: the service registers a handler and
  receives typed payloads; `JobRunner` owns polling, timeouts, and retries.

That is what lets the same `reviewPullRequest` core run under the studio (SSE +
Postgres) and the CI runner (log + artifact) with no changes — the property
`reviewer-core` already has and must keep.

## Testing a use case

Construct it with fakes from `adapters/mocks.ts` and assert on behavior:

```ts
const service = new RepoService(
  new InMemoryRepoStore(),
  new MockGitClient(),
  new MockSecretsProvider({ GITHUB_TOKEN: 'x' }),
  new FakeJobQueue(),
);
```

No container, no Postgres, no `*.it.test.ts` suffix needed. If a test for a use
case needs Docker, a ring boundary is wrong — that is the signal, and it is a
more reliable one than reading the imports. Per-ring test strategy:
[container.md](container.md#testing-per-ring).
