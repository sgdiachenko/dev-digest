import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CI_LIMITS, CiResultArtifact } from '@devdigest/shared';
import type { CiFailOn, CiSkillEntry, Finding, Verdict } from '@devdigest/shared';
import { redactDeep, type Redactor } from './redact.js';

/** Artifact schema version written by this runner (v2: trace fields, no identity). */
export const ARTIFACT_SCHEMA_VERSION = 2;

/** What the runner knows about an agent's inputs; filled in as they are read. */
export interface AgentTrace {
  agent: string;
  agentVersion: number | null;
  ciFailOn: CiFailOn | null;
  model: string | null;
  skills: CiSkillEntry[];
  memorySha256: string | null;
  manifestSha256: string | null;
}

export interface BuildArtifactInput {
  status: CiResultArtifact['status'];
  verdict: Verdict | null;
  findings: Finding[];
  costUsd: number | null;
  durationMs: number;
  reason: string | null;
  trace: AgentTrace;
  runnerBuild: string;
  redact: Redactor;
}

function counts(findings: Finding[]) {
  const c = { critical: 0, warning: 0, suggestion: 0 };
  for (const f of findings) {
    if (f.severity === 'CRITICAL') c.critical++;
    else if (f.severity === 'WARNING') c.warning++;
    else c.suggestion++;
  }
  return c;
}

/**
 * Build the `devdigest-result.json` content, validated against the SAME
 * `CiResultArtifact` contract the studio ingests (AC-169). Carries no identity
 * and no finding text (AC-145). Every string is secret-redacted (AC-65) and
 * `reason` is cut to the contract limit. If the candidate is somehow invalid
 * a minimal `failed` artifact is returned instead — a result is always written.
 */
export function buildResultArtifact(input: BuildArtifactInput): CiResultArtifact {
  const c = counts(input.findings);
  const { trace } = input;
  const reason =
    input.reason === null ? null : input.redact(input.reason).slice(0, CI_LIMITS.REASON_MAX_CHARS);
  const candidate = redactDeep(
    {
      schema_version: ARTIFACT_SCHEMA_VERSION,
      status: input.status,
      verdict: input.verdict,
      findings_count: input.findings.length,
      ...c,
      cost_usd: input.costUsd,
      duration_ms: Math.max(0, Math.round(input.durationMs)),
      agent: trace.agent,
      agent_version: trace.agentVersion,
      ci_fail_on: trace.ciFailOn,
      model: trace.model,
      skills: trace.skills,
      memory_sha256: trace.memorySha256,
      manifest_sha256: trace.manifestSha256,
      runner_build: input.runnerBuild,
      reason,
    },
    input.redact,
  );
  const parsed = CiResultArtifact.safeParse(candidate);
  if (parsed.success) return parsed.data;
  return {
    schema_version: ARTIFACT_SCHEMA_VERSION,
    status: 'failed',
    verdict: null,
    findings_count: 0,
    critical: 0,
    warning: 0,
    suggestion: 0,
    cost_usd: null,
    duration_ms: 0,
    agent: input.redact(trace.agent),
    agent_version: null,
    ci_fail_on: null,
    model: null,
    skills: [],
    memory_sha256: null,
    manifest_sha256: null,
    runner_build: input.runnerBuild,
    reason: 'internal_error',
  };
}

/** Write `<resultDir>/<slug>/devdigest-result.json`. Returns the path written. */
export function writeResultArtifact(resultDir: string, slug: string, artifact: CiResultArtifact): string {
  const dir = path.join(resultDir, slug);
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'devdigest-result.json');
  writeFileSync(file, `${JSON.stringify(artifact, null, 2)}\n`);
  return file;
}
