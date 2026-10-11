import { and, eq } from 'drizzle-orm';
import type { Db } from './client.js';
import * as t from './schema.js';

/**
 * Eval-pipeline demo fixtures. Idempotent (select-before-insert, like seed.ts).
 * Touches Security Reviewer (triaged findings), Performance Reviewer (cases +
 * suite runs), and cases only for Test Quality and API Contract Reviewers.
 */

const PERF_DIFF = [
  'diff --git a/src/api/orders.ts b/src/api/orders.ts',
  '--- a/src/api/orders.ts',
  '+++ b/src/api/orders.ts',
  '@@ -10,3 +10,8 @@',
  ' export async function listOrders(userIds: string[]) {',
  '+  const out = [];',
  '+  for (const id of userIds) {',
  '+    out.push(await db.orders.findMany({ userId: id }));',
  '+  }',
  '+  return out;',
  ' }',
].join('\n');

const PERF_CLEAN_DIFF = [
  'diff --git a/src/lib/format.ts b/src/lib/format.ts',
  '--- a/src/lib/format.ts',
  '+++ b/src/lib/format.ts',
  '@@ -1,2 +1,4 @@',
  ' export function label(n: number) {',
  '+  const suffix = n === 1 ? "item" : "items";',
  '+  return `${n} ${suffix}`;',
  ' }',
].join('\n');

const PERF_INDEX_DIFF = [
  'diff --git a/src/db/queries.ts b/src/db/queries.ts',
  '--- a/src/db/queries.ts',
  '+++ b/src/db/queries.ts',
  '@@ -20,2 +20,5 @@',
  ' export function recentPayments(db: Db) {',
  "+  return db.payments.findMany({ where: { status: 'settled' }, orderBy: { createdAt: 'desc' } });",
  '+  // no index on (status, created_at) yet',
  ' }',
].join('\n');

const META = {
  pr_title: 'Seeded eval fixture',
  pr_body: null,
  pr_number: null,
  repo_full_name: null,
};

export async function seedEval(db: Db, workspaceId: string): Promise<void> {
  // ---- agent-linked review with triaged findings on PR #482 ----
  const [security] = await db
    .select()
    .from(t.agents)
    .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, 'Security Reviewer')));
  const [pr] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.number, 482)));

  if (security && pr) {
    const [existingReview] = await db
      .select()
      .from(t.reviews)
      .where(
        and(
          eq(t.reviews.prId, pr.id),
          eq(t.reviews.agentId, security.id),
          eq(t.reviews.model, 'seed'),
        ),
      );
    if (!existingReview) {
      await db.transaction(async (tx) => {
        const [review] = await tx
          .insert(t.reviews)
          .values({
            workspaceId,
            prId: pr.id,
            agentId: security.id,
            kind: 'review',
            verdict: 'request_changes',
            summary: 'Security pass over the rate-limiting change: three items worth triaging.',
            score: 70,
            model: 'seed',
            // Older than the base seed review: the PR detail opens the newest run by default,
            // and e2e/specs/04-pr-findings.flow.json expects the base review there.
            createdAt: new Date(Date.now() - 60 * 60 * 1000),
          })
          .returning();
        const now = new Date();
        await tx.insert(t.findings).values([
          {
            reviewId: review!.id,
            file: 'src/middleware/ratelimit.ts',
            startLine: 31,
            endLine: 36,
            severity: 'WARNING',
            category: 'security',
            title: 'Rate-limit key trusts the X-Forwarded-For header',
            rationale: 'A client can spoof the header and rotate keys to bypass the limiter.',
            suggestion: 'Derive the client address from the trusted proxy chain only.',
            confidence: 0.82,
            acceptedAt: now,
          },
          {
            reviewId: review!.id,
            file: 'src/api/public/webhooks.ts',
            startLine: 18,
            endLine: 22,
            severity: 'SUGGESTION',
            category: 'security',
            title: 'Webhook error response echoes the raw upstream message',
            rationale: 'Upstream error text can leak internal hostnames to unauthenticated callers.',
            suggestion: 'Return a generic message and log the detail server-side.',
            confidence: 0.55,
            dismissedAt: now,
          },
          {
            reviewId: review!.id,
            file: 'src/config.ts',
            startLine: 20,
            endLine: 24,
            severity: 'WARNING',
            category: 'security',
            title: 'Limiter bypass list is read from an unvalidated env var',
            rationale: 'A malformed value silently disables limiting for every address.',
            suggestion: 'Validate the list at startup and fail closed.',
            confidence: 0.7,
          },
        ]);
      });
    }
  }

  // ---- Performance Reviewer: 3 cases + 2 completed suite runs ----
  const [perf] = await db
    .select()
    .from(t.agents)
    .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, 'Performance Reviewer')));
  if (!perf) return;

  const caseSeeds: Array<typeof t.evalCases.$inferInsert> = [
    {
      workspaceId,
      ownerKind: 'agent',
      ownerId: perf.id,
      agentId: perf.id,
      name: 'N+1 query in a loop',
      type: 'must_find',
      inputDiff: PERF_DIFF,
      inputMeta: META,
      expectations: [
        {
          file: 'src/api/orders.ts',
          start_line: 11,
          end_line: 14,
          severity: 'WARNING',
          category: 'perf',
          title: 'N+1 query',
        },
      ],
      diffSource: 'manual',
      sourceFindingId: null,
    },
    {
      workspaceId,
      ownerKind: 'agent',
      ownerId: perf.id,
      agentId: perf.id,
      name: 'Missing index on a hot query',
      type: 'must_find',
      inputDiff: PERF_INDEX_DIFF,
      inputMeta: META,
      expectations: [
        {
          file: 'src/db/queries.ts',
          start_line: 21,
          end_line: 22,
          severity: 'SUGGESTION',
          category: 'perf',
          title: 'Missing index',
        },
      ],
      diffSource: 'manual',
      sourceFindingId: null,
    },
    {
      workspaceId,
      ownerKind: 'agent',
      ownerId: perf.id,
      agentId: perf.id,
      name: 'Plain string formatting is not a perf issue',
      type: 'must_not_flag',
      inputDiff: PERF_CLEAN_DIFF,
      inputMeta: META,
      expectations: [
        {
          file: 'src/lib/format.ts',
          start_line: 2,
          end_line: 3,
          severity: null,
          category: null,
          title: null,
        },
      ],
      diffSource: 'manual',
      sourceFindingId: null,
    },
  ];
  const caseRows: Array<typeof t.evalCases.$inferSelect> = [];
  for (const c of caseSeeds) {
    const [existing] = await db
      .select()
      .from(t.evalCases)
      .where(
        and(
          eq(t.evalCases.ownerKind, 'agent'),
          eq(t.evalCases.ownerId, perf.id),
          eq(t.evalCases.name, c.name),
        ),
      );
    if (existing) {
      caseRows.push(existing);
    } else {
      const [row] = await db.insert(t.evalCases).values(c).returning();
      caseRows.push(row!);
    }
  }

  const [existingRun] = await db
    .select({ id: t.evalSuiteRuns.id })
    .from(t.evalSuiteRuns)
    .where(eq(t.evalSuiteRuns.agentId, perf.id))
    .limit(1);
  if (existingRun) return;

  const DAY = 24 * 60 * 60 * 1000;
  const base = {
    provider: 'openrouter',
    model: 'deepseek/deepseek-v4-flash',
    strategy: 'single-pass',
    skills: [],
    temperature: null,
  };
  const runSeeds = [
    {
      agentVersion: 1,
      startedAt: new Date(Date.now() - 2 * DAY),
      config: { ...base, system_prompt: 'You are a performance reviewer. Flag N+1 queries.' },
      recall: 0.5,
      precision: 0.5,
      citationAccuracy: 1,
      costUsd: 0.0021,
      durationMs: 9400,
      cases: [
        { status: 'pass' as const, recall: 1, precision: 1, expected: 1, actual: 1 },
        { status: 'fail' as const, recall: 0, precision: 0, expected: 1, actual: 0 },
        { status: 'fail' as const, recall: null, precision: null, expected: 1, actual: 1 },
      ],
    },
    {
      agentVersion: 2,
      startedAt: new Date(Date.now() - DAY),
      config: {
        ...base,
        system_prompt:
          'You are a performance reviewer. Flag N+1 queries and missing indexes; stay silent on trivial code.',
      },
      recall: 1,
      precision: 1,
      citationAccuracy: 1,
      costUsd: 0.0026,
      durationMs: 11200,
      cases: [
        { status: 'pass' as const, recall: 1, precision: 1, expected: 1, actual: 1 },
        { status: 'pass' as const, recall: 1, precision: 1, expected: 1, actual: 1 },
        { status: 'pass' as const, recall: null, precision: null, expected: 1, actual: 0 },
      ],
    },
  ];

  for (const r of runSeeds) {
    // One fact = one transaction: the suite run together with its case rows.
    await db.transaction(async (tx) => {
      const passed = r.cases.filter((c) => c.status === 'pass').length;
      const [suite] = await tx
        .insert(t.evalSuiteRuns)
        .values({
          workspaceId,
          agentId: perf.id,
          status: 'completed',
          agentVersion: r.agentVersion,
          config: r.config,
          caseIds: caseRows.map((c) => c.id),
          casesTotal: caseRows.length,
          casesCompleted: caseRows.length,
          casesErrored: 0,
          casesPassed: passed,
          recall: r.recall,
          precision: r.precision,
          citationAccuracy: r.citationAccuracy,
          costUsd: r.costUsd,
          durationMs: r.durationMs,
          startedAt: r.startedAt,
          finishedAt: new Date(r.startedAt.getTime() + r.durationMs),
        })
        .returning();
      await tx.insert(t.evalRuns).values(
        r.cases.map((c, i) => ({
          caseId: caseRows[i]!.id,
          suiteRunId: suite!.id,
          caseName: caseRows[i]!.name,
          status: c.status,
          pass: c.status === 'pass',
          recall: c.recall,
          precision: c.precision,
          citationAccuracy: c.recall === null ? null : 1,
          durationMs: Math.round(r.durationMs / r.cases.length),
          costUsd: r.costUsd / r.cases.length,
          expectedCount: c.expected,
          actualCount: c.actual,
          dropped: [],
          actualOutput: null,
          ranAt: new Date(r.startedAt.getTime() + r.durationMs),
        })),
      );
    });
  }
}

// Single-agent case seeds for the skills-lesson agents (created after seedEval
// runs, so they need their own entry point once the agents exist).
type CaseSeed = Omit<
  typeof t.evalCases.$inferInsert,
  'workspaceId' | 'ownerKind' | 'ownerId' | 'agentId' | 'sourceFindingId'
>;

const AGENT_CASE_SEEDS: Array<{ agentName: string; cases: CaseSeed[] }> = [
  {
    agentName: "Test Quality Reviewer",
    cases: [
        {
          name: "must-find-missing-test-for-empty-array-input",
          type: "must_find",
          inputDiff: "diff --git a/src/lib/chunk.test.ts b/src/lib/chunk.test.ts\n--- a/src/lib/chunk.test.ts\n+++ b/src/lib/chunk.test.ts\n@@ -0,0 +1,8 @@\n+import { describe, it, expect } from 'vitest';\n+import { chunkArray } from './chunk';\n+\n+describe('chunkArray', () => {\n+  it('splits an array into chunks of the given size', () => {\n+    expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);\n+  });\n+});",
          inputMeta: {
            pr_body: "Splits a batch of webhook deliveries into fixed-size chunks before fan-out.",
            pr_title: "Add chunkArray helper for paginated webhook delivery",
            pr_number: 483,
            repo_full_name: "acme/payments-api",
          },
          expectations: [
            {
              file: "src/lib/chunk.test.ts",
              title: "Missing test for empty array input",
              category: "test",
              end_line: 8,
              severity: "WARNING",
              start_line: 1,
            },
          ],
          diffSource: "run_trace",
        },
        {
          name: "must-find-no-test-for-size-0-which-causes-an-infinite-loop",
          type: "must_find",
          inputDiff: "diff --git a/src/lib/chunk.ts b/src/lib/chunk.ts\n--- a/src/lib/chunk.ts\n+++ b/src/lib/chunk.ts\n@@ -0,0 +1,7 @@\n+export function chunkArray<T>(items: T[], size: number): T[][] {\n+  const chunks: T[][] = [];\n+  for (let i = 0; i < items.length; i += size) {\n+    chunks.push(items.slice(i, i + size));\n+  }\n+  return chunks;\n+}",
          inputMeta: {
            pr_body: "Splits a batch of webhook deliveries into fixed-size chunks before fan-out.",
            pr_title: "Add chunkArray helper for paginated webhook delivery",
            pr_number: 483,
            repo_full_name: "acme/payments-api",
          },
          expectations: [
            {
              file: "src/lib/chunk.ts",
              title: "No test for size <= 0, which causes an infinite loop",
              category: "bug",
              end_line: 3,
              severity: "CRITICAL",
              start_line: 3,
            },
          ],
          diffSource: "run_trace",
        },
        {
          name: "no-authcontroller-spec-only-checks-definition-not-endpoint-wiring",
          type: "must_not_flag",
          inputDiff: "diff --git a/libs/api/auth/feature/src/lib/auth/auth.controller.spec.ts b/libs/api/auth/feature/src/lib/auth/auth.controller.spec.ts\n--- a/libs/api/auth/feature/src/lib/auth/auth.controller.spec.ts\n+++ b/libs/api/auth/feature/src/lib/auth/auth.controller.spec.ts\n@@ -0,0 +1,20 @@\n+import { Test, TestingModule } from '@nestjs/testing';\n+import { AuthController } from './auth.controller';\n+import { AuthService } from './auth.service';\n+\n+describe('AuthController', () => {\n+  let controller: AuthController;\n+\n+  beforeEach(async () => {\n+    const module: TestingModule = await Test.createTestingModule({\n+      controllers: [AuthController],\n+      providers: [{ provide: AuthService, useValue: {} }],\n+    }).compile();\n+\n+    controller = module.get<AuthController>(AuthController);\n+  });\n+\n+  it('should be defined', () => {\n+    expect(controller).toBeDefined();\n+  });\n+});",
          inputMeta: {
            pr_body: "- move account schema and signup/login endpoints into auth\r\n- preserve existing MongoDB collection and ownership IDs\r\n- add signup username and backfill legacy accounts on login\r\n- persist username in session state and display it in header\r\n- fix authenticated state after signup\r\n- update tests and architecture documentation",
            pr_title: "refactor(auth): move user identity into auth boundary and add username",
            pr_number: 2,
            repo_full_name: "sgdiachenko/gm-vocabulary",
          },
          expectations: [
            {
              file: "libs/api/auth/feature/src/lib/auth/auth.controller.spec.ts",
              title: "AuthController spec only checks definition, not endpoint wiring",
              category: "test",
              end_line: 20,
              severity: "SUGGESTION",
              start_line: 1,
            },
          ],
          diffSource: "current_pr_files",
        },
        {
          name: "no-weak-assertion-in-server-rationale-truncation-test",
          type: "must_not_flag",
          inputDiff: "diff --git a/server/test/reviews-helpers.test.ts b/server/test/reviews-helpers.test.ts\n--- a/server/test/reviews-helpers.test.ts\n+++ b/server/test/reviews-helpers.test.ts\n@@ -22,3 +23,135 @@ describe('taskLine', () => {\n     expect(line).toMatch(/review the entire diff/i);\n   });\n });\n+\n+/**\n+ * summarizeFindings groups already-loaded findings by severity — a plain\n+ * COUNT/filter, no LLM call — for the PR-list column and timeline popover.\n+ */\n+describe('summarizeFindings', () => {\n+  function finding(o: Partial<FindingRow>): FindingRow {\n+    return {\n+      id: 'f1',\n+      reviewId: 'r1',\n+      file: 'src/a.ts',\n+      startLine: 1,\n+      endLine: 1,\n+      severity: 'WARNING',\n+      category: 'bug',\n+      title: 'Some finding',\n+      rationale: 'Because reasons.',\n+      suggestion: null,\n+      confidence: 0.8,\n+      kind: 'finding',\n+      trifectaComponents: null,\n+      acceptedAt: null,\n+      dismissedAt: null,\n+      ...o,\n+    } as FindingRow;\n+  }\n+\n+  it('counts each severity independently', () => {\n+    const { counts } = summarizeFindings([\n+      finding({ id: 'a', severity: 'CRITICAL' }),\n+      finding({ id: 'b', severity: 'CRITICAL' }),\n+      finding({ id: 'c', severity: 'WARNING' }),\n+      finding({ id: 'd', severity: 'SUGGESTION' }),\n+    ]);\n+    expect(counts).toEqual({ CRITICAL: 2, WARNING: 1, SUGGESTION: 1 });\n+  });\n+\n+  it('excludes dismissed findings from counts and items', () => {\n+    const { counts, items } = summarizeFindings([\n+      finding({ id: 'a', severity: 'CRITICAL' }),\n+      finding({ id: 'b', severity: 'CRITICAL', dismissedAt: new Date() }),\n+    ]);\n+    expect(counts.CRITICAL).toBe(1);\n+    expect(items).toHaveLength(1);\n+    expect(items[0].id).toBe('a');\n+  });\n+\n+  it('returns zero counts and no items for an empty review', () => {\n+    expect(summarizeFindings([])).toEqual({\n+      counts: { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 },\n+      items: [],\n+    });\n+  });\n+\n+  it('sorts items CRITICAL → WARNING → SUGGESTION, then by confidence desc', () => {\n+    const { items } = summarizeFindings([\n+      finding({ id: 'a', severity: 'SUGGESTION', confidence: 0.9 }),\n+      finding({ id: 'b', severity: 'CRITICAL', confidence: 0.6 }),\n+      finding({ id: 'c', severity: 'CRITICAL', confidence: 0.95 }),\n+      finding({ id: 'd', severity: 'WARNING', confidence: 0.7 }),\n+    ]);\n+    expect(items.map((i) => i.id)).toEqual(['c', 'b', 'd', 'a']);\n+  });\n+\n+  it('every count equals the number of items of that severity (invariant)', () => {\n+    const { counts, items } = summarizeFindings([\n+      finding({ id: 'a', severity: 'CRITICAL' }),\n+      finding({ id: 'b', severity: 'WARNING' }),\n+      finding({ id: 'c', severity: 'WARNING' }),\n+      finding({ id: 'd', severity: 'SUGGESTION', dismissedAt: new Date() }),\n+    ]);\n+    for (const sev of ['CRITICAL', 'WARNING', 'SUGGESTION'] as const) {\n+      expect(counts[sev]).toBe(items.filter((i) => i.severity === sev).length);\n+    }\n+  });\n+\n+  it('truncates a long rationale for the preview', () => {\n+    const long = 'x'.repeat(400);\n+    const { items } = summarizeFindings([finding({ rationale: long })]);\n+    expect(items[0].rationale.length).toBeLessThan(400);\n+    expect(items[0].rationale.endsWith('…')).toBe(true);\n+  });\n+});\n+\n+/**\n+ * latestRoundRunIds groups a PR's agent_runs into the most recent \"round\"\n+ * (e.g. every agent triggered by one \"Review all\" click) by clustering on\n+ * `ranAt` (set once, at creation — before any agent's slow LLM call starts),\n+ * not on when each review later finishes.\n+ */\n+describe('latestRoundRunIds', () => {\n+  const BASE = Date.parse('2026-09-16T13:05:37.000Z');\n+  function run(id: string, offsetMs: number) {\n+    return { id, ranAt: new Date(BASE + offsetMs) };\n+  }\n+\n+  it('returns an empty set for no runs', () => {\n+    expect(latestRoundRunIds([])).toEqual(new Set());\n+  });\n+\n+  it('groups runs created back-to-back (a \"Review all\" click) into one round', () => {\n+    const ids = latestRoundRunIds([run('a', 0), run('b', 12), run('c', 22)]);\n+    expect(ids).toEqual(new Set(['a', 'b', 'c']));\n+  });\n+\n+  it('excludes an older, separate round outside the window', () => {\n+    const ids = latestRoundRunIds([\n+      run('old', -12 * 60 * 1000), // 12 minutes earlier — a different click\n+      run('a', 0),\n+      run('b', 15),\n+    ]);\n+    expect(ids).toEqual(new Set(['a', 'b']));\n+    expect(ids.has('old')).toBe(false);\n+  });\n+\n+  it('is anchored to the LATEST run, not run order in the array', () => {\n+    // Out-of-order input: the newest run appears first.\n+    const ids = latestRoundRunIds([run('newest', 0), run('old', -ROUND_WINDOW_MS * 5)]);\n+    expect(ids).toEqual(new Set(['newest']));\n+  });\n+\n+  it('includes a run exactly at the window boundary, excludes one just past it', () => {\n+    const ids = latestRoundRunIds([\n+      run('latest', 0),\n+      run('at-boundary', -ROUND_WINDOW_MS),\n+      run('past-boundary', -ROUND_WINDOW_MS - 1),\n+    ]);\n+    expect(ids.has('latest')).toBe(true);\n+    expect(ids.has('at-boundary')).toBe(true);\n+    expect(ids.has('past-boundary')).toBe(false);\n+  });\n+});",
          inputMeta: {
            pr_body: "### L01\r\n\r\n- [x] | 1 | CLAUDE.md — технологічний стек | Мова/фреймворк/ключові бібліотеки кожного пакета вказані |\r\n- [x] | 2 | CLAUDE.md — структура монорепо | Перелік пакетів/папок і роль кожного вказані |\r\n- [x] | 3 | CLAUDE.md — команди запуску | Команди запуску проєкту є |\r\n- [x] | 4 | CLAUDE.md — команди перевірки | Команди тестів/typecheck/лінту є |\r\n- [x] | 5 | CLAUDE.md — конвенції найменування | Окремий розділ з конвенціями найменування є |\r\n- [x] | 6 | CLAUDE.md — do not touch (міграції) | Міграції явно позначені як зона «do not touch» |\r\n- [x] | 7 | CLAUDE.md — do not touch (lock-файли) | Lock-файли явно позначені як зона «do not touch» |\r\n- [x] | 8 | Скіл engineering-insights існує | Є окремий файл `.claude/skills/engineering-insights/SKILL.md` |\r\n- [x] | 9 | Скіл фіксує знахідки самостійно | Спрацьовує без явного прохання в кожній задачі |\r\n- [x] | 10 | Записи в INSIGHTS.md потрібного модуля | Запис саме в INSIGHTS.md модуля, де відбувалась робота (client/server/reviewer-core/e2e) |\r\n- [x] | 11 | Доказ у записі INSIGHTS.md | Кожен запис має file:line і дату |\r\n- [x] | 12 | Cost у списку Pull Requests | Сума вартості всіх успішних прогонів по PR; немає прогонів — значення порожнє |\r\n- [x] | 13 | Cost на вкладці Agent runs | Кожен прогін у Timeline показує свою вартість |\r\n- [x] | 14 | Cost у сайдбарі трасування прогону | Окремий стат-блок COST у Trace drawer → Stats |\r\n- [x] | 15 | 5-фазний цикл роботи | Initiation → Planning → Implementation → Validation → Completion пройдені |\r\n\r\nhttps://github.com/user-attachments/assets/34281ba6-061e-482c-a87d-daab67646597\r\n\r\n### H01\r\n- [x] | 16 | Лічильники findings за severity | Вкладка \"Agent runs\" має ДВІ секції: \"Timeline\" (плитки прогонів і комітів у хронології — кожна плитка теж показує свої severity-іконки, але без кліку) і \"Review runs\" (картки по прогону, розгортаються). Лічильники з цього критерію — саме в \"Review runs\": (1) відкрити PR → (2) вкладка \"Agent runs\" → (3) секція \"Review runs\" → (4) клікнути на картку прогону, розгорнути → (5) під вердиктом і PR SCORE — рядок пілюль «N CRITICAL · N WARNING · N SUGGESTION» (тільки ті severity, що реально є) |\r\n- [x] | 17 | Лічильники відповідають реальності | У тій самій розгорнутій картці прогону: число на пілюлі = кількість карток-знахідок цієї severity, виведених нижче в цій же картці |\r\n- [x] | 18 | Фільтр знахідок по severity | У тій самій розгорнутій картці прогону: клік по пілюлі лишає нижче лише знахідки цієї severity; повторний клік знімає фільтр і повертає повний список знахідок цього прогону |\r\n- [x] | 19 | Підрахунок без LLM | Числа «N CRITICAL · N WARNING · N SUGGESTION» рахуються групуванням уже наявних findings за полем severity (простий COUNT/filter). Жодного нового звернення до LLM при відкритті сторінки чи перемиканні фільтра |\r\n- [x] | 20 | Попап «N FINDINGS IN THIS RUN» (сторінка СПИСКУ PR, не деталей!) | На сторінці списку Pull Requests (де перелічені всі PR), при наведенні курсора на severity-іконки в колонці FINDINGS конкретного рядка PR — з'являється спливаюче вікно (popover) із заголовком «N FINDINGS IN THIS RUN» |\r\n- [x] | 21 | Прев'ю знахідки в попапі — read-only | В тому самому попапі зі списку PR (не в акордеоні на сторінці PR!) кожне прев'ю знахідки показує лише текст: severity-іконку, заголовок, категорію, file:line, % confidence, короткий опис — без жодних кнопок |\r\n- [x] | 22 | Картка знахідки з Accept/Reject — ІНШЕ місце (сторінка PR, акордеон Review runs) | Це вже не попап зі списку PR, а розгорнута картка прогону на сторінці конкретного PR (вкладка Agent runs → Review runs) — там у кожної знахідки є кнопки Accept і Reject |\r\n- [x] | 23 | Знахідки в сайдбарі Trace and Logs | Видно не лише cost/stats, а й самі знахідки |\r\n- [x] | 24 | docs/ і specs/ по кожному пакету | Реальний контент з лабораторної, не порожні README-стаби\r\n\r\nhttps://github.com/user-attachments/assets/7cf61bf8-a979-46a8-ad78-9cfb6dd6b731\r\n\r\n## Summary\r\n\r\nCourse-scaffolding (per-package CLAUDE.md / INSIGHTS.md / docs/ / specs/, engineering-insights skill) plus two features: LLM cost tracking and severity findings counters, across the PR list, PR detail, and trace drawer.\r\n\r\nCourse scaffolding\r\n\r\n- CLAUDE.md, INSIGHTS.md (append-only findings log), docs/, specs/ for server/, client/, reviewer-core/, e2e/, plus root CLAUDE.md, pnpm-workspace.yaml for server//client/.\r\n- Naming conventions section in root CLAUDE.md (DB/contract snake_case vs. TS camelCase, Zod schema/type PascalCase pairing, enum casing, component/route/migration file naming).\r\n- Lock files (pnpm-lock.yaml / package-lock.json) marked explicitly as do-not-touch in root and every package CLAUDE.md (added a Do-not-touch section to e2e/CLAUDE.md, which had none).\r\n- .claude/skills/engineering-insights/SKILL.md — reads a module's INSIGHTS.md before work starts, appends one dated, evidence-cited (file:line) finding at the end of a substantive session; insertion-only, never rewrites the file, fires without being asked.\r\n\r\nLLM cost tracking\r\n\r\n- agent_runs.cost_usd (migration 0010), threaded through run-executor's success/failure paths.\r\n- PR list: COST column — sum of every successful run's cost for that PR; empty (never $0.00) when there's no data.\r\n- Agent runs → Timeline / Review runs: each run shows its own cost.\r\n- Run Trace drawer: a fourth COST stat tile next to Duration/Tokens/Findings, and the findings themselves are visible in the drawer, not just the stats.\r\n- RunStats/RunSummary/PrMeta/ReviewRecord extended in both hand-mirrored vendor/shared copies (server + client).\r\n\r\nSeverity findings counters\r\n\r\n- PR list — new \"Findings\" column; hovering the severity icons opens a read-only popover titled \"N FINDINGS IN THIS RUN\" with one line per finding (severity icon, title, category, file:line, confidence %, short description) — no buttons.\r\n- PR detail → Agent runs → Timeline — each run tile shows its own severity icons; hovering opens the same kind of read-only popover.\r\n- PR detail → Agent runs → Review runs — expanding a run's card shows a clickable \"N CRITICAL · N WARNING · N SUGGESTION\" pill row under the verdict/score; clicking a pill filters the finding cards below to that severity (click again to clear). Pill numbers are a plain client-side COUNT/filter over already-loaded findings — no LLM call, no network request — and always equal the number of matching cards actually rendered below, whether or not \"Hide low confidence\" is on.\r\n- Accept/Dismiss stays where it already lived — on the finding cards inside that same expanded Review-runs card, not in any popover.\r\n- SeverityCounts/FindingPreview/FindingsSummary added to @devdigest/shared, mirrored in both vendor copies.",
            pr_title: "H01",
            pr_number: 1,
            repo_full_name: "sgdiachenko/dev-digest",
          },
          expectations: [
            {
              file: "server/test/reviews-helpers.test.ts",
              title: "Weak assertion in server rationale truncation test",
              category: "test",
              end_line: 117,
              severity: "SUGGESTION",
              start_line: 113,
            },
          ],
          diffSource: "run_trace",
        },
    ],
  },
  {
    agentName: "API Contract Reviewer",
    cases: [
        {
          name: "no-inconsistent-field-naming-convention-camelcase-vs-snake-case",
          type: "must_not_flag",
          inputDiff: "diff --git a/src/api/public/webhooks.ts b/src/api/public/webhooks.ts\n--- a/src/api/public/webhooks.ts\n+++ b/src/api/public/webhooks.ts\n@@ -1,9 +1,10 @@\n app.get('/api/webhooks/:id/status', async (req, reply) => {\n   const record = await db.getWebhookDelivery(req.params.id);\n   if (!record) return reply.code(404).send({ error: 'not found' });\n   return {\n     status: record.status,\n     last_attempt_at: record.lastAttemptAt,\n     next_attempt_at: record.nextAttemptAt,\n+    retryCount: record.retryCount,\n   };\n });",
          inputMeta: {
            pr_body: "Adds retryCount to GET /api/webhooks/:id/status so the dashboard can show delivery attempts.",
            pr_title: "Surface retry count on the webhook status endpoint",
            pr_number: 484,
            repo_full_name: "acme/payments-api",
          },
          expectations: [
            {
              file: "src/api/public/webhooks.ts",
              title: "Inconsistent field naming convention (camelCase vs snake_case)",
              category: "style",
              end_line: 10,
              severity: "SUGGESTION",
              start_line: 10,
            },
          ],
          diffSource: "run_trace",
        },
    ],
  },
];

export async function seedAgentEvalCases(db: Db, workspaceId: string): Promise<void> {
  for (const { agentName, cases } of AGENT_CASE_SEEDS) {
    const [agent] = await db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, agentName)));
    if (!agent) continue;

    for (const c of cases) {
      const [existing] = await db
        .select({ id: t.evalCases.id })
        .from(t.evalCases)
        .where(
          and(
            eq(t.evalCases.ownerKind, 'agent'),
            eq(t.evalCases.ownerId, agent.id),
            eq(t.evalCases.name, c.name),
          ),
        );
      if (existing) continue;
      await db.insert(t.evalCases).values({
        ...c,
        workspaceId,
        ownerKind: 'agent',
        ownerId: agent.id,
        agentId: agent.id,
        sourceFindingId: null,
      });
    }
  }
}
