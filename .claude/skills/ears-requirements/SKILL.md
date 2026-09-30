---
name: ears-requirements
description: "Writing and checking testable requirements in EARS (Easy Approach to Requirements Syntax) for dev-digest SDD specs (docs/specs/<YYYY-MM-DD>-*.md): the five patterns with the course's Ukrainian triggers (КОЛИ, ПОКИ, ЯКЩО…ТОДІ, ДЕ) and the shall marker, the AC line format (ID, pattern, story, priority, verify hint), banned vague words and their rewrites, measurable non-functional requirements, the traceability matrix, and the spec self-check. Use when writing, revising or reviewing a spec, or when verifying code against a spec's AC/EC/NFR IDs. Trigger terms: EARS, acceptance criteria, AC, requirement, shall, spec, spec ID, traceability, NFR, testable requirement."
metadata:
  tags: requirements, ears, sdd, acceptance-criteria, traceability
---

# EARS requirements for dev-digest specs

EARS was introduced by Mavin, Wilkinson, Harwood and Novak (Rolls-Royce) at
IEEE RE'09. It separates the **condition** from the **system response**, so
each requirement is one checkable statement.

## The five patterns (course convention)

The spec text is English; the EARS **trigger words stay Ukrainian** and
**shall** marks a mandatory requirement. This is a local course convention,
not part of EARS itself.

| Pattern | Form | Use for |
|---|---|---|
| Ubiquitous | `The system shall <response>.` | always-true behaviour |
| Event-driven | `КОЛИ <trigger>, the system shall <response>.` | a reaction to one event |
| State-driven | `ПОКИ <state>, the system shall <response>.` | behaviour while a state holds |
| Unwanted behaviour | `ЯКЩО <unwanted condition>, ТОДІ the system shall <response>.` | failures, invalid input, timeouts |
| Optional feature | `ДЕ <option is enabled/present>, the system shall <response>.` | configurable or optional parts |
| Complex | `ПОКИ <state>, КОЛИ <trigger>, the system shall <response>.` | only when one trigger is not enough |

"The system" may be a concrete module when the requirement is about a
boundary: `the server shall`, `the MCP tool shall`, `the PR page shall`.

## AC line format

```
AC-7 [unwanted, US-2, must, verify: integration] ЯКЩО the LLM call times out after 60 s, ТОДІ the server shall store the run as `failed` with reason `llm_timeout` and return no findings.
```

- `AC-n` — stable ID, never renumbered; dropped items are struck through
  (`~~AC-4~~ — dropped per Q3`), new ones appended.
- `[pattern, US-n, priority, verify: …]`:
  - priority — `must` | `should` | `could` (MoSCoW; `won't` goes to
    Non-goals). A planner may defer `should`/`could` only via an answered
    question, never silently.
  - verify — how a checker proves it: `unit` | `integration` | `e2e` |
    `manual` (+ what to look at). `manual` needs a reason (visual, needs a
    real LLM/GitHub, timing).
- One requirement per line: no "and/or" joining two responses. Two
  responses → two ACs.

## Testability rules

A requirement is testable when it names **an actor or trigger**, **one
observable response** and **numbers instead of adjectives**.

Banned unless a number or definition follows: *fast, quickly, slow, normal,
properly, correctly, user-friendly, intuitive, simple, large, small, many,
few, reasonable, robust, gracefully, seamless, appropriate, sufficient,
etc., and/or, if possible, as needed, support (without saying how).*

| Vague | Testable |
|---|---|
| "Must work fine on large repositories" | `КОЛИ the repository exceeds the indexing threshold, the system shall build the overview only from deterministic facts, without reading every file in full.` |
| "Must not crash if the model is unavailable" | `ЯКЩО the structured model call fails, ТОДІ the system shall show the deterministic overview with the degradation reason.` |
| "Should suggest where to start reading" | `The system shall order the reading path by file rank in the import graph.` |
| "Loads fast" | `КОЛИ the user opens the PR page, the page shall render the findings list within 1 s for ≤ 500 findings on the seeded dataset.` |
| "Handles errors gracefully" | `ЯКЩО GitHub returns 401, ТОДІ the PR page shall show "GitHub token is invalid" with a link to Settings and shall not retry automatically.` |

If you cannot make it testable, it is an **Open question**, not an AC.

## Coverage checklist per feature

- Every user story has ≥1 event-driven or ubiquitous AC (the happy path).
- Every failure the analysis found has an **unwanted-behaviour** AC:
  LLM unavailable / timeout / invalid structured output; GitHub
  unavailable / 401 / 404 / rate limit; DB error; invalid or oversized
  input; concurrent run of the same thing; stale data after resync.
- Every long-running operation has a **state-driven** AC (what the UI
  shows ПОКИ it runs) and says whether it can be cancelled.
- Every setting/flag has an **optional-feature** AC for both on and off
  where "off" is not obvious.

## Non-functional requirements (NFR-n)

Same line format, measurable. Walk these categories and write
"n/a — <why>" for the ones that don't apply, so absence is a decision:

| Category | Measurable form |
|---|---|
| Performance | latency/throughput with a percentile, dataset and condition (`p95 ≤ 300 ms for GET … on the seeded DB`) |
| LLM cost | model calls per action, token budget, which feature-model setting picks the model |
| Limits | max sizes/counts and the behaviour when exceeded |
| Reliability | retries, idempotency, what survives a restart |
| Security | handling of each untrusted input (links to the *Untrusted inputs* section) |
| Accessibility | keyboard path, focus order, labels, WCAG 2.2 AA items that apply |
| Observability | what is logged/recorded (and what must never be: secrets, full diffs) |
| Compatibility | existing API/MCP consumers, existing DB rows, migration need |
| i18n | user-visible strings come from message catalogs (`client/messages/en`) |

## Traceability matrix

The spec ends its requirement part with a matrix so a planner and a
verifier can walk it mechanically:

```
| Story | AC | EC | NFR | Verify |
|---|---|---|---|---|
| US-1 | AC-1, AC-2, AC-7 | EC-1 → AC-7 | NFR-2 | integration, e2e |
```

- Every `US` appears; every `AC`/`EC`/`NFR` appears at least once.
- Downstream: `implementation-planner` steps carry `covers: AC-n`;
  `plan-verifier` uses the IDs as its requirement rows and looks for
  evidence of the kind named in `verify:`; `doc-writer` appends an
  `## Implementation` section keyed by the same IDs.

## Self-check (before a spec is returned)

- [ ] Every AC has an ID, pattern, story, priority and `verify:`.
- [ ] Every AC contains **shall**, one response, the right trigger word
      for its pattern, and no banned word without a number.
- [ ] Every `US` is covered; the traceability matrix has no orphan ID.
- [ ] Every failure found in analysis has an unwanted-behaviour AC or EC.
- [ ] Every NFR category is filled or explicitly `n/a — <why>`.
- [ ] No implementation detail (files, functions, tables, libraries).
- [ ] IDs are stable (no renumbering; struck items keep their ID).

## Reading a spec as a verifier

- Evidence for an AC is behaviour: a test asserting trigger → response
  (`path:line`), matching its `verify:` kind. Code without a test is
  `partial`; a "done" claim is not evidence.
- For `ЯКЩО … ТОДІ` ACs the evidence must exercise the failure branch.
- `verify: manual` rows are `not-verifiable` for a static checker — say
  what a human must look at.
