# Severity — normalization and the blocking set

The skills disagree with each other, on purpose: `onion-architecture`,
`frontend-architecture` and `react-best-practices` each define their own
`CRITICAL/HIGH/MEDIUM`; `security` runs a confidence scale
(`HIGH/MEDIUM/LOW`); `fastify-best-practices`, `drizzle-orm-patterns`,
`postgresql-table-design`, `zod` and `typescript-expert` define no severity at
all. A gate cannot read five scales. This file collapses them into one.

## Report levels

Three, matching the `Severity` contract in `@devdigest/shared` so a finding can
later be pushed through the same pipeline as a real review:

- **`CRITICAL`** — blocks the PR. The gate refuses `gh pr create` / `merge`.
- **`WARNING`** — reported, does not block.
- **`SUGGESTION`** — reported last, does not block.

## Mapping

| Source | Becomes |
|---|---|
| A skill that defines `CRITICAL`, at its `CRITICAL` | `CRITICAL` |
| Same skill at `HIGH` | `WARNING` |
| Same skill at `MEDIUM` | `SUGGESTION` |
| `security` at HIGH confidence **and** attacker-controlled input confirmed | `CRITICAL` |
| `security` at MEDIUM confidence | `WARNING`, tagged `needs manual verification` |
| `security` at LOW confidence | not reported at all — the skill's own rule |
| A skill with no severity scale (`fastify`, `drizzle`, `postgresql`, `zod`, `typescript-expert`) | `WARNING` at most — **these can never block** |
| A project invariant below | `CRITICAL` |
| `typecheck` or `test` failing in a package in the diff | `CRITICAL` |
| Unmapped skill found by the coverage invariant | `SUGGESTION` |

A skill without its own scale cannot block, and that is not an oversight: those
skills document preferences and idioms, and a preference is not grounds to stop
a merge. If one of them ever describes a defect worth blocking, it belongs in
the invariant list below, stated explicitly.

## The blocking set

Exactly four categories produce `CRITICAL`. Nothing else does.

### 1. A skill's own CRITICAL

Only from the three skills that define the level — cite the skill and the rule.

### 2. security, HIGH confidence

The `security` skill's own golden rule decides: `fetch(process.env.API_URL)` is
safe, `fetch(req.query.url)` is not. Trace the input to an attacker-controlled
source before calling it `CRITICAL`; if the source is unclear it is a
`WARNING`, not a block.

### 3. Project invariants

From the root [AGENTS.md](../../../AGENTS.md). Each is mechanically checkable,
so check it — do not eyeball it.

`$BASE` below is `gate.sh base`, and `$D` is the full diff of all open
changes — both hunk sources from step 1 of [SKILL.md](SKILL.md):

```sh
BASE="$(.claude/skills/pr-self-review/assets/gate.sh base)"
D() {                                   # added/removed lines, all four change kinds
  git diff "$BASE"...HEAD "$@"
  git diff HEAD "$@"
  git ls-files --others --exclude-standard -- "$@" \
    | while IFS= read -r f; do git diff --no-index -- /dev/null "$f" || true; done
}
```

The third branch matters: an untracked file is invisible to both `git diff`
calls, and a secret pasted into a brand-new file is exactly the case that must
not slip through. `git diff --no-index` renders it as all-added lines, so the
same `^\+` greps work on it.

| Invariant | Check |
|---|---|
| The two `@devdigest/shared` copies must stay in step | `./scripts/check-shared-sync.sh` exits non-zero |
| `adapters.ts` is server-only | `test -f client/src/vendor/shared/adapters.ts` |
| Lock files are never hand-edited | a lock file in the changed-file list whose package's `package.json` is not also in it |
| Secrets live in `~/.devdigest/secrets.json`, never in the repo | `D -- . ':(exclude)*.example*' \| grep -nE '^\+.*(sk-[A-Za-z0-9]{8,}\|ghp_[A-Za-z0-9]{8,}\|github_pat_[A-Za-z0-9_]{8,}\|AKIA[0-9A-Z]{12,}\|BEGIN [A-Z ]*PRIVATE KEY)'` |
| `server/clones/` is git-ignored working state | any changed path matching `^server/clones/` |
| `docker compose down -v` destroys every imported repo and review | `D -- . ':(exclude)*.md' \| grep -nE '^\+.*docker compose down -v'` |
| Migrations are immutable | `D --name-status -- server/src/db/migrations/ \| grep -E '^(M\|R\|D)'` |
| Migrations are auto-named by `drizzle-kit` | a migration added by the diff whose basename fails `^[0-9]{4}_[a-z0-9_]+\.sql$` |
| `AGENTS.md` is canonical, `CLAUDE.md` is a committed symlink | for each `CLAUDE.md` in the diff, `git ls-files -s <path>` must start with `120000` |

Two of these are diff-scoped on purpose, and getting that wrong is the
documented way to build a gate nobody trusts:

- The `docker compose down -v` check excludes `*.md`, because four files in
  this repo — root `AGENTS.md`, root `README.md`, `e2e/AGENTS.md`,
  `e2e/README.md` — *warn against* that command in prose. Scanning whole files
  instead of added lines blocks a PR for editing the very docs that state the
  rule.
- The secret check reads added lines only and skips `*.example*`, so a
  committed sample config stays legal while a real key does not.

### 4. A failing package check

Per-package, and only for packages that appear in the diff — the package
managers differ (`AGENTS.md`: pnpm in `server/`/`client/`, npm in
`reviewer-core/`/`e2e/`). The exact commands are in
[step 5 of SKILL.md](SKILL.md#step-5--check-the-packages-in-the-diff).

**Every check CI gates on counts, not just `typecheck` and `test`:**

| Check | Why it blocks |
|---|---|
| `lint` | CI fails on it (`client.yml`, `server-unit.yml`) |
| `typecheck` | the code does not compile |
| `arch:check` (server only) | the mechanical form of `onion-architecture`; catches layer breaks `typecheck` cannot see |
| unit tests | behaviour is broken |

Not counted, and never a `CRITICAL`:

- **integration tests** (`*.it.test.ts`) — they need Postgres and have their own
  workflow; record them as *skipped*;
- **a package with no `node_modules`** — `exit 127` is a missing install, not a
  defect; record it as *skipped (deps not installed)*;
- **any check run while the working tree was still moving** — re-run it after
  `gate.sh fingerprint` holds steady, and use the later result.

The first two of those, and a check piped into `tail` (which returns *`tail`'s*
exit code), are the three documented ways to manufacture a `CRITICAL` that is
not real. A false block is the one failure this gate cannot survive.

## Evidence rule — how a CRITICAL earns the name

A `CRITICAL` must carry three things:

1. `file:line` inside the diff,
2. the changed line quoted verbatim,
3. the skill and rule it violates, named.

Missing any one of them, it is downgraded to `WARNING`. This is not
bureaucracy: a gate that blocks on unverifiable findings gets routed around
within a week, and then nothing is gated at all.

## Never flagged

Borrowed from [security/SKILL.md](../security/SKILL.md) and applied to every
lane:

- pre-existing code outside the changed lines — the review is diff-scoped,
- test files and fixtures, for anything but their own lane's rules,
- dead code and code gated by `NODE_ENV`,
- server-controlled values (env vars, config constants),
- patterns the framework already mitigates (JSX escaping, Drizzle's
  parameterized queries),
- style and formatting. No linter opinions; `eslint` already runs in CI.
