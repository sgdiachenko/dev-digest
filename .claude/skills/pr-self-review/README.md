# pr-self-review — design notes

Why this skill is shaped the way it is. The skill itself is
[SKILL.md](SKILL.md); this file is the rationale and the list of things it
deliberately does not do.

## Why a script and not just a skill

A skill is an instruction. It can say "do not merge this", and be ignored — by
a future session with a full context window, by a person in a hurry, by an
agent that never loaded it. The requirement was that a `CRITICAL` finding
*prevents* the merge, so the enforcement lives in
[`assets/gate.sh`](assets/gate.sh), wired as a `PreToolUse` hook on `Bash` in
[`.claude/settings.json`](../../settings.json). The hook returns
`permissionDecision: "deny"`, which is the only mechanism in the harness that
actually stops a tool call.

Division of labour: the skill produces judgement, the script enforces it.
Neither can do the other's job.

## Why the fingerprint

A pass that outlives the code it passed is worse than no pass. The report is
keyed to a sha256 of `HEAD` + the index/worktree diff + the content of every
untracked file, so editing anything — including a file the review never looked
at — invalidates it. `gate.sh fingerprint` is the single implementation; the
skill is told never to compute it by hand, because two implementations of one
hash is a bug waiting for a slow afternoon.

The gate is therefore strict in one direction only: it can force a re-review it
did not strictly need, and it cannot let a stale pass through.

## Why the blocking set is only four categories

The failure mode of a gate is not that it misses something — it is that it
becomes noise and gets routed around. Within a week of the first bogus block,
every `gh pr create` is prefixed with the override and the gate is decorative.

So: a skill's own `CRITICAL` (only three skills define one), a `security`
finding at HIGH confidence with attacker-controlled input confirmed, a
mechanically-checkable project invariant from the root `AGENTS.md`, and a
failing `typecheck`/`test` in a package that is actually in the diff. Every
one of those is either objective or backed by a named rule. Everything else
reports as a `WARNING` and gets fixed because it is right, not because a
script insisted.

The [evidence rule](severity.md#evidence-rule--how-a-critical-earns-the-name)
exists for the same reason: a `CRITICAL` without `file:line`, a quote and a
named rule is downgraded automatically.

## Why lanes, and why inline

The routing table in [routing.md](routing.md) is the context budget. Thirteen
skills is far more than any one diff needs; loading the two or three that match
the changed files is what keeps a review affordable.

It runs inline and sequentially rather than fanning out to subagents: the
routing table already bounds the context, lane order matters (the cheap
scripted invariants run first and can block on their own), and one agent
writing one report is more predictable than four merging into one. If a diff
ever gets big enough to change that calculus, the lane structure is already the
natural split.

## Why the report is git-ignored

It describes one machine's working tree at one moment — the untracked files
included. Committing it would mean committing a claim about a tree nobody else
has. It also has to stay invisible to `git status`, or writing it would change
the fingerprint it contains.

## Why the override exists

`PR_SELF_REVIEW_OVERRIDE=1 gh pr create …` is allowed, and stamps
`overridden_at` + `overridden_findings` into the report. A gate with no escape
hatch is not stricter, it is just easier to disable: the alternative to a
recorded override is someone deleting the hook, and then nothing is recorded at
all.

## Known limitations

- **Stale globs.** The coverage invariant catches a *new* skill that nothing
  routes to. It does not catch a glob that stopped matching after a rename.
  Reviews look thinner than they are when that happens, silently.
- **Local only.** Nothing mirrors these checks on GitHub. A branch pushed from
  a machine without this repo's `.claude/settings.json` is ungated. The report
  contract in [report.md](report.md) is deliberately machine-readable so a CI
  workflow can reuse `gate.sh check` later; that workflow is not written.
- **`gh` is not installed on every machine here.** The gate still blocks
  correctly — it refuses the command before the shell would fail to find it —
  but the PR itself has to be opened some other way until `gh` is present.
- **Commands the parser does not see as `gh`.** The gate reads the tool call's
  command string and splits it on `;`, `|`, `&` and newlines, skipping leading
  env assignments and `env`/`sudo`/`command`/`time`/`nohup`. A PR opened
  through a wrapper script, an alias, or the GitHub web UI is not intercepted.
  This is a local pre-PR gate, not a branch protection rule.

## Sources

- `.claude/settings.json` hook contract — the `PreToolUse`
  `hookSpecificOutput.permissionDecision` shape, the `matcher` syntax and the
  stdin payload come from the `update-config` skill's schema reference, not
  from memory. `/hooks` shows what is live.
- Root [AGENTS.md](../../../AGENTS.md) — every project invariant in
  [severity.md](severity.md#3-project-invariants) is quoted from it, including
  the do-not-touch list and the per-package package manager.
- [`scripts/check-shared-sync.sh`](../../../scripts/check-shared-sync.sh) — the
  contracts-sync invariant defers to this script rather than re-deriving it.
- [security/SKILL.md](../security/SKILL.md) — the confidence-based reporting
  model and the never-flag list are lifted from it and applied to every lane.
- [onion-architecture/enforcement.md](../onion-architecture/enforcement.md) —
  "a dependency rule nobody checks is a comment" is the argument this whole
  skill is built on, applied one level up.
