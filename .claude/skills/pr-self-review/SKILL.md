---
name: pr-self-review
description: "Reviews all open local changes before a pull request exists, by routing this repo's own skills at the files in the diff, and writes the report that blocks the merge when something CRITICAL is found. Use before opening or merging a PR (`gh pr create`, `gh pr merge`), when asked for a self-review, pre-PR check, or pre-merge check, and whenever the PR self-review gate has denied a command. Covers collecting committed + staged + unstaged + untracked changes, grouping them into frontend/backend/contracts/security lanes, loading only the skills each lane needs, running the project invariants and every check CI gates on for the touched packages (lint, typecheck, arch:check, unit tests), and writing a machine-readable report keyed to the working tree. NOT a bug hunt (see /code-review), NOT a quality cleanup (see /simplify), and NOT the server-side LLM review of someone else's PR (that is reviewer-core). Trigger terms: pr self review, self-review, pre-PR check, before opening a PR, gh pr create blocked, pr gate, merge blocked, critical finding, review my changes."
metadata:
  tags: pr-review, pre-merge-gate, workflow, skill-routing, hooks, git-diff
---

# PR Self Review

Two questions, and only these two:

1. **Which of our skills apply to the files changed here?**
2. **Does anything found here block the merge?**

This skill holds no code rules of its own. Every rule it applies comes from a
skill that already exists in `.claude/skills/` — it decides which of them to
load for this diff, normalizes what they say into one severity scale, and
writes a report. Do not restate their rules here; route to them.

It is also not the review engine: `reviewer-core/` reviews *other people's*
PRs on the server, through an LLM, from the database. This runs on **local,
not-yet-pushed changes**, on this machine, before a PR exists.

## Severity

Three levels — `CRITICAL`, `WARNING`, `SUGGESTION` — and exactly four things
produce a `CRITICAL`. Both are defined in [severity.md](severity.md); read it
before assigning a level, because only `CRITICAL` blocks a merge and a
false block is worse than a missed warning.

## How it is triggered

- **Manually** — `/pr-self-review`, at any point.
- **Automatically** — the `PreToolUse` hook in
  [`.claude/settings.json`](../../settings.json) runs
  [`assets/gate.sh`](assets/gate.sh) before every Bash call and denies
  `gh pr create` / `gh pr merge` / `gh pr ready` unless this branch has a
  report that (a) matches the current working tree and (b) holds no
  `CRITICAL`. The skill is what produces that report; the script is what
  actually refuses, because an instruction cannot.

A denial is not a dead end — it names what to fix, and
`PR_SELF_REVIEW_OVERRIDE=1 <command>` bypasses it deliberately and on the
record.

---

## Step 1 — Collect every open change

"Open changes" means all four kinds at once: committed on this branch, staged,
unstaged, and untracked. A PR carries the first; the reviewer must see the
rest, because they are about to become part of it.

```sh
G=.claude/skills/pr-self-review/assets/gate.sh
BASE="$("$G" base)"                                   # merge-base with origin/main

{ git diff --name-only "$BASE"...HEAD                 # committed on the branch
  git diff --name-only HEAD                           # staged + unstaged
  git ls-files --others --exclude-standard            # untracked
} | sort -u
```

Read the changed lines, not the files:

```sh
git diff "$BASE"...HEAD -- <path>     # committed hunks
git diff HEAD -- <path>               # working-tree hunks
```

Open a file in full only when the hunk cannot be judged without it — checking
an import direction, for instance. **The review is scoped to changed lines.**
Pre-existing problems on untouched lines are out of scope; noting them turns
every review into a rewrite.

## Step 2 — Group into lanes

[routing.md](routing.md) maps globs → lanes → skills. Assign each changed file
to its lanes, collect the union of skills per lane, and load nothing else.

Then run the **coverage invariant** from that file: any skill directory missing
from the routing table would silently never run again. Report it as a
`SUGGESTION` and add the row.

## Step 3 — Project invariants first

Cheap, scripted, and able to block on their own — so they run before anything
expensive. The full list with its checks is in
[severity.md](severity.md#3-project-invariants); the two that need a command:

```sh
./scripts/check-shared-sync.sh                 # the two @devdigest/shared copies
git ls-files -s <each CLAUDE.md in the diff>   # must be mode 120000 (a symlink)
```

If an invariant fails, keep going — the report should be complete, not
short-circuited — but the verdict is already `request_changes`.

## Step 4 — Review the lanes

In the order [routing.md](routing.md) lists them. Per lane: load its skills,
apply them to that lane's changed lines only, and record findings.

Every finding carries `file:line`, the changed line quoted, and the skill and
rule it violates. A finding that cannot carry all three is not a `CRITICAL` —
see [the evidence rule](severity.md#evidence-rule--how-a-critical-earns-the-name).
The [never-flagged list](severity.md#never-flagged) applies in every lane.

## Step 5 — Check the packages in the diff

Only the packages that actually appear in the diff, and mind the package
manager — it differs per package (root `AGENTS.md`). A package's own
`AGENTS.md` wins if it states something else.

Run **what CI runs**, nothing else. Mirroring the workflows is not a detail:
`arch:check` is the mechanical form of `onion-architecture`, and it catches
layering breaks that `typecheck` cannot see.

| Package in diff | Commands (the CI form) | Source |
|---|---|---|
| `server/` | `pnpm -C server lint` · `pnpm -C server typecheck` · `pnpm -C server arch:check` · `pnpm -C server exec vitest run --exclude '**/*.it.test.ts'` | `.github/workflows/server-unit.yml` |
| `client/` | `pnpm -C client lint` · `pnpm -C client typecheck` · `pnpm -C client test` | `.github/workflows/client.yml` |
| `reviewer-core/` | `npm --prefix reviewer-core run typecheck` · `npm --prefix reviewer-core test` | `.github/workflows/reviewer-core.yml` |
| `e2e/` | `npm --prefix e2e run typecheck` | `.github/workflows/e2e-web.yml` |

A non-zero exit is a `CRITICAL` with the failing output quoted. This is the
only objective signal in the whole review; do not soften it — but three things
make an exit code lie, and each one manufactures a false `CRITICAL`:

- **Never pipe a check.** `pnpm typecheck | tail -20` reports *`tail`'s* status,
  which is always 0. Redirect instead: `cmd >/tmp/out 2>&1; echo $?`.
- **Never run `*.it.test.ts`.** Integration tests need Postgres and have their
  own workflow (`server-integration.yml`). The `--exclude` above is deliberate;
  record them as *skipped*, not passed and not failed.
- **A package with no `node_modules` is skipped, not failed.** `exit 127` /
  `command not found` is a missing install, not a defect — `e2e/node_modules`
  is routinely absent here. Say "skipped (deps not installed)" in the report.

And run the checks **after** the working tree stops moving. A check against a
half-finished refactor reports errors that do not exist; if `gate.sh
fingerprint` changes between two checks, discard the results and start step 5
again.

## Step 6 — Write the report and the verdict

Shape, field names and the write order are in [report.md](report.md). In
short: compute the fingerprint **last**, with `"$G" fingerprint`, after every
check has run and every file is final; write both the `.json` and the `.md` to
the path `"$G" report-path` gives.

Then print to the terminal, and nothing more than this:

1. a table — severity, `file:line`, skill, one-line fix — `CRITICAL` first;
2. the checks that ran, with their exit codes;
3. the verdict on one line, and if it is `request_changes`, the fact that
   `gh pr create` is now blocked and what to fix first.

Confirm the gate agrees with the report before claiming a pass:

```sh
"$G" check        # exit 0 = PASS, exit 1 = BLOCKED, with the reason
```

## Step 7 — Record what was non-obvious

Only if the review surfaced something worth keeping: invoke
[engineering-insights](../engineering-insights/SKILL.md) for the affected
module. A routine pass records nothing.

---

## Rules that hold across every step

- **Diff-scoped.** Changed lines only.
- **Evidence or downgrade.** No `file:line` + quote + named rule, no `CRITICAL`.
- **Skills without a severity scale cannot block.** They produce `WARNING` at
  most. See [severity.md](severity.md#mapping).
- **Never edit code during a review.** Report the fix; applying it is a
  separate, explicit request (`/simplify` and `/code-review --fix` exist for
  that). Silently fixing a finding also invalidates the fingerprint you are
  about to write.
- **Never delete or hand-edit a report to make the gate pass.** Fix the
  finding, or override on the record.
