/** In-memory doubles for the ci module's ports (no DB, no GitHub). */
import type { MemoryItem } from '@devdigest/shared';
import { MockGitHubClient } from '../../src/adapters/mocks.js';
import type {
  CiAgent,
  CiAgentReader,
  CiLogger,
  CiSkillSource,
  CiStore,
  RunKey,
  RunListItem,
  RunWrite,
  StoredInstallation,
  StoredRun,
  UpsertInstallation,
} from '../../src/modules/ci/types.js';

export const WS = 'ws-1';

export function makeAgent(over: Partial<CiAgent> = {}): CiAgent {
  return {
    id: 'agent-1',
    name: 'Security Reviewer',
    version: 3,
    provider: 'openrouter',
    model: 'anthropic/claude-sonnet-4',
    systemPrompt: 'Review for security.',
    strategy: 'auto',
    ciFailOn: 'critical',
    ...over,
  };
}

export class FakeAgents implements CiAgentReader {
  constructor(public list: CiAgent[] = [makeAgent()]) {}
  async get(_ws: string, id: string): Promise<CiAgent | null> {
    return this.list.find((a) => a.id === id) ?? null;
  }
}

export function makeInstallation(over: Partial<StoredInstallation> = {}): StoredInstallation {
  return {
    id: 'inst-1',
    agentId: 'agent-1',
    repo: 'acme/api',
    githubRepoId: 1001,
    targetType: 'gha',
    agentSlug: 'security-reviewer',
    agentVersion: 3,
    ciFailOn: 'critical',
    postAs: 'github_review',
    triggers: ['opened', 'synchronize', 'reopened'],
    workflowPath: '.github/workflows/devdigest-review.yml',
    prUrl: 'https://github.com/acme/api/pull/7',
    prNumber: 7,
    exportedModel: 'anthropic/claude-sonnet-4',
    exportedSkills: [],
    installedAt: '2026-10-01T00:00:00.000Z',
    ...over,
  };
}

/** Mirrors the repository's upsert semantics (keep / clear / set) closely enough for service tests. */
export class FakeCiStore implements CiStore {
  skills: CiSkillSource[] = [];
  memory: MemoryItem[] = [];
  installs: StoredInstallation[] = [];
  runs: StoredRun[] = [];
  upserts = 0;
  runUpserts = 0;
  deletedRunning: RunKey[] = [];
  agentNames: Record<string, string> = { 'agent-1': 'Security Reviewer' };

  async linkedSkills(): Promise<CiSkillSource[]> {
    return this.skills;
  }
  async listMemory(): Promise<MemoryItem[]> {
    return this.memory;
  }
  async installationsForRepo(_ws: string, repo: string): Promise<StoredInstallation[]> {
    return this.installs.filter((i) => i.repo === repo);
  }
  async installationsForAgent(_ws: string, agentId: string): Promise<StoredInstallation[]> {
    return this.installs.filter((i) => i.agentId === agentId);
  }
  async allInstallations(): Promise<StoredInstallation[]> {
    return this.installs;
  }
  async upsertInstallation(input: UpsertInstallation): Promise<StoredInstallation> {
    this.upserts += 1;
    const existing = this.installs.find((i) => i.agentId === input.agentId && i.repo === input.repo);
    const next: StoredInstallation = {
      id: existing?.id ?? `inst-${this.installs.length + 1}`,
      targetType: 'gha',
      installedAt: existing?.installedAt ?? '2026-10-09T00:00:00.000Z',
      ...input,
    };
    this.installs = existing ? this.installs.map((i) => (i === existing ? next : i)) : [...this.installs, next];
    return next;
  }
  async upsertRun(w: RunWrite): Promise<void> {
    this.runUpserts += 1;
    const idx = this.runs.findIndex(
      (r) =>
        r.installationId === w.installationId &&
        r.workflowRunId === w.workflowRunId &&
        r.runAttempt === w.runAttempt,
    );
    const prev = idx === -1 ? undefined : this.runs[idx];
    const nulled = {
      verdict: null,
      findingsCount: null,
      critical: null,
      warning: null,
      suggestion: null,
      costUsd: null,
      agentVersion: null,
      model: null,
      ciFailOn: null,
      skills: null,
      memorySha256: null,
      manifestSha256: null,
      runnerBuild: null,
    };
    const art =
      w.artifact.kind === 'set'
        ? { ...w.artifact.data }
        : w.artifact.kind === 'clear'
          ? nulled
          : prev
            ? {
                verdict: prev.verdict,
                findingsCount: prev.findingsCount,
                critical: prev.critical,
                warning: prev.warning,
                suggestion: prev.suggestion,
                costUsd: prev.costUsd,
                agentVersion: prev.agentVersion,
                model: prev.model,
                ciFailOn: prev.ciFailOn,
                skills: prev.skills,
                memorySha256: prev.memorySha256,
                manifestSha256: prev.manifestSha256,
                runnerBuild: prev.runnerBuild,
              }
            : nulled;
    const next: StoredRun = {
      id: prev?.id ?? `run-${this.runs.length + 1}`,
      installationId: w.installationId,
      repo: w.repo,
      prNumber: w.prNumber,
      headSha: w.headSha,
      workflowRunId: w.workflowRunId,
      runAttempt: w.runAttempt,
      ranAt: w.ranAt ? w.ranAt.toISOString() : null,
      durationS: w.durationS,
      status: w.status,
      githubUrl: w.githubUrl,
      unavailableReason: w.unavailableReason,
      ...art,
    };
    if (idx === -1) this.runs.push(next);
    else this.runs[idx] = next;
  }
  async deleteRunningRun(key: RunKey): Promise<void> {
    this.deletedRunning.push(key);
    this.runs = this.runs.filter(
      (r) =>
        !(
          r.installationId === key.installationId &&
          r.workflowRunId === key.workflowRunId &&
          r.runAttempt === key.runAttempt &&
          r.status === 'running'
        ),
    );
  }
  private item(run: StoredRun): RunListItem {
    const inst = this.installs.find((i) => i.id === run.installationId);
    return {
      run,
      agentName: inst ? (this.agentNames[inst.agentId] ?? null) : null,
      snapshot: inst
        ? { agentVersion: inst.agentVersion, exportedModel: inst.exportedModel, exportedSkills: inst.exportedSkills }
        : null,
    };
  }
  async listRuns(_ws: string, limit: number): Promise<RunListItem[]> {
    return this.runs.slice(0, limit).map((r) => this.item(r));
  }
  async latestRuns(ids: string[]): Promise<Map<string, RunListItem>> {
    const out = new Map<string, RunListItem>();
    for (const id of ids) {
      const run = this.runs.find((r) => r.installationId === id);
      if (run) out.set(id, this.item(run));
    }
    return out;
  }
}

export class CapturingLogger implements CiLogger {
  lines: { level: string; obj: Record<string, unknown>; msg?: string }[] = [];
  info(obj: Record<string, unknown>, msg?: string) {
    this.lines.push({ level: 'info', obj, msg });
  }
  warn(obj: Record<string, unknown>, msg?: string) {
    this.lines.push({ level: 'warn', obj, msg });
  }
}

/** MockGitHubClient whose open-PR state and failures are scripted per test. */
export class ScriptedGitHub extends MockGitHubClient {
  openPrUrl: string | null = null;
  commitError: unknown = null;
  openError: unknown = null;
  commitCalls = 0;

  override async findOpenPr(): Promise<{ url: string } | null> {
    return this.openPrUrl ? { url: this.openPrUrl } : null;
  }
  override async commitFiles(
    repo: Parameters<MockGitHubClient['commitFiles']>[0],
    payload: Parameters<MockGitHubClient['commitFiles']>[1],
  ) {
    this.commitCalls += 1;
    if (this.commitError) throw this.commitError;
    return super.commitFiles(repo, payload);
  }
  override async openPullRequest(
    repo: Parameters<MockGitHubClient['openPullRequest']>[0],
    payload: Parameters<MockGitHubClient['openPullRequest']>[1],
  ) {
    if (this.openError) throw this.openError;
    return super.openPullRequest(repo, payload);
  }
}

export const httpError = (status: number, message = 'boom'): Error & { status: number } =>
  Object.assign(new Error(message), { status });
