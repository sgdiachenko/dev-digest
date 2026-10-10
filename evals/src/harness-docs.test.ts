/**
 * Static gate for the agent-instruction docs — no model, no network. Runs with `pnpm vitest run
 * src/harness-docs`. Guards what the workflow evals assume: every AGENTS.md has a CLAUDE.md
 * symlink beside it, and every relative link / #anchor in it resolves.
 */

import { existsSync, lstatSync, readFileSync, readlinkSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { describe, expect, test } from "vitest";
import { AGENTS_DIR, REPO_ROOT } from "./artifacts/paths.js";

const DOC_DIRS = ["", "server", "client", "reviewer-core", "mcp-server", "e2e"];
const LINK_RE = /\[[^\]]*\]\(([^)\s]+)\)/g;

/** GitHub heading slug: lowercase, drop punctuation except `-`, spaces → `-`. */
function slug(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[`*_]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s/g, "-");
}

function anchors(file: string): Set<string> {
  const out = new Set<string>();
  let fenced = false;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (line.startsWith("```")) fenced = !fenced;
    const m = !fenced && /^#{1,6}\s+(.+)$/.exec(line);
    if (m) out.add(slug(m[1]));
  }
  return out;
}

describe.each(DOC_DIRS)("agent docs: %s/", (dir) => {
  const base = join(REPO_ROOT, dir);
  const agentsMd = join(base, "AGENTS.md");
  const claudeMd = join(base, "CLAUDE.md");
  const label = relative(REPO_ROOT, agentsMd);

  test("CLAUDE.md is a symlink to AGENTS.md", () => {
    expect(existsSync(agentsMd), `${label} missing`).toBe(true);
    expect(lstatSync(claudeMd).isSymbolicLink(), "CLAUDE.md is not a symlink").toBe(true);
    expect(readlinkSync(claudeMd)).toBe("AGENTS.md");
  });

  test("every relative link and #anchor resolves", () => {
    const broken: string[] = [];
    const text = readFileSync(agentsMd, "utf8").replace(/```[\s\S]*?```/g, "");
    for (const [, target] of text.matchAll(LINK_RE)) {
      if (/^(https?:|mailto:)/.test(target)) continue;
      const [path, hash] = target.split("#");
      const file = path ? join(dirname(agentsMd), path) : agentsMd;
      if (!existsSync(file)) {
        broken.push(`${target} — file not found`);
      } else if (hash && file.endsWith(".md") && !anchors(file).has(hash)) {
        broken.push(`${target} — no such heading`);
      }
    }
    expect(broken, `${label}:\n${broken.join("\n")}`).toEqual([]);
  });
});

describe("root AGENTS.md", () => {
  const root = readFileSync(join(REPO_ROOT, "AGENTS.md"), "utf8");

  test.each([
    "spec-creator",
    "researcher",
    "brainstorm",
    "implementation-planner",
    "implementer",
    "test-writer",
    "plan-verifier",
    "architecture-reviewer",
    "security-reviewer",
    "stack-reviewer",
    "conventions-reviewer",
    "doc-writer",
  ])("subagent %s is named in the doc and exists", (name) => {
    expect(root, `${name} not mentioned`).toContain(name);
    expect(existsSync(join(AGENTS_DIR, `${name}.md`))).toBe(true);
  });

  test("every package it points at has its own AGENTS.md", () => {
    for (const pkg of DOC_DIRS.filter(Boolean)) {
      expect(root, `${pkg}/AGENTS.md not linked`).toContain(`${pkg}/AGENTS.md`);
    }
  });
});
