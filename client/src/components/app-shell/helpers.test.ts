import { describe, it, expect } from "vitest";
import { NAV, resolveHref } from "@devdigest/ui";
import { activeKeyFor } from "./helpers";
import contextMessages from "../../../messages/en/context.json";

function collectStrings(node: unknown): string[] {
  if (typeof node === "string") return [node];
  if (node && typeof node === "object") return Object.values(node).flatMap(collectStrings);
  return [];
}

describe("Project Context sidebar entry", () => {
  const workspace = NAV.find((g) => g.section === "WORKSPACE");
  const item = workspace?.items.find((i) => i.key === "context");

  it("registers a repo-scoped nav item without a g-shortcut", () => {
    expect(item).toBeDefined();
    expect(item?.href).toBe("/repos/:repoId/context");
    expect(item?.gKey).toBeUndefined();
    expect(resolveHref(item!.href, "r1")).toBe("/repos/r1/context");
  });

  it("marks the item active on the context route", () => {
    expect(activeKeyFor("/repos/x/context")).toBe("context");
  });
});

describe("context.json copy", () => {
  it("has no <tag>-looking text (next-intl parses it as rich text)", () => {
    const strings = collectStrings(contextMessages);
    expect(strings.length).toBeGreaterThan(10);
    expect(strings.filter((s) => /<[A-Za-z]/.test(s))).toEqual([]);
  });
});
