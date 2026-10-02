# Implementation Plan: PR Brief — Why + Risk brief on the Overview tab

## Goal and scope
- **In scope:**
  - A new server module `server/src/modules/brief/` with two routes:
    - `GET /pulls/:id/brief` — reads the stored brief;
    - `POST /pulls/:id/brief` — synchronous generation: single-flight per PR, rate limit 10/min per workspace, exactly one `completeStructured` call, overall request deadline 75 s.
  - The model input is assembled deterministically, with a guaranteed ≤ 8 000 `cl100k_base` tokens: an explicit terminal policy plus a final guard.
  - One blast projection is used identically for the prompt, for storage and for the path allow-list.
  - Cache in the existing `pr_brief` (jsonb + `schema_version`).
  - Contract: a change to `PrBrief`, new `PrBriefRecord` / `ReviewFocusItem` / `BriefMissingInput` in the three copies of `brief.ts`.
  - The OpenAI/Anthropic adapters honor `httpRetries: 0` (Q1).
  - A new method `ContextAttachmentsService.resolveForRepo` with a defined reason priority (REC1).
  - Client:
    - hooks `usePrBrief` / `useGenerateBrief`;
    - new Overview layout: verdict banner → summary → [Intent block with Risk areas **inside** | Blast radius] → Review focus;
    - `IntentCard` gets a `children` slot and an `id="intent"` anchor;
    - navigation from Review focus and from a risk to Files changed via `?tab=diff&file=&line=`;
    - new keys in `client/messages/en/brief.json`.
- **Out of scope:**
  - Everything from the spec's *Non-goals*.
  - E2E flow over a seeded brief — `test-writer`, on demand.
  - Documentation — `doc-writer` after verification.
  - Spec changes: the spec is approved and immutable; questions about wording go to *Risks and open questions*.
  - There are no rejected RECs.

## Requirements decisions
- **Spec:** `2026-10-02-pr-brief` (approved) — `docs/specs/2026-10-02-pr-brief.md`.
- **Q1 (unchanged):** "no HTTP retry" → (a). Adapters honor `httpRetries: 0`: no `withRetry`, per-request `maxRetries: 0`; an unset value behaves as it does now → S3.
- **Q2 (unchanged):** "new-side changed line" → (a). Only added (`+`) lines in contiguous ranges; snap to the first one; no added lines → `line_verified: false` → S6.
- **Q3 (unchanged):** linked issue → (a). The first same-repo reference from `extractReferences`, one `getIssue`, 5 s → S6, S13.
- **Q4 (changed):** layout → **(b)**. `IntentCard` gets a `children` slot. Risk areas render inside the Intent block (the same `<section>` with `id="intent"`, under the intent card, in every IntentCard state). This matches AC-69 → S19, S11.
- **Q5 (unchanged):** specs → (a)+(i). Agents by `created_at, id`; skills `enabled && safe` → S4.
- **Specs reason priority (new, AC-41/AC-42):** `not_cloned` > `no_catalog` > `none_attached`; `unavailable` — for an error / timeout at any stage. Reason: without a clone or a catalog a document cannot be attached, so the root cause is shown → S4.
- **Fixed caps vs budget:** fixed caps (AC-27/28/29, title ≤ 300 characters, blast summary ≤ 1 000 characters) do not write `over_budget`. `over_budget` is written only on budget reduction (AC-25/26), including the terminal steps.
- **Terminal budget policy (new):** after the 5 steps of AC-25 (specs → linked issue → description → blast callers → diff-stat) there are two more:
  - (6) trimming the blast changed symbols list from the end (summary stays);
  - (7) shortening the intent text to a fixed ceiling `INTENT_FLOOR_TOKENS = 1000` (scope items from the end first, then sentences with "…").

  Title and intent are never removed, intent is only shortened. Then the final guard: if the input is still > 8 000 — the LLM is not called, the response is 500 `details.reason = input_over_budget`. A test proves that with the fixed caps the guard is unreachable → S7, S13.
- **Line < 1 (new):** the output schema stays strict-safe (`z.number().int()`). Normalization happens on the server:
  - ranges exist → snap;
  - no patch / added lines → `line = 1`, `line_verified: false`.

  Before saving, `StoredBrief.safeParse`; failure → `invalid_output` → S6, S13.
- **Blast projection (new):** `projectBlast()` returns a `BlastRadius` with a summary (≤ 1 000 characters), `changed_symbols` (name, file, kind) and `downstream[].callers` of only the sent callers. `endpoints_affected` / `crons_affected` equal `[]`, because they are not sent. This one object — after budget reduction — is rendered into the prompt, stored as `blast` (AC-60) and yields the allow-list (`changed_symbols.file ∪ callers.file`, AC-49) → S6, S7, S13.
- **Request deadline (new):** `REQUEST_DEADLINE_MS = 75 000` for the whole `run`. LLM timeout = `min(60 s, remainder)`. Exceeding it → 502 `llm_timeout`, and the `abandoned` flag forbids any write after the deadline (AC-48) → S13.
- **Accepted RECs:**

  | REC | What | Steps |
  |---|---|---|
  | REC1 | `resolveForRepo` | S4, S13 |
  | REC2 | narrow ports | S13, S14 |
  | REC3 | rate limit in the service | S13 |
  | REC4 | pure range parser | S6 |
  | REC5 | strict-safe schema | S7 |
  | REC6 | URL target and `push` | S15, S18 |
  | REC7 | diff-viewer without namespace | S16, S17 |
  | REC8 | i18n in W1 | S2 |

## Execution mode
multi-agent — two packages plus a contract copy in mcp-server, independent slices, one small shared contract. W3 does not depend on the contract, so it sits in wave 1.

## Work packages
| WP | Steps | owns | depends-on | wave |
|---|---|---|---|---|
| W1 — contracts + i18n | S1, S2 | `server/src/vendor/shared/contracts/brief.ts`, `client/src/vendor/shared/contracts/brief.ts`, `mcp-server/src/vendor/shared/contracts/brief.ts`, `client/messages/en/brief.json`, `server/test/brief-contracts.test.ts` | — | 1 |
| W3 — LLM adapters + attachments | S3, S4 | `server/src/adapters/llm/openai.ts`, `server/src/adapters/llm/anthropic.ts`, `server/test/llm-http-retries.test.ts`, `server/src/modules/context-attachments/service.ts`, `server/src/modules/context-attachments/types.ts`, `server/src/modules/agents/repository.ts`, `server/test/context-attachments-service.test.ts` | — | 1 |
| W2 — brief: pure logic | S5, S6, S7 | `server/src/modules/brief/constants.ts`, `server/src/modules/brief/helpers.ts`, `server/src/modules/brief/prompt.ts`, `server/test/brief-helpers.test.ts`, `server/test/brief-prompt.test.ts` | W1 | 2 |
| W5 — client: data + Overview + IntentCard | S8, S9, S10, S19, S11 | `client/src/lib/hooks/brief.ts`, `client/src/lib/hooks/index.ts`, `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/**`, `client/src/app/repos/[repoId]/pulls/[number]/_components/IntentCard/**` | W1 | 2 |
| W4 — brief: I/O, service, routes, DI | S12, S13, S14 | `server/src/modules/brief/repository.ts`, `server/src/modules/brief/service.ts`, `server/src/modules/brief/routes.ts`, `server/src/modules/index.ts`, `server/src/platform/container.ts`, `server/test/brief-service.test.ts`, `server/test/brief.it.test.ts` | W1, W2, W3 | 3 |
| W6 — client: navigation + props finalization | S15, S16, S17, S18 | `client/src/app/repos/[repoId]/pulls/[number]/page.tsx`, `client/src/app/repos/[repoId]/pulls/[number]/file-target.ts`, `client/src/app/repos/[repoId]/pulls/[number]/file-target.test.ts`, `client/src/app/repos/[repoId]/pulls/[number]/use-pr-file-navigation.ts`, `client/src/app/repos/[repoId]/pulls/[number]/use-pr-file-navigation.test.ts`, `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/**`, `client/src/components/diff-viewer/**`, `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/OverviewTab.tsx` (S18 only: props become required) | W1, W5 | 3 |

- **Overlap check.**
  - Wave 1: W1 and W3 — no shared paths.
  - Wave 2: W2 and W5 — no shared paths.
  - Wave 3: W4 and W6 — no shared paths.
  - `OverviewTab/OverviewTab.tsx` belongs to W5 (wave 2) and W6 (wave 3). These packages never run at the same time; W6 starts only after W5 finishes.
  - `container.ts` and `modules/index.ts` belong only to W4; `brief.json` — only to W1.
- **Dependency check.** Every `depends-on` is from an earlier wave: W2←W1; W5←W1; W4←W1, W2, W3; W6←W1, W5.

DAG:
```
wave 1:  W1 ──┬──────────────► W2 ──┐
              │                     ├──► W4 ──► [gate: brief.it.test.ts, main session]
         W3 ──┼─────────────────────┘
              └──────────────► W5 ──────► W6
                                   (wave 2)  (wave 3)
```

## Context
The spec requires one bounded model call over already computed facts, without hunk code, with response validation and a cache keyed by SHA. INSIGHTS that influenced the plan:
- `server/INSIGHTS.md:47` — a service with in-memory state must be memoized in the container → C3.
- `server/INSIGHTS.md:49,53,55`:
  - `no-sideways-module-imports` catches `import type` from `service|routes|repository` too;
  - helpers and classify are allowed;
  - ports are declared in the consumer.
- `server/INSIGHTS.md:57` — GitHub only through the lazy `() => this.github()`.
- `server/INSIGHTS.md:59` — `test/**` is not covered by `typecheck`; new tests must be run, fakes of changed ports must be updated.
- `server/INSIGHTS.md:61` — deciding "the write is dead" from a single read plus an in-memory flag is unreliable. Therefore the `abandoned` flag is checked immediately before `replace`.
- `server/INSIGHTS.md:23` — cost `null` ≠ `0` → AC-77.
- `client/INSIGHTS.md:41` — a new `useTranslations` in a widely mounted tree breaks test providers → C17. Overview / IntentCard tests need the namespaces `brief` and `prReview`.
- `client/INSIGHTS.md:39` — no angle brackets in messages → C14.
- `client/INSIGHTS.md:45` — DOM measurement via a callback ref; `page.tsx` has no tests, so the logic is extracted into a hook.
- `client/INSIGHTS.md:47` — tests via `fireEvent`.
- `client/INSIGHTS.md:27` — `messages/*.json` from tests is one `../` deeper.
- `client/INSIGHTS.md:61` — sticky / scroll is not visible in jsdom → manual verification.

## Affected modules
| Package | Lanes (routing.md) | Package manager | Checks |
|---|---|---|---|
| `server/` | 2, 4, 5, 6, 8, 13, 14, 17–20 | pnpm | `pnpm -C server lint` · `pnpm -C server typecheck` · `pnpm -C server arch:check` · `pnpm -C server exec vitest run --exclude '**/*.it.test.ts'`; gate: `pnpm -C server exec vitest run .it.test` (main session) |
| `client/` | 2, 9, 10, 11, 12, 13 | pnpm | `pnpm -C client lint` · `pnpm -C client typecheck` · `pnpm -C client test` |
| `mcp-server/` | 21 (byte copy of `brief.ts`) | pnpm | `pnpm -C mcp-server typecheck` · `pnpm -C mcp-server test` |
| shared | 2 | — | `./scripts/check-shared-sync.sh` |

## Constraints
- **C1** — Contract fields are `snake_case`; a Zod constant and a type share one PascalCase name; enums are `lower_snake_case`; the three copies of `brief.ts` are byte-for-byte identical (`./scripts/check-shared-sync.sh`). — root `AGENTS.md`
- **C2** — `service.ts` accepts only ports declared in itself; never `Container`. No `drizzle-orm` / `db/*` / `adapters/**` and no `service|routes|repository` of other modules. Allowed: `../intent/helpers.js`, `../smart-diff/classify.js`, `../context-attachments/types.js`, `@devdigest/reviewer-core`, `platform/errors|resilience`. — onion-architecture; `server/INSIGHTS.md:49,55`
- **C3** — `briefService()` is memoized (`??=`); `new` of concrete classes only in `container.ts`. — onion-architecture; `server/INSIGHTS.md:47`
- **C4** — Thin route: Zod `params` / `response`, one service call; invalid id → `422`. — fastify-best-practices; `server/AGENTS.md`
- **C5** — Errors only through `AppError` subclasses with `details.reason`:

  | Class | Status | `details` |
  |---|---|---|
  | `NotFoundError` | 404 | — |
  | `TooManyRequestsError` | 429 | — |
  | `ConflictError` | 409 | `{ reason: 'no_diff_data' }` or `{ reason: 'missing_key', provider }` |
  | `ExternalServiceError` | 502 | `{ reason: 'llm_timeout' \| 'llm_error' \| 'invalid_output' }` |
  | `AppError('input_over_budget', …, 500, …)` | 500 | `{ reason: 'input_over_budget' }` (guard; unreachable under the caps) |

  Messages contain no PR or model text. — `server/src/platform/errors.ts:7-53`
- **C6** — Logs contain metadata only: outcome, reason, provider, model, tokens, cost, estimate, budget, trimmed / missing sections, counts of dropped items, `durationMs`. Never the prompt, description, issue, spec or model output. — AC-106, AC-107
- **C7** — All untrusted text goes only into the user message and only through `wrapUntrusted` (`reviewer-core/src/prompt.ts:48`); the system prompt is static. — AC-30
- **C8** — `BriefModelOutput`: no `.optional()`, `kind: z.string()`, `line: z.number().int()`. Normalization, truncation, dedup and coercion happen after parsing, on the server. — zod; REC5; `server/src/adapters/llm/openai.ts:103-104`
- **C9** — Ranges are computed by a pure function in `brief/helpers.ts`; no import of `adapters/git/diff-parser.ts`. — REC4
- **C10** — GitHub, LLM and model — via closures from the container; no `process.env`. — `server/AGENTS.md`; `server/INSIGHTS.md:57`
- **C11** — No migrations and no `db:generate`. `pr_brief.json` with `schema_version: 1`; one upsert only after success. The document passes `StoredBrief.safeParse` before being written. — NFR-8
- **C12** — Client data only through `src/lib/hooks/*` → `src/lib/api.ts`. — `client/AGENTS.md`
- **C13** — One component per file in `_components/<Name>/`, ≤ 200 lines, ≤ 7 props, logic in `helpers.ts`, no `useEffect` for derived state. — react-best-practices; frontend-architecture
- **C14** — All new strings come from `brief.json` under new keys; existing ones are not changed; no `<…>`. — AC-104; `client/INSIGHTS.md:39`
- **C15** — Model text only as JSX text: no `dangerouslySetInnerHTML` and no `react-markdown`. — AC-80
- **C16** — Client tests: `fireEvent`, mocked `fetch`, a provider with all namespaces (`brief`, `prReview`, `shell`). — `client/INSIGHTS.md:41,47`
- **C17** — `client/src/components/diff-viewer/**` without a new `useTranslations`; the target strings are passed as props. — REC7
- **C18** — DOM measurement / scroll — a callback ref in `useState`; offset from `headerHeight`. — `client/INSIGHTS.md:45`
- **C19** — DB tests are named `*.it.test.ts`. The implementer writes them but does not run them; the main session runs them as a gate before `plan-verifier`. — `server/AGENTS.md`
- **C20** — No new dependencies and no lockfile changes. — root `AGENTS.md`
- **C21** — Without `httpRetries` the adapters behave as before. — Q1
- **C22** — The API is additive only; `tab` / `trace` unchanged; `file` / `line` optional. — NFR-8
- **C23** — The `children` slot in `IntentCard` is optional; without it the render is identical to the current one (other places, if any appear, are not affected). — react-best-practices (composition)

## Steps

### S1 — Contract `brief.ts` in three copies
- package: W1
- files:
  - modify `server/src/vendor/shared/contracts/brief.ts`:
    - `ReviewFocusItem` `{ file: string, line: z.number().int().min(1), reason: string, line_verified: boolean }`;
    - `BriefMissingInputName` (`intent | blast | linked_issue | description | specs | diff_stats`);
    - `BriefMissingReason` (16 values per the spec *Contracts*);
    - `BriefMissingInput` `{ input, reason }`;
    - `BriefSpecUsed` `{ path, est_tokens: int }`;
    - `PrBrief`: `summary`, `review_focus`, `intent: Intent.nullable()`, `blast: BlastRadius.nullable()`, `risks: Risks`, `history: PrHistory.nullable()`;
    - `PrBriefRecord = PrBrief.extend({ pr_id, head_sha, stale, generated_at, provider, model, tokens_in: int|null, tokens_out: int|null, cost_usd: number|null, input_tokens_est: int, missing_inputs, specs_sha: string|null, specs_used })`;
    - update the block comment.
  - modify `client/src/vendor/shared/contracts/brief.ts`, `mcp-server/src/vendor/shared/contracts/brief.ts` — byte copy.
  - create `server/test/brief-contracts.test.ts`:
    - accepts a valid record;
    - rejects `line: 0`, `line: -1`, an unknown `reason`, a missing `summary`;
    - accepts `intent` / `blast` / `history: null`.
- skills: zod (lane 2); typescript-expert (lane 13); response-schema (lane 18)
- constraints: C1, C22
- covers: NFR-8, AC-1, AC-13, AC-44 (shape)
- reuse: `server/src/vendor/shared/contracts/brief.ts:9-14,73-78,116-135`; barrel `server/src/vendor/shared/index.ts:21` unchanged
- done-when: `./scripts/check-shared-sync.sh` exit 0; `typecheck` server / client / mcp-server green; T1 green.
- depends-on: —

### S2 — New PR Brief i18n keys
- package: W1
- files: modify `client/messages/en/brief.json` — the `card` object (do not touch existing keys):
  - `title`, `aiLabel`, `empty.title`, `empty.body`, `modelHint` "Model: {model}";
  - `generate`, `regenerate`, `generating`;
  - `provenance` "Generated {when} for commit {sha} · {model} · {cost}", `costNotReported`, `outdated`;
  - `riskAreas`, `noRisks`, `severity.{high,medium,low}`, `expandRisk`, `collapseRisk`;
  - `reviewFocus.title` "Review focus — read these first", `reviewFocus.empty`;
  - `notInDiff`, `fileNotInDiff`, `lineNotInDiff` "Line {line} isn't part of this diff";
  - `missing.title`, `missing.input.{6}`, `missing.reason.{16}`, `missing.fix.intent`, `missing.fix.specs`;
  - `error.llm_timeout`, `error.llm_error`, `error.invalid_output`, `error.no_diff_data`, `error.input_over_budget`, `error.generic`, `error.missingKey` "Add an API key for {provider} in Settings", `error.apiKeysLink`, `error.modelsLink`, `error.rateLimited`, `error.loadFailed`, `retry`;
  - `status.generating`, `status.generated`, `status.failed`.

  Texts — verbatim from the spec (AC-61, AC-64, AC-71, AC-73, AC-74, AC-76, AC-77, AC-83, AC-84, AC-86, AC-94, AC-95, AC-96).
- skills: next-best-practices (lane 9 / 11); frontend-architecture (lane 11)
- constraints: C14
- covers: AC-104, NFR-9
- reuse: `client/messages/en/brief.json:1-48`
- done-when: JSON is valid; `pnpm -C client typecheck` + `test` green; `git diff` — only added lines; no `<`.
- depends-on: —

### S3 — LLM adapters honor `httpRetries: 0`
- package: W3
- files:
  - modify `server/src/adapters/llm/openai.ts`. If `req.httpRetries === 0`:
    - do not wrap in `withRetry`;
    - pass `{ maxRetries: 0 }` as request options to `chat.completions.create`.

    `> 0` → pass as `maxRetries`; unset — unchanged.
  - modify `server/src/adapters/llm/anthropic.ts` — the same for `messages.create`.
  - create `server/test/llm-http-retries.test.ts` — a fake SDK client (`provider['client']`) that throws 429 / 5xx:
    - with `httpRetries: 0, maxRetries: 0` exactly 1 call and options with `maxRetries: 0`;
    - without `httpRetries` the `withRetry` behavior is preserved.
- skills: onion-architecture (lane 8); typescript-expert (lane 13)
- constraints: C21, C20
- covers: AC-9, EC-7, NFR-2
- reuse: `server/src/vendor/shared/adapters.ts:50-55`; `reviewer-core/src/llm/openrouter.ts:107`
- done-when: T2 green; server `typecheck` and the unit suite green.
- depends-on: —

### S4 — `ContextAttachmentsService.resolveForRepo` with reason priority
- package: W3
- files:
  - modify `server/src/modules/agents/repository.ts` — `listEnabledIdsOrdered(workspaceId): Promise<{ id: string }[]>`: `enabled = true`, `ORDER BY created_at, id`. Do not touch `listEnabled`.
  - modify `server/src/modules/context-attachments/types.ts`:
    - `AgentContextStore.listEnabledIdsOrdered`;
    - a new port `ProjectContextForRepo { resolveForRepo(workspaceId, repoId, logger?): Promise<RepoContextResult> }`;
    - `RepoContextResult = { kind: 'none' } | { kind: 'unavailable'; reason: 'no_clone' | 'no_catalog' | 'timeout' | 'error' } | { kind: 'resolved'; sha; docs: { path; text; estTokens: number | null }[] }`.

    `ProjectContextForRun` does not change.
  - modify `server/src/modules/context-attachments/service.ts` — `resolveForRepo`, all under `withTimeout(RESOLVE_TIMEOUT_MS)`, errors → `unavailable` (`timeout` / `error`):
    1. Candidates: agents in the order of `listEnabledIdsOrdered`; for each, its own documents of this repo (`listContextDocs`), then the documents of linked skills from `linkedForAgentWithState` (`enabled && safe`, by `order`); dedup by first position.
    2. **Priority:** `catalog.resolveDocs(ws, repoId, paths)` is called **always**, even with empty `paths`. It checks the clone and the catalog first (`server/src/modules/project-context/service.ts:143-146`) and throws `ContextUnavailableError('no_clone' | 'no_catalog')` → `unavailable` with that reason. Hence `not_cloned` > `no_catalog` > `none_attached`.
    3. Only if the repo state is fine and there are 0 candidates → `{ kind: 'none' }`.
    4. Otherwise `resolved` with the readable documents (`isReadable`), without a budget, `sha = resolved.sha`.

    Class: `implements ProjectContextForRun, ProjectContextForRepo`.
  - modify `server/test/context-attachments-service.test.ts`:
    - the fake gets `listEnabledIdsOrdered`;
    - cases: agent order, own→skills, dedup, a disabled / unsafe skill excluded;
    - **no catalog + no attachments → `no_catalog`**;
    - **no clone + no attachments → `no_clone`**;
    - catalog exists + no attachments → `none`;
    - timeout → `timeout`.
- skills: onion-architecture (lane 5 / 6); drizzle-orm-patterns — `orderBy(asc(createdAt), asc(id))` (lane 6)
- constraints: C2, C19
- covers: AC-38, AC-39, AC-41, AC-42
- reuse: `server/src/modules/context-attachments/helpers.ts:22`; `server/src/modules/context-attachments/service.ts:205-283`; `server/src/modules/project-context/service.ts:142-157`; `server/src/modules/skills/repository.ts:231-243`
- done-when: T3 green; `arch:check`, `typecheck`, unit suite green; `test/run-executor-project-context.test.ts` unchanged and green.
- depends-on: —

### S5 — Brief module constants
- package: W2
- files: create `server/src/modules/brief/constants.ts`:
  - input budget and limits: `INPUT_BUDGET_TOKENS = 8000`, `MAX_TITLE_CHARS = 300`, `MAX_DESCRIPTION_CHARS = 4000`, `MAX_ISSUE_CHARS = 2000`, `MAX_DIFF_STAT_ENTRIES = 300`, `MAX_BLAST_SUMMARY_CHARS = 1000`, `INTENT_FLOOR_TOKENS = 1000`, `MAX_SYSTEM_PROMPT_TOKENS = 1000`;
  - timeouts: `BLAST_TIMEOUT_MS = 10_000`, `ISSUE_TIMEOUT_MS = 5_000`, `SPECS_TIMEOUT_MS = 5_000`, `LLM_TIMEOUT_MS = 60_000`, `REQUEST_DEADLINE_MS = 75_000`;
  - model call: `MAX_OUTPUT_TOKENS = 2000`, `TEMPERATURE = 0.2`;
  - output limits: `MAX_RISKS = 6`, `MAX_REFS_PER_RISK = 3`, `MAX_FOCUS_ITEMS = 8`, `MAX_SUMMARY_CHARS = 600`, `MAX_RISK_TITLE_CHARS = 80`, `MAX_EXPLANATION_CHARS = 600`, `MAX_REASON_CHARS = 160`;
  - `RISK_KINDS`, `RATE_LIMIT = { max: 10, windowMs: 60_000 }`, `STORED_SCHEMA_VERSION = 1`;
  - `REDUCE_ORDER = ['specs','linked_issue','description','blast_callers','diff_stats','blast_symbols','intent_text'] as const` (the first five — AC-25, the last two — terminal policy);
  - `SCHEMA_NAME = 'PrBriefOutput'`.
- skills: onion-architecture (lane 5)
- constraints: C2
- covers: NFR-1 (deadline), NFR-3
- reuse: `server/src/modules/intent/constants.ts:60`; `server/src/modules/onboarding/narrative-service.ts:196-206`
- done-when: `pnpm -C server typecheck` passes.
- depends-on: S1

### S6 — Pure helpers: ranges, blast projection, validation, stored document, classification
- package: W2
- files:
  - create `server/src/modules/brief/helpers.ts`:
    - `addedLineRanges(patch: string | null)` — only `+` lines; per-file patch without `diff --git`; `null` / binary / deletions only → `[]` (Q2).
    - `pickLinkedIssueNumber(pull, repo)` — the first same-repo number from `extractReferences` (Q3).
    - `projectBlast(response: BlastRadiusResponse): BlastRadius`:
      - summary truncated to `MAX_BLAST_SUMMARY_CHARS`;
      - `changed_symbols` (name, file, kind);
      - `downstream[]` — `{ symbol, callers: [{ name, file, line, endpoints_affected: [], crons_affected: [] }], endpoints_affected: [], crons_affected: [] }`.

      This is the single blast type that the prompt, storage and the allow-list work with.
    - `blastPathsOf(projection)` — `changed_symbols.file ∪ downstream[].callers[].file`.
    - `blastMissingReason(...)`, `specsMissingReason(...)` — mapping: `no_clone` → `not_cloned`, `no_catalog` → `no_catalog`, `timeout` / `error` → `unavailable`, `none` → `none_attached`.
    - `validateBriefOutput(output, ctx)`, where `ctx = { prPaths, blastPaths, rangesByPath }`, returns `{ summary, risks, review_focus, dropped }`. Rules:
      - the path part of `file_ref` must be in `prPaths ∪ blastPaths`, otherwise the ref is removed;
      - a risk without refs is dropped;
      - an unknown `kind` → `other`;
      - severity sort preserving the model's order, cap 6;
      - cap of 3 refs per risk;
      - a focus item with a file outside `prPaths` is dropped;
      - the file has ranges: a line outside them (including `line < 1`) snaps to `ranges[0].start`, `line_verified: true`;
      - the file has no ranges: `line ≥ 1` stays, `line < 1` → `1`; `line_verified: false`;
      - dedup `file:line`, cap 8;
      - truncation with "…": 600 / 80 / 600 / 160;
      - an empty result is still returned with the summary.
    - `StoredBrief = PrBriefRecord.omit({ pr_id, stale }).extend({ schema_version: z.literal(1) })`, `parseStoredBrief(json): StoredBrief | null`.
    - `toBriefRecord(prId, stored, currentHeadSha)`.
    - `classifyBriefFailure(err)` — timeout names → `llm_timeout`; `ZodError` / `SyntaxError` / `InvalidBriefOutputError` or `/schema|no choices|empty (response|output)/i` → `invalid_output`; otherwise → `llm_error`.
    - `InvalidBriefOutputError`, `BriefInputOverBudgetError`.
  - create `server/test/brief-helpers.test.ts`:
    - all the rules above;
    - EC-8, EC-9, EC-10, EC-19, EC-20, EC-21, EC-22;
    - **focus `line: 0` and `line: -5` for a file without a patch → `line: 1, line_verified: false`, and the result passes `StoredBrief`**;
    - `line: 0` for a file with a patch → snap;
    - **projection: `endpoints_affected` / `crons_affected` empty, summary truncated; `blastPathsOf` does not contain paths that are not in the projection**.
- skills: onion-architecture (lane 5); zod (lane 2); typescript-expert (lane 13)
- constraints: C2, C8, C9, C11
- covers: AC-5 (`stale`), AC-6, AC-21, AC-23 (projection), AC-33, AC-34, AC-36, AC-41, AC-42, AC-45, AC-46, AC-47, AC-49, AC-50, AC-51, AC-52, AC-53, AC-54, AC-55, AC-56, AC-57, AC-58, AC-59, AC-60 (shape of `blast`), EC-8, EC-9, EC-10, EC-19, EC-20, EC-21, EC-22, NFR-5
- reuse: `server/src/modules/intent/helpers.ts:144`; `server/src/modules/onboarding/narrative-service.ts:65-76` (template); `server/src/vendor/shared/contracts/brief.ts:46-100`
- done-when: T4 green; `arch:check` 0 errors.
- depends-on: S5

### S7 — Prompt: output schema, system message, input assembly with a guaranteed budget
- package: W2
- files:
  - create `server/src/modules/brief/prompt.ts`:
    - `BriefModelOutput` (strict-safe, no optional; `kind: z.string()`; `line: z.number().int()`).
    - `buildBriefSystemPrompt()` — static, ≤ `MAX_SYSTEM_PROMPT_TOKENS`.
    - `buildBriefInput(facts, deps)`:
      - facts: `{ title, description, linkedIssue | null, intent: { value: Intent; stale } | null, blast: BlastRadius (already projectBlast) | null, files: { path, additions, deletions, role, ranges }[], filesCountReported, specs: { path, text }[] }`;
      - deps: `{ count, wrap }`;
      - returns `{ system, user, estTokens, missing, sentIntent: Intent | null, sentBlast: BlastRadius | null, specsUsed, budget }`.

      Sections — only title+description, linked issue, intent, blast (summary, changed_symbols name+file, callers name+file+line — rendered **from the same projection**), diff stats (path, +, −, role, ranges), specs; each through `wrap`.

      Fixed caps (no `missing`): title 300 characters, description 4 000, issue 2 000, diff-stat 300 + "+N more files".

      Budget: `count(system) + count(user)`. While > 8 000 — the `REDUCE_ORDER` steps:
      1. specs — whole documents from the end;
      2. linked issue — remove;
      3. description — remove;
      4. blast callers — from the end;
      5. diff-stat — from the end, with an updated "+N more files";
      6. blast changed symbols — from the end (summary stays);
      7. intent — scope items from the end first, then sentences with "…", down to the ceiling `INTENT_FLOOR_TOKENS`; intent is never removed.

      Title is never shortened below the fixed cap. Every trimmed section → `missing { reason: 'over_budget' }`: `blast_callers` / `blast_symbols` → input `blast`, `intent_text` → `intent`.

      **Final guard:** if after step 7 > 8 000 → `throw new BriefInputOverBudgetError(estTokens)`.

      Specs: a document that does not fit in the remainder is skipped entirely, the next one is tried (AC-40). `specsUsed` = path + `count(wrapped)`.

      Empty description → `description/empty`; no issue link → no section and no `missing`. `sentBlast` / `sentIntent` — the values **after** trimming, exactly those that landed in `user`.
  - create `server/test/brief-prompt.test.ts`:
    - only the allowed sections; zero lines of hunk content;
    - untrusted text only in user and in a wrapper with an escaped `</untrusted>`;
    - caps + "+N more files";
    - reduction order and `over_budget` on a fake counter;
    - title and intent are never removed;
    - skipping a whole spec document; `specsUsed`;
    - ≤ 8 000 on `TiktokenTokenizer` for a large PR (EC-17);
    - **terminal case:** intent of 20 000 characters, 2 000 changed symbols, 300 diff-stat, empty specs → result ≤ 8 000, `missing` contains `blast/over_budget` and `intent/over_budget`, intent is present and shortened;
    - **worst case with the fixed caps on a real tokenizer** (maximum title 300, summary 1 000, intent at the ceiling, everything else trimmed) ≤ 8 000 — the guard is unreachable;
    - **guard:** a fake `count` that always returns 9 000 → `BriefInputOverBudgetError`;
    - `buildBriefSystemPrompt()` ≤ 1 000 tokens;
    - **projection:** a caller trimmed at step 4 is absent from both `user` and `sentBlast`, so `blastPathsOf(sentBlast)` does not contain it;
    - EC-26.
- skills: onion-architecture (lane 5); zod (lane 2); security (lane 14)
- constraints: C7, C8, C2
- covers: AC-20, AC-21, AC-22, AC-23, AC-24, AC-25, AC-26, AC-27, AC-28, AC-29, AC-30, AC-36, AC-37, AC-40, AC-44, AC-49 (source of blast paths), AC-60, EC-17, EC-26, NFR-3, NFR-5
- reuse: `reviewer-core/src/prompt.ts:48`; `server/src/adapters/tokenizer/index.ts:33`; `server/src/modules/intent/prompt.ts`; `server/src/modules/onboarding/narrative/input.ts`
- done-when: T5 green; `arch:check` and `typecheck` pass.
- depends-on: S6

### S8 — Hooks `usePrBrief` / `useGenerateBrief`
- package: W5
- files:
  - create `client/src/lib/hooks/brief.ts`:
    - `usePrBrief(prId)` — `useQuery(["pr-brief", prId])`, `enabled: !!prId`;
    - `useGenerateBrief(prId)` — `useMutation(POST)`, `onSuccess` → `setQueryData`; on error the cache is unchanged, no toast;
    - `briefErrorOf(err)` → `reason` (including `input_over_budget`) | `missing_key` + `provider` | `rate_limited` (429) | `other` (generic).
  - modify `client/src/lib/hooks/index.ts` — `export * from "./brief";`.
- skills: frontend-architecture (lane 11); react-best-practices (lane 11)
- constraints: C12
- covers: AC-63, AC-66, AC-67, AC-81
- reuse: `client/src/lib/hooks/intent.ts:13-36`; `client/src/lib/api.ts:8-62`
- done-when: `pnpm -C client typecheck`; covered by T6.
- depends-on: S1

### S9 — Pure helpers of the Overview brief
- package: W5
- files:
  - create `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/helpers.ts`:
    - `middleTruncate`, `shortSha`, `formatBriefCost`, `relativeTime`;
    - `riskModelLabel(settings)`;
    - `latestReview(reviews)`;
    - `missingFixHref(input, repoId)` — intent → `"#intent"` (anchor from S19); specs → `/repos/:repoId/context`;
    - `parseFileRef`, `SEVERITY_META`.
  - create `.../OverviewTab/helpers.test.ts` — every function, EC-31, `parseFileRef` for three forms, `missingFixHref('intent') === '#intent'`.
- skills: frontend-architecture (lane 9 / 10); react-testing-library (lane 12)
- constraints: C13, C16
- covers: AC-77, AC-78, AC-102, AC-105, AC-108, EC-28, EC-31
- reuse: `client/src/lib/feature-models.ts:13-40`; `client/src/lib/hooks/core.ts:21`; `client/INSIGHTS.md:19`
- done-when: T7 green.
- depends-on: S1

### S10 — Brief block components
- package: W5
- files: create under `.../OverviewTab/_components/`, each `<Name>/<Name>.tsx` + `index.ts`:
  - `BriefHeader`:
    - no brief: "No brief yet" + explanation + "Generate brief" + model;
    - brief exists: "Regenerate", provenance, "Outdated …";
    - pending: disabled "Generating…";
    - inline errors + Retry; `missing_key` with links `/settings/api-keys`, `/settings/models`; 429 — button enabled; `input_over_budget` / `other` — generic + Retry;
    - `role="status" aria-live="polite"`; targets ≥ 24×24.
  - `BriefSummary` — AI label + text.
  - `BriefMissingInputs` — "Generated without:" + reason + fix link AC-105: intent → `<a href="#intent">`, specs → Project Context.
  - `RiskAreas` + `RiskItem` — icon + textual severity + title + refs; `aria-expanded` → explanation; empty text.
  - `BriefFileRef` — middle truncation, `title` / `aria-label` with the full path; an `onOpenFile` button or text + "not in this PR's diff".
  - `ReviewFocus` — heading, numbered `file:line — reason`, buttons; empty text.
  - `BriefSkeleton`.

  Tests: `RiskAreas.test.tsx`, `ReviewFocus.test.tsx`, `BriefHeader.test.tsx`, `BriefMissingInputs.test.tsx` (the intent link has `href="#intent"`, specs — `/repos/r1/context`).
- skills: react-best-practices (lane 10); frontend-architecture (lane 10); react-testing-library (lane 12)
- constraints: C13, C14, C15, C16
- covers: AC-61, AC-62, AC-64, AC-65, AC-68, AC-70, AC-71, AC-72, AC-73, AC-74, AC-75, AC-76, AC-77, AC-78, AC-79, AC-80, AC-82, AC-83, AC-84, AC-85, AC-96, AC-100, AC-101 (`onOpenFile` call), AC-105, AC-108, EC-22, EC-27, NFR-6
- reuse: `@devdigest/ui`; `.../IntentCard/IntentCard.tsx`; `.../BlastRadiusCard/BlastRadiusCard.test.tsx`
- done-when: T8 green; every component ≤ 200 lines.
- depends-on: S8, S9, S2

### S19 — `IntentCard`: `children` slot and `id="intent"` anchor (new, Q4 b)
- package: W5
- files:
  - modify `client/src/app/repos/[repoId]/pulls/[number]/_components/IntentCard/IntentCard.tsx`:
    - signature `IntentCard({ prId, children }: { prId; children?: React.ReactNode })`;
    - every render branch (loading, error, empty, derived) returns `<section id="intent" tabIndex={-1} aria-labelledby=…>` with the existing card and **`{children}` after it**, so that Risk areas are in the Intent block in all intent states;
    - without `children` the output is identical to the current one, except for the `id` attribute.
  - modify `.../IntentCard/styles.ts` — spacing between the card and the slot.
  - create `.../IntentCard/IntentCard.test.tsx` (mocked `fetch`, `brief` provider):
    - in the empty and derived states `children` renders inside `section#intent`;
    - without `children` nothing extra;
    - an element with `id="intent"` exists in every state.
- skills: react-best-practices — composition via `children` (lane 10); react-testing-library (lane 12); frontend-architecture (lane 10)
- constraints: C13, C16, C23
- covers: AC-69, AC-105 (anchor target)
- reuse: `client/src/app/repos/[repoId]/pulls/[number]/_components/IntentCard/IntentCard.tsx:14-155`; `client/src/lib/hooks/intent.ts:13-19`
- done-when: T14 green; `pnpm -C client test` for `BlastRadiusCard` and others unchanged and green.
- depends-on: S2

### S11 — `OverviewTab` composition and layout
- package: W5
- files:
  - modify `.../OverviewTab/OverviewTab.tsx`:
    - new props `changedFiles: string[]`, `latestReview: ReviewRecord | null`, `onOpenFile(path, line | null)`;
    - **in W5 temporarily optional with no-op defaults; S18 makes them required**.

    Order:
    1. `VerdictBanner`, if there is a `latestReview` with a `verdict`;
    2. brief card: `BriefHeader` + (skeleton | "Couldn't load the brief" + Retry | `BriefSummary` + `BriefMissingInputs`);
    3. a two-column grid: left — `<IntentCard prId>{RiskAreas | BriefSkeleton}</IntentCard>` (Risk areas **inside** the Intent block); right — `BlastRadiusCard`;
    4. `ReviewFocus` (or skeleton);
    5. Description.

    IntentCard / BlastRadiusCard are always visible. Grid `repeat(auto-fit, minmax(min(100%, 420px), 1fr))`.
  - modify `.../OverviewTab/styles.ts`.
  - create `.../OverviewTab/OverviewTab.test.tsx` — provider `brief`, `prReview`, `shell`; **always passes all three new props explicitly**. Flows:
    - (a) empty → Generate → 1 POST, disabled, skeleton → brief without reload;
    - (b) a stored brief without POST, summary above the blocks;
    - (c) 502 → previous brief + message + Retry;
    - (d) `missing_key` → links;
    - (e) 429 → button enabled;
    - (f) GET error → Intent / Blast in place;
    - (g) banner present / absent;
    - (h) click on focus → `onOpenFile`;
    - (i) HTML literally;
    - (j) **Risk areas are inside `section#intent`** (`within(document.getElementById('intent'))` finds the "Risk areas" heading);
    - (k) **the "Generated without: intent" link has `href="#intent"`, and an element with this id is present in the document**.
- skills: react-best-practices (lane 10); frontend-architecture (lane 10); react-testing-library (lane 12); next-best-practices (lane 10)
- constraints: C12, C13, C15, C16
- covers: AC-61, AC-62, AC-63, AC-64, AC-65, AC-66, AC-67, AC-68, AC-69 (unit), AC-81, AC-86, AC-87 (call), AC-102, AC-103, AC-105, EC-1, EC-2, EC-5, EC-20, EC-21, EC-27, NFR-6 (reflow), NFR-9
- reuse: `.../VerdictBanner/VerdictBanner.tsx:12-26`; `.../OverviewTab/OverviewTab.tsx:17-30`
- done-when: T6 green; `pnpm -C client typecheck` green.
- depends-on: S10, S19

### S12 — `BriefRepository`
- package: W4
- files: create `server/src/modules/brief/repository.ts`:
  - `get(prId): Promise<StoredBrief | null>` — via `parseStoredBrief`;
  - `replace(prId, doc)` — one `insert … onConflictDoUpdate`.
- skills: drizzle-orm-patterns (lane 6); onion-architecture (lane 6)
- constraints: C11, C2
- covers: AC-6, AC-11, AC-48
- reuse: `server/src/db/schema/reviews.ts:86-91`; `server/src/modules/intent/repository.ts`
- done-when: `typecheck`, `arch:check` green; covered by T10.
- depends-on: S6

### S13 — `BriefService` (with the request deadline and guards)
- package: W4
- files:
  - create `server/src/modules/brief/service.ts`.

    Ports: `BriefStore`, `BriefPullStore` (`findPull`, `findRepo`, `listFiles`), `BriefIntentReader { getIntent }`, `BriefBlastReader { getBlast }`, `ProjectContextForRepo`, `githubFor`, `llmFor`, `modelFor`, `count`, `wrap`, `now`, optional `limits` (all timeouts and the deadline).

    `getBrief`: `findPull` → 404; `get` → `null` or `toBriefRecord`. No LLM / GitHub / git.

    `generate(ws, prId, logger?)`:
    1. `findPull` → 404;
    2. `takeToken` → 429;
    3. single-flight `Map<ws:prId, Promise>`: an existing one → the same promise;
    4. `run` under an overall `withTimeout(REQUEST_DEADLINE_MS)` with a shared object `{ abandoned: false, deadlineAt }`:
       - `files.length === 0` → `no_diff_data`;
       - `modelFor` + `llmFor` → `ConfigError` → `missing_key` + `provider`;
       - `headSha` from the start;
       - in parallel intent / blast (10 s) / issue (5 s) / specs (5 s) with reason mapping;
       - blast → `projectBlast` (S6);
       - `truncated`;
       - roles (`classifyFile`), ranges (`addedLineRanges`);
       - `buildBriefInput` → `BriefInputOverBudgetError` → `AppError('input_over_budget', …, 500, { reason: 'input_over_budget' })` without an LLM call;
       - exactly one `completeStructured(… maxRetries: 0, httpRetries: 0, timeoutMs: min(LLM_TIMEOUT_MS, deadlineAt − now) )` inside `withTimeout` with the same value;
       - empty summary → `InvalidBriefOutputError`;
       - `validateBriefOutput(output, { prPaths, blastPaths: blastPathsOf(sentBlast), rangesByPath })`;
       - assembling the document (with `intent: sentIntent`, `blast: sentBlast`, `history: null`) → `StoredBrief.safeParse`; failure → `InvalidBriefOutputError`;
       - **before `replace` check `abandoned`**: if the deadline has passed — do not write;
       - `replace`; re-read `findPull` for `stale`.

       Deadline passed → `abandoned = true`, response 502 `llm_timeout`. LLM failure → `ExternalServiceError({ reason: classifyBriefFailure(err) })`.

    Generation is not tied to the request. One log line per completion (C6), including `durationMs` and `reason`.
  - create `server/test/brief-service.test.ts` (unit, fakes). All the previous cases (get, one call with `maxRetries` / `httpRetries` 0, model, single-flight, rate limit, `no_diff_data`, `missing_key`, `llm_timeout`, `llm_error`, `invalid_output`, no `replace` on failures, intent / blast / issue / specs, `truncated`, EC-4, log without text, promise-level "disconnect") plus new ones:
    - **deadline:** a fake blast that hangs and an LLM that responds after `limits.requestDeadlineMs` → 502 `llm_timeout`, `replace` not called even after a late resolve;
    - **the LLM timeout is taken from the deadline remainder**;
    - **budget guard:** `count` always 9 000 → 500 `input_over_budget`, 0 LLM calls, `replace` not called;
    - **line < 1 without a patch:** model output with `line: 0` for a file with `patch: null` → stored `line: 1, line_verified: false`;
    - **projection:** a caller trimmed by the budget does not pass as a `file_ref` (the ref is removed), and the stored `blast` does not contain this caller.
- skills: onion-architecture (lane 5); security (lane 14); typescript-expert (lane 13)
- constraints: C2, C5, C6, C7, C10, C11
- covers: AC-1, AC-2, AC-3, AC-4, AC-5, AC-7, AC-8, AC-9, AC-10, AC-11, AC-12, AC-13, AC-14, AC-15, AC-16, AC-17, AC-18, AC-19, AC-24 (guard), AC-31, AC-32, AC-33, AC-34, AC-35, AC-38, AC-39, AC-41, AC-42, AC-43, AC-45, AC-46, AC-47, AC-48, AC-49, AC-54, AC-60, AC-106, AC-107, EC-1, EC-2, EC-3, EC-4, EC-5, EC-6, EC-7, EC-12, EC-13, EC-14, EC-15, EC-16, EC-18, EC-23, EC-24, EC-28, EC-29, NFR-1 (deadline), NFR-2, NFR-4, NFR-7
- reuse: `server/src/modules/intent/service.ts:169-175,201-224`; `server/src/modules/onboarding/narrative-service.ts:196-206,234-252`; `server/src/modules/blast/service.ts:37-48`; `server/src/modules/smart-diff/classify.ts:18`; `server/src/platform/resilience.ts:13`
- done-when: T9 green; `arch:check` 0 errors; `typecheck` and unit suite green.
- depends-on: S12, S7, S4, S3

### S14 — Routes, registration, DI, integration tests
- package: W4
- files:
  - create `server/src/modules/brief/routes.ts`:
    - `GET` — `params: IdParams`, `response: { 200: PrBriefRecord.nullable() }`;
    - `POST` — `response: { 200: PrBriefRecord }`;
    - `getContext`, one service call, `req.log`.
  - modify `server/src/modules/index.ts` — `brief`.
  - modify `server/src/platform/container.ts` — `briefRepo`, memoized `briefService()` with the same ports as in S13.
  - create `server/test/brief.it.test.ts` (testcontainers; `MockLLMProvider` with `structuredBySchema.PrBriefOutput`; override `llm.openai`). All the previous cases (GET `null` → POST 200 → GET; 1 call; model default / override; 404 / 422; 409 `no_diff_data` / `missing_key`; 429; parallel POSTs; `invalid_output` / `llm_error` without changing the previous brief; `stale`; corrupted JSON → `null`; `truncated`; `specs_used` order) plus:
    - **real HTTP disconnect (AC-16):**
      - `app.listen({ port: 0 })`;
      - a fake LLM whose `completeStructured` waits on a controlled deferred;
      - a `node:http` POST, after the call starts `req.destroy()` (socket closed);
      - then resolve the deferred;
      - poll `pr_brief` (≤ 5 s) → the row appeared, and `GET` returns the record;
      - `app.close()` in `finally`.
    - **stored `blast` = projection:** `endpoints_affected` / `crons_affected` empty.
- skills: fastify-best-practices (lane 4); onion-architecture (lane 8); security (lane 14); breaking-change, response-schema (lanes 17–18)
- constraints: C3, C4, C5, C10, C19, C22
- covers: AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-11, AC-12, AC-13, AC-14, AC-15, AC-16, AC-17, AC-18, AC-19, AC-38, AC-43, AC-46, AC-47, AC-48, AC-60, NFR-4, NFR-7, NFR-8
- reuse: `server/src/modules/intent/routes.ts:16-41`; `server/src/platform/container.ts:158-167,218-220,275-288`; `server/src/modules/_shared/schemas.ts`; `server/src/adapters/mocks.ts:99-108`
- done-when:
  - `lint`, `typecheck`, `arch:check`, unit suite green;
  - `brief.it.test.ts` written;
  - **integration gate:** it is run by the main session in `/run-plan` after wave 3 and **before** `plan-verifier` (see *Test plan → Gate*). A red gate sends W4 back for fixes.
- depends-on: S13

### S15 — File target in the URL and the navigation hook
- package: W6
- files:
  - create `client/src/app/repos/[repoId]/pulls/[number]/file-target.ts` — `parseFileTarget`, `buildDiffHref`, `withoutTarget`.
  - create `.../[number]/file-target.test.ts` — `line` validation (`"0"`, `"-3"`, `"abc"`, `"1.5"`), a path outside the PR, href.
  - create `.../[number]/use-pr-file-navigation.ts` — `openFile(path, line)`: a file in the PR → `router.push`; otherwise `statusMessage`.
  - create `.../[number]/use-pr-file-navigation.test.ts` — `vi.mock("next/navigation")`: `push` (not `replace`); outside the PR — no `push`, a status is set.
- skills: next-best-practices (lane 9); frontend-architecture (lane 9); react-testing-library (lane 12); security (lane 14)
- constraints: C13, C16
- covers: AC-87, AC-88, AC-95, AC-97, AC-98, EC-25
- reuse: `client/src/app/repos/[repoId]/pulls/[number]/page.tsx:78-86`
- done-when: T11 green.
- depends-on: S2

### S16 — diff-viewer: target props
- package: W6
- files:
  - modify `client/src/components/diff-viewer/DiffViewer/DiffViewer.tsx` — optional `target?: { path; line | null; key; lineNotInDiffLabel; onApplied(el) }`.
  - modify `client/src/components/diff-viewer/FileCard/FileCard.tsx`:
    - a change of `target.key` expands the card (adjust-on-prop-change);
    - the line is rendered (`parsePatch`, `newNo === line`) → `CodeLine` with `highlighted` / `focusTarget`; otherwise a label next to the header and focus on the header;
    - `onApplied` via a callback ref;
    - attribute `data-diff-file`.
  - modify `client/src/components/diff-viewer/CodeLine/CodeLine.tsx` — `highlighted`, `focusTarget`, `data-new-line`, `tabIndex={-1}`; transition only without reduced-motion.
  - modify `client/src/components/diff-viewer/styles.ts`.
  - modify `client/src/components/diff-viewer/DiffViewer/DiffViewer.test.tsx`:
    - a card > 200 lines expands;
    - highlight and focus;
    - a line outside the patch → label and header focus;
    - without `target` — as before.
- skills: react-best-practices (lane 10); frontend-architecture (lane 10); react-testing-library (lane 12)
- constraints: C13, C16, C17, C18
- covers: AC-89, AC-92, AC-93, AC-94, EC-10, EC-11
- reuse: `client/src/components/diff-viewer/FileCard/FileCard.tsx:53-56`; `client/src/components/diff-viewer/helpers.ts`
- done-when: T12 green; `client/src/test/smoke.test.tsx` unchanged and green.
- depends-on: S2

### S17 — DiffTab: applying the target once, expanding the group, scroll
- package: W6
- files:
  - modify `.../DiffTab/DiffTab.tsx` — prop `target`, opening the `RoleGroup` by role, label from `brief`.
  - create `.../DiffTab/useDiffTarget.ts`:
    - one application per `key`, when the data is ready (AC-99);
    - `scrollIntoView` with `scroll-margin-top = headerHeight + height of the sticky RoleGroup`;
    - highlight ≤ 2 000 ms with cleanup.
  - modify `.../DiffTab/_components/RoleGroup/RoleGroup.tsx` — `openKey`.
  - modify `.../DiffTab/DiffTab.test.tsx`:
    - provider with `brief`;
    - a collapsed `docs` group and a card in Smart / Original order;
    - once;
    - a target before the data is applied after it;
    - the highlight is removed after 2 s.
- skills: react-best-practices (lane 10); react-testing-library (lane 12); frontend-architecture (lane 10)
- constraints: C13, C16, C17, C18
- covers: AC-89, AC-90 (logic; manual), AC-91 (logic; manual), AC-92, AC-93, AC-94, AC-99, EC-11, EC-30
- reuse: `.../DiffTab/DiffTab.tsx:52-137`; `.../DiffTab/constants.ts:25-28`; `.../[number]/page.tsx:60-76`
- done-when: T13 green.
- depends-on: S16

### S18 — Wiring in `page.tsx` and required navigation props
- package: W6
- files:
  - modify `client/src/app/repos/[repoId]/pulls/[number]/page.tsx`:
    - `usePrFileNavigation`;
    - `setTab` removes `file` / `line`;
    - `OverviewTab` receives `changedFiles`, `latestReview`, `onOpenFile={openFile}`;
    - `tab=diff` + `parseFileTarget`: in the PR → `DiffTab target`; otherwise the status "File not in this PR's diff" in `role="status"`;
    - the hook's `statusMessage` — in the same live region.
  - modify `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/OverviewTab.tsx` — **make `changedFiles`, `latestReview`, `onOpenFile` required and remove the no-op defaults**. `typecheck` then guarantees that `page.tsx` (and the tests) pass real values; a no-op cannot reach the release.
- skills: next-best-practices (lane 9); frontend-architecture (lane 9); react-best-practices (lane 10); typescript-expert — required props as a guarantee (lane 13)
- constraints: C12, C13, C18, C22
- covers: AC-87, AC-88, AC-95, AC-97, AC-98, AC-101, EC-25
- reuse: `client/src/app/repos/[repoId]/pulls/[number]/page.tsx:78-86,159-205`
- done-when:
  - `pnpm -C client lint`, `typecheck`, `test` green;
  - `git grep -n "onOpenFile = \|onOpenFile?:" client/src/app/repos/\[repoId\]/pulls/\[number\]/_components/OverviewTab/OverviewTab.tsx` finds nothing;
  - there is no URL validation logic in `page.tsx`.
- depends-on: S15, S17, S11

## Test plan
- T1: NFR-8, AC-1, AC-13, AC-44 → `server/test/brief-contracts.test.ts` — unit — S1
- T2: AC-9, EC-7, NFR-2 → `server/test/llm-http-retries.test.ts` — unit — S3
- T3: AC-38, AC-39, AC-41, AC-42 (including the priority of `no_clone` / `no_catalog` over `none`) → `server/test/context-attachments-service.test.ts` — unit — S4
- T4: AC-5, AC-6, AC-21, AC-23, AC-36, AC-49…AC-59 (including `line < 1`), AC-60 (shape), EC-8, EC-9, EC-10, EC-19, EC-20, EC-21, EC-22, NFR-5 → `server/test/brief-helpers.test.ts` — unit — S6
- T5: AC-20…AC-30 (including the terminal policy and guard), AC-37, AC-40, AC-44, AC-49 (path source), AC-60, EC-17, EC-26, NFR-3 → `server/test/brief-prompt.test.ts` — unit — S7
- T6: AC-61…AC-69 (unit, including "Risk areas inside `#intent`"), AC-81, AC-86, AC-87, AC-102, AC-103, AC-105, EC-1, EC-2, EC-5, EC-20, EC-21, EC-27, NFR-9 → `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/OverviewTab.test.tsx` — component — S11
- T7: AC-77, AC-78, AC-102, AC-105, AC-108, EC-28, EC-31 → `.../OverviewTab/helpers.test.ts` — unit — S9
- T8: AC-70…AC-80, AC-82…AC-85, AC-96, AC-100, AC-101, AC-105, AC-108, EC-22, EC-27 → `RiskAreas.test.tsx`, `ReviewFocus.test.tsx`, `BriefHeader.test.tsx`, `BriefMissingInputs.test.tsx` — component — S10
- T9: AC-1…AC-5, AC-7…AC-19, AC-24 (guard), AC-31…AC-35, AC-38, AC-39, AC-41…AC-43, AC-45…AC-49, AC-54, AC-60, AC-106, AC-107, EC-1…EC-7, EC-12…EC-16, EC-18, EC-23, EC-24, EC-28, EC-29, NFR-1 (deadline), NFR-2, NFR-4, NFR-7 → `server/test/brief-service.test.ts` — unit — S13
- T10: AC-1…AC-8, AC-11…AC-19 (including the real HTTP disconnect for AC-16), AC-38, AC-43, AC-46…AC-48, AC-60, NFR-4, NFR-7, NFR-8 → `server/test/brief.it.test.ts` — it — S14 (run — gate)
- T11: AC-87, AC-88, AC-95, AC-97, AC-98, EC-25 → `.../[number]/file-target.test.ts`, `.../[number]/use-pr-file-navigation.test.ts` — unit / hook — S15
- T12: AC-89, AC-92, AC-93, AC-94, EC-10, EC-11 → `client/src/components/diff-viewer/DiffViewer/DiffViewer.test.tsx` — component — S16
- T13: AC-89, AC-92, AC-93, AC-94, AC-99, EC-11, EC-30 → `.../DiffTab/DiffTab.test.tsx` — component — S17
- T14: AC-69, AC-105 (anchor) → `client/src/app/repos/[repoId]/pulls/[number]/_components/IntentCard/IntentCard.test.tsx` — component — S19
- Manual checks: AC-69 (visual), AC-90, AC-91, NFR-1, NFR-6 → *Review handoff → Manual verification*.
- **Gate (integration):**
  - Who: the main session in `/run-plan`, after wave 3 completes and the full run of the checks table, **before `plan-verifier` is launched**.
  - Command: `pnpm -C server exec vitest run .it.test`. Docker must be running (testcontainers); all `*.it.test.ts` run, not only `brief.it.test.ts`, because `container.ts` and `context-attachments` changed.
  - A red result blocks verification and sends W4 (or W3 for `context-attachments`) back for fixes.
  - Docker unavailable → verification is marked "unverified: integration" and is not considered complete.
- Commands:
  - `server/`: `pnpm -C server lint` · `pnpm -C server typecheck` · `pnpm -C server arch:check` · `pnpm -C server exec vitest run --exclude '**/*.it.test.ts'`
  - `client/`: `pnpm -C client lint` · `pnpm -C client typecheck` · `pnpm -C client test`
  - `mcp-server/`: `pnpm -C mcp-server typecheck` · `pnpm -C mcp-server test`
  - shared: `./scripts/check-shared-sync.sh`
  - gate: `pnpm -C server exec vitest run .it.test` (main session)
- Multi-agent: implementers run the targeted tests of their files, `typecheck` of their packages and `arch:check` for the server packages. The full table — once per wave in the main session. New files in `test/**` must be run (`server/INSIGHTS.md:59`).

## Risks and open questions
- **AC-25 and the terminal policy:** AC-25 lists five sections to trim and "never removing the PR title or the intent", but does not say what to do when after five steps the input is still larger (large blast summary / changed symbols / intent). The plan adds steps 6–7 (trimming symbols, shortening intent to 1 000 tokens, without removal) and the guard `input_over_budget` (500). Both are within the wording, but are not named in the spec. The code `input_over_budget` is absent from the spec's *Contracts*; we consider it unreachable (proven by T5). If explicit wording is needed — that is a new spec from `spec-creator`; we do not edit this one. — for: user
- **NFR-1 and background work:** `withTimeout` does not cancel the work. A timed-out blast traversal and git reads of specs (`server/src/modules/blast/service.ts:37-48`) keep running in the background after the response; the 75 s deadline bounds the response and the write, but not the load. — for: user
- **NFR-1 and GET p95:** p95 ≤ 300 ms is not verified automatically; there is only a manual measurement per the procedure in *Manual verification*. — for: user
- Whether `openai` / `@anthropic-ai/sdk` accept per-request `maxRetries` in the current versions; if not, S3 needs a separate client with `maxRetries: 0`. — for: researcher
- `MockLLMProvider` throws `Error("…fixture failed schema…")`; the classifier catches `/schema/i`, otherwise T10 gets `llm_error` (accounted for in S6). — for: user
- The rate limit, single-flight and `abandoned` live in process memory; a restart resets them (EC-24 acceptable). — for: user
- The global `@fastify/rate-limit` 120/min per IP (`server/src/app.ts:95`) stays on top of the service one. — for: user
- The priority `not_cloned` > `no_catalog` > `none_attached` is a plan decision (root cause). The spec does not set a priority between AC-41 and AC-42. — for: user
- `IntentCard` now has `id="intent"` and a slot; no other consumers of `IntentCard` were found (only `OverviewTab`). — for: user

## Review handoff
- **Architecture:**
  - `server/src/modules/brief/service.ts` (ports, deadline, `abandoned` before the write);
  - `server/src/platform/container.ts` (memoization);
  - `server/src/modules/context-attachments/service.ts` (`resolveForRepo`, reason priority, `resolveForRun` unchanged);
  - LLM adapters (backward compatibility);
  - client: the `IntentCard` slot (C23), diff-viewer without brief, required `OverviewTab` props.
- **Security:**
  - `wrapUntrusted` only in the user message (S7);
  - allow-list from the blast projection (S6 / S7);
  - `line` normalization and `StoredBrief.safeParse` before the write (S6 / S13);
  - logs without text;
  - rate limit and single-flight;
  - `file` / `line` from the URL (S15);
  - plain-text rendering (S10);
  - `getIssue` only same-repo.
- **API compatibility:** new `GET` / `POST /pulls/:id/brief`. `PrBrief` is loosened and extended with no consumers on the wire. The new `details.reason = input_over_budget` (500) — only for the unreachable guard. URL `file` / `line` are additive. Lanes 17–20.
- **Tests:** an optional e2e over a seeded brief for PR #482 — `test-writer`. The integration gate — main session (see *Test plan*).
- **Docs:**
  - `server/docs/api-contracts.md` + the API map of `server/README.md` (codes, `details.reason`, the 75 s deadline);
  - `server/docs/architecture.md` (brief module, budget, terminal policy, blast projection, specs reason priority);
  - `client/docs/ui-architecture.md` (Overview brief, the `IntentCard` slot, `#intent`, URL target).

  All for `doc-writer`.
- **Manual verification** (live browser, visible tab — `client/INSIGHTS.md:51,57`):
  - S17 / S18 — scroll to the file and line under the sticky `PrDetailHeader` and `RoleGroup` (AC-90, AC-91): a collapsed `docs` group, a file > 200 lines, both orders; Back → Overview (AC-97).
  - S11 / S19 — Risk areas visually inside the Intent block; two columns and wrapping at 320px / 200% (AC-69, NFR-6); the "intent" link from "Generated without" scrolls to the Intent block (AC-105).
  - Keyboard and screen reader (NFR-6).
  - **NFR-1, measurement:** seeded DB, `./scripts/dev.sh`.
    1. GET p95: `for i in $(seq 1 40); do curl -s -o /dev/null -w '%{time_total}\n' http://localhost:3001/pulls/<prId>/brief; done | sort -n | sed -n 38p` (the 38th of 40 ≈ p95) — expected ≤ 0.300.
    2. Generation: `curl -s -o /dev/null -w '%{time_total}\n' -X POST http://localhost:3001/pulls/<prId>/brief` three times (a pause longer than the rate limit is not needed; ≤ 10/min) — each ≤ 75 s; compare with `durationMs` in the AC-106 log entry.

    Record the results in the run-plan report. The constraint about background work — in *Risks*.

## Not found / gaps
- Agent order in the DB — searched: `server/src/db/schema/agents.ts`, `AgentsRepository.list*` — there is no order column; resolved by Q5.
- A stored linked issue number — searched: `pr_intent.sources`, `pull_requests` — metadata only; resolved by Q3.
- OpenAI / Anthropic adapter tests — searched: `grep OpenAIProvider|AnthropicProvider server/test` — none; S3 creates the first.
- A `page.tsx` test — none; the logic is extracted into `use-pr-file-navigation.ts` (S15).
- An `IntentCard` test — searched: `client/src/app/repos/[repoId]/pulls/[number]/_components/IntentCard/` — none; S19 creates it.
- An element with `id="intent"` — searched: `IntentCard.tsx`, `page.tsx` — none; S19 adds it.
- A per-repo API for attachments — only `resolveForRun`; S4 adds `resolveForRepo`.
- An explicit AC-41 / AC-42 priority in the spec — none; a plan decision (S4), recorded in *Risks*.

---
