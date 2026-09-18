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
- [`flaky-test-signals.md`](./flaky-test-signals.md) (`custom`) — seeded via
  the real **import** path (source `imported_url`), linked but disabled
  ("needs vetting") on Test Quality Reviewer

All four seed as `source: 'manual'` — the workspace's own instructions, so
`ReviewRunExecutor` renders them raw in the prompt rather than
`<untrusted>`-wrapping them (see [../README.md](../README.md)).
