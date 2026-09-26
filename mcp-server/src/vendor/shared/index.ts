/**
 * @devdigest/shared — hand-copied subset for mcp-server.
 *
 * `@devdigest/shared` is not a package (see root AGENTS.md); its Zod contracts
 * are hand-copied into server/, client/ and — as of this package — mcp-server/.
 * Only the 6 files this package actually needs are mirrored here (not the full
 * server barrel): findings, review-api, brief, knowledge, platform, trace.
 * `adapters.ts` (adapter ports) is server-only and is never copied here.
 *
 * `../../../scripts/check-shared-sync.sh` verifies this copy one-way against
 * `server/src/vendor/shared/contracts` (files absent here are ignored; files
 * present here must byte-match the server's version) — run it (or `--fix`)
 * after editing a contract this package mirrors.
 */

export * from './contracts/findings.js';
export * from './contracts/review-api.js';
export * from './contracts/brief.js';
export * from './contracts/knowledge.js';
export * from './contracts/trace.js';
export * from './contracts/platform.js';
