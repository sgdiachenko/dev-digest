# `@devdigest/mcp-server` — local MCP server

A local [Model Context Protocol](https://modelcontextprotocol.io) server,
over stdio, that lets an AI agent (Claude Code) drive DevDigest's existing
review flow programmatically. It has no database or filesystem access of its
own — every tool call is an HTTP round-trip to the DevDigest API (`server/`,
default `http://localhost:3001`).

Design rationale, the 10 accepted decisions and the technical unknowns
resolved during implementation live in
[`docs/plans/mcp-server.md`](../docs/plans/mcp-server.md).

## Design principles

Every one of the 5 tools follows 4 rules from the course material:

1. **Result, not operation** — a tool does all its intermediate steps
   (resolve → trigger → poll → fetch) itself and returns a finished result in
   one call.
2. **Flat arguments** — only simple top-level fields (`repo`, `pr`, `agent`,
   `run_id`), never a nested object.
3. **Compact structured response** — only the fields the calling agent
   needs, never a raw DB record.
4. **An error leads further** — every error message names the next concrete
   call or action.

## The 5 tools

### `list_agents`

No arguments. Returns the agents configured in this DevDigest workspace:

```json
{ "agents": [{ "id": "…", "name": "General", "description": "…", "provider": "openai", "model": "gpt-4.1" }] }
```

Call this first to get a valid `agent` id.

### `run_agent_on_pull_request`

```json
{ "repo": "owner/name", "pr": 42, "agent": "<agent id>" }
```

Resolves `repo` (case-insensitively) and `pr` to the pull already tracked in
DevDigest, triggers `agent`, and polls until the run finishes (or the
`DEVDIGEST_MCP_RUN_TIMEOUT_MS` deadline). On success:

```json
{
  "run_id": "…",
  "verdict": "request_changes",
  "summary": "…",
  "score": 62,
  "findings": [{ "id": "…", "severity": "WARNING", "category": "bug", "title": "…", "file": "src/x.ts", "start_line": 10, "end_line": 12, "rationale": "…", "suggestion": null }]
}
```

`POST /pulls/:id/review` on the API is fire-and-forget — it returns before
the review is done — so this tool does the waiting itself; a real LLM review
can take up to a few minutes. If the timeout is hit first, the call returns
an error naming the `run_id` and instructing to call `get_findings` with it
later; the run keeps going on the server regardless.

### `get_findings`

```json
{ "run_id": "<run_id from run_agent_on_pull_request>" }
```

Returns the same shape as a finished `run_agent_on_pull_request` call. If the
run is still `running`, `failed`, `cancelled`, or the `run_id` is unknown in
this MCP server process (a different process, a restarted server, or a run
started from the web UI), the call errors with a message explaining what to
do next — there is no "review by run_id" endpoint on the API, so this only
works for a `run_id` this same process has already seen.

### `get_conventions`

```json
{ "repo": "owner/name" }
```

```json
{ "conventions": [{ "rule": "…", "rationale": "…", "category": "naming" }] }
```

Only `status === 'accepted'` conventions are returned — the same house rules
already injected into this repo's review prompts. Pending/rejected
candidates are never included.

### `get_blast_radius`

```json
{ "repo": "owner/name", "pr": 42 }
```

A deliberate stub — no API call, never an error:

```json
{ "implemented": false, "message": "Blast radius analysis is not implemented yet.", "affected_files": [] }
```

The real analysis (reading `repo-intel`'s dependency graph) is a later
course lesson's homework.

## Error shape

Every failure is a normal MCP tool error (`isError: true`) with one `text`
content block whose message names the next concrete step, e.g.:

```
Repo "acme/widgets" is not tracked in this DevDigest workspace. Add it first
(paste its URL in the DevDigest web UI, or POST /repos), then retry.
```

```
run_id "a1b2c3" is not known in this MCP server session (it may belong to a
different process, a restarted MCP server, or a run started from the web
UI). Call run_agent_on_pull_request again to start a new run.
```

## Configuration

Environment variables (all optional; read once in `src/config.ts`):

| Variable | Default | Meaning |
|---|---|---|
| `DEVDIGEST_API_URL` | `http://localhost:3001` | Base URL of the DevDigest API |
| `DEVDIGEST_MCP_POLL_INTERVAL_MS` | `2000` | How often `run_agent_on_pull_request` re-checks a run's status |
| `DEVDIGEST_MCP_RUN_TIMEOUT_MS` | `300000` | How long it waits before giving up (the run keeps going server-side) |

## Running it

```sh
pnpm install
pnpm typecheck
pnpm test
```

Register it with an MCP client by pointing it at `tsx src/index.ts` (direct
`tsx`, not `pnpm start`, avoids a package-manager banner on stdout — stdout
is the JSON-RPC channel). The DevDigest API must already be running
(`../scripts/dev.sh`).

## Testing

`pnpm test` (vitest) — hermetic units: a mocked `DevDigestApi`, fake timers
for the poll logic, and assertions on the exact compact response shape
(principle 3), the error texts (principle 4), and the 5 tools' `inputSchema`
flatness / `outputSchema` presence / `annotations`. No network, no real API.
See [`../TESTING.md`](../TESTING.md).
