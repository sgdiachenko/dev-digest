/**
 * S2 — pure mapper: turn the repo-intel facade's flat `BlastResult` into the
 * wire `BlastRadiusResponse` — group callers by the changed symbol they reach
 * (D3), attribute endpoints/crons per group (D2), and compute a deterministic
 * summary (D4). No I/O, no persistence — same shape as `smart-diff/helpers.ts`.
 */
import type {
  BlastCaller,
  BlastRadiusResponse,
  ChangedSymbol,
  DownstreamImpact,
} from '@devdigest/shared';
import type { BlastResult } from '../repo-intel/types.js';

/**
 * D2 — endpoints/crons for one downstream group. On the persistent path
 * (`factsByFile` present) attribution is exact: union the facts of every file
 * a caller in this group lives in. On the ripgrep fallback (`factsByFile`
 * absent, `degraded: true`) there is no per-file breakdown, so a group with
 * at least one caller gets the whole repo's `impactedEndpoints` — a
 * deliberate over-estimate ("may be affected") rather than a silent
 * under-estimate; crons are never attributed on that path.
 */
function endpointsAndCronsFor(result: BlastResult, callerFiles: string[]): { endpoints: string[]; crons: string[] } {
  if (result.factsByFile) {
    const factsByFile = result.factsByFile;
    const endpoints = new Set<string>();
    const crons = new Set<string>();
    for (const file of callerFiles) {
      const facts = factsByFile[file];
      if (!facts) continue;
      for (const e of facts.endpoints) endpoints.add(e);
      for (const c of facts.crons) crons.add(c);
    }
    return { endpoints: [...endpoints], crons: [...crons] };
  }
  return { endpoints: [...result.impactedEndpoints], crons: [] };
}

/** D4 — deterministic counters string (for the MCP agent; the web UI
 *  computes the same statistics itself from the raw response). */
function buildSummary(changedSymbols: ChangedSymbol[], downstream: DownstreamImpact[]): string {
  const totalCallers = downstream.reduce((sum, d) => sum + d.callers.length, 0);
  const endpoints = new Set<string>();
  const crons = new Set<string>();
  for (const d of downstream) {
    for (const e of d.endpoints_affected) endpoints.add(e);
    for (const c of d.crons_affected) crons.add(c);
  }
  if (downstream.length === 0) {
    return `${changedSymbols.length} changed symbol(s), no downstream callers found.`;
  }
  return (
    `${changedSymbols.length} changed symbol(s), ${totalCallers} caller(s) across ` +
    `${downstream.length} group(s), ${endpoints.size} endpoint(s) and ${crons.size} cron(s) affected.`
  );
}

/**
 * D3 — one `downstream` element per `viaSymbol` (the changed symbol's
 * `name`), in order of that symbol's first appearance in `changedSymbols`. A
 * changed symbol with zero matching callers never creates a group — it still
 * shows up in `changed_symbols`, the client renders it separately.
 */
export function buildBlastRadius(result: BlastResult): BlastRadiusResponse {
  const changedSymbols: ChangedSymbol[] = result.changedSymbols.map((s) => ({
    name: s.name,
    file: s.file,
    kind: s.kind,
  }));

  const seen = new Set<string>();
  const downstream: DownstreamImpact[] = [];
  for (const symbol of result.changedSymbols) {
    const viaSymbol = symbol.name;
    if (seen.has(viaSymbol)) continue;
    seen.add(viaSymbol);

    const rows = result.callers.filter((c) => c.viaSymbol === viaSymbol);
    if (rows.length === 0) continue;

    // E1 — per-caller attribution: call `endpointsAndCronsFor` for each row's
    // own file, not once for the whole group. Exact on the persistent path;
    // on the ripgrep/degraded path `endpointsAndCronsFor` always returns the
    // full `impactedEndpoints` regardless of `callerFiles`, so every row gets
    // the same (group-wide) list there — no special-casing needed.
    const callers: BlastCaller[] = rows.map((c) => {
      const attribution = endpointsAndCronsFor(result, [c.file]);
      return {
        name: c.symbol,
        file: c.file,
        line: c.line,
        endpoints_affected: attribution.endpoints,
        crons_affected: attribution.crons,
      };
    });
    const callerFiles = [...new Set(rows.map((c) => c.file))];
    const { endpoints, crons } = endpointsAndCronsFor(result, callerFiles);

    downstream.push({
      symbol: viaSymbol,
      callers,
      endpoints_affected: endpoints,
      crons_affected: crons,
    });
  }

  return {
    changed_symbols: changedSymbols,
    downstream,
    summary: buildSummary(changedSymbols, downstream),
    degraded: result.degraded ?? false,
    reason: result.reason ?? null,
  };
}
