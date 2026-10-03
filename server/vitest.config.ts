import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@devdigest/shared': path.resolve(__dirname, 'src/vendor/shared'),
      '@devdigest/reviewer-core': path.resolve(__dirname, '../reviewer-core/src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    // Never read the developer's real ~/.devdigest/secrets.json (see the file's header).
    setupFiles: ['test/setup-hermetic.ts'],
    // Testcontainers integration tests can be slow to spin up Postgres.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
