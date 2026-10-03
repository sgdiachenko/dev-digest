# impl: Project Context — каталог документів
Plan: docs/plans/project-context-catalog.md (multi-agent, waves: 1… 2)   Spec: 2026-09-30-project-context-catalog
Phase: pr-gate (done — waiting for the user's commit/PR decision)   Verify round: 2/2 (done)   Review round: 2/3 (closed)   Manual verification: done
Extra instructions: none

## Log
- 2026-09-30 intake: spec approved, 50/50 AC·EC·NFR covered by the plan, 15 steps complete; branch H05; unrelated uncommitted files present (agents/skills/spec edits — not part of this feature)
- 2026-09-30 W1 done (T1 green, targeted checks green)
- 2026-09-30 W2 done (S2–S4; migration 0016_famous_spot.sql generated, not applied)
- 2026-09-30 W3 done (S5–S10; implementer's targeted checks green; T9 written, not run)
- 2026-09-30 W4 done (S11–S15; client 176 tests)
- 2026-09-30 wave 2 full checks — all exit 0 @ gate fingerprint eee26344…:

| Command | Exit | Result |
|---|---|---|
| `./scripts/check-shared-sync.sh` | 0 | pass |
| `pnpm -C server lint` / `typecheck` | 0 / 0 | pass |
| `pnpm -C server arch:check` | 0 | 0 errors, 7 pre-existing warnings |
| `pnpm -C server exec vitest run … --exclude '**/*.it.test.ts'` | 0 | 354 passed |
| `pnpm -C client lint` / `typecheck` | 0 / 0 | pass |
| `pnpm -C client exec vitest run` | 0 | 176 passed, 0 MISSING_MESSAGE |

- Known gaps carried to verify/review: W4 deviation — AC-19 empty state has no own Rescan button (relies on footer); W3 — Rescan joining a no-sync scan does not sync; T9 (`*.it.test.ts`) not run.
- 2026-09-30 verify round 1 (plan-verifier): 78 met, 12 partial, 0 unmet, 6 not-verifiable. Fixed in main session (small, no new port/module/contract): AC-16 (rescan queued behind a running no-sync scan → still syncs; `service.ts` `syncing` set), AC-4/C24 (`compareByPath` applied in `getCatalog`, DB collation no longer decides order), AC-19 (empty state has its own Rescan CTA), AC-18 (`relativeTime` "less than a minute ago" instead of "just now"), EC-3 + AC-18 tests. New tests: 3 server (service), 3 client. Full checks after fixes all exit 0 @ fingerprint 51a1d880…: server 357 tests, client 178 tests, arch 0 errors.
- 2026-09-30 verify round 2 (delta, 11 rows): 9 met, 2 partial (AC-4/AC-16/EC-10/NFR-4 integration halves only), 0 unmet. Overall: verified with gaps — all remaining gaps need CI (T9) or a human (NFR-6).
- 2026-09-30 review round 1: architecture-reviewer — approve, 0 findings; security-reviewer — approve, 0 findings (pre-existing `/resync` ownership gap reported once, out of scope); /code-review medium — 1 finding (F1), fixed. Full checks after the fix all exit 0 @ fingerprint 30837429…: server 358 tests, client 178 tests, arch 0 errors.
- 2026-09-30 review round 2 (delta /code-review on service.ts): F1 fix OK; 2 WARNING disputed (F2, F3), 2 SUGGESTION fixed (F4, F5) as chosen by the user. Full checks all exit 0 @ fingerprint 25cb5134…: server 360 tests, client 178, arch 0 errors. No CRITICAL/WARNING open → review loop closed.
- 2026-09-30 manual verification (isolated stack: ephemeral Postgres :5434, API :3111, web :3110, fixture git repo + bare origin under the scratchpad; dev stack on 3000/3001/5432 untouched; torn down afterwards). Verified live: catalog list (10 of 12 files: symlink and node_modules excluded), categories, sizes, ≈tokens, secret badge, unreadable/empty/too_large rows and previews, long-path middle truncation with full-path title, footer "N files · scanned <t> ago · branch@sha", filter/chips/doc in the URL, no-match state, symlink deep link → "Document not found in main@sha", hostile Markdown inert (0 script elements, javascript: link href="", data: image src removed, `<b>` not rendered, raw HTML shown as text), keyboard Tab focus ring + tooltip on ≈tokens, 29 interactive elements all named, chips `aria-pressed`, `role=status` announces "Scan started"/"Scan finished", Rescan disabled + "Rescanning…", success/failed/recovery rescan, two concurrent rescans → one scan, migration 0016 applied cleanly, lazy first scan, not-cloned state + Resync, empty state with its own Rescan (AC-19), server 404/422 matrix (unknown path, `../`, absolute path, node_modules path, empty path, unknown repo).
- 2026-09-30 manual findings: F6 fixed (page gutter). Not defects of this change, left as-is: (a) Markdown headings render at body size — vendored `Markdown` primitive styles; (b) a neutralised data: image shows a broken-image glyph and a dev-only React `src=""` warning — vendored `Markdown`/react-markdown behaviour; (c) React Query pauses interval polling in a hidden tab (`refetchIntervalInBackground` default) — the UI resumes within ~2 s once the tab is visible; (d) a failed-rescan reason can contain the local clone/origin path (git error text, ≤200 chars) — low risk, local UI only; reported by security-reviewer as LOW, not filed. Not done manually: NFR-6 axe scan (no axe available offline), colour-contrast measurement, screen-reader announcement (only the live-region text was read), truncation banner with >1,000 docs (covered by unit test only).
- 2026-09-30 full checks after F6 — all exit 0 @ fingerprint 0add8508…: server 360 tests, client 178, arch 0 errors.
- 2026-09-30 docs (doc-writer): server/README.md, server/docs/api-contracts.md (created), server/docs/architecture.md, client/README.md, repo-intel/README.md, server/AGENTS.md module list, catalog spec → `implemented` + `## Implementation`, registry row.
- 2026-09-30 /pr-self-review: verdict approve (0 CRITICAL, 0 WARNING, 2 SUGGESTION), gate PASS; 8 CI-form checks exit 0 on the settled tree; report refreshed once after two INSIGHTS.md lines (docs only).
- 2026-09-30 still open (need the user / CI): NFR-1, integration halves of AC-1/4/8/11/12/13/16/24/27, EC-4/9/10, NFR-3/4/8 (T9 not run — needs Docker/CI); NFR-6/C22 manual a11y pass; not-verifiable skill-sourced rows (verifier did not read fastify/drizzle/zod/security/react skills).
- 2026-09-30 wave 1 full checks — all exit 0 @ gate fingerprint 0ad03f0f…:

| Command | Exit | Result |
|---|---|---|
| `./scripts/check-shared-sync.sh` | 0 | pass |
| `pnpm -C server lint` / `typecheck` | 0 / 0 | pass |
| `pnpm -C server arch:check` | 0 | 0 errors, 7 warnings (pre-existing, none in feature files) |
| `pnpm -C server exec vitest run … --exclude '**/*.it.test.ts'` | 0 | 304 passed |
| `pnpm -C client lint` / `typecheck` | 0 / 0 | pass |
| `pnpm -C client exec vitest run` | 0 | 144 passed |

## Review ledger
| F# | Source | Sev | file:line | Summary | Status | Round |
|---|---|---|---|---|---|---|
| F1 | /code-review | WARNING (medium) | server/src/modules/project-context/service.ts:70 | `getCatalog` could overwrite a just-finished `ready` catalog with `scan_interrupted` when a poll's read returned a stale `scanning` row (pool connections answer out of order) | fixed — re-read the state before `markError`; test "does not turn a just-finished scan into scan_interrupted…" (failed before, passes after) | 1 |
| F2 | /code-review (delta) | WARNING | service.ts:207 | repeated `rescan()` while a no-sync scan runs chains extra syncing scans | disputed — the queued callbacks collapse into one sync (the first starts a syncing scan registered in `inFlight`/`syncing`, the rest join it); test "rescans queued behind one no-sync scan run a single sync (AC-16, EC-10)"; user accepted the dispute | 2 |
| F3 | /code-review (delta) | WARNING | service.ts:166 | a live scan older than `STALE_SCAN_MS` is marked `scan_interrupted`, then flips to ready | disputed — by design (plan REC7 + Risks: the age rule exists for a hung `git fetch`; one-instance assumption is in the plan); user accepted the dispute | 2 |
| F4 | /code-review (delta) | SUGGESTION | service.ts:92 | `readDoc` could pair the sha of a new scan with a doc row of the old one | fixed at the user's request — `readDocRow` re-reads once if `scannedSha` moved; test added (failed before) | 2 |
| F5 | /code-review (delta) | SUGGESTION | service.ts:256 | blob read failure indistinguishable from bad-UTF-8 in the scan log | fixed at the user's request — `read_failed` count in the aggregate log (no text); test added (failed before) | 2 |
| F6 | manual | WARNING (visual regression) | client/…/ProjectContextView/ProjectContextView.tsx | page content sat flush against the shell edge (no page gutter, unlike `ConventionsView` `padding: 28px 28px 64px`) | fixed — `s.page` wrapper (maxWidth 1240, same gutter); confirmed by screenshot | manual |
