# Verification Report — PR Brief (final full pass, after user fixes)

- Plan: `docs/plans/pr-brief.md` (current text, including the *Post-implementation UI alignment* addendum) · Spec: `docs/specs/2026-10-02-pr-brief.md` · Run log: `docs/plans/pr-brief.reports.md`
- Date: 2026-10-02 · `gate.sh fingerprint` `6486e2cb4a7c798646186f3ce3d5743e204f58fd620b566cfd8d73d518e260e8` (matches the main session's)
- Produced by the `plan-verifier` agent (read-only); recorded by the main session without softening the verdict. Replaces the earlier pass (fingerprint `10fb678f…`).

## Verdict

**verified with gaps — met: 198, partial: 0, unmet: 0, not-verifiable: 6** (204 rows: 108 AC, 31 EC, 9 NFR, 23 C, 19 S, 14 T).

No requirement row is partial or unmet. "With gaps" comes from the six not-verifiable rows and from the housekeeping items below.

| Open item | Kind | What closes it |
|---|---|---|
| AC-69, AC-90, AC-91, NFR-1, NFR-6 | not-verifiable (manual) | live-browser phase with a provider key (steps in *Not verifiable*) |
| AC-71 | not-verifiable (plan ↔ requirement conflict) | the spec says "numbered"; the plan addendum (S10) says "unnumbered". The user or `spec-creator` must decide; the verifier did not pick a side |
| C23 / S19 text | housekeeping | rated met **only** because the addendum mandates one shared Intent card; the plan clauses "render identical to the current one" were not amended |
| Unplanned UI files | housekeeping | no plan step owns them (list below); accept as a deviation or revert |

All four partials from the previous pass are closed on the actual code: AC-82 (`BriefHeader.test.tsx:76-85`), AC-97 (`use-pr-file-navigation.test.ts:44`), C13 (`DiffTab` now 7 props, `DiffTab.tsx:19-37`), C23/S19 (per addendum, see above).

Evidence handles: `st:` = `server/test/`, `pg:` = `client/src/app/repos/[repoId]/pulls/[number]/`, `OT` = `pg:_components/OverviewTab`; `OT(a)`–`OT(m)` = flows in `OT/OverviewTab.test.tsx` (a=110, b=127, c=138, d=148, e=157, f=165, g=174, h=186, i=194, j=201, k=211, l=219, m=237). `BH` = `OT/_components/BriefHeader/BriefHeader.test.tsx`, `RA` = `RiskAreas.test.tsx`, `RF` = `ReviewFocus.test.tsx`, `BMI` = `BriefMissingInputs.test.tsx`, `HT` = `OT/helpers.test.ts`, `DT` = `pg:_components/DiffTab/DiffTab.test.tsx`, `DV` = `client/src/components/diff-viewer/DiffViewer/DiffViewer.test.tsx`, `NAV` = `pg:use-pr-file-navigation.test.ts`, `FT` = `pg:file-target.test.ts`, `IC` = `pg:_components/IntentCard/IntentCard.test.tsx`, `svc` = `st:brief-service.test.ts`, `it` = `st:brief.it.test.ts`, `help` = `st:brief-helpers.test.ts`, `prompt` = `st:brief-prompt.test.ts`, `ctx` = `st:context-attachments-service.test.ts`, `retry` = `st:llm-http-retries.test.ts`.

## Traceability matrix

### AC rows
| ID | Item | Verdict | Evidence | Missing |
|---|---|---|---|---|
| AC-1, AC-2 | GET returns the stored record / `null` | met | svc:168,180; it:98 | — |
| AC-3 | GET makes no LLM/GitHub/git call | met | svc:168; it:137; `server/src/modules/brief/routes.ts:23-27` | — |
| AC-4 | 404 on GET and POST for an unknown PR | met | svc:168,213; it:155 | — |
| AC-5 | `stale` when SHA differs | met | svc:180,316; it:252 | — |
| AC-6 | unparsable stored brief → `null` | met | help:300; it:263 | — |
| AC-7 | exactly one structured call | met | svc:190; it:98 | — |
| AC-8 | `risk_brief` model or registry default | met | it:98,137 | — |
| AC-9 | no re-prompt, no HTTP retry | met | svc:190; retry:39,46,52,58 | — |
| AC-10 | no other LLM call, no intent derivation | met | svc:190,417 | — |
| AC-11, AC-12, AC-13 | replace stored brief, 200 record, metadata + start SHA | met | it:98; svc:190,316 | — |
| AC-14, AC-15 | single-flight; joiner gets the same outcome | met | svc:219; it:199 | — |
| AC-16 | persisted after client disconnect | met | it:318 (real HTTP `req.destroy()`); svc:328 | — |
| AC-17 | 11th POST/min → 429 | met | svc:237; it:189 | — |
| AC-18 | 0 files → 409 `no_diff_data`, no call | met | svc:248; it:164 | — |
| AC-19 | no key → 409 `missing_key` + provider | met | svc:256; it:175 | — |
| AC-20, AC-21, AC-22 | allowed sections; diff-stat fields; no hunk lines | met | prompt:76 | — |
| AC-23 | blast section = summary, symbols, callers | met | help:89,105; prompt:76,217 | — |
| AC-24 | ≤ 8000 `cl100k_base` | met | prompt:261,281,301 | — |
| AC-25, AC-26 | reduction order; `over_budget` listed | met | prompt:176,202,239 | — |
| AC-27, AC-28, AC-29 | caps 4000 / 2000 / 300 + "+N more files" | met | prompt:128 | — |
| AC-30 | untrusted wrapper, user message only | met | prompt:95 | — |
| AC-31, AC-32 | intent `not_derived` / `stale` | met | svc:417 | — |
| AC-33, AC-34 | blast throw / timeout / degraded reasons | met | it:301-313 (HTTP + real DB); svc:427 | — |
| AC-35 | linked issue → `github_unavailable` | met | svc:511 | — |
| AC-36, AC-37 | no issue → silent; empty description → `description/empty` | met | prompt:150 | — |
| AC-38 | specs: agent order, own then skills, dedup | met | ctx:436,451 | — |
| AC-39 | read at catalog SHA; `specs_sha` stored | met | ctx:436; svc:533,566 | — |
| AC-40 | whole-document skip | met | prompt:158 | — |
| AC-41, AC-42 | `no_catalog` / `not_cloned` / `unavailable` / `none_attached` | met | ctx:487,494,500,505; svc:533; it:271 | — |
| AC-43 | `diff_stats` truncated | met | svc:581; it:271 | — |
| AC-44 | `specs_used` | met | svc:533; prompt:158 | — |
| AC-45, AC-46, AC-47 | 502 `llm_timeout` / `llm_error` / `invalid_output` | met | svc:265,287; `service.ts:244,367,405`; it:224 | — |
| AC-48 | failure leaves the stored brief unchanged | met | it:224; svc:265,287,616 | — |
| AC-49, AC-50, AC-51, AC-52 | allow-list; ref removal; risk drop; focus-file drop | met | help:160,215,228; svc:454,477 | — |
| AC-53, AC-54 | snap line / unverified line | met | help:233,245,250; svc:589 | — |
| AC-55 – AC-59 | dedup; caps; truncation; unknown kind → `other`; empty result stored | met | help:175,180,195,207,265 | — |
| AC-60 | stored intent/blast equal what was sent | met | svc:442,477; it:282; prompt:217 | — |
| AC-61 | empty-state card | met | BH:43; OT(a) | — |
| AC-62 | loading → skeleton, no Generate button | met | OT(l) | — |
| AC-63 | exactly one POST | met | OT(a); BH:43 | — |
| AC-64 | disabled "Generating…" | met | BH:61; OT(a) | — |
| AC-65 | skeleton for Risk areas / Review focus while pending | met | OT(a); `OT/OverviewTab.tsx:99-117` | — |
| AC-66 | success shown without reload | met | OT(a) | — |
| AC-67, AC-68 | stored brief without POST; summary above the blocks | met | OT(b) | — |
| AC-69 | Intent left (Risk areas inside), Blast right, Review focus below | **not-verifiable (manual)** | unit part: OT(j); `OverviewTab.tsx:97-117` | visual layout |
| AC-70 | risk title, severity icon + text, refs | met | RA:27 | — |
| AC-71 | "numbered `file:line — reason`" | **not-verifiable (plan ↔ requirement conflict)** | spec says "numbered"; plan addendum (S10) says "compact unnumbered rows"; code is a bulleted `ul` (`ReviewFocus.tsx:38-58`), RF:19-33 asserts order, `file:line — reason` and the click | user / `spec-creator` must resolve |
| AC-72 | "Generated without:" list | met | BMI:18 | — |
| AC-73, AC-74 | empty messages | met | RA:59; RF:36 | — |
| AC-75, AC-76 | Regenerate; Outdated note | met | BH:51 | — |
| AC-77, AC-78 | provenance, "cost not reported", model hint | met | OT(m); BH:43,51; HT:32,39,48 | — |
| AC-79, AC-80 | AI label; literal text | met | OT(b),(i); RA:27 | — |
| AC-81 | failed generate keeps the previous brief | met | OT(c) | — |
| AC-82 | inline reason + Retry for the four reasons | met (previous partial closed) | BH:69-74; BH:76-85 `it.each` for `llm_error`, `invalid_output`, `no_diff_data` | — |
| AC-83 | `missing_key` text and two settings links | met | BH:87; OT(d) | — |
| AC-84, AC-85 | 429 text; button enabled | met | BH:94; OT(e) | — |
| AC-86 | load failure keeps Intent and Blast visible | met | OT(f) | — |
| AC-87, AC-88 | switch to Files tab; push a history entry | met | NAV:31; FT:37; OT(h) | — |
| AC-89 | expand role group and card, both orders | met | DT:245,269; DV:108 | — |
| AC-90 | scroll under sticky headers | **not-verifiable (manual)** | `useDiffTarget.ts:50-52`; DT:245 asserts `scrollIntoView` called | real scrolling |
| AC-91 | line scrolled into view | **not-verifiable (manual)** | same | same |
| AC-92 | highlight ≤ 2 s, reduced motion | met | DV:119,132; DT:293 | — |
| AC-93, AC-94 | focus on line/header; "Line n isn't part of this diff" | met | DT:245,261; DV:108,149,159 | — |
| AC-95 | foreign file → status, tab unchanged | met | NAV:58,66; FT:28; `page.tsx` `role="status"` | — |
| AC-96 | non-PR ref as text "not in this PR's diff" | met | RA:44 | — |
| AC-97 | Back after the jump shows Overview | met (previous partial closed) | NAV:44 (push, then query restored → `target` null, `tab=overview`); NAV:31; `page.tsx` `tab = search.get("tab") ?? "overview"` | Back is simulated via a mocked query; no page-level test |
| AC-98 | invalid `line` ignored | met | FT:8,16 | — |
| AC-99 | target applied once after data loads | met | DT:275 | — |
| AC-100, AC-101 | risk expand; risk ref navigates | met | RA:27,44 | — |
| AC-102, AC-103 | verdict banner / none | met | OT(g); HT:54 | — |
| AC-104 | strings from `brief.json`, existing keys unchanged | met | `git diff -U0` no removed lines, no `<`; OT(m) | — |
| AC-105 | fix links (`#intent`, Project Context) | met | BMI:18; OT(k); IC:54-80; HT:61 | — |
| AC-106 | one structured record per generation | met | svc:360,382; it:125 | — |
| AC-107 | no text in logs | met | svc:343 | — |
| AC-108 | path middle-truncated, full path in tooltip/name | met | RA:44; RF:19; HT:19 | — |

### EC rows
| ID | Verdict | Evidence |
|---|---|---|
| EC-1 | met | svc:219; it:199; OT(a) |
| EC-2 | met | it:318; OT(b) |
| EC-3, EC-4 | met | it:252; svc:316; BH:51 |
| EC-5 | met | svc:265; it:224; OT(c) |
| EC-6 | met | it:175; OT(d) |
| EC-7 | met | svc:265; retry:39 |
| EC-8, EC-9 | met | help:160,233 |
| EC-10 | met | help:250; DV:149 |
| EC-11 | met | DV:103,108; DT:245,269 |
| EC-12, EC-13 | met | svc:210,417 |
| EC-14 | met | svc:427,454; it:301 |
| EC-15 | met | svc:511 |
| EC-16 | met | svc:248; it:164 |
| EC-17 | met | prompt:281 |
| EC-18 | met | svc:581; it:271 |
| EC-19 | met | help:180,195,265 |
| EC-20 | met | help:207; RA:59; RF:36; OT(j) |
| EC-21 | met | help:300; it:263; OT(a) |
| EC-22 | met | help:175; RA:27 (client shows a severity icon, not a kind-specific icon) |
| EC-23 | met | svc:237; it:189; OT(e) |
| EC-24 | met | svc:662 |
| EC-25 | met | FT:28; NAV:58,66 |
| EC-26 | met | prompt:95; help:160 |
| EC-27 | met | OT(i); RA:27 |
| EC-28 | met | svc:190; it:137 |
| EC-29 | met | svc:311 |
| EC-30 | met | DT:275 |
| EC-31 | met | HT:54 |

### NFR rows
| ID | Verdict | Evidence / Missing |
|---|---|---|
| NFR-1 | **not-verifiable (manual)** | 75 s deadline and "nothing written after it" tested (svc:616,635,649). GET p95 ≤ 300 ms and real generation timings are not asserted by any test and could not be reproduced (no provider key) |
| NFR-2 | met | svc:190; it:98; retry:39-58; `service.ts:344-367` |
| NFR-3 | met | prompt:128,158; help:180,195,265; svc:237,265,427,511,649 |
| NFR-4 | met | svc:219,328; it:199,224,318 |
| NFR-5 | met | prompt:76,95; help:160,215,228; OT(i) |
| NFR-6 | **not-verifiable (manual)** | automated signals only: `role="status"` / `aria-live="polite"` (BH:61), 24×24 targets, severity as icon + text (RA:27). Reflow, contrast, screen reader are manual |
| NFR-7 | met | svc:343,360,382; it:125 |
| NFR-8 | met | check-shared-sync exit 0; no `package.json`/lockfile/migration change; new routes only |
| NFR-9 | met | `brief.json` additions only; OT(m) |

### C rows
| ID | Verdict | Evidence / Missing |
|---|---|---|
| C1 | met | check-shared-sync exit 0; `server/test/brief-contracts.test.ts:26-44` |
| C2 | met | `service.ts:12-64` imports only allowed paths; `arch:check` exit 0 |
| C3 | met | `container.ts:239-240` `briefService()` uses `??=`; `new BriefRepository` at `container.ts:227` |
| C4 | met | `routes.ts:21-37`; 422 at it:155 |
| C5 | met | `service.ts:184,193,244,268,280,331,344,367,405,411`; svc:248,256,265,607 |
| C6 | met | `service.ts:235-253`; svc:343,360,382 |
| C7 | met | `prompt.ts` uses `deps.wrap`; `container.ts:250` passes `wrapUntrusted`; prompt:95,115 |
| C8 | met | `prompt.ts` `BriefModelOutput`; prompt:120 |
| C9 | met | no `diff-parser` import in `modules/brief` |
| C10 | met | no `process.env` in `modules/brief` |
| C11 | met | no migration; `StoredBrief` check before the single `replace` (`service.ts:405-417`) |
| C12 | met | `client/src/lib/hooks/brief.ts` is the only data path |
| C13 | met (previous partial closed) | `DiffTab` 7 props (`DiffTab.tsx:19-37`); `OverviewTab` 7; `BriefHeader` 6; `FileCard` 4; new components ≤ 200 lines (largest `IntentCard.tsx` 175, `FileCard.tsx` 179); `useDiffTarget` effect only for timer cleanup |
| C14 | met | no removed lines or `<` in `brief.json`; `shell.json` additions only |
| C15 | met | no `dangerouslySetInnerHTML` in `client/src/app/repos` or `diff-viewer` |
| C16 | met | `fireEvent` and providers in the new tests |
| C17 | met | no new `useTranslations` in `diff-viewer`; label is the `lineNotInDiffLabel` prop |
| C18 | met | `useDiffTarget.ts:41-58`; `page.tsx` callback-ref `setHeaderEl` |
| C19 | met | `brief.it.test.ts`; 17/17 pass (main session) |
| C20 | met | no `package.json` or lockfile diff |
| C21 | met | retry:58 |
| C22 | met | new routes only; `tab` / `trace` untouched; `file` / `line` optional |
| C23 | met (per addendum; see *Report discrepancies*) | slot optional; `id="intent"` in every state (IC:54-80); IC:81 asserts no slot wrapper. `IntentCard.tsx:16-37` now draws label and content in one `Card`, which differs from the pre-change DOM; the addendum mandates the shared card. The literal "identical to the current one" clause was not amended |

### S rows
| ID | Verdict | Evidence |
|---|---|---|
| S1 | met | three byte-identical copies; `brief-contracts.test.ts:26-44` |
| S2 | met | `brief.json` additions only; `shell.json` is separate (see *Unplanned changes*) |
| S3 | met | retry:35-58; `openai.ts`, `anthropic.ts` |
| S4 | met | ctx:435-510 |
| S5 | met | `constants.ts` (`REDUCE_ORDER`, `RATE_LIMIT`, `REQUEST_DEADLINE_MS = 75_000`, `INPUT_BUDGET_TOKENS = 8000`) |
| S6 | met | `helpers.ts`; help:41-320 |
| S7 | met | `prompt.ts`; prompt:75-312 |
| S8 | met | `hooks/brief.ts` + barrel; OT(c)–(e) |
| S9 | met | `OT/helpers.ts`; HT:19-77 |
| S10 | met (per addendum) | 4 test files + 8 components; Review focus unnumbered per addendum (see AC-71) |
| S11 | met | OT(a)–(m); layout per addendum at `OverviewTab.tsx:60-95` |
| S12 | met | `repository.ts`; it |
| S13 | met | `service.ts`; svc (guards 606-662) |
| S14 | met | `routes.ts`, `modules/index.ts`, `container.ts`; it (17 tests) |
| S15 | met | FT:8-37; NAV:31-66 |
| S16 | met | DV:86-168 |
| S17 | met | DT:231-309; `useDiffTarget.ts` |
| S18 | met | `git grep "onOpenFile = \|onOpenFile?:"` on `OverviewTab.tsx` → none; URL parsing lives in `file-target.ts` |
| S19 | met (per addendum; same note as C23) | `IntentCard.tsx:16-37,41-47`; IC:54-90 |

### T rows
| ID | Verdict | Evidence |
|---|---|---|
| T1 | met | `brief-contracts.test.ts` |
| T2 | met | `llm-http-retries.test.ts` |
| T3 | met | ctx:435-510 |
| T4 | met | `brief-helpers.test.ts` |
| T5 | met | `brief-prompt.test.ts` |
| T6 | met | `OverviewTab.test.tsx` (a)–(m); AC-69 visual part is manual |
| T7 | met | `OT/helpers.test.ts` |
| T8 | met | BH, RA, RF, BMI |
| T9 | met | `brief-service.test.ts` |
| T10 | met | `brief.it.test.ts` 17/17 (main-session run) |
| T11 | met | FT; NAV |
| T12 | met | DV:86-168 |
| T13 | met | DT:231-309 |
| T14 | met | IC:54-90 |

## Checks re-run
Fingerprint matched, so results were reused @ `6486e2cb4a7c798646186f3ce3d5743e204f58fd620b566cfd8d73d518e260e8` (all exit 0): server lint, typecheck, arch:check, unit suite (excl. `*.it.test.ts`); client lint, typecheck, vitest; mcp-server typecheck + test; `./scripts/check-shared-sync.sh`. `brief.it.test.ts` 17/17 (main-session run; not run by the verifier).

## Report discrepancies
Plan change found with `git diff docs/plans/pr-brief.md`: one added section (*Post-implementation UI alignment*); no existing step, constraint or test-plan text was edited.
1. **S10 / S11:** the addendum changes the Brief card and Review focus presentation; numbered → unnumbered conflicts with spec AC-71 (recorded as one not-verifiable row). `ReviewFocus.tsx:1` and the plan's S10 text still say "numbered".
2. **S19 / Q4 / C23:** the addendum supersedes the slot placement (one shared Intent card in every state); C23's "identical to the current one" and S19's "identical … except for the `id` attribute" were not amended. C23/S19 are rated met only because the addendum mandates the shared card. Amend those clauses to remove the contradiction.
3. **NFR-6 follow-up:** the addendum adds scoped contrast tokens (`OverviewTab.module.css`) and an AppShell/PrDetailHeader compact navigation; no step covers these files.
4. **Addendum claims** ("28 focused component tests passed", live Chrome checks) and the follow-up section of the previous `pr-brief.verification.md` ("203 met, 1 partial") could not be verified here and were not counted; those rows stay not-verifiable (manual). The previous file's follow-up content is preserved verbatim in the appendix below.
5. `pr-brief.reports.md` has no entry for the post-implementation UI edits.

## Unplanned changes
No plan step names these and no report deviation lists them; the addendum mentions some in prose only.
- `client/src/components/app-shell/AppShell.tsx`, `AppShell.module.css` (new) — mobile navigation button and scrim (NFR-6 follow-up).
- `client/messages/en/shell.json` — new `navigation.open` / `navigation.close` keys (the plan owns only `brief.json`).
- `client/src/vendor/ui/shell/Topbar.tsx` — one added `aria-label`; edits vendored UI, which `client/AGENTS.md` says to compose rather than patch.
- `pg:_components/PrDetailHeader/PrDetailHeader.tsx`, `styles.ts` — reflow changes.
- `pg:_components/PriorPrsSection/styles.ts` — style edit, mentioned nowhere.
- `pg:_components/BlastRadiusCard/{BlastRadiusCard.tsx,styles.ts,BlastRadiusCard.test.tsx}`, `pg:_components/BlastSymbolGroup/{BlastSymbolGroup.tsx,styles.ts}` — heading and Tree/Graph switch inside the card, `initiallyOpen`, path wrapping.
- `pg:_components/VerdictBanner/{VerdictBanner.tsx,styles.ts}` — `embedded` variant.
- `pg:_components/OverviewTab/OverviewTab.module.css` — new file (the plan lists `styles.ts`).
- `client/src/components/diff-viewer/target.ts` — `DiffTarget` type (inside W6's `diff-viewer/**`, not named in S16).
- `server/INSIGHTS.md` — lines appended by implementers (declared in the reports).
- `docs/homework-pr-brief.md`, `docs/plans/pr-brief.{md,impl.md,reports.md,verification.md}` — process documents.

## Out of scope / waived
- `reviews.it.test.ts` (4 tests) and `context-attachments.it.test.ts` (1 test): fail on a clean HEAD too; waived by the user.
- Rate limit taken before the single-flight lookup (`service.ts:193`, finding F1): matches plan steps 2–3; waived by the user.
- Plan out-of-scope items stayed not done: no e2e flow, no `doc-writer` docs, no spec edits, no MCP tool, `history` stays `null`, no auto-generation, no migration.

## Not verifiable (manual steps)
The live-LLM manual phase has not been performed (no provider key was available to the run).
- **AC-69:** on a PR with a stored brief, confirm Intent and Risk areas share the left card, Blast radius is the right column, Review focus spans below.
- **AC-90, AC-91:** click Review-focus items for a file in the collapsed `docs` group and a file over 200 changed lines, in Smart and Original order. File header and line must be fully visible below `PrDetailHeader` and the sticky `RoleGroup` header. Back must return to Overview.
- **AC-71:** resolve the "numbered" (spec) vs "unnumbered" (plan addendum) conflict.
- **NFR-1:** 40 × `curl -w '%{time_total}'` GETs on `/pulls/<id>/brief`, take the 38th sorted value (expect ≤ 0.300); three timed POSTs (each ≤ 75 s) compared with `durationMs` in the `brief.completed` log (needs a provider key).
- **NFR-6:** keyboard pass; spoken screen-reader pass (generation start/success/failure and "File not in this PR's diff"); 320 px / 200 % reflow; 4.5:1 contrast.

## Gaps
- No unmet or partial requirement rows.
- Open housekeeping: C23/S19 text vs the addendum; the AC-71 conflict; the unplanned UI files; the vendored `Topbar.tsx` edit.

---

## Appendix — user-supplied follow-up (not independently verified by `plan-verifier`)
The text below is the follow-up section of the previous version of this file, preserved verbatim. The verifier did not reproduce these live checks, so none of it is counted in the verdict above.

## Follow-up verification — 2026-10-02

The verdict and matrix below preserve the verifier's original snapshot. The following checks were completed against the updated working tree after that snapshot. **Current status: 203 met, 1 partial (NFR-6), 0 unmet** against the plan with its post-implementation UI addendum. The original fingerprint no longer describes this tree.

### NFR-6 remediation follow-up

- **Reflow:** the live PR #5 Overview was inspected in Chrome at a 320 CSS px viewport and at actual 200% browser zoom. The app shell now provides a keyboard-operable compact navigation button, while the PR heading, actions, brief, Intent/Risk areas, Blast radius, and Review focus fit in a single content column. At 200%, the first check exposed a sidebar that still consumed much of the viewport; moving the compact-shell breakpoint to 960 CSS px fixed it. The nav opens and closes with the button; Escape closes it and returns focus to the button. The tabs remain usable through horizontal scrolling.
- **Contrast:** the old muted-text tokens measured 3.15:1 on the dark elevated card and 3.43:1 on the light elevated card. The PR Brief now uses scoped foreground tokens: muted text measures 5.98:1 on dark `#1c1c1c` and 5.68:1 on white. Its warning, success, and critical text tokens were also adjusted for both themes; the lowest measured foreground-on-card ratio is above 4.5:1. The Blast radius endpoint labels use the higher-contrast accent text token.
- **Focus and targets:** the Intent section no longer suppresses its focus outline; the live file jump lands below the sticky page and file headers. Component checks cover keyboard activation, status semantics, and 24 × 24 CSS px targets.
- **Still open:** the spec calls for a manual screen-reader pass, including spoken generation and foreign-file status messages. NFR-6 therefore remains partial until that check is completed.

| Original gap | Follow-up result |
|---|---|
| AC-82 | Closed: `BriefHeader.test.tsx` now checks the messages and Retry actions for `llm_error`, `invalid_output`, and `no_diff_data`, in addition to `llm_timeout` (10 tests pass). |
| AC-97 | Closed: the navigation test simulates Back restoring the Overview query, and Safari Back on local PR #5 returned from the file target to Overview. |
| C13 | Closed: the unused `filesCount` prop was removed; `DiffTab` has 7 props. Client typecheck passes. |
| C23 / S19 | Closed against the amended plan: the user-requested mockup alignment is recorded in `pr-brief.md` under *Post-implementation UI alignment*. The shared Intent card and optional Risk areas slot are now the specified presentation. The original “identical without children” wording is superseded by that addendum. |
| AC-71 / S10 presentation | The original spec says “numbered”; the user-requested mockup shows compact unnumbered entries. The plan addendum supersedes the numbered presentation. File order, `file:line — reason`, and navigation are preserved. This is an explicit design deviation from the original spec, rather than evidence that the original wording still holds. |
| Unplanned UI edits | Accounted for by the same plan addendum and the user's explicit request to fix the layout. The original report's claim that these were presumably concurrent user edits is superseded. |
| AC-33 / AC-34 | Closed: `brief.it.test.ts` now exercises throw, timeout, and degraded repo-intel outcomes through the HTTP route and real PostgreSQL; each stores a brief with `blast: null` and the correct missing reason. |
| AC-106 / NFR-7 | Closed: a DB-backed integration test captures and asserts exactly one structured `brief.completed` record. The existing service tests cover failure records and absence of content. All 17 PR Brief integration tests pass. |
| AC-69 | Closed by visual inspection of populated local PR #5: Intent and Risk areas share the left card, Blast radius is the right card, and Review focus spans beneath them. |
| AC-90 / AC-91 | Closed: a live Review-focus jump to line 50 in a 193-addition file showed both the sticky file header and highlighted line below the page and role headers. The first live check exposed a missing file header; `FileCard` and `useDiffTarget` were fixed, then checked again. Unit tests cover collapsed Docs and Original order. |
| NFR-1 | Closed for the specified response limits on local PR #5: 40 GETs returned 200, p95 **10.1 ms** (max 17.4 ms); four valid JSON POSTs completed or failed in **17.09, 28.6, 18.36, 54.8 s**, all below 75 s. One POST succeeded; two returned 502; the diagnostic fourth returned 502 `invalid_output`. The service deadline tests cover late writes. This measures latency, not model-output reliability. |
| NFR-6 | **Still partial:** keyboard/status semantics and ≥24 px targets have component evidence; the live jump confirmed target visibility and focus behavior. A complete screen-reader pass, 320 CSS px / 200% zoom reflow, and measured 4.5:1 contrast were not completed. |

Follow-up checks: client `pnpm typecheck` and 24 targeted tests pass; server `pnpm typecheck` and `pnpm exec vitest run test/brief.it.test.ts` pass (17/17, Docker/Testcontainers). The measured GET/POST requests used the running local API; no key was read or printed.
