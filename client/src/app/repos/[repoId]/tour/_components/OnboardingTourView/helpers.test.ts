import { describe, it, expect } from "vitest";
import type { Onboarding } from "@/lib/types";
import messages from "../../../../../../../messages/en/onboarding.json";
import {
  buildMarkdown,
  currentPathsOf,
  formatUsd,
  relativeTime,
  exportFileName,
  fenceFor,
  fileUrl,
  parseHash,
  splitForMiddleTruncation,
  summaryArgs,
  taskTitleKey,
  type TourT,
} from "./helpers";

function lookup(key: string): string | undefined {
  let cur: unknown = messages;
  for (const part of key.split(".")) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === "string" ? cur : undefined;
}

/** Minimal interpolating translator over the real message file. */
const t: TourT = (key, values = {}) => {
  const raw = lookup(key);
  if (raw === undefined) throw new Error(`missing message ${key}`);
  return raw.replace(/\{(\w+)\}/g, (_m, name: string) => String(values[name] ?? `{${name}}`));
};

function tour(): Onboarding {
  return {
    repo_id: "r1",
    availability: "available",
    source_sha: "abcdef1234567890",
    computed_at: "2026-10-01T00:00:00.000Z",
    index: {
      status: "full",
      reason: null,
      files_indexed: 10,
      files_in_repo: 12,
      graph_available: true,
      files_skipped_by_tour: 0,
    },
    sections: {
      architecture: {
        origin: "facts",
        summary: "A summary",
        stack: [{ kind: "ecosystem", name: "Node", evidence_path: "package.json", confidence: "verified" }],
        modules: [
          { path: "src", file_count: 5 },
          { path: "docs", file_count: 2 },
        ],
        diagram: null,
      },
      critical_paths: {
        origin: "facts",
        graph_based: true,
        items: [
          { path: "src/index.ts", score: 9, tags: ["entry_point"], route_count: null, importer_count: 3 },
          { path: "src/db.ts", score: 4, tags: ["data_schema"], route_count: null, importer_count: null },
        ],
      },
      run_locally: {
        origin: "facts",
        groups: [
          {
            package_path: "",
            ecosystem: "node",
            commands: [
              {
                id: "c1",
                position: 0,
                phase: "install",
                command: "echo ```` && pnpm install",
                source_path: "package.json",
                source_key: "scripts.install",
                by_convention: false,
                env_names: null,
                warnings: [],
              },
            ],
          },
        ],
      },
      reading_path: {
        origin: "facts",
        graph_based: true,
        items: [
          { position: 0, path: "src/index.ts", reason: "entry_point", imported_by_position: null, tags: [] },
        ],
      },
      first_tasks: {
        origin: "facts",
        items: [
          {
            id: "t1",
            signal: "missing_test",
            path: "src/db.ts",
            path_kind: "file",
            line: null,
            complexity: "medium",
          },
        ],
      },
    },
    narrative: null,
    estimated_cost: null,
  };
}

describe("onboarding.json", () => {
  it("has no <word>-style text in any message (next-intl would read it as a rich-text tag)", () => {
    const bad: string[] = [];
    const walk = (node: unknown, path: string) => {
      if (typeof node === "string") {
        if (/<[A-Za-z]/.test(node)) bad.push(path);
      } else if (node && typeof node === "object") {
        for (const [k, v] of Object.entries(node)) walk(v, path ? `${path}.${k}` : k);
      }
    };
    walk(messages, "");
    expect(bad).toEqual([]);
  });

  it("defines a title template for every first-task signal", () => {
    for (const signal of ["todo_comment", "missing_test", "route_without_test", "readme_missing_setup"]) {
      expect(lookup(taskTitleKey(signal))).toMatch(/\{path\}/);
    }
  });
});

describe("parseHash", () => {
  it("returns the section id for a known hash and null otherwise", () => {
    expect(parseHash("#run-locally")).toBe("run-locally");
    expect(parseHash("first-tasks")).toBe("first-tasks");
    expect(parseHash("#nope")).toBeNull();
    expect(parseHash("")).toBeNull();
    expect(parseHash("#")).toBeNull();
  });
});

describe("fenceFor", () => {
  it("is longer than any backtick run inside the command and at least 3", () => {
    expect(fenceFor("pnpm dev")).toBe("```");
    expect(fenceFor("echo ``` x")).toBe("````");
    expect(fenceFor("a ````` b `` c")).toBe("``````");
  });
});

describe("exportFileName", () => {
  it("uses the 7-char sha and neutralises unsafe characters", () => {
    expect(exportFileName("dev-digest", "abcdef1234567890")).toBe("dev-digest-onboarding-abcdef1.md");
    expect(exportFileName("../a b/c", "abcdef1234567890")).toBe("a-b-c-onboarding-abcdef1.md");
  });
});

describe("fileUrl", () => {
  it("pins to the sha, encodes each segment, and picks blob vs tree by kind", () => {
    expect(fileUrl("o/r", "abc", "a b/c#d?.ts", "file")).toBe(
      "https://github.com/o/r/blob/abc/a%20b/c%23d%3F.ts",
    );
    expect(fileUrl("o/r", "abc", "docs/ü", "directory")).toBe("https://github.com/o/r/tree/abc/docs/%C3%BC");
  });
});

describe("splitForMiddleTruncation", () => {
  it("keeps the file name whole in the tail", () => {
    expect(splitForMiddleTruncation("src/modules/deep/file.ts")).toEqual({
      head: "src/modules/deep",
      tail: "/file.ts",
    });
  });
  it("does not split a short bare name, and trims the end of a very long one", () => {
    expect(splitForMiddleTruncation("README.md")).toEqual({ head: "README.md", tail: "" });
    const long = "x".repeat(60);
    const r = splitForMiddleTruncation(long);
    expect(r.head + r.tail).toBe(long);
    expect(r.tail.length).toBe(12);
  });
  it("round-trips a long file name under a directory", () => {
    const p = `src/${"y".repeat(40)}.ts`;
    const r = splitForMiddleTruncation(p);
    expect(r.head + r.tail).toBe(p);
    expect(r.tail.length).toBe(12);
  });
});

describe("summaryArgs", () => {
  it("derives stack, entry points and module count from the facts", () => {
    expect(summaryArgs(tour().sections!, "none")).toEqual({
      stack: "Node",
      entryPoints: "src/index.ts",
      modules: 2,
    });
  });
  it("falls back to the supplied 'none' text", () => {
    const s = tour().sections!;
    s.architecture.stack = [];
    s.critical_paths.items = [];
    expect(summaryArgs(s, "none detected")).toMatchObject({ stack: "none detected", entryPoints: "none detected" });
  });
});

describe("buildMarkdown", () => {
  it("contains the header facts and all five sections, with a safe fence per command", () => {
    const md = buildMarkdown(tour(), "dev-digest", t);
    expect(md).toContain("# Onboarding for dev-digest");
    expect(md).toContain("abcdef1");
    for (const k of ["architecture", "critical_paths", "run_locally", "reading_path", "first_tasks"]) {
      expect(md).toContain(`## ${lookup(`sections.${k}`)}`);
    }
    expect(md).toContain("`````sh\necho ```` && pnpm install\n`````");
    expect(md).toContain("Add tests for src/db.ts");
  });

  it("emits only the header when the tour has no sections", () => {
    const x = tour();
    x.sections = null;
    expect(buildMarkdown(x, "r", t)).not.toContain("## ");
  });

  it("adds narrative text and labels each section AI-written or From repository facts", () => {
    const x = tour();
    const cmdId = x.sections!.run_locally.groups[0]!.commands[0]!.id;
    const firstPath = x.sections!.critical_paths.items[0]?.path ?? "src/db.ts";
    x.narrative = {
      status: "ready",
      generation_id: "g",
      source_sha: "abcdef1234",
      outdated: false,
      generated_at: "2026-10-01T10:00:00.000Z",
      provider: null,
      model: null,
      input_tokens: null,
      output_tokens: null,
      cost_usd: null,
      last_failure: null,
      fallback_sections: [],
      sections: {
        architecture: { body_markdown: "The system is layered.", diagram_mermaid: "flowchart TD\n A-->B" },
        critical_paths: x.sections!.critical_paths.items.length ? [{ path: firstPath, description: "Core entry" }] : null,
        run_locally: [{ command_id: cmdId, position: 0, note: "Start here" }],
        reading_path: null,
        first_tasks: null,
      },
    };
    const md = buildMarkdown(x, "dev-digest", t);
    expect(md).toContain("The system is layered.");
    expect(md).toContain("```mermaid\nflowchart TD\n A-->B\n```");
    expect(md).toContain("Start here");
    expect(md).toContain("_AI-written_");
    // sections whose narrative is null keep the facts label
    expect(md).toContain("_From repository facts_");
    expect(md).toMatch(/## Guided reading path\n_From repository facts_/);
    expect(md).toMatch(/## Architecture overview\n_AI-written_/);
  });

  it("labels every section From repository facts without a narrative", () => {
    const md = buildMarkdown(tour(), "dev-digest", t);
    expect(md).not.toContain("AI-written");
    expect(md.match(/_From repository facts_/g)).toHaveLength(5);
  });

  it("formats relative time and sub-cent costs", () => {
    expect(relativeTime(new Date(Date.now() - 3 * 3_600_000).toISOString())).toBe("3h ago");
    expect(relativeTime(null)).toBe("—");
    expect(formatUsd(0.0004)).toBe("$0.0004");
    expect(formatUsd(1.234)).toBe("$1.23");
  });

  it("currentPathsOf collects the paths named by every facts section", () => {
    const paths = currentPathsOf(tour().sections!);
    expect(paths.has("src/db.ts")).toBe(true);
  });
});
