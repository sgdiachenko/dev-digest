/**
 * @devdigest/agent-runner — CI runner CLI.
 *
 * Started by the generated GitHub Actions workflow as
 * `node .devdigest/runner/index.js`; ncc bundles it (plus its lazy chunk
 * `300.index.js`) so it runs without a `package.json` or `npm install`.
 *
 * Reads the CI-injected env vars (OPENROUTER_API_KEY, GITHUB_TOKEN,
 * GITHUB_REPOSITORY, GITHUB_EVENT_PATH) directly. That is intentional, not a
 * `SecretsProvider` bypass: the runner executes OUTSIDE the server DI graph, in
 * the target repo's own CI (see `agent-runner/CLAUDE.md`). Each agent's post
 * mode comes from its manifest only; there is no env override.
 *
 * All logic lives in `run.ts`; this file wires the real world and sets the
 * process exit code.
 */
import path from 'node:path';
import { realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CI_PATHS } from '@devdigest/shared';
import { OpenRouterProvider } from '@devdigest/reviewer-core';
import { runAll } from './run.js';
import { computeRunnerBuild } from './build-id.js';

export async function main(env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const cwd = process.cwd();
  // An empty key still constructs the provider; the run never reaches an LLM
  // call without a key (missing_openrouter_key gate).
  const llm = new OpenRouterProvider(env.OPENROUTER_API_KEY ?? '');
  const result = await runAll({
    env,
    llm,
    devdigestDir: env.DEVDIGEST_DIR ?? path.join(cwd, '.devdigest'),
    resultDir: env.DEVDIGEST_RESULT_DIR ?? path.join(cwd, CI_PATHS.RESULT_DIR),
    runnerBuild: computeRunnerBuild(path.dirname(fileURLToPath(import.meta.url))),
  });
  return result.exitCode;
}

// Only run when executed directly (CI), never on import (tests import `main`).
function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    // Compare as URLs of the real path: survives symlinks and URL-encoded characters.
    return import.meta.url === pathToFileURL(realpathSync(entry)).href;
  } catch {
    return false;
  }
}

const isDirectRun = isEntryPoint();

if (isDirectRun) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (err) => {
      console.error('[agent-runner] fatal error:', err instanceof Error ? err.message : 'unknown');
      process.exitCode = 1;
    },
  );
}
