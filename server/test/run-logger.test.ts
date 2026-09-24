import { describe, it, expect } from 'vitest';
import { RunBus } from '../src/platform/sse.js';
import { RunLogger } from '../src/platform/run-logger.js';
import { buildRunTrace, emptyPromptAssembly } from '../src/platform/trace-builder.js';

/**
 * Pins that `RunLogLine.data` (model, tokens, sources, …) survives the trip
 * from a live SSE event, through `RunLogger.logFor()`, into `buildRunTrace()`
 * — the Zod-validated document that actually gets persisted. See
 * `docs/plans/…` for the "keep `data` on each persisted run-log line" plan.
 */
describe('RunLogger — persisted log lines keep structured data', () => {
  const intentPayload = {
    model: 'm',
    tokensIn: 10,
    tokensOut: 2,
    costUsd: 0.01,
    sourceCount: 3,
    cacheHit: false,
  };

  it('keeps data on the line that had it, and omits it on the line that did not', () => {
    const bus = new RunBus();
    const runId = 'run-1';
    const log = new RunLogger(bus, [runId]);

    log.info('intent: derived', intentPayload);
    log.info('no data here');

    const lines = log.logFor(runId);
    expect(lines[0].data).toEqual(intentPayload);
    expect('data' in lines[1]).toBe(false);
  });

  it('saves data in every target run when fanned out to several runIds', () => {
    const bus = new RunBus();
    const runIdA = 'run-a';
    const runIdB = 'run-b';
    const log = new RunLogger(bus, [runIdA, runIdB]);

    log.info('intent: derived', intentPayload);

    expect(log.logFor(runIdA)[0].data).toEqual(intentPayload);
    expect(log.logFor(runIdB)[0].data).toEqual(intentPayload);
  });

  it('survives buildRunTrace()’s Zod validation on write (the strip-on-parse control)', () => {
    const bus = new RunBus();
    const runId = 'run-2';
    const log = new RunLogger(bus, [runId]);

    log.info('intent: derived', intentPayload);

    const trace = buildRunTrace({
      config: { agent: 'Security Reviewer', model: 'gpt-4.1' },
      stats: { duration_ms: 1, tokens_in: 1, tokens_out: 1, cost_usd: null, findings: 0, grounding: '' },
      promptAssembly: emptyPromptAssembly('s', 'u'),
      toolCalls: [],
      rawOutput: '',
      memoryPulled: [],
      specsRead: [],
      log: log.logFor(runId),
    });

    expect(trace.log[0].data).toEqual(intentPayload);
  });
});
