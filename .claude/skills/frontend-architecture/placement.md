# Placement Decision Trees

One tree per kind of artifact. Each tree ends in a concrete folder.
Shared prerequisite: **the Rule of Two** — code is born local and moves up only
when a second consumer appears.

## Components

```
Does it know anything about the domain?
├── NO  (Button, Modal, Table, Spinner — props in, markup out)
│   └── shared design system: components/  (or components/ui/)
└── YES
    ├── Used by exactly one route, unlikely to be reused
    │   └── next to the route: app/<route>/_components/
    ├── Used across one feature
    │   └── features/<x>/components/
    └── Used by two or more features
        └── it is probably two components. Split the domain part from the
            presentational part; the presentational half goes to components/,
            the domain half stays in each feature.
```

Hard constraints:

- A component in `components/` importing from `features/` is a **CRITICAL**
  violation. If it needs domain data, it takes it as props.
- "Used by two features" is the trap. Before moving a domain component to
  shared, check whether the two uses will diverge. Two similar components are
  cheaper than one component with a `variant` prop matrix and six booleans.
- Splitting criterion is responsibility, not line count: a component that renders
  a list *and* filters it *and* formats the rows is three things.

### Where the sub-components go

A component with private sub-parts keeps them next to it, not in the shared tree:

```
components/data-table/
├── DataTable.tsx
├── DataTable.test.tsx
├── TableHeader.tsx        # private, only DataTable renders it
├── use-column-resize.ts   # private hook
└── index.ts               # optional public API
```

Files that change together live together. Do not scatter a component's own hook,
test, and styles across `hooks/`, `__tests__/`, and `styles/`.

## Business Logic

```
Does it touch React (state, effects, context, refs)?
├── NO
│   ├── Is it a domain rule? (pricing, eligibility, validation, formatting)
│   │   └── features/<x>/lib/<what-it-does>.ts — a pure function
│   └── Is it domain-neutral? (date math, string casing, array grouping)
│       └── utils/<topic>.ts — only after the second consumer
└── YES
    ├── Orchestration for one feature (wiring state + I/O + effects)
    │   └── features/<x>/hooks/use-<thing>.ts
    ├── Reusable across features, still React-shaped
    │   └── hooks/use-<thing>.ts
    └── Touches DB / secrets / auth
        └── NOT client code — server-only data access layer (see nextjs.md)
```

The distinction that matters:

- **Business logic** — conditionals, calculations, validation, data shaping.
  Pure functions. Unit-testable without rendering anything.
- **Application logic** — orchestration: when to fetch, what to store, how to
  react to a change. Custom hooks.

If you are hand-writing a `useEffect` inside a component, that is the signal to
extract a custom hook so the component expresses intent rather than mechanics.

A component body should read as composition. Any `if` that encodes a business
rule belongs one layer down.

## Constants

```
How many files use it?
├── One file
│   └── declare it in that file, above the component, do not export
├── One feature
│   └── features/<x>/constants.ts
└── Many features
    └── config/<topic>.ts   — grouped by topic, never one global constants file
```

- `UPPER_SNAKE_CASE` for values; a fixed set of states is an enum (or `z.enum`),
  not loose string literals.
- **Do not create a constant for a value that is self-explanatory at the call
  site.** `const ONE = 1` is worse than `1`. The test is whether the name adds
  information the literal does not.
- One `constants/index.ts` for the whole app is an anti-pattern: every importer
  pulls in everything, and the file becomes a permanent merge conflict.

## Config and Environment

```
config/
├── env.ts        # parses + validates process.env, exports typed values
└── <topic>.ts    # feature flags, limits, endpoints
```

- **`config/env.ts` is the only module in the codebase that reads
  `process.env`.** Everything else imports from it. This keeps secrets traceable
  and stops them leaking into a client bundle.
- Validate env at startup with a schema, so a missing variable fails at boot
  rather than at 3am in a request handler.
- In Next.js, only the server-side data access layer should reach config that
  holds secrets → [nextjs.md](nextjs.md#data-access-layer).

## Types and Schemas

```
How many files use this type?
├── One file
│   └── declare it there. Do NOT export it.
├── Several files in one feature
│   ├── < 3 consumers → export from the file that owns the implementation
│   └── ≥ 3 consumers → features/<x>/types.ts (or a *-contract.ts module)
├── Several features
│   └── rare, and a smell. Put it in the NARROWEST shared directory that covers
│       all consumers — not a global types/ dump.
└── Shared between client and server
    └── a contract module both sides import (or a copied shared/ module, if the
        project has no package boundary)
```

Zod specifics:

- The schema is the source of truth; the type is derived with `z.infer`. Never
  hand-write a type that duplicates a schema.
- Schema and inferred type share one name.
- A schema used by both a Server Action and a client form lives in a contract
  module, not duplicated on both sides.

A large `types/` folder at the root means types were promoted too early. Types
follow the code that owns them.

## utils / lib / services

These three names are used interchangeably in most codebases, which is exactly
why they rot. Give each one a job:

| Folder | Holds | Example |
|---|---|---|
| `utils/` | pure, domain-neutral functions | `group-by.ts`, `format-bytes.ts` |
| `lib/` | configured wrappers around third-party packages | `lib/axios.ts`, `lib/dayjs.ts` |
| `services/` or `api/` | integration with the outside world | HTTP clients, auth adapters |

Rules:

- **Name the module for what it provides, not what it contains.**
  `format-currency.ts`, `csv.ts`, `date.ts` — never `utils.ts`, `helpers.ts`,
  `common.ts`, `misc.ts`.
- A function used by one feature stays in that feature. It reaches `utils/` only
  on the second consumer.
- If you cannot name the module without the word "helper", the function
  probably belongs to the thing it helps.
- A `utils/` folder that keeps growing is not a folder problem — it means domain
  logic is being written outside its domain.

## State

The architectural question is **who owns the data**, not which library is nicer.

```
Who owns this data?
├── The server (it exists in a database; other users can change it)
│   └── a server-state library (TanStack Query) or a server component.
│       Never a useState + useEffect fetch pair.
└── The client (it exists only in this browser tab)
    ├── Used by one component        → useState in that component
    ├── Used by a subtree            → lift to the nearest common parent
    ├── Injected dependency          → Context (auth, theme, i18n)
    └── Genuinely global UI state    → a small store (Zustand)
```

- A server-state library does **not** replace a client-state library; they solve
  different problems and coexist. Once server state is handled properly, the
  amount of truly global client state is usually tiny.
- **Context is dependency injection, not a state manager.** Split contexts by
  concern — one context per responsibility.
- Colocate state as low as possible. State lifted higher than necessary couples
  unrelated components and re-renders them.

## Tests

- Unit and component tests live **next to the file they test**
  (`DataTable.tsx` → `DataTable.test.tsx`). They change together.
- Integration tests that span several components live at the feature root.
- End-to-end tests live at the **project root**, outside `src/`, because they
  must not depend on internal source structure.

This is the one place where colocation is deliberately broken, and the reason is
that e2e tests describe the product, not the code.

## Styles

- Component-scoped styles sit next to the component (CSS module, or utility
  classes inline in the markup).
- Design tokens (colors, spacing, typography) live in one place at the root —
  they are the contract of the design system.
- No global stylesheet that targets feature-specific class names. That is an
  invisible import from `shared` into `features`.
