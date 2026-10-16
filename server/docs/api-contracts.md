# server — API contracts

Wire contracts are Zod schemas in `src/vendor/shared/contracts/`, hand-mirrored
into `client/src/vendor/shared/contracts/` (see the root [AGENTS.md](../../AGENTS.md)).
All wire fields are `snake_case`. This file currently documents the Project
Context routes (catalog and attachments), the Onboarding Tour routes, the
Export to CI routes, the Multi-Agent Review routes, the Agent Performance
routes and the Skill Stats routes; the
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

## Multi-Agent Review

Schemas: `RunRequest` in `src/vendor/shared/contracts/platform.ts:289-294`;
`MultiAgentRun` and `AgentRunEstimate` in `contracts/observability.ts:94-117`.
Routes: `src/modules/reviews/routes.ts`; logic: `modules/reviews/service.ts`
(`resolveGroupTargets`, `runGroupReview`, `multiAgentForPull`).

### `POST /pulls/:id/review` (200)

Body is one of `{ agentId }`, `{ all: true }` or `{ agent_ids: string[] }` (the
last starts one parallel group). Mixing `agent_ids` with `agentId` or `all` is a `422`
(`service.ts:171-173`). Response: `{ pr_id, runs, reviews, multi_agent_run_id }`;
`multi_agent_run_id` is a string for `agent_ids` and `null` for `agentId` and
`all` (`routes.ts:35-42`, `:62-80`). For a group, `reviews` is `[]` and the runs
execute in the background (`service.ts:243-245`); follow them with
`GET /runs/:id/events`.

| Code | When |
|---|---|
| `200` | Group created; members run in parallel. |
| `404` | Unknown pull request or repo (`service.ts:211-214`). |
| `409` | The PR's latest group still has a running member. `details.multi_agent_run_id` is that group's id (`service.ts:224-227`). |
| `422` | `agent_ids` has fewer than 2 distinct ids (duplicates are collapsed); or reason `agent not found` (unknown, foreign-workspace or non-uuid id; checked first); `agent is disabled`; `too many agents` (more distinct ids than the workspace has enabled agents). `service.ts:171-192`. |

The route keeps the per-route limit of 10 requests per minute (`routes.ts:57`).

### `GET /pulls/:id/multi-agent` -> `MultiAgentRun | null`

| Code | When |
|---|---|
| `200` with a group | The PR's latest group: `id`, `pr_id`, `pr_number`, `ran_at`, `agent_count`, `total_duration_ms` (max of members), `total_cost_usd` (sum, null if none known), `columns`, `finding_groups`, `conflicts` (`observability.ts:94-106`). |
| `200` with `null` | The PR never had a group (`service.ts:253`). |
| `404` | Unknown pull request (`service.ts:251`). |

### `GET /runs/estimates` -> `AgentRunEstimate[]` (200)

Per agent of the workspace: `{ agent_id, runs, avg_duration_ms, avg_cost_usd }`,
averaged over the agent's last 5 `done` runs; the averages are `null` without
data (`observability.ts:111-116`, `service.ts:260-268`). The picker uses it for
the pre-run time and cost estimate.

### Compatibility (multi-agent)

Additive: `agent_ids` is a new optional body field, `multi_agent_run_id` a new
response field (null for the old modes), and the two `GET` routes are new.
Requests with `agentId` or `all` behave as before.

### Not verified

No live multi-agent run with a real LLM key was done. Times and costs in the
estimates are not measured against a real provider yet; the tests cover the
logic with mocked adapters.

## Agent Performance

Schemas: `AgentPerf`, `AgentPerfRow`, `StatsPeriod` in
`src/vendor/shared/contracts/productionize.ts:140-253`; `AgentStats`,
`AgentRunHistoryPage` in `contracts/observability.ts:160-198`. Routes:
`src/modules/agent-stats/routes.ts`; logic: `modules/agent-stats/service.ts`
and `helpers.ts`; rules shared with skills: `modules/_shared/stats-rules.ts`.
Wiring: [architecture](architecture.md#agent-performance-modulesagent-stats).
Design record: [the spec](../../docs/specs/2026-10-15-agent-performance-dashboard.md#implementation).

All three routes are read-only, workspace-scoped and start no review run.
`from` and `to` are required ISO-8601 timestamps with an offset; the period is
`[from, to)` (`routes.ts:21-28`).

| Route | Response |
|---|---|
| `GET /agents/performance?from&to` | `AgentPerf`: `period` (with the equally long `previous_*` period), `as_of`, `summary`, one `agents` row per agent (plus one "Deleted agent" row with null `agent_id`), `cost_by_agent`, `cost_by_model`, `runs_trend` (`routes.ts:42-68`). |
| `GET /agents/:id/stats?from&to` | `AgentStats`: every `AgentPerfRow` field for one agent, plus `previous_avg_cost_usd`, `runs_trend`, `findings_by_severity` (buckets), `findings_by_category`, `skills_usage` (`observability.ts:160-170`). |
| `GET /agents/:id/stats/runs?from&to&page` | `AgentRunHistoryPage`: newest first, `page_size` is always `20` (`constants.ts:5`; `observability.ts:192-197`). |

`/agents/performance` is static and wins over `/agents/:id` regardless of
registration order; `test/agent-stats-routes.test.ts` asserts it.

| Code | When |
|---|---|
| `200` | Valid period; the agent exists in the workspace. |
| `404` | `:id` is unknown or belongs to another workspace (`service.ts:33,54`). |
| `422` | `from` or `to` missing or not ISO-8601 with an offset; `from` not before `to`; `from` in the future; span over 367 days (`MAX_PERIOD_MS`, `stats-rules.ts:21,28-38`); `page` missing or below 1 (`routes.ts:31-35`). |

### Counting rules

- A run counts when its status is `done`, `failed` or `cancelled` and its source
  is `local`; `running` only feeds `summary.in_progress`
  (`stats-rules.ts:9-14`).
- Cost totals are folded in JavaScript from per-run costs, never summed in SQL,
  in a fixed order (the response order the tests fold in), so totals are exact
  IEEE doubles that are never rounded to cents; `null` when no run has a known cost
  (`agent-stats/helpers.ts:83-101`).
- `cost_by_model` entries are per-model folds, biggest first. The last entry is
  `total - fold(others)` so the entries add up to the total. When that residual
  is not a finite number above 0 (float rounding between differently ordered
  folds), the last entry keeps its own fold and the entries may differ from the
  total by float error (`helpers.ts:225-256`).
- Accept rate is `accepted / (accepted + dismissed)` as 0..1, `null` with
  nothing decided; fewer than 10 decided findings is `small_sample`
  (`stats-rules.ts:17,38-46`).
- Buckets: runs trend 1 h up to 2 days, 1 d up to 90 days, 7 d beyond; findings
  by severity 4 h up to 2 days, 1 d up to 14, 7 d up to 120, 30 d beyond
  (`constants.ts:16-28`).

### Cost meaning

`cost_usd` fields are what DevDigest recorded for a run: the amount OpenRouter
reported when it returned one, otherwise a DevDigest estimate from its price
table. They are not reconciled with provider billing, and a run without a
recorded cost counts as unknown (`unknown_cost_runs`). The client states this
in the cost label (`client/messages/en/agentPerformance.json:22`).

### Compatibility (agent performance)

The three routes are new. `AgentPerf`, `AgentPerfRow` and `AgentStats` were
reserved contracts with no route, hook or screen using them, so replacing them
breaks no consumer; `AgentStats.findings_by_severity` is now an array of
buckets. One additive migration adds `reviews_run_id_idx` and
`findings_review_id_idx` (`db/migrations/0022_perfect_kylun.sql`); it is applied
manually with `pnpm -C server db:migrate`.

### Not verified

The SQL predicates, joins and bucket arithmetic are covered by
`*.it.test.ts` files (`agent-stats.it.test.ts`, `agent-stats-perf.it.test.ts`)
that need Docker and run in CI; they were not run in the implementation
session. The 500 ms p95 budget is measured only by those tests.

## Skill Stats

Schema: `SkillStats` and `SkillWithStats` in
`src/vendor/shared/contracts/knowledge.ts:487-535` (three identical copies:
server, client, mcp-server). Routes: `src/modules/skills/routes.ts:80-102,
:177-183`; logic: `modules/skills/stats-service.ts` and `helpers.ts`. Design
record: [the spec](../../docs/specs/2026-10-15-skill-stats-tab.md#implementation).

### `GET /skills/:id/stats?from&to` -> `SkillStats` (200)

`from` and `to` are an optional pair. Both omitted returns the last 30 x 24 h
ending now (`SKILL_CARD_PERIOD_MS`, `skills/constants.ts:17`; `stats-service.ts:21-28`).

| Code | When |
|---|---|
| `200` | Both omitted, or a valid pair. `period` echoes the window used. |
| `404` | Unknown skill or a skill of another workspace (`stats-service.ts:23-24`). |
| `422` | Exactly one of the pair; or the pair fails the agent rules (order, not in the future, at most 367 days) (`routes.ts:85-102`). |

### `GET /skills` -> `SkillWithStats[]` (200)

Each row carries `stats` for the fixed card period (30 x 24 h ending when the
list is read), built from one `statsFacts` read for the whole list, with no
request per card (`stats-service.ts:42-51`; `skills/service.ts:56-61`). The
tab's 30 days start when the tab loads, so the two can differ by runs that
finished in between; the client's Refresh realigns them.

### `SkillStats` fields

| Field | Meaning |
|---|---|
| `agent_count`, `agents` | Agents linked now, enabled or not; `agents` is ordered by name then id, with no cap (`helpers.ts:263-264`, `knowledge.ts:497-508`). |
| `pull_pct`, `pull_runs`, `pull_runs_total`, `runs_without_skill_data` | Pull base is the linked agents' counted runs in the period that have a recorded skill list. `pull_pct` is a whole percent of base runs whose list contains the skill, `null` when the base is empty. Runs with no recorded list count only in `runs_without_skill_data`. |
| `skill_runs` | Counted runs of any agent (linked, unlinked or deleted) whose recorded list contains the skill. |
| `findings`, `by_category`, `accepted`, `dismissed`, `pending` | Findings of the `done` runs among `skill_runs`; categories count descending then A to Z. |
| `accept_rate`, `accept_pct`, `small_sample` | Same rules as agent stats; `accept_pct` is the whole percent of `accept_rate`. |
| `last_used_at` | Start of the latest counted run that used the skill, at any time; `null` if none. |
| `period`, `as_of` | `{ from, to }` the figures cover (no previous period) and the read time. |
| `findings_30d` | `@deprecated`: always equal to `findings`; removal is not scheduled. |

A "recorded skill list" is `run_traces.trace.config.skills` when it is a JSON
array whose elements are all strings. It is validated in JavaScript by
`isRecordedSkillList` (`stats-rules.ts:59-61`); anything else (absent, null,
an object, a non-string element) means the run has no skill data and never fails
the read. Skill ids are compared as text, not cast.

### Compatibility (skill stats)

This is an intentional, recorded semantic change. Every old key keeps its name
and type, but the values follow the agent-performance rules: counted runs, not
reviews of the agents linked now; a period instead of the fixed review-date
window; a pull base without runs lacking a skill list. New keys are additive,
and the `from`/`to` pair is optional. Unlinking a skill no longer rewrites
history for runs that recorded it. An external consumer would see new meanings
under old keys. `server`, `client` and `mcp-server` are private `0.0.0`
packages, so no version bump applies; the change belongs in the PR description.
Unchanged: `/runs/estimates`, PR run history, run trace, multi-agent, CI runs,
`POST /agents/:id/skills`.

### Not verified

`skill-stats.it.test.ts` and `skill-stats-perf.it.test.ts` need Docker and run
in CI only. `statsFacts` reads every counted run of the workspace once per
request (all time, for `last_used_at`), de-TOASTing each trace's skill list; the
perf test measures this, and the plan names a narrower scan as the fallback if
the budget fails (plan: *Risks*, REC16).
