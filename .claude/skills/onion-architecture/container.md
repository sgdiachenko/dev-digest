# The composition root

`platform/container.ts` (with `app.ts` / `server.ts`) is ring 5: **the one place
that knows which concrete class backs which port.** It is allowed to import
everything precisely because nothing imports it.

## What the root is for

- Decide the implementation per port (real vs mock, OpenAI vs Anthropic vs OpenRouter).
- Own construction order and lifetime (singleton per app instance, lazy where a
  secret must be resolved first).
- Build the use cases and hand them their ports.

Everything else asks for what it needs and receives it. Commandment 5: **only
the root says `new` on a concrete adapter.**

## Lazy resolution is fine; leaking it is not

The existing lazy getters are good design — they mean an app that never reviews
anything never constructs an LLM client, and `embeddingsEnabled: false` makes
zero OpenAI requests because the guard throws *before* the client is built.

```ts
get git(): GitClient {
  if (this.overrides.git) return this.overrides.git;
  this._git ??= new SimpleGitClient(this.config.cloneDir);
  return this._git;
}
```

Keep that. What must not leak outward is the *container itself*: services take
ports, not `Container` ([services.md](services.md#constructor-injection)). The
root's job is to resolve, then hand over.

## Building use cases in the root

Today each route does `new RepoService(app.container)`. Once services take
ports, construction moves to the root, and the route just reads it:

```ts
// platform/container.ts
get repoService(): RepoService {
  return (this._repoService ??= new RepoService(
    new DrizzleRepoStore(this.db),
    this.git,
    this.secrets,
    this.jobs,
  ));
}
```

```ts
// modules/repos/routes.ts
const service = app.container.repoService;
```

This is also what breaks the `service → container → service` cycle: the arrow
now only points one way.

## Why the root may import modules

`container.ts` importing `AgentsRepository`, `ReviewRepository`, and
`RepoIntelService` looks like a layer violation and is not — it is the root's
whole purpose. The reason it is safe is the reason it must stay *only* here: the
moment a second module imports another module's repository directly, the
"container is the only broker" property is gone and two features are welded
together. Cross-module sharing goes through a root-owned instance
(`container.agentsRepo`, `container.reviewRepo`).

The one caveat: a root-owned *service* (`RepoIntelService`) that itself takes
`Container` re-creates the cycle. Give it ports like any other use case.

## Secrets and config

Two chokepoints, and no third:

- `adapters/secrets/local.ts` — the only module that reads `process.env` **for a
  secret**. Prefers `~/.devdigest/secrets.json` (mode `0600`), falls back to env.
- `platform/config.ts` — the only module that reads `process.env` for
  configuration, producing `AppConfig`.

Everything else receives `SecretsProvider` or `AppConfig`. `db/seed.ts`,
`db/migrate.ts`, and `adapters/git/simple-git.ts` (which sets
`GIT_TERMINAL_PROMPT`/`GCM_INTERACTIVE` for subprocesses) are the documented
exceptions. `process.env` is not an import, so the linter cannot see it — it is
checklist item 8 and a grep in [enforcement.md](enforcement.md).

After persisting a new key, call `invalidateSecretCaches()` — cached provider
clients would otherwise keep the old credential.

## Testing per ring

Each ring has one natural test style. If a test needs machinery from a further-out
ring, the boundary is wrong.

| Ring | Style | Needs | Suffix |
|---|---|---|---|
| 0 contracts | parse/round-trip a Zod schema | nothing | `*.test.ts` |
| 1 domain services | call the function with literal inputs; inject a stub `LLMProvider` | nothing — no keys, no network | `*.test.ts` |
| 2 ports | none (interfaces have no behavior) | — | — |
| 3 use cases | construct with fakes from `adapters/mocks.ts`; assert behavior and port calls | nothing | `*.test.ts` |
| 4 adapters (DB) | real Postgres via testcontainers | Docker | **`*.it.test.ts`** |
| 4 adapters (SDK) | pin the HTTP layer or use a recorded fixture | nothing | `*.test.ts` |
| 4 routes | `app.inject()` against a container wired with mocks | nothing | `*.test.ts` |
| 5 root | boot the app with all-mock overrides, assert wiring | nothing | `*.test.ts` |

Two hard rules from the repo:

- **A DB-backed test file must end in `*.it.test.ts`** or the unit/integration
  CI split silently miscounts it.
- **`adapters/mocks.ts` is shared** — a change there ripples into every unit
  test. Add a new mock rather than bending an existing one.

The container's `overrides` is the seam:

```ts
const container = new Container(config, db, {
  github: new MockGitHubClient(),
  llm: { openrouter: new MockLLMProvider({ structured: fixture }) },
  repoIntel: new MockRepoIntel(),
});
```

`overrides` exists for tests; production wiring never passes it. If a test needs
a fake that `ContainerOverrides` cannot express, add the port to the overrides
type — do not reach around the container.

Cross-package strategy and the five CI workflows:
[TESTING.md](../../../TESTING.md).
