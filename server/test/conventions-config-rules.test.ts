import { describe, it, expect } from 'vitest';
import { deriveConfigRules } from '../src/modules/conventions/config-rules.js';
import { toSampledFile } from '../src/modules/conventions/helpers.js';

describe('deriveConfigRules — Lever A (deterministic, zero model cost)', () => {
  it('emits a typing rule for each tsconfig strictness flag actually set', () => {
    const tsconfig = toSampledFile(
      'tsconfig.json',
      JSON.stringify({ compilerOptions: { strict: true, noUncheckedIndexedAccess: true } }, null, 2),
    );
    const out = deriveConfigRules([tsconfig]);
    expect(out.every((c) => c.origin === 'config' && c.confidence === 1)).toBe(true);
    expect(out.some((c) => c.rule.includes('strict mode'))).toBe(true);
    expect(out.some((c) => c.rule.includes('possibly-undefined'))).toBe(true);
  });

  it('cites the real line the flag was found on, not line 1 by default', () => {
    const tsconfig = toSampledFile(
      'tsconfig.json',
      ['{', '  "compilerOptions": {', '    "noImplicitOverride": true', '  }', '}'].join('\n'),
    );
    const out = deriveConfigRules([tsconfig]);
    const rule = out.find((c) => c.rule.includes('override'));
    expect(rule?.evidenceLine).toBe(3);
    expect(rule?.evidenceSnippet).toContain('noImplicitOverride');
  });

  it('emits an import-alias rule when tsconfig has path aliases', () => {
    const tsconfig = toSampledFile(
      'tsconfig.json',
      JSON.stringify({ compilerOptions: { paths: { '@app/*': ['src/*'] } } }),
    );
    const out = deriveConfigRules([tsconfig]);
    expect(out.some((c) => c.category === 'imports' && c.rule.includes('@app/*'))).toBe(true);
  });

  it('tolerates a JSONC tsconfig (comments + trailing commas)', () => {
    const tsconfig = toSampledFile(
      'tsconfig.json',
      ['{', '  // strict mode', '  "compilerOptions": { "strict": true, },', '}'].join('\n'),
    );
    const out = deriveConfigRules([tsconfig]);
    expect(out.some((c) => c.rule.includes('strict mode'))).toBe(true);
  });

  it('skips an unparseable tsconfig instead of throwing', () => {
    const tsconfig = toSampledFile('tsconfig.json', 'not json at all {{{');
    expect(() => deriveConfigRules([tsconfig])).not.toThrow();
    expect(deriveConfigRules([tsconfig])).toEqual([]);
  });

  it('derives prettier rules from a standalone .prettierrc', () => {
    const prettierrc = toSampledFile('.prettierrc', JSON.stringify({ semi: false, singleQuote: true }));
    const out = deriveConfigRules([prettierrc]);
    expect(out.some((c) => c.rule.includes('without a trailing semicolon'))).toBe(true);
    expect(out.some((c) => c.rule.includes('single quotes'))).toBe(true);
  });

  it('falls back to package.json#prettier when no standalone file exists', () => {
    const pkg = toSampledFile('package.json', JSON.stringify({ prettier: { singleQuote: true } }));
    const out = deriveConfigRules([pkg]);
    expect(out.some((c) => c.rule.includes('single quotes'))).toBe(true);
  });

  it('emits an ESM-only rule for "type": "module"', () => {
    const pkg = toSampledFile('package.json', JSON.stringify({ type: 'module' }));
    const out = deriveConfigRules([pkg]);
    expect(out.some((c) => c.rule.includes('ESM-only'))).toBe(true);
  });

  it('emits a package-manager rule from the packageManager field', () => {
    const pkg = toSampledFile('package.json', JSON.stringify({ packageManager: 'pnpm@10.4.0' }));
    const out = deriveConfigRules([pkg]);
    expect(out.some((c) => c.rule.includes('pnpm'))).toBe(true);
  });

  it('text-scans a flat eslint config without evaluating it as JavaScript', () => {
    const eslintConfig = toSampledFile(
      'eslint.config.mjs',
      ['export default [', '  {', "    rules: { 'eqeqeq': 'error', 'no-console': 'error' },", '  },', '];'].join(
        '\n',
      ),
    );
    const out = deriveConfigRules([eslintConfig]);
    expect(out.some((c) => c.rule.includes('==='))).toBe(true);
    expect(out.some((c) => c.rule.toLowerCase().includes('console'))).toBe(true);
  });

  it('skips an unknown eslint rule id — no context means it is noise, not a convention', () => {
    const eslintConfig = toSampledFile(
      'eslint.config.mjs',
      "export default [{ rules: { 'some-totally-unknown-rule': 'error' } }];",
    );
    expect(deriveConfigRules([eslintConfig])).toEqual([]);
  });

  it('does not flag an eslint rule that is merely "warn", not "error"', () => {
    const eslintConfig = toSampledFile('eslint.config.mjs', "export default [{ rules: { 'eqeqeq': 'warn' } }];");
    expect(deriveConfigRules([eslintConfig])).toEqual([]);
  });

  it('parses a legacy .eslintrc.json rules block', () => {
    const legacy = toSampledFile('.eslintrc.json', JSON.stringify({ rules: { 'prefer-const': 'error' } }));
    const out = deriveConfigRules([legacy]);
    expect(out.some((c) => c.rule.includes('const'))).toBe(true);
  });

  it('accepts the [severity, ...options] array form', () => {
    const legacy = toSampledFile('.eslintrc.json', JSON.stringify({ rules: { 'prefer-const': ['error'] } }));
    const out = deriveConfigRules([legacy]);
    expect(out.some((c) => c.rule.includes('const'))).toBe(true);
  });

  it('returns nothing when no config files were sampled', () => {
    expect(deriveConfigRules([])).toEqual([]);
  });
});
