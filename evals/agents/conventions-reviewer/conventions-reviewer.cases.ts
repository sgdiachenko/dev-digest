import type { AgentCase } from "../../src/index.js";
import { fixtureReader } from "../../src/index.js";

const fx = fixtureReader(import.meta.url);

// The harness hands an agent only Read/Grep/Glob (Bash is stripped), so the prompt says up front
// that the deterministic Bash checks are `not run`; the agent then does the manual pass only.
const HEADER = `Review this diff against the naming and structure rules in the root AGENTS.md ("Naming conventions").

Environment notes: Bash is not available, so list every deterministic check with Exit = "not run"
and do not invent results. The diff below is the COMPLETE scope — the files it adds are not on
disk, so review the diff text itself and use Read/Grep only for AGENTS.md.`;

const VIOLATIONS_PROMPT = `${HEADER}

${fx("naming-violations.diff")}`;

const BENIGN_PROMPT = `${HEADER}

${fx("naming-benign.diff")}`;

const OUT_OF_SCOPE_PROMPT = `${HEADER}

${fx("naming-out-of-scope.diff")}`;

export const cases: AgentCase[] = [
  {
    name: "finds the four naming violations with a quote and an AGENTS.md rule, none above WARNING",
    kind: "quality",
    prompt: VIOLATIONS_PROMPT,
    practices: [
      "flags `doublePrecision('costUsd')` in the schema: the SQL column name must be snake_case (`cost_usd`), citing the DB-columns naming rule in AGENTS.md",
      "flags `export const severity = z.enum(['critical','Warning'])`: the Zod const must be PascalCase sharing its type's name (`Severity`) and the enum values are inconsistent in case (`'critical'`, `'Warning'`; severity-like values are UPPER_CASE), citing the Zod naming rules in AGENTS.md",
      "flags PrCard.tsx under the `prCard` folder: the folder must be PascalCase matching the file, and the file holds two components (`PrCard` and `PrCardBadge`) where one component per file is required, citing the React-components rule in AGENTS.md",
      "flags the added migration `0042_AddCost.sql` as hand-named: migrations are auto-named `NNNN_adjective_noun.sql` by drizzle-kit, citing the migration rule in AGENTS.md",
      "quotes the offending changed line or path verbatim for each finding and no finding has severity CRITICAL",
    ],
    threshold: 0.8,
    maxTurns: 25,
  },
  {
    name: "approves correctly named code without fabricating a violation",
    kind: "quality",
    prompt: BENIGN_PROMPT,
    practices: [
      "reports no CRITICAL or WARNING finding: the column, Zod const, enum values, component folder and migration name all follow AGENTS.md",
      "does not fabricate a naming violation",
      "ends with the verdict `approve`",
    ],
    threshold: 1.0,
    maxTurns: 25,
  },
  {
    name: "leaves shared-contract mirroring and lockfile edits to the other reviewers",
    kind: "quality",
    prompt: OUT_OF_SCOPE_PROMPT,
    practices: [
      "does not report as a finding that server/src/vendor/shared/contracts/finding.ts changed without its client copy (mirroring drift); the added `confidence` field is correctly named and gets no finding",
      "does not report the hand-edited server/pnpm-lock.yaml as a finding",
      "mentions architecture-reviewer or /pr-self-review as the owner of the mirroring and lockfile checks",
    ],
    threshold: 1.0,
    maxTurns: 25,
  },
];
