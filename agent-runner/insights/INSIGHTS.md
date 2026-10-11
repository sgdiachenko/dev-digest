# agent-runner Insights

Non-obvious discoveries from real sessions. Specific and actionable — pass the cold-read test.
See also: `insights/gotchas.md` for known quirks at project start.

---

## What Works

2026-07-08 — `ncc build src/index.ts -o dist` fully inlines both `@devdigest/reviewer-core` (raw TS via tsconfig path alias) and `@devdigest/shared` (also a path alias) plus their transitive deps (`zod`, `openai`) into a single `dist/index.js` with zero top-level `import`/`require` statements — verified with `grep -c "^import\|require(" dist/index.js` returning 0. `node dist/index.js` runs standalone. ref: agent-runner/package.json:9

**2026-10-09** — `pnpm build` now emits `dist/index.js`, the lazy chunk `dist/300.index.js` (dynamic import in a dependency; both ship, CI_PATHS.RUNNER_FILES) and a third file `dist/package.json` (`{"type":"module"}`) that is NOT shipped. Copied into an empty dir with no `package.json`, `node .devdigest/runner/index.js` on Node 24 runs only via ESM syntax detection; a target repo whose own `package.json` says `"type":"commonjs"` would load it as CJS and fail on `import`. Verified from a path containing a space. Evidence: `agent-runner/dist/package.json`, `agent-runner/src/index.ts`.

**2026-10-09** — Supersedes the "package.json NOT shipped" entry above: `CI_PATHS.RUNNER_FILES` is now `index.js`, `300.index.js`, `package.json` (a `{"type":"module"}` beside `index.js` beats a target repo's `"type":"commonjs"`); `runner_build` hashes all three in that order, and the server diff parser now drops the trailing empty split entry like `src/diff.ts`. Evidence: `src/build-id.ts`, `server/src/adapters/git/diff-parser.ts`.

## What Doesn't Work

2026-07-08 — `pnpm typecheck` in `agent-runner` fails with `Cannot find module 'zod'` / `'openai'` errors pointing at `reviewer-core/src/llm/*.ts` if `reviewer-core/node_modules` was never installed. Because this repo is NOT a monorepo (no `pnpm-workspace.yaml`, no hoisting across packages), TypeScript's `moduleResolution: "Bundler"` walks up the ancestor directories of the *importing file* — `reviewer-core/src/llm/` → `reviewer-core/` → repo root — and never reaches `agent-runner/node_modules` (a sibling, not an ancestor). Fix: `cd reviewer-core && pnpm install` once (creates gitignored `node_modules`, touches no tracked files) — this is also required for `cd server && pnpm typecheck` to pass cleanly, so it is not agent-runner-specific. ref: agent-runner/tsconfig.json:20

## Codebase Patterns

2026-07-08 — `agent-runner/tsconfig.json` intentionally mirrors `server/tsconfig.json`'s compiler options and path-alias block verbatim (aliasing `@devdigest/reviewer-core` → `../reviewer-core/src/index.ts` and `@devdigest/shared` → `../server/src/vendor/shared/index.ts`), so both consumers resolve the exact same source files. `agent-runner/vitest.config.ts` re-declares the same two aliases (vitest/vite doesn't read `tsconfig.json` paths automatically) — matches the pattern already used in `reviewer-core/vitest.config.ts`. ref: agent-runner/tsconfig.json:21

## Tool & Library Notes

2026-07-08 — `@vercel/ncc` versions jump from `0.38.4` straight to `0.43.0`/`0.44.x` on npm (no `0.39`–`0.42` releases). A `^0.38.3` semver range resolves to `0.38.4`, not the newer `0.44.x` line — pin explicitly if the newer major-minor is desired. ref: agent-runner/package.json:15

**2026-10-09** — `pnpm install --frozen-lockfile` in `agent-runner` exits 1 with `ERR_PNPM_IGNORED_BUILDS` (esbuild, pulled by vitest) and writes a placeholder `pnpm-workspace.yaml`; node_modules is still installed. The tracked `pnpm-workspace.yaml` (`allowBuilds: esbuild: false`) matches `server/` and `client/` and makes install exit 0. Evidence: `agent-runner/pnpm-workspace.yaml`.

## Recurring Errors & Fixes

2026-10-09 — The generated workflow invokes the ncc bundle with a relative path (`node .devdigest/runner/index.js`). Comparing `import.meta.url` to `` `file://${process.argv[1]}` `` therefore skips `main()` silently. Normalize the CLI argument with `pathToFileURL(path.resolve(process.argv[1])).href` before comparing. A smoke run using `node dist/index.js` must enter `main()` and report a missing manifest when no `.devdigest/agents` directory exists. ref: agent-runner/src/index.ts:65

2026-07-08 — A hand-rolled unified-diff parser (`diff.ts`) that does `raw.split('\n')` without dropping a trailing empty element will over-count the last hunk's new-side line coverage by one. Any diff string terminated by `\n` (which `git diff` / GitHub's `Accept: application/vnd.github.v3.diff` output always is) produces a trailing `''` after `split('\n')`; if the parser's "else = context line" branch doesn't special-case it, that phantom line gets pushed onto `newLineNumbers`, silently widening what the citation-grounding gate considers "in the diff" by one line past the real hunk. Fix: `if (lines[lines.length - 1] === '') lines.pop()` right after the split, before the per-line loop. Caught by a fixture test asserting the exact `newLineNumbers` array, not just hunk counts. ref: agent-runner/src/diff.ts:19

2026-07-08 — `if (result.error) {...} else { result.artifact.findings_count }` does NOT narrow a discriminated union (`RunCiSuccess | RunCiFailure`) in TypeScript when the discriminant property (`error`) is typed `string` on the failure branch and `undefined` on the success branch (not a shared literal). `tsc` correctly refuses to narrow on truthiness here (a failure could theoretically carry `error: ''`). Discriminate on a property with a real type difference instead — `result.artifact === null` (`CiResultArtifact | null`) narrows cleanly both ways. ref: agent-runner/src/index.ts:52

**2026-10-09** — The studio parser `server/src/adapters/git/diff-parser.ts` still lacks the trailing-empty-line `pop()`, so on any raw diff ending with `\n` (all real ones) its last hunk has one extra `newLineNumbers` entry versus `agent-runner/src/diff.ts`. The AC-109 parity test therefore compares fixtures with the final newline removed and pins the divergence in its own test. Evidence: `agent-runner/src/diff-parity.test.ts`.

**2026-10-09** — The old direct-run guard `import.meta.url === \`file://${process.argv[1]}\`` silently never ran `main()` (exit 0, nothing posted) when the checkout path had URL-encoded characters or a symlink. Compare `pathToFileURL(realpathSync(argv[1])).href` instead. Evidence: `agent-runner/src/index.ts` (`isEntryPoint`).

## Session Notes

2026-07-08 — T7: scaffolded `agent-runner/` (`package.json`, `tsconfig.json`, `src/index.ts` placeholder importing `groundingSummary` from reviewer-core + `AgentManifest` from shared, `vitest.config.ts`). Hit the cross-package `node_modules` resolution gotcha (see What Doesn't Work) — resolved by installing `reviewer-core`'s own deps. `pnpm typecheck`, `pnpm build` (ncc, single bundle, zero external imports), and `pnpm test` (no test files, passWithNoTests) all pass. Files: agent-runner/package.json, agent-runner/tsconfig.json, agent-runner/src/index.ts, agent-runner/vitest.config.ts.

2026-07-08 — T8: implemented the real CI runner CLI, replacing T7's placeholder. Module layout: `manifest.ts` (locate + Zod-validate the single `.devdigest/agents/*.yaml`), `skills.ts` (read `.devdigest/skills/<slug>.md` bodies), `context.ts` (resolve owner/repo/PR number/title/body from `GITHUB_REPOSITORY`/`PR_NUMBER`/`GITHUB_EVENT_PATH`), `diff.ts` (self-authored unified-diff parser — can't import the server's, would break bundle self-containment), `github.ts` (hand-rolled `fetch`-based GitHub REST calls — `octokit` isn't a declared dependency and adding one wasn't in scope), `artifact.ts` (build + `CiResultArtifact.safeParse` the result JSON), `errors.ts` (`RunnerError`), `run.ts` (`runCi` — the single orchestrator, one top-level try/catch for Q5 hard-fail semantics), `index.ts` (CLI entry, wires real fs/fetch/`OpenRouterProvider` into `runCi`). `run.ts` calls reviewer-core's real `reviewPullRequest` (which internally does `assemblePrompt`/`wrapUntrusted`/`groundFindings`) — never hand-rolls any of that — then computes the GitHub event and exit code deterministically via `toReviewPayload`/`countBlockers`/`gateTriggered` against the manifest's `ci_fail_on`, ignoring the model's self-reported `verdict`. Gap found: `AgentManifest` (frozen shared contract) has no `post_as` field — only `CiExportInput` (server export-time input) does, and the already-generated GHA workflow doesn't pass a `POST_AS`-shaped env var either. Resolved by making `postAs` an explicit `runCi()` parameter (fully unit-testable) and resolving it at the CLI layer from an optional `DEVDIGEST_POST_AS` env var (default `'github_review'`) — flagged as a cross-track wiring gap for whoever finishes the end-to-end workflow → runner env contract. 19 hermetic tests (`manifest.test.ts`, `diff.test.ts`, `run.test.ts`) cover AC-20 through AC-26, AC-36 parity, and the Q5 hard-fail path; `pnpm typecheck`, `pnpm test`, and `pnpm build` all pass; `dist/index.js`'s 7 `@devdigest` occurrences are all inside comments, confirming zero runtime `@devdigest/*` imports survive bundling. Files: agent-runner/src/{errors,manifest,skills,diff,context,github,artifact,run,index}.ts, agent-runner/src/{manifest,diff,run}.test.ts.

## Open Questions

2026-07-08 — `AgentManifest` has no `post_as` field and the generated GHA workflow (`server/src/modules/ci/workflow.ts`) doesn't set a `POST_AS`-equivalent env var, so in production the runner will always fall back to `index.ts`'s default (`'github_review'`) regardless of what the studio's export dialog captured (`CiExportInput.post_as`). Should `post_as` be folded into `AgentManifest` (persisted per-agent, read by the runner) or threaded through the workflow as an explicit env var? Whoever owns the export/workflow-generation track should close this loop — `runCi()` already accepts `postAs` as a first-class parameter, so wiring either fix through only touches `index.ts` plus the manifest/workflow generator. ref: server/src/vendor/shared/contracts/eval-ci.ts (AgentManifest), agent-runner/src/index.ts:25

**2026-10-09** — Resolved: `post_as` is a required `AgentManifest` field read per agent by `src/run.ts`; `DEVDIGEST_POST_AS` is gone. `runner_build` = sha256 over the bytes of `index.js` then `300.index.js` in the bundle's own directory (`src/build-id.ts`), `unknown` when run from source. Evidence: `agent-runner/src/run.ts`, `agent-runner/src/build-id.ts`.

**2026-10-09** — Correction to the "Resolved" entry above: `runner_build` is the sha256 over all three shipped files, `index.js`, `300.index.js` and `package.json`, in that order (`CI_PATHS.RUNNER_FILES`), not just the first two. Evidence: `agent-runner/src/build-id.ts`.
