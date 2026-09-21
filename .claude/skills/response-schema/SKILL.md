---
name: response-schema
description: Review backend changes for compatibility of API response body structure with existing clients. Use when response DTOs, schemas, returned objects, mappings, or serializers change field names, presence, types, or nested shapes, including indirect changes in services and repositories. Excludes request validation and general endpoint behavior.
---

# Response Schema

Answer: **Does the response body remain compatible with what existing clients
expect?** Compare the new server's serialized output against the old response
contract. Review success and error bodies, nested objects, array items, and
each affected response variant.

## When to apply

- A backend module changes a route's `response` schema, response DTO, returned
  object, `reply.send(...)` payload, or mapping to public fields.
- Shared response contracts change, even if route handlers are untouched.
- A service, repository projection, adapter, hook, or serializer changes what
  reaches the response: omitted fields, nulls, types, nesting, or envelopes.
- A review explicitly asks whether API response schemas remain compatible.

Trace indirect changes to an actual response boundary before reporting them.
Skip internal refactors and DB/type changes whose effects do not reach JSON.
A new endpoint has no old response to break unless it replaces an existing
contract. Request bodies, query/path parameters, HTTP methods/status changes,
auth, timing, ordering, and same-shape business semantics belong to the broader
`breaking-change` review. Use status codes here only to identify body variants.
When both skills run, consolidate duplicate response findings.

## Review workflow

1. Use the caller's comparison base and scope. Otherwise compare the PR target
   merge-base with the proposed head; include staged, unstaged, and untracked
   changes for a local review. Do not silently use `HEAD~1`. Without an old
   contract, report compatibility as unverified.
2. Identify affected method + full path + response variant. Read old and new
   schemas and follow handlers, mappings, and serializers to reconstruct the
   actual JSON. A TypeScript type alone does not establish wire behavior.
3. Inspect old shared contracts, documented guarantees, tests, and relevant
   client decoders/usages. Distinguish declared contract changes from runtime
   changes; explain discrepancies rather than treating either as proof alone.
4. Compare recursively using the checklist. For each break, show an old valid
   consumer expectation and a new payload that violates it. Account for
   compatibility fields, defaults, and maintained API versions.
5. Where useful, run a focused existing test or exercise serialization with
   Fastify `inject()` and an old-client decoder/assertion. Cover the affected
   omission/null/variant branch. Report only checks actually run. Passing
   typechecking or tests updated to the new schema does not prove compatibility.

In this repo, start at `server/src/modules/<name>/routes.ts` and follow its
response schemas. Wire fields use `snake_case`. Inspect both copies of
`vendor/shared/contracts/` under server and client. Updating both copies and
the bundled UI does not preserve compatibility with already deployed clients.
`vendor/shared/adapters.ts` is a server-only port, not a response DTO.

## Required checks

| Change | What to verify |
|---|---|
| Field removed | Did the old contract guarantee the field? Show the broken read/decoder, including nested or array-item fields. Removing an optional field is not automatically a structural break if absence was already allowed; check documented variant guarantees. |
| Field renamed | Treat as removal plus addition. Internal variable renames are harmless when the serialized key is unchanged. A new name does not compensate for losing the old key. |
| Optional becomes required | Always record and inspect this change. For responses this usually strengthens the producer's guarantee and remains compatible: old readers already accepted the field. Verify every branch now supplies it or a valid serialization default; otherwise the new schema can reject responses. Do not apply request-validation compatibility rules to outputs. |
| Required becomes optional | The old consumer can no longer rely on presence. Treat withdrawal of a public required-field guarantee as incompatible even if current fixtures still include it; identify branches that can omit it when possible. If an internal type loosens but the public schema and emitted guarantee remain required, there is no demonstrated wire break. |
| Type changes | Compare JSON types, nullable versus non-nullable, scalar/object/array shapes, item types, enum/literal/union variants, and discriminator fields. Include promised formats such as date-time strings. Adding possible output values (including null or a new enum member) can break old decoders; narrowing outputs is usually compatible when old guarantees still hold. |

Presence and nullability are independent: `{}` and `{ "name": null }` do not
have the same schema. Inspect how the configured serializer handles undefined,
defaults, transforms, and unknown keys; do not assume a returned object is the
exact body on the wire. A response schema may strip a compatibility alias that
the handler still returns.

Adding a field is usually compatible for tolerant readers. Report strict
unknown-key rejection only with evidence from a supported client/contract,
not hypothetical parsers. Wrapping an array in `{ items: [...] }` or moving a
field into a nested object changes shape even when leaf names/types match.

## Bad and good practices

Examples below are illustrative. Good alternatives preserve the stated old
contract; additive fields assume readers tolerate unknown keys.

| Bad practice | Good practice |
|---|---|
| Delete required `findings_summary` because the current UI stopped using it. | Continue returning it with its promised shape on the existing API. Remove it only in a separate version while maintaining the old version. |
| Replace `repo_id` with `repository_id` in JSON. | Keep `repo_id`; add the new name if needed and ensure both survive serialization. An internal `repositoryId` variable can still map to `repo_id`. |
| Change `summary: z.string().optional()` to `z.string()` while one handler still returns `{}`. | Make all branches emit a valid string, or retain optionality. If all outputs comply, classify the stronger response guarantee as compatible with old readers. |
| Change required `findings: z.array(Finding)` to optional and omit it when empty. | Keep returning `findings: []`; an old client can safely call `findings.map(...)`. |
| Replace numeric `cost_usd: 0.1` with `cost_usd: "0.10"`. | Preserve the number; add a separately named display string if compatible, or use a maintained separate API version. |
| Return `author: null` where `author: { name: string }` was guaranteed. | Preserve the guaranteed object using valid domain data, or introduce a new version with explicit nullability. Do not fabricate an empty author to satisfy validation. |
| Replace `[ { id: "1" } ]` with `{ items: [ { id: "1" } ] }`. | Keep the array on the existing endpoint and expose the new envelope separately. |
| Add an enum value and test only the updated decoder. | Check the old decoder and exhaustiveness assumptions; preserve its accepted values on the old version if it cannot handle the new variant. |
| Keep a deprecated alias in the handler but remove it from the serializer schema. | Preserve it in both mapping and response schema, and assert that the serialized body still contains it. |

A migration note or updating clients together explains an intentional break;
it does not make the existing response compatible.

## Report

Give a scoped verdict: **Compatible**, **Incompatible**, or **Unverified**.
If a break is confirmed and other evidence is missing, use Incompatible and
list the remaining gaps. List meaningful compatible changes too, especially
optional → required transitions, without presenting them as defects.

For each finding include the changed `file:line` or deletion hunk, endpoint
and response variant, JSON field path (for example `$.items[*].author.name`),
old → new shape, contract evidence, concrete old-consumer failure, confidence,
and a compatible alternative. Separate confirmed contract violations from
questions about undocumented behavior. State validation performed and limits.

When invoked by PR self-review, follow its severity and evidence rules; do
not introduce an automatic blocking category. Review only unless application
edits are separately requested; do not publish comments automatically.
