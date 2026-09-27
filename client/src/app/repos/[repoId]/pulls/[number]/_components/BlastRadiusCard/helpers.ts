import type { BlastRadiusResponse } from "@devdigest/shared";

export interface BlastStats {
  symbols: number;
  callers: number;
  endpoints: number;
  crons: number;
}

/** Client-computed summary counters (D4: the UI derives its own numbers from
    the response rather than parsing the server's `summary` string). */
export function computeBlastStats(data: BlastRadiusResponse): BlastStats {
  const callers = data.downstream.reduce((sum, d) => sum + d.callers.length, 0);
  const endpoints = new Set<string>();
  const crons = new Set<string>();
  for (const d of data.downstream) {
    for (const e of d.endpoints_affected) endpoints.add(e);
    for (const c of d.crons_affected) crons.add(c);
  }
  return {
    symbols: data.changed_symbols.length,
    callers,
    endpoints: endpoints.size,
    crons: crons.size,
  };
}
