# PR self-review: emdash/multi-agents-review-putg6

**Verdict: approve** (nothing above SUGGESTION). Fingerprint `b90cac5b…a558b`.

## Findings

| Severity | file:line | Skill | Status |
|---|---|---|---|
| SUGGESTION | `client/src/app/repos/[repoId]/multi-agent/[number]/_components/MultiAgentResults/MultiAgentResults.tsx:12` | frontend-architecture | Accepted (plan R6): RunTraceDrawer imported from another route's private folder; lift to `components/` on a third consumer |

Resolved during this review (not open): unbounded `agent_ids` and non-uuid ids (security WARNING), run-to-agent mapping by RETURNING order (WARNING), stale Tabs after group run (WARNING), `$1e-7` cost format (WARNING), missing test coverage rows (AC-55, AC-28, NFR-2, NFR-6), duplicated formatters and start flow (SUGGESTION, fixed), estimates query scanning full history (SUGGESTION, fixed with LATERAL and an index).

## Checks

| Check | Exit | Note |
|---|---|---|
| check-shared-sync | 0 | |
| server lint / typecheck / arch:check | 0 / 0 / 0 | |
| server unit | 0 | 773 passed |
| client lint / typecheck / test | 0 / 0 / 0 | 583 passed |
| reviewer-core typecheck / test | 0 / 0 | 52 passed |
| mcp-server typecheck / test | 0 / 0 | |
| multi-agent integration (Docker Postgres) | 0 | 12 passed |
| all server integration (Docker Postgres) | 1 | 158 passed; one NFR-1 timing test in `context-attachments.it.test.ts` failed once and passed on two reruns; that file is unchanged |
| e2e typecheck | skipped | no e2e files changed |

## Lanes and skills

Lanes: project invariants, server onion layering, server HTTP, client frontend, shared contracts, security. Skills consulted through the lane reviewers: onion-architecture, frontend-architecture, security, zod, response-schema, breaking-change. Reviewers: architecture-reviewer (approve), security-reviewer (one WARNING, fixed), /code-review medium (seven findings, all fixed or accepted).

## Notes

- The diff base is the merge-base with `origin/main`, so the 369 changed paths include earlier commits on this branch (for example reviewer-core eval work). Those commits pass their own checks above.
- Migrations `0019_far_puff_adder.sql` and `0020_abnormal_morg.sql` are generated and not applied. Apply with `pnpm db:migrate` manually.
- The 1-vs-3 measurement (AC-45, NFR-1) needs a real LLM run and is left to the user.
