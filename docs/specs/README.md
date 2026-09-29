# Specs

Two kinds of files live here:

- **`SPEC-NN-<slug>.md`** — Spec-Driven-Development requirements, written
  **before** planning by the `spec-creator` agent
  ([`.claude/agents/spec-creator.md`](../../.claude/agents/spec-creator.md)):
  EARS acceptance criteria, edge cases, NFRs, module communication,
  traceability. An `approved` spec is never rewritten — a changed decision
  is a new spec with `Supersedes:`. After verification `doc-writer` sets
  `implemented` and appends an `## Implementation` section.
- **Other files** (e.g. [`conventions.md`](conventions.md)) — design records
  of implemented cross-package features, written by `doc-writer` after
  verification.

## Registry

Maintained by `spec-creator` (new rows, `draft` → `approved`, "superseded
by") and `doc-writer` (`approved` → `implemented`). Numbers are global and
never reused.

| ID | Title | Status | Modules | Supersedes | Superseded by |
|---|---|---|---|---|---|
