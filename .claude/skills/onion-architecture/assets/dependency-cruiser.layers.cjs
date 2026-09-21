/**
 * Onion Architecture layer rules for dev-digest's backend.
 *
 * Install:  cp this file to server/.dependency-cruiser.cjs
 * Run:      pnpm exec depcruise src --config .dependency-cruiser.cjs
 *
 * Validated against server/src at 149 modules / 464 dependencies.
 * Ring map and the reasoning behind each rule: ../layers.md
 *
 * NOTE: `exclude: { path: 'node_modules' }` must NOT be set — excluding
 * node_modules removes third-party modules from the graph entirely, and every
 * rule whose `to` names an npm package then silently passes. Use `doNotFollow`
 * instead: npm packages stay in the graph as leaves but are not traversed.
 */
module.exports = {
  forbidden: [
    {
      name: 'onion-domain-model-is-pure',
      comment:
        'Ring 0 — the Zod contracts are the domain vocabulary. They may import ' +
        'zod and each other, and nothing else. A contract that imports a ' +
        'framework or the DB has stopped being a contract.',
      severity: 'error',
      from: { path: '^src/vendor/shared/' },
      to: { pathNot: ['^src/vendor/shared/', 'node_modules/zod/'] },
    },
    {
      name: 'onion-domain-services-are-pure',
      comment:
        'Ring 1 — reviewer-core is the pure engine: diff -> prompt -> LLM -> ' +
        'grounded findings. Its only side effect is the INJECTED LLMProvider. ' +
        'No DB, no GitHub, no fs, no Fastify — that is what keeps it runnable ' +
        'from both the studio and the CI runner.',
      severity: 'error',
      from: { path: 'reviewer-core/src/' },
      to: {
        pathNot: [
          'reviewer-core/src/',
          '^src/vendor/shared/',
          'node_modules/(zod|openai)/',
        ],
      },
    },
    {
      name: 'onion-no-persistence-in-http',
      comment:
        'Ring 4 presentation — a route parses, delegates to one use case, and ' +
        'maps a status code. SQL in a handler cannot be reused by the job ' +
        'runner or the CI runner and is testable only through HTTP.',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/routes\\.ts$' },
      to: { path: ['^src/db/', 'node_modules/drizzle-orm/'] },
    },
    {
      name: 'onion-no-infra-in-http',
      comment:
        'A route that needs GitHub/git/an LLM calls a service which injects ' +
        'the port. Reaching an adapter from the handler skips two rings.',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/routes\\.ts$' },
      to: { path: '^src/adapters/' },
    },
    {
      name: 'onion-db-only-in-repository',
      comment:
        'Inside a module, ONLY repository.ts (or repository/*.ts) may name ' +
        'persistence. A use case, a helper, or a pipeline step that imports ' +
        'db/* or drizzle-orm has made the operation depend on the technology ' +
        'it was supposed to be insulated from. Routes are covered by their own ' +
        'rule above so the message points at the right fix.',
      severity: 'error',
      from: {
        path: '^src/modules/',
        pathNot: [
          '^src/modules/[^/]+/routes\\.ts$',
          '^src/modules/[^/]+/repository(\\.ts$|/)',
          // Transport glue, not use cases: the plugin registry and the
          // request-context resolver are Fastify-typed by definition.
          '^src/modules/(index\\.ts$|_shared/)',
          '\\.test\\.ts$',
        ],
      },
      to: {
        path: [
          '^src/db/',
          'node_modules/(drizzle-orm|fastify|octokit|@octokit|simple-git|openai|@anthropic-ai)/',
        ],
      },
    },
    {
      name: 'onion-adapters-know-no-app',
      comment:
        'Ring 4 must not import ring 3. An adapter that reads a module constant ' +
        'is welded to that feature; pass the value in as a parameter.',
      severity: 'error',
      from: { path: '^src/adapters/' },
      to: { path: '^src/modules/' },
    },
    {
      name: 'onion-concretes-only-in-composition-root',
      comment:
        'Only the composition root may name a concrete adapter; everyone else ' +
        'receives it. A hit here is one of two things: (a) a missing injection, ' +
        'or (b) a port interface declared in its own adapter file, so inner code ' +
        'must reach outward just to name a type — move the interface inward. ' +
        'The `to` list is the stateful, swappable, secret-carrying clients; ' +
        'stateless parsers (adapters/astgrep, adapters/codeindex/extract) are ' +
        'not listed because importing a pure function creates no coupling worth ' +
        'a rule — though pure logic is better filed inward in the first place.',
      severity: 'error',
      from: {
        pathNot: [
          '^src/(platform/container|app|server)\\.ts$',
          '^src/adapters/',
          '^src/db/(seed|migrate)\\.ts$',
          '\\.test\\.ts$',
        ],
      },
      to: {
        path: '^src/adapters/(llm|github|git|embedder|secrets|auth|depgraph|tokenizer)/',
      },
    },
    {
      name: 'onion-no-cross-module-internals',
      comment:
        'Modules share through container-owned repositories, not by importing ' +
        "each other's service/repository. Sharing a constants.ts is fine.",
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/' },
      to: {
        path: '^src/modules/[^/]+/(service|repository|run-executor)',
        pathNot: '^src/modules/$1/',
      },
    },
    {
      name: 'no-circular',
      comment:
        'A cycle means neither module can be changed, tested, or deleted alone. ' +
        'In this codebase the usual cause is a service taking `Container`.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    reporterOptions: {
      archi: {
        collapsePattern:
          '^src/(vendor/shared|adapters/[^/]+|modules/[^/]+|db|platform)|^\\.\\./reviewer-core/src',
      },
    },
  },
};
