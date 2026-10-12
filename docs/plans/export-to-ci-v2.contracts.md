# Export to CI v2 — contract guide (`eval-ci.ts`)

Read this instead of the whole file. The contract lives in
`server/src/vendor/shared/contracts/eval-ci.ts` and is mirrored byte-identically
to `client/src/vendor/shared/contracts/eval-ci.ts`; run `./scripts/check-shared-sync.sh`
after any change.

| Name | What it is | Used by |
|---|---|---|
| `CI_LIMITS` | all numeric limits (2 MiB reviewed diff, 8 MiB raw ceiling in the runner, 256 KiB result entry, 1 MiB archive, 20 runs per sync, 100 rows, 200 memory items, 500-char reason, 10-min job) | server, runner, client |
| `CI_PATHS` | workflow path, branch `devdigest/ci`, runner dir and its three files (`index.js`, `300.index.js`, `package.json`) | server, runner |
| `CI_ACTION_PINS` | full commit SHAs of the actions the generated workflow uses | server |
| `CiTrigger` | `opened` · `synchronize` · `reopened` | server, client |
| `AgentManifest` | per-agent file in the repo `.devdigest/agents/<slug>.yaml` (name, model, prompt, skills, `ci_fail_on`, `post_as`, `triggers`, `agent_version`) | server writes it, runner reads it |
| `CiExportInput` / `CiExport` | `POST /agents/:id/export-ci` request and response | client wizard, server service |
| `CiInstallation` | one agent in one repository, with the export-time snapshot | server, client CI tab |
| `CiRun` / `CiRunStatus` | one CI run row; status `succeeded` · `no_findings` · `failed` · `skipped` · `cancelled` | server sync, client CI Runs |
| `CiResultArtifact` | `devdigest-result.json` written by the runner per agent; no identity fields (identity comes from the GitHub API) | runner writes, server reads |
| `CiSkillEntry` | one skill in the snapshot (slug and sha256) | server, client |
| `CiUnavailableReason` | why a run has no numbers (`artifact_expired`, `artifact_missing`, `artifact_invalid`, `artifact_too_large`) | server, client |
| `CiRefreshResult` / `CiRefreshResponse` | per-installation refresh result; response is `{results: [...]}` | server, client hook |

Changes in v2 are additive: new fields are optional or nullable, new error
codes are new strings. The runner consumes `AgentManifest` and
`CiResultArtifact` through the same Zod schemas as the server.
