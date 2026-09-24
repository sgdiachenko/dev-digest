/**
 * Smart Diff classifier constants — rule table + role display order.
 *
 * D9: globs match at ANY depth (`**\/dist/**`, `**\/docs/**`, `**\/e2e/**`),
 * test patterns cover `*.test.*` / `*.spec.*` for ts/tsx/js/jsx, and base
 * names (`README*`, `CHANGELOG*`, `LICENSE`, `*.md`) compare case-insensitively.
 */
import type { SmartDiffRole } from '@devdigest/shared';

/**
 * Display order on the Files-changed tab: the substance of the change first,
 * boilerplate last. This is NOT the classification priority — see
 * `CLASSIFY_RULES` below, which checks `boilerplate` BEFORE `tests` (so a
 * snapshot file living under `__tests__/` still lands in `boilerplate`).
 */
export const SMART_DIFF_ROLE_ORDER: SmartDiffRole[] = ['core', 'tests', 'wiring', 'docs', 'boilerplate'];

export const SPLIT_SUGGESTION_DEFAULT = { too_big: false, total_lines: 0, proposed_splits: [] };

type Predicate = (path: string) => boolean;

/** True when `segment` appears as a whole path component anywhere in `path`
 *  (the any-depth `**\/segment/**` glob from D9), including at the root. */
function anyDepthGlob(segment: string): Predicate {
  return (path) => path === segment || path.startsWith(`${segment}/`) || path.includes(`/${segment}/`);
}

/** True when the path's base name (after the last `/`) matches `re`. */
function baseNameMatches(re: RegExp): Predicate {
  return (path) => re.test(path.slice(path.lastIndexOf('/') + 1));
}

const TEST_FILE_RE = /\.(test|spec)\.(ts|tsx|js|jsx)$/i;
const SNAPSHOT_DIR_RE = /(^|\/)__snapshots__\//i;
const SNAPSHOT_FILE_RE = /\.snap$/i;
const LOCK_FILE_RE =
  /^(package-lock\.json|pnpm-lock\.yaml|npm-shrinkwrap\.json|yarn\.lock|Cargo\.lock|poetry\.lock|Gemfile\.lock|composer\.lock)$/i;
const MINIFIED_RE = /\.min\.(js|css)$/i;
const CONFIG_FILE_RE =
  /^(package\.json|tsconfig(\..+)?\.json|\.eslintrc(\..+)?|\.prettierrc(\..+)?|\.editorconfig|Dockerfile(\..+)?|docker-compose(\..+)?\.ya?ml|.+\.config\.(ts|js|mjs|cjs))$/i;
const README_RE = /^(readme|changelog|license|contributing)(\..*)?$/i;
const MD_RE = /\.md$/i;

/**
 * Ordered classification rules — the FIRST match wins. Order encodes
 * priority, NOT the display order above: `boilerplate` is checked before
 * `tests` (a snapshot inside `__tests__/` is boilerplate, not tests);
 * `wiring` is checked before `docs` (a `.claude/**` file is wiring even when
 * it's a `.md`, and `e2e/**` is tests even for its `README.md`). A path that
 * matches none of these is `core`.
 */
export const CLASSIFY_RULES: { role: SmartDiffRole; test: Predicate }[] = [
  // ---- boilerplate ----
  { role: 'boilerplate', test: baseNameMatches(LOCK_FILE_RE) },
  { role: 'boilerplate', test: baseNameMatches(MINIFIED_RE) },
  { role: 'boilerplate', test: (p) => SNAPSHOT_DIR_RE.test(p) || SNAPSHOT_FILE_RE.test(p.slice(p.lastIndexOf('/') + 1)) },
  { role: 'boilerplate', test: anyDepthGlob('dist') },
  { role: 'boilerplate', test: anyDepthGlob('build') },
  { role: 'boilerplate', test: anyDepthGlob('coverage') },
  { role: 'boilerplate', test: anyDepthGlob('node_modules') },

  // ---- tests ----
  { role: 'tests', test: baseNameMatches(TEST_FILE_RE) },
  { role: 'tests', test: anyDepthGlob('__tests__') },
  { role: 'tests', test: anyDepthGlob('e2e') },

  // ---- wiring ----
  { role: 'wiring', test: anyDepthGlob('.claude') },
  { role: 'wiring', test: anyDepthGlob('.github') },
  { role: 'wiring', test: baseNameMatches(CONFIG_FILE_RE) },

  // ---- docs ----
  { role: 'docs', test: anyDepthGlob('docs') },
  { role: 'docs', test: baseNameMatches(README_RE) },
  { role: 'docs', test: baseNameMatches(MD_RE) },
];
