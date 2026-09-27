/**
 * `buildBlastRadius` (S2, blast/helpers.ts) — pure mapper, no DB/I/O.
 *
 * P3/E1: per-caller endpoint/cron attribution — persistent path is exact per
 * caller file, ripgrep/degraded path falls back to the group-wide list for
 * every row (no special-casing needed, `endpointsAndCronsFor` already does
 * this when `factsByFile` is absent).
 */
import { describe, it, expect } from 'vitest';
import { BlastRadiusResponse } from '@devdigest/shared';
import { buildBlastRadius } from '../src/modules/blast/helpers.js';
import type { BlastResult } from '../src/modules/repo-intel/types.js';

describe('buildBlastRadius — per-caller attribution (E1)', () => {
  it('persistent path: different caller files get different endpoints/crons', () => {
    const result: BlastResult = {
      changedSymbols: [{ file: 'src/rate-limit.ts', name: 'rateLimit', kind: 'function' }],
      callers: [
        { file: 'src/api/public/index.ts', symbol: 'handlePublic', viaSymbol: 'rateLimit', line: 23, rank: 1 },
        { file: 'src/jobs/sync.ts', symbol: 'runSync', viaSymbol: 'rateLimit', line: 9, rank: 1 },
      ],
      impactedEndpoints: ['GET /api/public', 'GET /api/other'],
      factsByFile: {
        'src/api/public/index.ts': { endpoints: ['GET /api/public'], crons: [] },
        'src/jobs/sync.ts': { endpoints: [], crons: ['nightly-sync'] },
      },
      degraded: false,
    };

    const response = buildBlastRadius(result);
    const parsed = BlastRadiusResponse.parse(response);

    const group = parsed.downstream[0]!;
    const publicCaller = group.callers.find((c) => c.file === 'src/api/public/index.ts')!;
    const syncCaller = group.callers.find((c) => c.file === 'src/jobs/sync.ts')!;

    expect(publicCaller.endpoints_affected).toEqual(['GET /api/public']);
    expect(publicCaller.crons_affected).toEqual([]);
    expect(syncCaller.endpoints_affected).toEqual([]);
    expect(syncCaller.crons_affected).toEqual(['nightly-sync']);

    // Group-level attribution (Tree view, unchanged) is still the union of both.
    expect(group.endpoints_affected).toEqual(['GET /api/public']);
    expect(group.crons_affected).toEqual(['nightly-sync']);
  });

  it('degraded/ripgrep path: every caller row gets the full group-wide impactedEndpoints', () => {
    const result: BlastResult = {
      changedSymbols: [{ file: 'src/rate-limit.ts', name: 'rateLimit', kind: 'function' }],
      callers: [
        { file: 'src/api/public/index.ts', symbol: 'handlePublic', viaSymbol: 'rateLimit', line: 23, rank: 0 },
        { file: 'src/jobs/sync.ts', symbol: 'runSync', viaSymbol: 'rateLimit', line: 9, rank: 0 },
      ],
      impactedEndpoints: ['GET /api/public', 'GET /api/other'],
      // No `factsByFile` — degraded/ripgrep fallback.
      degraded: true,
      reason: 'index_partial',
    };

    const response = buildBlastRadius(result);
    const parsed = BlastRadiusResponse.parse(response);

    const group = parsed.downstream[0]!;
    for (const caller of group.callers) {
      expect(caller.endpoints_affected).toEqual(['GET /api/public', 'GET /api/other']);
      expect(caller.crons_affected).toEqual([]);
    }
    // Same list, group-level (unchanged behavior).
    expect(group.endpoints_affected).toEqual(['GET /api/public', 'GET /api/other']);
  });
});
