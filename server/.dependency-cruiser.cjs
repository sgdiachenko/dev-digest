/**
 * Onion-ring enforcement for @devdigest/api.
 *
 * Rings (innermost first) — see .claude/skills/onion-architecture:
 *
 *   0 domain model      src/vendor/shared/contracts/*      zod only
 *   1 domain services   ../reviewer-core/src/**            no framework, no DB, no env
 *   2 ports             src/vendor/shared/adapters.ts      interfaces only
 *   3 use cases         src/modules/<n>/service.ts|helpers|constants
 *   4 adapters          src/adapters/**, src/db/**, src/modules/<n>/repository*
 *   4 presentation      src/modules/<n>/routes.ts, src/platform/sse.ts
 *   5 composition root  src/platform/container.ts, src/app.ts, src/server.ts
 *
 * All coupling points INWARD. `pnpm arch:check` fails on `error` only; the
 * remaining `warn` rules are visible, accepted debt rather than a hidden
 * baseline file (there is none — every error-level rule is currently clean).
 */
module.exports = {
  forbidden: [
    // ---------------------------------------------------------------- ring 0
    {
      name: 'contracts-are-pure',
      severity: 'error',
      comment:
        'Ring 0 (wire contracts) may depend on zod and each other, nothing else. ' +
        'A contract that imports a service or an adapter is no longer a contract.',
      from: { path: '^src/vendor/shared/contracts/' },
      to: {
        pathNot: ['^src/vendor/shared/contracts/', 'node_modules/zod'],
        dependencyTypesNot: ['core'],
      },
    },

    // ---------------------------------------------------------------- ring 1
    {
      name: 'reviewer-core-is-pure',
      severity: 'error',
      comment:
        'Ring 1 (the review engine) must stay free of framework, database, VCS ' +
        'and filesystem detail so it runs the same in a test, a job and a CLI.',
      from: { path: '^\\.\\./reviewer-core/src/' },
      to: {
        path: 'node_modules/(fastify|drizzle-orm|postgres|@octokit|simple-git)',
      },
    },

    // ---------------------------------------------------------------- ring 2
    {
      name: 'ports-declare-no-implementation',
      severity: 'error',
      comment:
        'Ring 2 (adapter ports) names capabilities the core wants. It must not ' +
        'reach for an implementation — that inverts the whole point.',
      from: { path: '^src/vendor/shared/adapters\\.ts$' },
      to: { path: '^src/(adapters|db|modules|platform)/' },
    },

    // ---------------------------------------------------------------- ring 3
    {
      name: 'service-names-no-persistence',
      // Still `warn`: three modules type DTO mapping against `db/rows`/`db/schema`.
      // The fix is a domain type per module (see pulls' `Pull`), not yet done
      // for reviews / repos / repo-intel.
      severity: 'warn',
      comment:
        'A use case must not know HOW things are stored. Persistence is reached ' +
        'through a repository port, never drizzle-orm or db/* directly.',
      from: { path: '^src/modules/[^/]+/(service|helpers|constants)\\.ts$' },
      to: { path: ['^src/db/', 'node_modules/drizzle-orm'] },
    },
    {
      name: 'service-takes-ports-not-container',
      severity: 'error',
      comment:
        'constructor(private container: Container) is a service locator: real ' +
        'dependencies vanish from the signature and a cycle forms with the ' +
        'composition root. Take the two or three ports actually used.',
      from: { path: '^src/modules/[^/]+/(service|run-executor)\\.ts$' },
      to: { path: '^src/platform/container\\.ts$' },
    },
    {
      name: 'no-sideways-module-imports',
      severity: 'error',
      comment:
        'Modules share through container-provided repositories, never by ' +
        'importing another module’s service or routes directly.',
      from: { path: '^src/modules/([^/]+)/' },
      to: {
        path: '^src/modules/(?!_shared)([^/]+)/(service|routes|repository)',
        pathNot: '^src/modules/$1/',
      },
    },

    // ---------------------------------------------------------------- ring 4
    {
      name: 'route-is-a-transport-adapter',
      severity: 'error',
      comment:
        'A route parses with Zod, calls one service method and maps a status ' +
        'code. SQL in a route is untestable without HTTP and unusable by the ' +
        'job runner.',
      from: { path: '^src/modules/[^/]+/routes\\.ts$' },
      to: { path: ['^src/db/', 'node_modules/drizzle-orm', '^src/adapters/'] },
    },
    {
      name: 'adapter-does-not-import-a-module',
      severity: 'error',
      comment:
        'An adapter reaching into a feature module welds infrastructure to one ' +
        'use case. Pass the value in as a parameter instead.',
      from: { path: '^src/adapters/' },
      to: { path: '^src/modules/' },
    },

    // ------------------------------------------------------------ hygiene
    {
      name: 'no-circular',
      severity: 'error',
      comment:
        'A cycle means neither module can be tested, changed or deleted alone; ' +
        'in ESM it surfaces as "Cannot access X before initialization".',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      comment: 'Unreachable module — dead code, or a missing registration.',
      from: {
        orphan: true,
        pathNot: [
          '\\.d\\.ts$',
          '(^|/)eslint\\.config\\.mjs$',
          '(^|/)drizzle\\.config\\.ts$',
          '(^|/)vitest\\.config\\.ts$',
          '^src/db/seed',
          '^src/db/migrate\\.ts$',
          '^src/server\\.ts$',
        ],
      },
      to: {},
    },
  ],

  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(dist|coverage)/|^src/db/migrations/' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.js', '.mjs', '.cjs'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
