# Module Boundaries and Enforcement

A folder structure is a suggestion. A boundary is a rule a machine checks.
Without enforcement, every layering convention degrades within a few sprints —
someone is in a hurry, the import works, the reviewer is tired.

Modularity = **organization** (folders) + **encapsulation** (guardrails).
Folders alone are decoration.

## Dependency Direction

```
        app/          (routes, providers, composition)
          │  may import ↓
      features/        (domain modules — never each other)
          │  may import ↓
       shared/         (components, hooks, lib, utils, config, types)
```

Three rules, in decreasing order of how often they are violated:

1. **No cross-feature imports.** `features/billing` may not import
   `features/auth`. If both need the same thing, it moves into `shared/`. If one
   needs to *render* the other, they are composed at the `app/` level, with the
   route passing data down.
2. **`shared/` never imports `features/` or `app/`.** A shared component that
   reaches into a feature is no longer shared.
3. **Nothing imports `app/`.** Routes are the top of the graph; they are
   composition, and composition has no consumers.

Corollary: **no cycles, ever.** A cycle between two modules means neither can be
tested, changed, or deleted independently — and in ESM it produces
`Cannot access 'X' before initialization` at runtime, usually far from the cause.

## Coupling: What to Actually Optimize

Not all coupling is bad, and eliminating it everywhere is not the goal. Cost of
software ≈ cost of change ≈ degree of coupling — so **decouple the parts that
change often**, and tolerate coupling in the parts that do not.

From loosest to tightest:

| Kind | Shape | Verdict |
|---|---|---|
| Data coupling | module calls `sum(a, b)` and gets a value back | fine |
| Control coupling | a `mode`/`isX` flag changes the callee's behavior | suspicious — usually two functions |
| Implicit coupling | shared global, module-level singleton, ambient context | avoid — invisible in the import graph |

Practical consequences:

- Prefer explicit dependencies (arguments, props) over implicit ones (globals,
  ambient context). An implicit dependency does not show up in any dependency
  graph, so no linter can protect you from it.
- Simplify interfaces: fewer props and fewer parameters means fewer reasons to
  change.
- **Cohesion is the good kind of closeness** — elements that belong together
  staying together. High cohesion inside a module is what makes low coupling
  between modules possible.

## Public API of a Module

A module should expose a deliberately small surface, so that everything behind
it can be restructured freely.

```ts
// features/orders/index.ts — the public API
export { OrderList } from './components/OrderList'
export { useOrder } from './hooks/use-order'
export type { Order } from './types'
// everything else in features/orders/ is private
```

Consumers write `import { OrderList } from '@/features/orders'`. Nothing else in
`features/orders/**` may be imported from outside. The payoff: files inside can
be renamed, split, or rewritten without touching a single caller.

**Enforce the entry point with a linter** — a public API that is only a
convention is not a public API.

## Barrel Files

Genuine trade-off; the two sides of it are both correct.

**Cost of barrels:**

- Worse tree-shaking, especially with `export *` — bundlers cannot always tell
  what is unused, so importing one hook can pull in a module's whole graph.
- Slower `tsc`, test runners, and linters: every consumer reconstructs a much
  larger dependency graph.
- Circular dependencies, almost always caused by a module's own internal files
  importing through their own `index.ts`.
- Larger dev-mode chunks in frameworks that transform per-module.

**Benefit of barrels:** a stable, enforceable public surface per module.

**The synthesis — use both, in different places:**

- ✅ One barrel **at the module boundary**, with explicit named re-exports.
- ❌ Never `export *`.
- ❌ Never import through a barrel **from inside the same module** — internal
  files use relative paths (`./components/OrderList`), never `../index`.
- ❌ No barrels for leaf folders that exist only to shorten an import.
- Alternative if the toolchain suffers: drop barrels entirely and enforce the
  allowed import paths with a linter rule instead. The boundary is the rule, not
  the file.

## Enforcement: ESLint

### Ban cross-feature imports

`import/no-restricted-paths` with one zone per feature: each feature is
unreachable from `./src/features` except from itself.

```js
// eslint.config.js
'import/no-restricted-paths': [
  'error',
  {
    zones: [
      { target: './src/features/auth',    from: './src/features', except: ['./auth'] },
      { target: './src/features/orders',  from: './src/features', except: ['./orders'] },
      { target: './src/features/billing', from: './src/features', except: ['./billing'] },
      // one entry per feature — yes, it is repetitive; generate it if it grows
    ],
  },
],
```

### Enforce the dependency direction

```js
'import/no-restricted-paths': [
  'error',
  {
    zones: [
      // features must not import from app
      { target: './src/features', from: './src/app' },
      // shared must not import from features or app
      {
        target: [
          './src/components',
          './src/hooks',
          './src/lib',
          './src/types',
          './src/utils',
          './src/config',
        ],
        from: ['./src/features', './src/app'],
      },
    ],
  },
],
```

### Declarative layers

For anything more complex than the above, `eslint-plugin-boundaries` describes
element types and the allowed relations between them, instead of a list of path
pairs. Worth it once there are more than a handful of features.

### Other rules worth turning on

- `import/no-cycle` — catches the class of bug barrels create.
- `no-restricted-imports` with `patterns` — block deep imports past a module's
  public API (`@/features/*/!(index)`).

ESLint is the right home for these rules because of editor feedback: the
violation is underlined as it is typed, not discovered in CI.

## Enforcement: dependency-cruiser

Complements ESLint rather than replacing it — better at whole-graph questions
and at producing a picture of the architecture for review.

Use it for:

- cycle detection across the entire graph,
- "orphan module" detection (dead code),
- rendering the dependency graph as an SVG in CI, so drift is visible,
- rules that span package boundaries in a monorepo.

Recommended split: **ESLint for the in-editor rules, dependency-cruiser in CI**
for the graph-level ones.

## Fitness Function

If a rule matters, there is a test for it. Architecture rules are no different:
an architecture decision that is written in a document but not checked by CI is
a preference, not a constraint.

Minimum viable setup for a new project:

1. `import/no-restricted-paths` zones for direction + cross-feature.
2. `import/no-cycle`.
3. A dependency-cruiser run in CI that fails on cycles and orphans.

That is roughly an hour of setup and it is the difference between a structure
that holds for two years and one that holds for two months.
