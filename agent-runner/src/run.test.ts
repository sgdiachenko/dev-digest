import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { CI_LIMITS, CiResultArtifact } from '@devdigest/shared';
import { runAll, RAW_DIFF_CEILING_BYTES, type RunDeps } from './run.js';
import { sha256Hex } from './hash.js';
import {
  FIXTURE_DIFF,
  OWN_FILES_ONLY_DIFF,
  REVIEW_EMPTY,
  REVIEW_WITH_CRITICAL,
  REVIEW_WITH_WARNING,
  SECRET_KEY,
  SECRET_TOKEN,
  TITLE,
  Workspace,
  makeFetch,
  makeLlm,
  manifestYaml,
  type FetchStubOptions,
  type StubLlm,
} from './test-helpers.js';
import type { Review } from '@devdigest/shared';

/**
 * Hermetic tests for `runAll` - stubbed LLM and stubbed fetch, real temp
 * directories. No network, no live LLM. T6 (gates), T7 (review + post + exit),
 * T8 (artifacts, redaction, isolation).
 */

const RUNNER_BUILD = 'e'.repeat(64);

describe('runAll', () => {
  let ws: Workspace;
  afterEach(() => ws.cleanup());

  async function run(
    opts: { review?: Review | Error; fetch?: FetchStubOptions; env?: Record<string, string | undefined> } = {},
  ) {
    const stub: StubLlm = makeLlm(opts.review ?? REVIEW_WITH_CRITICAL);
    const f = makeFetch(opts.fetch);
    const logs: string[] = [];
    const deps: RunDeps = {
      env: ws.env(opts.env),
      llm: stub.llm,
      devdigestDir: ws.devdigestDir,
      resultDir: ws.resultDir,
      runnerBuild: RUNNER_BUILD,
      fetchImpl: f.fetchImpl,
      log: (l) => logs.push(l),
    };
    const result = await runAll(deps);
    return { result, stub, ...f, logs };
  }

  function artifactOf(slug: string): CiResultArtifact {
    const file = path.join(ws.resultDir, slug, 'devdigest-result.json');
    expect(existsSync(file)).toBe(true);
    const parsed = CiResultArtifact.safeParse(JSON.parse(readFileSync(file, 'utf8')));
    expect(parsed.success).toBe(true);
    return parsed.data as CiResultArtifact;
  }

  describe('T6 - gates make no LLM call and post nothing', () => {
    it('AC-53 + AC-151: a manifest without post_as ends failed/manifest_invalid, exit 1', async () => {
      ws = new Workspace().agent('sec', manifestYaml({ post_as: null }));
      const r = await run();
      expect(r.result.exitCode).toBe(1);
      expect(r.result.agents[0]).toMatchObject({ status: 'failed', reason: 'manifest_invalid', exitCode: 1 });
      expect(r.stub.messages).toHaveLength(0);
      expect(r.calls).toHaveLength(0);
      const a = artifactOf('sec');
      expect(a.manifest_sha256).toBeNull();
      expect(a.agent).toBe('sec');
    });

    it('AC-152: post mode comes from the manifest only - DEVDIGEST_POST_AS is ignored', async () => {
      ws = new Workspace().agent('sec', manifestYaml({ post_as: '"pr_comment"' }));
      const r = await run({ env: { DEVDIGEST_POST_AS: 'none' } });
      expect(r.posts).toHaveLength(1);
      expect(r.posts[0]!.url).toContain('/issues/42/comments');
    });

    it('AC-54 + AC-143 + AC-144: a fork PR (head repo id differs) is skipped/fork_pr, exit 0, no LLM, no fetch, no post', async () => {
      ws = new Workspace().agent('sec').event({ baseRepoId: 1, headRepoId: 2 });
      const r = await run();
      expect(r.result.exitCode).toBe(0);
      expect(r.result.agents[0]).toMatchObject({ status: 'skipped', reason: 'fork_pr', exitCode: 0 });
      expect(r.stub.messages).toHaveLength(0);
      expect(r.calls).toHaveLength(0);
      expect(artifactOf('sec').status).toBe('skipped');
    });

    it('AC-162: the fork decision compares repository ids, not a fork flag', async () => {
      ws = new Workspace().agent('sec').event({ baseRepoId: 7, headRepoId: 7 });
      const r = await run();
      expect(r.result.agents[0]!.status).not.toBe('skipped');
    });

    it('AC-163 + EC-46: a null head repository is a fork PR', async () => {
      ws = new Workspace().agent('sec').event({ headRepoId: null });
      const r = await run();
      expect(r.result.agents[0]).toMatchObject({ status: 'skipped', reason: 'fork_pr' });
      expect(r.calls).toHaveLength(0);
    });

    it('AC-120: an event type outside the manifest triggers is skipped/trigger_not_selected, exit 0', async () => {
      ws = new Workspace().agent('sec', manifestYaml({ triggers: '["opened"]' })).event({ action: 'synchronize' });
      const r = await run();
      expect(r.result.agents[0]).toMatchObject({ status: 'skipped', reason: 'trigger_not_selected', exitCode: 0 });
      expect(r.stub.messages).toHaveLength(0);
      expect(r.calls).toHaveLength(0);
    });

    it('AC-55: an empty OPENROUTER_API_KEY on a same-repo PR is failed/missing_openrouter_key, exit 1, naming the secret', async () => {
      ws = new Workspace().agent('sec');
      const r = await run({ env: { OPENROUTER_API_KEY: '' } });
      expect(r.result.agents[0]).toMatchObject({ status: 'failed', reason: 'missing_openrouter_key', exitCode: 1 });
      expect(r.logs.join('\n')).toContain('OPENROUTER_API_KEY');
      expect(r.stub.messages).toHaveLength(0);
      expect(r.calls).toHaveLength(0);
    });

    it('AC-54 order: a fork PR is skipped even when the key is missing', async () => {
      ws = new Workspace().agent('sec').event({ headRepoId: 9 });
      const r = await run({ env: { OPENROUTER_API_KEY: '' } });
      expect(r.result.agents[0]!.reason).toBe('fork_pr');
    });

    it('AC-158 + AC-171: a missing skill file is failed/skill_missing; entries list only skills actually read', async () => {
      ws = new Workspace().agent('sec', manifestYaml({ skills: '["present", "gone"]' })).skill('present', '---\nsource: manual\n---\nbody');
      const r = await run();
      expect(r.result.agents[0]).toMatchObject({ status: 'failed', reason: 'skill_missing', exitCode: 1 });
      expect(r.stub.messages).toHaveLength(0);
      expect(r.calls).toHaveLength(0);
      const a = artifactOf('sec');
      expect(a.skills.map((s) => s.slug)).toEqual(['present']);
      expect(a.memory_sha256).toBeNull();
    });

    it('a skill slug that escapes skills/ is treated as missing', async () => {
      ws = new Workspace().agent('sec', manifestYaml({ skills: '["../agents/sec"]' }));
      const r = await run();
      expect(r.result.agents[0]!.reason).toBe('skill_missing');
    });

    it('AC-159: a missing memory.jsonl is failed/memory_invalid with a null memory hash', async () => {
      ws = new Workspace().agent('sec').memory(null);
      const r = await run();
      expect(r.result.agents[0]).toMatchObject({ status: 'failed', reason: 'memory_invalid', exitCode: 1 });
      expect(artifactOf('sec').memory_sha256).toBeNull();
      expect(r.stub.messages).toHaveLength(0);
    });

    it('AC-159 + AC-172: a broken memory line is memory_invalid, and the hash of the bytes read is reported', async () => {
      const bytes = '{"content":"x"}\n';
      ws = new Workspace().agent('sec').memory(bytes);
      const r = await run();
      expect(r.result.agents[0]!.reason).toBe('memory_invalid');
      expect(artifactOf('sec').memory_sha256).toBe(sha256Hex(bytes));
    });

    it('AC-156: a failing diff request is failed/diff_unavailable, exit 1, no LLM call', async () => {
      ws = new Workspace().agent('sec');
      for (const fetchOpts of [{ diffStatus: 500 }, { diffThrows: true }]) {
        const r = await run({ fetch: fetchOpts });
        expect(r.result.agents[0]).toMatchObject({ status: 'failed', reason: 'diff_unavailable', exitCode: 1 });
        expect(r.stub.messages).toHaveLength(0);
        expect(r.posts).toHaveLength(0);
      }
    });

    it('AC-157: a diff larger than the cap is diff_unavailable without an LLM call', async () => {
      ws = new Workspace().agent('sec');
      // The raw body is bounded by the ceiling before stripping...
      const declared = await run({ fetch: { diffHeaders: { 'content-length': String(RAW_DIFF_CEILING_BYTES + 1) } } });
      expect(declared.result.agents[0]!.reason).toBe('diff_unavailable');
      // ...and the reviewed diff by the 2 MB cap after .devdigest/** and the workflow are stripped.
      const streamed = await run({ fetch: { diff: 'x'.repeat(CI_LIMITS.RAW_DIFF_MAX_BYTES + 1) } });
      expect(streamed.result.agents[0]!.reason).toBe('diff_unavailable');
      expect(streamed.stub.messages).toHaveLength(0);
    });

    it('AC-157: a raw diff over 2 MB whose reviewed part fits is reviewed, not refused', async () => {
      ws = new Workspace().agent('sec');
      const ownFiles = `diff --git a/.devdigest/runner/index.js b/.devdigest/runner/index.js\n--- /dev/null\n+++ b/.devdigest/runner/index.js\n@@ -0,0 +1 @@\n+${'y'.repeat(CI_LIMITS.RAW_DIFF_MAX_BYTES + 10)}\n`;
      const r = await run({ fetch: { diff: ownFiles + OWN_FILES_ONLY_DIFF } });
      expect(r.result.agents[0]!.reason).not.toBe('diff_unavailable');
      expect(r.result.agents[0]).toMatchObject({ status: 'no_findings', reason: 'empty_diff' });
    });

    it('AC-154 + AC-155 + AC-153: a diff of only .devdigest/ and workflow files is no_findings/empty_diff, exit 0, no LLM, no post', async () => {
      ws = new Workspace().agent('sec');
      const r = await run({ fetch: { diff: OWN_FILES_ONLY_DIFF } });
      expect(r.result.exitCode).toBe(0);
      expect(r.result.agents[0]).toMatchObject({ status: 'no_findings', reason: 'empty_diff', exitCode: 0 });
      expect(r.stub.messages).toHaveLength(0);
      expect(r.posts).toHaveLength(0);
    });

    it('AC-106 + AC-107 + AC-108: a completely empty diff behaves the same', async () => {
      ws = new Workspace().agent('sec');
      const r = await run({ fetch: { diff: '' } });
      expect(r.result.agents[0]).toMatchObject({ status: 'no_findings', reason: 'empty_diff', exitCode: 0 });
      expect(r.stub.messages).toHaveLength(0);
    });

    it('AC-56: the diff is read between the event base and head commits', async () => {
      ws = new Workspace().agent('sec');
      const r = await run();
      expect(r.calls[0]!.url).toContain(`/compare/${'a'.repeat(40)}...${'b'.repeat(40)}`);
    });

    it('AC-153: files under .devdigest/ and .github/workflows/ never reach the model', async () => {
      ws = new Workspace().agent('sec');
      const r = await run({ fetch: { diff: FIXTURE_DIFF + OWN_FILES_ONLY_DIFF } });
      const prompt = r.stub.messages[0]!.map((m) => m.content).join('\n');
      expect(prompt).toContain("apiKey: 'sk_live_abcdef123456'");
      expect(prompt).not.toContain('.devdigest/agents/a.yaml');
      expect(prompt).not.toContain('devdigest-review.yml');
    });
  });

  describe('T7 - review, post and exit code', () => {
    it('AC-66 + AC-166: the title and branch names appear only inside untrusted framing; the LLM is called once', async () => {
      ws = new Workspace().agent('sec');
      const r = await run();
      expect(r.stub.messages).toHaveLength(1);
      const all = r.stub.messages[0]!;
      const user = all.find((m) => m.role === 'user')!.content;
      const system = all.find((m) => m.role === 'system')!.content;
      expect(user).toContain(TITLE);
      expect(system).not.toContain(TITLE);
      const outsideUntrusted = user.replace(/<untrusted source="[^"]*">[\s\S]*?<\/untrusted>/g, '');
      expect(outsideUntrusted).not.toContain(TITLE);
      expect(outsideUntrusted).not.toContain('feature/x');
      expect(user).toMatch(/<untrusted source="pr-description">[\s\S]*Title: Add feature X/);
      expect(user).not.toContain('Review PR #');
    });

    it('AC-67: a non-manual skill is wrapped as untrusted, a manual one is not; memory reaches the prompt', async () => {
      ws = new Workspace()
        .agent('sec', manifestYaml({ skills: '["own", "imported"]' }))
        .skill('own', '---\nsource: manual\n---\nOWN-RULE')
        .skill('imported', '---\nsource: community\n---\nIMPORTED-RULE')
        .memory(
          '{"content":"MEMORY-NOTE","scope":"global","kind":"convention","confidence":0.9,"sources":[]}\n',
        );
      const r = await run();
      const user = r.stub.messages[0]!.find((m) => m.role === 'user')!.content;
      expect(user).toContain('<untrusted source="skill:imported">\nIMPORTED-RULE\n</untrusted>');
      expect(user).toContain('OWN-RULE');
      expect(user).not.toContain('<untrusted source="skill:own">');
      expect(user).not.toContain('source: manual');
      expect(user).toContain('MEMORY-NOTE');
    });

    it('AC-133 + AC-60 + AC-57: grounded CRITICAL trips the gate - REQUEST_CHANGES, one grounded finding counted, exit 1', async () => {
      ws = new Workspace().agent('sec');
      const r = await run();
      expect(r.posts).toHaveLength(1);
      expect(r.posts[0]!.url).toContain('/pulls/42/reviews');
      expect(r.posts[0]!.body!.event).toBe('REQUEST_CHANGES');
      expect(r.posts[0]!.body!.body).not.toContain('phantom');
      expect(r.result.agents[0]).toMatchObject({ status: 'succeeded', exitCode: 1, blockers: 1, gateTriggered: true });
      expect(r.result.exitCode).toBe(1);
      const a = artifactOf('sec');
      expect([a.findings_count, a.critical]).toEqual([1, 1]);
      expect(a.verdict).toBe('request_changes');
    });

    it('AC-57 + AC-60: findings below the gate post COMMENT and exit 0', async () => {
      ws = new Workspace().agent('sec');
      const r = await run({ review: REVIEW_WITH_WARNING });
      expect(r.posts[0]!.body!.event).toBe('COMMENT');
      expect(r.result.exitCode).toBe(0);
    });

    it('AC-57: no findings posts a COMMENT review with a non-empty body, status no_findings, exit 0', async () => {
      ws = new Workspace().agent('sec');
      const r = await run({ review: REVIEW_EMPTY });
      expect(r.posts[0]!.body!.event).toBe('COMMENT');
      expect(String(r.posts[0]!.body!.body).length).toBeGreaterThan(0);
      expect(r.result.agents[0]).toMatchObject({ status: 'no_findings', reason: null, exitCode: 0 });
    });

    it('AC-105: ci_fail_on never exits 0 after a completed review whatever the findings', async () => {
      ws = new Workspace().agent('sec', manifestYaml({ ci_fail_on: '"never"' }));
      const r = await run();
      expect(r.result.exitCode).toBe(0);
      expect(r.posts[0]!.body!.event).toBe('COMMENT');
    });

    it('AC-61 + AC-104: an LLM failure is failed with a reason naming it, exit 1 even under never', async () => {
      ws = new Workspace().agent('sec', manifestYaml({ ci_fail_on: '"never"' }));
      const r = await run({ review: new Error('model timed out') });
      expect(r.result.agents[0]).toMatchObject({ status: 'failed', exitCode: 1 });
      expect(r.result.agents[0]!.reason).toContain('model timed out');
      expect(r.posts).toHaveLength(0);
      expect(r.result.exitCode).toBe(1);
    });

    it('AC-104: other failed paths exit 1 under never', async () => {
      ws = new Workspace().agent('sec', manifestYaml({ ci_fail_on: '"never"' }));
      expect((await run({ fetch: { diffStatus: 404 } })).result.exitCode).toBe(1);
      expect((await run({ env: { OPENROUTER_API_KEY: '' } })).result.exitCode).toBe(1);
    });

    it('AC-58: pr_comment posts one issue comment', async () => {
      ws = new Workspace().agent('sec', manifestYaml({ post_as: '"pr_comment"' }));
      const r = await run();
      expect(r.posts).toHaveLength(1);
      expect(r.posts[0]!.url).toContain('/issues/42/comments');
      expect(String(r.posts[0]!.body!.body)).toContain('Hardcoded Stripe secret key');
      expect(r.result.exitCode).toBe(1);
    });

    it('AC-59: post_as none posts nothing and still exits by the gate', async () => {
      ws = new Workspace().agent('sec', manifestYaml({ post_as: '"none"' }));
      const r = await run();
      expect(r.posts).toHaveLength(0);
      expect(r.result.exitCode).toBe(1);
      expect(r.result.agents[0]!.posted).toBe('none');
    });

    it('AC-164 + AC-165: a 422 on inline comments is retried once body-only with the same event and body; no post_failed', async () => {
      ws = new Workspace().agent('sec');
      const r = await run({ fetch: { postStatuses: [422, 200] } });
      expect(r.posts).toHaveLength(2);
      expect(r.posts[0]!.body!.comments).toBeDefined();
      expect(r.posts[1]!.body!.comments).toBeUndefined();
      expect(r.posts[1]!.body!.event).toBe(r.posts[0]!.body!.event);
      expect(r.posts[1]!.body!.body).toBe(r.posts[0]!.body!.body);
      expect(r.result.agents[0]!.reason).toBeNull();
      expect(artifactOf('sec').reason).toBeNull();
      expect(r.result.exitCode).toBe(1);
    });

    it('AC-62: a failed post records post_failed and still exits by the gate', async () => {
      ws = new Workspace().agent('sec');
      const r = await run({ fetch: { postStatuses: [500] } });
      expect(r.posts).toHaveLength(1); // 500 is not retried
      expect(r.result.agents[0]).toMatchObject({ reason: 'post_failed', exitCode: 1, status: 'succeeded' });
      expect(artifactOf('sec').reason).toBe('post_failed');

      const clean = await run({ review: REVIEW_WITH_WARNING, fetch: { postStatuses: [500] } });
      expect(clean.result.agents[0]).toMatchObject({ reason: 'post_failed', exitCode: 0 });
    });

    it('AC-62: a body-only retry that also fails is post_failed', async () => {
      ws = new Workspace().agent('sec');
      const r = await run({ fetch: { postStatuses: [422, 422] } });
      expect(r.posts).toHaveLength(2);
      expect(r.result.agents[0]!.reason).toBe('post_failed');
    });
  });

  describe('T8 - artifact, redaction, isolation', () => {
    it('AC-63: a schema-valid result is written on completed, skipped and failed paths', async () => {
      ws = new Workspace().agent('done').agent('bad', manifestYaml({ post_as: null }));
      await run();
      expect(artifactOf('done').status).toBe('succeeded');
      expect(artifactOf('bad').status).toBe('failed');
      ws.cleanup();
      ws = new Workspace().agent('fork').event({ headRepoId: 2 });
      await run();
      expect(artifactOf('fork').status).toBe('skipped');
    });

    it('AC-170 + AC-171 + AC-172 + AC-173 + AC-175: the artifact carries the manifest model and the hashes of the bytes read', async () => {
      const skillBytes = '---\nsource: manual\n---\nRULE';
      const memoryBytes =
        '{"content":"m","scope":"global","kind":"convention","confidence":0.5,"sources":[]}\n';
      const yaml = manifestYaml({ skills: '["rule"]', model: '"vendor/special-model"' });
      ws = new Workspace().agent('sec', yaml).skill('rule', skillBytes).memory(memoryBytes);
      await run();
      const a = artifactOf('sec');
      expect(a.model).toBe('vendor/special-model');
      expect(a.agent_version).toBe(3);
      expect(a.ci_fail_on).toBe('critical');
      expect(a.skills).toEqual([{ slug: 'rule', sha256: sha256Hex(skillBytes) }]);
      expect(a.memory_sha256).toBe(sha256Hex(memoryBytes));
      expect(a.manifest_sha256).toBe(sha256Hex(yaml));
      expect(a.runner_build).toBe(RUNNER_BUILD);
    });

    it('AC-65: key and token values are replaced with *** in logs, artifact, posted body and reason', async () => {
      ws = new Workspace().agent('sec');
      const leaked = await run({ review: new Error(`401 for key ${SECRET_KEY}`) });
      const file = readFileSync(path.join(ws.resultDir, 'sec', 'devdigest-result.json'), 'utf8');
      for (const text of [file, leaked.logs.join('\n')]) {
        expect(text).not.toContain(SECRET_KEY);
        expect(text).not.toContain(SECRET_TOKEN);
      }
      expect(artifactOf('sec').reason).toContain('***');

      const echoing: Review = {
        ...REVIEW_WITH_CRITICAL,
        findings: [{ ...REVIEW_WITH_CRITICAL.findings[0]!, rationale: `found ${SECRET_TOKEN} in code` }],
      };
      const posted = await run({ review: echoing });
      expect(JSON.stringify(posted.posts[0]!.body)).not.toContain(SECRET_TOKEN);
      expect(JSON.stringify(posted.posts[0]!.body)).toContain('***');
    });

    it('NFR-10: logs name status, reason, build id and exit code, but never the diff, title or a skill body', async () => {
      ws = new Workspace().agent('sec', manifestYaml({ skills: '["rule"]' })).skill('rule', '---\nsource: manual\n---\nSKILL-BODY-XYZ');
      const r = await run();
      const text = r.logs.join('\n');
      expect(text).toContain('status=succeeded');
      expect(text).toContain(`build=${RUNNER_BUILD}`);
      expect(text).toContain('exit=1');
      expect(text).toMatch(/grounding=\S+/);
      expect(text).not.toContain('sk_live_abcdef123456');
      expect(text).not.toContain(TITLE);
      expect(text).not.toContain('SKILL-BODY-XYZ');
    });

    it('AC-160 + AC-121 + EC-44: agent A fails, agent B still posts; the process exit is 1', async () => {
      ws = new Workspace().agent('a-bad', manifestYaml({ post_as: null })).agent('b-good', manifestYaml({ ci_fail_on: '"never"' }));
      const r = await run();
      expect(r.result.agents.map((a) => [a.slug, a.exitCode])).toEqual([['a-bad', 1], ['b-good', 0]]);
      expect(r.posts).toHaveLength(1);
      expect(r.stub.messages).toHaveLength(1);
      expect(artifactOf('a-bad').status).toBe('failed');
      expect(artifactOf('b-good').status).toBe('succeeded');
      expect(r.result.exitCode).toBe(1);
    });

    it('AC-142: every agent exiting 0 gives exit 0, and the diff is fetched once', async () => {
      ws = new Workspace().agent('a', manifestYaml({ ci_fail_on: '"never"' })).agent('b', manifestYaml({ ci_fail_on: '"never"' }));
      const r = await run();
      expect(r.result.exitCode).toBe(0);
      expect(r.calls.filter((c) => c.method === 'GET')).toHaveLength(1);
      expect(r.stub.messages).toHaveLength(2);
    });

    it('AC-160: an unexpected throw in one agent is contained and recorded as failed', async () => {
      ws = new Workspace().agent('a').agent('b');
      // A fetch that explodes only for POSTs would be post_failed; make the LLM provider
      // itself throw synchronously on the first call only.
      const stub = makeLlm(REVIEW_WITH_WARNING);
      let calls = 0;
      const inner = stub.llm.completeStructured.bind(stub.llm);
      stub.llm.completeStructured = (async (req: never) => {
        if (calls++ === 0) throw new TypeError('boom');
        return inner(req);
      }) as typeof stub.llm.completeStructured;
      const f = makeFetch();
      const result = await runAll({
        env: ws.env(),
        llm: stub.llm,
        devdigestDir: ws.devdigestDir,
        resultDir: ws.resultDir,
        runnerBuild: RUNNER_BUILD,
        fetchImpl: f.fetchImpl,
        log: () => undefined,
      });
      expect(result.agents.map((a) => a.status)).toEqual(['failed', 'succeeded']);
      expect(result.exitCode).toBe(1);
    });

    it('a repository without manifests exits 1 and writes nothing', async () => {
      ws = new Workspace();
      const r = await run();
      expect(r.result).toEqual({ exitCode: 1, agents: [] });
    });

    it('an unreadable event payload fails every agent with event_invalid, no LLM call', async () => {
      ws = new Workspace().agent('sec');
      const r = await run({ env: { GITHUB_EVENT_PATH: path.join(ws.root, 'missing.json') } });
      expect(r.result.agents[0]).toMatchObject({ status: 'failed', reason: 'event_invalid' });
      expect(r.stub.messages).toHaveLength(0);
    });
  });
});
