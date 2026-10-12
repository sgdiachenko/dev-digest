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

describe("Onboarding Tour sidebar entry", () => {
  const workspace = NAV.find((g) => g.section === "WORKSPACE");
  const keys = workspace?.items.map((i) => i.key) ?? [];
  const item = workspace?.items.find((i) => i.key === "onboarding-tour");

  it("sits between pulls and context with a repo-scoped href", () => {
    expect(item?.href).toBe("/repos/:repoId/tour");
    expect(item?.label).toBe("Onboarding Tour");
    expect(keys.indexOf("onboarding-tour")).toBe(keys.indexOf("pulls") + 1);
    expect(keys.indexOf("context")).toBe(keys.indexOf("onboarding-tour") + 1);
    expect(resolveHref(item!.href, "r1")).toBe("/repos/r1/tour");
  });

  it("is active on the tour route and its sub-paths only", () => {
    expect(activeKeyFor("/repos/x/tour")).toBe("onboarding-tour");
    expect(activeKeyFor("/repos/x/tour/")).toBe("onboarding-tour");
    expect(activeKeyFor("/repos/x/tour/sub")).toBe("onboarding-tour");
    expect(activeKeyFor("/repos/x/tourist")).toBe("");
    expect(activeKeyFor("/onboarding")).toBe("");
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

describe("CI Runs sidebar entry", () => {
  const lab = NAV.find((g) => g.section === "SKILLS LAB");
  const item = lab?.items.find((i) => i.key === "ci-runs");

  it("is a Skills Lab item that links to /ci-runs with a translatable label", () => {
    expect(item?.href).toBe("/ci-runs");
    expect(item?.labelKey).toBe("nav.ciRuns");
    expect(resolveHref(item!.href, "r1")).toBe("/ci-runs");
  });

  it("is active on /ci-runs", () => {
    expect(activeKeyFor("/ci-runs")).toBe("ci-runs");
  });
});
