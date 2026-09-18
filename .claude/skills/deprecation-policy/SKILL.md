---
name: deprecation-policy
description: Review backend changes for a safe public API deprecation and removal path. Use when an HTTP contract or supported programmatic export is deprecated, removed, renamed, replaced, or loses a compatibility adapter; skip purely internal refactors with no consumer-visible effect.
---

# Deprecation Policy

Answer: **If this contract changes, did consumers receive a usable migration
path and enough supported time to follow it?** A major version, changelog note,
or updated in-repo client does not answer that question by itself.

This skill covers HTTP APIs and supported programmatic exports in backend
modules. It complements `breaking-change`: that skill establishes whether an
old consumer stops working; this one evaluates how the producer announced and
managed the transition. Consolidate overlapping evidence into one finding.

## When to apply

Apply when a public contract is:

- deprecated, removed, renamed, moved, or replaced;
- changed in semantics so consumers must migrate even if its name or shape
  remains stable; or
- losing an alias, wrapper, old API version, or other compatibility mechanism.

Also apply to a proposed breaking major release and to an explicit API
lifecycle audit. A major bump is a trigger only when the release changes or
retires a public contract.

Do not apply to a private helper, internal import, or refactor with no supported
consumer-visible effect. `export` alone does not establish that an interface is
public. Determine the boundary from documented entrypoints, published or
supported artifacts, actual consumers, and stated guarantees. The absence of
an in-repo caller does not prove that no external consumer exists.

## Review workflow

1. Establish the comparison using the supplied base or PR merge-base. For a
   local review, include staged, unstaged, and untracked changes. If the old
   contract or release history is unavailable, identify the evidence gap.
2. Name the affected contract and consumers. For HTTP, trace method, full path,
   schema, serialization, status, headers, auth, and observable semantics. For
   exports, trace supported import paths, signatures, types, and runtime
   behavior.
3. Classify the lifecycle stage: initial deprecation, compatibility window, or
   removal. A marker added in the removal release is not advance notice.
4. Apply every criterion below. Record **present**, **missing**, **unverified**,
   or **not applicable with reason**, and cite concrete code, docs, releases,
   tests, or published artifacts.
5. When practical, exercise an old-client fixture against the new server or an
   old import/call against the compatibility wrapper. New-client tests and
   documentation alone do not prove that the old contract remains usable.

## Required criteria

| Criterion | Evidence to require |
|---|---|
| Deprecation marker | A notice visible to the affected consumers that identifies the deprecated contract. Use the relevant channel: API/release docs, TSDoc `@deprecated`, OpenAPI `deprecated`, or HTTP deprecation metadata. Do not require every channel at once. |
| Replacement | An available alternative with material differences and limits explained. If none exists, require a reason and instructions for discontinuing the capability instead of inventing a replacement. |
| Migration path | Concrete before/after steps covering request, response, import, data, semantic, and deployment-order changes that actually apply. |
| Removal timeline | A date, version, explicit removal condition, or an explicit statement that removal is not scheduled. Words such as `soon` are not a timeline. |
| Compatibility window | Evidence that the old contract remains functional for the promised interval and that consumers could use the replacement during the migration period. For removal, verify the earlier published notice and that the window has elapsed. |

If a policy defines both elapsed time and release count, require both. Do not
invent a universal 30-, 90-, or 180-day window. Use the project's documented
policy; when none can be found, report the window as unverified rather than
manufacturing a requirement.

## Markers and lifecycle rules

- TypeScript: place `@deprecated` on the public symbol with a recommended
  alternative, and verify the published declaration or documentation retains
  it. A tag does not preserve runtime compatibility.
- OpenAPI: use `deprecated: true` on the applicable operation, parameter, or
  header and link or describe the migration. Metadata is not a compatibility
  shim.
- HTTP: `Deprecation` carries a Structured Fields date such as
  `Deprecation: @1767225600`. A `Link` with `rel="deprecation"` can point to
  migration documentation. Use `Sunset` only for an expected shutdown time;
  it carries an HTTP-date and must not precede the Deprecation date.
- Deprecation must not itself change the old resource's behavior. A redirect or
  alias counts as compatibility only after checking method, body, response,
  status, auth, errors, and semantics for an old consumer.

For a stable SemVer public API, marking functionality deprecated requires at
least a minor version increment and removing it incompatibly requires a major
increment. SemVer recommends at least one minor release containing the
deprecation before removal in a major release; it does not establish a time
window. Version `0.x` relaxes SemVer stability guarantees but does not cancel
separate commitments made to HTTP or known consumers.

In this repository, `server` and `reviewer-core` are private `0.0.0` packages.
Do not treat their package version as the HTTP API version, require an npm major
bump mechanically, or use `private`/`0.x` to justify silent removal. Shared wire
contracts exist in both `server/src/vendor/shared/contracts/` and
`client/src/vendor/shared/contracts/`; updating both copies and the current UI
does not migrate already deployed clients.

## Removal and exceptions

Removal is ready only when the evidence shows that the relevant notice was
published, the replacement or discontinuation path was usable, the promised
window elapsed, and current policy permits removal. An explicit "removal is not
scheduled" is valid during deprecation, but later removal requires a new,
measurable notice.

A documented emergency security removal may shorten or skip the ordinary
window. Require the reason, affected scope, decision owner, consumer notice,
and mitigation. Report the breaking impact and the exception; do not recommend
restoring a dangerous API merely to satisfy the normal checklist.

## Examples

| Bad | Better |
|---|---|
| Delete an endpoint after migrating only the bundled UI. | Keep the old handler or equivalent adapter for the announced window, publish the mapping, and verify an old client. |
| Rename request `repo_id` to `repository_id` and silently strip the old field. | Temporarily accept both, preserve the old meaning, and document deterministic conflict handling. |
| Add `@deprecated` and remove the export in the same release. | First release a marked wrapper and available replacement with migration instructions; remove it only after the announced conditions are met. |
| Say "will be removed soon." | Give a date/version/condition, or state that removal is not scheduled. |
| Cite a major bump as the migration plan. | Separately verify notice, replacement, migration instructions, and the compatibility window. |
| Deprecate a stable API in favor of an unavailable or less stable replacement. | Keep the old API supported until an adequate replacement is available for a real migration interval. |

## Report

Give one lifecycle verdict: **Migration path verified**, **Deprecation gaps
found**, **Unverified**, or **Not applicable**. If a concrete gap exists, use
**Deprecation gaps found** even when other evidence is unavailable.

For each finding include:

- changed `file:line` or deletion hunk and the affected contract;
- lifecycle stage and affected consumers;
- which required criterion is missing, with evidence;
- concrete impact on migration or removal readiness; and
- the smallest useful remedy, such as retaining a wrapper, publishing a guide,
  making the replacement available, or defining a measurable window.

Under PR self-review, follow its severity and evidence rules and merge the
finding with `breaking-change` or `semver-discipline` when they describe the
same underlying contract change. This skill adds no automatic `CRITICAL`
category. Do not edit product code or publish review comments unless requested.

Read [README.md](README.md) when source authority, date syntax, or the rationale
for a rule matters. The longer research record lives at
[`docs/deprecation-policy/research.md`](../../../docs/deprecation-policy/research.md).
