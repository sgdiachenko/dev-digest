# SemVer Discipline

When the diff changes a public contract, check that the release version it lands
under matches the size of that change — and remember a correct version only
communicates a break, it never makes an old client work.

First identify the versioned unit and its policy: an npm package version, an
HTTP API version (`/v1`), and OpenAPI's `info.version` are different things. In
this repo `server`, `client`, and `reviewer-core` are standalone private
packages, `@devdigest/shared` is mirrored files rather than a published package,
and no release policy is stated — so establish the policy from the diff before
demanding a bump, and never invent one version per backend module.

For a declared stable (`>= 1.0.0`) SemVer contract:

- a backward-incompatible public change → major;
- backward-compatible new public functionality → minor;
- public functionality newly marked deprecated → minor, with the incompatible
  removal in a later major;
- backward-compatible fixes only → patch;
- several levels in one release → the highest one. An already planned major
  covers further breaks; do not demand one major per PR.

Do not report: an internal refactor with no public effect, a manifest left
untouched in a feature PR under a deferred release workflow (check the accepted
release intent instead), a dependency's own major bump, or `+build` metadata
offered in place of a bump. `0.y.z` carries no SemVer compatibility promise —
do not invent "must become 1.0.0"; and a `fix:` commit label does not turn a
break into a patch.

Attach the version mismatch to the break that proves it instead of filing a
second finding. A mismatch proven against a stated policy is a WARNING; a
missing policy or an unknown release base is a SUGGESTION, phrased
conditionally ("if this API follows stable SemVer, this break needs a major,
not a patch").
