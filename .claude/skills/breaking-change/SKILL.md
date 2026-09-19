---
name: breaking-change
description: Review backend PRs for backward-incompatible public API changes. Use when routes, request/response contracts, validation, serialization, HTTP statuses, or endpoint behavior change, including changes in services, repositories, middleware, and adapters that affect API consumers.
---

# Breaking Change

Answer: **Will an old client stop working after this PR?** Review the new
server against the old consumer contract, without requiring clients to upgrade.
The public contract includes observable behavior, not just endpoint signatures.

## When to apply

- Review changes to endpoint registration, prefixes, methods, parameters,
  request/response schemas, validators, serializers, headers, or error mapping.
- Review service, repository, middleware, adapter, and configuration changes
  when they can change an existing endpoint's externally visible behavior.
  Include DB changes when their effects reach API output or behavior.
- Review shared contract changes even if backend route files are untouched.
- On explicit API compatibility requests, trace the affected backend modules.

Pure internal renames, refactors, logging, or DB changes with no observable API
effect are not breaking changes. New endpoints alone do not break old clients;
check whether registration shadows existing routes. Do not review general code
quality or unrelated pre-existing defects.

## Review workflow

1. Establish the comparison: PR target merge-base versus proposed head. For a
   local review, also include staged, unstaged, and untracked changes. Use the
   caller's supplied base/scope when provided; do not silently assume `HEAD~1`.
   If the baseline is unavailable, state that compatibility is unverified.
2. Inventory affected public operations as HTTP method + full registered path,
   including prefixes and aliases. Read both old and new code. Follow changed
   behavior through unchanged callers to the public endpoint; anchor findings
   to the change that introduced the regression.
3. Reconstruct the old contract from runtime validation/serialization,
   shared schemas, API documentation, tests, and consumer usage. Inspect
   `client/src/` where useful, but absence of an in-repo caller does not prove
   that external consumers do not exist. Distinguish guaranteed behavior from
   incidental implementation details; explain conflicting evidence.
4. Apply the checklist below. For every suspected break, give an old valid
   request or consumer expectation and show how the new server violates it.
   Check actual compatibility shims, defaults, route aliases, and API versions
   before reporting. A deprecation note alone does not preserve compatibility.
5. Where practical, run existing relevant checks or replay a focused old-client
   contract fixture against the new implementation in an isolated test context.
   Do not perform live mutations. Report checks actually run and any limits;
   passing new-client tests or TypeScript compilation is not compatibility proof.

In this repo, wire DTO fields are `snake_case`. Contracts live in both
`server/src/vendor/shared/contracts/` and `client/src/vendor/shared/contracts/`;
inspect both. Updating both copies and the client in one PR does **not** protect
already deployed clients. `adapters.ts` is server-only; an internal port change
is relevant here only if its effects reach the public API.

## Required checklist

| Change | Compatibility question |
|---|---|
| Endpoint removed | Does the old method + URL still perform the old operation? |
| Endpoint renamed or moved | Is the old route retained with equivalent behavior? Redirects alone may change method, body, or client handling. |
| HTTP method changed | Does the old method still work, with the same effect and response? |
| Path parameter changed | Are old URL shapes, accepted values, identifier meaning, and encoding still supported? Renaming only `:id` to `:repoId` internally is not a wire break if binding and URL semantics stay identical; check published generated-client interfaces separately. |
| Query parameter removed or renamed | Is the old parameter still honored? Silently ignoring an old filter or pagination parameter can break semantics even with HTTP 200. |
| Optional parameter becomes required | Do requests omitting it still work? Include path, query, body, and headers; consider defaults, nulls, and empty values. |
| Request field renamed or removed | Are old payloads still accepted and interpreted as before, including nested fields? Accepting but stripping a field can still break behavior. |
| Response field removed or renamed | Can an old consumer still read all promised fields, including nested objects and error bodies? |
| Field type changed | Are request inputs still accepted, and do outputs still meet the old type, format, nullability, presence, enum, and precision expectations? |
| Status code changed | Can an old consumer's status branch, body parser, retry, or error handling fail? Do not treat all 2xx codes as interchangeable. |
| Endpoint semantics changed | Are defaults, filtering, ordering guarantees, pagination/cursors, units, side effects, idempotency, and completion guarantees preserved? Check synchronous-to-asynchronous changes. |

Also inspect auth requirements/scopes, required headers, content types, error
codes/envelopes, validation bounds, and rate/size limits when changed. These are
public contract changes even when every route and field name stays the same.

Compatibility is directional: narrowing accepted requests can break callers;
widening possible responses can break readers (for example a new enum member
or newly nullable field). Adding an optional request field is usually safe if
omission preserves old behavior. Adding a response field is usually safe for
tolerant readers; check evidence of strict decoders before declaring a break.
Do not label every additive change incompatible based on hypothetical clients.

## Bad and good practices

These are illustrative contracts, not assertions about existing repo endpoints.
“Good” means compatibility is preserved under the stated conditions.

| Bad: changes the existing contract | Good: preserves the old client |
|---|---|
| Delete `GET /repos/:id/reviews` or replace it with `GET /reviews?repo_id=...`. | Keep the old route as an adapter with the same response and behavior; add the new route separately. |
| Replace `POST /reviews` with `PUT /reviews`. | Retain POST behavior; expose PUT separately if needed. |
| Change `/repos/:id` from accepting numeric IDs to accepting only slugs. | Preserve numeric lookup on the existing route; add an unambiguous slug route. |
| Remove `?state=open` and return all reviews. | Continue honoring `state`; introduce new filtering without changing old requests. |
| Change `limit: z.number().optional()` to a required field. | Keep omission valid and preserve its previous default and results. |
| Rename request `repo_id` to `repository_id` and reject or ignore `repo_id`. | Accept both names, normalize internally, and define conflict handling without invalidating formerly valid payloads. |
| Remove response `findings_summary` because the new UI no longer reads it. | Continue returning the old field with its old meaning; add a replacement if old readers tolerate extra fields. |
| Return `cost_usd: "0.10"` where the contract promised a number. | Keep the numeric field; put a different representation in a separate compatible field or version. |
| Change `200` with JSON to `204`; the old client calls `response.json()`. | Keep the old status and body; expose the new response contract through a separate version. |
| Keep `200` and the same schema but change `cost_usd` from dollars to cents. | Preserve dollars on the old endpoint; expose explicitly named units in a compatible extension or new version. |
| Return before persistence completes where success previously guaranteed a readable resource. | Preserve the completion guarantee; expose asynchronous behavior as a separate operation/version. |
| Update server and bundled UI together and call the change compatible. | Verify a request/decoder from the old client against the new server. |

A version bump, migration guide, or coordinated deployment can explain an
intentional break, but does not make the old endpoint compatible. A new API
version preserves old clients only while the old version remains functional.
Report intended incompatibilities explicitly; do not silently waive them.

## Report

Give one verdict: **Breaking**, **No breaking changes found**, or
**Unverified** (missing baseline or material evidence). Scope the verdict to
what was reviewed. If a break is confirmed but other areas are unverified,
report Breaking and list the remaining gaps.

For each finding include:

- Changed `file:line` (or deletion hunk) and endpoint method + path.
- Old versus new contract, supported by code, schema, test, or documented rule.
- A concrete old request or consumer snippet and its new failure/incorrect result.
- Impact and confidence; separate confirmed breaks from unresolved risks.
- A compatible alternative, or an explicit version/migration path if intentional.

For standalone use, confirmed incompatibilities are `WARNING`; use `SUGGESTION`
for evidence gaps requiring investigation, not as claims of confirmed breakage.
When invoked by PR self-review, use its severity/evidence rules; this skill does
not create a new automatic `CRITICAL` gate category. Do not edit application
code or publish review comments unless separately requested.
