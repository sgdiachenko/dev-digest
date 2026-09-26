# mcp-server/AGENTS.md — @devdigest/mcp-server

Local MCP server exposing DevDigest's review flow to an AI agent (Claude
Code) over stdio: `list_agents`, `run_agent_on_pull_request`, `get_findings`,
`get_conventions`, `get_blast_radius`. No DB/FS access of its own — every
tool talks to `server/` over HTTP. Repo-wide rules: [../AGENTS.md](../AGENTS.md).
Approved design plan: [docs/plans/mcp-server.md](../docs/plans/mcp-server.md).

## Stack

Plain TypeScript, no framework, **pnpm** (own `package.json` + lockfile,
unlike `reviewer-core/`/`e2e/`). `@modelcontextprotocol/sdk` (stdio
transport) + `zod`. Consumed by an MCP client (Claude Code); the only side
effect is HTTP calls to the DevDigest API (`server/`, default
`http://localhost:3001`).

## Commands

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm dev     # tsx watch src/index.ts — stdio server, for manual MCP client testing
```

There is no `build` script: like `reviewer-core/`, this package is executed
from source via `tsx`, never compiled to JS.

## Where things live

- `src/config.ts` — the only place that reads `process.env`
  (`DEVDIGEST_API_URL`, `DEVDIGEST_MCP_POLL_INTERVAL_MS`,
  `DEVDIGEST_MCP_RUN_TIMEOUT_MS`), Zod-validated
- `src/errors.ts` — `ToolError` + `toErrorResult()` + named message builders;
  every message names the next concrete call (course principle 4)
- `src/api/client.ts` — the only I/O module (`DevDigestApi` port +
  `FetchDevDigestApi`); every response is `safeParse`d against a mirrored Zod
  contract before a tool ever sees it
- `src/resolve.ts` — `repo` (case-insensitive `full_name`) → `pr` (by
  `number`) → `agent` (by `id`), each throwing an actionable `ToolError`
- `src/run-cache.ts` — `RunCache`, one in-memory `Map<run_id, pull_id>`
  instance per process (D3) — not persisted, does not survive a restart
- `src/poll.ts` — `waitForRun()`: polls `GET /pulls/:id/runs` until a run
  leaves `running`, with an injectable clock for tests
- `src/present.ts` — Zod schemas for the compact tool outputs + the mappers
  that cut persisted-row fields and filter dismissed findings (D8) /
  non-accepted conventions (D5)
- `src/tools/*.ts` — the 5 tool definitions (name, verbatim `description`,
  flat `inputSchema`, `outputSchema`, `annotations`, `handler`)
- `src/server.ts` — `createServer(deps)`, registers the 5 tools on an
  `McpServer`
- `src/index.ts` — composition root: builds the concrete `FetchDevDigestApi`
  + `RunCache`, then `connect()`s a `StdioServerTransport`
- `src/vendor/shared/` — hand-copied subset (6 files) of
  `@devdigest/shared`, mirrored from `server/src/vendor/shared/contracts`
  (see root [AGENTS.md](../AGENTS.md) and D6 in the plan). `adapters.ts` is
  never copied here.

## Non-default conventions

- **Result, not operation.** Every tool does its own resolve → trigger →
  poll → fetch and returns a finished result in one call — no tool ever asks
  the caller to orchestrate multiple round-trips itself.
- **Flat arguments only.** Every `inputSchema` is a flat shape of scalars
  (`repo`, `pr`, `agent`, `run_id`) — never a nested object.
- **Compact responses.** `present.ts` is the only place that decides what a
  tool returns; it always trims persisted-row bookkeeping (`review_id`,
  `accepted_at`, …) and never returns a raw DB record.
- **Every error names the next step.** Use an existing builder in
  `errors.ts` or add one there — never `throw new Error('...')` directly
  from a tool handler.
- **`POST /pulls/:id/review` is fire-and-forget.** It returns before the
  review finishes; `run_agent_on_pull_request` polls `GET /pulls/:id/runs`
  itself (`waitForRun`) rather than trusting the initial response's
  `reviews` field (always `[]`).
- **`get_findings` is keyed on `run_id` only**, resolved through
  `RunCache` — there is no "review by run_id" endpoint on the API. A
  `run_id` from a different process, a restarted MCP server, or a run
  started from the web UI is reported as unknown, not guessed at.
- **`get_blast_radius` never fails and never calls the API** (D4) — it is a
  deliberate stub; the real analysis is a later course lesson.
- **stdout is the JSON-RPC channel.** Never `console.log` anywhere in this
  package; `src/index.ts`'s top-level `catch` is the only `console.error`.
- Only `check-shared-sync.sh` decides whether `src/vendor/shared/` is in
  sync — never hand-verify a diff against `server/`.

## Gotchas

- `pnpm-workspace.yaml` here holds only `allowBuilds:` (pnpm 10's build-script
  approval config) — it is NOT a multi-package workspace (no `packages:` key),
  same as `server/pnpm-workspace.yaml` / `client/pnpm-workspace.yaml`. It does
  not violate D1's "no workspace file" (that means no shared workspace linking
  this package to `server/`/`client/`). See [INSIGHTS.md](INSIGHTS.md).
- `@modelcontextprotocol/sdk`'s peer `zod` range (`^3.25 || ^4.0`) is newer
  than `server/`'s `^3.24.1` — this package pins its own `zod` version
  independently; that's expected, not drift.

## Do-not-touch without reading first

- `src/vendor/shared/` — hand-mirrored from `server/src/vendor/shared/contracts`
  (a 6-file subset, D6); edit the server's copy first, then run
  `../scripts/check-shared-sync.sh --fix`.
- `pnpm-lock.yaml` — never hand-edit; regenerate via `pnpm install` after a
  `package.json` change.

## Read When

- **Understanding why a tool is shaped the way it is** → [docs/plans/mcp-server.md](../docs/plans/mcp-server.md) (the 10 accepted decisions, D1–D10)
- **Hit unexpected behavior here** → [INSIGHTS.md](INSIGHTS.md)

## Docs map

- [README.md](README.md) — the 5 tools, their input/output shapes, error examples
- [INSIGHTS.md](INSIGHTS.md) — append-only dev log of session findings
