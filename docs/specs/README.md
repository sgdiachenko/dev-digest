# Specs

Two kinds of files live here:

- **`YYYY-MM-DD-<slug>.md`** — Spec-Driven-Development requirements, written
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
by") and `doc-writer` (`approved` → `implemented`). The ID is the file name without `.md` (the
creation date + a kebab-case slug); an ID is never reused.

| ID | Title | Status | Modules | Supersedes | Superseded by |
|---|---|---|---|---|---|
| [2026-09-30-project-context-catalog](2026-09-30-project-context-catalog.md) | Project Context — document catalog, preview and token counts | implemented | server, client | none | — |
| [2026-09-30-project-context-attachments](2026-09-30-project-context-attachments.md) | Project Context — attach documents to agents and skills, inject them into runs, show them in the run trace | implemented | server, client, reviewer-core | none | — |
| [2026-10-01-onboarding-tour-facts](2026-10-01-onboarding-tour-facts.md) | Onboarding Tour — deterministic facts and page | implemented | server, client, e2e | none | — |
| [2026-10-01-onboarding-tour-narrative](2026-10-01-onboarding-tour-narrative.md) | Onboarding Tour — AI narrative and Regenerate | implemented | server, client | none | — |
| [2026-10-02-pr-brief](2026-10-02-pr-brief.md) | PR Brief — Why + Risk brief on the Overview tab | approved | server, client | none | — |
| [2026-10-08-eval-pipeline](2026-10-08-eval-pipeline.md) | Eval Pipeline — eval cases from findings, agent suite runs, metrics, Eval Dashboard and run comparison | approved | server, client, reviewer-core, e2e | none | — |
