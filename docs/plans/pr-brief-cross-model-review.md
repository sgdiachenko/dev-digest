# Cross-model review: PR Brief implementation plan

- Spec: `docs/specs/2026-10-02-pr-brief.md`
- Plan: `docs/plans/pr-brief.md`
- Reviewer: Codex (GPT-6), 2026-10-02. The plan does not record the planner's model, so a different model family cannot be verified from the repository.
- Scope: plan and existing code review; no implementation or tests run.

## Findings

1. **AC-69 / S11 — layout mismatch.** The AC places Risk areas *inside* the Intent block. S11 and Q4 instead place a separate Risk areas block below an unchanged `IntentCard` in the left column. Either put the risks inside the block or amend the approved AC explicitly.
2. **AC-24–AC-26 / S7 — token budget has no guaranteed terminal case.** The reduction order removes specs, issue, description, callers and diff-stat entries, but retains the blast summary and changed symbols without a cap. Those fields (and an unusually large intent) can still leave the system and user messages above 8,000 tokens. The loop needs an explicit policy for irreducible input; the spec's priority rule may need clarification.
3. **AC-47, AC-54 / S7, S6, S13 — nonpositive focus lines can reach storage.** `BriefModelOutput.line` accepts any integer. When a file has no stored patch or added line, S6 retains that value, while S1 requires `ReviewFocusItem.line >= 1`. A model value of `0` or `-1` can therefore produce a storage/schema failure outside the planned `invalid_output` branch. Reject it in the model output schema and test the no-patch case.
4. **AC-105 / S9, S10 — Intent fix link has no target.** S9 returns `#intent`, but the existing `IntentCard` and PR page have no element with `id="intent"`. Add an anchor to the Intent block and verify that the link lands there, or choose a working action.
5. **AC-23, AC-49, AC-60 / S7, S13 — blast projection is underspecified.** S7 says the prompt includes only summary, changed-symbol names/files and caller names/files/lines, yet `sentBlast` is typed as the full `BlastRadius` and is described only as having callers trimmed. The full type also has downstream endpoint and cron fields. Define a projected blast value used consistently for prompt text, stored `blast`, and the path allow-list; test that unsent caller paths are excluded.
6. **AC-1–AC-19, NFR-4 / S14, T10 — integration gate is deferred.** S14 writes `brief.it.test.ts` but explicitly does not run it. Unit tests with fake ports cannot establish HTTP response schemas, database upsert, workspace isolation or disconnect behavior. Require an integration run before the plan is considered verified and identify who runs it.
7. **NFR-1 / S13 — 75-second request bound is unproven.** The plan bounds blast, issue, specs and LLM calls, but leaves initial PR/file reads, model selection, persistence and the final PR read outside an overall deadline. It also notes that timed-out input reads continue in the background. Add a total request deadline and a measurement for the specified latency target, or record the limitation against NFR-1.

## Work packages and dependencies

No same-file ownership overlap appears in W1–W6. Their declared wave dependencies are acyclic. S11's temporary optional navigation props deliberately allow W5 to typecheck before W6, but the plan should require S18 to make the real wiring mandatory or add a final assertion so the no-op defaults cannot ship unnoticed.

## Unsupported assumptions

- **S4 / AC-41–AC-42:** The plan does not define precedence when the repository has no catalog and also has no attachments. `resolveForRun` returns `none` before consulting the catalog; a similar `resolveForRepo` implementation would report `none_attached` rather than `no_catalog`. Specify and test the precedence.
- **S14 / AC-16:** The service's promise is said to outlive client disconnects, but the plan gives no real HTTP disconnect test; the S13 fake-promise test does not establish Fastify behavior.
