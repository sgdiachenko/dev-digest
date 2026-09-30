# Spec: Project Context — document catalog, preview and token counts
Spec ID: 2026-09-30-project-context-catalog
Status: implemented
Supersedes: none
Modules: server, client

## Problem and user

A workspace owner who configures review agents in DevDigest cannot see which
knowledge documents (PRDs, tech specs, security baselines, architecture notes,
`INSIGHTS.md` files) live in a repository, how big they are, or what they say,
without leaving the studio and browsing the repository by hand. They also have
no idea what a document would cost in prompt tokens if an agent read it.
Today the sidebar already reserves a "Project Context" key
(`client/src/components/app-shell/helpers.ts:30`) and the client has an
unused data hook for it (`client/src/lib/hooks/core.ts:122-137`), but there is
no page and no server endpoint behind it — the user hits nothing.

This spec covers the read-only **catalog** of a repository's Markdown
documents. Attaching documents to agents/skills and injecting them into runs
is [2026-09-30-project-context-attachments](2026-09-30-project-context-attachments.md).

## Goals / Non-goals

Goals
- List every Markdown document of the active repository, grouped by category
  (specs / docs / insights), with size and an estimated token count.
- Preview a document's content, rendered safely.
- Show from which commit and when the catalog was built, and let the user
  rescan.
- Use one canonical token estimate that every Project Context surface
  (this page and 2026-09-30-project-context-attachments's tabs and run budget) shows identically.

Non-goals
- Editing, creating, uploading or moving documents (the design's Edit toggle,
  "+ new", upload and folder icons) — v1 is read-only (Q7).
- The "78 COVERAGE" badge (Q8).
- Chunking/embedding documents for retrieval, and the "1,240 chunks" counter
  (Q8) — documents are used as whole text.
- "Used by N agents · M skills" — shown on this page but specified in 2026-09-30-project-context-attachments,
  because its data is the attachments 2026-09-30-project-context-attachments introduces.
- The "Onboarding Tour" sidebar item shown in the design (Q20).
- A new keyboard shortcut for the page (Q20).
- Documents outside the repository (uploaded files, URLs, other repos).
- Browser e2e coverage — deferred to a later follow-up (Q19); this spec is
  verified by unit, integration and manual checks only.

## User stories

- US-1 [must]: As a workspace owner, I want to see every Markdown document of the active repository with its category, so that I know what project knowledge exists.
- US-2 [must]: As a workspace owner, I want to preview a document's rendered content, so that I can judge whether it is worth giving to an agent.
- US-3 [must]: As a workspace owner, I want an estimated token count per document, so that I understand how much each one would add to a prompt.
- US-4 [must]: As a workspace owner, I want to see which commit the catalog reflects and rescan it, so that I know the list is current.
- US-5 [should]: As a workspace owner, I want to filter documents by name and category, so that I can find one quickly in a large repository.

## Acceptance criteria (EARS)

- AC-1 [event, US-1, must, verify: integration] КОЛИ the clone job or a resync of a repository completes successfully, the server shall rebuild that repository's catalog from the files at the default-branch commit the clone then points to.
- AC-2 [ubiquitous, US-1, must, verify: unit] The server shall include in the catalog every file whose name ends in `.md` or `.mdx` (case-insensitive), except files under a path segment named `node_modules`, `vendor` or `.git`, or under any path segment starting with `.` other than `.devdigest`.
- AC-3 [ubiquitous, US-1, must, verify: unit] The server shall assign each catalog entry exactly one category by the first matching rule: `specs` when the path starts with `.devdigest/specs/` or contains a directory segment named `specs`; `insights` when the file name is `INSIGHTS.md` or the path contains a directory segment named `insights`; `docs` otherwise.
- AC-4 [event, US-1, must, verify: integration] КОЛИ the user opens `/repos/:repoId/context`, the page shall list the repository's catalog entries sorted by path, each showing its path, category label, size and estimated tokens.
- AC-5 [ubiquitous, US-3, must, verify: unit] The server shall compute each entry's `est_tokens` as the `cl100k_base` token count of the document's text, falling back to `ceil(characters / 4)` when that tokenizer is unavailable.
- AC-6 [ubiquitous, US-3, must, verify: unit] The page shall display the server-provided `est_tokens` prefixed with "≈" and shall not compute a token count of its own.
- AC-7 [event, US-3, should, verify: unit] КОЛИ the user hovers or keyboard-focuses a token count, the page shall show a tooltip saying the number is a tokenizer estimate that can differ by 10–30 % depending on the model.
- AC-8 [event, US-2, must, verify: integration] КОЛИ the user selects a catalog entry, the page shall show that document's content rendered as Markdown, read from the git object of the catalog's scanned commit.
- AC-9 [unwanted, US-2, must, verify: unit] ЯКЩО a previewed document contains a link or image whose URL uses the `javascript:` or `data:` scheme, ТОДІ the preview shall render it with an empty URL (`[x](javascript:alert(1))` yields `href=""`).
- AC-10 [unwanted, US-2, must, verify: unit] ЯКЩО a previewed document contains raw HTML, ТОДІ the preview shall render that HTML as escaped text, never as markup.
- AC-11 [unwanted, US-1, must, verify: integration] ЯКЩО a matching path is a symbolic link in the scanned commit (git mode `120000`), ТОДІ the server shall exclude it from the catalog.
- AC-12 [unwanted, US-2, must, verify: integration] ЯКЩО a preview request names a path that is not an entry of the repository's current catalog (including paths with `..` segments or absolute paths), ТОДІ the server shall respond `404` without reading any file.
- AC-13 [unwanted, US-1, must, verify: integration] ЯКЩО a document is larger than 64 KB, ТОДІ the server shall list it with status `too_large`, its size, and `est_tokens` = null.
- AC-14 [unwanted, US-1, must, verify: unit] ЯКЩО a document's bytes are not valid UTF-8 text, ТОДІ the server shall list it with status `unreadable` and `est_tokens` = null.
- AC-15 [state, US-4, must, verify: unit] ПОКИ the repository has no clone, the page shall show a "Repository not cloned yet" state with a Resync action instead of a list.
- AC-16 [event, US-4, must, verify: integration] КОЛИ the user activates Rescan, the server shall advance the clone to the latest `origin/<default branch>` and rebuild the catalog.
- AC-17 [state, US-4, must, verify: unit] ПОКИ a rescan is in progress, the page shall show the Rescan control disabled with a progress label.
- AC-18 [ubiquitous, US-4, must, verify: unit] The page shall show a footer "N files · scanned <relative time> ago" together with the default branch name and the scanned commit's short SHA.
- AC-19 [state, US-1, must, verify: unit] ПОКИ the catalog of a cloned repository has zero entries, the page shall show an empty state that names `.devdigest/specs/` as the place to add documents and offers Rescan.
- AC-20 [event, US-5, should, verify: unit] КОЛИ the user types in the filter field, the page shall show only entries whose path contains the typed text, case-insensitively.
- AC-21 [event, US-5, should, verify: unit] КОЛИ the user toggles a category chip (specs / docs / insights), the page shall show only entries of the selected categories.
- AC-22 [ubiquitous, US-5, should, verify: unit] The page shall reflect the text filter, the category chips and the selected document in the URL, so that reload and deep links restore them.
- AC-23 [unwanted, US-5, should, verify: unit] ЯКЩО the active filters match zero entries while the catalog is not empty, ТОДІ the page shall show "No documents match" with a Clear filters action, distinct from the AC-19 empty state.
- AC-24 [unwanted, US-1, must, verify: integration] ЯКЩО a repository has more than 1,000 eligible documents, ТОДІ the page shall show "Showing first 1,000 of N" above a list holding only the first 1,000 entries by path order.
- AC-25 [unwanted, US-2, should, verify: unit] ЯКЩО a document contains a string matching one of the secret patterns listed under *Untrusted inputs*, ТОДІ the page shall show a "possible secret" warning on that entry and in its preview header.
- AC-26 [unwanted, US-1, must, verify: unit] ЯКЩО loading the catalog fails, ТОДІ the page shall show "Couldn't load documents" with a Retry action and keep any list already on screen.
- AC-27 [unwanted, US-4, must, verify: integration] ЯКЩО a rescan fails, ТОДІ the page shall show the failure reason with a Retry action above the previous, unchanged catalog.
- AC-28 [ubiquitous, US-1, must, verify: unit] The sidebar WORKSPACE group shall contain a "Project Context" item linking to `/repos/:repoId/context` for the active repository.
- AC-29 [ubiquitous, US-2, must, verify: unit] The page shall offer no action that creates, edits, uploads, moves or deletes a repository file.
- AC-30 [state, US-1, must, verify: unit] ПОКИ the catalog request is pending, the page shall show skeleton rows in the list pane and keep the navigation interactive.

## Edge cases

UI state matrix (screen × state):

| Screen / component | Default | Empty | Loading | Partial | Error | Degraded | No access / no clone | First run | Long content | Stale |
|---|---|---|---|---|---|---|---|---|---|---|
| Catalog list | AC-4 | AC-19, filtered: AC-23 | AC-30 | n/a — catalog is built atomically | AC-26 | EC-4 → AC-27 | AC-15, EC-1 | AC-15 (seeded demo repo is not cloned) | AC-24, EC-5 | AC-18, EC-3 |
| Document preview | AC-8 | EC-6 | EC-7 | n/a | EC-2 → AC-12 | n/a | AC-15 | n/a | AC-13, EC-8 | EC-3 |
| Footer / Rescan | AC-18 | AC-18 (0 files) | AC-17 | n/a | AC-27 | EC-4 | AC-15 | AC-15 | n/a | AC-18 |

- EC-1: The repository was imported but its clone job has not finished or failed (`clone_path` null, as for the seeded `acme/payments-api`, `server/src/db/seed.ts:110`) → the page shows the not-cloned state with Resync (→ AC-15).
- EC-2: A document is deleted or renamed upstream and the user opens a stale deep link to it → `404`, and the page shows "Document not found in <branch>@<sha>" with a link back to the list (→ AC-12).
- EC-3: Upstream changed documents after the last scan → the page keeps showing the scanned commit's version and states that commit and scan time; nothing changes until a rescan (→ AC-18, AC-16).
- EC-4: `git fetch` fails during a rescan (network, token revoked) → the previous catalog stays, the reason is shown (→ AC-27).
- EC-5: Very long path (> 120 characters) → the list truncates it in the middle with an ellipsis and exposes the full path as the accessible name and tooltip (→ AC-4).
- EC-6: An empty (0-byte) document → listed with status `empty`, `est_tokens` = 0, and the preview says "Empty document" (→ AC-4, AC-8).
- EC-7: The user selects another document while a preview is loading → the pane shows a loading placeholder and renders only the latest selection (→ AC-8).
- EC-8: A `too_large` or `unreadable` document is selected → the preview shows the reason and size instead of content (→ AC-13, AC-14).
- EC-9: A document path is a symbolic link pointing outside the repository (e.g. to `~/.devdigest/secrets.json`) → it never appears in the catalog and its target is never read (→ AC-11, AC-12).
- EC-10: Two rescans are triggered (double click, two tabs) → the server runs at most one rescan per repository at a time and both callers see the same result (→ AC-16, NFR-4).
- EC-11: A document contains a secret-like string → it is listed and previewable, with a warning (→ AC-25).

## Non-functional requirements

- NFR-1 [Performance, verify: integration] The catalog request shall respond with p95 ≤ 500 ms for a repository with ≤ 500 eligible documents on a local clone, measured over 20 requests after one warm-up.
- NFR-2 [LLM cost, verify: unit] Building, reading and previewing the catalog shall make 0 LLM calls.
- NFR-3 [Limits, verify: integration] Per-document content limit 64 KB (AC-13); catalog limit 1,000 entries (AC-24); preview returns at most one document per request.
- NFR-4 [Reliability, verify: integration] A rescan shall be idempotent and single-flight per repository; a failed rescan leaves the previous catalog intact (AC-27); the catalog survives a server restart.
- NFR-5 [Security, verify: unit, integration] Every item of *Untrusted inputs* is handled as stated there (AC-9, AC-10, AC-11, AC-12, AC-25).
- NFR-6 [Accessibility, verify: manual — keyboard walk-through and axe scan of the page] Every list row, filter, chip, Rescan and the preview are reachable by keyboard in visual order with visible focus (WCAG 2.1.1, 2.4.3, 2.4.7); category tags carry text, not colour alone (1.4.1); tag text contrast ≥ 4.5:1 (1.4.3); rescan start/finish is announced through a status message without moving focus (4.1.3); targets ≥ 24 × 24 CSS px (2.5.8).
- NFR-7 [Observability, verify: unit] The server shall log one line per rescan with repository id, scanned SHA, entry count, skipped-count per reason and duration, and shall never log document content.
- NFR-8 [Compatibility, verify: integration] No existing endpoint changes; the existing `SpecFile` / `IndexStatus` contracts and every existing consumer keep working; new persisted data needs a manual `pnpm db:migrate`.
- NFR-9 [i18n, verify: unit] Every user-visible string of the page comes from `client/messages/en` (the existing `context.json` namespace may be extended); no message contains a literal `<untrusted>`-style tag (`client/INSIGHTS.md`, 2026-09-18 entry).

## Workflow and module communication

```mermaid
sequenceDiagram
  actor U as User
  participant C as Client (Project Context page)
  participant S as Server (API)
  participant G as Git clone (local)
  U->>C: open /repos/:repoId/context
  C->>S: GET /repos/:repoId/context
  alt repo not cloned
    S-->>C: 200 status=not_cloned
    C-->>U: "Repository not cloned yet" + Resync
  else catalog ready
    S-->>C: 200 catalog (scanned_sha, files[] with est_tokens)
    C-->>U: list + footer "N files · scanned X ago"
  else server/DB error
    S-->>C: 5xx
    C-->>U: "Couldn't load documents" + Retry
  end
  U->>C: select document
  C->>S: GET /repos/:repoId/context/file?path=…
  alt path in catalog, size ≤ 64 KB
    S->>G: read git object at scanned_sha (never working tree)
    G-->>S: text
    S-->>C: 200 content
    C-->>U: safe Markdown preview
  else path not in catalog
    S-->>C: 404
    C-->>U: "Document not found" + back to list
  end
```

```mermaid
sequenceDiagram
  participant J as Clone job / Rescan
  participant S as Server (catalog builder)
  participant G as Git clone (local)
  participant DB as Postgres
  J->>G: clone, or fetch + advance to origin/<default branch>
  alt git failed
    G-->>J: error
    J->>S: keep previous catalog, record reason
  else ok
    G-->>S: HEAD sha
    S->>G: list tree at sha (paths, modes, sizes)
    S->>S: filter (AC-2), drop symlinks (AC-11), categorize (AC-3), estimate tokens (AC-5)
    S->>DB: replace catalog for repo atomically (sha, scanned_at, entries)
  end
```

## Contracts

All wire fields `snake_case`. New contracts live in `@devdigest/shared` and are
mirrored by hand into `server/src/vendor/shared`, `client/src/vendor/shared`
and — for any file the MCP server mirrors (`platform.ts`, `trace.ts`, …) —
`mcp-server/src/vendor/shared`; `scripts/check-shared-sync.sh` guards all three.

- `GET /repos/:repoId/context` — **new** (the client hook at
  `client/src/lib/hooks/core.ts:123-129` targets this URL but no server route
  exists today, so no running consumer depends on its shape).
  - `200` `ContextCatalog`:
    - `repo_id: string`
    - `status: 'ready' | 'not_cloned' | 'scanning' | 'error'`
    - `branch: string | null`, `scanned_sha: string | null`, `scanned_at: string (ISO) | null`
    - `total_files: int` (eligible before the 1,000 cap), `truncated: boolean`
    - `error: string | null` (last rescan failure reason)
    - `files: ContextDoc[]`
  - `ContextDoc`: `path: string`, `category: 'specs' | 'docs' | 'insights'`,
    `size: int` (bytes), `est_tokens: int | null`,
    `status: 'ok' | 'empty' | 'too_large' | 'unreadable'`,
    `secret_warning: boolean`, `used_by` — nullable here, filled by 2026-09-30-project-context-attachments.
  - `404` repo not in workspace.
- `GET /repos/:repoId/context/file?path=<repo-relative path>` — **new**.
  - `200` `{ path, category, size, est_tokens, status, secret_warning, sha: string, content: string | null }` (`content` null unless `status` is `ok` or `empty`).
  - `404` path not in the current catalog (AC-12); `422` missing/invalid `path`.
- Rescan — **unchanged** existing resync action (`resyncRepo`,
  `server/src/modules/repo-intel/service.ts:150-160`), plus the catalog rebuild
  of AC-1/AC-16. Note: `RepoService.refresh` only fetches and does not advance
  the working tree (RQ3), so it does not satisfy AC-16.
- `SpecFile`, `IndexStatus` (`server/src/vendor/shared/contracts/platform.ts:271-287`) — **unchanged**.

## Rollout and compatibility

- Existing repositories have no catalog until their next clone/rescan; opening
  the page for such a cloned repo shows the AC-19-style empty state with
  Rescan, or triggers a first scan (planner's choice), never an error.
- Seeded demo repo `acme/payments-api` has no clone (`server/src/db/seed.ts:110`)
  → first-run view is the not-cloned state (AC-15).
- New persisted catalog data → a new migration, applied manually
  (`pnpm db:migrate`, never on boot).
- No feature flag; the sidebar item appears after upgrade.

## Inputs and provenance

- User request (Project Context feature, translated): list all specs/MD
  documents of the project; count tokens in place from document size.
- Design 1 (Project Context page, N6): list pane, `.devdigest/specs/` hint,
  Preview, footer, refresh icon → AC-4, AC-8, AC-18, AC-16, AC-19. Edit/+new/
  upload/folder/Coverage/chunks → Non-goals (Q7, Q8).
- Answers: Q1 (split into 2026-09-30-project-context-catalog/2026-09-30-project-context-attachments), Q2 (file set + category rules →
  AC-2, AC-3), Q7 (read-only → AC-29), Q8 (footer text, Coverage/chunks out →
  AC-18), Q9 (64 KB → AC-13), Q14 (cached catalog + Rescan, auto-scan after
  clone/resync → AC-1, AC-16), Q16 (one server estimator, "≈", tooltip → AC-5,
  AC-6, AC-7), Q17 (secret warning → AC-25), Q18 (performance → NFR-1), Q19
  (no e2e), Q20 (nav item, no hotkey → AC-28).
- UX proposals accepted: UX-6 (freshness footer → AC-18), UX-9 (category chips
  + URL state → AC-21, AC-22). UX-8 → Non-goals.
- Research: RQ1 → no e2e clone fixtures exist (seed `clonePath: null`); moot
  since e2e is deferred. RQ2 → `readFile`/`readClone` have no symlink or `..`
  guard, `showFileAt` has one (`server/src/adapters/git/show-file-at-guard.ts`)
  → AC-8 reads git objects, AC-11 drops mode-120000 entries, AC-12. RQ3 →
  resync = `fetch --depth 50` + `reset --hard` with no lock; reading at a
  fixed SHA is unaffected by a concurrent resync. RQ4 → `react-markdown`
  9.1.0 with its default URL transform drops `javascript:`/`data:` and escapes
  raw HTML → AC-9, AC-10 (the existing `Markdown` primitive,
  `client/src/vendor/ui/primitives/Markdown.tsx:10-35`, qualifies as long as
  no raw-HTML plugin or custom URL transform is added). RQ5 → three token
  estimators coexist today (server `cl100k_base`,
  `server/src/adapters/tokenizer/index.ts`; client chars/4,
  `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/helpers.ts:45-48`;
  `reviewer-core/src/prompt-log.ts:46-50` chars/4) → AC-5, AC-6 unify these
  surfaces on the server value.
- Existing code (context only): i18n `client/messages/en/context.json`,
  nav `client/src/vendor/ui/nav.ts:21-26`, active-key
  `client/src/components/app-shell/helpers.ts:30`, contracts
  `server/src/vendor/shared/contracts/platform.ts:271-287`.
- Confirmed by the user after the first draft: the 1,000-entry cap (AC-24,
  Q-1) and the secret-pattern list (AC-25, Q-2). The 120-character middle
  truncation in EC-5 is a presentation detail accepted with the recommended
  answers. Remaining open items are researcher questions only (Q-3, Q-4).

## Untrusted inputs

| Input | Source | OWASP | Required handling |
|---|---|---|---|
| Document text | anyone with push rights to the repository's default branch | A05 Injection (stored XSS) | Rendered only through the safe Markdown path: no raw HTML (AC-10), `javascript:`/`data:` URLs neutralised (AC-9); never executed; never logged (NFR-7). |
| File paths / names | repository author | A05 Injection | Rendered as text only (React-escaped); path segments never interpreted as HTML. |
| `path` query parameter | browser / any local caller | A01 Broken Access Control | Accepted only if it equals an entry of the repo's current catalog (AC-12); never joined onto a filesystem path. |
| Symbolic links in the repo | repository author | A01 | Never listed or read (AC-11, EC-9); content is read from git objects at a fixed commit, never from the working tree (AC-8). |
| Secret-like strings in documents | repository author | A09 / A04 | Detected and flagged (AC-25) using exactly these patterns (Q-2): `sk_live…` (Stripe live key), `sk-…` (OpenAI-style key), `AKIA…` (AWS access key id), `-----BEGIN … PRIVATE KEY-----` (private key header), `ghp_…` (GitHub personal token), `service_role` (Supabase service key marker); the list may be extended later without changing this spec's behaviour; the matched value is never logged or echoed separately. |
| Oversized / binary files | repository author | A06 Insecure Design | Content above 64 KB is not read (AC-13); non-UTF-8 is not rendered (AC-14). |

## Traceability

| Story | AC | EC | NFR | Verify |
|---|---|---|---|---|
| US-1 | AC-1, AC-2, AC-3, AC-4, AC-11, AC-13, AC-14, AC-19, AC-24, AC-26, AC-28, AC-30 | EC-1 → AC-15, EC-5 → AC-4, EC-9 → AC-11 | NFR-1, NFR-3, NFR-5, NFR-6, NFR-7, NFR-8, NFR-9 | unit, integration, manual |
| US-2 | AC-8, AC-9, AC-10, AC-12, AC-25, AC-29 | EC-2 → AC-12, EC-6 → AC-8, EC-7 → AC-8, EC-8 → AC-13/AC-14, EC-11 → AC-25 | NFR-2, NFR-5 | unit, integration |
| US-3 | AC-5, AC-6, AC-7 | EC-6 → AC-4 | NFR-2 | unit |
| US-4 | AC-15, AC-16, AC-17, AC-18, AC-27 | EC-3 → AC-18, EC-4 → AC-27, EC-10 → AC-16 | NFR-4 | unit, integration |
| US-5 | AC-20, AC-21, AC-22, AC-23 | — | NFR-6 | unit |

## Open questions

- ~~Q-1~~ — resolved: catalog cap stays 1,000 entries and the page says "Showing first 1,000 of N" (AC-24).
- ~~Q-2~~ — resolved: secret-warning patterns are `sk_live`, `sk-…`, `AKIA…`, `-----BEGIN PRIVATE KEY-----`, `ghp_…`, `service_role`; more may be added later (*Untrusted inputs*, AC-25).
- Q-3: Can a commit fetched with `--depth 50` become unreachable (gc/re-shallow) between a scan and a later preview read, and what should the preview show then? Proposed: treat as `404` "Document not found" and suggest Rescan — for: researcher (to be settled by implementation-planner) — blocking: no
- Q-4: When `REPO_INTEL_ENABLED` is off, is the resync action (AC-16) still registered, or does Rescan need its own path? — for: researcher (to be settled by implementation-planner) — blocking: no

## Implementation

Built on branch `H05`. Plan: [project-context-catalog](../plans/project-context-catalog.md);
state, verification and review history:
[impl log](../plans/project-context-catalog.impl.md); implementer reports:
[reports](../plans/project-context-catalog.reports.md). Docs:
[server/README.md](../../server/README.md#project-context-routes),
[server/docs/api-contracts.md](../../server/docs/api-contracts.md#project-context),
[server/docs/architecture.md](../../server/docs/architecture.md#project-context-catalog-modulesproject-context),
[client/README.md](../../client/README.md),
[repo-intel README](../../server/src/modules/repo-intel/README.md).

Test paths: `S:` = `server/test/`, `V:` =
`client/src/app/repos/[repoId]/context/_components/ProjectContextView/`
(`helpers.test.ts`, `ProjectContextView.test.tsx`, `_components/*/*.test.tsx`).
The plan's step and test ids are S# / T#.

| Requirement | Plan | Tests |
|---|---|---|
| AC-1 | S9 | T5, T6, T7 (`S:project-context-service`, `S:repo-intel-resync`, `S:project-context-triggers`); integration half T9 not run |
| AC-2, AC-3, AC-11, AC-13, AC-14, AC-24, AC-25, EC-6, EC-11 | S3, S5 | T3, T4 (`S:git-tree`, `S:project-context-helpers`); integration halves of AC-11/13/24 in T9, not run |
| AC-4, AC-30 | S7, S8, S15 | T15 (`V:ProjectContextView.test.tsx`); integration half T9, not run |
| AC-5 | S2 | T2 (`S:tokenizer`) |
| AC-6, AC-7 | S14 | T13 (`V:_components/TokenEstimate`) |
| AC-8, AC-12, EC-2, EC-8 | S7, S8, S14 | T5, T14 (`V:_components/DocPreview`); integration halves T9, not run |
| AC-9, AC-10 | S14 | T14 |
| AC-15, EC-1 | S7, S15 | T5, T15 |
| AC-16, AC-27, EC-3, EC-4, EC-10 | S7, S8 | T5, T15; integration halves T9, not run |
| AC-17, AC-19, AC-23, AC-26, AC-29 | S15 | T15 |
| AC-18, AC-20, AC-21, AC-22, EC-5 | S13, S14, S15 | T12 (`V:helpers.test.ts`), T15 |
| AC-28 | S12 | T10 (`client/src/components/app-shell/helpers.test.ts`) |
| NFR-1, NFR-3 | S10 | T9 only (not run); NFR-1 unverified |
| NFR-2, NFR-7 | S7 | T5 |
| NFR-4 | S7, S10 | T5; restart and integration halves T9, not run |
| NFR-5 | S5, S7, S14 | T4, T5, T14; integration half T9, not run |
| NFR-6 | S14, S15 | Manual pass, only partly done (see below) |
| NFR-8 | S1, S4 | T1 (`S:project-context-contracts`); integration half T9, not run |
| NFR-9 | S12 | T11 |

### Verification status

- Full checks (contracts sync, server lint/typecheck/`arch:check`, client
  lint/typecheck, unit tests) all exit 0 at the last fingerprint: server 360
  unit tests, client 178, `arch:check` 0 errors (impl log, "full checks after F6").
- **`*.it.test.ts` (T9) has not been run.** It needs Docker or CI, so the
  integration halves of AC-1/4/8/11/12/13/16/24/27, EC-4/9/10 and
  NFR-1/3/4/8 are open.
- Manual pass on an isolated stack covered list, previews, hostile Markdown,
  keyboard focus, named controls, `aria-pressed` chips, live-region text,
  rescan (including two concurrent rescans → one scan), migration 0016 applied
  cleanly, not-cloned and empty states, and the server 404/422 matrix.
- **The manual accessibility pass (NFR-6) is only partly done:** no axe scan,
  no contrast measurement, no screen-reader run (only the live-region text was
  read), and the truncation banner with more than 1,000 documents is covered by
  a unit test only.
- Review loop closed: architecture-reviewer and security-reviewer approved with
  no findings; `/code-review` findings F1, F4, F5 fixed, F2 and F3 disputed and
  accepted by the user (impl log, review ledger).

### Settled open questions

- Q-3 (unreachable commit after gc or re-shallow): the file route returns `404`
  with `details.reason = commit_unavailable`, and the UI offers Rescan.
- Q-4 (resync with `REPO_INTEL_ENABLED` off): resync works regardless of the
  flag, and it enqueues the catalog rebuild.

### Accepted deviations

- The empty state (AC-19) and the footer (AC-18) each have their own Rescan button.
- The footer's relative time reads "less than a minute ago" instead of "just now".
- `useContextCatalog` takes an optional `pollNotCloned` argument, to keep
  polling after Resync while the repository is still `not_cloned`
  (`client/src/lib/hooks/context.ts:14-25`).
- Category chips are local `aria-pressed` buttons because the vendored `Chip`
  does not forward ARIA props.

### Known limits

- `used_by` is always `null` until
  [2026-09-30-project-context-attachments](2026-09-30-project-context-attachments.md)
  (approved, not implemented) lands.
- Migration `0016_famous_spot.sql` (`context_catalogs`, `context_docs`) is never
  applied on boot; run `pnpm -C server db:migrate` by hand.
- Left as-is, not defects of this change (impl log, "manual findings"): Markdown
  headings render at body size and a neutralised `data:` image shows a broken-image
  glyph (both vendored `Markdown`); React Query pauses polling in a hidden tab; a
  failed-rescan reason can contain the local clone or origin path (LOW).
- The pre-existing `POST /repos/:id/resync` workspace-ownership gap is not fixed
  here (plan, *Review handoff → Security*).
