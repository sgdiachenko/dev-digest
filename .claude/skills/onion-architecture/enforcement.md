# Enforcement

A dependency rule nobody checks is a comment. `dependency-cruiser` is **already
a dependency of `server/`** (it backs the repo-intel import graph), so making it
a structural linter costs zero new packages.

## Install

```sh
cp .claude/skills/onion-architecture/assets/dependency-cruiser.layers.cjs \
   server/.dependency-cruiser.cjs
```

Add to `server/package.json`:

```json
"arch:check": "depcruise src --config .dependency-cruiser.cjs",
"arch:graph": "depcruise src --config .dependency-cruiser.cjs --output-type archi | dot -T svg > arch.svg"
```

Then:

```sh
cd server && pnpm arch:check
```

`.cjs` (not `.js`) is required — `server/package.json` is `"type": "module"`.

## What it checks

Nine rules, all `severity: error`. The first two guard the core; the rest guard
the outer rings.

| Rule | Guards |
|---|---|
| `onion-domain-model-is-pure` | ring 0 imports nothing but `zod` and itself |
| `onion-domain-services-are-pure` | `reviewer-core` imports nothing but `zod`, `openai`, and ring 0 |
| `onion-no-persistence-in-http` | no `db/*` or `drizzle-orm` in a `routes.ts` |
| `onion-no-infra-in-http` | no `adapters/*` in a `routes.ts` |
| `onion-db-only-in-repository` | inside a module, only `repository.ts` names `db/*`, Drizzle, or an SDK |
| `onion-adapters-know-no-app` | `adapters/*` never imports `modules/*` |
| `onion-concretes-only-in-composition-root` | concrete stateful adapters named only in ring 5 |
| `onion-no-cross-module-internals` | no module imports another module's service/repository |
| `no-circular` | no import cycle anywhere |

Verified against the current tree: **149 modules, 464 dependencies, 24
violations** — all listed in [migration.md](migration.md). Rings 0 and 1 are
already clean, which is the property worth protecting first.

Two paths are exempted from `onion-db-only-in-repository` by design:
`modules/index.ts` (the plugin registry) and `modules/_shared/context.ts` (the
request-context resolver) are Fastify-typed transport glue, not use cases.

## Two configuration traps

1. **Never set `exclude: { path: 'node_modules' }`.** It drops third-party
   modules from the graph, and every rule whose `to` names an npm package then
   passes silently. With `exclude` set, this config reports 19 violations
   instead of 24 and looks like it is working. Use `doNotFollow` — packages stay
   as graph leaves but are not traversed.
2. **`tsConfig: { fileName: 'tsconfig.json' }` is mandatory here.** Without it
   the `@devdigest/shared` and `@devdigest/reviewer-core` path aliases do not
   resolve, so the two purity rules match nothing at all.

Under pnpm, resolved third-party paths look like
`node_modules/.pnpm/drizzle-orm@0.38.4_postgres@3.4.9/node_modules/drizzle-orm/index.cjs`
— which is why every npm pattern in the config is **unanchored**
(`node_modules/drizzle-orm/`, not `^node_modules/drizzle-orm/`).

## Land it without blocking the branch

The repo has 24 pre-existing violations. Do not start with a red CI:

```sh
cd server
pnpm exec depcruise-baseline src --config .dependency-cruiser.cjs   # writes .dependency-cruiser-known-violations.json
```

`depcruise --ignore-known` then fails only on **new** violations, and the
baseline file shrinks with each migration PR. It is a ratchet: entries come out,
never go in. A PR that adds a baseline entry needs a reason in the description.

## CI

Add to the server workflow, alongside `typecheck`:

```yaml
- name: Architecture boundaries
  working-directory: server
  run: pnpm exec depcruise src --config .dependency-cruiser.cjs --ignore-known
```

It is fast (no type-checking of dependencies needed beyond resolution), so it
belongs in the same job as `pnpm typecheck` rather than a separate one. Test
strategy across the five workflows: [TESTING.md](../../../TESTING.md).

## What the linter cannot see

`process.env` is not an import, so commandment "secrets have one chokepoint" needs
a grep. Current allowlist — `platform/config.ts`, `adapters/secrets/local.ts`,
`adapters/git/simple-git.ts` (sets `GIT_TERMINAL_PROMPT`/`GCM_INTERACTIVE` for
git subprocesses), `db/seed.ts`, `db/migrate.ts`:

```sh
cd server && grep -rln "process\.env" src --include='*.ts' \
  | grep -vE '^src/(platform/config|adapters/secrets/local|adapters/git/simple-git|db/(seed|migrate))\.ts$' \
  && echo "process.env outside the allowlist" && exit 1 || echo ok
```

Also invisible to it, and therefore checklist work in review:

- a repository returning `$inferSelect` rows instead of domain types (the types
  flow, not the import — [ports.md](ports.md#rowdomain-mapping));
- a port named after its vendor;
- a business rule that drifted into a handler;
- a service taking `Container` (the *import* is legal for now — it is the
  cycle it creates that `no-circular` catches).

## Alternatives considered

- **ESLint `import/no-restricted-paths` or `eslint-plugin-boundaries`** — works,
  but `server/` has no ESLint setup at all today, so this would mean adopting a
  lint stack to get one rule.
- **TypeScript project references** — would make violations *unbuildable*, the
  strongest option, but it requires splitting `server/src` into real packages
  and conflicts with consuming `reviewer-core` as source via a path alias.
- **`madge --circular`** — cycles only; no layer rules.

dependency-cruiser wins on cost here: already installed, one config file, and
its `archi` reporter renders the ring diagram for the course material.
