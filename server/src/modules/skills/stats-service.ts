/**
 * Skill Stats use cases (read-only). Takes ports only — never the container or
 * a drizzle handle — and makes no review run and no outbound call. One
 * structured `info` line per `forSkill` call: ids and numbers, never a finding
 * text or a skill body.
 */
import type { SkillStats } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { SKILL_CARD_PERIOD_MS } from './constants.js';
import { computeSkillStats, indexSkillRuns } from './helpers.js';
import type { SkillStatsLogger, SkillStatsStore, SkillStatsWindow } from './types.js';

export class SkillStatsService {
  constructor(
    private readonly store: SkillStatsStore,
    private readonly log: SkillStatsLogger,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** `from`/`to` are given as a pair, or both omitted for the card period ending now. */
  async forSkill(workspaceId: string, id: string, from?: string, to?: string): Promise<SkillStats> {
    const startedAt = this.now();
    const ref = await this.store.skillRef(workspaceId, id);
    if (!ref) throw new NotFoundError('Skill not found');
    const window: SkillStatsWindow =
      from !== undefined && to !== undefined
        ? { from: new Date(from), to: new Date(to) }
        : this.cardWindow(startedAt);
    const facts = await this.store.statsFacts(workspaceId, window, [id]);
    const result = computeSkillStats(id, facts, window, startedAt);
    this.log.info({
      route: 'GET /skills/:id/stats',
      workspace_id: workspaceId,
      from: window.from.toISOString(),
      to: window.to.toISOString(),
      duration_ms: this.now().getTime() - startedAt.getTime(),
    });
    return result;
  }

  /** Every skill's stats over the card period, from one `statsFacts` call. */
  async forList(workspaceId: string, skillIds: string[]): Promise<Map<string, SkillStats>> {
    const out = new Map<string, SkillStats>();
    if (skillIds.length === 0) return out;
    const asOf = this.now();
    const window = this.cardWindow(asOf);
    const facts = await this.store.statsFacts(workspaceId, window, skillIds);
    const index = indexSkillRuns(facts, window);
    for (const id of skillIds) out.set(id, computeSkillStats(id, facts, window, asOf, index));
    return out;
  }

  private cardWindow(asOf: Date): SkillStatsWindow {
    return { from: new Date(asOf.getTime() - SKILL_CARD_PERIOD_MS), to: asOf };
  }
}
