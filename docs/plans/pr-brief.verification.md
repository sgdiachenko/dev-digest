# Verification Report — PR Brief (final)

- Plan: `docs/plans/pr-brief.md` (current text, with the *Post-implementation UI alignment* addendum and the 2026-10-03 amendments to C23 / S19 / S10) · Spec: `docs/specs/2026-10-02-pr-brief.md` · Run log: `docs/plans/pr-brief.reports.md` (incl. *Phase 4 — manual verification, live*)
- Produced by the `plan-verifier` agent (read-only) in two passes, recorded here by the main session without softening the verdict:
  1. full pass at `gate.sh fingerprint` `f563694d57453e91217f3c45898fab3564bf7a655baf78f1bcf88bf965a84d25`;
  2. delta re-check of AC-108, S10, T8 at `ffc4159badccac4c934fad18c32b0bad711457c26666fc900f1f4cfc28bef8cc` (after a test and wording fix).

## Verdict

**verified with gaps — met: 201, partial: 0, unmet: 0, not-verifiable: 3** (204 rows: 108 AC, 31 EC, 9 NFR, 23 C, 19 S, 14 T).

Three rows are still open. None is an unmet or partial requirement; each needs something this run could not do:

| Open row | Why it is open | What closes it |
|---|---|---|
| **AC-71** | Spec says Review focus entries are "numbered"; the design, the plan addendum and the code are unnumbered. The user decided on 2026-10-03 that the unnumbered design stands. The spec is approved and immutable and is **unchanged**, so the conflict is resolved at plan level only | a `spec-creator` revision of AC-71 (run by hand), or a spec-level waiver by the user |
| **NFR-1** | Recorded live: GET p95 (38th of 40) = 6.8 ms; POSTs 9.9 s and 37.7 s (failure path 17.8 s). Not recorded: the seeded database (the run used the user's dev stack and a 318-file PR), the comparison with `durationMs` in the `brief.completed` log, a live measurement of the ≤ 10 s input-collection bound | rerun the measurements on the seeded DB via `./scripts/dev.sh` and compare with `durationMs` |
| **NFR-6** | Covered: focus lands on the target and is not hidden under sticky headers (live), severity icon + word and `role="status"` (unit). Not done: 320 px / 200 % reflow, ≥ 24×24 target sizes, keyboard-only walk, 4.5:1 contrast, spoken screen-reader pass. The 318-file PR stopped loading in the automation tab, so probing was abandoned | manual pass on a visible tab, ideally on a smaller seeded PR (steps below) |

Housekeeping, not requirements: the unplanned UI files listed below, and one extra manual step from the plan ("both orders"): the Original diff order was not exercised live (AC-90/91 carry no order qualifier, so they stay met).

Evidence handles: `BS` = `server/test/brief-service.test.ts`, `BH` = `brief-helpers.test.ts`, `BP` = `brief-prompt.test.ts`, `IT` = `brief.it.test.ts` (17/17), `CA` = `context-attachments-service.test.ts`, `LR` = `llm-http-retries.test.ts`. Client tests under `client/src/app/repos/[repoId]/pulls/[number]/`: `OT` = `_components/OverviewTab/OverviewTab.test.tsx`, `BHd` = `…/BriefHeader/BriefHeader.test.tsx`, `RA` = `…/RiskAreas/RiskAreas.test.tsx`, `RF` = `…/ReviewFocus/ReviewFocus.test.tsx`, `BM` = `…/BriefMissingInputs/BriefMissingInputs.test.tsx`, `DT` = `_components/DiffTab/DiffTab.test.tsx`, `DV` = `client/src/components/diff-viewer/DiffViewer/DiffViewer.test.tsx`, `FT` = `file-target.test.ts`, `NAV` = `use-pr-file-navigation.test.ts`. "live" = recorded in the run log, Phase 4.

## Traceability matrix

### AC rows
| ID | Item | Verdict | Evidence | Missing |
|---|---|---|---|---|
| AC-1, AC-2 | GET returns the stored record / `null` | met | IT:98; BS:168,180 | — |
| AC-3 | GET makes no LLM/GitHub/git call | met | IT:98; BS:168; `service.ts:182-187` | — |
| AC-4 | 404 on GET and POST for an unknown PR | met | IT:155; BS:213 | — |
| AC-5 | `stale` when head SHA differs | met | IT:252; BS:180 | — |
| AC-6 | unparsable stored brief → `null` | met | BH:300; IT:263 | — |
| AC-7 | exactly one structured call | met | BS:190; IT:98 | — |
| AC-8 | `risk_brief` model or default | met | IT:98,137 | — |
| AC-9 | re-prompt and HTTP retries disabled | met | BS:190; LR:39,46,58; `openai.ts:110-115`, `anthropic.ts:119-124` | — |
| AC-10 | no other LLM call, no intent derivation | met | BS:190 | — |
| AC-11, AC-12, AC-13 | replace stored brief, 200 record, metadata + start SHA | met | IT:98; BS:190,316 | — |
| AC-14, AC-15 | single-flight; joiner gets the same outcome | met | BS:219; IT:199 | — |
| AC-16 | persisted after client disconnect | met | IT:318 (real `req.destroy()`); BS:328 | — |
| AC-17 | 11th POST/min → 429 | met | BS:237; IT:189 | — |
| AC-18 | 0 files → 409 `no_diff_data`, no call | met | BS:248; IT:164 | — |
| AC-19 | no key → 409 `missing_key` + provider | met | BS:256; IT:175; seen in the real UI | — |
| AC-20, AC-21, AC-22 | allowed sections; diff-stat fields; no hunk lines | met | BP:76; BH:42 | — |
| AC-23 | blast section = summary, symbols, callers | met | BH:88,114; BP:76 | — |
| AC-24 | ≤ 8000 `cl100k_base` | met | BP:261,281,301; BS:607 | — |
| AC-25, AC-26 | reduction order; `over_budget` listed | met | BP:176,202,239 | — |
| AC-27, AC-28, AC-29 | caps 4000 / 2000 / 300 + "+N more files" | met | BP:128 | — |
| AC-30 | untrusted text only in the user message | met | BP:95 | — |
| AC-31, AC-32 | intent `not_derived` / `stale` | met | BS:417 | — |
| AC-33, AC-34 | blast error / timeout / degraded | met | BS:427; BH:114 | — |
| AC-35, AC-36, AC-37 | issue failure; no issue silent; empty description | met | BS:511; BP:150 | — |
| AC-38 | specs: agent order, own then skills, dedup | met | CA:436; IT:271; `service.ts:301,324` | — |
| AC-39 | read at catalog SHA, `specs_sha` stored | met | BS:533,566; CA:435 | — |
| AC-40 | whole-document skip | met | BP:158 | — |
| AC-41, AC-42 | `no_catalog` / `not_cloned` / `unavailable` / `none_attached` | met | CA:494; BS:533; IT:271 | — |
| AC-43 | `diff_stats` truncated | met | BS:581; IT:271 | — |
| AC-44 | `specs_used` | met | BP:158; BS:533 | — |
| AC-45, AC-46, AC-47 | 502 `llm_timeout` / `llm_error` / `invalid_output` | met | BS:266-268,287,616,635,649; IT:224; AC-47 also live (POST 3 → 502 `invalid_output`) | — |
| AC-48 | failure leaves the stored brief unchanged | met | BS:269; IT:224; live (POST 3, stored brief intact) | — |
| AC-49, AC-50, AC-51, AC-52 | allow-list; ref removal; risk drop; focus-file drop | met | BH:105,160,228; BS:454,477; BP:217 | — |
| AC-53, AC-54 | snap line / unverified line | met | BH:233,245,250; BS:589 | — |
| AC-55 – AC-59 | dedup; caps; truncation; unknown kind; empty result | met | BH:175,180,195,207,265 | — |
| AC-60 | stored intent/blast equal what was sent | met | BS:442,477; IT:282 | — |
| AC-61 | empty-state card | met | BHd:43; OT:110 | — |
| AC-62 | loading → skeleton, no Generate button | met | OT:219 | — |
| AC-63, AC-64, AC-65, AC-66 | one POST; disabled "Generating…"; skeleton; no reload | met | OT:110; BHd:43,61 | — |
| AC-67, AC-68 | stored brief without POST; summary above the blocks | met | OT:127; live (one GET, no POST after reload) | — |
| AC-69 | Intent left (Risk areas inside), Blast right, Review focus below | met | unit OT:201; live: label above one card, Intent (Risk areas inside) left, Blast right, Review focus card below | viewport width not recorded |
| AC-70 | risk title, severity icon + word, refs | met | RA:27; `RiskItem.tsx:26-32` | — |
| AC-71 | Review focus "numbered" entries | **not-verifiable (plan ↔ spec conflict)** | RF:19 asserts title, `file:line — reason`, order, a `ul`; the code is unnumbered; user decision recorded in the plan; spec unchanged | the "numbered" clause; see *Verdict* |
| AC-72 | "Generated without:" list | met | BM:18; OT:211 | — |
| AC-73, AC-74 | empty messages | met | RA:59; RF:36 | — |
| AC-75, AC-76, AC-77, AC-78 | Regenerate; Outdated; provenance; model hint | met | BHd:43,51; OT:237; live (provenance line seen) | — |
| AC-79, AC-80 | AI label; literal text | met | OT:127,194; RA:27 | — |
| AC-81, AC-82 | failure keeps brief; inline reason + Retry | met | OT:138; BHd:69,76 | — |
| AC-83 | `missing_key` text and two links | met | BHd:87; OT:148; seen in the real UI | — |
| AC-84, AC-85 | 429 text; button enabled | met | BHd:94; OT:157 | — |
| AC-86 | load failure keeps Intent and Blast | met | OT:165 | — |
| AC-87, AC-88 | navigate to Files tab; push history entry | met | RF:19; OT:186; NAV:31; FT:37; live click → `?tab=diff&file=…&line=…` | — |
| AC-89 | expand group and card, both orders | met | DT:245,269; DV:108; live (docs group, >200-line file) | Original order not exercised live |
| AC-90 | target file header visible below sticky headers | met | live: header at y=152–192 of 836 with nothing covering; docs-role header focused at y=181; unit DT:245 | Original order not exercised live |
| AC-91 | target line scrolled into view | met | live: line focused at y=221 of 836; >200-line file (line 150) also at y=221 | Original order not exercised live |
| AC-92 | highlight ≤ 2 s, reduced motion | met | DT:293; DV:132 | — |
| AC-93, AC-94 | focus on line/header; "Line n isn't part of this diff" | met | DT:245,261; DV:108,149,159; live (README.md line 3) | — |
| AC-95 | foreign file → status, tab unchanged | met | NAV:59,66; FT:28; `page.tsx:168-169` | `page.tsx` has no test of its own (plan accepts this) |
| AC-96 | non-PR ref as text | met | RA:44 | — |
| AC-97 | Back returns to Overview | met | NAV:44; live Back → Overview, no query | — |
| AC-98, AC-99 | invalid `line` ignored; applied once | met | FT:8,16; DT:275 | — |
| AC-100, AC-101 | risk expand; risk ref navigates | met | RA:27,44 | — |
| AC-102, AC-103 | verdict banner / none | met | OT:174; helpers test:54 | — |
| AC-104 | strings from `brief.json`, existing keys unchanged | met | `git diff` no removed lines, no `<`; OT:237 | — |
| AC-105 | fix links | met | BM:18; OT:211; `IntentCard.tsx:27` | — |
| AC-106, AC-107 | one log record; no text in logs | met | BS:343,360,382; IT:125 | — |
| AC-108 | path middle-truncated, full path in tooltip and accessible name | met (delta re-check) | `ReviewFocus.test.tsx:36-46` (long path: `title` and accessible name = full path, text contains "…", ends in `:12`); RA:44; helpers test:19; `ReviewFocus.tsx:41-45` | — |

### EC rows
EC-1 … EC-31: **all met**, each with the evidence listed in the full pass — EC-1 (BS:219; IT:199; OT:110), EC-2 (BS:328; IT:318; OT:219), EC-3/EC-4 (IT:252; BS:316), EC-5 (BS:266; OT:138), EC-6 (BS:256; IT:175; OT:148), EC-7 (BS:267; LR:39), EC-8/EC-9 (BH:160,228,233), EC-10 (BH:250; DV:149), EC-11 (DV:103-108; DT:245,269; live docs group and 407-line file), EC-12/EC-13 (BS:417), EC-14 (BS:427), EC-15 (BS:511), EC-16 (BS:248; IT:164), EC-17 (BP:128,176,281), EC-18 (BS:581), EC-19 (BH:180,195,265), EC-20 (BH:207; RA:59; RF:36), EC-21 (BH:300; IT:263), EC-22 (BH:175; RA:27), EC-23 (BS:237; IT:189; OT:157), EC-24 (BS:662), EC-25 (FT:16,28; NAV:66), EC-26 (BP:95; BS:454), EC-27 (OT:194; RA:27), EC-28 (IT:137; BHd:51), EC-29 (BS:311), EC-30 (DT:275), EC-31 (helpers test:54).

### NFR rows
| ID | Verdict | Evidence / Missing |
|---|---|---|
| NFR-1 | **not-verifiable (partly recorded live)** | see *Verdict*; deadline logic BS:616,635,649; `constants.ts:24` |
| NFR-2 | met | BS:190; IT:98; LR:39; BP:281; `MAX_OUTPUT_TOKENS=2000` |
| NFR-3 | met | BP:128,176,239; BH:180,195; BS:237,427,511 |
| NFR-4 | met | BS:219,328; IT:199,224,318 |
| NFR-5 | met | BP:76,95; BH:160,228; OT:194 |
| NFR-6 | **not-verifiable (partly covered)** | see *Verdict* |
| NFR-7 | met | BS:343,360,382; IT:125 |
| NFR-8 | met | `check-shared-sync.sh` exit 0; no migration/lockfile change; additive routes |
| NFR-9 | met | OT:237; `brief.json` additions only |

### C rows
C1 … C23: **all met** — C1 (sync exit 0; `brief-contracts.test.ts:26-44`), C2 (`service.ts:12-64`; `arch:check`), C3 (`container.ts:239-240` `??=`), C4 (`routes.ts:24-37`; IT:155), C5 (`service.ts:193,244,268,281,331-333`; BS:248,256,266-268,607), C6 (BS:343,360,382), C7 (BP:95), C8 (BP:120; BH:250), C9 (no `diff-parser` import), C10 (no `process.env` in the module), C11 (`service.ts:384,413`), C12 (`hooks/brief.ts`), C13 (all new client files ≤ 179 lines; `OverviewTab` 7 props, `DiffTab` 7; `useDiffTarget` effect is a timer only), C14, C15 (no `dangerouslySetInnerHTML`), C16 (`fireEvent`, providers), C17 (no new `useTranslations` in `diff-viewer`), C18 (`useDiffTarget.ts:37,52,58`), C19 (IT 17/17), C20 (no `package.json`/lockfile change), C21 (LR:58), C22 (`page.tsx:89-92`), **C23 (met per the amended plan text; `IntentCard.tsx:27,32`; IntentCard test:54,63,73,81)**.

### S rows
S1 … S19: **all met** — S1 (three byte-identical copies), S2, S3 (`openai.ts:110-115`, `anthropic.ts:119-124`), S4 (`service.ts:301,324`; CA:436-497), S5, S6, S7, S8, S9, S10 (**met after the delta re-check**: plan line 406 and the addendum say unnumbered, `ReviewFocus.tsx:1-2` agrees, a `ul` is rendered), S11 (OT:110-237), S12, S13, S14 (IT 17/17), S15, S16, S17, S18 (`git grep "onOpenFile = \|onOpenFile?:"` → none), **S19 (met per the amended plan text)**.

### T rows
T1 … T14: **all met** — T1 `brief-contracts.test.ts`; T2 `llm-http-retries.test.ts`; T3 CA:436-497; T4 `brief-helpers.test.ts`; T5 `brief-prompt.test.ts`; T6 OT:110-237; T7 helpers test; **T8 met after the delta re-check** (`ReviewFocus.test.tsx` now covers AC-108; AC-71 is tracked in its own row); T9 `brief-service.test.ts`; T10 `brief.it.test.ts` 17/17; T11 FT + NAV; T12 DV:86-160; T13 DT:231-293; T14 IntentCard test:53-81.

## Checks re-run
Fingerprints matched on both passes, so results were reused (all exit 0): server lint, typecheck, arch:check, unit suite (excl. `*.it.test.ts`); client lint, typecheck, vitest (80 files / 420 tests at `ffc4159b…`); mcp-server typecheck + test; `./scripts/check-shared-sync.sh`; `brief.it.test.ts` 17/17 (main-session run; the verifier does not run `*.it.test.ts`).

## Report discrepancies
- The plan addendum (`pr-brief.md`, line ~728) cites `pr-brief.verification.md` for 320 px / 200 % reflow measurements. Those are user-supplied and were **not** independently verified (see the appendix).
- The W5 report does not list the unnumbered presentation under *Deviations*.
- Plan changes since the first pass: C23 and S19 wording, S10 line, the AC-71 user decision, the `ReviewFocus` row. No requirement text was removed.

## Unplanned changes
No plan step names these, and no report *Deviations* entry names them unless noted; the addendum covers some in prose only:
- `client/messages/en/shell.json`; `client/src/components/app-shell/AppShell.tsx`, `AppShell.module.css`; `client/src/vendor/ui/shell/Topbar.tsx` (vendored UI edit: one `aria-label`).
- `pg:_components/PrDetailHeader/{PrDetailHeader.tsx,styles.ts}`, `VerdictBanner/{VerdictBanner.tsx,styles.ts}`, `PriorPrsSection/styles.ts`.
- `pg:_components/BlastRadiusCard/{BlastRadiusCard.tsx,styles.ts,BlastRadiusCard.test.tsx}`, `BlastSymbolGroup/{BlastSymbolGroup.tsx,styles.ts}`.
- `pg:_components/OverviewTab/OverviewTab.module.css` (S11 names `styles.ts` only); `client/src/components/diff-viewer/index.ts` and `target.ts`.
- `server/INSIGHTS.md` (declared in the W2/W4 reports); docs: `docs/homework-pr-brief.md`, `docs/plans/pr-brief.{md,impl.md,reports.md,verification.md}`.

## Out of scope / waived
- `reviews.it.test.ts` (4 tests) and `context-attachments.it.test.ts` (1 test, AC-8 foreign view repo): fail on a clean HEAD too; waived by the user.
- Rate limit taken before the single-flight lookup (`service.ts:193`, finding F1): matches plan steps 2–3; waived by the user.
- Plan out-of-scope items stayed not done: no e2e flow, no `doc-writer` docs, no spec edits, no MCP tool, `history` stays `null`, no auto-generation, no migration.

## Not verifiable (manual steps)
- **AC-71:** resolve at spec level (`spec-creator` revision, or a user waiver).
- **NFR-1:** on the seeded DB via `./scripts/dev.sh`: 40 × GET `/pulls/<id>/brief`, take the 38th sorted value (expect ≤ 0.300 s); three timed POSTs (each ≤ 75 s) compared with `durationMs` in the `brief.completed` log; optionally time input collection (≤ 10 s) with a slow blast or specs.
- **NFR-6** (visible Chrome tab, ideally a smaller seeded PR): keyboard-only walk through Generate, Regenerate, risk expand, risk refs and focus items; target sizes ≥ 24×24 CSS px; 320 px and 200 % zoom reflow to one column; 4.5:1 contrast on brief text; screen-reader announcements for generation start/success/failure and "File not in this PR's diff".
- **Original diff order, live** (plan manual step "both orders"): open `?tab=diff&file=…&line=…` with Original order selected and check header and line positions under the sticky page header.

## Gaps
- No unmet or partial requirement rows.
- `page.tsx` has no test (accepted by the plan); AC-87/AC-95 wiring rests on the hook tests, the page code and the live click.
- Rows tagged `verify: integration` in the spec (AC-31 … AC-35, AC-45 … AC-47) are evidenced by service-level tests per plan T9; `brief.it.test.ts` covers the `truncated`, `not_cloned`, `invalid_output` and `llm_error` branches at DB level.

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
