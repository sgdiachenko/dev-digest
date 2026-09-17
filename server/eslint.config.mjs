// ESLint flat config for @devdigest/api.
//
// Scope note: the ONION RING rules (which module may import which layer) are
// enforced by dependency-cruiser — `pnpm arch:check`, config in
// `.dependency-cruiser.cjs`. It owns the whole-graph questions (rings, cycles,
// orphans). ESLint stays on per-file correctness, where its editor feedback is
// what you actually want while typing.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'src/db/migrations/**', 'src/vendor/**'],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    plugins: { import: importPlugin },
    settings: {
      'import/resolver': {
        typescript: { project: './tsconfig.json' },
      },
    },
    rules: {
      // A cycle between modules means neither can be tested, changed, or
      // deleted on its own — and in ESM it surfaces at runtime as
      // "Cannot access 'X' before initialization", far from the cause.
      'import/no-cycle': ['error', { maxDepth: 6 }],

      // `_name` marks a deliberately unused binding (dropped payload field,
      // ignored handler argument).
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },

  {
    // Tests reach into internals on purpose and lean on loose fixture shapes.
    files: ['test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  {
    // Operational one-shots: seeds and the migration runner legitimately talk
    // to Drizzle and process.env directly (see the onion skill's "when NOT to
    // apply this").
    files: ['src/db/seed*.ts', 'src/db/migrate.ts'],
    rules: { 'no-console': 'off' },
  },

  {
    // Tool configs that must stay CommonJS (dependency-cruiser loads .cjs).
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { module: 'writable', require: 'readonly', __dirname: 'readonly' },
    },
  },
);
