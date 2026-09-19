# Spec — Conventions Extractor (repo → candidates → skill)

Status: **implemented** (2026-09-18) · Scope: `server/` · `client/` · shared contracts
Related: [`agent-prompts/README.md`](../agent-prompts/README.md) (prompt conventions
this feature follows) — the extractor's output is an ordinary Skill, so there is no
separate "skills.md" in this repo; see the Skills Lab pages themselves.

Scan a cloned repository for the **house rules it already follows**, show each one with
the code that proves it, let a maintainer accept / reject / edit them, and merge the
accepted set into a skill (default name `repo-conventions`) linked to a reviewing agent.

The feature's whole design premise: **a model is good at noticing a pattern and bad at
remembering where it saw it.** So the model only ever proposes; code chooses what it
reads and code verifies what it claims.

```
configs + repo-intel top-12        ONE cheap structured call         re-read the file
+ deterministic config rules                  │                     + ripgrep the repo
        │                                     │                              │
   ┌────▼─────┐   line-numbered   ┌───────────▼──────────┐   candidates ┌────▼──────┐
   │  SAMPLE  ├──────listing─────►│       PROPOSE        ├─────────────►│  VERIFY   ├──► pending rows
   │  (code)  │                   │       (model)        │              │  (code)   │
   └──────────┘                   └──────────────────────┘              └───────────┘
```

---

## 1. Decisions taken

| # | Decision | Consequence |
|---|----------|-------------|
| D1 | Sampling is **100 % code**, never a model call | deterministic cost, reproducible scan; the model cannot browse or choose files |
| D2 | The evidence gate is **code, not a second model** | a candidate whose snippet is not in the cited file is *dropped*, not "low-confidence" |
| D3 | The displayed snippet is **re-read from the file**, not the model's text | the UI cannot show a paraphrase as if it were code |
| D4 | A wrong line number is **corrected**, not fatal | miscounting is a formatting slip; inventing code is not |
| D5 | Triage is a three-state `status`, not a boolean | a re-scan replaces only `pending`, so a rejected rule never comes back |
| D6 | The skill is a **draft** (`POST …/conventions/skill`), persisted only via `POST /skills` | same preview-then-confirm flow as skill import; the user edits everything before it exists |
| D7 | The scan reports `proposed` / `from_config` / `dropped_ungrounded` / `dropped_unsupported` / `dropped_duplicate` / `dropped_existing_skill` / `dropped_category_cap` | a thin result set reads as "the gate worked", not "the feature is broken" |
| D8 | The model comes from `FEATURE_MODELS.conventions` (Settings → Feature Models) | picking a cheap model is a user setting, not a hardcoded constant |
| D9 | The extraction call runs on the job queue; `POST …/extract` returns `202` immediately | the model call can take tens of seconds; the client polls `GET …/conventions/scan` |
| D10 | The default skill name is the literal `repo-conventions` | matches the course grading rubric; still fully editable before save |
| D11 | Create-skill links the new skill to a chosen agent (the additive `POST /agents/:id/skills`) | the grading rubric requires the result be "прилінкований до агента", not merely creatable |
| D12 | Evidence is a clickable `MonoLink` to `github.com/<repo>/blob/<default_branch>/<path>#L<line>` | "click leads to real code" — pins to the current default branch, not the exact commit sampled |

---

## 2. What already existed (do not rebuild)

The starter shipped most of the scaffolding and stopped before the module and the UI.

| Layer | Already there | File |
|-------|---------------|------|
| DB | `conventions` table (rule / evidence / confidence) | `server/src/db/schema/knowledge.ts` |
| Contracts | `ConventionCandidate` | `server/src/vendor/shared/contracts/knowledge.ts` |
| Sampling | `repoIntel.getConventionSamples(repoId, n)` — top-ranked files minus tests/configs/migrations | `server/src/modules/repo-intel/service.ts` |
| Model config | `FEATURE_MODELS` entry `conventions` + `resolveFeatureModel` | `.../contracts/platform.ts`, `modules/settings/feature-models.ts` |
| i18n | most of the `conventions` namespace (page, empty state, card) | `client/messages/en/conventions.json` |
| Routing | `activeKeyFor()` already maps `/conventions` | `client/src/components/app-shell/helpers.ts` |
| Test seam | `MockLLMOptions.structuredBySchema` names this feature's schema | `server/src/adapters/mocks.ts` |

---

## 3. Data model

Two migrations (`0013`, `0014` — split because `drizzle-kit generate`'s rename-detection
prompt can't be answered non-interactively when one diff both adds and removes columns;
see `server/INSIGHTS.md`) extend `conventions` and add `convention_scans`:

| Column (`conventions`) | Why |
|--------|-----|
| `category` | grouping chip + skill section; CHECK-constrained to the 8 contract values |
| `rationale` | one sentence on what a reviewer should flag; editable, nullable |
| `evidence_line` | 1-based, **as verified by code**, not as claimed by the model |
| `status` | `pending` / `accepted` / `rejected`, CHECK-constrained (replaces the old `accepted` boolean) |
| `origin` | `model` (evidence-gated proposal) / `config` (parsed straight out of a config file, confidence fixed at 1.0) |
| `support_count` | distinct repo-wide files matching the rule's probe (frequency grounding); null until that pass runs, always null for `origin: 'config'` |
| `probe` | the sanitized grep pattern, kept so a re-scan can re-count without another model call |
| `scan_id` | which scan produced the row (`ON DELETE SET NULL`) |
| `created_at` | ordering; part of `conventions_repo_created_idx` |

`convention_scans` is new: one row per `POST …/extract` call, holding `status`
(`running`/`done`/`failed`), `sampled_files`, every `dropped_*` counter, `model`,
`cost_usd`, and `error` — the poll target for `GET /repos/:id/conventions/scan`.

`text({ enum })` narrows TypeScript only, so every enum is mirrored into Postgres as a
`CHECK` constraint — the same rule the review pipeline's columns follow.

---

## 4. Contracts

`ConventionCategory`, `ConventionStatus`, `ConventionOrigin`, an extended
`ConventionCandidate`, `ConventionScan` (the poll payload), `ConventionExtractAccepted`
(the 202 body), and `ConventionSkillDraft` (the un-persisted skill). Canonical copy in
`server/src/vendor/shared/`, mirrored to `client/src/vendor/shared/` via
`./scripts/check-shared-sync.sh --fix`.

---

## 5. Server — `src/modules/conventions/`

| File | Holds |
|------|-------|
| `constants.ts` | sample sizes, per-file and whole-sample caps, gate/support thresholds, the job kind |
| `prompt.ts` | `ExtractionSchema` (`schemaName: 'ConventionExtraction'`) + the system/user prompt builders |
| `helpers.ts` | pure: sample rendering, the evidence gate, dedupe, category cap, DTO, skill assembly |
| `config-rules.ts` | pure: deterministic rules parsed from tsconfig/prettier/package.json/eslint (Lever A) |
| `frequency.ts` | pure: probe sanitizer (ReDoS guard) + confidence banding from a real support count (Lever B) |
| `repository.ts` | `conventions` + `convention_scans`; `replacePending` keeps decided rows, `deselectAllAccepted` for the board's bulk action |
| `service.ts` | the three stages, five explicit ports (no `Container` — see `service-takes-ports-not-container`) |
| `routes.ts` | the six endpoints + one-time job-handler registration |

```
GET    /repos/:id/conventions           → candidates for the repo
GET    /repos/:id/conventions/scan      → the latest scan (poll target)
POST   /repos/:id/conventions/extract   → 202, schedules a scan (SAMPLE runs now; PROPOSE+VERIFY on the job queue)
POST   /repos/:id/conventions/deselect-all → every accepted row → pending
POST   /repos/:id/conventions/skill     → skill DRAFT from accepted (writes nothing)
PATCH  /conventions/:id                 → accept / reject / edit
DELETE /conventions/:id                 → drop a candidate
```

### 5.1 Sampling (stage 1, no model, synchronous)

`CONFIG_SAMPLE_PATHS` (package.json, tsconfig, eslint/prettier/editorconfig, biome,
CONTRIBUTING/CLAUDE/AGENTS.md) — missing ones are skipped silently — followed by
`repoIntel.getConventionSamples(repoId, 12)`. Each file is truncated to 220 lines /
12 000 chars, and the whole sample to 90 000 chars. Every file is rendered with a
**1-based line-number gutter**; that gutter is what makes a citation checkable. This
stage runs synchronously in `POST …/extract`, before the job is even created — a repo
with nothing readable 422s with "clone and index it first", before any model call and
before the client has anything to poll.

### 5.2 Proposal (stage 2, the only model call — runs on the job queue)

One `completeStructured` at `temperature 0.1`. Field order is load-bearing (measured on
a live scan: `category` first → 1 of 8 categories used, flat 0.90 confidence;
`category` last, after a self-reported `occurrences` → 5 of 8 categories, 0.50–0.95
spread) — the model commits to a label before it knows what it is about to say, so
anything it must *judge* belongs after everything it must *observe*. The prompt also
lists every rule the deterministic config pass (5.3) already found, so the model's 12
slots go to things code cannot find.

### 5.3 Lever A — deterministic config rules (zero model cost)

Runs alongside the model call, over the same sampled config files. `tsconfig.json`
strictness flags and path aliases, `.prettierrc`/`package.json#prettier` formatting
options, `package.json`'s `type`/`packageManager`/`engines`, and eslint rules (flat
config text-scanned — never evaluated as JavaScript — plus `.eslintrc.json`, both
against a curated ~15-id catalog; unknown ids are skipped as noise) each become a
`confidence: 1.0`, `origin: 'config'` candidate with real file+line evidence.

### 5.4 The evidence gate (stage 3, no model)

`verifyCandidate()` — three checks, all mechanical: the cited path must have been
sampled (exact or unique-suffix match; ambiguity is never guessed), the snippet must be
substantial (≥ 8 non-space chars), and the snippet must really occur in that file
(whitespace/case-insensitive; the hit nearest the claimed line wins). The kept snippet
is sliced **from the file** and dedented.

### 5.5 Lever B — frequency grounding

For every candidate that survives the evidence gate, `codeIndex.grep(ref, probe)`
counts distinct repo-wide files matching the rule's pattern; that count — not the
model's self-report — becomes the persisted confidence (bands at 2/3/5/10+ files;
below 2, dropped as `dropped_unsupported`). The probe is never trusted as a regex
directly: it is length-capped and **always regex-escaped** before it reaches
`CodeIndex.grep` (whose pure-Node fallback runs `new RegExp(pattern)` with no timeout —
an escaped literal is immune to catastrophic backtracking by construction).

### 5.6 Lever C — dedupe + category quota

Sorted strongest-first, candidates are deduped against (a) rules already
`accepted`/`rejected` for this repo (D5 — `dropped_duplicate`) and (b) rule text mined
from the first line of every `## anchor` section in existing `type: 'convention'`
skills (`dropped_existing_skill`). The model's own candidates are then capped at 3 per
category (`dropped_category_cap`) — config rows are never capped, since they are facts,
not guesses.

---

## 6. Client

| Path | What |
|------|------|
| `src/lib/hooks/conventions.ts` | list / scan-poll / extract / update / delete / deselect-all / skill-draft |
| `src/lib/hooks/skills.ts` | `useLinkAgentSkill` — the additive form; `useSetAgentSkills` replaces the whole set |
| `src/app/conventions/page.tsx` + `_components/ConventionsView` | scan button (two labels: "Run Scan" empty-state CTA, "ReScan" once there's a board), scan summary, filter chips + counts, "Deselect all", candidate list |
| `.../_components/ConventionCard` | rule, category, a `MonoLink` evidence deep-link to GitHub, confidence %, "seen in N files", exactly Accept / Reject / Edit (+ a small Delete) |
| `.../_components/CreateSkillModal` | editable name/description/type/enabled/body + a required agent picker; links the skill on save |
| `src/vendor/ui/nav.ts` | `Conventions` under SKILLS LAB (`g c`) — the sanctioned vendor edit |

Repo-scoped via the **active repo** (`useActiveRepo()`, the sidebar repo switcher), like
`/skills` and `/agents` — not a `:repoId` route param. "Create skill" only renders once
at least one candidate is `accepted`; on success the modal closes but the board and its
filters stay on screen (no navigation), so a second skill can be built from whatever
remains.

---

## 7. Testing

| Lane | File | Covers |
|------|------|--------|
| server unit | `test/conventions-helpers.test.ts` (26) | gutter rendering, budget cut-off, every gate outcome, line correction, ambiguous path, dedupe, category cap, skill body, literal `repo-conventions` name |
| server unit | `test/conventions-config-rules.test.ts` (15) | each config parser, unknown eslint id skipped, flat-config text scan (never evaluated), JSONC tolerance |
| server unit | `test/conventions-frequency.test.ts` (8) | probe escaping is unconditional (ReDoS-proof by construction), confidence banding, the `< 2` support drop |
| server integration | `test/conventions.it.test.ts` (7) | job scan drops an invented candidate and re-grounds confidence; re-scan preserves decisions; edit → draft → `POST /skills` links an agent; 422 on an unsampleable repo and on nothing-accepted; a model-call failure marks the scan `failed` without retrying the paid call |
| client unit | `ConventionCard.test.tsx`, `CreateSkillModal.test.tsx`, `ConventionsView/helpers.test.ts` | card interactions (exactly Accept/Reject/Edit), evidence URL construction, modal gating + agent-link submit, filter/count logic |
| e2e | `e2e/specs/09-conventions.flow.json` | the seeded board renders (accepted/config/rejected rows, scan summary, Create-skill visibility) — read-only, no scan click (a real extraction is a paid LLM call) |

---

## 8. Roadmap — how to get more findings, and better ones

Levers A/B/C above (config rules, frequency grounding, dedupe+quota) shipped in v1;
what's left is genuinely future work:

1. **Counter-example search.** Grep for the rule's *violation* too: "holds in 38 files,
   3 break it" both grades the rule and hands the user a ready-made cleanup task —
   Lever B already has the grep machinery.
2. **Sample by diversity, not only by rank.** Today's top-12 are the most central
   files, usually the same layer. Bucket by directory/file-kind and take the top-N per
   bucket for the same token budget.
3. **Include the tests.** `getConventionSamples` filters tests out (right for review
   context, wrong here) — testing conventions are among the most useful and currently
   invisible.
4. **Git history as evidence.** A rule someone has already asked for twice in review is
   the strongest possible candidate — DevDigest's own `findings` table (filtered to
   *accepted*) is a ready-made source of that signal.
5. **Learn from rejections.** Feed rejected rule text into the next scan's prompt as
   "the maintainer already dismissed these", not only as a dedupe key.
6. **Two-step dialogue.** `mocks.ts` already anticipates a `ConventionFileSelection`
   call before `ConventionExtraction`: let the model *rank* a larger code-built
   candidate list down to 12, without ever browsing.
7. **Contradiction check** against existing skills, beyond exact-rule dedupe.
8. **Scan on merge / on a schedule**, diffing against the last scan.
9. **Close the loop through review outcomes** — `SkillStats.accept_pct` already has the
   shape to flag a convention whose skill keeps getting its findings dismissed.
