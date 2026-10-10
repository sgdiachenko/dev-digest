# server — API contracts

Wire contracts are Zod schemas in `src/vendor/shared/contracts/`, hand-mirrored
into `client/src/vendor/shared/contracts/` (see the root [AGENTS.md](../../AGENTS.md)).
All wire fields are `snake_case`. This file currently documents the Project
Context routes (catalog and attachments), the Onboarding Tour routes and the
Export to CI routes; the
other modules' shapes live in their `modules/<name>/routes.ts` and
`contracts/*.ts`.

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

## Onboarding Tour

A per-repository tour of the codebase: deterministic **facts** plus an optional
AI **narrative** overlay. Schemas: `src/vendor/shared/contracts/knowledge.ts:28-290`
(the `Onboarding` family replaces the old `OnboardingSection` / `OnboardingLink`
shape in place; no endpoint returned the old shape). Routes:
`src/modules/onboarding/routes.ts:21-61`. Wiring, storage and the generation
flow: [architecture.md](architecture.md#onboarding-tour-modulesonboarding) and the
[API map](../README.md#onboarding-tour-routes). Design records:
[facts spec](../../docs/specs/2026-10-01-onboarding-tour-facts.md),
[narrative spec](../../docs/specs/2026-10-01-onboarding-tour-narrative.md).

### `GET /repos/:id/tour` -> `Onboarding` (200)

Never calls an LLM and never executes repository content: facts are read from
git objects at the indexed SHA (`service.ts:1-12`). An unknown repository, or one
outside the workspace, returns `404`.

| Field | Type |
|---|---|
| `repo_id` | string |
| `availability` | `available` \| `not_cloned` \| `not_indexed` |
| `source_sha` | string \| null (the indexed commit; null unless `available`) |
| `computed_at` | ISO datetime |
| `index` | `OnboardingIndexInfo`: `status` (`full` \| `partial` \| `degraded` \| `failed`), `reason` (string \| null), `files_indexed`, `files_in_repo` (int \| null), `graph_available`, `files_skipped_by_tour` |
| `sections` | `OnboardingSections` \| null (null unless `available`) |
| `narrative` | `OnboardingNarrative` \| null |
| `estimated_cost` | `{ model, approx_usd: number \| null }` \| null |

Availability (`facts/availability.ts:23-31`): no clone is `not_cloned`; a clone
with no completed index, or whose tree at the index SHA cannot be listed, is
`not_indexed`. A failed index that completed once keeps its last SHA and stays
`available`. An unavailable tour reports `index.status: failed` /
`reason: no_index` when there is no index (`facts/availability.ts:38-50`).

`sections` has five members. Each carries `origin: "facts"` (the client switches
a section to AI-written only when its narrative part is non-null):

| Section | Content |
|---|---|
| `architecture` | `summary` (English template, see D2 below), `stack[]` (`kind`, `name`, `evidence_path`, `confidence` `verified` \| `convention`), `modules[]` (`path`, `file_count`), `diagram` (`nodes[]`, `edges[]` with `import_count`) or null |
| `critical_paths` | `graph_based`, `items[]`: `path`, `score`, `tags[]`, `route_count`, `importer_count` (both nullable). At most 8 items (`facts/constants.ts:15`) |
| `run_locally` | `groups[]`: `package_path`, `ecosystem`, `commands[]` with `id`, `position`, `phase` (`install` \| `environment` \| `infrastructure` \| `dev` \| `test`), `command`, `source_path`, `source_key`, `by_convention`, `env_names`, `warnings[]` (`lifecycle_hook` \| `remote_code`). At most 3 groups of 10 commands |
| `reading_path` | `graph_based`, `items[]`: `position`, `path`, `reason` (`entry_point` \| `imported_by` \| `critical`), `imported_by_position`, `tags[]`. At most 7 items |
| `first_tasks` | `items[]`: `id`, `signal` (`todo_comment` \| `missing_test` \| `route_without_test` \| `readme_missing_setup`), `path`, `path_kind`, `line`, `complexity` (`low` \| `medium`). At most 4 items, 2 per signal |

`CriticalTag` values: `entry_point`, `public_surface`, `high_fan_in`,
`security_sensitive`, `data_schema`, `runtime_config`, `docs`
(`knowledge.ts:46-54`). Section limits come from `facts/constants.ts:10-22`.

`OnboardingNarrative`:

| Field | Type |
|---|---|
| `status` | `generating` \| `ready` \| `failed` |
| `generation_id` | string |
| `source_sha` | string \| null (the commit the text describes; null while nothing good is stored) |
| `outdated` | boolean (`source_sha` differs from the tour's `source_sha`; computed on read) |
| `generated_at`, `provider`, `model`, `input_tokens`, `output_tokens`, `cost_usd` | nullable |
| `last_failure` | `{ reason, at, provider, model }` \| null. `reason`: `llm_timeout` \| `llm_error` \| `invalid_output` \| `missing_key` \| `no_structured_provider` \| `interrupted`. `provider` and `model` are nullable |
| `fallback_sections` | section keys that fell back to the facts version |
| `sections` | each member nullable (null means "use the facts version"): `architecture` (`body_markdown`, `diagram_mermaid` \| null), `critical_paths[]` and `reading_path[]` (`path`, `description`), `run_locally[]` (`command_id`, `position`, `note`), `first_tasks[]` (`task_id`, `title`, `description`, `complexity`) |

A failed generation never removes the last good narrative: `status` becomes
`failed`, `last_failure` is set, and the previous text stays in `sections`
(`narrative/overlay.ts:36-80`, `narrative-service.ts:326-358`). A `generating` row
that this process is not running, or that is older than 90 s, reads as `failed`
with `reason: interrupted` (`narrative/overlay.ts:17-28`,
`narrative/constants.ts:8`). `estimated_cost` is a rough pre-generation price
from 12,000 input and 8,000 output tokens (`narrative/overlay.ts:85-91`); `approx_usd` is
null when the model has no price.

### `POST /repos/:id/tour/narrative` -> `NarrativeGenerateAccepted` (202)

No body. `{ status: 'accepted', generation_id, already_running }`. The
generation runs in the background; the client polls `GET /repos/:id/tour`.

| Code | When |
|---|---|
| `202` | Accepted. `already_running: true` joins the run already in flight for that repository (same `generation_id`). |
| `404` | Unknown repository (`routes.ts:48-49`). |
| `409` | `{ reason: 'tour_unavailable' }`: the tour is not `available` (`routes.ts:50-51`). |
| `429` | More than 10 accepted requests per workspace in a sliding 60 s window (`narrative/constants.ts:9`, `narrative-service.ts:196-206`). `TooManyRequestsError`, code `rate_limited` (`platform/errors.ts:49-53`). The token is taken before the repository lookup, so joins, `404` and `409` also count (review ledger F2, accepted). |

One run makes exactly one structured LLM call: 60 s timeout, no re-prompt, no
HTTP retries, providers restricted to those that support structured output
(`narrative-service.ts:236-250`). It does not go through `JobRunner`. The model
comes from the `onboarding` feature-model setting. Output is grounded before it
is stored: unknown paths and command or task ids are dropped, a section that
fails validation becomes `null`, and `body_markdown` links are rewritten (D4
below). If no section survives, the generation fails with `invalid_output`.

### Deviations from the approved specs

The specs are not rewritten; these four were accepted during planning
(`docs/plans/onboarding-tour.md`, *Requirements decisions*).

| ID | Spec | What was built |
|---|---|---|
| D1 | facts AC-37 | In the `not_cloned` state the client's Resync button calls `POST /repos/:id/refresh`, because `POST /resync` does nothing without a clone (`repo-intel/service.ts:150-155`). The index banner (facts AC-39) stays on `POST /resync`. |
| D2 | facts AC-13, NFR-9 | The client renders the architecture summary from `messages/en/onboarding.json` using structured arguments. The server still fills `architecture.summary` with an English template (`facts/constants.ts:104-110`); that text is used by the Markdown export and as narrative input. |
| D3 | narrative AC-35, AC-104 | `narrative.last_failure` has two extra nullable fields, `provider` and `model` (`knowledge.ts:209-214`). They are always set by the service, and null only for a read-time `interrupted`. |
| D4 | narrative AC-65, AC-73 | The server rewrites `body_markdown`: a path that exists at the narrative's `source_sha` becomes `[path](repo:path)`, and every other link or image is reduced to its text (`narrative/markdown-links.ts:24-38`). The client links only `repo:` hrefs. The contract is unchanged. |

### Compatibility (tour)

Two new routes. The `Onboarding` contract is replaced in place, with no
consumer of the old shape. Narrative fields are additive, as is D3.
`GET /repos/:id/index-state`, `POST /repos/:id/resync` and `POST /repos/:id/refresh`
are unchanged. The contract is mirrored into `client/` and `mcp-server/`
(`knowledge.ts` in all three copies; `scripts/check-shared-sync.sh` exit 0, see
[reports](../../docs/plans/onboarding-tour.reports.md), W1).
`StructuredRequest` gained two optional fields (see
[reviewer-core pipeline](../../reviewer-core/docs/pipeline.md#structured-request-options)); the
defaults keep the existing behaviour for the review and intent callers.

### Not verified

No live narrative generation with a real key was run, so token counts, cost, the
`NoEligibleProviderError` mapping and the 300 ms acceptance target are unmeasured.
The `*.it.test.ts` files for these routes (`test/onboarding.it.test.ts`,
`test/onboarding-narrative.it.test.ts`) were type-checked but never run.

## Export to CI

Spec: [2026-10-09-export-to-ci-v2](../../docs/specs/2026-10-09-export-to-ci-v2.md).
Schemas: `src/vendor/shared/contracts/eval-ci.ts`. Routes:
`src/modules/ci/routes.ts`. Errors are `AppError`s, sent as
`{ error: { code, message } }`.

### `POST /agents/:id/export-ci` -> `CiExport` (200)

Body `CiExportInput`:

| Field | Type |
|---|---|
| `repo` | string, `owner/name` |
| `target` | `gha` (default) |
| `action` | `open_pr` (default) \| `files` |
| `post_as` | `github_review` (default) \| `pr_comment` \| `none` |
| `triggers` | non-empty `CiTrigger[]`, default `opened`, `synchronize`, `reopened` |
| `workflow_contents` | string \| null, edited workflow (size cap `CI_LIMITS.WORKFLOW_EDIT_MAX_BYTES`) |

Response `CiExport`: `installation` (`CiInstallation`, null for `files`),
`files` (`CiFile[]`), `pr_url`, `pr_number` (both null for `files`),
`pr_reused` (an open setup PR was reused).

- `files` has no side effect and takes no export lock (`service.ts:73`).
- `open_pr` commits to the fixed setup branch and opens or reuses the PR. It
  also deletes files of the agent's previous export that the new bundle no
  longer has; a skill another agent still exports is kept.
- One `open_pr` export per repository runs at a time (in-process lock).

| Status | `error.code` | Meaning |
|---|---|---|
| 400 | `github_token_missing` | No GitHub token is stored; no GitHub call was made. |
| 400 | `github_token_invalid` | GitHub answered 401 (`helpers.ts:120`). |
| 403 | `github_scope_missing` | GitHub answered 403 (token lacks the `workflow` scope or `Workflows: write`). |
| 404 | `repo_not_accessible` | The repository does not exist or the token cannot see it; also an unknown agent (`NotFoundError`). |
| 409 | `export_in_progress` | Another export to the same repository is running. |
| 409 | `agent_slug_conflict` | Another agent installed in the repository uses the same slug. |
| 409 | `branch_exists_without_pr` | The setup branch exists with no open PR. |
| 422 | `provider_not_supported` | The agent's provider is not OpenRouter. |
| 422 | `validation_error` | Bad `repo`, unsupported target, empty or oversized workflow. |
| 502 | `github_error` | GitHub rejected the request with another 4xx. |
| 503 | `github_unavailable` | Rate limit, 5xx, timeout or network error. |
| 503 | `runner_bundle_unavailable` | The runner files are missing on the server; checked before any GitHub call. |

### `GET /agents/:id/ci-installations` -> `CiInstallation[]` (200)

An array, not an envelope. Each item carries the export-time snapshot
(`exported_model`, `exported_skills`, `agent_version`), the computed flags
`outdated` and `pending_update`, and `latest_run` (`CiRun` or null). An
unknown agent returns `404`.

### `GET /ci-runs?limit=` -> `CiRun[]` (200)

`limit` is an integer from 1 to `CI_LIMITS.RUNS_PAGE_MAX` (100), default 100;
an out-of-range value fails query validation. Runs are not workspace-scoped in storage (no
workspace column), so this is correct only for the single-workspace MVP
(W2 open issues in the
[reports](../../docs/plans/export-to-ci-v2.reports.md)).

### `POST /ci-runs/refresh` -> `CiRefreshResponse` (200)

`{ results: CiRefreshResult[] }`, one item per installation:
`installation_id`, `repo`, `stored` (runs stored), `error_code` (null = ok).
A failing installation does not fail the request; its `error_code` is one of
`github_scope_missing`, `repo_not_accessible`, `github_unavailable` or
`sync_failed` (`constants.ts:34`).

### Not verified

No live GitHub run was made: the 403 mapping for classic and fine-grained
tokens (spec AC-110) and the 30 s refresh target (NFR-2) are manual rows. The
persistence test `test/ci-repository.it.test.ts` is written but not run
because no migration was generated yet (see the spec's *Implementation*
section).
