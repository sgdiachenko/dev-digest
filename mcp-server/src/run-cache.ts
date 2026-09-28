/**
 * `run_id → pull_id`, in-memory only (D3/C11): the API has no "review by
 * run_id" endpoint, only "reviews by pull_id", so `run_agent_on_pull_request`
 * records the mapping here and `get_findings` resolves through it. One
 * instance is created in the composition root (`src/index.ts`) and shared by
 * every tool call in the process — it does not survive a restart, and
 * `get_findings` reports that plainly (`runUnknownError`) rather than
 * inventing a fallback lookup.
 */
export class RunCache {
  private readonly runToPull = new Map<string, string>();

  /** Record the mapping. Called BEFORE polling starts, so a timed-out run is
   *  still resolvable by a later get_findings call. */
  set(runId: string, pullId: string): void {
    this.runToPull.set(runId, pullId);
  }

  get(runId: string): string | undefined {
    return this.runToPull.get(runId);
  }
}
