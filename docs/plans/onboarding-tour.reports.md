# Reports: onboarding-tour

## W4 (S6) — done
- Files: client/src/vendor/ui/nav.ts, client/src/components/app-shell/helpers.ts (+test), client/src/lib/github-urls.ts (+test, new)
- Targeted checks: vitest (2 files), eslint, client typecheck — all exit 0
- Deviation: frontend-architecture and typescript-expert SKILL.md not opened (small pure change)
- Handoff: `/onboarding` → "" fallback sits after the tour regex; other NAV consumers unchecked

## W5 (S7) — done
- Files: .claude/skills/pr-self-review/routing.md, .claude/agents/implementer.md, server/.dependency-cruiser.cjs (new rule pure-folders-are-pure; two rule `from`s widened)
- Checks: `pnpm -C server arch:check` exit 0 (0 errors, 7 pre-existing warnings); coverage-invariant prints 4 names, not diffed against the pre-change output
- Handoff: rule's `to` is an unanchored prefix match (e.g. `repository-helpers.ts` would match); first real exercise is S8/S30

## Researcher R-B1 / R-B2 — done
- R-B2: openai 4.104.0 accepts per-request `{ maxRetries, timeout }` (core.d.ts:205-216, core.js:309, 227-229). `maxRetries: 0` likely valid (inferred; validatePositiveInteger body not read).
- R-B1: `require_parameters` semantics confirmed in OpenRouter docs. Exact status/body for "no endpoint" NOT officially documented. Community reports: message "No endpoints found that can handle the requested parameters", status 404 (low confidence); official errors table lists 503 "No available provider matching requirements".
- Surfacing: non-2xx → OpenAI SDK APIError subclass, `err.status`, `err.message = "<status> <msg>"`. HTTP 200 with `error` and no `choices` → plain Error "OpenRouter returned no choices …".
- Recommendation for S29: match on message text (/no endpoints found|requested parameters/i) for statuses 400/404/422/503, plus the 200-no-choices path; do not rely on one status. A live curl is the only way to confirm.

## W3 (S5) — done
- Files: repo-intel/{types,repository,service}.ts; test/repo-intel-graph-facts.test.ts (new), repo-intel-facade-degraded.test.ts, conventions.it.test.ts
- GraphFacts shape chosen by implementer (plan left it open): edges {from,to}[], ranks {path,rank}[], fileFacts {path,endpoints,crons}[]. Importer count derivable from edges (W6).
- Checks: targeted vitest (13 tests), typecheck, arch:check, eslint all exit 0; *.it not run
- Handoff: three reads without a transaction (mixed view possible during reindex, documented in JSDoc); the degraded test has a pre-existing type error, left alone

## W1 (S1–S3) — done
- Files: knowledge.ts ×3 (server/client/mcp-server mirrored), client/src/lib/types.ts, server/test/contracts.test.ts
- Checks: contracts test, eslint, server/client/mcp-server typecheck, mcp-server test, check-shared-sync — all exit 0
- Contract choices not in spec: position int>=0; line int>=0 nullable; score number; repo_id/source_sha/generation_id plain strings; failure provider/model nullable (W15 must always set them)
- Not run: server arch:check, full suites

## W2 (S4) — done
- Files: vendor/shared/adapters.ts (grepAt, GitGrepMatch/Options, StructuredRequest.httpRetries/requireStructuredProviders), adapters/git/{show-file-at-guard,simple-git}.ts, adapters/mocks.ts, test/git-grep.test.ts (new, 9 tests)
- Targeted checks: typecheck, arch:check (0 errors), eslint, vitest — exit 0
- Deviations: git exit 1 (no match) mapped to [] via empty-message check; matches returned in git order then cut to maxResults
- Handoff: no ReDoS guard on patterns (git's regex engine, server-chosen patterns); W12 must wire httpRetries/requireStructuredProviders in openrouter.ts

## W14 (S36 only) — done; S37 pending (runs after W7)
- Files: client/src/components/mermaid-diagram/MermaidDiagram.tsx (onInvalid via ref + [state] effect), MermaidDiagram.test.tsx (new, 4 tests)
- Checks: targeted vitest, eslint, client typecheck, full client suite — exit 0
- Handoff: callback fires once per transition into invalid, so consumers must pass a stable fallback setter; no parse-throw mock test (catch path also sets invalid)

## W12 (S29) — done
- Files: reviewer-core/src/llm/{openrouter,errors(new)}.ts, src/index.ts, test/openrouter.test.ts (T32)
- Checks: reviewer-core typecheck + test, server typecheck — exit 0
- Verified by main session: openai core.js validatePositiveInteger rejects only n<0, so per-request maxRetries:0 is valid
- Deviation: SKILL.md files (onion-architecture, typescript-expert, security) not read; reviewers to check security/layering
- Unverified: NoEligibleProviderError mapping (messages /no endpoints found|requested parameters/i on 400/404/422/503 and 200-no-choices) is not confirmed against a live OpenRouter call

## W7 (S14–S17) — done
- Files: client/messages/en/onboarding.json, lib/hooks/{tour,index}.ts, OTV/{constants,helpers,helpers.test}.ts, OTV/_components/{TourSection,MiddleTruncatedPath,CommandRow,OpenOnGitHub}/** (OTV = client/src/app/repos/[repoId]/tour/_components/OnboardingTourView)
- Exported API: fileUrl(repoFullName, sha, path, kind: "file"|"directory"); SECTION_IDS (hyphenated ids); TourSection props {id,title,origin,expanded,onToggle,emptyMessage?,children}; CommandRow {command,number,onCopied?}; OpenOnGitHub {repoFullName,sha,path,kind?}; MiddleTruncatedPath {path}; summaryArgs(sections, none); buildMarkdown(tour, repoName, t) with loose TourT
- Checks: vitest on tour dir (5 files, 24 tests), client typecheck, lint — exit 0
- Interpretations: display step numbers = list index + 1; leaf components use inline styles (styles.ts is W11's)
- Deviation: react-best-practices and react-testing-library SKILL.md only partly read

## W13 (S30–S35) — done
- Files: server/src/modules/onboarding/narrative/{constants,types,input,output-schema,ground,markdown-links,mermaid,overlay}.ts; test/onboarding-narrative-{input,ground,markdown,overlay}.test.ts; src/prompts/onboarding.system.md (rewritten, no {{sections}}/{{language}} placeholders)
- Checks: 4 test files / 25 tests, eslint, server typecheck, arch:check (pure-folders-are-pure active) — exit 0
- API notes for W15: needsPersistInterrupted(stored, now, isInFlight) is a separate export (toNarrativeView returns OnboardingNarrative|null); estimateCost prices ESTIMATE_INPUT_TOKENS in + NARRATIVE_MAX_TOKENS out; buildNarrativeInput ignores excerpt paths not from selectExcerptPaths
- Behaviour: groundNarrative keeps facts order, invalid complexity → facts value, empty section → null + fallback; invalid diagram nulls only the diagram
- Handoff: `repo:` hrefs are percent-encoded for ( ) whitespace < > — client NarrativeMarkdown (S37) must decode before lookup; mermaid node count is a heuristic
- Deviation: SKILL.md files only partly read; stray files from a wrong `cd` were moved, none left over

## W14 (S37) — done
- Files: OTV/_components/NarrativeMarkdown/{NarrativeMarkdown.tsx,index.ts,NarrativeMarkdown.test.tsx} (T38: 3 cases incl. percent-decoding and malformed escape)
- Checks: vitest NarrativeMarkdown, client typecheck, eslint — exit 0; no new dependency
- Behaviour: repo: → fileUrl (SHA-pinned, _blank, noopener noreferrer); other hrefs → text; javascript:/data: dropped; raw HTML as text
- Open for reviewers: directory links rely on a trailing "/" in the path (agent's own convention; server links only paths present in the facts set verbatim). Without it a directory gets a /blob/ URL that GitHub redirects.
- Not applied: Markdown.tsx style reuse (container + link styling only)

## W6 (S8–S13) — done
- Files: server/src/modules/onboarding/facts/{types,constants,paths,manifests,ecosystems,readme,env-example,run-locally,criticality,architecture,reading-path,first-tasks,availability,tour}.ts; 10 test files test/onboarding-facts-*.test.ts (T6–T15)
- Checks: typecheck, arch:check (0 errors), eslint, server unit suite (59 files, 520 tests) — exit 0
- Interfaces W8 must honour: TourInput {sourceSha, tree:{path,oid,size}[], files:{path,text}[], graph, grep:{todo,goMain,springApp}, skipped}; selectFilesToRead(tree)→{files,skipped}; buildTourFacts(input)→{sections,skipped}; service runs git grep for `TODO|FIXME`, `package main`, `@SpringBootApplication`, filters GitTreeEntry to blobs; decideAvailability({hasClone, index|null, treeReadable}); toIndexInfo gives failed/no_index when no index
- Behaviour: run-locally position 1..n per group, id `${package_path}#${phase}#${index}`; first tasks ≤2 per signal, ≤4 total; stack from Appendix A only (no JS framework detection from deps)
- Review notes: hasTestFile matches by file-name stem only; high_fan_in uses inclusive percentile; REMOTE_PIPE_RE and globMatchesDir (200-char cap) need a security look
- Deviation: SKILL.md files only partly read

## W10 (S25–S26) — done
- Files: OTV/_components/{TourHeader,StatusBanner,TourUnavailable,OnThisPage}/** (component + test + index each; T28, T29)
- APIs: TourHeader {repoName, sha|null, index, onExport?, actions?, meta?} (Copy link copies window.location.href; Export button only if onExport given); StatusBanner {index, onResync, resyncing?} (nothing when status full); TourUnavailable {reason: not_cloned|not_indexed, onResync?, resyncing?}; OnThisPage {items:{id,label}[], activeId|null, onExpand(id)} (does scroll, focus #id-heading, history.replaceState itself; <1024px becomes Jump-to select)
- Checks: vitest on the 4 folders (14 tests), client typecheck, lint — exit 0; full client suite not run by the agent
- W11 must: wire useRefreshRepo to onResync (D1), maintain activeId via callback-ref scroll-spy (C16), own expanded state, build the Markdown export + download
- Open (i18n, W7-owned file): StatusBanner interpolates the raw status word ("Index is degraded…"), no translated status-word keys; no clipboard-failure key for Copy link. Both optional.
- Deviation: SKILL.md files not opened

## W8 (S18–S21) — done
- Files: server/src/modules/onboarding/{types,constants,repository,service,routes}.ts; platform/container.ts (get onboarding, ??=); modules/index.ts; test/onboarding-service.test.ts (T21, 14 tests); test/onboarding.it.test.ts (T22, NOT RUN — compile-checked only)
- Checks: lint, typecheck, arch:check, unit suite (60 files, 534 tests) — exit 0
- Deviations: cache key `${repoId}:${sha}:${index.updatedAt}` (not repo+sha) so a same-sha reindex doesn't serve stale facts; grep patterns `TODO|FIXME`, `^package main` (*.go), `@SpringBootApplication` (*.java,*.kt), each capped 500 results / 3 per file, failed grep → [] + 1 skipped; magic pathspecs impossible (guard rejects them); unavailable tour → source_sha null, treeIndex empty, never-indexed (lastIndexedSha '') → not_indexed with status failed / reason no_index
- Handoff to W15: container `get onboarding()` = new OnboardingService(new OnboardingRepository(this.db), this.repoIntel, this.git); overlay (4th arg) and now left defaulted; getFacts is public and returns TourFacts incl. treeIndex; overlay is awaited on every getTour, never cached
- Review notes: cache key falls back to version 0 if a RepoIntel mock has no updatedAt; mixed view possible during reindex (W3 note); no ReDoS guard on grep patterns (server-fixed); facts reading is sequential
- Deviation: typescript-expert SKILL.md not opened

## W9 (S22–S24) — done
- Files: OTV/_components/{ArchitectureSection,CriticalPathsSection,ReadingPathSection,RunLocallySection,FirstTasksSection}/** (component + test + index; T23–T27) plus ArchitectureSection/mermaid.ts (toMermaid, created because it did not exist: generated node ids n0.., paths only in quoted escaped labels, unknown-endpoint edges dropped, null for <2 nodes)
- Props: ArchitectureSection {sections}; CriticalPathsSection/ReadingPathSection/FirstTasksSection {section, repoFullName, sha}; RunLocallySection {section, onCopied?}; all five take expanded + onToggle and pass origin="facts" to TourSection
- Checks: targeted vitest, client typecheck (one TS2532 fixed), lint — exit 0; full client suite not run by the agent
- Deviation / spec gap: "No import graph" label uses existing key architecture.noGraph; spec AC-15 text is longer ("No import graph — heuristic structure") — needs a decision on onboarding.json
- Deviation: react-best-practices and react-testing-library SKILL.md not opened
- Notes: diagram wrapper role="img" + module list as text alternative; phase labels are li role="presentation" in the ol

## W17 (S42) — done
- Files: the five section folders (component + test each) under OTV/_components/
- Behaviour: no narrative props → facts rendering unchanged (T23–T27 pass); origin="ai" when that section's narrative is non-null; Architecture: NarrativeMarkdown body, AI diagram via MermaidDiagram onInvalid → "AI diagram unavailable" + facts diagram (or No-import-graph); Critical/Reading: facts order, description by path, outdated + path not in currentPaths → "Not in current index" and OpenOnGitHub uses narrativeSha; Run locally: facts commands, narrative position reorder within group, note by command_id, unknown ids ignored; First tasks: title/description/complexity by task_id, line/path from facts
- Props the view must pass (W16/S44): Architecture {narrative, narrativeSha, repoFullName}; Critical/Reading/FirstTasks {narrative, narrativeSha, outdated, currentPaths}; RunLocally {narrative}
- Deviation: ArchitectureSection got an extra optional repoFullName prop; AI branch only active when narrative, repoFullName and narrativeSha are all present. currentPaths check = exact match or directory prefix.
- Checks: targeted vitest (35 tests), client typecheck, lint — exit 0; full client suite not run by the agent
- Deviation: SKILL.md files not opened; Prettier run on untracked files

## W11 (S27–S28) — done
- Files: OTV/{OnboardingTourView.tsx,index.ts,styles.ts,OnboardingTourView.test.tsx} (T30, 12 tests), client/src/app/repos/[repoId]/tour/page.tsx; onboarding.json (granted for this wave: noGraph → "No import graph — heuristic structure", states.statusWord.{partial,degraded,failed}, header.linkCopyFailed); ArchitectureSection.test.tsx edited (W9-owned; two "No import graph" assertions)
- Checks: tour/ vitest 82 tests, next typegen, typecheck, lint, full client suite (66 files, 320 tests) — exit 0
- Behaviour: D1 not_cloned Resync → useRefreshRepo; polling useRepoIntelStatus while not_indexed; hash scroll once; scroll-spy via callback ref in state; announce(text) reusable by S44; export via Blob download; sections origin="facts"
- Plan deviation: StatusBanner Resync also uses useRefreshRepo (plan/AC-39: banner stays on POST /resync) — to fix
- Follow-ups: StatusBanner must use states.statusWord.*; TourHeader catch must use header.linkCopyFailed
- Review notes: not_indexed polling baseline = first lastIndexedSha seen (completion between fetch and first poll is missed); no hashchange listener; `t as unknown as TourT` cast
- Deviation: SKILL.md files not opened

## W15 (S38–S41) — done
- Files: server/src/modules/onboarding/{types,repository,routes,narrative-service}.ts; platform/{errors,container}.ts (TooManyRequestsError 429 rate_limited; lazy-closure overlay; onboardingNarrative ??=); test/onboarding-narrative-service.test.ts (T39, 20 tests); test/onboarding-narrative.it.test.ts (T40, 6 cases, NOT RUN — type-checked only)
- Checks: lint, typecheck, arch:check (0 errors, no circular, 7 pre-existing warnings), unit suite 553 tests, reviewer-core typecheck — exit 0
- Behaviour: requestGeneration order limiter → repo → getFacts → single-flight claim (sync, before first await) → write generating → void run; run = exactly one completeStructured with C22 flags inside withTimeout(60_000); row re-read before every write, mismatched generation id → discard; failure writes only `generation` (narrative kept) with provider/model always set (D3); repo_gone stores nothing; every-section-null → invalid_output
- Deviations: store param is NarrativeStore & Pick<TourRepoStore,'getRepo'> (readBlob needs RepoRef); classifyFailure also matches instanceof ConfigError (AppError subclasses all share name 'AppError') and treats "schema validation"/"returned no choices" messages as invalid_output; forTour calls modelFor on every GET (one settings read); null factsSha → outdated true
- Review notes: limiter counts requests sharing an in-flight run and is in-memory; excerpts read sequentially (≤20 × ≤512 KiB, capped to 8 KiB in input); if the failure write itself fails the row stays generating until forTour marks it interrupted; forTour/new-request race has no transaction (both re-read first)
- Unverified: NoEligibleProviderError mapping vs a live OpenRouter call (from W12)
- Deviation: SKILL.md files only partly read

## Main-session fixes after W11
- OnboardingTourView.tsx: StatusBanner Resync now uses useResyncRepoIntel (POST /resync) per D1/A:AC-39; not_cloned Resync stays on useRefreshRepo. OnboardingTourView.test.tsx updated (resyncMutate mock; asserts refresh not called).
- StatusBanner.tsx: status interpolated through states.statusWord.* keys.

## W16 (S43–S44) — done
- Files: client/src/lib/hooks/tour.ts (useGenerateNarrative); OTV/_components/{NarrativeControls,NarrativeStatus}/** (T42); TourHeader (+test: Copy-link failure announces header.linkCopyFailed); OTV/{OnboardingTourView.tsx,.test.tsx (T43),styles.ts,helpers.ts,helpers.test.ts (T44)}; new helpers relativeTime, formatUsd, currentPathsOf
- Checks: tour/ vitest, full client (68 files, 345 tests), typecheck, lint — exit 0. First full client run exited 1 with no recognisable failure; rerun passed; cause not found.
- Deviations: mutation lives in the view; NarrativeControls/NarrativeStatus are presentational (error, onGenerate, onRetry props); Retry shown for every failure reason, plus Open Settings link for missing_key (/settings/api-keys) and no_structured_provider (/settings/models); "Generated" line only when generated_at and source_sha both present; Regenerating note whenever status==="generating"; export appends run-locally notes and critical/reading descriptions, replaces first-task titles, architecture body replaces template summary
- Review notes: 429 message depends on ApiError.status===429 and clears only on a later success/reset; announce fires only on generating→ready|failed transitions (not first load, not on a new generation_id with same status)
- Deviation: SKILL.md files not opened

## plan-verifier — round 1: verified with gaps
- Spec rows (A+B AC/EC/NFR, 216): met 184, partial 24, unmet 0, not-verifiable 8. All 44 steps met. C# 29, T# 44: no unmet. Re-ran every check: all exit 0 (server 553 tests, client 345, reviewer-core 46, mcp-server 26). Verifier fingerprint c883d81e… differs from the supplied 0992e3f4… (state/report files edited after the table; all checks still green).
- Not verifiable (need a human / e2e / timing): A:AC-4 + T31 (e2e flow 06 not run); A:AC-44, A:AC-46, A:NFR-6, B:NFR-6 (manual browser, keyboard/axe, screen reader); A:NFR-1, B:AC-47, B:NFR-1 (latency)
- Lowered to partial only because T22/T40 (*.it.test.ts) never ran: A:AC-5, A:NFR-5, A:NFR-8, B:AC-6, B:AC-40, B:AC-53, B:AC-54, B:AC-86, B:NFR-4, B:NFR-5, C27
- Partial, fixable in code/tests (sent to a fresh implementer): A:NFR-7 (success log lacks per-section item counts + degradation reason), B:NFR-7 (narrative logs lack source_sha; plan C9 also omitted it), B:AC-91 / B:EC-18 / T43 (no test of refetchInterval in hooks/tour.ts), A:AC-72 (1500 ms value not asserted), B:AC-85 (no test of a new request after `interrupted`)
- Partial, not fixed here: B:AC-102 / B:EC-22 (NoEligibleProviderError mapping unverified against a live OpenRouter call); A:AC-54 (no test asserts non-execution; code path read only)
- Unplanned changes accounted for: orchestration docs, ArchitectureSection/mermaid.ts, onboarding.json (W11 grant), ArchitectureSection.test.tsx edit (W11)

## Fix round for verifier partial rows — done
- A:NFR-7: service.ts success log adds sectionCounts (modules, critical_paths, run_locally_commands, reading_path, first_tasks), indexStatus, degradationReason (index reason when not full, else null), availability. 2 new tests in onboarding-service.test.ts.
- B:NFR-7: narrative-service.ts adds source_sha to generated / failed / failure-not-persisted logs and the superseded-discard warn (recordFailure gained sourceSha). Leak assertions unchanged.
- B:AC-91 / T43: client/src/lib/hooks/tour.test.tsx (new) — refetchInterval 1500 while generating, false for ready / no narrative / not loaded. B:EC-18: no new test; existing view test (~:331) already mounts with a generating narrative.
- A:AC-72: client/src/lib/hooks/repo-intel.test.tsx (new) — 1500 ms when poll=true, false otherwise.
- B:AC-85: new narrative-service test — new request accepted after interrupted (alreadyRunning false, new id, ends ready).
- Checks: server lint/typecheck/arch:check/unit, client lint/typecheck/full vitest — exit 0 (client typecheck TS2345 in tour.test.tsx fixed by cast, rerun green)
- Deviation: SKILL.md files not read

## plan-verifier — round 2 (7 rows): verified
- A:NFR-7, B:NFR-7, B:AC-91, B:EC-18, T43, A:AC-72, B:AC-85 all met; fingerprint 7037cdd9… matched; no behaviour change beyond log fields.
- Caveat: no test asserts `source_sha` on every narrative log path (only the generated path is asserted); B:EC-18 covered by existing view test + hook test, no dedicated remount test.

## Review round 1
- architecture-reviewer: approve, 0 findings. Notes: onion-architecture/enforcement.md and the reviewer prompt do not list the new `pure-folders-are-pure` rule (rule count now 11); BlobTooLargeError value import ring 3→4 (F7).
- security-reviewer: 1 WARNING (F1, fixed). Checked and clean: grepAt argv, listTree/readBlob, REMOTE_PIPE_RE, manifest parsing, rewriteLinks, NarrativeMarkdown, prompt framing/grounding, rate limiter, logs, missing_key. Suggestion not applied: checkFlowchart rejects `click`/`%%{` only at line start (mitigated by securityLevel "strict"). Dependency changes for react-markdown/remark-gfm not confirmed in that pass (C19 verifier saw no package.json change).
- /code-review medium: 5 low findings (F2–F6).
- F1 fix: server/src/modules/onboarding/facts/ecosystems.ts (matchSegments memoised on (pattern index, segment index); consecutive `**` collapsed) + regression test in server/test/onboarding-facts-ecosystems.test.ts. Server lint/typecheck/arch:check/unit exit 0.

## Review round 1 — triage outcome
- User chose to apply F4 only. F2, F3, F7 declined by user; F5, F6 disputed (reasons in the ledger).
- F4: reviewer-core/src/llm/openrouter.ts NO_ENDPOINT_RE is now /no endpoints found|\b(?:endpoints?|providers?)\b.*\brequested parameters/i; negative test added in reviewer-core/test/openrouter.test.ts. reviewer-core typecheck/test, server typecheck/unit exit 0 @ 306d3b95…

## Review round 2 — security delta (F1): approve
- F1 fixed: matchSegments memoised on (pattern index, segment index), worst case O(P×S²) with P ≤ ~100 (200-char cap) and consecutive `**` collapsed; traced `packages/*`, `apps/**/web`, `**` — no false negatives; matchSegment is greedy indexOf, no backtracking.
- NO_ENDPOINT_RE: single `.*`, no nested quantifiers; worst case quadratic on a long upstream message, not reportable; NoEligibleProviderError takes the model string, no leak.
- Gaps: reviewer did not re-read the test files line by line and ran no tests.

## Review round 2 — code-review delta (ecosystems.ts, openrouter.ts)
- F8 negated workspace patterns ignored (ecosystems.ts ~109); F9 Go/Spring entry attributed to parent module despite nested go.mod (~322); F10 uvicorn module path may not import for a src/ layout (~252); F11 NO_ENDPOINT_RE still matches "Provider returned error … requested parameters" (openrouter.ts ~118). All suggestions; F8–F10 are pre-existing wave-2 code (the reviewer read the whole files), not regressions of the F1 fix.

## Phase 4 — manual verification (live, main session)
Environment: the existing dev stack was already running (web :3000, API :3001, Postgres :5432), so no restart; the API had hot-reloaded the new code. Read-only calls only: no POST /tour/narrative (no LLM spend), no Export download, no Resync, no clipboard use.
- API: GET /repos/:id/tour → `not_cloned` for acme/payments-api (index failed/no_index, sections empty-ish); `available` for sgdiachenko/gm-vocabulary (201 of 439 files indexed, graph available, 8 critical paths, 1 run-locally group, 3 reading items, 4 first tasks), cold response 0.23 s (A:NFR-1 target ≤2 s; this repo is 439 files, not the 5000-file benchmark). narrative null, estimated_cost present (static price 0.00392, then live-price 0.00117 after the price book loaded — R-B8 behaviour; UI shows ≈ $0.0012).
- Page: sidebar item "Onboarding Tour" between Pull Requests and Project Context, highlighted (A:AC-1/2); header "Onboarding for <repo>", commit 0aff2fc, "201 indexed of 439 files", "Index: full"; Copy link / Export as Markdown / Generate narrative with model + approx. cost; every section labelled "From repository facts"; stack with evidence + Verified/By convention; modules; mermaid facts diagram renders; numbered run-locally commands with sources and Copy buttons; reading path with middle-truncated paths; first tasks with line numbers and Open on GitHub.
- A:AC-76–79 (live): clicking "Critical paths" in "On this page" set #critical-paths, focus moved to the section heading (H2#critical-paths-heading), section top 72 px (clear of the sticky bar), collapse control "Collapse Critical paths" aria-expanded=true.
- A:AC-44 (live): scroll-spy updated aria-current from "Architecture overview" to "How to run locally" after scrolling (delayed in the hidden automation tab).
- F12 FOUND AND FIXED: the nav was not sticky (see ledger). Verified after the fix.
- A:AC-46 (live, via a 900 px same-origin iframe because resize_window did not change the viewport): "Jump to" select with all 5 sections replaces the rail; no horizontal scroll.
- not_cloned (A:AC-37 UI): "This repository is not cloned yet" + Resync button, no sections.
- Artefact, not a bug: the automation tab reports visibilityState "hidden", so Next's streamed Suspense copy (`div#S:0`, display:none, titled with the raw repo id) is never swapped in; DOM probes see every section id twice. Real browsers swap it.
- NOT verified: live narrative generation with a real OpenRouter key (Generating…, polling, live-region announcement, AI-written labels, Outdated chip after resync, AI-diagram fallback, 202 ≤ 300 ms, real structured-output cost); screen-reader announcements and keyboard/axe/contrast (A:NFR-6, B:NFR-6); Export download and Copy link clipboard behaviour; Resync buttons; the NoEligibleProviderError mapping against a live call; the *.it tests and e2e flow 06. Browser console was only attached after load, so load-time console errors were not captured.

## Phase 5 — doc-writer: done
- Updated: server/docs/api-contracts.md, server/README.md (+ sequence diagram, API-map node), server/docs/architecture.md, repo-intel/README.md, server/AGENTS.md, client/specs/pages.md, client/docs/ui-architecture.md, client/README.md (+ route-map node), client/AGENTS.md, reviewer-core/docs/pipeline.md, reviewer-core/README.md, INSIGHTS.md in server/client/reviewer-core; both specs `Status: approved → implemented` and docs/specs/README.md registry rows.
- Open for the user: the specs read `implemented` while the build deviates (D1–D4, accepted earlier) — a spec revision via spec-creator is recommended; onion-architecture/enforcement.md and the architecture-reviewer prompt do not list the new `pure-folders-are-pure` rule (`.claude/**`, not edited); no e2e flow exists for /repos/:repoId/tour (test-writer on request); no test asserts source_sha on every narrative log path.

## Restyle to the mockup (F13, user request) — done
- Files (client only): OnboardingTourView/{OnboardingTourView.tsx,styles.ts}, _components/{TourHeader,NarrativeControls,NarrativeEstimate (new),NarrativeStatus,OnThisPage,TourSection,OpenOnGitHub,ArchitectureSection,CriticalPathsSection,RunLocallySection,CommandRow,ReadingPathSection,FirstTasksSection}; messages/en/onboarding.json (+titlePrefix, +open); components/mermaid-diagram/MermaidDiagram.tsx (optional `bare` prop). ChevronUp imported from the existing lucide-react dependency.
- Applied: two-column layout with the rail beside header+cards; header with accent short repo name, one muted facts line, actions at the right, estimate line under the title row; Card chrome with icon tile + chevron + muted origin pill; inset rows for critical paths; numbered inset command bars with icon copy buttons; reading-path number badges; first-tasks card grid with low/medium chips.
- Not applied: mermaid dark-theme variables (mermaid.initialize is a global singleton shared by other pages); inline code chips in the summary sentence.
- Main-session change on top: toMermaid returns null when there is no edge between known nodes (a column of disconnected boxes) → "No import graph — heuristic structure" fallback; test added.
- Labels kept per spec: "Copy link", "Export as Markdown" (the mockup says "Share link").
- Verified live (existing dev stack): rail sticky + active highlight, header, critical paths, run locally, reading path, first tasks. Not checked live: 900 px width after the restyle, narrative-generated state (needs a key).
- Checks: all 13 CI-form checks exit 0 (server 557, client 352, reviewer-core 47, mcp-server 26); gate.sh check PASS.

## Live narrative run (user approved; OpenRouter key already configured in Settings) — 2026-10-02
- Request: one POST /repos/:id/tour/narrative on sgdiachenko/gm-vocabulary via the UI button. generating → ready in ~40 s. provider openrouter, model deepseek/deepseek-v4-flash, 7352 input / 4192 output tokens, actual cost $0.00039875 (page estimate $0.0012 = upper bound), source_sha = facts sha, outdated false.
- Worked: structured output accepted; grounding held (every item path exists in the facts, none invented); mermaid diagram valid; Outdated/failed states not hit.
- F14: all model text was Chinese (architecture body 199 CJK chars of 743; all critical/reading descriptions Chinese) although the repo has no Chinese text and the system prompt says English only (once, in the intro). Fix: LANGUAGE rule at the top and a closing reminder in server/src/prompts/onboarding.system.md; `LANGUAGE_REMINDER` appended as the last line of the user message (narrative/input.ts); tests added (T33). Not yet re-run live.
- F15: no `first-tasks` block in the model input → no task ids → first_tasks always fell back. Fix: block added in input.ts (`t1 (todo_comment, file, low): src/a.ts`); tests added. Not yet re-run live.
- F16: run_locally also fell back (fallback_sections = [run_locally, first_tasks]); cause unknown. Raw output is not stored (by design, logs carry metadata only). Next step if it persists: one local diagnostic call that writes the raw response to the scratchpad only.
- Server checks after F14/F15: lint, typecheck, arch:check, unit (559 tests) exit 0. Gate report is stale again.

## Second live narrative run (after F14/F15 fixes) — 2026-10-02
- Regenerate on sgdiachenko/gm-vocabulary: ready in ~26 s; deepseek/deepseek-v4-flash via OpenRouter; 7127 input / 2174 output tokens; actual cost $0.00048195; fallback_sections = [] (all five sections AI-written).
- F14 confirmed fixed: 0 CJK characters (architecture body, critical-path and reading-path descriptions are English). F15 confirmed fixed: first_tasks returned 4 grounded tasks. F16 not reproduced: run_locally returned 10 commands with notes ("Install exact dependencies from lockfile."); the first-run cause stays unconfirmed.
- Grounding held: no item path outside the facts. The server-rewritten link `[eslint.config.js](repo:eslint.config.js)` renders as a GitHub link.
- Page (live, screenshot): "AI-written" pill on the section, "Generated just now from commit 0aff2fc · deepseek/deepseek-v4-flash · $0.0005" line, Regenerate button, prose with inline code.
- Cosmetic, not fixed: the AI mermaid diagram (two subgraphs, LR) is scaled down to fit the box width and its labels are tiny; the mockup uses larger nodes.
- Still unverified live: failure paths (missing key, timeout, no structured provider), the 429 message, Outdated chip after a resync, polling/announcement with a screen reader.
