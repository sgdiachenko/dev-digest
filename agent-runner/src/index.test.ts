import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { main } from './index.js';
import { sha256Hex } from './hash.js';
import { Workspace, manifestYaml } from './test-helpers.js';

/**
 * AC-168 - the runner reads the manifest from the working-directory checkout
 * (the merge-ref copy the workflow produces), not from the base branch.
 */
describe('main reads the manifest from the working directory (AC-168)', () => {
  const cwd = process.cwd();
  const workspaces: Workspace[] = [];
  afterEach(() => {
    process.chdir(cwd);
    for (const w of workspaces) w.cleanup();
  });

  it('uses the PR-changed manifest in cwd, not the base-branch one', async () => {
    const baseYaml = manifestYaml({ name: '"Base Reviewer"' });
    const prYaml = manifestYaml({ name: '"PR Changed Reviewer"' });
    const base = new Workspace().agent('sec', baseYaml);
    const checkout = new Workspace().agent('sec', prYaml);
    workspaces.push(base, checkout);

    process.chdir(checkout.root);
    // An empty key ends the run at the missing-key gate, after the manifest is loaded and hashed.
    const code = await main(checkout.env({ OPENROUTER_API_KEY: '', DEVDIGEST_DIR: undefined, DEVDIGEST_RESULT_DIR: undefined }));
    expect(code).toBe(1);

    const artifact = JSON.parse(
      readFileSync(path.join(checkout.resultDir, 'sec', 'devdigest-result.json'), 'utf8'),
    ) as { agent: string; manifest_sha256: string };
    expect(artifact.agent).toBe('PR Changed Reviewer');
    expect(artifact.manifest_sha256).toBe(sha256Hex(prYaml));
    expect(artifact.manifest_sha256).not.toBe(sha256Hex(baseYaml));
  });
});
