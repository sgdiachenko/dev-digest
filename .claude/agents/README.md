# Agents

Claude Code subagents for working **on** this repo. Each `<name>.md` here is
the canonical definition (frontmatter + system prompt); this file is only a
map of the set — read the agent file for the actual rules.

> Not to be confused with the app's own reviewer agents (General, Security,
> API Contract, …): those live in the database and are documented in
> [`docs/agent-prompts/`](../../docs/agent-prompts/README.md).

## Flow

```
user ─► spec-creator (analyze) ─► design gaps + EC# + MC# + UX# + RQ# + Q#
          ─► researcher × N in parallel (one per RQ#, when any) ─► spec-creator (analyze again, only if research raised new items)
          ─► user answers Q#
     ─► spec-creator (write) ─► docs/specs/<YYYY-MM-DD>-<slug>.md (draft) ─► user approves ─► spec-creator (approve)
     ─► researcher (when evidence is needed)
     ─► brainstorm (optional: ≥2 plausible approaches) ─► Options Comparison ─► user picks O#
     ─► implementation-planner (pass 1) ─► SC# + REC# + execution mode ─► user answers
     ─► implementation-planner (pass 2) ─► Implementation Plan ─► user approves
   ── /run-plan <plan> from here on (spec-creator and implementation-planner run by hand) ──
     ─► implementer ─► code + Implementation Report (incl. the plan's T# tests)
          (multi-agent: one implementer per work package W#, in parallel per DAG wave;
           single-agent: one implementer, linear S1..Sn)
     ─► plan-verifier ─► Verification Report   (unmet → fix, re-verify those rows)
     ─► architecture-reviewer ∥ security-reviewer ∥ /code-review (correctness bugs) ─► findings
     ─► review-fix loop (ledger F#, fix, delta re-review; ≤3 rounds)
     ─► doc-writer (when the feature needs docs) ─► Documentation Report
     ─► /pr-self-review ─► gh pr create
```

`spec-creator` runs first for a new feature (Spec-Driven Development) and
may be skipped for bug fixes or small changes. It always runs in two passes:
`analyze` reads the request, the designs the user supplied and the affected
modules, and returns — writing nothing — design gaps, edge cases `EC#`,
module-communication points `MC#`, UX proposals `UX#`, research requests
`RQ#` and questions `Q#`. The main session passes the design **file paths**
(an image pasted in chat shows `[Image: source: <path>]`), never a description
alone. It runs one `researcher` per `RQ#`
in parallel (each `RQ#` is independent by construction), passes the reports
back as `Research:`, asks the user (`AskUserQuestion`) and re-invokes it
with `Mode: write` and `Answers:`. It reads `AGENTS.md`/`INSIGHTS.md` only
of the packages the feature touches, and registers every spec in
`docs/specs/README.md`. The result is `docs/specs/<YYYY-MM-DD>-<slug>.md`
(`Status: draft`, EARS acceptance criteria). `revise` edits a draft;
`approve` flips it to `approved` only on the user's explicit word. An
approved spec is never rewritten — a changed decision is a new spec with
`Supersedes:`. The approved spec is the task description handed to
`implementation-planner`, whose steps carry `covers: AC-n`;
`plan-verifier` then uses the spec's `AC`/`EC`/`NFR` IDs as its requirement
rows (a test asserting the behaviour, not a step's `done:` claim, is the
evidence). After
verification `doc-writer` only **appends** to it (`Status: implemented` +
an `## Implementation` section linking plan/docs/tests per AC) — it never
edits the requirements, so the spec stays the yardstick the code was
checked against. These dated spec files are *requirements written
before the code*; they are distinct from `doc-writer`'s specs (behavioural
guarantees / design records written after verification). Its write scope —
`docs/specs/<YYYY-MM-DD>-*.md` only — is a prompt rule (no hooks), like the
implementer's Bash limits.

`spec-creator` and `implementation-planner` are run by hand. From an
approved plan, `/run-plan` ([../skills/run-plan/SKILL.md](../skills/run-plan/SKILL.md))
runs the rest from the main session — waves of implementers, verification,
the review-fix loop, docs and the PR gate — keeping its state in
`docs/plans/<slug>.impl.md` so it can resume in a fresh chat. `test-writer`
is not part of `/run-plan` (token budget): the implementer writes the plan's
`T#` tests; `test-writer` stays available on demand for coverage gaps.
`architecture-reviewer` checks layering only; correctness bugs are
`/code-review`'s, which runs alongside it.

`brainstorm` is optional, the same way `test-writer` and `doc-writer` are: the
main session runs it only when a task has ≥2 plausible implementation
approaches, and skips it — straight to `implementation-planner` — when one approach is
already obvious. `implementation-planner` then plans **only** the option the user picked, not
a re-evaluation of the comparison. `plan-verifier` runs after all tests are written
(the implementer's, and `test-writer`'s when it is used) so they count as
evidence in the traceability matrix; `doc-writer` runs
before `/pr-self-review` so any docs it writes are inside the gated
fingerprint. `architecture-reviewer` and `security-reviewer` are both
read-only and independent of each other, so the main session can run them in
parallel; the security phase-2 false-positive filter (see
`docs/plans/agent-token-optimization.md`) runs only when `security-reviewer`
actually returns `CRITICAL`/`WARNING` findings.

The main session orchestrates: no agent here can spawn another (`Agent` is
not in any tool list), and a subagent cannot ask the user questions — each
one returns a *clarifying questions* / *blocked* block instead of guessing.
Plan step IDs (`S1..Sn`) are shared by the plan, the report and the review
handoff, so a reviewer can check the diff against the plan.

`implementation-planner` plans implementation only — it never writes or plans
specifications (no spec sections, no step touching a `specs/` path;
requirements specs are `spec-creator`'s, post-implementation specs
`doc-writer`'s, e2e flow files `test-writer`'s). It always runs in two
passes: pass 1 takes the approved spec as given and returns spec conflicts `SC#`
(sent back to `spec-creator`, not asked of the user), implementation
recommendations `REC#` and the **execution-mode question**; the main session
asks the user (`AskUserQuestion`) and re-invokes it with `Mode:` and the
accepted/rejected `REC#`; pass 2 returns the plan. Modes:

- **multi-agent (parallel)** — default for non-trivial work. Steps are
  grouped into work packages `W1..Wn` with non-overlapping `owns:` paths,
  ordered as a DAG with contracts first; the main session starts one
  `implementer` per package, all packages of a wave in parallel, the next
  wave after the previous one is done.
- **single-agent (one pass)** — default for small or tightly coupled
  changes. One linear `S1..Sn`, one `implementer`.

The chosen mode is recorded in the plan's *Execution mode* field; the main
session writes the approved plan to `docs/plans/<feature>.md`.

### Orchestration practices (main session, not an agent's own rule)

These aren't a subagent's frontmatter — they're how the main session should
drive the flow above. Confirmed on a measured feature; see
[docs/plans/agent-token-optimization.md](../../docs/plans/agent-token-optimization.md)
§5 for the numbers behind each one.

- **Don't reopen `implementer` for a small, local fix.** A handful of gaps
  from `plan-verifier`/`architecture-reviewer`/`pr-self-review` (a few files,
  no new architecture) are cheaper fixed directly in the main session — Edit
  the file, re-run only the affected package's checks — than a new
  `implementer` call, and far cheaper than resuming one with a large
  inherited context (§5.2: this is the single biggest cost driver measured
  so far). Reserve a fresh `implementer` call for a genuinely new or
  multi-file round of work.
- **Verify a forked agent actually ran before trusting its report.** A
  `fork` can return having done nothing — a same-turn acknowledgment with
  zero tool calls, not a queued background job — while still costing the
  full price of its inherited context. Check the completion notification's
  `tool_uses` against the size of the task you gave it; if it's implausibly
  low (e.g. `0` for a multi-step task), resume the same agent with an
  explicit instruction to execute now, synchronously, rather than accepting
  the response (§5.3.1).
- **A large `researcher` report going into `implementation-planner` doesn't have to be
  pasted in full.** `researcher` stays strictly read-only (no Write/Edit —
  that guarantee doesn't change), so it cannot write its own findings to a
  file; instead, the main session saves the returned report to
  `docs/plans/<feature>.context.md` and passes `implementation-planner` that path plus a
  one-line pointer, instead of the whole report text, when the report is
  long (§2.3.1/§2.1 of the optimization doc).
- **`brainstorm`'s report follows the same context-pack pattern.** It is
  read-only too, so the main session saves its returned report to
  `docs/plans/<feature>.options.md` and passes `implementation-planner` that path plus the
  `O#` the user picked — `implementation-planner` then plans only that option. Skip
  `brainstorm` entirely when the approach is already obvious (a bug fix, a
  small change, a task with one clear implementation) — it is priced like
  `implementation-planner` (`opus`, full read of the repo) and only pays for itself when
  there really are competing approaches to weigh.
- **For a plan step that measures or times a DOM node** (sticky headers,
  portals, anything reading `ref.current`/`getBoundingClientRect` across a
  conditional render), open the app in a browser and check the *live*
  behavior — scroll, resize, watch `getComputedStyle` — before `doc-writer`
  runs, not after. `plan-verifier`, `architecture-reviewer` and
  `security-reviewer` are all static: none of them can catch a React ref/effect-timing
  bug that only shows up once the component tree actually mounts and
  re-renders, and one such bug shipped past every one of them in the session
  that produced §5.3.3.

## Catalog

| Agent | Responsibility | Model | Tools / permissions | Input | Output |
|---|---|---|---|---|---|
| [spec-creator](spec-creator.md) | Writes the SDD specification before any planning: analyzes the request, the user's designs and the affected modules for design gaps, edge cases, module communication, NFRs and UX improvements; hands research requests to `researcher`; asks the user; then writes a dated spec `<YYYY-MM-DD>-<slug>.md` (EARS ACs with priority + `verify:`, NFRs, UI state matrix, rollout, traceability) and registers it. No implementation details | `opus` | Read, Grep, Glob, read-only Bash, Write, Edit — **writes only `docs/specs/<YYYY-MM-DD>-*.md` + `docs/specs/README.md`** (prompt rule). No Skill/Agent/Web | `Mode:` analyze / write / revise / approve; request; designs (file paths, pasted text); `Research:`; `Answers:`; `Spec:` | Analyze: **Spec analysis** (understanding, boundaries + INSIGHTS read, UI state matrix, `D-GAP#`, `EC#`, `MC#`, `UX#`, untrusted inputs, NFR needs, `RQ#`, `Q#`). Write/revise/approve: the spec file + registry row + **Spec report** (counts, verify mix, decisions applied, open questions, final self-check, handoff) |
| [researcher](researcher.md) | Answers a concrete question with evidence from the repo (code, docs, git history) and/or external sources | `sonnet` | Read, Grep, Glob, read-only Bash, WebSearch, WebFetch. No Write/Edit/Skill | A concrete question + scope (repo / external / both) | *Repo research* or *External research* report: TL;DR, conclusions with confidence, evidence (`path:line` / URLs), sources, **Not found / gaps** |
| [brainstorm](brainstorm.md) | Optional, between researcher and implementation-planner: states decision drivers, then compares 2-3 plausible implementation options plus a "do nothing" baseline against them. Never picks for the user | `opus` | Read, Grep, Glob, read-only Bash; `permissionMode: plan`. No Write/Edit/Skill/Agent/Web | Task description (goal, scope, done criterion) + optional `docs/plans/<feature>.context.md` | **Options Comparison**: problem & scope, decision drivers, baseline, options (axis, per-driver verdict, strongest objection, effort, reversibility), comparison matrix, recommendation, why not the others, decision needed, risks, gaps — or *Clarifying questions* |
| [implementation-planner](implementation-planner.md) | Takes the approved spec as given (no requirements review; spec conflicts go back to spec-creator), recommends implementation improvements, asks the execution mode (multi-agent parallel vs single-agent), then turns the request into a structured Implementation Plan that respects modules, INSIGHTS, skills and architecture constraints. Plans implementation only — never specifications. Does not review | `opus` | Read, Grep, Glob, read-only Bash; `permissionMode: plan`. No Write/Edit/Skill/Agent/Web | Pass 1: task description; optionally a researcher report / brainstorm pick. Pass 2: the same + `Mode:`, `Answers:`, accepted/rejected `REC#` | Pass 1: **Requirements review** + `Q#` + `REC#` + execution-mode question. Pass 2: **Implementation Plan**: goal & scope, requirements decisions, execution mode, work packages `W#` with `owns:` (multi-agent), context, affected modules, constraints (with sources), steps `S1..Sn` (files, skills, reuse, done-when, depends-on), test plan, risks, review handoff, gaps |
| [implementer](implementer.md) | Executes an approved plan in `server/`, `client/`, `reviewer-core/`, `e2e/`; writes tests; runs the touched packages' CI checks. No review, commits or PRs | `sonnet` | Read, Edit, Write, Grep, Glob, Bash; `permissionMode: acceptEdits`. No Skill/Agent/Web | The approved Implementation Plan, inline or as a path (`docs/plans/<feature>.md`) (+ the `W#` it owns in multi-agent mode) | Code changes (+ at most one `INSIGHTS.md` line) and an **Implementation Report**: status, per-step result, files changed, skills applied, checks with exit codes, deviations, reviewer handoff — or *blocked* |
| [test-writer](test-writer.md) | Adds or extends automated tests for a given target — a plan/report or a named feature/bug — across `server/`, `client/`, `reviewer-core/`, `e2e/`. Confirms each test fails for the right reason. Edits test files only, never product code | `sonnet` | Read, Edit, Write, Grep, Glob, Bash; `permissionMode: acceptEdits`. No Skill/Agent/Web | A plan + Implementation Report, or files/feature + behaviour to cover + packages | **Test Report**: status, tests added/changed, right-reason evidence per test, checks with exit codes, not-run (`.it`/e2e), skills applied, convention overrides, INSIGHTS updated, open issues — or *blocked* |
| [plan-verifier](plan-verifier.md) | Traceability check of finished work (writes only its own report file) against the approved plan and the original requirements — every requirement, `C#`, `S#` done-when and Test-plan item gets a verdict with evidence. Flags unplanned changes. Does not re-judge the plan | `sonnet` | Read, Grep, Glob, read-only Bash, Write for `docs/plans/<slug>.verification.md` only. No Edit/Skill/Agent/Web | The plan, the Implementation Report(s) and the requirements/spec — inline or as paths | **Verification Report** written to `docs/plans/<slug>.verification.md` (overall verdict + counts, traceability matrix, skill sources read, checks re-run, report discrepancies, unplanned changes, not-verifiable items); the reply is only the verdict, the open rows and the path — or *Clarifying questions* |
| [architecture-reviewer](architecture-reviewer.md) | Read-only review of onion-ring direction and ports/DI (`server/`, `reviewer-core/`) and layer direction/placement (`client/`) on the diff. Findings in the `pr-self-review` finding shape | `sonnet` (user decision 2026-09-29, cost; the mechanical checks `arch:check`/lint carry most of the signal) | Read, Grep, Glob, read-only Bash. No Write/Edit/Skill/Agent/Web | A base ref or "all open changes"; optionally the plan's Review handoff + Implementation Report | **Architecture Review**: scope, mechanical checks with exit codes, findings (JSON, `report.md` shape), verdict, config-vs-skill-doc drift, gaps |
| [security-reviewer](security-reviewer.md) | Read-only security review of a diff (`server/`, `client/`, `reviewer-core/`): traces attacker-controlled input to sinks (routes, SQL, process spawns, filesystem paths, tokens/secrets, LLM prompt input, HTML) and reports confidence-gated findings in the `pr-self-review` finding shape | `sonnet` | Read, Grep, Glob, Bash (`maxTurns: 48`). No Write/Edit/Skill/Agent/Web | A base ref or "all open changes"; optionally the plan's Review handoff + Implementation Report | **Security Review**: scope, mechanical checks with exit codes, findings (JSON, `report.md` shape + `confidence`), verdict, phase-2 handoff, checked-nothing-found, gaps |
| [stack-reviewer](stack-reviewer.md) | Read-only review of a diff against stack idioms (Fastify 5, Drizzle/Postgres, Next.js 15, React, Zod, TypeScript, RTL) in `server/`, `client/`, `reviewer-core/`, `mcp-server/`, `e2e/`. Maps files to `routing.md` lanes and reads the lane's `SKILL.md` on demand. Onion/placement, security and correctness stay with other reviewers. On demand, not in `/run-plan` | `sonnet` | Read, Grep, Glob, read-only Bash (package `typecheck`/`lint` only). No Write/Edit/Skill/Agent/Web | A base ref or "all open changes"; optionally an Implementation Report | **Stack Review**: scope, mechanical checks with exit codes, findings (JSON, `report.md` shape; `WARNING` at most for skills without their own scale), verdict, skill sources read, gaps |
| [conventions-reviewer](conventions-reviewer.md) | Read-only review of a diff against the naming and structure rules of the root `AGENTS.md` "Naming conventions" (R1-R7: DB columns, wire fields, Zod names/values, component layout, route segments, auto-named migrations). Deterministic checks first (one allowed `git diff \| grep` pipe). Not the in-app Conventions Extractor. On demand, not in `/run-plan` | `sonnet` | Read, Grep, Glob, read-only Bash. No Write/Edit/Skill/Agent/Web | A base ref or "all open changes" | **Conventions Review**: scope, deterministic checks, findings (JSON, `WARNING` at most, each citing an `AGENTS.md` line), verdict, gaps |
| [doc-writer](doc-writer.md) | Documents already-implemented, already-verified work as repo Markdown + Mermaid diagrams, routed to the right `docs/`/`specs/`/`README.md`/`AGENTS.md` location, with its indexes updated. Edits Markdown only | `sonnet` | Read, Edit, Write, Grep, Glob, Bash; `permissionMode: acceptEdits`. No Skill/Agent/Web | Source material (plan/report/memo/code) + feature name + packages | **Documentation Report**: files written, diagrams, indexes updated, claims → evidence, link check, open issues — or *Clarifying questions* |

**implementer ↔ test-writer split**: the implementer writes the tests each
plan step's `done-when` requires, as part of executing that step — it is not
optional there. `test-writer` is a separate pass on demand: it adds coverage
for a gap or a regression after the fact, touches test files only, and never
modifies product code (not even the mocks the implementer would have
touched).

### Implementation skills (implementation-planner preloads, implementer reads per step)

`implementation-planner` preloads all **16** engineering skills via
`skills:`:

`engineering-insights` · `onion-architecture` · `fastify-best-practices` ·
`drizzle-orm-patterns` · `postgresql-table-design` · `next-best-practices` ·
`react-best-practices` · `frontend-architecture` · `react-testing-library` ·
`zod` · `typescript-expert` · `response-schema` · `breaking-change` ·
`deprecation-policy` · `semver-discipline` · `security`

Together their `SKILL.md` bodies are ~154 KB (~38–40k tokens). The planner
runs once, so it pays that once. `implementer` preloads only
`engineering-insights` and Reads, per step, the skills the step's `skills:`
field names plus the file's lane skills — a server-only work package never
loads the React/Next/RTL skills and vice versa. Before this change every
parallel implementer paid the full ~40k before its first edit. The plan's
`C#` Constraints carry the binding rules, so the SKILL.md is only for detail.

Left out on purpose: `mermaid-diagram` (used only by `doc-writer`) and
`pr-self-review` (not an implementation practice). The Skill tool is disabled
in both agents.

Which skill applies to which file is decided by
[`routing.md`](../skills/pr-self-review/routing.md), the same table
`/pr-self-review` uses.

### Role-scoped skills (spec-creator, brainstorm, test-writer, architecture-reviewer, security-reviewer, stack-reviewer, conventions-reviewer, plan-verifier, doc-writer)

Each of the other agents preloads a smaller, role-scoped list; every skill
on a list is justified here.

| Agent | Skill | Why it's preloaded |
|---|---|---|
| spec-creator | `ears-requirements` | the format and self-check of every `US`/`AC`/`EC`/`NFR` line, verify hints, traceability matrix |
| spec-creator | `ux-design-review` | analyzing the user's designs: UI state matrix, interaction risks, WCAG 2.2 AA, microcopy → `D-GAP#`/`UX#`/`Q#` |
| spec-creator | `mermaid-diagram` | the spec's *Workflow and module communication* section is Mermaid |
| spec-creator | `security` | *Untrusted inputs* is a mandatory spec section; OWASP categories turn "PR content / LLM output / user input" into concrete handling requirements |
| spec-creator | `engineering-insights` | reads `INSIGHTS.md` gotchas that constrain requirements (read-only — it never appends). `breaking-change` / `response-schema` / `deprecation-policy` are Read on demand, only when the spec changes an existing contract; no implementation skills — it plans nothing |
| brainstorm | `engineering-insights` | reads `INSIGHTS.md` as context for its decision drivers (read-only — same as `architecture-reviewer`) |
| brainstorm | `onion-architecture` | the most common axis between options in `server/`/`reviewer-core/` is "extend an existing ring/port" vs. "add a new module" |
| brainstorm | `frontend-architecture` | the most common axis between options in `client/` is where a piece lands and which direction it depends |
| test-writer | `react-testing-library` | client component/hook test patterns |
| test-writer | `fastify-best-practices` | `app.inject`-based server test patterns |
| test-writer | `onion-architecture` | knows which ring a test double belongs to, to flag a missing port instead of adding one |
| test-writer | `frontend-architecture` | where a new `*.test.tsx` belongs relative to its component |
| test-writer | `next-best-practices` | App Router test conventions (route tests, RSC boundaries) |
| test-writer | `drizzle-orm-patterns` | reading/seeding through `*.it.test.ts` correctly |
| test-writer | `zod` | asserting on contract-shaped payloads |
| test-writer | `response-schema` | a regression test on a response shape stays faithful to the contract |
| test-writer | `typescript-expert` | typing test fixtures and mocks correctly |
| test-writer | `security` | recognizing when a "missing test" is actually a missing input-validation test |
| test-writer | `engineering-insights` | reads `INSIGHTS.md` gotchas (e.g. per-test unique names) before writing a test that would hit them |
| architecture-reviewer | `onion-architecture` | its entire job in `server/`/`reviewer-core/` |
| architecture-reviewer | `frontend-architecture` | its entire job in `client/` |
| architecture-reviewer | `next-best-practices` | route-level placement rules that overlap with layering |
| architecture-reviewer | `engineering-insights` | reads `INSIGHTS.md` as review context (read-only — see the agent file) |
| security-reviewer | `security` | its entire job — OWASP Top 10:2025, confidence-gated reporting |
| security-reviewer | `fastify-best-practices` | stack-correct routes/CORS/schema rules, since `security/SKILL.md`'s own examples are Express-shaped |
| security-reviewer | `engineering-insights` | reads `INSIGHTS.md` as review context (read-only — see the agent file), e.g. the zip-bomb gotcha it checks for |
| stack-reviewer | `engineering-insights` | reads `INSIGHTS.md` as review context (read-only — see the agent file); the only preloaded skill |
| stack-reviewer | stack skills (not preloaded) | Read on demand per changed file's `routing.md` lane (`zod`, `fastify-best-practices`, `drizzle-orm-patterns`, `postgresql-table-design`, `next-best-practices`, `react-best-practices`, `react-testing-library`, `typescript-expert`), once per run |
| conventions-reviewer | `engineering-insights` | reads `INSIGHTS.md` as review context (read-only); the rules it applies live in the root `AGENTS.md`, so no other skill is needed |
| plan-verifier | `engineering-insights` | reads `INSIGHTS.md`; the only skill it needs unconditionally |
| plan-verifier | `onion-architecture` | most plans touch `server/`/`reviewer-core/`, so this is preloaded rather than Read on demand |
| plan-verifier | `frontend-architecture` | most plans touch `client/`, for the same reason |
| plan-verifier | `ears-requirements` | reads a spec's `AC`/`EC`/`NFR` rows and their `verify:` hints as requirement rows (small; only used when the plan names a spec) |
| doc-writer | `mermaid-diagram` | diagrams belong in the owning `README.md` |
| doc-writer | `engineering-insights` | routes non-obvious findings to `INSIGHTS.md` instead of a doc |
| doc-writer | `onion-architecture` | describing "how it's wired" correctly for `server/`/`reviewer-core/` |
| doc-writer | `frontend-architecture` | describing "how it's wired" correctly for `client/` |
| doc-writer | `deprecation-policy` | documenting a removal/migration correctly |
| doc-writer | `response-schema` | documenting a response contract correctly |

`plan-verifier`'s list stays narrow on purpose: it does not know in advance
which skills a plan's Constraints will cite, so instead of preloading every
skill "just in case", it Reads `.claude/skills/<name>/SKILL.md` on demand,
driven by each Constraint's own `C#: <rule> — source: <skill>` field — see
"Skill loading rule" in [plan-verifier.md](plan-verifier.md). This keeps its
preloaded cost low while still grounding every judgment in the skill the plan
actually cited. `stack-reviewer` does the same, driven by `routing.md` lanes for the changed files rather than a plan. `brainstorm` reads other skills on demand the same way: when
an option's difference is better judged by a skill outside its own preloaded
three, it looks up the lane in `routing.md` for the files that option would
touch and Reads that skill's `SKILL.md` before scoring the option against it.

### Permission notes

- Bash cannot be restricted per command in agent frontmatter. The
  implementer's forbidden commands (`git commit/push/…`, `gh pr`,
  `docker compose down -v`, `db:migrate`, installs) are **prompt rules**,
  backed by Bash permission prompts and the PR gate in
  [`.claude/settings.json`](../settings.json). No hooks yet.
- In **auto mode** a subagent's `permissionMode` is ignored — the prompt
  rules are then the only guard. Add a `PreToolUse` hook before relying on
  the implementer in auto mode.
- No `isolation: worktree`: a fresh worktree has no `node_modules`, so the
  checks could not run, and it would not see uncommitted branch changes.
- `architecture-reviewer`, `security-reviewer` and `plan-verifier` carry **no
  `permissionMode`** — auto mode ignores it regardless, and `plan` mode would
  block the check commands these agents need to run (`arch:check`, `lint`,
  unit tests, the secret-scan grep). Their read-only Bash allow-list is a
  **prompt rule**, the same as everywhere else in this repo (no hooks), and
  the check commands they run are prompt-allowed, not tool-restricted.

## Sources the rules are based on

### brainstorm

| Rule | Source |
|---|---|
| Decision drivers formulated before options; "Considered Options" + "Pros and Cons of the Options" | [MADR](https://adr.github.io/madr/), [ADR templates](https://adr.github.io/adr-templates/) |
| Rejected alternatives justified + the impact of "doing nothing" | [Rust RFC template](https://github.com/rust-lang/rfcs/blob/master/0000-template.md), [RFC process](https://rust-lang.github.io/rfcs/0002-rfc-process.html) |
| Alternatives scored against the same goals; a "do nothing" baseline is mandatory | [Design docs at Google](https://www.industrialempathy.com/posts/design-docs-at-google/) (Malte Ubl, not an official google.com page) |
| No weights or numeric scores: `met` / `partial` / `unmet` verdicts | [Decision-matrix method](https://en.wikipedia.org/wiki/Decision-matrix_method) (documents Pugh's arbitrariness weakness) |
| Each option gets a pre-assigned axis; N ≤ 3 (diversity collapse) | [arXiv 2604.18005](https://arxiv.org/html/2604.18005v2), [arXiv 2602.20408](https://arxiv.org/html/2602.20408); [Anthropic multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) (vague instructions produce duplicates) |
| Short Tree-of-Thoughts-style thoughts per option before detail; Self-Consistency not used | [Tree of Thoughts](https://arxiv.org/abs/2305.10601); [Self-Consistency](https://arxiv.org/abs/2203.11171) (collapses to one answer) |
| Generation separated from evaluation; critique in one call | [Building Effective AI Agents](https://www.anthropic.com/engineering/building-effective-agents) (Evaluator-Optimizer) |
| Critique argued from distinct lenses, not homogeneous debate | [Du et al., ICML 2024](https://arxiv.org/abs/2305.14325), [arXiv 2502.08788](https://arxiv.org/pdf/2502.08788) |
| Step is optional, priced like `implementation-planner`/`test-writer`/`doc-writer` | [Anthropic multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system); in-repo: `docs/plans/agent-token-optimization.md` §2.5 |
| `model: opus`, because generating genuinely distinct options needs real judgment | in-repo: `docs/plans/agent-token-optimization.md` §2.2 |
| Read-only, no web; `permissionMode: plan`; *Clarifying questions* instead of `AskUserQuestion` | [Create custom subagents](https://code.claude.com/docs/en/sub-agents); pattern from `implementation-planner.md`, `researcher.md` |
| Report handed to `implementation-planner` via `docs/plans/<feature>.options.md` | in-repo: Orchestration practices above (context-pack pattern) |
| Skills outside the preload read on demand | in-repo: `plan-verifier.md` "Skill loading rule" |

### stack-reviewer

| Rule | Source |
|---|---|
| Read-only reviewer shape, Step 0, finding format, delta re-review | [architecture-reviewer.md](architecture-reviewer.md), [security-reviewer.md](security-reviewer.md) |
| Skills without a severity scale give `WARNING` at most; evidence rule for `CRITICAL` | [severity.md](../skills/pr-self-review/severity.md) |
| File -> skill mapping; skills read on demand per lane | [routing.md](../skills/pr-self-review/routing.md) |
| On demand, not a `/run-plan` phase; ownership boundaries with the other reviewers | user decision, 2026-10-09 |

### conventions-reviewer

| Rule | Source |
|---|---|
| Rules R1-R7 | root [AGENTS.md](../../AGENTS.md) "Naming conventions" |
| Deterministic checks before the manual pass; one allowed `git diff \| grep` pipe | [security-reviewer.md](security-reviewer.md), [severity.md](../skills/pr-self-review/severity.md) |
| `WARNING` at most (naming is a preference, no blocking invariant) | [severity.md](../skills/pr-self-review/severity.md) |
| On demand, not a `/run-plan` phase | user decision, 2026-10-09 |

### implementation-planner

| Rule | Source |
|---|---|
| Plans implementation only; specifications are `doc-writer`'s, e2e flows `test-writer`'s | user decision, 2026-09-29 |
| Two passes: `SC#` + `REC#` + execution mode first, plan only after answers; requirements review and clarifying questions moved to `spec-creator` | user decision, 2026-09-29; reviewer feedback, 2026-10-04; subagents can't call `AskUserQuestion` ([Create custom subagents](https://code.claude.com/docs/en/sub-agents)) |
| Execution mode asked every time: multi-agent (parallel work packages, non-overlapping owned paths, DAG, contracts first) vs single-agent (linear) | user decision, 2026-09-29; [Anthropic multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) |
| Separate read-only planning phase before code (explore → plan → implement → verify) | [Claude Code best practices](https://code.claude.com/docs/en/best-practices) |
| Least-privilege, read-only tool set (like built-in `Plan` / `Explore`) | [Create custom subagents](https://code.claude.com/docs/en/sub-agents) |
| Fresh context, no `AskUserQuestion` → pass-1 block relayed by the main session | [Create custom subagents](https://code.claude.com/docs/en/sub-agents); pattern from [researcher.md](researcher.md) |
| `skills:` preloads full skill bodies; `description` drives delegation | [Create custom subagents](https://code.claude.com/docs/en/sub-agents), [Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) |
| File → skill mapping (lanes) | [routing.md](../skills/pr-self-review/routing.md) |
| Module constraints: package managers, vendored contracts, migrations, naming | [root AGENTS.md](../../AGENTS.md) and each package's `AGENTS.md` |
| Prior findings read before planning | `*/INSIGHTS.md` via [engineering-insights](../skills/engineering-insights/SKILL.md) |
| Architecture constraints | [onion-architecture](../skills/onion-architecture/SKILL.md), [frontend-architecture](../skills/frontend-architecture/SKILL.md) |
| Check commands in the test plan | [pr-self-review SKILL.md](../skills/pr-self-review/SKILL.md), Step 5 |

### implementer

| Rule | Source |
|---|---|
| Verification loop: run tests/typecheck and fix before reporting | [Claude Code best practices](https://code.claude.com/docs/en/best-practices) |
| `acceptEdits`, not `bypassPermissions`; auto mode overrides agent mode | [Permission modes](https://code.claude.com/docs/en/permission-modes) |
| Bash specifiers in frontmatter don't scope commands → prompt rules / hooks | [Create custom subagents](https://code.claude.com/docs/en/sub-agents); [claude-code#95002](https://github.com/anthropics/claude-code/issues/95002), [#94202](https://github.com/anthropics/claude-code/issues/94202) |
| No worktree isolation | [Worktrees](https://code.claude.com/docs/en/worktrees) + repo setup (per-package `node_modules`) |
| CI commands; no pipes; skip `*.it.test.ts` and missing deps | [pr-self-review SKILL.md](../skills/pr-self-review/SKILL.md), Step 5; [TESTING.md](../../TESTING.md) |
| Which skill applies where | [routing.md](../skills/pr-self-review/routing.md) |
| Forbidden commands and paths | [root AGENTS.md](../../AGENTS.md) — *Do-not-touch*, *Non-default conventions* |
| Append-only INSIGHTS entries | [engineering-insights](../skills/engineering-insights/SKILL.md) |
| Review left to separate agents (review in a fresh context against the plan) | [Claude Code best practices](https://code.claude.com/docs/en/best-practices) — adversarial review step |

### test-writer

| Rule | Source |
|---|---|
| Edits test files only, never product code — no mutation of the SUT, not even temporarily | user decision, rev. 2 of the plan that introduced this agent |
| Right-reason check: (a) fails on the assertion before the behaviour exists, or (b) a negative control inside the test file, restored and diffed clean | [AI-tests-1](https://qaskills.sh/blog/ai-test-generation-review-checklist), [AI-tests-2](https://getautonoma.com/blog/ai-generated-tests-pass-but-dont-assert), [AI-tests-3](https://www.augmentcode.com/guides/mutation-testing-ai-generated-code) |
| Mostly-integration test level (Testing Trophy) | [Dodds](https://kentcdodds.com/blog/write-tests) — [testing trophy](https://kentcdodds.com/blog/the-testing-trophy-and-testing-classifications) |
| RTL query priority | [RTL-queries](https://testing-library.com/docs/queries/about/), [RTL-principles](https://testing-library.com/docs/guiding-principles/) |
| `vi.mock` hoisting, reset/restore between tests | [vitest-mock](https://vitest.dev/guide/mocking) |
| `app.inject`-based server test pattern | [fastify-testing](https://fastify.dev/docs/v5.2.x/Guides/Testing/) |
| `fireEvent`/`vi.mock` override of the skill's `userEvent`/MSW default | repo convention (C11 of the introducing plan), pinned against existing `client/**/*.test.tsx` |

### architecture-reviewer

| Rule | Source |
|---|---|
| Onion ring direction, ports declared inward, adapters implemented outward | [Palermo](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/), [hexagonal](https://en.wikipedia.org/wiki/Hexagonal_architecture_(software)), [ploeh](https://blog.ploeh.dk/2013/12/03/layers-onions-ports-adapters-its-all-the-same/) |
| Mechanical checks before manual review (fitness functions) | [Ford](https://www.oreilly.com/library/view/building-evolutionary-architectures/9781491986356/ch02.html) |
| Rule names taken from `server/.dependency-cruiser.cjs`, not skill-doc prose | [dep-cruiser rules reference](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md) |
| Finding shape, evidence rule, severity collapse | in-repo: [report.md](../skills/pr-self-review/report.md), [severity.md](../skills/pr-self-review/severity.md) |
| Verdict is a pure function of findings; zero findings is valid | in-repo: [docs/agent-prompts/general-reviewer.md](../../docs/agent-prompts/general-reviewer.md) |
| Fresh-context adversarial review after implementation | [adversarial review](https://github.com/2389-research/tracker/issues/625), [ReviewGrounder](https://lambda.ai/blog/reviewgrounder-ai-assisted-peer-review) |

### security-reviewer

| Rule | Source |
|---|---|
| Frontmatter schema (`disallowedTools`, `maxTurns`, valid field list) | [Create custom subagents](https://code.claude.com/docs/en/sub-agents), Anthropic, accessed 2026-09-24 |
| Confidence-gated LLM filtering cuts false positives ~88.6% at ~3% recall cost | [QASecClaw](https://arxiv.org/pdf/2605.01885) (arXiv preprint) |
| Persona + rich context + file:line/quote evidence + confidence scoring, not generic checklist prompting | [How to Prompt LLMs for Better, Faster Security Reviews](https://crashoverride.com/blog/prompting-llm-security-reviews), Crash Override, Oct 2025 |
| Two-phase search → false-positive filter; sonnet for phase 1 | in-repo: [docs/plans/agent-token-optimization.md](../../docs/plans/agent-token-optimization.md) |
| Severity mapping, evidence rule, never-flagged list | in-repo: [severity.md](../skills/pr-self-review/severity.md) |
| Finding/verdict shape; lethal-trifecta classification rule | in-repo: [report.md](../skills/pr-self-review/report.md), [docs/agent-prompts/security-reviewer.md](../../docs/agent-prompts/security-reviewer.md) |
| OWASP Top 10:2025 categories | [.claude/skills/security/references.md](../skills/security/references.md) |
| Onion-ring rule for secrets/env placement | [onion-architecture](../skills/onion-architecture/SKILL.md) |

### plan-verifier

| Rule | Source |
|---|---|
| Verification (conformance) vs validation (was the plan right) | [V&V](https://en.wikipedia.org/wiki/Software_verification_and_validation), [IEEE 1012](https://ieeexplore.ieee.org/document/8055462) |
| Traceability matrix over every requirement/constraint/step | [RTM/29148](https://www.reqview.com/blog/requirements-traceability-matrix/), [Autorubric](https://arxiv.org/html/2603.00077v1) |
| Never force a met/unmet verdict without evidence; `not-verifiable` is a valid answer | [LLM-judge rubrics](https://www.alphaxiv.org/abs/2606.29920) |
| Skill loading driven by each Constraint's own `source:` field, not a fixed preload | in-repo: this agent's own design (rev. 2 decision) |
| `model: sonnet`, not `opus` — checking evidence against a matrix and re-running commands is mechanical, not open-ended judgment | in-repo: [docs/plans/agent-token-optimization.md](../../docs/plans/agent-token-optimization.md) §2.2, confirmed by §5.3.2's measured run (this agent cost ~100k tokens on `opus` before the change) |

### doc-writer

| Rule | Source |
|---|---|
| Content classification (how-it's-wired vs behavioural guarantee vs reference) | [Diátaxis](https://diataxis.fr/) — repo's own package split (`docs/` vs `specs/`) wins where it disagrees |
| Design-record fields (Status/Scope/decisions) | [ADR](https://adr.github.io/), [ADR templates](https://adr.github.io/adr-templates/) |
| English, Google developer-documentation style | [Google style](https://developers.google.com/style) |
| Docs live and are reviewed alongside code | [Docs as Code](https://www.writethedocs.org/guide/docs-as-code/) |
| Diagram detail level | [C4](https://c4model.com/) |
| Mermaid diagrams render inline in `README.md` | [GitHub Mermaid](https://github.blog/developer-skills/github/include-diagrams-markdown-files-mermaid/) |

## Maintaining the set

- Change an agent → edit its `.md` here, then update the row above if its
  responsibility, model, tools or input/output changed.
- New implementation skill → add it to `skills:` of `implementation-planner.md`,
  to the lane table in `implementer.md` ("Which skill applies where") and to
  `routing.md` (see root `AGENTS.md`).
- New skill → also decide whether it belongs in `brainstorm` / `test-writer` /
  `architecture-reviewer` / `security-reviewer` / `stack-reviewer` / `conventions-reviewer` / `plan-verifier` /
  `doc-writer`'s role-scoped list,
  and update its rationale row in the table above.
- New agent → add a catalog row and, if it joins the flow, update the diagram.
