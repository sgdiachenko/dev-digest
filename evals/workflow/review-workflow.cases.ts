import type { WorkflowCase } from "../src/index.js";

/**
 * Systemic ("workflow") tier — asserts the real on-disk harness (CLAUDE.md + skills + subagents,
 * loaded via settingSources:["project"]) behaves as documented. Organized by scenario, not by a
 * single artifact, because these behaviors are cross-cutting.
 *
 * Budget: 10 Claude sessions total.
 *   - 8 × trace     → 1 session each                      = 8
 *   - 1 × activation pair (positive + near-miss negative) = 2
 *
 * `trace` folds several assertions into ONE session (cheaper, coarser) and stops early once its
 * evidence is in — so a dispatch-bearing trace never waits out the nested subagent's full run.
 */
export const cases: WorkflowCase[] = [
  // --- trace (1 session): CLAUDE.md "Read When" routing + subagent dispatch, together -----------
  {
    kind: "trace",
    // Endpoint must NOT already exist, or the model reviews the existing code inline instead of
    // planning-then-dispatching. GET /reviews/:id/export is genuinely absent from routes.ts.
    name: "API-route task reads api-contracts AND pulls the architecture-reviewer",
    prompt:
      "Я планую додати НОВИЙ, ще не реалізований ендпоінт GET /reviews/:id/export (віддає ревʼю як " +
      "markdown). Спершу звірся з конвенціями API цього репо. Потім ОБОВʼЯЗКОВО запусти сабагента " +
      "architecture-reviewer, щоб він оцінив мій план на відповідність onion-шарам — не рецензуй сам.",
    expectFilesRead: ["server/docs/api-contracts.md"],
    expectSubagents: ["architecture-reviewer"],
    maxTurns: 8,
  },

  // --- nested-AGENTS routing: each package's AGENTS.md links its own docs ------------------------
  // Root AGENTS.md says "working inside a package -> that package's AGENTS.md". The prompts push the
  // agent to CONSULT repo guidance before touching code; one anchor doc per case keeps it stable.
  {
    kind: "trace",
    name: "reviewer-core task follows package AGENTS.md to pipeline.md",
    prompt:
      "Я збираюся змінити review pipeline у reviewer-core. Перш ніж торкатися коду — звірся з настановами " +
      "цього репо для цього пакета і прочитай документацію, на яку вони посилаються.",
    expectFilesRead: ["reviewer-core/docs/pipeline.md"],
    maxTurns: 8,
  },
  {
    kind: "trace",
    name: "client task follows client AGENTS.md to ui-architecture.md",
    prompt:
      "Я збираюся додати у client/ новий маршрут (сторінку) з завантаженням даних. Перш ніж писати код — звірся з " +
      "настановами цього репо для client і прочитай документацію, на яку вони посилаються.",
    expectFilesRead: ["client/docs/ui-architecture.md"],
    maxTurns: 8,
  },
  {
    kind: "trace",
    name: "server task follows server AGENTS.md to architecture.md",
    prompt:
      "Я збираюся додати новий модуль у server/ (нова доменна сутність з репозиторієм і сервісом). Перш ніж " +
      "писати код — звірся з настановами цього репо для server і прочитай документацію, на яку вони посилаються.",
    expectFilesRead: ["server/docs/architecture.md"],
    maxTurns: 8,
  },
  {
    kind: "trace",
    name: "mcp-server task follows its AGENTS.md to the mcp-server plan",
    prompt:
      "Я збираюся додати новий tool у mcp-server. Перш ніж писати код — звірся з настановами цього репо " +
      "для mcp-server і прочитай документ, на який вони посилаються.",
    expectFilesRead: ["docs/plans/mcp-server.md"],
    maxTurns: 8,
  },
  {
    kind: "trace",
    name: "e2e task follows e2e AGENTS.md to flows.md",
    prompt:
      "Я збираюся додати новий e2e-флоу. Перш ніж писати його — звірся з настановами цього репо для e2e " +
      "і прочитай документацію, на яку вони посилаються.",
    expectFilesRead: ["e2e/docs/flows.md"],
    maxTurns: 8,
  },

  // --- trace (1 session): root "Hit something surprising" row -> the package's INSIGHTS.md -------
  {
    kind: "trace",
    name: "AGENTS.md routes a surprising-behavior lookup to reviewer-core/INSIGHTS.md",
    prompt:
      "У reviewer-core я стикнувся з несподіваною поведінкою — щось працює не так, як я очікував. " +
      "За настановами цього репо, де це вже могло бути задокументовано? Прочитай той файл.",
    expectFilesRead: ["reviewer-core/INSIGHTS.md"],
    maxTurns: 5,
  },

  // --- activation pair (2 sessions): positive + near-miss negative ------------------------------
  {
    kind: "activation",
    name: "engineering-insights activates on a genuine discovery",
    prompt:
      "Щойно з'ясував, чому pgvector-запит повертав нуль рядків — розмірність колонки не збіглася " +
      "після зміни моделі ембедингів. Хочу це зафіксувати, щоб більше не наступати.",
    skill: "engineering-insights",
    shouldActivate: true,
    maxTurns: 4,
  },
  {
    kind: "activation",
    name: "near-miss negative — explaining the same topic must NOT record an insight",
    prompt:
      "Поясни, як у pgvector працюють розмірності колонок і чому невідповідність повертає нуль рядків.",
    skill: "engineering-insights",
    shouldActivate: false,
    maxTurns: 4,
  },
];
