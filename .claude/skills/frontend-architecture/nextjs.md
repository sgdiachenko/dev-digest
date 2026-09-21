# Next.js App Router — Architectural Layout

Only the structural decisions. For framework APIs, file conventions, caching and
rendering behaviour, see
[next-best-practices](../next-best-practices/SKILL.md).

Next.js is deliberately unopinionated about organization: it offers mechanisms,
not a layout. Pick one strategy and be consistent — mixing them is worse than
picking the "wrong" one.

## `app/` Is Routing, Not a Home for Code

The single most useful rule: **a route file is composition, not
implementation.**

```tsx
// app/repos/[repoId]/pulls/[number]/page.tsx
export default async function Page({ params }) {
  const { repoId, number } = await params
  const pull = await getPullDTO(repoId, number)   // data access layer
  return <PullReview pull={pull} />               // the feature owns the UI
}
```

A `page.tsx` should read the params, call into the data layer, and render a
feature component. Business logic, data shaping, and large JSX trees live in the
feature module.

Three legitimate strategies for where the rest of the code lives:

1. **Everything outside `app/`** — `app/` holds only routes; all code is in
   `src/features`, `src/components`, etc. Cleanest separation, best default.
2. **Top-level folders inside `app/`** — `app/features/`, `app/components/`.
3. **Split by route** — globally shared code at the root, route-specific code
   colocated in the segment that uses it.

Strategy 1 combines best with the feature structure in
[SKILL.md](SKILL.md#baseline-structure). Strategy 3 works well for a small app
and degrades gracefully into strategy 1.

## Colocation Is Safe by Default

A route is **not** publicly reachable until the segment contains `page.tsx` or
`route.ts`, and only what those return is sent to the client. So any other file
may sit inside a route segment without becoming a URL.

Two organizing tools:

- **Private folders `_folder`** — explicitly opt a folder and its subtree out of
  routing: `app/repos/_components/`, `app/repos/_lib/`. Not required for
  colocation, but they separate UI from routing at a glance and avoid collisions
  with future framework file conventions.
- **Route groups `(group)`** — organize without affecting the URL. Use for:
  grouping by section or team (`(marketing)`, `(app)`), giving a subset of routes
  its own layout, scoping a `loading.tsx` to some routes only, and defining
  multiple root layouts.

Guidance:

- UI used by exactly one route → `app/<route>/_components/`. Do not promote it
  to the shared tree "for symmetry".
- The moment a second route needs it, it moves to the owning feature — that is
  the Rule of Two applied to routes.
- `src/` at the project root separates application code from the config files in
  the repository root. Use it.

## The Server/Client Boundary Is an Architectural Boundary

Server Components are the default. `'use client'` is an opt-in, and it is not a
per-component decision:

- **`'use client'` marks the whole module and everything it imports.** One large
  client file drags its entire import graph into the browser bundle. Keep client
  modules small and leaf-shaped.
- **Push the boundary down.** Data fetching and static rendering stay on the
  server; only the genuinely interactive leaf becomes a client component.
- **Client Components cannot import Server Components**, but they *can* render
  them when passed as `children` or props. This is the key composition move: an
  interactive client wrapper around server-rendered content.
- **Only serializable data crosses the boundary** — no functions, no class
  instances. If a prop cannot be serialized, the boundary is in the wrong place.

Structural consequence: the RSC split revives container/presentational at the
runtime level. The server component is the container (it fetches and decides);
the client component is presentational plus interactivity. Design feature
folders with that in mind — a feature typically exposes one server entry point
and several small client leaves.

## Data Access Layer

For new projects, the recommended architecture is a dedicated **Data Access
Layer**: an internal module that is the only thing allowed to touch data.

A DAL must:

1. **Run only on the server** — mark it with `import 'server-only'` so importing
   it from a client module is a build error.
2. **Perform authorization checks** inside each function.
3. **Return minimal DTOs** — only the fields the UI needs, never a raw database
   record.

It is also the **only** place that reads `process.env`, which keeps secrets out
of every other layer.

```
src/data/           # or features/<x>/data/
├── auth.ts         # getCurrentUser(), cached per request
├── user-dto.ts     # 'server-only'; queries + authz + DTO shaping
└── posts.ts        # 'server-only'; reads and mutations
```

Rules that follow from this:

- **Server Actions stay thin.** A `'use server'` function validates input and
  delegates to the DAL. It does not contain queries.
- **A page-level auth check does not protect a Server Action defined on that
  page.** Every exported action is an independently reachable POST endpoint, so
  it re-verifies authentication *and* authorization (resource ownership) on its
  own.
- **Never query the database directly in a component** beyond prototypes. It
  makes it trivially easy to pass a whole record into a client component and
  leak fields.
- Return values of Server Actions are serialized to the client — return what the
  UI needs, not the updated row.
- Mutations never happen during render. Rendering is for reading.
- Taint APIs are a safety net, not a boundary. Filter in the DAL first.

Choose **one** data-fetching approach for the whole project — DAL, external HTTP
APIs, or component-level access — and do not mix them. Mixed approaches make it
impossible for a reviewer or an auditor to know what to expect.

## Structural Review Checklist for App Router

1. Does any `page.tsx` contain business logic or a large JSX tree? → move to a
   feature module.
2. Is `'use client'` on a module that imports half the app? → push it to leaves.
3. Does a client component receive a whole entity when it renders three fields?
   → narrow the DTO.
4. Are database calls or `process.env` reads present outside the DAL?
5. Does every Server Action re-check auth and resource ownership?
6. Is `_folder` used for colocated non-routable files, or are helpers scattered
   into a global folder for no reason?
7. Are route groups used to organize, rather than nesting real URL segments that
   nobody asked for?

## When a Repository Already Has a Convention

Follow the repository's `AGENTS.md` / `CLAUDE.md` over everything above:
component folder layout, naming, and where shared contracts live are decisions
a project makes once. This file supplies reasoning for new decisions, not a
mandate to restructure existing ones.
