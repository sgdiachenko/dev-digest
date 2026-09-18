# Routing — changed files → lanes → skills

This table is the source of truth for which skill runs on which file. A lane
loads **only** the skills in its row; nothing else is read. That is the whole
context budget of a review.

Glob semantics: `**` crosses directories, `*` does not. First match wins per
column, but a file may land in several lanes (a `page.tsx` is both
`frontend-routes` and — if it holds a component — `frontend-components`);
union the skills, review the file once.

## Lanes

| # | Lane | Matches | Skills to load |
|---|---|---|---|
| 1 | `project-invariants` | always, regardless of diff | root [AGENTS.md](../../../AGENTS.md) + the `AGENTS.md` of every package in the diff |
| 2 | `contracts` | `server/src/vendor/shared/**`, `client/src/vendor/shared/**` | [zod](../zod/SKILL.md) |
| 3 | `domain-core` | `reviewer-core/src/**` | [onion-architecture](../onion-architecture/SKILL.md) |
| 4 | `backend-http` | `server/src/modules/*/routes.ts`, `server/src/app.ts`, `server/src/server.ts` | [fastify-best-practices](../fastify-best-practices/SKILL.md), [onion-architecture](../onion-architecture/SKILL.md) |
| 5 | `backend-service` | `server/src/modules/*/{service,helpers,constants,findings,diff-loader,run-executor}.ts`, `server/src/modules/_shared/**`, `server/src/platform/**` | [onion-architecture](../onion-architecture/SKILL.md) |
| 6 | `backend-data` | `server/src/modules/*/repository.ts`, `server/src/modules/*/repository/**`, `server/src/db/**` | [drizzle-orm-patterns](../drizzle-orm-patterns/SKILL.md), [onion-architecture](../onion-architecture/SKILL.md) |
| 7 | `backend-schema` | `server/src/db/schema.ts`, `server/src/db/schema/**`, `server/src/db/migrations/**` | [postgresql-table-design](../postgresql-table-design/SKILL.md), [drizzle-orm-patterns](../drizzle-orm-patterns/SKILL.md) |
| 8 | `backend-adapters` | `server/src/adapters/**`, `server/src/platform/container.ts` | [onion-architecture](../onion-architecture/SKILL.md) |
| 9 | `frontend-routes` | `client/src/app/**/{page,layout,route,loading,error,not-found,template}.tsx`, `client/src/app/**/*.ts` | [next-best-practices](../next-best-practices/SKILL.md), [frontend-architecture](../frontend-architecture/SKILL.md) |
| 10 | `frontend-components` | `client/src/app/**/_components/**`, `client/src/components/**` | [react-best-practices](../react-best-practices/SKILL.md), [frontend-architecture](../frontend-architecture/SKILL.md) |
| 11 | `frontend-lib` | `client/src/lib/**`, `client/src/i18n/**` | [frontend-architecture](../frontend-architecture/SKILL.md) |
| 12 | `frontend-tests` | `client/**/*.test.{ts,tsx}`, `client/src/test/**` | [react-testing-library](../react-testing-library/SKILL.md) |
| 13 | `types` | any changed `*.ts`/`*.tsx` that alters an exported type, generic, or function signature | [typescript-expert](../typescript-expert/SKILL.md) |
| 14 | `security` | `server/src/modules/*/routes.ts`, `server/src/adapters/{auth,secrets}/**`, `server/src/platform/config.ts`, plus any file in the diff that reads request input, builds SQL, spawns a process, or touches a token | [security](../security/SKILL.md) |
| 15 | `e2e` | `e2e/**` | none — [e2e/AGENTS.md](../../../e2e/AGENTS.md) and `e2e/specs/coverage.md` |
| 16 | `docs` | `**/*.md`, `docs/**` | none — check links resolve and that `AGENTS.md`, not `CLAUDE.md`, was edited |
| 17 | `api-compatibility` | `server/src/**`, `client/src/vendor/shared/contracts/**`, plus any changed file that can alter public API behavior (including runtime configuration and API specifications) | [breaking-change](../breaking-change/SKILL.md) — trace observable effects; skip purely internal changes |
| 18 | `response-shape` | `server/src/modules/**`, `server/src/vendor/shared/contracts/**`, `client/src/vendor/shared/contracts/**`, plus any changed serializer, hook, adapter, projection, or API specification that can alter response body structure | [response-schema](../response-schema/SKILL.md) — trace emitted JSON; skip changes with no response shape effect; consolidate overlapping findings with `api-compatibility` |
| 19 | `semver-discipline` | `server/src/**`, `reviewer-core/src/**`, `client/src/vendor/shared/contracts/**`, `**/package.json`, `**/CHANGELOG*`, `.changeset/**`, plus any changed release configuration, API specification, or documentation that affects versioning or the public contract | [semver-discipline](../semver-discipline/SKILL.md) — evaluate version or release intent after compatibility checks; internal changes alone do not require major; consolidate supporting compatibility findings |
| 20 | `deprecation-policy` | `server/src/**`, `reviewer-core/src/**`, `client/src/vendor/shared/contracts/**`, `**/package.json`, `**/CHANGELOG*`, plus any changed API specification, migration documentation, supported export, compatibility wrapper, or release configuration | [deprecation-policy](../deprecation-policy/SKILL.md) — run only when a public contract is deprecated, removed, renamed, replaced, or loses compatibility support; consolidate findings with `api-compatibility` and `semver-discipline` |

Lane order is the review order, and it is deliberate: lanes 1–2 are cheap and
can block on their own, so a failure there saves the cost of the rest.

## Skills with no lane

`mermaid-diagram` and `engineering-insights` are never routed by a file glob.
`engineering-insights` runs once at the end of a review that surfaced something
non-obvious; `mermaid-diagram` only when the review itself needs a diagram.

## Coverage invariant

Every directory in `.claude/skills/` must appear in this file — in a lane row,
or in "Skills with no lane" above. Step 2 of [SKILL.md](SKILL.md) checks it:

```sh
comm -23 \
  <(ls -1 .claude/skills | grep -v '\.md$' | sort) \
  <(grep -oE '\.\./[a-z0-9-]+/SKILL\.md' .claude/skills/pr-self-review/routing.md \
    | sed -E 's#\.\./([a-z0-9-]+)/SKILL\.md#\1#' | sort -u)
```

Anything printed (other than `pr-self-review` itself and the two unrouted
skills above) is a skill that would silently never run. Report it as a
`MEDIUM` finding and add the row — a routing table nobody checks decays into a
comment, exactly like an unenforced dependency rule.

## Known limitation

These globs are hand-written. The coverage invariant catches a *new* skill; it
does not catch a *stale glob* after a directory is renamed. When a review's
lane assignment looks wrong, check the globs against the tree before trusting
them, and fix the row in the same change.
