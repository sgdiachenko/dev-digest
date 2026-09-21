# Built-in skill bodies

Human-readable mirrors of the seeded skills (`server/src/db/seed-skills.ts`),
same convention as the sibling reviewer prompts: the DB row is the source of
truth at run time, these files are for review.

- [`pr-quality-rubric.md`](./pr-quality-rubric.md) (`rubric`) — linked to
  General Reviewer
- [`no-then-chains.md`](./no-then-chains.md) (`convention`) — linked to
  General Reviewer
- [`secret-leakage-gate.md`](./secret-leakage-gate.md) (`security`) — linked to
  Security Reviewer
- [`test-coverage-nudge.md`](./test-coverage-nudge.md) (`custom`) — linked to
  Test Quality Reviewer
- [`wire-format-convention.md`](./wire-format-convention.md) (`convention`) —
  linked to API Contract Reviewer
- [`breaking-change.md`](./breaking-change.md) (`rubric`) — linked to API
  Contract Reviewer
- [`response-schema.md`](./response-schema.md) (`rubric`) — linked to API
  Contract Reviewer
- [`deprecation-policy.md`](./deprecation-policy.md) (`custom`) — linked to API
  Contract Reviewer
- [`semver-discipline.md`](./semver-discipline.md) (`custom`) — linked to API
  Contract Reviewer
- [`flaky-test-signals.md`](./flaky-test-signals.md) (`custom`) — seeded via
  the real **import** path (source `imported_url`), linked but disabled
  ("needs vetting") on Test Quality Reviewer

All but `flaky-test-signals` seed as `source: 'manual'` — the workspace's own
instructions, so `ReviewRunExecutor` renders them raw in the prompt rather than
`<untrusted>`-wrapping them (see [../README.md](../README.md)).

The last four are prompt-sized distillations of this repo's own review skills in
`.claude/skills/<name>/SKILL.md`. Those files are **Claude Code** instructions
(`/pr-self-review` routes them at a local diff) and are never read by a review
run inside the app — an in-app agent only ever sees the `skills` rows seeded
from `seed-skills.ts`. Editing one of the `.claude/skills/` files does not
change what API Contract Reviewer receives; the body here does.
