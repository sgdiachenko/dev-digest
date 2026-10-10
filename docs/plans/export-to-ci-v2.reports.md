# Implementation reports: Export to CI v2

## W1 — contracts + schema + runner import (wave 1)
Status: partial. S1.1–S1.4 done; S1.5 pending by stop rule (worktree A not merged; no migration generated).
- S1.1 cherry-pick of a251426 without server/INSIGHTS.md pgvector line: done; 20 files under agent-runner/**.
- S1.2 CI_LIMITS, CI_PATHS, CI_ACTION_PINS, CiTrigger in server eval-ci.ts: done.
- S1.3 contract changes in server eval-ci.ts; client copy byte-identical: done.
- S1.4 schema source server/src/db/schema/ci.ts: done. New columns nullable except run_attempt (NOT NULL default 1). NULL-distinct caveat on ci_runs unique key (github_repo_id, ci_installation_id nullable); W2 upsert always sets both.
- Deviations: extra export CiRefreshResponse ({results}); agent_version required int in AgentManifest; triggers default to all three.
- Checks: check-shared-sync exit 0; server typecheck exit 0 after `npm --prefix reviewer-core ci` (installed from lockfile, environment only).

## W2 — server (wave 2)
Status: done (S2.1–S2.9). Integration test ci-repository.it.test.ts written, not run (migration pending).
- S2.1 modules/ci/{bundle,helpers,constants}.ts; `yaml` added. test/ci-bundle.test.ts passes.
- S2.2 RunnerBundleSource port + fs adapter; DEVDIGEST_RUNNER_DIR; missing file → 503 runner_bundle_unavailable. Test uses real fs adapter.
- S2.3 GitHubCiClient port; Octokit implementation; mocks. withRetry removed from commitFiles/openPullRequest/findOpenPr (no other callers). Error mapping in helpers.ts toCiError. downloadArtifact returns null on 410, manual redirect, URL never logged.
- S2.4 CiService.exportCi; all error codes covered (test/ci-export.test.ts).
- S2.5 repository with onConflictDoUpdate; integration test not run.
- S2.6 CiSyncService; test/ci-sync.test.ts (49 tests).
- S2.7 routes registered as `ci`; test/ci-routes.test.ts. Responses: installations and runs are arrays; refresh returns {results}.
- S2.8 container wiring; arch:check exit 0 (7 pre-existing warnings).
- S2.9 unit suite 79 files / 848 tests pass; no existing server/test file edited (new helper test/helpers/ci-fakes.ts).
- Deviations: extra codes provider_not_supported (422), github_token_invalid (400), github_error (502), sync_failed; error mapper in helpers.ts; logging via injected CiLogger in services; skills exported without assessSkillSafety (reviewers decide).
- Open: migration pending; OctokitGitHubCiClient has no unit tests (needs real GitHub, covered by manual flow); listRuns is not workspace-scoped (no workspace column; acceptable for single-workspace MVP); memory table content is included in the bundle (security review must confirm intended).

## W3 — agent-runner (wave 2)
Status: done (S3.1–S3.9). Tests: 5 files, 67 tests pass. typecheck exit 0; build exit 0; runs on Node 24.15 from an empty dir (controlled exit 1, no module error).
- Gates in spec order (manifest, fork, trigger, key, skills, memory); each asserted 0 LLM calls and 0 posts.
- Diff: one fetch per run between base and head; strip .devdigest/** and .github/workflows/**; diff_unavailable on failure or size > RAW_DIFF_MAX_BYTES.
- Untrusted framing: title and branch names only inside untrusted pr-description block; static task line.
- Post: review event by gate; 422 → one body-only retry; post_failed recorded without changing exit; pr_comment and none modes; never → exit 0 on completed review.
- Artifact: .devdigest-results/<slug>/devdigest-result.json on every path; v2 fields; redaction; runner_build = sha256 of shipped bytes.
- Isolation: agents independent; exit = max over agents.
- Parity test: 5 fixtures; compares src/diff.ts with server diff-parser.
- Deviations: pnpm install --frozen-lockfile used (lockfile unchanged); agent-runner/pnpm-workspace.yaml created (allowBuilds esbuild false, matching server and client); src/test-helpers.ts test-only; DEVDIGEST_POST_AS, PR_NUMBER and fork flag removed; direct-run guard replaced with realpath/pathToFileURL comparison.
- Open issues (user decision needed):
  1. dist/ contains a third file dist/package.json ({"type":"module"}) besides index.js and 300.index.js. Not shipped by CI_PATHS. In a target repo whose package.json is commonjs, the runner would fail on import. Options: ship the file (changes AC-146 from two files) or accept the risk.
  2. AC-109 parity is conditional: the server parser keeps a trailing empty entry on raw diffs ending in \n, the runner pops it. Test compares fixtures without the final newline; a separate test pins the divergence. Fix options: change server diff-parser (outside W3) or drop the runner pop (grounding loosens by one line).
- Doc debt: agent-runner/CLAUDE.md is stale (single manifest, env-driven post mode). doc-writer handles it.

## W4 — client (wave 2)
Status: done (S4.1–S4.9). lint exit 0; typecheck exit 0; full suite 98 files / 559 tests pass; check-shared-sync exit 0.
- Hooks: useCiInstallations, useExportCi, useCiRuns, useRefreshCiRuns; ci tests (4).
- CI tab: TABS and VALID_TABS include ci; CiTab with empty state, rows, flags, Fail-CI-on radiogroup, Update CI config, skeleton, error + Retry (8 tests).
- Wizard: Target and Configure with Continue gating and useModalFocus; Preview with editable workflow, edit survival, confirm-on-regenerate, 64 KB hint, runner_bundle_unavailable message; Install: PR option and zip via fflate built from Preview files (15 tests).
- Nav: ci-runs item in SKILLS LAB; nav.ciRuns in shell.json; helpers test (2 added).
- CI Runs page: AC-80 columns, "—" with reason, unlinked, differs-from-export badge only when manifest_sha256 present, Refresh with rows kept, per-repo errors, token-missing link (8 tests).
- i18n: all new strings in ci.json.
- Deviations: one INSIGHTS line in client/INSIGHTS.md (engineering-insights requirement); helpers.ts untouched (activeKeyFor already maps /ci-runs); legacy keys in ci.json left; AC-15 confirm fires on Continue from Configure; testing.tsx fixture file.
- Assumptions verified against W2: array responses and {results} refresh shape match.
- Handoff: security review of zip (in memory) and of href rendering for pr_url and github_url (server must guarantee https://github.com); AC-5 link points to /onboarding; Settings link to /settings/api-keys.
