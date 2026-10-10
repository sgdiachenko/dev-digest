import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CI_PATHS } from '@devdigest/shared';
import type { RunnerBundleSource, RunnerBundleFile } from '@devdigest/shared';
import { AppError } from '../../platform/errors.js';

/**
 * Reads the prebuilt agent-runner files (`pnpm -C agent-runner build`) from a
 * directory. All files ship together (AC-184): if any is missing the whole
 * read fails, so a bundle can never carry half a runner.
 */
export class FsRunnerBundleSource implements RunnerBundleSource {
  constructor(private readonly dir: string) {}

  async read(): Promise<RunnerBundleFile[]> {
    const files: RunnerBundleFile[] = [];
    for (const name of CI_PATHS.RUNNER_FILES) {
      try {
        files.push({ name, contents: await readFile(join(this.dir, name), 'utf8') });
      } catch {
        // Never echo the path or the fs error: nothing about the host layout leaves the server.
        throw new AppError(
          'runner_bundle_unavailable',
          `The CI runner bundle is not built (missing ${name}). Run "pnpm -C agent-runner build" and retry.`,
          503,
        );
      }
    }
    return files;
  }
}
