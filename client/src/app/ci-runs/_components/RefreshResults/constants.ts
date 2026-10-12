/** Per-installation sync error codes with their own message; anything else shows the raw code. */
export const SYNC_ERROR_KEYS: Record<string, string> = {
  github_scope_missing: "runs.errorCodes.github_scope_missing",
  repo_not_accessible: "runs.errorCodes.repo_not_accessible",
  github_unavailable: "runs.errorCodes.github_unavailable",
  github_token_missing: "runs.errorCodes.github_token_missing",
};
