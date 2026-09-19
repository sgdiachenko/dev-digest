import type { ConventionCategory } from '@devdigest/shared';
import type { SampledFile, VerifiedCandidate } from './helpers.js';

/**
 * Lever A — deterministic config rules, zero model cost.
 *
 * Config files STATE conventions outright, so there is no reason to spend a
 * model call discovering them: parse them in pure code and emit candidates at
 * `origin: 'config'`, `confidence: 1.0`, evidence = the config file + the line
 * that actually says so. These render through the exact same card as a
 * model-proposed rule, and survive even when the model returns nothing.
 *
 * Every parser here is best-effort: a config file that doesn't parse (comments
 * in JSON, an unexpected shape) is skipped, never thrown — one bad file must
 * not take down the rest of the scan.
 */

function findLineOf(lines: string[], needle: string): number {
  const idx = lines.findIndex((l) => l.includes(needle));
  return idx === -1 ? 1 : idx + 1;
}

function candidate(
  category: ConventionCategory,
  rule: string,
  file: SampledFile,
  needle: string,
): VerifiedCandidate {
  const line = findLineOf(file.lines, needle);
  return {
    category,
    rule,
    rationale: null,
    evidencePath: file.path,
    evidenceLine: line,
    evidenceSnippet: file.lines[line - 1]?.trim() ?? needle,
    confidence: 1,
    origin: 'config',
    probe: null,
    supportCount: null,
  };
}

/** Strip `//` and `/* *‍/` comments and trailing commas so `tsconfig.json`
 *  (which is JSONC in practice) parses as plain JSON. Best-effort. */
function parseJsonc(raw: string): unknown | undefined {
  try {
    const stripped = raw
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1')
      .replace(/,(\s*[}\]])/g, '$1');
    return JSON.parse(stripped);
  } catch {
    return undefined;
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function byBasename(files: SampledFile[], ...names: string[]): SampledFile | undefined {
  return files.find((f) => names.some((n) => f.path === n || f.path.endsWith(`/${n}`)));
}

// ---- tsconfig.json ----------------------------------------------------------

const TS_FLAG_RULES: { key: string; rule: string }[] = [
  { key: 'strict', rule: 'TypeScript strict mode is on — new code must not introduce `any` or loosen strictness locally.' },
  {
    key: 'noUncheckedIndexedAccess',
    rule: 'Indexed access is treated as possibly-undefined — new code must not assume an array/record lookup always succeeds.',
  },
  { key: 'noImplicitOverride', rule: 'A method that overrides a base class member must be marked `override`.' },
  {
    key: 'verbatimModuleSyntax',
    rule: 'Type-only imports/exports must use `import type` / `export type`, not a plain import a bundler has to elide.',
  },
  {
    key: 'exactOptionalPropertyTypes',
    rule: 'An optional property may not be explicitly assigned `undefined` — omit the key instead.',
  },
];

function tsconfigRules(files: SampledFile[]): VerifiedCandidate[] {
  const file = byBasename(files, 'tsconfig.json');
  if (!file) return [];
  const parsed = parseJsonc(file.text);
  if (!isObject(parsed)) return [];
  const opts = parsed.compilerOptions;
  if (!isObject(opts)) return [];

  const out: VerifiedCandidate[] = [];
  for (const { key, rule } of TS_FLAG_RULES) {
    if (opts[key] === true) out.push(candidate('typing', rule, file, `"${key}"`));
  }
  if (isObject(opts.paths) && Object.keys(opts.paths).length > 0) {
    const alias = Object.keys(opts.paths)[0]!;
    out.push(
      candidate(
        'imports',
        `Import through the configured path aliases (e.g. \`${alias}\`), not a long relative path.`,
        file,
        alias,
      ),
    );
  }
  return out;
}

// ---- prettier ---------------------------------------------------------------

const PRETTIER_KEYS: { key: string; describe: (v: unknown) => string | null }[] = [
  { key: 'semi', describe: (v) => (v === false ? 'Statements are written without a trailing semicolon.' : v === true ? 'Every statement ends with a semicolon.' : null) },
  { key: 'singleQuote', describe: (v) => (v === true ? 'String literals use single quotes, not double.' : null) },
  { key: 'trailingComma', describe: (v) => (typeof v === 'string' && v !== 'none' ? `Multi-line lists/objects keep a trailing comma (\`${v}\`).` : null) },
  { key: 'printWidth', describe: (v) => (typeof v === 'number' ? `Lines wrap at ${v} characters.` : null) },
  { key: 'tabWidth', describe: (v) => (typeof v === 'number' ? `Indentation is ${v} spaces.` : null) },
];

function prettierConfig(files: SampledFile[]): Record<string, unknown> | undefined {
  const direct = byBasename(files, '.prettierrc', '.prettierrc.json', '.prettierrc.js');
  if (direct) {
    const parsed = parseJsonc(direct.text);
    if (isObject(parsed)) return parsed;
  }
  const pkg = byBasename(files, 'package.json');
  if (pkg) {
    const parsed = parseJsonc(pkg.text);
    if (isObject(parsed) && isObject(parsed.prettier)) return parsed.prettier;
  }
  return undefined;
}

function prettierRules(files: SampledFile[]): VerifiedCandidate[] {
  const config = prettierConfig(files);
  if (!config) return [];
  const file =
    byBasename(files, '.prettierrc', '.prettierrc.json', '.prettierrc.js') ?? byBasename(files, 'package.json')!;
  const out: VerifiedCandidate[] = [];
  for (const { key, describe } of PRETTIER_KEYS) {
    if (!(key in config)) continue;
    const rule = describe(config[key]);
    if (rule) out.push(candidate('structure', rule, file, `"${key}"`));
  }
  return out;
}

// ---- package.json (type / packageManager / engines) --------------------------

function packageJsonRules(files: SampledFile[]): VerifiedCandidate[] {
  const file = byBasename(files, 'package.json');
  if (!file) return [];
  const parsed = parseJsonc(file.text);
  if (!isObject(parsed)) return [];
  const out: VerifiedCandidate[] = [];

  if (parsed.type === 'module') {
    out.push(candidate('imports', 'This package is ESM-only (`"type": "module"`) — no `require()` in new code.', file, '"type"'));
  }
  if (typeof parsed.packageManager === 'string') {
    const [name] = parsed.packageManager.split('@');
    out.push(
      candidate('structure', `Dependencies are managed with ${name} — do not add a lockfile from another package manager.`, file, '"packageManager"'),
    );
  }
  if (isObject(parsed.engines) && typeof parsed.engines.node === 'string') {
    out.push(candidate('general', `Node ${parsed.engines.node} is the supported runtime — avoid syntax it doesn't support.`, file, '"engines"'));
  }
  return out;
}

// ---- eslint -------------------------------------------------------------------

/** Curated catalog of well-known rule ids → a human rule + category. Unknown
 *  ids are skipped — "obey rule X" with no context is noise, not a convention. */
const ESLINT_RULE_CATALOG: Record<string, { rule: string; category: ConventionCategory }> = {
  '@typescript-eslint/no-floating-promises': {
    rule: 'A Promise must be awaited, returned, or explicitly voided — no floating promises.',
    category: 'errors',
  },
  'no-floating-promises': {
    rule: 'A Promise must be awaited, returned, or explicitly voided — no floating promises.',
    category: 'errors',
  },
  'import/order': { rule: 'Imports are grouped and ordered (builtin/external/internal), not ad hoc.', category: 'imports' },
  'simple-import-sort/imports': { rule: 'Imports are auto-sorted; do not hand-order them.', category: 'imports' },
  eqeqeq: { rule: 'Use `===`/`!==`, never `==`/`!=`.', category: 'general' },
  'no-console': { rule: 'Do not leave `console.*` calls in shipped code — use the logger.', category: 'errors' },
  'prefer-const': { rule: 'A binding that is never reassigned must be declared `const`.', category: 'general' },
  '@typescript-eslint/explicit-function-return-type': {
    rule: 'Exported functions declare an explicit return type.',
    category: 'typing',
  },
  '@typescript-eslint/no-explicit-any': { rule: 'New code may not introduce `any` — use `unknown` and narrow it.', category: 'typing' },
  '@typescript-eslint/no-unused-vars': { rule: 'No unused variables or imports.', category: 'general' },
  'no-restricted-imports': { rule: 'Some import paths are restricted — use the sanctioned module instead.', category: 'imports' },
  'react-hooks/rules-of-hooks': { rule: 'Hooks are called unconditionally, at the top level of a component.', category: 'structure' },
  'react-hooks/exhaustive-deps': { rule: 'Effect/callback dependency arrays are exhaustive.', category: 'structure' },
  '@typescript-eslint/consistent-type-imports': {
    rule: 'A type-only import uses `import type`, not a value import.',
    category: 'typing',
  },
  'no-var': { rule: 'Never declare with `var` — use `const`/`let`.', category: 'general' },
};

function eslintRules(files: SampledFile[]): VerifiedCandidate[] {
  const flat = byBasename(files, 'eslint.config.mjs', 'eslint.config.js', 'eslint.config.cjs');
  const legacy = byBasename(files, '.eslintrc.json');
  const out: VerifiedCandidate[] = [];
  const seen = new Set<string>();

  if (flat) {
    // Flat config is arbitrary JavaScript — never evaluate it. Text-scan for
    // `'rule-id': 'error'` / `2` / `['error', …]` instead.
    for (const id of Object.keys(ESLINT_RULE_CATALOG)) {
      const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`['"]${escaped}['"]\\s*:\\s*(\\[\\s*)?(['"]error['"]|2)`);
      const lineIdx = flat.lines.findIndex((l) => re.test(l));
      if (lineIdx === -1) continue;
      const meta = ESLINT_RULE_CATALOG[id]!;
      out.push(candidate(meta.category, meta.rule, flat, id));
      seen.add(id);
    }
  }
  if (legacy) {
    const parsed = parseJsonc(legacy.text);
    if (isObject(parsed) && isObject(parsed.rules)) {
      for (const [id, value] of Object.entries(parsed.rules)) {
        if (seen.has(id) || !ESLINT_RULE_CATALOG[id]) continue;
        const severity = Array.isArray(value) ? value[0] : value;
        if (severity !== 'error' && severity !== 2) continue;
        const meta = ESLINT_RULE_CATALOG[id]!;
        out.push(candidate(meta.category, meta.rule, legacy, id));
        seen.add(id);
      }
    }
  }
  return out;
}

/**
 * Run every config parser over the sampled config files. Order doesn't matter
 * to the caller — `service.ts` dedupes and does not apply the per-category cap
 * to these rows (config facts are always shown; the cap only limits how many
 * of the MODEL's guesses can crowd one category).
 */
export function deriveConfigRules(files: SampledFile[]): VerifiedCandidate[] {
  return [...tsconfigRules(files), ...prettierRules(files), ...packageJsonRules(files), ...eslintRules(files)];
}
