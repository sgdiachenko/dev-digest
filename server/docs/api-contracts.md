# server — API contracts

Wire contracts are Zod schemas in `src/vendor/shared/contracts/`, hand-mirrored
into `client/src/vendor/shared/contracts/` (see the root [AGENTS.md](../../AGENTS.md)).
All wire fields are `snake_case`. This file currently documents only the
Project Context routes (catalog and attachments); the other modules' shapes live in their
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
| `used_by` | `{ agents: {id, name}[], skills: {id, name}[] }` \| null. Direct attachments only. Empty arrays mean "not used"; `null` means usage is unavailable. Was always `null` before the [attachments spec](../../docs/specs/2026-09-30-project-context-attachments.md) (`contracts/project-context.ts:13-34`). |

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

### Compatibility (catalog)

The three routes and `project-context.ts` are new; `SpecFile`, `IndexStatus`,
`POST /repos/:id/resync` and `POST /repos/:id/refresh` are unchanged (plan
`docs/plans/project-context-catalog.md`, *Review handoff → API compatibility*).

## Project Context attachments

Attach catalog documents to agents and skills. Schemas:
`src/vendor/shared/contracts/project-context.ts:71-141`. Routes:
`src/modules/context-attachments/routes.ts:27-70`. Wiring:
[architecture.md](architecture.md#project-context-attachments-modulescontext-attachments).
Design record: [attachments spec](../../docs/specs/2026-09-30-project-context-attachments.md#implementation).

| Route | Body | `200` |
|---|---|---|
| `GET /agents/:id/context?repo_id=` | none | `AgentContextView` |
| `PUT /agents/:id/context?repo_id=` | `ContextAttachmentsBody` | `AgentContextView` |
| `GET /skills/:id/context?repo_id=` | none | `SkillContextView` |
| `PUT /skills/:id/context?repo_id=` | `ContextAttachmentsBody` | `SkillContextView` |

`repo_id` (uuid, required on all four routes, including `PUT`) selects the
repository whose budget, estimates and `inherited` section the returned view is
computed for. A missing or non-uuid `repo_id` returns `422`.

### Request: `ContextAttachmentsBody`

`{ docs: { repo_id: string (uuid), path: string (1-4096) }[] }`. The list is
**ordered and complete**: it covers every repository, and a save replaces the
stored list (idempotent, last confirmed save wins). The body and each entry are
`.strict()` (an extra field is `422`), and `docs` holds at most 20 entries
(`contracts/project-context.ts:75-89`; `constants.ts:2`).

### Responses

`AgentContextView`: `repo_id`, `budget_tokens` (8000,
`repo-intel/constants.ts:68`), `total_est_tokens`, `over_budget`, `own:
AttachedDoc[]`, `inherited: InheritedDoc[]`. `SkillContextView` has no
`inherited` but adds `serialized` (the exact `## Project context` block the
skill's documents would produce) and `serialized_est_tokens`
(`contracts/project-context.ts:121-141`). `own` lists the owner's attachments
for **all** repositories; clients filter by `repo_id`. `total_est_tokens`,
`over_budget`, `would_skip` and `inherited` are computed for the requested
`repo_id` only.

`AttachedDoc`:

| Field | Type |
|---|---|
| `repo_id`, `path` | string |
| `position` | int, saved order |
| `category` | `specs` \| `docs` \| `insights` \| null (null when the path left the catalog) |
| `est_tokens` | int \| null |
| `status` | `ok` \| `empty` \| `missing` \| `too_large` \| `unreadable` |
| `would_skip` | `over_budget` \| null (a run would drop it) |

`InheritedDoc` is an `AttachedDoc` plus `skill_id`, `skill_name`,
`skill_active`, `skill_inactive_reason` (`disabled` \| `unsafe` \| null) and
`duplicate` (already attached directly or by an earlier skill; counted once).
`skill_inactive_reason` is additive and not in the approved spec text
(plan D3). Inactive skills' documents are listed but excluded from the total.

`serialized_est_tokens` (and `total_est_tokens`) is the **sum of catalog
estimates**, not a token count of the rendered text (plan D5).

### Status codes

| Code | When |
|---|---|
| `404` | The agent or skill is not in the workspace. |
| `422` | Missing or invalid `repo_id`; more than 20 entries; a duplicate `(repo_id, path)`; an extra field in the body or an entry; a `repo_id` outside the workspace; a **newly added** path that is not in that repository's catalog. |

A rejected `PUT` leaves the stored list unchanged. A path that is already saved
but has left the catalog may stay and be reordered (plan D1). A `too_large`
document can be attached through the API (the editor blocks it, AC-16) and is
skipped at run time. `GET` with an unknown `repo_id` returns `200` with an
empty view for that repository; only a missing agent or skill is `404`. The
first `GET` or `PUT` for a repository that has no catalog row can start a
catalog scan, and new paths get `422` until it finishes.

### Versioning and side effects

- `PUT /agents/:id/context` bumps the agent version by 1 and writes a snapshot
  only when the ordered list changed; an identical list does not bump and a
  reorder does. The snapshot carries `AgentVersionConfig.context_docs`
  (`{ repo_id, path }[]`, `.nullish()`, `contracts/knowledge.ts:365`), so it
  appears in `GET /agents/:id/versions`.
- `PUT /skills/:id/context` never changes the skill version.

### Run trace

`RunTrace.project_context` (`contracts/trace.ts:127`, `.nullish()`): `sha`,
`budget_tokens`, `total_est_tokens`, `docs[]` with `path`, `source` (`agent` \|
`skill`), `skill_name`, `est_tokens`, `status` (`injected` \| `skipped`) and
`reason` (`duplicate`, `missing`, `symlink`, `too_large`, `unreadable`,
`over_budget`, or null). `specs_read` and `prompt_assembly.specs` keep their
types and are now populated. `symlink` stays in the enum but no document
reaches it: the catalog scan already excludes symlinks.

### Compatibility (attachments)

Additive only: four new routes; `RunTrace.project_context` (optional);
`ContextDoc.used_by` from always-`null` to an object (clients that read it as
`null` keep parsing); `AgentVersionConfig.context_docs` (optional). Older
traces without `project_context` parse unchanged. The contracts are mirrored
into `client/` and, for `trace.ts` and `knowledge.ts` only, `mcp-server/`
(plan S2).
