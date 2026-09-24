# Agents

Claude Code subagents for working **on** this repo. Each `<name>.md` here is
the canonical definition (frontmatter + system prompt); this file is only a
map of the set — read the agent file for the actual rules.

> Not to be confused with the app's own reviewer agents (General, Security,
> API Contract, …): those live in the database and are documented in
> [`docs/agent-prompts/`](../../docs/agent-prompts/README.md).

## Flow

```
user ─► researcher (when evidence is needed)
     ─► planner ─► Development Plan ─► user approves
     ─► implementer ─► code + Implementation Report
     ─► test-writer (optional: coverage gaps / regression tests) ─► Test Report
     ─► plan-verifier ─► Verification Report   (unmet → back to implementer)
     ─► architecture-reviewer ─► findings  ∥  security-reviewer ─► findings
     ─► doc-writer (when the feature needs docs) ─► Documentation Report
     ─► /pr-self-review ─► gh pr create
```

`plan-verifier` runs after `test-writer` so new tests count as evidence in the
traceability matrix; `doc-writer` runs before `/pr-self-review` so any docs it
writes are inside the gated fingerprint. `architecture-reviewer` and
`security-reviewer` are both read-only and independent of each other, so the
main session can run them in parallel; the security phase-2 false-positive
filter (see `docs/plans/agent-token-optimization.md`) runs only when
`security-reviewer` actually returns `CRITICAL`/`WARNING` findings.

The main session orchestrates: no agent here can spawn another (`Agent` is
not in any tool list), and a subagent cannot ask the user questions — each
one returns a *clarifying questions* / *blocked* block instead of guessing.
Plan step IDs (`S1..Sn`) are shared by the plan, the report and the review
handoff, so a reviewer can check the diff against the plan.

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
- **A large `researcher` report going into `planner` doesn't have to be
  pasted in full.** `researcher` stays strictly read-only (no Write/Edit —
  that guarantee doesn't change), so it cannot write its own findings to a
  file; instead, the main session saves the returned report to
  `docs/plans/<feature>.context.md` and passes `planner` that path plus a
  one-line pointer, instead of the whole report text, when the report is
  long (§2.3.1/§2.1 of the optimization doc).
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
| [researcher](researcher.md) | Answers a concrete question with evidence from the repo (code, docs, git history) and/or external sources | `sonnet` | Read, Grep, Glob, read-only Bash, WebSearch, WebFetch. No Write/Edit/Skill | A concrete question + scope (repo / external / both) | *Repo research* or *External research* report: TL;DR, conclusions with confidence, evidence (`path:line` / URLs), sources, **Not found / gaps** |
| [planner](planner.md) | Turns a feature/bug request into a structured Development Plan that respects modules, INSIGHTS, skills and architecture constraints. Does not review | `opus` | Read, Grep, Glob, read-only Bash; `permissionMode: plan`. No Write/Edit/Skill/Agent/Web | Task description (goal, scope, done criterion); optionally a researcher report | **Development Plan**: goal & scope, context, affected modules, constraints (with sources), steps `S1..Sn` (files, skills, reuse, done-when, depends-on), test plan, risks, review handoff, gaps — or *Clarifying questions* |
| [implementer](implementer.md) | Executes an approved plan in `server/`, `client/`, `reviewer-core/`, `e2e/`; writes tests; runs the touched packages' CI checks. No review, commits or PRs | `sonnet` | Read, Edit, Write, Grep, Glob, Bash; `permissionMode: acceptEdits`. No Skill/Agent/Web | The approved Development Plan, passed in full in the prompt | Code changes (+ at most one `INSIGHTS.md` line) and an **Implementation Report**: status, per-step result, files changed, skills applied, checks with exit codes, deviations, reviewer handoff — or *blocked* |
| [test-writer](test-writer.md) | Adds or extends automated tests for a given target — a plan/report or a named feature/bug — across `server/`, `client/`, `reviewer-core/`, `e2e/`. Confirms each test fails for the right reason. Edits test files only, never product code | `sonnet` | Read, Edit, Write, Grep, Glob, Bash; `permissionMode: acceptEdits`. No Skill/Agent/Web | A plan + Implementation Report, or files/feature + behaviour to cover + packages | **Test Report**: status, tests added/changed, right-reason evidence per test, checks with exit codes, not-run (`.it`/e2e), skills applied, convention overrides, INSIGHTS updated, open issues — or *blocked* |
| [plan-verifier](plan-verifier.md) | Read-only traceability check of finished work against the approved plan and the original requirements — every requirement, `C#`, `S#` done-when and Test-plan item gets a verdict with evidence. Flags unplanned changes. Does not re-judge the plan | `sonnet` | Read, Grep, Glob, read-only Bash. No Write/Edit/Skill/Agent/Web | The full plan, the Implementation Report, and the original requirements | **Verification Report**: overall verdict + counts, traceability matrix, skill sources read, checks re-run, report discrepancies, unplanned changes, not-verifiable items — or *Clarifying questions* |
| [architecture-reviewer](architecture-reviewer.md) | Read-only review of onion-ring direction and ports/DI (`server/`, `reviewer-core/`) and layer direction/placement (`client/`) on the diff. Findings in the `pr-self-review` finding shape | `opus` | Read, Grep, Glob, read-only Bash. No Write/Edit/Skill/Agent/Web | A base ref or "all open changes"; optionally the plan's Review handoff + Implementation Report | **Architecture Review**: scope, mechanical checks with exit codes, findings (JSON, `report.md` shape), verdict, config-vs-skill-doc drift, gaps |
| [security-reviewer](security-reviewer.md) | Read-only security review of a diff (`server/`, `client/`, `reviewer-core/`): traces attacker-controlled input to sinks (routes, SQL, process spawns, filesystem paths, tokens/secrets, LLM prompt input, HTML) and reports confidence-gated findings in the `pr-self-review` finding shape | `sonnet` | Read, Grep, Glob, Bash (`maxTurns: 48`). No Write/Edit/Skill/Agent/Web | A base ref or "all open changes"; optionally the plan's Review handoff + Implementation Report | **Security Review**: scope, mechanical checks with exit codes, findings (JSON, `report.md` shape + `confidence`), verdict, phase-2 handoff, checked-nothing-found, gaps |
| [doc-writer](doc-writer.md) | Documents already-implemented, already-verified work as repo Markdown + Mermaid diagrams, routed to the right `docs/`/`specs/`/`README.md`/`AGENTS.md` location, with its indexes updated. Edits Markdown only | `sonnet` | Read, Edit, Write, Grep, Glob, Bash; `permissionMode: acceptEdits`. No Skill/Agent/Web | Source material (plan/report/memo/code) + feature name + packages | **Documentation Report**: files written, diagrams, indexes updated, claims → evidence, link check, open issues — or *Clarifying questions* |

**implementer ↔ test-writer split**: the implementer writes the tests each
plan step's `done-when` requires, as part of executing that step — it is not
optional there. `test-writer` is a separate pass on demand: it adds coverage
for a gap or a regression after the fact, touches test files only, and never
modifies product code (not even the mocks the implementer would have
touched).

### Preloaded skills (planner = implementer)

Both agents preload the **same 16 skills** via `skills:`, so a plan never
assumes practices the implementer doesn't follow:

`engineering-insights` · `onion-architecture` · `fastify-best-practices` ·
`drizzle-orm-patterns` · `postgresql-table-design` · `next-best-practices` ·
`react-best-practices` · `frontend-architecture` · `react-testing-library` ·
`zod` · `typescript-expert` · `response-schema` · `breaking-change` ·
`deprecation-policy` · `semver-discipline` · `security`

Left out on purpose: `mermaid-diagram` (used only by `doc-writer`) and
`pr-self-review` (not an implementation practice). The Skill tool is disabled
in both, so the set is fixed. Cost: roughly 27k tokens of context per run.

Which skill applies to which file is decided by
[`routing.md`](../skills/pr-self-review/routing.md), the same table
`/pr-self-review` uses.

### Role-scoped skills (test-writer, architecture-reviewer, security-reviewer, plan-verifier, doc-writer)

Only `planner` and `implementer` must stay identical (C15 in the plan that
introduced these four agents). Each of the other agents preloads a smaller,
role-scoped list; every skill on a list is justified here.

| Agent | Skill | Why it's preloaded |
|---|---|---|
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
| plan-verifier | `engineering-insights` | reads `INSIGHTS.md`; the only skill it needs unconditionally |
| plan-verifier | `onion-architecture` | most plans touch `server/`/`reviewer-core/`, so this is preloaded rather than Read on demand |
| plan-verifier | `frontend-architecture` | most plans touch `client/`, for the same reason |
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
actually cited.

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

### planner

| Rule | Source |
|---|---|
| Separate read-only planning phase before code (explore → plan → implement → verify) | [Claude Code best practices](https://code.claude.com/docs/en/best-practices) |
| Least-privilege, read-only tool set (like built-in `Plan` / `Explore`) | [Create custom subagents](https://code.claude.com/docs/en/sub-agents) |
| Fresh context, no `AskUserQuestion` → *Clarifying questions* block | [Create custom subagents](https://code.claude.com/docs/en/sub-agents); pattern from [researcher.md](researcher.md) |
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
- New implementation skill → add it to `skills:` of **both** `planner.md` and
  `implementer.md` (and to `routing.md`, see root `AGENTS.md`). Check the
  lists still match:

  ```sh
  diff <(sed -n '/^skills:/,/^---/p' .claude/agents/planner.md) \
       <(sed -n '/^skills:/,/^---/p' .claude/agents/implementer.md)
  ```
- New skill → also decide whether it belongs in `test-writer` /
  `architecture-reviewer` / `security-reviewer` / `plan-verifier` /
  `doc-writer`'s role-scoped list,
  and update its rationale row in the table above.
- New agent → add a catalog row and, if it joins the flow, update the diagram.
