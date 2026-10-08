import type { AgentCase } from "../../src/index.js";
import { fixtureReader } from "../../src/index.js";

const fx = fixtureReader(import.meta.url);

// Identical for both variants. The harness hands an agent only Read/Grep/Glob (Bash is stripped),
// so the prompt tells it up front to report the Bash-only mechanical checks as `not run`; without
// that, the agent invents their exit codes and that noise lands on whichever variant guessed more.
const HEADER = `Audit this diff against DevDigest's documented structural contracts.

Environment notes: Bash is not available, so list every command under "Mechanical checks" with
Exit = "not run" and do not invent results. The diff below is the COMPLETE scope — the files it
adds are not on disk, so review the diff text itself and use Read/Grep only for the documented
rules (AGENTS.md, onion-architecture skill, server/.dependency-cruiser.cjs).`;

const REVIEW_PROMPT = `${HEADER}

${fx("checkout-service.diff")}`;

const REVIEWER_CORE_PROMPT = `${HEADER}

${fx("reviewer-core-gate.diff")}`;

const BENIGN_PROMPT = `${HEADER}

${fx("benign-refactor.diff")}`;

// Shared across the strict (architecture-reviewer) and relaxed (architecture-reviewer-lite)
// variants: same prompts, fixtures, practices and thresholds. Practices follow the agent's own
// output contract — severity CRITICAL|WARNING|SUGGESTION, verdict approve|comment|request_changes,
// rule = a name from server/.dependency-cruiser.cjs — so a correct answer CAN pass.
//
// Detection (case 1) and citation (case 2) are split on purpose: the lite variant only relaxes
// citation, so case 1 should stay equal and case 2 is the one that is expected to move. Mixing
// them behind a 1.0 threshold made every case fail for unrelated reasons and hid the delta.
export const cases: AgentCase[] = [
  {
    name: "finds both violations in the checkout diff with severity, evidence and a verdict",
    kind: "quality",
    prompt: REVIEW_PROMPT,
    practices: [
      "flags `import type { FastifyReply } from 'fastify'` in server/src/vendor/shared/contracts/checkout.ts as a violation: a wire contract (ring 0) must not depend on a web framework",
      "flags `new PgCheckoutRepository()` inside server/src/modules/checkout/service.ts as a violation: only the composition root (platform/container.ts) may `new` a concrete repository/adapter, a service receives a port",
      "assigns every finding a severity from CRITICAL, WARNING or SUGGESTION, and the contract-purity and the `new` findings are not rated SUGGESTION",
      "quotes the offending changed line verbatim as evidence for each finding, not a paraphrase",
      "ends with the verdict `request_changes`, since at least one CRITICAL finding exists",
    ],
    threshold: 0.8,
    maxTurns: 25,
  },
  {
    name: "cites a documented rule for every finding in the checkout diff",
    kind: "quality",
    prompt: REVIEW_PROMPT,
    practices: [
      "the FastifyReply finding names the configured rule `contracts-are-pure` (or explicitly cites ring 0 / wire-contract purity from the onion-architecture skill)",
      "the `new PgCheckoutRepository()` finding cites a documented rule: the onion-architecture rule that only the composition root says `new` on a concrete adapter, or `service-takes-ports-not-container`",
      "EVERY finding carries a rule or a documented source, none is justified by prose alone",
      "does not invent a rule name that exists neither in server/.dependency-cruiser.cjs nor in the onion-architecture skill",
    ],
    threshold: 1.0,
    maxTurns: 25,
  },
  {
    name: "does not report extra violations for the checkout diff",
    kind: "quality",
    prompt: REVIEW_PROMPT,
    practices: [
      "reports no more than the two real violations (a framework type in a contract, a concrete repository `new`-ed in a service) plus, at most, findings that restate them for the same line — no unrelated finding about naming, style, test coverage or module folder structure",
      "does not fabricate a runtime-bug or security finding for the optional `reply?: FastifyReply` parameter beyond its import being a layering issue",
    ],
    threshold: 1.0,
    maxTurns: 25,
  },
  {
    name: "finds the reviewer-core violations and grounds them in the docs",
    kind: "quality",
    prompt: REVIEWER_CORE_PROMPT,
    practices: [
      "flags `import { readFileSync } from 'node:fs'` in reviewer-core/src/review/run.ts as a violation: reviewer-core is a pure engine with no filesystem access",
      "flags that the `groundFindings()` citation-grounding gate was removed and the findings are no longer filtered by it, as a violation of the documented mandatory, unconditional grounding rule",
      "each finding cites a documented source: the ring rule `reviewer-core-is-pure`, or reviewer-core/AGENTS.md (no filesystem access; grounding is mandatory)",
      "quotes the offending changed line verbatim as evidence for each finding, not a paraphrase",
      "ends with the verdict `request_changes`",
    ],
    threshold: 0.8,
    maxTurns: 25,
  },
  {
    name: "approves a benign rename without fabricating a violation",
    kind: "quality",
    prompt: BENIGN_PROMPT,
    practices: [
      "reports no CRITICAL or WARNING finding for the benign local-variable rename",
      "does not fabricate a documented-rule violation where the diff violates none of the checked rules",
      "ends with the verdict `approve` (a lone SUGGESTION with `comment` is also acceptable)",
    ],
    threshold: 1.0,
    maxTurns: 25,
  },
];
