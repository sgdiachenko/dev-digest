/**
 * Built-in skill bodies used by the seed.
 *
 * Mirror the human-readable originals in `docs/agent-prompts/skills/*.md`. All
 * four are `source: 'manual'` (hand-written, trusted in the prompt — see
 * ReviewRunExecutor.buildSkillBlocks). Linked to the seeded agents in seed.ts.
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
