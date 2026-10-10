import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CI_LIMITS, CiResultArtifact } from '@devdigest/shared';
import { buildResultArtifact, writeResultArtifact, type AgentTrace } from './artifact.js';
import { computeRunnerBuild, UNKNOWN_RUNNER_BUILD } from './build-id.js';
import { makeRedactor } from './redact.js';
import { finding } from './test-helpers.js';
import { writeFileSync } from 'node:fs';

/** T8/T15 — artifact shape, redaction, runner build id (AC-63, 65, 145, 169, 175). */
const trace: AgentTrace = {
  agent: 'Sec',
  agentVersion: 3,
  ciFailOn: 'critical',
  model: 'm',
  skills: [{ slug: 's', sha256: 'a'.repeat(64) }],
  memorySha256: 'b'.repeat(64),
  manifestSha256: 'c'.repeat(64),
};
const base = {
  status: 'succeeded' as const,
  verdict: 'comment' as const,
  findings: [finding(), finding({ severity: 'WARNING' }), finding({ severity: 'SUGGESTION' })],
  costUsd: 0.5,
  durationMs: 1234.6,
  reason: null,
  trace,
  runnerBuild: 'd'.repeat(64),
  redact: makeRedactor([]),
};

describe('buildResultArtifact', () => {
  it('AC-169 + AC-145: carries exactly the v2 fields - no identity, no finding text', () => {
    const a = buildResultArtifact(base);
    expect(CiResultArtifact.safeParse(a).success).toBe(true);
    expect(Object.keys(a).sort()).toEqual(
      [
        'schema_version', 'status', 'verdict', 'findings_count', 'critical', 'warning', 'suggestion',
        'cost_usd', 'duration_ms', 'agent', 'agent_version', 'ci_fail_on', 'model', 'skills',
        'memory_sha256', 'manifest_sha256', 'runner_build', 'reason',
      ].sort(),
    );
    expect([a.findings_count, a.critical, a.warning, a.suggestion]).toEqual([3, 1, 1, 1]);
    expect(a.duration_ms).toBe(1235);
    expect(JSON.stringify(a)).not.toContain('Hardcoded');
  });

  it('truncates reason to the contract limit', () => {
    const a = buildResultArtifact({ ...base, status: 'failed', reason: 'x'.repeat(900) });
    expect(a.reason).toHaveLength(CI_LIMITS.REASON_MAX_CHARS);
  });

  it('AC-65: replaces exact secret values with *** in every string field', () => {
    const a = buildResultArtifact({
      ...base,
      status: 'failed',
      reason: 'llm_error: bad key sk-secret-1 / token tok-secret-2',
      trace: { ...trace, agent: 'agent-sk-secret-1' },
      redact: makeRedactor(['sk-secret-1', 'tok-secret-2']),
    });
    const text = JSON.stringify(a);
    expect(text).not.toContain('sk-secret-1');
    expect(text).not.toContain('tok-secret-2');
    expect(a.reason).toBe('llm_error: bad key *** / token ***');
    expect(a.agent).toBe('agent-***');
  });

  it('falls back to a minimal failed artifact when the candidate is invalid', () => {
    const a = buildResultArtifact({ ...base, trace: { ...trace, manifestSha256: 'not-hex' } });
    expect(a.status).toBe('failed');
    expect(a.reason).toBe('internal_error');
    expect(CiResultArtifact.safeParse(a).success).toBe(true);
  });

  it('writes <resultDir>/<slug>/devdigest-result.json', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'devdigest-art-'));
    try {
      const file = writeResultArtifact(dir, 'sec', buildResultArtifact(base));
      expect(file).toBe(path.join(dir, 'sec', 'devdigest-result.json'));
      expect(CiResultArtifact.safeParse(JSON.parse(readFileSync(file, 'utf8'))).success).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('computeRunnerBuild', () => {
  function bundle(index: string, chunk: string, pkg = '{"type":"module"}'): string {
    const dir = mkdtempSync(path.join(tmpdir(), 'devdigest-bundle-'));
    writeFileSync(path.join(dir, 'index.js'), index);
    writeFileSync(path.join(dir, '300.index.js'), chunk);
    writeFileSync(path.join(dir, 'package.json'), pkg);
    return dir;
  }

  it('AC-175/AC-174: stable for one bundle, different when either file differs', () => {
    const a = bundle('one', 'chunk');
    const b = bundle('one', 'chunk');
    const c = bundle('two', 'chunk');
    const d = bundle('one', 'chunk2');
    const e = bundle('one', 'chunk', '{"type":"commonjs"}');
    try {
      expect(computeRunnerBuild(a)).toMatch(/^[0-9a-f]{64}$/);
      expect(computeRunnerBuild(a)).toBe(computeRunnerBuild(a));
      expect(computeRunnerBuild(a)).toBe(computeRunnerBuild(b));
      expect(computeRunnerBuild(a)).not.toBe(computeRunnerBuild(c));
      expect(computeRunnerBuild(a)).not.toBe(computeRunnerBuild(d));
      expect(computeRunnerBuild(a)).not.toBe(computeRunnerBuild(e));
    } finally {
      for (const x of [a, b, c, d, e]) rmSync(x, { recursive: true, force: true });
    }
  });

  it('is "unknown" when the shipped files are not readable', () => {
    expect(computeRunnerBuild('/nonexistent-devdigest-dir')).toBe(UNKNOWN_RUNNER_BUILD);
  });
});
