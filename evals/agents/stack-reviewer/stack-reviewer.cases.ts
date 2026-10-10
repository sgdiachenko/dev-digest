import type { AgentCase } from "../../src/index.js";
import { fixtureReader } from "../../src/index.js";

const fx = fixtureReader(import.meta.url);

// The harness hands an agent only Read/Grep/Glob (Bash is stripped), so the prompt says up front
// that the Bash-only mechanical checks are `not run`; otherwise the agent invents their exit codes.
const HEADER = `Review this diff against the stack idioms of the DevDigest repo.

Environment notes: Bash is not available, so list every command under "Mechanical checks" with
Exit = "not run" and do not invent results. The diff below is the COMPLETE scope — the files it
adds are not on disk, so review the diff text itself and use Read/Grep only for the documented
rules (.claude/skills/<name>/SKILL.md, routing.md, AGENTS.md).`;

const IDIOMS_PROMPT = `${HEADER}

${fx("stack-idioms.diff")}`;

const BENIGN_PROMPT = `${HEADER}

${fx("stack-benign.diff")}`;

const OUT_OF_LANE_PROMPT = `${HEADER}

${fx("stack-out-of-lane.diff")}`;

export const cases: AgentCase[] = [
  {
    name: "finds the Fastify, Zod, React and Next idiom violations with evidence and a skill",
    kind: "quality",
    prompt: IDIOMS_PROMPT,
    practices: [
      "flags the Fastify handler in server/src/modules/notes/routes.ts that calls `reply.send(note)` and then also `return note` in the same async handler, as a fastify-best-practices violation",
      "flags `CreateNoteBody.parse(req.body)` as a violation: user input should be validated with `safeParse` (or a route schema) instead of a throwing `parse`, or flags the route's missing response schema",
      "flags `{count && <span>…</span>}` in FindingList.tsx as a react-best-practices violation (a `0` count renders `0`; use a ternary or a boolean)",
      "flags `key={index}` on a filtered list in FindingList.tsx as a react-best-practices violation",
      "flags `params.id` read from `params: Promise<…>` without `await` in client/src/app/repos/[id]/page.tsx as a next-best-practices violation",
      "every finding from fastify-best-practices is rated WARNING or SUGGESTION (that skill has no scale of its own), and every finding quotes the changed line verbatim and names the skill",
    ],
    threshold: 0.8,
    maxTurns: 30,
  },
  {
    name: "approves an idiomatic Zod change without fabricating a violation",
    kind: "quality",
    prompt: BENIGN_PROMPT,
    practices: [
      "reports no CRITICAL or WARNING finding for adding `pinned: z.boolean().default(false)` to a Zod object",
      "does not fabricate a rule violation where the diff violates none",
      "ends with the verdict `approve`",
    ],
    threshold: 1.0,
    maxTurns: 25,
  },
  {
    name: "leaves onion and security issues to the other reviewers",
    kind: "quality",
    prompt: OUT_OF_LANE_PROMPT,
    practices: [
      "does not report the `drizzle-orm` import in the service as an onion-architecture finding; it points to architecture-reviewer for that",
      "does not report `exec(req.query.cmd)` as a security finding (command injection); it points to security-reviewer for that",
      "mentions architecture-reviewer and security-reviewer by name as the owners of those issues",
    ],
    threshold: 1.0,
    maxTurns: 25,
  },
];
