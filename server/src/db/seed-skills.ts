/**
 * Built-in skill bodies used by the seed.
 *
 * Mirror the human-readable originals in `docs/agent-prompts/skills/*.md`. All
 * of these except FLAKY_TEST_SIGNALS_SKILL seed as `source: 'manual'`
 * (hand-written, trusted in the prompt — see
 * ReviewRunExecutor.buildSkillBlocks). Linked to the seeded agents in seed.ts.
 *
 * The four API-contract skills (breaking change, response schema, deprecation
 * policy, SemVer discipline) are the prompt-sized distillations of this repo's
 * own review skills in `.claude/skills/<name>/SKILL.md` — those are Claude Code
 * instructions and never reach a run of the in-app API Contract Reviewer; these
 * bodies are what that agent actually receives.
 */

export const PR_QUALITY_RUBRIC_SKILL = `# PR Quality Rubric

Evaluate the pull request against the following dimensions. For each, return a
finding only when the issue is **worth the author's time** — aim for a handful of
high-signal findings, not an exhaustive list.

## Correctness
- Does the change do what the PR description claims?
- Are edge cases (empty input, nulls, concurrency) handled?

## Tests
- Are new branches covered by assertions?
- Are the tests meaningful (not just snapshot churn)?

## Scope
- Does the diff stay within the stated intent?
- Flag out-of-scope changes separately rather than blocking on them alone.
`;

export const TEST_COVERAGE_NUDGE_SKILL = `# Test Coverage Nudge

When a diff adds a new branch (an \`if\`, a \`catch\`, an early return, a new
conditional) with no accompanying test that exercises it, say so — name the
specific branch and the file/line, and suggest the missing input/case. Do not
demand 100% coverage; only flag a branch that is plausible to hit in production
and would silently break if it regressed.
`;

export const NO_THEN_CHAINS_SKILL = `# House rule: no \`.then()\` chains

This codebase uses \`async\`/\`await\` exclusively. A \`.then()\`/\`.catch()\` chain
introduced in new or changed TypeScript code (outside a genuinely one-shot
fire-and-forget call) is a convention violation — flag it as a SUGGESTION and
suggest the \`async\`/\`await\` rewrite. Do not flag existing \`.then()\` chains the
diff did not touch.
`;

export const SECRET_LEAKAGE_GATE_SKILL = `# Secret Leakage Gate

Scan the diff for credential-shaped strings introduced or left in place:
\`sk_live_...\`, \`ghp_...\`, \`AIza...\`, a JWT (\`eyJ...\`), a private key block
(\`-----BEGIN...KEY-----\`), or an obvious \`API_KEY = "..."\` / \`password = "..."\`
literal. Any match is CRITICAL — secrets in source are a production incident, not
a style issue, regardless of whether the PR description calls it a "demo" or
"fake" value.
`;

export const WIRE_FORMAT_CONVENTION_SKILL = `# Wire Format Convention

\`@devdigest/shared\` contract/DTO fields are \`snake_case\` on the wire — this
matches the DB/JSON shape, regardless of the surrounding TS convention. A field
added to \`vendor/shared/contracts/*\` in \`camelCase\`, or a route response built
without going through the shared DTO mapper, is a convention violation: flag it
as a WARNING and name the correct \`snake_case\` field name.
`;

export const BREAKING_CHANGE_SKILL = `# Breaking Change Checklist

Answer one question for every changed public operation: **will a currently
shipped caller stop working after this diff?** Review the new server against the
old caller's contract — a client updated in the same PR does not protect an
already deployed one.

Inventory what changed as HTTP method + full registered path (including the
Fastify prefix) plus the shared DTOs it serializes, then check each of:

- **Route gone or moved** — the old method + path removed, renamed, or
  re-prefixed with nothing equivalent left at the old address.
- **Request narrowed** — an optional \`params\`/\`body\`/query field became
  required, a default dropped, accepted values or bounds tightened, or a field
  renamed so old payloads are rejected (or silently ignored, which is worse).
- **Response narrowed** — a field an old reader relies on removed or renamed
  (nested fields and error bodies included), a type, nullability, or enum
  changed, an array wrapped in an envelope.
- **Status or semantics changed** — a success code an old caller branches on, a
  domain error mapped to a different code, or changed defaults, ordering,
  pagination, units, or completion guarantees behind an unchanged shape.

Compatibility is directional: narrowing what is accepted breaks writers,
widening what is returned breaks strict readers. A new route, a new optional
request field, and — for a tolerant reader — a new response field are additive;
do not report them.

For every finding give the old request or old reader expectation, the new
behaviour that violates it, and the \`file:line\` that introduced it. A confirmed
break is CRITICAL. When the old contract cannot be established from the diff,
say so as a SUGGESTION — never present an unverified suspicion as a confirmed
break.
`;

export const RESPONSE_SCHEMA_SKILL = `# Response Schema Compatibility

Compare the body an old client already parses with what the new code actually
serializes: the route's \`response\` schema is the contract, not the handler's
return type. Cover every variant — success, each error body, nested objects,
and array items.

Check recursively, per field path (\`$.items[*].author.name\`):

- **Removed** — did the old contract guarantee the field? Name the read that
  breaks.
- **Renamed** — removal plus addition. An internal \`camelCase\` variable that
  still serializes to the same \`snake_case\` key is not a wire change.
- **Required → optional** — the old reader can no longer rely on presence.
  Withdrawing a promised field is incompatible even when today's data still
  fills it.
- **Optional → required** — usually compatible (a stronger promise), but verify
  every branch really supplies it, or the new schema rejects its own response.
  Do not judge an output by request-validation rules.
- **Type or shape** — JSON type, nullability, scalar vs object vs array, item
  type, a new enum member, a discriminator, promised formats such as date-time.

Presence and nullability are independent: \`{}\` and \`{ "name": null }\` are not
the same body. The serializer strips unknown keys, so a compatibility alias the
handler still returns but the schema no longer declares never reaches the wire.

Adding a field is compatible for a tolerant reader — report strict unknown-key
rejection only with evidence of such a client, not a hypothetical one. Anchor
each finding to \`file:line\`, the JSON path, and the old → new shape: a removed
or retyped guaranteed field is CRITICAL, an old guarantee you could not verify
is a SUGGESTION.
`;

export const DEPRECATION_POLICY_SKILL = `# Deprecation Policy

When the diff retires or replaces a public contract, ask whether consumers got a
usable migration path and enough supported time to take it. This is not a second
pass on whether the change breaks a caller — it judges how the producer
announced and staged the transition.

Applies when a route, a wire DTO field, or a supported export is deprecated,
removed, renamed, replaced, or loses a compatibility alias — and when its
meaning changes behind a stable name and shape.

Require each of these, and report it as present, missing, or unverified:

- **Marker** — a notice on the channel the affected consumer actually reads
  (API or release docs, TSDoc \`@deprecated\`, OpenAPI \`deprecated\`, an HTTP
  \`Deprecation\` header). A marker added in the same release that removes the
  contract is not advance notice.
- **Replacement** — an available alternative with its differences and limits
  stated, or an explicit reason the capability goes away with no successor.
- **Migration path** — concrete before/after steps for the request, response,
  import, and deployment order that actually change.
- **Timeline** — a date, a version, or an explicit removal condition, or an
  explicit "removal is not scheduled". "Soon" is not a timeline.
- **Compatibility window** — the old contract still works for the promised
  interval; for a removal, the earlier notice shipped and the window elapsed.

Deprecating must not change the old resource's behaviour, and a redirect or
alias counts as compatibility only once method, body, status, errors, and
semantics still hold for the old caller. A changelog entry, a version bump, or
updating the bundled UI is not a migration path. This repo publishes no
deprecation window — report a missing one as unverified rather than inventing
30, 90, or 180 days.

A removal with no notice and no shim is CRITICAL. A missing or vague timeline,
replacement, or window on an otherwise staged deprecation is a WARNING. Merge
the finding with the breaking-change one when both describe the same change.
`;

export const SEMVER_DISCIPLINE_SKILL = `# SemVer Discipline

When the diff changes a public contract, check that the release version it lands
under matches the size of that change — and remember a correct version only
communicates a break, it never makes an old client work.

First identify the versioned unit and its policy: an npm package version, an
HTTP API version (\`/v1\`), and OpenAPI's \`info.version\` are different things. In
this repo \`server\`, \`client\`, and \`reviewer-core\` are standalone private
packages, \`@devdigest/shared\` is mirrored files rather than a published package,
and no release policy is stated — so establish the policy from the diff before
demanding a bump, and never invent one version per backend module.

For a declared stable (\`>= 1.0.0\`) SemVer contract:

- a backward-incompatible public change → major;
- backward-compatible new public functionality → minor;
- public functionality newly marked deprecated → minor, with the incompatible
  removal in a later major;
- backward-compatible fixes only → patch;
- several levels in one release → the highest one. An already planned major
  covers further breaks; do not demand one major per PR.

Do not report: an internal refactor with no public effect, a manifest left
untouched in a feature PR under a deferred release workflow (check the accepted
release intent instead), a dependency's own major bump, or \`+build\` metadata
offered in place of a bump. \`0.y.z\` carries no SemVer compatibility promise —
do not invent "must become 1.0.0"; and a \`fix:\` commit label does not turn a
break into a patch.

Attach the version mismatch to the break that proves it instead of filing a
second finding. A mismatch proven against a stated policy is a WARNING; a
missing policy or an unknown release base is a SUGGESTION, phrased
conditionally ("if this API follows stable SemVer, this break needs a major,
not a patch").
`;
/**
 * Seeded via the REAL import path (server/src/db/seed.ts zips this up and
 * runs it through modules/skills/helpers.js#parseImport, the same function
 * POST /skills/import calls) rather than a plain SkillsRepository.insert —
 * so `source` ends up 'imported_url', not 'manual', and the skill lands
 * disabled ("needs vetting") exactly like a real import would.
 */
export const FLAKY_TEST_SIGNALS_SKILL = `# Flaky Test Signals

Flag a new or changed test that depends on real wall-clock time (\`Date.now()\`,
\`new Date()\`), a real timer (\`setTimeout\`/\`setInterval\`) without fake timers,
or unseeded randomness to decide a pass/fail assertion. Name the specific
non-deterministic source and suggest the deterministic replacement (an
injected clock, \`vi.useFakeTimers()\`, or a seeded RNG).
`;
