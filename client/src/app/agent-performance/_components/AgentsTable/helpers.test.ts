import { describe, it, expect } from "vitest";
import { capRows, meanOf, sortAgentRows } from "./helpers";
import { perfRow } from "../../testing";

const named = (name: string, over: Parameters<typeof perfRow>[0] = {}) =>
  perfRow({ agent_id: name, agent_name: name, ...over });
const names = (rows: { agent_name: string | null }[]) => rows.map((r) => r.agent_name ?? "Deleted");

describe("sortAgentRows", () => {
  const rated = named("B", { accept_rate: 0.9 });
  const lower = named("A", { accept_rate: 0.5 });
  const smallBig = named("S1", { accept_rate: 1, small_sample: true, accepted: 5, dismissed: 4 });
  const smallLow = named("S2", { accept_rate: 1, small_sample: true, accepted: 2, dismissed: 1 });
  const none = named("N", { accept_rate: null, accepted: 0, dismissed: 0 });
  const deleted = perfRow({ agent_id: null, agent_name: null, accept_rate: 0.99 });
  const all = [deleted, none, smallLow, lower, smallBig, rated];

  it("puts accept descending first: rated, then small samples by decided count, then dashes, Deleted last (AC-121, AC-123-AC-125)", () => {
    expect(names(sortAgentRows(all, "accept", "desc"))).toEqual(["B", "A", "S1", "S2", "N", "Deleted"]);
  });

  it("keeps dashes and the Deleted row last when the direction flips (AC-124, AC-125)", () => {
    expect(names(sortAgentRows(all, "accept", "asc"))).toEqual(["A", "B", "S1", "S2", "N", "Deleted"]);
  });

  it("breaks ties by name A to Z (AC-126)", () => {
    const rows = [named("Zed", { runs: 4 }), named("Amy", { runs: 4 }), named("Mid", { runs: 9 })];
    expect(names(sortAgentRows(rows, "runs", "desc"))).toEqual(["Mid", "Amy", "Zed"]);
  });

  it("puts rows without a value last for any column, and does not mutate the input", () => {
    const rows = [named("A", { avg_cost_usd: null }), named("B", { avg_cost_usd: 0.1 }), named("C", { avg_cost_usd: 0.2 })];
    expect(names(sortAgentRows(rows, "avg_cost", "asc"))).toEqual(["B", "C", "A"]);
    expect(names(sortAgentRows(rows, "avg_cost", "desc"))).toEqual(["C", "B", "A"]);
    expect(names(rows)).toEqual(["A", "B", "C"]);
  });

  it("sorts by name and by last run", () => {
    const rows = [named("b", { last_run_at: "2026-10-01T00:00:00.000Z" }), named("a", { last_run_at: null }), named("c", { last_run_at: "2026-10-05T00:00:00.000Z" })];
    expect(names(sortAgentRows(rows, "agent", "asc"))).toEqual(["a", "b", "c"]);
    expect(names(sortAgentRows(rows, "last_run", "desc"))).toEqual(["c", "b", "a"]);
  });
});

describe("capRows and meanOf", () => {
  it("caps at 200 rows and reports the total (NFR-7, EC-47)", () => {
    const rows = Array.from({ length: 250 }, (_, i) => named(`a${i}`));
    const { shown, total } = capRows(rows);
    expect(shown).toHaveLength(200);
    expect(total).toBe(250);
  });

  it("averages only known values", () => {
    expect(meanOf([1, null, 3])).toBe(2);
    expect(meanOf([null])).toBeNull();
  });
});
