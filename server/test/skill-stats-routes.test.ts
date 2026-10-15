/**
 * T30 — GET /skills/:id/stats via app.inject(), DB-free: the skills repository's
 * two stats methods are spied on its prototype (the skills module is built in
 * its own routes plugin, so there is no container override). Invalid input is a
 * 422 before any store call.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { SkillStats } from '../src/vendor/shared/index.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { MockAuthProvider } from '../src/adapters/mocks.js';
import { MAX_PERIOD_MS } from '../src/modules/_shared/stats-rules.js';
import { SkillsRepository } from '../src/modules/skills/repository.js';

const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
const SKILL = '11111111-1111-4111-8111-111111111111';
const DAY = 86_400_000;

let app: FastifyInstance | undefined;
const skillRef = vi.spyOn(SkillsRepository.prototype, 'skillRef');
const statsFacts = vi.spyOn(SkillsRepository.prototype, 'statsFacts');

beforeEach(() => {
  skillRef.mockReset().mockResolvedValue({ id: SKILL, enabled: true });
  statsFacts.mockReset().mockResolvedValue({ links: [], runs: [], runFindings: [] });
});
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function boot() {
  app = await buildApp({ config, overrides: { auth: new MockAuthProvider() } });
  return app;
}

const iso = (ms: number) => new Date(ms).toISOString();
const qs = (p: Record<string, string>) => new URLSearchParams(p).toString();

describe('GET /skills/:id/stats period validation (skill AC-9, NFR-7)', () => {
  it('only from, only to, a value without offset and garbage are 422 with no figures, before any store call', async () => {
    const app = await boot();
    const to = Date.now() - 1000;
    const from = to - 2 * DAY;
    const bad: Record<string, string>[] = [
      { from: iso(from) },
      { to: iso(to) },
      { from: '2026-10-01T00:00:00', to: iso(to) },
      { from: 'x', to: iso(to) },
      { from: iso(from), to: '2026-10-01' },
    ];
    for (const p of bad) {
      const res = await app.inject({ method: 'GET', url: `/skills/${SKILL}/stats?${qs(p)}` });
      expect(res.statusCode).toBe(422);
      expect(res.json()).not.toHaveProperty('agent_count');
    }
    expect(skillRef).not.toHaveBeenCalled();
    expect(statsFacts).not.toHaveBeenCalled();
  });

  it('from >= to, from in the future and a span of 367 days + 1 ms are 422', async () => {
    const app = await boot();
    const now = Date.now();
    const cases = [
      { from: iso(now - DAY), to: iso(now - 2 * DAY) },
      { from: iso(now - DAY), to: iso(now - DAY) },
      { from: iso(now + DAY), to: iso(now + 2 * DAY) },
      { from: iso(now - MAX_PERIOD_MS - 1), to: iso(now) },
    ];
    for (const p of cases) {
      const res = await app.inject({ method: 'GET', url: `/skills/${SKILL}/stats?${qs(p)}` });
      expect(res.statusCode).toBe(422);
      expect(res.json()).not.toHaveProperty('agent_count');
    }
    expect(statsFacts).not.toHaveBeenCalled();
  });

  it('a non-uuid skill id is 422', async () => {
    const app = await boot();
    const res = await app.inject({ method: 'GET', url: '/skills/nope/stats' });
    expect(res.statusCode).toBe(422);
  });
});

describe('GET /skills/:id/stats 200 and 404', () => {
  it('without from and to answers 200 with a 30-day period and every old key (skill NFR-11)', async () => {
    const app = await boot();
    const res = await app.inject({ method: 'GET', url: `/skills/${SKILL}/stats` });
    expect(res.statusCode).toBe(200);
    const body = SkillStats.parse(res.json());
    for (const k of ['agent_count', 'agents', 'pull_pct', 'accept_pct', 'findings_30d', 'by_category']) {
      expect(res.json()).toHaveProperty(k);
    }
    expect(Date.parse(body.period.to) - Date.parse(body.period.from)).toBe(30 * DAY);
    expect(body.findings_30d).toBe(body.findings);
  });

  it('a valid pair is passed through as the exact window', async () => {
    const app = await boot();
    const to = Date.now() - 60_000;
    const from = to - DAY;
    const res = await app.inject({ method: 'GET', url: `/skills/${SKILL}/stats?${qs({ from: iso(from), to: iso(to) })}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().period).toEqual({ from: iso(from), to: iso(to) });
  });

  it('an unknown or foreign skill is 404 and reads no facts (skill AC-10)', async () => {
    skillRef.mockResolvedValue(null);
    const app = await boot();
    const res = await app.inject({ method: 'GET', url: `/skills/${SKILL}/stats` });
    expect(res.statusCode).toBe(404);
    expect(statsFacts).not.toHaveBeenCalled();
  });
});
