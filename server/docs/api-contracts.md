# server — API contracts

Wire contracts are Zod schemas in `src/vendor/shared/contracts/`, hand-mirrored
into `client/src/vendor/shared/contracts/` (see the root [AGENTS.md](../../AGENTS.md)).
All wire fields are `snake_case`. This file currently documents only the
Project Context routes; the other modules' shapes live in their
`modules/<name>/routes.ts` and `contracts/*.ts`.

## Project Context

Schemas: `src/vendor/shared/contracts/project-context.ts`. Routes:
`src/modules/project-context/routes.ts`. Wiring:
[architecture.md](architecture.md#project-context-catalog-modulesproject-context).

### `GET /repos/:id/context` → `ContextCatalog` (200)

| Field | Type |
|---|---|
| `repo_id` | string |
| `status` | `ready` \| `not_cloned` \| `scanning` \| `error` |
| `branch`, `scanned_sha`, `scanned_at` | string \| null (`scanned_at` is ISO) |
| `total_files` | int (eligible files before the 1,000 cap) |
| `truncated` | boolean |
| `error` | string \| null (last rescan failure reason) |
| `files` | `ContextDoc[]`, sorted by path |

`ContextDoc`:

| Field | Type |
|---|---|
| `path` | string |
| `category` | `specs` \| `docs` \| `insights` |
| `size` | int, bytes |
| `est_tokens` | int \| null (null for `too_large` / `unreadable`) |
| `status` | `ok` \| `empty` \| `too_large` \| `unreadable` |
| `secret_warning` | boolean |
| `used_by` | `{ agents, skills }` \| null. **Always `null`** until the [attachments spec](../../docs/specs/2026-09-30-project-context-attachments.md) (approved, not implemented) lands. |

A repository not in the workspace returns `404`.

### `GET /repos/:id/context/file?path=` → `ContextDocContent` (200)

`ContextDoc` without `used_by`, plus `sha` (string) and `content`
(string \| null; null unless `status` is `ok` or `empty`). `path` is required
(1–4096 characters) and is only compared with the catalog's paths, never joined
onto a file system path; a missing `path` returns `422`.

`404` bodies carry `details.reason`:

| `details.reason` | Meaning | Source |
|---|---|---|
| `not_in_catalog` | `path` is not an entry of the current catalog (unknown, `../`, absolute, excluded path). No git call is made. | `service.ts:96` |
| `commit_unavailable` | The scanned commit can no longer be read (gc or re-shallow). Use Rescan. | `service.ts:115` |

Both also carry `branch` and `sha`.

### `POST /repos/:id/context/rescan` → `ContextRescanAccepted` (202)

`{ status: 'accepted', catalog_status: ContextCatalogStatus }`. Fetches, advances
the clone to `origin/<default branch>` and rebuilds the catalog in the
background; concurrent rescans of one repository share one scan.

### Compatibility

The three routes and `project-context.ts` are new; `SpecFile`, `IndexStatus`,
`POST /repos/:id/resync` and `POST /repos/:id/refresh` are unchanged (plan
`docs/plans/project-context-catalog.md`, *Review handoff → API compatibility*).
