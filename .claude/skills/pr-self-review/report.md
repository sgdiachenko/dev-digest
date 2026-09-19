# Report — the contract between the skill and the gate

The skill writes; [`assets/gate.sh`](assets/gate.sh) reads. Two files per
branch, in `.claude/pr-self-review/` (git-ignored — a report describes one
machine's working tree and must never travel in a commit):

```
.claude/pr-self-review/<branch-slug>.json   # the gate reads this
.claude/pr-self-review/<branch-slug>.md     # the human reads this
```

`<branch-slug>` is the branch name with `/` replaced by `__`. Never guess it:

```sh
.claude/skills/pr-self-review/assets/gate.sh report-path
```

## JSON shape

Field names are `snake_case`, like every other wire format in this repo.

```json
{
  "fingerprint": "c0afc5ea…",
  "created_at": "2026-09-17T18:40:00Z",
  "branch": "H02",
  "base_sha": "0567b6c6…",
  "verdict": "request_changes",
  "lanes": ["project-invariants", "backend-http", "frontend-components"],
  "skills_loaded": ["onion-architecture", "fastify-best-practices", "react-best-practices"],
  "unmapped_skills": [],
  "checks": [
    { "name": "check-shared-sync", "command": "./scripts/check-shared-sync.sh", "exit_code": 0 },
    { "name": "server-typecheck", "command": "pnpm -C server typecheck", "exit_code": 1 }
  ],
  "findings": [
    {
      "severity": "CRITICAL",
      "file": "server/src/modules/pulls/routes.ts",
      "line": 12,
      "skill": "onion-architecture",
      "rule": "onion-no-persistence-in-http",
      "summary": "route imports drizzle-orm directly",
      "evidence": "import { eq } from 'drizzle-orm';",
      "fix": "move the query into pulls/repository.ts and call it through the service"
    }
  ]
}
```

### Fields the gate depends on

Three, and only three — keep them exact or the gate fails open or shut for the
wrong reason:

- **`fingerprint`** — identity of the reviewed working tree. Always taken from
  `gate.sh fingerprint`, never computed by hand: the gate recomputes it with
  the same function and refuses the PR when the two differ. It covers `HEAD`,
  the index/worktree diff, and the content of untracked files.
- **`findings[].severity`** — the gate counts `CRITICAL`. See
  [severity.md](severity.md).
- **`findings[].file` / `.line` / `.skill` / `.summary`** — rendered into the
  denial message, so they must read as an instruction to a person who cannot
  see the report.

`verdict` is for humans and future CI: `approve` (nothing above
`SUGGESTION`), `comment` (warnings only), `request_changes` (any `CRITICAL`) —
the same `lower_snake_case` vocabulary as the review contracts in
`@devdigest/shared`.

### Write order

Compute the fingerprint **last**, after every check has run and every file is
in its final state, then write the JSON. A fingerprint taken before the last
edit describes a tree that no longer exists, and the gate will correctly call
the report stale.

Writing the report does not itself change the fingerprint —
`.claude/pr-self-review/` is git-ignored, so it is invisible to
`git status`/`git diff`. That is why the ignore entry is not optional.

## Markdown shape

Same data, ordered for reading: verdict line, then a findings table sorted
`CRITICAL` → `WARNING` → `SUGGESTION`, then the checks that ran, then the
lanes and the skills each one loaded. Keep it short enough to read in the
terminal — it is the file the denial message points at.

## Overrides

A deliberate bypass (`PR_SELF_REVIEW_OVERRIDE=1 gh pr create …`) is allowed by
the gate, which then stamps the report with `overridden_at` and
`overridden_findings`. Never delete those keys on a later write: the point of
an override is that it leaves a trace.
