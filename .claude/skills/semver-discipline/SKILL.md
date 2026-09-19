---
name: semver-discipline
description: Review whether a backend package or API release version matches the scale of its public contract changes. Use for API compatibility findings, public additions or deprecations, version and release metadata changes, and release preparation. Verify the project's versioning policy before requiring a SemVer bump; internal refactors alone do not require a major release.
---

# SemVer Discipline

Answer: **Does the proposed release version match the scope of the public API
change?** A correct version communicates incompatibility; it does not make old
clients compatible. Review only: do not bump versions, introduce release tools,
change API code, or publish comments unless separately requested.

## When to apply

- A change removes, renames, extends, deprecates, or otherwise affects a public
  contract, including response shapes and behavioral guarantees.
- A PR changes package versions, release intents, changelogs, or release rules.
- A release combines multiple PRs, or a user requests a versioning review.

Skip unrelated internal changes. Documentation-only edits can still announce
public deprecation. A dependency's major bump is not automatically a major bump
for its consumer: establish the effect on the consumer's own public API.

## Establish evidence before judging

1. Identify the **versioned unit**: package, service, or HTTP API. Read the
   public contract, versioning policy, stability channel, release configuration,
   manifests, relevant tags, and changelog. Do not equate a package version,
   an API path such as `/v1`, OpenAPI's `openapi`, and `info.version`.
2. Distinguish the **PR base** from the **release base**. Use the caller's
   supplied scope; otherwise use the target merge-base for the PR contribution
   and the last relevant published release for the version comparison. Include
   staged, unstaged, and untracked changes in local reviews. Never silently
   substitute `HEAD~1` or a tag from a different package/release line.
3. Reuse available evidence from `breaking-change` and `response-schema`.
   Verify the old guarantee and actual consumer impact; do not convert an
   uncertain finding into a confirmed major requirement. Without those reports,
   perform a focused compatibility check. Avoid repeating their full review or
   duplicating findings: attach the version mismatch to the supporting break.
4. Classify all pending changes for each affected versioned unit. Determine
   the required release level using the table below and the established policy.
   Evaluate the aggregate release, not just the current PR.
5. Compare with either the actual proposed version or the project's accepted
   **release intent** (for example a changeset). Inspect how that intent is
   consumed. In a deferred workflow, an unchanged manifest in a feature PR is
   not a violation. At release time, verify the resulting version as well.

Commit labels are evidence of intent, not proof of compatibility. Conventional
Commits permits a breaking change under any commit type; `fix` does not justify
patch when the contract breaks. A `BREAKING CHANGE` marker alone does not prove
that the configured release process will produce the right version.

## Classification and exceptions

The stable-release rules below apply to an established SemVer public API with
major version greater than zero. Source: [SemVer 2.0.0](https://semver.org/spec/v2.0.0.html).

| Evidence | Required treatment |
|---|---|
| Backward-incompatible public API change | Major; reset minor and patch to zero. |
| Backward-compatible public functionality | Minor; reset patch to zero. |
| Public functionality newly marked deprecated | Minor; distinguish deprecation from later incompatible removal. |
| Only backward-compatible bug fixes | Patch. |
| Several change levels in one release | Account for the highest required level per versioned unit. An already planned major can cover additional breaking changes; do not require one major per PR. |
| Internal refactor with no public effect | No automatic major requirement; consult the release policy for whether and how to release it. |

Handle these separately:

- **Missing policy:** report Unverified with a conditional recommendation:
  “If this package/API follows stable semantic versioning, this breaking change
  requires a major rather than a patch/minor release.” Missing policy is not a
  confirmed violation or a successful check. Explicit non-SemVer policies are
  Not applicable to SemVer enforcement; name the actual policy.
- **Missing release base or target:** state which comparison is unverified.
  You may establish a required level without claiming that a proposed release
  violates it when its version or accepted intent is unknown.
- **`0.y.z`:** SemVer does not prescribe stable compatibility guarantees here.
  Apply an explicit local policy if present. Do not invent either “must become
  1.0.0” or “every breaking change must bump minor.”
- **Prereleases:** inspect channel guarantees and the intended stable release.
  A change from `2.0.0-beta.1` to `2.0.0-beta.2` does not automatically require
  `3.0.0`. Conversely, a beta label does not justify eventually releasing a
  break against stable `1.x` as stable `1.5.0`.
- **Build metadata:** `+build` does not increase version precedence and is not
  a substitute for a required bump. Compare versions numerically, including
  prerelease ordering, not lexicographically.
- **Published versions:** do not recommend replacing their contents. Plan a
  new release; for an accidental incompatible release, assess whether to
  restore the old contract or explicitly release a new incompatible line.
- **Larger-than-necessary bump:** inspect the remaining release contents and
  policy; do not call it a confirmed compatibility violation solely on size.
- **Response optional → required:** first establish the actual compatibility
  impact. Strengthening a producer guarantee is not the same as requiring new
  request input; the transition alone is not proof of a major requirement.

A migration guide or coordinated UI update does not preserve old-client
compatibility. For an HTTP API, check how versions are selected and supported;
changing only the server's package number does not provide an old API surface.
Do not mandate URL versioning or Google's lifecycle rules for unrelated APIs.

In dev-digest, packages are standalone and shared contracts are mirrored files,
not a published package. Do not invent versions per backend module. The
research observed private packages at `0.0.0` without an explicit release
policy; recheck current evidence rather than treating that observation as a
permanent policy. `private: true` alone says nothing about HTTP guarantees.

## Bad and good practices

Numeric examples assume a declared stable SemVer contract last released as
`1.4.2`. These are illustrative, not dev-digest's current versions.

| Bad | Good |
|---|---|
| Remove guaranteed response `name` and release `1.4.3`. | Plan `2.0.0`, or retain the field and compatibility. |
| Add a compatible public function in `1.4.3`. | Plan `1.5.0`. |
| Mark public functionality deprecated in a patch. | Announce it in a minor with documentation; plan incompatible removal in a later major. |
| Label endpoint removal `fix` and infer patch. | Confirm the break, mark it in the adopted commit/release system, and plan the appropriate major. |
| Demand a manifest bump in every feature PR despite a deferred workflow. | Check the accepted release intent, then the final release version. |
| Treat an update to `openapi: 3.1.0` as the product's API bump. | Identify the actual versioned unit and its policy; specification and document versions are distinct. |
| Use `1.4.2+breaking` instead of a major. | Set the appropriate release target; metadata cannot replace a bump. |
| Demand `0.0.0 → 1.0.0` without a policy. | Report the break separately and give conditional versioning advice. |
| Claim a package bump alone protects clients of the old URL. | Assess version compliance and client migration independently; preserve the old contract when its support is promised. |

## Report

Give a scoped verdict:

- **Compliant:** the proposed version or accepted release intent covers the
  evidenced change. Specify whether only intent or the final release was checked.
- **Non-compliant:** established policy and evidence demonstrate a mismatch.
- **Unverified:** material policy, baseline, target, or impact evidence is missing.
- **Not applicable:** no relevant versioning change or an explicitly different
  versioning scheme; explain why.

If a violation is confirmed while other checks remain unresolved, report
Non-compliant and list the gaps. For each finding include the versioned unit,
policy/channel, release base, changed `file:line` or deletion hunk, old contract,
consumer impact, required level, proposed version/intent, supporting rule,
confidence, and a concrete correction. Record checks actually performed.

When called by PR self-review, follow its severity and evidence rules. Do not
introduce a new automatic blocking category or treat absent policy as CRITICAL.

## Sources and rationale

Read [README.md](README.md) for the source registry, applicability limits, and
links to the Ukrainian research and acceptance scenarios. Core SemVer rules
are normative only for adopters; Google API and Changesets practices are
context-specific. The review procedure and verdicts are project decisions.
