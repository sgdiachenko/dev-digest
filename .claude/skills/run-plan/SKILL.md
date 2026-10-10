---
name: run-plan
description: "Runs the implementation half of dev-digest's Spec-Driven Development flow from the main session, starting from an already approved Implementation Plan (spec-creator and implementation-planner are run separately, by hand): waves of implementers → full checks → plan-verifier → architecture/security/correctness review with a bounded review-fix loop → doc-writer → /pr-self-review. Keeps its state in docs/plans/<slug>.impl.md so it can resume in a fresh chat. Use when the user types /impl. Trigger terms: impl, implement the plan, run implementation, resume impl."
argument-hint: "<plan path | slug> [spec ID | spec path] [--from implement|verify|review|docs|pr] [extra instructions]"
disable-model-invocation: true
---

# /run-plan — implement an approved plan, spec-driven

You (the **main session**) orchestrate. The spec (`spec-creator`) and the
plan (`implementation-planner`) already exist — the user runs those by hand;
this command never invokes either. Subagents can't spawn agents or ask the
user, so every launch, question and hand-off goes through you. The agents'
own files define *what* each one does; this skill defines only the **order,
the gates, the hand-offs and the loops**.

Arguments: `$ARGUMENTS`

## Principles

1. **Paths, not pastes.** Agents get file paths, never a pasted plan, spec
   or report.
2. **Decisions are the user's.** Waivers, disputed findings, plan/spec
   problems and the PR are asked via `AskUserQuestion` — never assumed.
3. **Fresh agents, small prompts.** Never resume an implementer with a large
   context (the most expensive thing measured —
   `docs/plans/agent-token-optimization.md` §1, §5.2).
4. **Small fixes in the main session.** ≤3 files and no new
   port/module/contract → Edit here, re-run only the touched package's checks.
5. **Bounded loops** — each has a max round count and an exit to the user.
6. **Check the agent really ran.** `tool_uses` implausibly low for the task
   (e.g. 0) → re-send with "execute now, synchronously".
7. **No `test-writer` in this flow** (token budget). The tests are the
   implementer's: the plan's *Test plan* `T#` rows and each step's
   `done-when`. A missing test found later is fixed like any other gap.
8. **Line ranges, not shared files.** Give each agent the plan's appendix
   or the exact `file:line` ranges it needs. Reviewers and implementers
   re-read whole shared files (e.g. `service.ts` read by 12 agents in one
   run) and that is the largest avoidable cost.
9. **Short prompts.** The prompt carries the question and the paths. The
   standing rules (spec path, report format) live in the agent files, not in
   every launch.

## Phase 0 — Intake

1. Parse `$ARGUMENTS`:
   - plan: a path, or a slug → `docs/plans/<slug>.md`. Required. No plan →
     stop and say: run `implementation-planner` first.
   - spec: a spec ID (`YYYY-MM-DD-<slug>`) / a path, or the one the plan names under
     *Requirements decisions → Spec*. If it isn't `Status: approved`, ask
     whether to go on.
   - `--from <phase>` or an existing `docs/plans/<slug>.impl.md` → resume:
     report the recorded phase in two lines and continue from it.
   - remaining text → extra instructions for this run (recorded in state).
2. Sanity-check the plan (don't re-plan): every step has `files`, `skills`,
   `done-when`; multi-agent → `W#` with non-overlapping `owns:` per wave;
   with a spec → every AC/EC/NFR is `covers:`-ed or out of scope; every
   `depends-on` points to a step/package in an **earlier** wave (a step that
   uses another step's output — a function, a type, a file — cannot run in
   the same wave as its producer). A gap → stop and name it (it's the
   planner's to fix), unless the user says go.
   - Design: if the request, spec or plan mentions a mock-up / screenshot, the plan
     must list the image file(s) under *Context → Design*. A design that exists only
     in chat → before any implementer is launched, save each image under
     `docs/design/<feature>/` (ask the user for the files if they are not on disk),
     then the planner adds the paths to the plan. Implementers get the image
     path, not a description. Do not accept a plan that says "Design: none" while
     a design was shared in the conversation.
   - Live checks: if *Review handoff → Manual verification* needs a live call
     to a paid or credentialed service (e.g. a real LLM key), ask once now
     (`AskUserQuestion`): is it configured, and what spend is acceptable?
     Record the answer in the state file. Never ask for, read or print the
     key itself.
3. Create/refresh `docs/plans/<slug>.impl.md` (below) and show the route in
   ≤5 lines: mode, waves, packages, what will be skipped.

### State file `docs/plans/<slug>.impl.md`

```markdown
# impl: <feature>
Plan: docs/plans/<slug>.md (multi-agent, waves: 1✔ 2…)   Spec: <spec ID>
Phase: review   Verify round: 1/2   Review round: 2/3
Extra instructions: <one line or none>

## Waived / manual-only
- waived by user: <test or finding — reason>   (e.g. red on clean HEAD)
- manual-only rows: <AC/NFR IDs and the exact manual step>

## Log
- 2026-09-29 wave 1 done, checks green

## Review ledger
| F# | Source | Sev | file:line | Summary | Status | Round |
|---|---|---|---|---|---|---|
```

Reports go to `docs/plans/<slug>.reports.md` (appended, one `##` per report).

## Phase 1 — Implement

- **Single-agent**: one `implementer`, prompt = plan path (+ spec path).
- **Multi-agent**: per wave, one `implementer` per `W#` of the wave, **all
  in one message**. Prompt = plan path + `W#` + "read the Constraints, your
  W# row and its steps, plus the `SKILL.md` of every skill those steps name
  (your agent file's rule)" — do not write "read only", it contradicts the
  agent file and the agents then skip the skills.
- A parallel batch that fails to launch (e.g. "auto mode classifier gave no
  verdict") is retried once as it was; if it fails again, launch the same
  agents in smaller groups. Record the failure in the state file.
- After each wave:
  1. Append the Implementation Reports to `<slug>.reports.md`.
  2. Run the **full** check table (below) once for the packages the wave
     touched — implementers in a wave only ran targeted checks.
  3. Failures: small, in one `W#`'s files → fix here; larger → one **fresh**
     `implementer` with the failing lines + `W#` + plan path. Max 2 rounds
     per wave, then ask the user.
  4. **Integration gate** (a plan's `*.it.test.ts`, needs Docker): on a red result run the
     same files on a clean `git worktree` of `HEAD` first. Red there too → pre-existing: show
     it to the user to waive or fix as its own change (record it under *Waived*), not as a
     `W#` fix. Server tests must stay hermetic (`server/test/setup-hermetic.ts` hides the
     developer's `~/.devdigest/secrets.json`).
  5. A `blocked` report is a plan problem → show it; the user re-runs the
     planner or decides.

## Phase 2 — Verify (max 2 rounds)

1. `plan-verifier` with plan, spec and `<slug>.reports.md` paths, plus
   `Checks already run:` the last full check table with exit codes and
   `gate.sh fingerprint` value (it re-runs only if the fingerprint differs), and the
   state file path for its *Waived / manual-only* section — paths, not pasted text. It
   **writes the report itself** to `docs/plans/<slug>.verification.md` and replies with the
   verdict, the open rows and the path; never retype or re-paste the matrix. This first
   pass is the one full matrix.
2. `verified` → Phase 3. `unmet`/`partial` rows → fix (small → here, else a
   fresh implementer with only those rows as its steps; a row that lacks a
   test gets the test written the same way).
3. Re-run `plan-verifier` with `Rows to re-check: <IDs>` and `Changed files: <paths>` only
   — it rewrites the same file. A second full matrix only once, right before Phase 6, and
   only if code changed since the last full pass. Still unmet
   after round 2 → ask: fix more / accept as partial (recorded) / stop.
4. `not-verifiable — plan ↔ requirement conflict` is never fixed in code —
   it's the user's call (re-plan or a superseding spec, done by hand).

## Phase 3 — Review + review-fix loop (max 3 rounds)

**Round 1 — full review, one message, in parallel:** `architecture-reviewer`
and `security-reviewer` (plan path for *Review handoff*, `<slug>.reports.md`),
and `/code-review` (`Skill: code-review`, level `medium`) for correctness
bugs — neither reviewer looks for those.

**Ledger.** Merge all findings into *Review ledger* as `F#`; dedupe the same
file:line + issue across sources (highest severity, both sources listed).

**Triage** — show the ledger, then:
- `CRITICAL` / `WARNING` → `fixed`, or `waived by user: <reason>`. Never
  silently dropped.
- `SUGGESTION` → one `AskUserQuestion` (multiSelect): which to apply.
- A finding whose evidence doesn't hold, that's pre-existing code, or that
  contradicts the approved plan/spec → `disputed` with the reason; the user
  decides.
- A finding meaning the **plan or spec** is wrong → not a code fix; stop
  and hand it to the user.

**Fix.**
- ≤3 files, local, no new port/module/contract → fix here.
- Otherwise → **fresh** `implementer`s, one per disjoint file group
  (parallel when groups don't overlap); prompt = the `F#` rows as steps
  (`files`, the rule, `done-when: finding no longer applies`) + plan path for
  the Constraints. Never resume an earlier implementer.
- Record the files the round changed; run targeted, then full checks for the
  touched packages. If a fix changed behaviour an AC covers → `plan-verifier`
  on just those rows.

**Round 2+ — delta re-review.** Only the reviewers that still have open
findings, with `Re-check: <their F#>` and `Fix files: <files changed this
round>` (their *Delta re-review* mode). `/code-review` on this round's fix **diff**
(the hunks changed since the previous round), and say "changed lines only" in
its prompt: handed whole files it reviews them whole and returns findings in
old code that this round never touched.
New findings join the ledger with the round number.

**Exit** when no `CRITICAL`/`WARNING` is `open`. After round 3 with open
ones, or a round that added more findings than it closed → ask: another
round / waive (with reason) / stop.

## Phase 4 — Manual verification (only if the plan asks)

Plan's *Review handoff → Manual verification* not "none" → run the app
(`./scripts/dev.sh`, the `run` skill or `claude-in-chrome`) and check the
listed behaviour live. A regression → new `F#` (source: manual) → Phase 3
fix step.

Browser automation notes (the automation tab reports `visibilityState ===
"hidden"`): use one-shot `javascript_tool` probes and separate `wait` steps —
a `setTimeout` loop inside one call is throttled and times out at 45 s, and a
screenshot taken right after navigation can be a stale frame. Tab lists
(`VALID_TABS`) and other registries are checked by reading the page, not by
mounting the component alone. If the tool fails 3 times, stop and record what
could not be verified instead of retrying (`INSIGHTS.md` in `client/`).

Two more traps of that tab: DOM probes see every section twice, because Next's
streamed Suspense copy (`div#S:0`, `display:none`) is never swapped in — query
the `main` that is not inside `#S:0`. And `resize_window` may not change the
viewport (check `innerWidth`); to test a narrow layout, embed the same URL in a
same-origin `iframe` of the target width and probe its `contentDocument`.

## Phase 5 — Docs

`doc-writer` with plan, spec and reports paths and the plan's *Review
handoff → Docs*. It also moves the spec to `implemented` — if the handoff
says "none", ask it for only that.

## Phase 6 — PR gate

1. `/pr-self-review`. A `CRITICAL` → Phase 3 as new `F#`s (counts toward the
   3 rounds).
2. List what nobody ran (`*.it.test.ts`, e2e); offer to run them
   (`pnpm -C server exec vitest run <files>` needs Docker;
   `./scripts/e2e.sh`) or leave them to CI.
3. Show the summary and ask: commit / open PR / stop. Commits and
   `gh pr create` only on an explicit yes. The PR body links `docs/plans/<slug>.verification.md`
   (and the retro, if one was run).

## Check table (the commands CI runs)

| Package | Commands |
|---|---|
| `server/` | `pnpm -C server lint` · `pnpm -C server typecheck` · `pnpm -C server arch:check` · `pnpm -C server exec vitest run --reporter=dot --exclude '**/*.it.test.ts'` |
| `client/` | `pnpm -C client lint` · `pnpm -C client typecheck` · `pnpm -C client exec vitest run --reporter=dot` |
| `reviewer-core/` | `npm --prefix reviewer-core run typecheck` · `npm --prefix reviewer-core test -- --reporter=dot` |
| `e2e/` | `npm --prefix e2e run typecheck` |
| shared contracts changed | `./scripts/check-shared-sync.sh` |

Run each as `cmd >"$TMPDIR/<name>.txt" 2>&1; echo "exit=$?"`; read output
only on a non-zero exit, and then only the failing lines. After a full green
run, record `.claude/skills/pr-self-review/assets/gate.sh fingerprint` next
to the table in the state file.

## Summary (at the end, and whenever you stop to ask)

```
## impl — <feature>  (docs/plans/<slug>.impl.md)
Plan: <mode>, <n> steps, <w> waves — done | <which not>
Checks: green @ <fingerprint> | failing: <commands>
Verification: verified | with gaps (<rows>)
Review: <rounds> rounds — fixed n, waived n (<F#>), disputed n
Not run: <it / e2e>
Next: <the one decision the user has to make>
```
