import type { CriticalTag } from '@devdigest/shared';
import type { TourPhase } from './types.js';

// ---- Limits (NFR-3, AC-96) ------------------------------------------------
export const MAX_FILE_BYTES = 512 * 1024;
export const MAX_MANIFESTS = 50;
/** Manifests count as packages only within this many directory levels. */
export const MAX_PACKAGE_DEPTH = 2;
export const MAX_CRITICAL_ITEMS = 8;
export const MAX_READING_ITEMS = 7;
export const MAX_PACKAGE_GROUPS = 3;
export const MAX_COMMANDS_PER_GROUP = 10;
export const MAX_FIRST_TASKS = 4;
export const MAX_TASKS_PER_SIGNAL = 2;
export const MAX_DIAGRAM_NODES = 20;
export const HIGH_FAN_IN_PERCENTILE = 90;

// ---- Appendix B weights ---------------------------------------------------
export const TAG_WEIGHTS: Record<CriticalTag, number> = {
  entry_point: 5,
  public_surface: 4,
  high_fan_in: 4,
  security_sensitive: 3,
  data_schema: 3,
  runtime_config: 2,
  docs: 1,
};

/** Output order of tags on an item (weight desc, then declaration order). */
export const TAG_ORDER: readonly CriticalTag[] = [
  'entry_point',
  'public_surface',
  'high_fan_in',
  'security_sensitive',
  'data_schema',
  'runtime_config',
  'docs',
];

export const SECURITY_KEYWORDS: readonly string[] = [
  'auth',
  'session',
  'token',
  'crypto',
  'permission',
  'acl',
  'policy',
  'payment',
  'billing',
  'webhook',
  'middleware',
  'secret',
  'password',
];

export const SCHEMA_SEGMENTS: readonly string[] = ['schema', 'schemas', 'models', 'entities'];

// ---- Appendix B exclusions ------------------------------------------------
export const GENERATED_DIRS: readonly string[] = [
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  'out',
  'vendor',
  '.git',
];

export const LOCKFILE_NAMES: readonly string[] = [
  'pnpm-lock.yaml',
  'package-lock.json',
  'yarn.lock',
  'bun.lockb',
  'bun.lock',
  'Cargo.lock',
  'go.sum',
  'composer.lock',
  'Gemfile.lock',
  'poetry.lock',
  'uv.lock',
  'Pipfile.lock',
];

// ---- Run-locally ----------------------------------------------------------
export const PHASE_ORDER: readonly TourPhase[] = [
  'install',
  'environment',
  'infrastructure',
  'dev',
  'test',
];

export const SETUP_HEADING_RE =
  /\b(set\s?up|install(?:ation)?|getting\s+started|quick\s?start|running|run|development|develop)\b/i;

export const SHELL_FENCE_LANGS: readonly string[] = ['sh', 'bash', 'shell', 'console', 'zsh'];

export const REMOTE_CODE_DETAIL = 'pipes downloaded content into a shell or interpreter';

export const LIFECYCLE_HOOKS: readonly string[] = ['preinstall', 'install', 'postinstall', 'prepare'];

// ---- Architecture summary (AC-13): fixed English template ------------------
export const SUMMARY_TEMPLATE = {
  stack: (names: string) => `Built with ${names}.`,
  noStack: 'No recognised ecosystem manifest was found.',
  modules: (count: number) => `${count} top-level ${count === 1 ? 'module' : 'modules'}.`,
  entryPoints: (paths: string) => `Entry points: ${paths}.`,
} as const;

export const SOURCE_EXTENSIONS: readonly string[] = [
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'py',
  'go',
  'rs',
  'java',
  'kt',
  'php',
  'rb',
  'cs',
];
