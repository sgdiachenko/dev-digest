# INSIGHTS — reviewer-core

Practical findings hit while working in this module. Append-only: correct a
stale entry with a new dated line — never silently edit or delete history.

Before writing here, check [AGENTS.md](AGENTS.md) — a finding that should
*always* apply belongs there as a standing rule. This file is for things too
specific, too contextual, or too unproven for that yet.

**Anti-vague test:** if someone who just read the code wouldn't be surprised,
don't write it here.

## What Works

## What Doesn't Work

## Codebase Patterns

## Gotchas & Recurring Errors

**2026-09-23** — `OpenRouterProvider.completeStructured` (`src/llm/openrouter.ts`) accepts a `req.timeoutMs` field on `StructuredRequest` but never reads it — the only timeout actually applied is the OpenAI SDK's client-level `timeout` set once at construction (`OpenRouterProviderOptions.timeoutMs`, default 90s). A caller that needs a hard per-call deadline shorter than that (e.g. the Intent Layer's "≤30s" requirement for `POST /pulls/:id/intent`) cannot get it from `req.timeoutMs` and must wrap the call itself with `platform/resilience.ts`'s `withTimeout(promise, ms)` at the call site instead. Evidence: `reviewer-core/src/llm/openrouter.ts` (`completeStructured`, `req.timeoutMs` unused), `server/src/modules/intent/service.ts` (`withTimeout(llm.completeStructured(...), EXTRACT_TIMEOUT_MS)`).

**2026-09-23** — `wrapUntrusted(label, content)`'s escaping originally covered only `content` (stripping a `</untrusted>` close-tag attempt) — it did NOT sanitize `label`, which becomes the `source="…"` attribute value verbatim. That was fine while every call site passed a hardcoded identifier (`'diff'`, `'pr-description'`, …), but `run-executor.ts`'s `wrapUntrusted(\`skill:${s.name}\`, ...)` and the Intent Layer's `spec:${path}`/`issue:#${n}` labels interpolate PR-authored content (an imported skill's display name, a repo file path) — a path/name containing `">` breaks out of the attribute and the tag itself, undetected by content-only escaping since the injection lives in the SECOND argument, not the first. Fixed at the root in `wrapUntrusted` (a small safe-charset allowlist on `label`) rather than in each caller, since a future caller passing untrusted content as a label would otherwise need to remember to sanitize it itself. Evidence: `reviewer-core/src/prompt.ts` (`sanitizeLabel`, `LABEL_UNSAFE_CHARS_RE`).

**2026-10-01** — Correction to the 2026-09-23 entry above: `completeStructured` now forwards `req.timeoutMs` (and the new `req.httpRetries`) to the OpenAI SDK as per-request options, so a per-call deadline works without the wrapper; the server's intent and onboarding callers still wrap with `withTimeout` as a second guard. Effective timeouts for the existing callers did not change (intent 30 s, conventions 90 s, the client default). Evidence: `reviewer-core/src/llm/openrouter.ts:104-109`.

**2026-10-01** — The "no endpoint satisfies `provider.require_parameters`" response is not documented by OpenRouter. `OpenRouterProvider` maps it to `NoEligibleProviderError` by matching message text (`NO_ENDPOINT_RE`) on HTTP 400/404/422/503, and on an HTTP 200 body without `choices`; the status codes and wording come from community reports and the errors table, and the mapping has NOT been checked against a live call. The regex can still match an ordinary "Provider returned error ... requested parameters" bad request (review ledger F11, accepted). Evidence: `reviewer-core/src/llm/openrouter.ts:26-33,111-129`, `reviewer-core/test/openrouter.test.ts`.

## Open Questions

## Session Notes
