import { describe, it, expect } from "vitest";
import messages from "../../../messages/en/agentPerformance.json";

function leaves(node: unknown, path = ""): Array<[string, unknown]> {
  if (node !== null && typeof node === "object") {
    return Object.entries(node).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));
  }
  return [[path, node]];
}

describe("agentPerformance catalog", () => {
  const all = leaves(messages);

  it("has only non-empty string leaves (NFR-20)", () => {
    expect(all.length).toBeGreaterThan(100);
    for (const [path, value] of all) {
      expect(typeof value, path).toBe("string");
      expect((value as string).trim().length, path).toBeGreaterThan(0);
    }
  });

  it("never has a < directly followed by a letter (next-intl reads it as a tag)", () => {
    for (const [path, value] of all) expect(value as string, path).not.toMatch(/<[A-Za-z]/);
  });
});
