import type { AgentPerfRow } from "@devdigest/shared";
import { wholePercent } from "@/lib/agent-stats";
import { ROW_CAP } from "./constants";

export type SortKey = "agent" | "runs" | "avg_cost" | "avg_duration" | "accept" | "last_run";
export type SortDir = "asc" | "desc";

export const DEFAULT_SORT: { key: SortKey; dir: SortDir } = { key: "accept", dir: "desc" };

/** The direction a column starts in when first clicked: names A→Z, every figure high→low. */
export function defaultDir(key: SortKey): SortDir {
  return key === "agent" ? "asc" : "desc";
}

const decided = (r: AgentPerfRow) => r.accepted + r.dismissed;
const nameOf = (r: AgentPerfRow) => r.agent_name ?? "";

function numericValue(r: AgentPerfRow, key: SortKey): number | null {
  switch (key) {
    case "runs":
      return r.runs;
    case "avg_cost":
      return r.avg_cost_usd;
    case "avg_duration":
      return r.avg_duration_ms;
    case "last_run":
      return r.last_run_at ? Date.parse(r.last_run_at) : null;
    case "accept":
      return wholePercent(r.accept_rate);
    case "agent":
      return null;
  }
}

/** 0 = ordered by value, 1 = small-sample accept, 2 = no value ("—"), 3 = the Deleted row. */
function band(r: AgentPerfRow, key: SortKey): number {
  if (r.agent_id === null) return 3;
  if (key === "agent") return 0;
  if (key === "accept") {
    if (r.accept_rate == null) return 2;
    return r.small_sample ? 1 : 0;
  }
  return numericValue(r, key) == null ? 2 : 0;
}

const byName = (a: AgentPerfRow, b: AgentPerfRow) => nameOf(a).localeCompare(nameOf(b), "en");

/**
 * A sorted copy. The Deleted row is always last; rows without a value ("—") follow every row that
 * has one, in either direction; small-sample accept rates follow the rated rows by decided count;
 * ties break by name A→Z.
 */
export function sortAgentRows(rows: AgentPerfRow[], key: SortKey, dir: SortDir): AgentPerfRow[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const ba = band(a, key);
    const bb = band(b, key);
    if (ba !== bb) return ba - bb;
    if (ba === 1) return decided(b) - decided(a) || byName(a, b);
    if (ba === 0) {
      if (key === "agent") return sign * byName(a, b);
      const diff = numericValue(a, key)! - numericValue(b, key)!;
      if (diff !== 0) return sign * diff;
    }
    return byName(a, b);
  });
}

/** The first `ROW_CAP` rows and how many agents there are in total. */
export function capRows(rows: AgentPerfRow[]): { shown: AgentPerfRow[]; total: number } {
  return { shown: rows.slice(0, ROW_CAP), total: rows.length };
}

/** Mean of the non-null values, or null when there are none. */
export function meanOf(values: (number | null)[]): number | null {
  const known = values.filter((v): v is number => v != null);
  return known.length === 0 ? null : known.reduce((s, v) => s + v, 0) / known.length;
}
