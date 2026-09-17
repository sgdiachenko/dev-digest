// ESLint flat config for @devdigest/web.
//
// Two jobs, in order of importance:
//  1. ARCHITECTURE — `import/no-restricted-paths` pins the layering this app
//     already follows (vendor → lib → components → app). Without a linter the
//     direction is a convention; with one it is a build failure.
//  2. Next.js correctness — `next/core-web-vitals` + `next/typescript`.
//
// `eslint-config-next` 15.x is still eslintrc-style, hence FlatCompat.

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const baseDirectory = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory });

const config = [
  {
    ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts', 'coverage/**'],
  },

  ...compat.extends('next/core-web-vitals', 'next/typescript'),

  {
    // The `import` plugin is already registered by `eslint-config-next`;
    // re-registering it here is a flat-config error, so we only add rules.
    files: ['src/**/*.{ts,tsx}'],
    settings: {
      'import/resolver': {
        typescript: { project: `${baseDirectory}/tsconfig.json` },
      },
    },
    rules: {
      // `_name` is the established signal for "destructured/declared on
      // purpose, intentionally unused" (e.g. dropping a field from a payload).
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // Cycles are the failure mode barrel files create: they surface at
      // runtime as "Cannot access 'X' before initialization", far from the edit
      // that caused them.
      'import/no-cycle': ['error', { maxDepth: 6 }],

      // The dependency direction, innermost first:
      //
      //     vendor/  →  lib/  →  components/  →  app/
      //
      // Each zone forbids a layer from reaching OUTWARD. `app/` is the top: it
      // composes everything and nothing composes it.
      'import/no-restricted-paths': [
        'error',
        {
          zones: [
            // vendor/ is the vendored design system + wire contracts. It knows
            // nothing about this app and must stay extractable.
            {
              target: './src/vendor',
              from: ['./src/app', './src/components', './src/lib'],
              message:
                'vendor/ is vendored, app-agnostic code — it must not import from this app.',
            },
            // lib/ is data access + providers. It may use vendor/, nothing above.
            {
              target: './src/lib',
              from: ['./src/app', './src/components'],
              message: 'lib/ must not import from components/ or app/.',
            },
            // components/ is cross-cutting chrome shared by routes. A route is
            // free to use it; it must never reach back into a route.
            {
              target: './src/components',
              from: './src/app',
              message:
                'components/ is route-agnostic — move route-specific UI into that route’s _components/.',
            },
          ],
        },
      ],
    },
  },

  {
    // Tests colocate with the code they cover and may reach anywhere.
    files: ['src/**/*.test.{ts,tsx}', 'src/test/**'],
    rules: { 'import/no-restricted-paths': 'off' },
  },
];

export default config;
