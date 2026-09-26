# INSIGHTS — mcp-server

Practical findings hit while working in this module. Append-only: correct a
stale entry with a new dated line — never silently edit or delete history.

Before writing here, check [AGENTS.md](AGENTS.md) — a finding that should
*always* apply belongs there as a standing rule. This file is for things too
specific, too contextual, or too unproven for that yet.

**Anti-vague test:** if someone who just read the code wouldn't be surprised,
don't write it here.

## What Works

## What Doesn't Work

## Codebase Patterns

## Gotchas & Recurring Errors

**2026-09-26** — First `pnpm install` here exits with `ERR_PNPM_IGNORED_BUILDS`
for `esbuild` (a transitive dep of `tsx`/`vitest`) — pnpm 10 refuses to run an
unapproved postinstall script by default. This does NOT mean `tsx`/`vitest`
are broken: `esbuild` ships its actual platform binary via an
`optionalDependency` (e.g. `@esbuild/darwin-arm64`), which pnpm always
installs regardless of build-script approval; `esbuild`'s own postinstall
(`node install.js`) is a legacy-npm fallback that isn't needed once the
optional dependency resolved. `server/` and `client/` already hit the same
thing and fixed it the pnpm-10-idiomatic way: a per-package
`pnpm-workspace.yaml` with just an `allowBuilds:` map (NOT a real multi-package
workspace — no `packages:` key, so it doesn't conflict with D1's "no workspace
file"). `mcp-server/pnpm-workspace.yaml` mirrors that. Evidence: install output
`Error: ERR_PNPM_IGNORED_BUILDS … Ignored build scripts: esbuild@0.21.5,
esbuild@0.28.2`; `server/pnpm-workspace.yaml`, `client/pnpm-workspace.yaml`
(both pre-existing, same `allowBuilds: { esbuild: false }` pattern);
`mcp-server/node_modules/.pnpm/esbuild@0.21.5/node_modules/esbuild/package.json`
(`optionalDependencies` list, `postinstall: node install.js`).

**2026-09-26** — `@modelcontextprotocol/sdk@1.30.1`'s peer dependency is
`zod: '^3.25 || ^4.0'` — it does NOT accept `server/`'s `^3.24.1`. Since this
package has its own lockfile (D1), it pins `zod: ^3.25.0` independently; the
hand-copied contracts in `src/vendor/shared/` only use long-stable Zod v3 APIs
(`z.object`, `.enum`, `.nullish`, `.extend`, `.pick`, `.default`, `.passthrough`,
`z.record`) so nothing in the mirrored 6 files needed to change for 3.25.
Evidence: `mcp-server/package.json` (`"zod": "^3.25.0"`), `npm view
@modelcontextprotocol/sdk peerDependencies`.

**2026-09-26** — `McpServer#registerTool`'s `request<S extends z.ZodTypeAny>`
generic style matters: writing the HTTP client's `request()` helper as
`request<T>(path, schema: z.ZodType<T>)` type-checked the schema argument fine
but made the RETURN type structurally diverge from `z.infer<typeof Agent>`
elsewhere (fields with `.default(...)`, e.g. `Agent.strategy`, came back
optional instead of required) — TS inferred `T` from the wrong side of
`ZodType`'s `<Output, Def, Input>` generic. Fixed by inferring from the schema
type itself: `request<S extends z.ZodTypeAny>(path, schema: S): Promise<z.infer<S>>`.
Evidence: `mcp-server/src/api/client.ts` (`private request`).

## Open Questions

## Session Notes
