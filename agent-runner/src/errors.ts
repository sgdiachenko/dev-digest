/**
 * RunnerError — a configuration / environment failure with a human-readable
 * message (missing manifest directory, malformed event payload, GitHub API
 * error). `run.ts` maps these onto a per-agent `failed` result; they are never
 * allowed to abort the other agents of the run.
 */
export class RunnerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RunnerError';
  }
}

/** The PR diff could not be fetched, or is over the size cap (AC-156, AC-157). */
export class DiffUnavailableError extends RunnerError {
  constructor(message: string) {
    super(message);
    this.name = 'DiffUnavailableError';
  }
}
