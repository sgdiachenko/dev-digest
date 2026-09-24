/**
 * No-DB route smoke test via app.inject() — an invalid `:id` fails Zod
 * validation before the handler (and any DB call) runs.
 */
import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';

const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

describe('GET /pulls/:id/smart-diff (no DB)', () => {
  it('rejects a non-uuid id with a 422 structured error', async () => {
    const app = await buildApp({ config });
    const res = await app.inject({ method: 'GET', url: '/pulls/not-a-uuid/smart-diff' });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('validation_error');
    await app.close();
  });
});
