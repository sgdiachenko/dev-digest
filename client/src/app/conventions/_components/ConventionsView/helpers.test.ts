import { describe, it, expect } from "vitest";
import type { ConventionCandidate } from "@devdigest/shared";
import type { Repo } from "../../../../lib/types";
import { countByStatus, filterConventions, githubEvidenceUrl, relativeTime } from "./helpers";

function repo(overrides: Partial<Repo> = {}): Repo {
  return {
    id: "r1",
    workspace_id: "w1",
    owner: "acme",
    name: "payments-api",
    full_name: "acme/payments-api",
    default_branch: "main",
    clone_path: null,
    last_polled_at: null,
    created_by: null,
    ...overrides,
  };
}

function candidate(overrides: Partial<ConventionCandidate> = {}): ConventionCandidate {
  return {
    id: "c1",
    repo_id: "r1",
    category: "errors",
    rule: "Always use async/await instead of .then() chains.",
    rationale: null,
    evidence_path: "src/api/users.ts",
    evidence_line: 23,
    evidence_snippet: "const user = await db.users.find(id);",
    confidence: 0.91,
    status: "pending",
    origin: "model",
    support_count: null,
    created_at: null,
    ...overrides,
  };
}

describe("githubEvidenceUrl", () => {
  it("builds a blob URL pinned to the default branch, with an #L<line> anchor", () => {
    expect(githubEvidenceUrl(repo(), "src/api/users.ts", 23)).toBe(
      "https://github.com/acme/payments-api/blob/main/src/api/users.ts#L23",
    );
  });

  it("omits the anchor when there is no line", () => {
    expect(githubEvidenceUrl(repo(), "src/api/users.ts", null)).toBe(
      "https://github.com/acme/payments-api/blob/main/src/api/users.ts",
    );
  });

  it("respects a non-default default_branch", () => {
    expect(githubEvidenceUrl(repo({ default_branch: "develop" }), "a.ts", 1)).toContain("/blob/develop/a.ts");
  });
});

describe("filterConventions", () => {
  const list = [
    candidate({ id: "p1", status: "pending" }),
    candidate({ id: "a1", status: "accepted" }),
    candidate({ id: "r1c", status: "rejected" }),
  ];

  it('"all" returns every candidate', () => {
    expect(filterConventions(list, "all")).toHaveLength(3);
  });

  it("filters to exactly one status", () => {
    expect(filterConventions(list, "accepted").map((c) => c.id)).toEqual(["a1"]);
    expect(filterConventions(list, "rejected").map((c) => c.id)).toEqual(["r1c"]);
  });
});

describe("countByStatus", () => {
  it("counts each bucket independently, plus a total under all", () => {
    const list = [
      candidate({ id: "1", status: "pending" }),
      candidate({ id: "2", status: "pending" }),
      candidate({ id: "3", status: "accepted" }),
    ];
    expect(countByStatus(list)).toEqual({ all: 3, pending: 2, accepted: 1, rejected: 0 });
  });

  it("returns all zeros for an empty board", () => {
    expect(countByStatus([])).toEqual({ all: 0, pending: 0, accepted: 0, rejected: 0 });
  });
});

describe("relativeTime", () => {
  it("renders an em dash for a missing timestamp", () => {
    expect(relativeTime(null)).toBe("—");
    expect(relativeTime(undefined)).toBe("—");
  });

  it("renders an em dash for an unparseable timestamp", () => {
    expect(relativeTime("not-a-date")).toBe("—");
  });

  it("renders minutes for a recent timestamp", () => {
    const iso = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(relativeTime(iso)).toBe("5m ago");
  });

  it("renders hours for an older timestamp", () => {
    const iso = new Date(Date.now() - 3 * 3_600_000).toISOString();
    expect(relativeTime(iso)).toBe("3h ago");
  });
});
