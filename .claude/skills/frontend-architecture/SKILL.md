---
name: frontend-architecture
description: "Frontend code architecture — where files go and which module may import which. Use when creating a new component/hook/util/constant and deciding where to put it, when a folder is growing unmanageable, when reviewing a PR for structure, or when setting up a new React/Next.js codebase. Covers feature-based structure, dependency direction, public APIs, business-logic placement, constants/types/utils placement, and Next.js App Router layout. NOT about component internals (see react-best-practices) or Next.js APIs (see next-best-practices)."
---

# Frontend Architecture

This skill answers two questions, and only these two:

1. **Where does this file go?**
2. **Is this import allowed?**

Everything else — how to write the component, which hook to use, how to fetch —
belongs to [react-best-practices](../react-best-practices/SKILL.md) and
[next-best-practices](../next-best-practices/SKILL.md). Do not restate their
rules here.

## Severity Levels

- **CRITICAL** — breaks modularity; the codebase degrades into a big ball of mud
- **HIGH** — causes coupling that makes future changes expensive
- **MEDIUM** — hurts navigability and consistency

---

## The One Rule (CRITICAL)

**Dependencies flow in one direction: `shared → features → app`.**

- `shared/*` may be imported by anyone. It may import nothing but other `shared/*`.
- `features/<x>/*` may import `shared/*`. It may **not** import another feature.
- `app/*` (routes, providers, composition) may import features and shared.
  Nothing imports `app/*`.

Two features that need the same thing do **not** import each other — the shared
part moves down into `shared/`, or the two features are composed together at the
`app/` level.

Why one direction: cost of software ≈ cost of change ≈ degree of coupling.
A cycle between modules means neither can be changed or deleted alone.

The rule is worthless unless a linter enforces it → [boundaries.md](boundaries.md).

## The Delete Test (CRITICAL)

Before accepting a structure, ask: **if I `rm -rf` this feature folder, what
breaks?**

- Correct answer: the routes/pages that composed it, and nothing else.
- Wrong answer: three other features, two shared components, and the global store.

If deleting a feature breaks other features, the boundary is wrong. Run this
test mentally on every new cross-module import.

## The Rule of Two (HIGH)

**Code is born local. It moves up only when a second consumer appears.**

- Used in one file → declare it in that file, do not export it.
- Used across one feature → `features/<x>/` at the feature root.
- Used by two or more features → move to `shared/`.

Never create a shared abstraction for a single caller "because we'll need it
later". Colocate until it hurts, then abstract. Premature promotion to `shared/`
is the single most common cause of an unmaintainable `utils/` folder.

## Baseline Structure

Start here. It is the Bulletproof React layout, which scales from a small app to
a large one without a rewrite.

```
src/
├── app/            # routes, providers, root layout — composition only
├── features/       # domain modules; the bulk of the code lives here
│   └── <feature>/
│       ├── api/          # requests + query hooks for this feature
│       ├── components/   # UI owned by this feature
│       ├── hooks/        # application logic (orchestration, state, I/O)
│       ├── lib/          # pure domain functions (no React)
│       ├── stores/       # feature-scoped client state
│       ├── constants.ts
│       ├── types.ts
│       └── index.ts      # public API of the feature (optional, see boundaries.md)
├── components/     # shared, domain-agnostic UI (design system)
├── hooks/          # shared hooks
├── lib/            # configured third-party wrappers (axios, date-fns, i18n)
├── config/         # app config + validated env
├── types/          # cross-feature types (should be nearly empty)
└── utils/          # pure, domain-neutral functions, grouped by topic
```

Rules for this tree:

- **Only create the subfolders a feature actually needs.** An empty `stores/` or
  a `types.ts` with one line is noise.
- A feature folder with 2 files does not need 6 subfolders — start flat inside
  the feature, split when a folder passes ~7 files.
- `components/` (shared) must never import from `features/`. If a shared
  component needs domain data, it is not shared — it takes props instead.
- `types/` at the root is a smell if it grows. Cross-feature types should be
  rare → [placement.md](placement.md#types-and-schemas).

**Do not adopt full Feature-Sliced Design (7 layers, `entities`/`widgets`,
same-layer import bans) unless the team already knows it.** Its useful ideas —
the explicit public API per slice and the `ui`/`model`/`api`/`lib` segment
naming — are already folded into the structure above.

## Where Does This Go?

Full decision trees in [placement.md](placement.md). The short version:

| Artifact | Default home |
|---|---|
| Component used by one route | next to the route (`app/<route>/_components/`) |
| Component used by one feature | `features/<x>/components/` |
| Component with no domain knowledge | `components/` (shared design system) |
| Pure domain calculation / validation | `features/<x>/lib/` — plain function, no React |
| Orchestration, state, effects, I/O | `features/<x>/hooks/` — a custom hook |
| Anything touching DB, secrets, auth | server-only data access layer → [nextjs.md](nextjs.md#data-access-layer) |
| Constant used in one file | that file, above the component |
| Constant used across a feature | `features/<x>/constants.ts` |
| Environment variable | `config/env.ts` — the **only** module reading `process.env` |
| Type used in one file | that file, not exported |
| Type/Zod schema shared client↔server | a contract module both sides import |
| Formatting/parsing helper | named by what it provides (`format-currency.ts`), never `utils.ts` |
| Server-owned data | a server-state library (TanStack Query) or RSC — not `useState` |
| Client-owned UI state | local state; lift only as far as needed |

## Layers of Logic (HIGH)

Push logic down to the simplest layer that can hold it:

1. **Pure functions** — calculations, validation, transformation, formatting.
   No React, no I/O. Trivially unit-testable. This is where business rules live.
2. **Custom hooks** — orchestration: wiring state, effects, and external
   systems. If you are writing `useEffect` by hand in a component, that is the
   signal to extract a hook.
3. **Components** — composition and rendering only. No domain calculations in
   the component body.
4. **Server / data access layer** — anything touching a database, secrets, or
   authorization.

A component that contains a business rule cannot be reused and can only be
tested through the DOM. Move the rule to layer 1 and the component gets both.

## Anti-Patterns (CRITICAL)

- **`utils.ts` / `helpers.ts` / `common.ts` as a destination.** A junk drawer:
  it grows without bound, nobody knows what is already in it, and functions get
  duplicated. Name a module after **what it provides**, not what it contains.
- **Cross-feature imports.** `features/billing` importing `features/auth`
  welds them together permanently. Compose at `app/` or move the shared part down.
- **A `shared/` component importing feature code.** Inverts the dependency
  direction; the design system now cannot be reused or extracted.
- **One global `constants/index.ts`.** Every file that needs one constant pulls
  in all of them, and the file becomes a merge-conflict magnet.
- **`process.env` read in more than one module.** Config becomes untraceable and
  secrets leak into client bundles.
- **Barrel files used *inside* a module.** Internal files importing through their
  own `index.ts` is the standard way to create
  `Cannot access 'X' before initialization` → [boundaries.md](boundaries.md#barrel-files).
- **A folder named after a pattern instead of a domain** (`containers/`,
  `hocs/`, `atoms/`). The structure should name the product, not the technology used.
- **Promoting to `shared/` on the first consumer.** See the Rule of Two.

## Review Checklist

When reviewing structure, check in this order:

1. Does any import point "upward" or sideways between features? (blocking)
2. Would the delete test pass for the touched feature? (blocking)
3. Is new code placed at the lowest layer that can hold it — pure function
   before hook, hook before component?
4. Was anything promoted to `shared/`/`utils/` with only one consumer?
5. Does a new file's name say what it provides?
6. Is `process.env` read anywhere outside `config/env.ts`?
7. Next.js only: is `'use client'` as close to the leaves as it can be, and does
   the route file stay thin? → [nextjs.md](nextjs.md)

## Detail References

- [placement.md](placement.md) — decision trees per artifact: components,
  business logic, constants, config/env, types and Zod schemas, utils vs lib vs
  services, state ownership, tests
- [boundaries.md](boundaries.md) — dependency direction, public APIs, the barrel
  file trade-off, and ready-to-paste ESLint / dependency-cruiser enforcement
- [nextjs.md](nextjs.md) — App Router: what belongs in `app/`, private folders
  and route groups, the server/client boundary, the data access layer
- [README.md](README.md) — the research this skill is derived from, with sources

## Project Conventions Override This Skill

A repository's own `AGENTS.md` / `CLAUDE.md` wins over every default here.
Read it first and follow its naming and layout, even where it contradicts the
baseline structure above. This skill supplies the reasoning, not the last word.
