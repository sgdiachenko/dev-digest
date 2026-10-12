/**
 * Export to CI — leftovers of a previous export and concurrent exports, over
 * mock ports: no DB, no network.
 */
import { describe, it, expect } from 'vitest';
import { CiExportInput } from '@devdigest/shared';
import { MockGitHubCiClient } from '../src/adapters/mocks.js';
import { AppError } from '../src/platform/errors.js';
import { CiService } from '../src/modules/ci/service.js';
import type { CiGitHubResolver } from '../src/modules/ci/types.js';
import {
  CapturingLogger,
  FakeAgents,
  FakeCiStore,
  ScriptedGitHub,
  WS,
  makeAgent,
  makeInstallation,
} from './helpers/ci-fakes.js';
import { MockRunnerBundleSource } from '../src/adapters/mocks.js';

const PR_URL = 'https://github.com/acme/api/pull/7';
const input = () => CiExportInput.parse({ repo: 'acme/api', action: 'open_pr' });

function setup(ci: MockGitHubCiClient) {
  const store = new FakeCiStore();
  const gh = new ScriptedGitHub();
  const log = new CapturingLogger();
  const resolver: CiGitHubResolver = async () => ({ github: gh, ci });
  const service = new CiService(
    store,
    new FakeAgents([makeAgent({ name: 'Security Reviewer' })]),
    new MockRunnerBundleSource(),
    resolver,
    log,
  );
  gh.openPrUrl = PR_URL;
  return { store, gh, service };
}

describe('files left by the agent previous export', () => {
  it('deletes the old manifest and dropped skills when the agent was renamed', async () => {
    const ci = new MockGitHubCiClient({
      branchExists: true,
      branchBlobs: {
        '.devdigest/agents/old-name.yaml': 'a'.repeat(40),
        '.devdigest/skills/legacy-skill.md': 'b'.repeat(40),
      },
    });
    const s = setup(ci);
    s.store.installs = [
      makeInstallation({
        agentId: 'agent-1',
        repo: 'acme/api',
        agentSlug: 'old-name',
        exportedSkills: [{ slug: 'legacy-skill', sha256: 'c'.repeat(64) }],
      }),
    ];
    await s.service.exportCi(WS, 'agent-1', input());

    const commit = s.gh.committed[0]!;
    expect(commit.deletes?.slice().sort()).toEqual([
      '.devdigest/agents/old-name.yaml',
      '.devdigest/skills/legacy-skill.md',
    ]);
  });

  it('never deletes a skill that another agent in the repo still exports', async () => {
    const ci = new MockGitHubCiClient({
      branchExists: true,
      branchBlobs: { '.devdigest/skills/shared-skill.md': 'b'.repeat(40) },
    });
    const s = setup(ci);
    s.store.installs = [
      makeInstallation({
        agentId: 'agent-1',
        repo: 'acme/api',
        agentSlug: 'security-reviewer',
        exportedSkills: [{ slug: 'shared-skill', sha256: 'c'.repeat(64) }],
      }),
      makeInstallation({
        id: 'inst-2',
        agentId: 'agent-2',
        repo: 'acme/api',
        agentSlug: 'perf-reviewer',
        exportedSkills: [{ slug: 'shared-skill', sha256: 'd'.repeat(64) }],
      }),
    ];
    s.store.agentNames['agent-2'] = 'Perf Reviewer';
    await s.service.exportCi(WS, 'agent-1', input());

    const deletes = s.gh.committed.flatMap((c) => c.deletes ?? []);
    expect(deletes).not.toContain('.devdigest/skills/shared-skill.md');
  });

  it('commits nothing extra when no earlier file is still on the branch', async () => {
    const s = setup(new MockGitHubCiClient({ branchExists: true, branchBlobs: {} }));
    s.store.installs = [
      makeInstallation({ agentId: 'agent-1', repo: 'acme/api', agentSlug: 'old-name' }),
    ];
    await s.service.exportCi(WS, 'agent-1', input());

    const deletes = s.gh.committed.flatMap((c) => c.deletes ?? []);
    expect(deletes).toEqual([]);
  });
});

describe('one export per repository at a time', () => {
  it('a second export to the same repo while the first runs gets 409 export_in_progress', async () => {
    const s = setup(new MockGitHubCiClient());
    const results = await Promise.allSettled([
      s.service.exportCi(WS, 'agent-1', input()),
      s.service.exportCi(WS, 'agent-1', input()),
    ]);

    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(rejected).toHaveLength(1);
    const err = rejected[0]!.reason as AppError;
    expect(err.code).toBe('export_in_progress');
    expect(err.statusCode).toBe(409);
    expect(s.gh.commitCalls).toBe(1);
  });
});
