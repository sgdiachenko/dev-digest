# Implementation Plan: Eval Pipeline — eval-кейси зі знахідок, suite-прогони, метрики, Eval Dashboard, порівняння прогонів

## Goal & scope
- **In scope:**
  - Кнопка «Turn into eval case» на FindingCard і модалка EvalCaseModal з Run case перед Save.
  - Новий серверний модуль `eval`: draft, attempts, cases CRUD, suite runs, overview, compare, boot-sweep.
  - Скоринг кодом, без LLM.
  - Вкладка Agents › Evals.
  - Сторінка `/eval` (Eval Dashboard) з compare modal.
  - Адитивна міграція.
  - Зміни в `reviewer-core`: експорти і параметри LLM-виклику.
  - Дзеркала контрактів: server, client і mcp-server.
  - Seed-фікстури для e2e.
  - Скрипт `verify:l06`.
  - Усі 161 активний AC спеки, усі EC-1…EC-34 і NFR-1…NFR-16, крім ручних перевірок (див. *Delivery*).
- **Out of scope:**
  - Eval-кейси для скілів, «Run on save», «Promote vB», вкладка Files, Linked issue, повтор кейсу N разів, відновлення interrupted-прогону, крос-агентне порівняння, токен `--text-muted` для всієї студії, harness `evals/`. Підстава — Non-goals і Design deviations DD-1, DD-2, DD-10 спеки.
  - e2e-флоу `e2e/specs/*.flow.json` — робота `test-writer`, поза `/run-plan`.
  - Документація — `doc-writer`.
  - Коміти і PR.
  - Запуск міграцій: `pnpm db:migrate` виконує лише користувач.
  - Відхилених REC немає.

## Decisions
- Spec: `2026-10-08-eval-pipeline` (approved) — `docs/specs/2026-10-08-eval-pipeline.md`
- REC1 (адитивна міграція: `eval_suite_runs` плюс розширення `eval_cases` і `eval_runs`, без DROP/RENAME) — accepted → S5
- REC2 (часткова unique-умова на активний прогін, unique-ім'я кейсу, індекси) — accepted → S5, S13
- REC3 (pinned-входи активного прогону в пам'яті, рядки по кейсах створюються на старті) — accepted → S16
- REC4 (reviewer-core: `isFullFileKind`, `unwrapUntrusted`, `temperature`/`timeoutMs`/`httpRetries` у `ReviewInput`) — accepted → S3, S4
- REC5 (скоринг і вирізання фрагмента — чисті функції в `modules/eval/helpers.ts`) — accepted → S8, S9
- REC6 (валідатор expectations — `superRefine` у дзеркальному контракті) — accepted → S1
- REC7 (title і body PR — untrusted; фіксований task; спільний `toSkillBlock`) — accepted → S10, S15
- REC8 (60 с / 0 HTTP-ретраїв / 2 re-prompt / 90 с cap з abandoned-прапорцем; reason-коди; `platform/llm-params.ts`) — accepted → S11, S15, S16
- REC9 (модуль `modules/eval` за onion-архітектурою, мемоізовані сервіси, AppError з кодами) — accepted → S13–S18
- REC10 (`verify:l06` з явним списком файлів, parity-тест) — accepted → S2, S18
- REC11 (дзеркало `knowledge.ts` у mcp-server) — accepted → S1
- REC12 (seed: agent-linked review з triaged-знахідками, 2 completed runs у Performance Reviewer) — accepted → S12
- REC13 (`labelKey` у NAV і перекладач через ctx) — accepted → S20
- REC14 (вкладка Evals у `TABS` і в експортованому `VALID_TABS` з guard-тестом) — accepted → S33
- REC15 (перенос `useModalFocus` у `components/modal-focus`) — accepted → S21
- REC16 (опційні props у FindingCard, `DiffFindingApi`, рядки в `prReview`, модалка в `components/eval-case-modal`, хуки в `lib/hooks/eval.ts`) — accepted → S22, S24–S28
- REC17 (вендорені `MetricCard`/`Sparkline`/`LineChart`/`BarRow`/`Checkbox`/`Dropdown`/`Tabs`; власний `wordDiff`; `fireEvent`) — accepted → S29–S32, S34–S36
- REC18 (переписати namespace `eval.json` під копію спеки) — accepted → S19
- REC19 (макети в `docs/designs/eval-pipeline/`) — accepted, виконано користувачем → *Context → Design*
- SC1-кандидат (AC-110 і AC-122 обидва e2e на одному seed) — спеку не повертаємо. AC-110 покриває компонентний тест T42, e2e для AC-110 — нотатка для `test-writer` (див. *Risks*).

## Execution mode
**multi-agent.** Зміни зачіпають 5 пакетів (server, client, reviewer-core, mcp-server-дзеркало, seed), 161 AC і три нові UI-поверхні. Зрізи незалежні й сходяться лише на контрактах і схемі.

## Work packages
| WP | Steps | owns | depends-on | wave |
|---|---|---|---|---|
| W1 — contracts | S1, S2 | `server/src/vendor/shared/contracts/eval-ci.ts`, `server/src/vendor/shared/contracts/knowledge.ts`, `client/src/vendor/shared/contracts/eval-ci.ts`, `client/src/vendor/shared/contracts/knowledge.ts`, `mcp-server/src/vendor/shared/contracts/knowledge.ts`, `server/test/contracts.test.ts`, `server/test/eval-contracts.test.ts`, `server/test/eval-contract-parity.test.ts` | — | 1 |
| W2 — reviewer-core | S3, S4 | `reviewer-core/src/grounding.ts`, `reviewer-core/src/prompt.ts`, `reviewer-core/src/review/run.ts`, `reviewer-core/src/index.ts`, `reviewer-core/test/eval-support.test.ts` | — | 1 |
| W3 — schema | S5 | `server/src/db/schema/eval.ts`, `server/src/db/migrations/**` (лише нова згенерована міграція і `meta/`) | — | 1 |
| W4 — client foundation | S19, S20, S21 | `client/messages/en/eval.json`, `client/messages/en/prReview.json`, `client/messages/en/shell.json`, `client/messages/en/agents.json`, `client/src/vendor/ui/nav.ts`, `client/src/vendor/ui/shell/**`, `client/src/components/app-shell/**`, `client/src/components/modal-focus/**`, `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/_components/PromptBlock/**` | — | 1 |
| W5 — server eval core (pure) | S6–S11 | `server/src/modules/eval/helpers.ts`, `server/src/modules/eval/constants.ts`, `server/src/modules/eval/types.ts`, `server/src/platform/llm-params.ts`, `server/src/adapters/llm/openai.ts`, `server/src/modules/reviews/helpers.ts`, `server/src/modules/reviews/run-executor.ts`, `server/test/eval-scoring.test.ts`, `server/test/eval-helpers.test.ts`, `server/test/llm-params.test.ts` | W1, W2 | 2 |
| W6 — seed | S12 | `server/src/db/seed.ts`, `server/src/db/seed-eval.ts` | W3 | 2 |
| W7 — client data hooks | S22, S23 | `client/src/lib/hooks/eval.ts`, `client/src/lib/hooks/eval.test.tsx`, `client/src/lib/hooks/index.ts` | W1 | 2 |
| W8 — server eval API | S13–S18 | `server/src/modules/eval/repository.ts`, `server/src/modules/eval/service.ts`, `server/src/modules/eval/attempt-service.ts`, `server/src/modules/eval/suite-run-service.ts`, `server/src/modules/eval/routes.ts`, `server/src/modules/index.ts`, `server/src/platform/container.ts`, `server/src/app.ts`, `server/package.json`, `server/test/eval-fixed-inputs.test.ts`, `server/test/eval-suite-executor.test.ts`, `server/test/eval-attempts.test.ts`, `server/test/eval-service.test.ts`, `server/test/eval.it.test.ts`, `server/test/eval-perf.it.test.ts` | W1, W2, W3, W5 | 3 |
| W9 — EvalCaseModal + FindingCard | S24–S28 | `client/src/components/eval-case-modal/**`, `client/src/components/finding-card/FindingCard/**`, `client/src/components/diff-viewer/findings.ts`, `client/src/components/diff-viewer/CodeLine/**`, `client/src/components/diff-viewer/OutsideDiffFindings/**`, `client/src/components/diff-viewer/FileCard/**`, `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/**`, `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/**`, `client/src/app/repos/[repoId]/pulls/[number]/_components/ReviewRunAccordion/**`, `client/src/test/smoke.test.tsx` | W4, W7 | 3 |
| W11 — Eval Dashboard | S34–S37 | `client/src/app/eval/**` | W4, W7 | 3 |
| W10 — Agents › Evals tab | S29–S33 | `client/src/app/agents/[id]/page.tsx`, `client/src/app/agents/[id]/constants.ts`, `client/src/app/agents/[id]/constants.test.ts`, `client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.tsx`, `client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.test.tsx`, `client/src/app/agents/[id]/_components/AgentEditor/constants.ts`, `client/src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/**` | W4, W7, W9 | 4 |

- **Overlap check.**
  - Хвиля 1: W1 і W3 обидва в `server/`, але файли різні.
  - Хвиля 2: W5 і W6 — різні файли в `server/`.
  - Хвиля 3: W8 (server), W9 (`components/**`, `pulls/[number]/**`), W11 (`app/eval/**`) не перетинаються.
  - Хвиля 4: лише W10.
  - Усі `client/messages/en/*.json` належать тільки W4. Пакети W9–W11, яким потрібен новий рядок, пишуть його в звіт як `missing-i18n`, і main session дописує ключ між хвилями. Мета — щоб у S19 цього не знадобилося.
- **Dependency check.** Кожен `depends-on` належить до раніших хвиль. W10 використовує `EvalCaseModal` з W9 (хвиля 3).

## Context
- **Навіщо:** див. *Problem* спеки. Accept/dismiss — це ground truth, а таблиці й контракти в репо поки не вміють зберігати suite run.
- **INSIGHTS, що вплинули на план:**
  - `server/INSIGHTS.md:45` — `drizzle-kit generate` питає «rename?», коли в одному diff є і додавання, і видалення колонок → міграція лише адитивна (C6).
  - `server/INSIGHTS.md:51` — сервіс зі станом у пам'яті має бути мемоізований у `container` (C9).
  - `server/INSIGHTS.md:31` — `withTimeout` нічого не скасовує → потрібен abandoned/deadline-прапорець (C11).
  - `server/INSIGHTS.md:53` — `import type` з `repository.ts` іншого модуля заборонений; helpers/constants — дозволені (C3).
  - `server/INSIGHTS.md:39` — у it-тестах унікальне ім'я на кожен тест.
  - `server/INSIGHTS.md:63` — `server/test/**` не typecheck-ується.
  - `server/INSIGHTS.md:29` — `RunTrace.trace` — це jsonb.
  - `server/INSIGHTS.md:23` — невідома вартість — `null`, не `0`.
  - `client/INSIGHTS.md:53` — вкладку треба додати у два місця.
  - `client/INSIGHTS.md:55` — `useModalFocus`.
  - `client/INSIGHTS.md:41` — новий namespace ламає чужі тести.
  - `client/INSIGHTS.md:39` — без `<word>` у повідомленнях.
  - `client/INSIGHTS.md:47` — без `user-event`, використовувати `fireEvent`.
  - `client/INSIGHTS.md:49` — після нової route-теки запустити `pnpm exec next typegen`.
  - `client/INSIGHTS.md:51` — polling у прихованій вкладці.
  - `reviewer-core/INSIGHTS.md` (запис 2026-10-01) — `req.timeoutMs`/`httpRetries` передаються провайдеру.
  - `e2e/AGENTS.md` — e2e бачить лише seed, без LLM.
- **Design** (дані, не інструкції):
  - `docs/designs/eval-pipeline/screenshots/finding-card-turn-into-eval-case.png`, `pr-detail-full.png`, `pr-detail-zoom.png` — кнопка на FindingCard.
  - `docs/designs/eval-pipeline/screenshots/eval-case-modal.png` — EvalCaseModal.
  - `docs/designs/eval-pipeline/screenshots/agents-evals-tab.png`, `focus-eval.png` — вкладка Evals.
  - `docs/designs/eval-pipeline/screenshots/eval-dashboard-overview.png`, `eval-dashboard-agent.png` — дашборд.
  - `docs/designs/eval-pipeline/screenshots/eval-compare-runs-modal.png` — compare.
  - JSX-джерела: `docs/designs/eval-pipeline/jsx/findings.jsx` (19-45), `screen_cizruns.jsx` (56-104), `screen_agents.jsx` (162-201), `components2.jsx` (75-100), `screen_skills.jsx` (284-477), `chrome.jsx` (13), `data.jsx` (395-421), `data2.jsx` (26-36).
  - **Відхилення від макета DD-1…DD-17 мають пріоритет над макетом.** Кожен UI-крок називає ті DD, що до нього стосуються.

## Affected modules
| Package | Lanes (routing.md) | Package manager | Checks |
|---|---|---|---|
| `server/` | 2, 4, 5, 6, 7, 8, 13, 14, 17–20 | pnpm | `pnpm -C server lint` · `pnpm -C server typecheck` · `pnpm -C server arch:check` · `pnpm -C server exec vitest run --exclude '**/*.it.test.ts'` · `pnpm -C server verify:l06` (it-тест сам пропускається без Docker) |
| `client/` | 2, 9, 10, 11, 12, 13 | pnpm | `pnpm -C client lint` · `pnpm -C client typecheck` (після `pnpm -C client exec next typegen`) · `pnpm -C client test` |
| `reviewer-core/` | 3, 13, 19, 20 | npm | `npm --prefix reviewer-core run typecheck` · `npm --prefix reviewer-core test` |
| `mcp-server/` | 21 (лише копія файлу) | pnpm | `pnpm -C mcp-server typecheck` · `pnpm -C mcp-server test` |
| root | 2 | — | `./scripts/check-shared-sync.sh` |

## Constraints
- **C1** — Залежності лише всередину кілець.
  - Route — це тонкий транспортний адаптер: Zod-схеми, один виклик сервісу, статус-код.
  - Сервіси приймають порти, а не `Container`.
  - Тільки `repository.ts` знає про drizzle і `db/*`, і він мапить row у доменний тип.
  - `new` для конкретних класів — лише в `platform/container.ts`.
  - Перевіряє `pnpm -C server arch:check`.
  - Source: onion-architecture; `server/AGENTS.md`.
- **C2** — Кожен route оголошує Zod-схеми `params`, `body` і `response` через `fastify-type-provider-zod`. Невалідний ввід отримує 422 ще до handler. Жодного ручного `.parse(req.body)`. Source: `server/AGENTS.md`; fastify-best-practices.
- **C3** — Жодного імпорту (і жодного `import type`) з `modules/<інший>/(service|routes|repository)`.
  - Дозволено імпортувати лише `helpers.ts`/`constants.ts` іншого модуля.
  - Таблиці findings, reviews, run_traces, pr_files, agents і skills `eval/repository.ts` читає напряму.
  - Source: `server/.dependency-cruiser.cjs` (`no-sideways-module-imports`); `server/INSIGHTS.md:53`.
- **C4** — Wire-поля і DB-колонки — `snake_case`. TS-поля Drizzle — `camelCase` з явною назвою колонки. Zod-константа і її тип мають одне PascalCase-ім'я. Значення enum — `lower_snake_case`. Source: root `AGENTS.md` (Naming).
- **C5** — Контракти редагуються одночасно в трьох копіях: server, client і mcp-server (лише `knowledge.ts`). Після цього `./scripts/check-shared-sync.sh` має вийти з 0. Контракти імпортують лише `zod` і інші контракти. Source: root `AGENTS.md`; `scripts/check-shared-sync.sh:69-90`.
- **C6** — Міграція лише адитивна: без DROP і RENAME.
  - Створюється тільки командою `pnpm -C server db:generate`, без ручних назв і правок SQL.
  - `pnpm db:migrate` не запускати.
  - Source: root `AGENTS.md`; `server/INSIGHTS.md:45`.
- **C7** — Запис, який є одним фактом, робиться одною транзакцією в repository (`DbOrTx`). Сюди належать: створення прогону разом із рядками по кейсах, фініш прогону з агрегатом. Source: `server/AGENTS.md`.
- **C8** — Eval-рецензія не створює рядків `reviews`, `findings`, `agent_runs`, `run_traces` і не викликає `markReviewed`. Вона передає в engine лише `systemPrompt`, `model`, `strategy`, `skills`, `diff`, `prDescription` і фіксований `task` (AC-18/19/167/168). Source: spec AC-18, AC-19, AC-167, AC-168.
- **C9** — `EvalService`, `EvalAttemptService` і `EvalSuiteRunService` мемоізуються в `container` через `this._x ??= new X(...)`. Source: `server/INSIGHTS.md:51`.
- **C10** — Untrusted-вміст (diff, PR title і body) йде в prompt лише через `wrapUntrusted` / `prDescription`. Він ніколи не потрапляє в `task` чи в label. Його не логуємо: заборонено логувати diff, PR body, system prompt, expected output і raw output (NFR-14). Source: spec *Untrusted inputs*; `reviewer-core/AGENTS.md`.
- **C11** — Межі LLM-виклику одного кейсу:
  - параметри: `temperature: 0`, `timeoutMs: 60_000`, `httpRetries: 0`, `maxRetries: 2`;
  - зовнішня межа — 90 с через `withTimeout`;
  - спільний стан `{abandoned, deadlineAt}` перевіряється перед будь-яким записом результату, тож пізня відповідь не перезапише `error/timeout`;
  - автоматичних повторів немає.
  - Source: spec NFR-5, AC-23; `server/INSIGHTS.md:31`.
- **C12** — Невідома вартість — `null`. Сума вартості — `null`, якщо жоден кейс не повідомив cost. Source: AC-90; `server/INSIGHTS.md:23`.
- **C13** — Код помилки — `AppError(code, message, status, details)` з кодами спеки. Конверт `{error:{code,message,details}}` не змінюється, `run_active` кладе `details.active_run_id`. Source: `server/src/platform/errors.ts:7-33`.
- **C14** — Клієнт отримує дані лише через `client/src/lib/hooks/*` → `src/lib/api.ts`. Компоненти не викликають `fetch`. Source: `client/AGENTS.md`.
- **C15** — Розміщення компонентів:
  - один компонент на файл у `_components/<Name>/<Name>.tsx`, тест поруч;
  - сторінки тонкі;
  - спільне між route-деревами — у `client/src/components/**`;
  - feature не імпортує інший feature.
  - Source: root `AGENTS.md`; frontend-architecture.
- **C16** — Рядки інтерфейсу:
  - кожен новий видимий рядок — у `client/messages/en/*.json`, без `<word>`;
  - рядки FindingCard — у namespace `prReview`;
  - новий namespace, що з'явився в спільному дереві, треба додати в провайдери всіх тестів, які це дерево рендерять.
  - Source: NFR-16; `client/INSIGHTS.md:39,41`.
- **C17** — Діалоги: `useModalFocus` дає фокус усередину, Tab-цикл, Escape і повернення фокуса на тригер. Дії рядків показуються на hover і на focus-within. Справжні checkbox. Рядки відкриваються з клавіатури Enter/Space. Статус — текст плюс іконка. `aria-live="polite"` без переміщення фокуса. Цілі ≥ 24×24 px. Source: NFR-9…NFR-12; react-best-practices (Accessibility); DD-13, DD-14.
- **C18** — Тести:
  - `fireEvent`, не `user-event`;
  - fetch мокається;
  - `findBy`/`waitFor` замість таймерів, крім fake timers для polling і elapsed.
  - Source: `client/INSIGHTS.md:47`; react-testing-library.
- **C19** — Пакетні менеджери:
  - pnpm для `server`, `client`, `mcp-server`;
  - npm для `reviewer-core`.
  - Lockfile-и не змінювати, нових залежностей не додавати.
  - Source: root `AGENTS.md`.
- **C20** — Існуючі API не змінюють форму: `FindingRecord`, `ReviewRecord`, accept/dismiss, усі `/agents`, `PluginEvalCase`. `ReviewInput` у reviewer-core розширюється лише опційними полями. Source: NFR-15; breaking-change; response-schema.
- **C21** — DB-тест закінчується на `*.it.test.ts` і бере унікальні імена на кожен тест. Source: `server/AGENTS.md` (Gotchas); `server/INSIGHTS.md:39`.

## Steps

### S1 — Eval-контракти (server + client + mcp)
- package: W1
- files:
  - **modify** `server/src/vendor/shared/contracts/eval-ci.ts`:
    - нові `EvalCaseType`, `EvalExpectation`, `EvalDiffSource`, `EvalErrorReason`, `EvalCaseStatus`, `EvalSuiteRunStatus`;
    - змінений `EvalCaseInput`: без `owner_kind`/`owner_id`, з `type`, `input_meta` і `expectations`. Ліміти: name 1..120, diff ≤ 65 536 байт, expectations 1..20. `.strict()` на expectations;
    - `superRefine` на `EvalCaseInput` (REC6). Чиста функція `hunkRangesByFile(diff)` у тому ж файлі парсить `diff --git`, `+++ b/` і `@@ -a,b +c,d @@`. Помилки отримують `path` `['expectations', i, 'file' | 'start_line' | 'end_line']` або `['expectations']`, у порядку правил AC-145;
    - `EvalCaseDraft`, `EvalCaseResult` (`actual_findings` з полем `match`, `dropped_findings`, без prompt), `EvalAttempt`, `EvalSuiteRun` (`config` з `temperature`, `per_case`), `EvalSuiteRunSummary` (`.omit` для `per_case` і `config.system_prompt`), `EvalOverview`, `EvalRunComparison`;
    - відповіді `EvalRunStartResponse { run_id }` і `EvalAttemptStartResponse { attempt_id }`;
    - `EvalRunRecord` і `EvalRunResult` лишаються, але з `@deprecated` у TSDoc, що вказує на `EvalSuiteRun`/`EvalCaseResult`;
    - `EvalDashboard` — так само, `@deprecated` → `EvalOverview`.
  - **modify** `server/src/vendor/shared/contracts/knowledge.ts`:
    - `EvalCase` = поля `EvalCaseInput` плюс `id`, `owner_kind`, `owner_id`, `created_at`, `updated_at`, `last_result | null`, `source` (`{finding_title, pr_number, repo_id, triage: accepted|dismissed} | null`; провенанс для AC-69);
    - метрики `EvalRun` → `number(0..1).nullable()`.
  - **copy** обидва файли в `client/src/vendor/shared/contracts/`, а `knowledge.ts` — ще й у `mcp-server/src/vendor/shared/contracts/knowledge.ts`. Зручно через `./scripts/check-shared-sync.sh --fix`.
  - `PluginEvalCase` не змінюється.
- skills: zod — lane 2; typescript-expert — lane 13; response-schema, breaking-change — lanes 17/18 (змінюються існуючі експорти); engineering-insights
- constraints: C4, C5, C20
- covers: AC-6, AC-7, AC-52, AC-134, AC-145, AC-146 (правила), AC-140 (форма), NFR-3 (ліміти полів), NFR-15
- reuse: `server/src/vendor/shared/contracts/findings.ts` (`Finding`, `Severity`); `server/src/vendor/shared/contracts/eval-ci.ts:20-89`
- done-when: `./scripts/check-shared-sync.sh` повертає 0; `pnpm -C server typecheck`, `pnpm -C client typecheck` і `pnpm -C mcp-server typecheck` проходять; T1 зелений.
- depends-on: —

### S2 — Тести контрактів і parity
- package: W1
- files:
  - **create** `server/test/eval-contracts.test.ts` (T1).
  - **create** `server/test/eval-contract-parity.test.ts` (T2): `node:fs` читає `eval-ci.ts` і `knowledge.ts` з `server/`, `client/` і mcp-копії, порівнює побайтово.
  - **modify** `server/test/contracts.test.ts:243-265`: додати кейс `EvalRun` з `null`-метриками.
- skills: zod; engineering-insights
- constraints: C5
- covers: AC-134, AC-137 (частини «contracts» і «parity»), NFR-15
- done-when: `pnpm -C server exec vitest run test/eval-contracts.test.ts test/eval-contract-parity.test.ts test/contracts.test.ts` зелений.
- depends-on: S1

### S3 — reviewer-core: експорти для eval
- package: W2
- files:
  - **modify** `reviewer-core/src/grounding.ts`: `export function isFullFileKind(kind?: string | null): boolean`. `groundFindings` використовує саме її. Також експортувати `buildLineIndex`.
  - **modify** `reviewer-core/src/prompt.ts`: `export function unwrapUntrusted(label, text): string | null`. Знаходить перший блок `<untrusted source="<label>">\n…\n</untrusted>` і робить зворотну заміну `<\/untrusted>` → `</untrusted>`.
  - **modify** `reviewer-core/src/index.ts`: експортувати обидві функції.
- skills: onion-architecture — lane 3; typescript-expert — lane 13; engineering-insights
- constraints: C10, C20
- covers: AC-10, AC-11, AC-26 (джерело full-file kinds)
- reuse: `reviewer-core/src/grounding.ts:16`, `reviewer-core/src/prompt.ts:48-53`
- done-when: T3 зелений. `unwrapUntrusted(wrapUntrusted('diff', x)) === x` для `x`, що містить `</untrusted>`.
- depends-on: —

### S4 — reviewer-core: параметри LLM-виклику
- package: W2
- files:
  - **modify** `reviewer-core/src/review/run.ts`:
    - `ReviewInput` отримує опційні `temperature?`, `timeoutMs?`, `httpRetries?`;
    - вони передаються в `completeStructured` (`run.ts:209-216`) лише тоді, коли задані;
    - `ReviewOutcome` отримує `request: { model, temperature: number | null, max_retries, timeout_ms: number | null, http_retries: number | null }`.
  - **create** `reviewer-core/test/eval-support.test.ts` (T3):
    - stub-LLM бачить `temperature: 0`, `timeoutMs`, `httpRetries`;
    - без цих полів запит такий самий, як зараз.
- skills: onion-architecture; typescript-expert; engineering-insights
- constraints: C11, C20
- covers: AC-169, AC-170, NFR-5, NFR-7
- reuse: `server/src/vendor/shared/adapters.ts:42-55`, `reviewer-core/src/llm/openrouter.ts:87,104-109`
- done-when: `npm --prefix reviewer-core run typecheck && npm --prefix reviewer-core test` зелений; `pnpm -C server typecheck` теж зелений (server споживає джерела).
- depends-on: —

### S5 — Схема БД і згенерована міграція
- package: W3
- files: **modify** `server/src/db/schema/eval.ts` (тільки додавання):
  - **`evalCases`** — нові колонки:
    - `agentId` (`agent_id`) FK → `agents.id`, `onDelete: 'cascade'`, nullable;
    - `type` enum `must_find|must_not_flag`, nullable;
    - `expectations` jsonb;
    - `diffSource` (`diff_source`);
    - `sourceFindingId` (`source_finding_id`), без FK, щоб AC-135 зберігав кейс після змін знахідки;
    - `createdAt`/`updatedAt` timestamptz, `defaultNow()`.
  - **`evalCases`** — `uniqueIndex('eval_cases_owner_name_uq').on(ownerKind, ownerId, name)` та індекс `(agent_id)`.
  - **нова `evalSuiteRuns` (`eval_suite_runs`)**:
    - `id`, `workspaceId` FK cascade, `agentId` FK cascade, `status`, `agentVersion`, `config` jsonb, `caseIds` jsonb;
    - лічильники `cases_total`, `cases_completed`, `cases_errored`, `cases_passed`;
    - `recall`, `precision`, `citation_accuracy`, `cost_usd`, `duration_ms`;
    - `startedAt`, `finishedAt`, `errorReason`;
    - `uniqueIndex('eval_suite_runs_one_active_uq').on(agentId).where(sql\`status in ('queued','running')\`)`;
    - індекс `(agent_id, started_at desc)`, індекс `(workspace_id, started_at desc)`.
  - **`evalRuns`** (результат по кейсу):
    - нові колонки: `suiteRunId` FK → `eval_suite_runs.id` cascade (NOT NULL; таблиця порожня), `status`, `errorReason`, `caseName`, `dropped` jsonb, `expectedCount`, `actualCount`;
    - індекси `(case_id, ran_at desc)` і `(suite_run_id)`.
  - Після цього: `pnpm -C server db:generate` → нова `server/src/db/migrations/00NN_*.sql` і `meta/`.
- skills: postgresql-table-design, drizzle-orm-patterns — lane 7; engineering-insights
- constraints: C4, C6
- covers: AC-73 (сховище), AC-82 і NFR-3 (one-active), AC-50 (unique), AC-65 (cascade), AC-89, AC-132, AC-135, NFR-1 (індекси), NFR-15
- reuse: `server/src/db/schema/agents.ts:38-48`
- done-when:
  - `db:generate` пройшов без інтерактивного питання;
  - SQL міграції містить лише `CREATE TABLE`, `ADD COLUMN`, `CREATE INDEX`, `ADD CONSTRAINT`;
  - `pnpm -C server typecheck` зелений;
  - міграцію не запускали.
- depends-on: —

### S6 — Порти, доменні типи, константи модуля eval
- package: W5
- files:
  - **create** `server/src/modules/eval/types.ts`:
    - порти: `EvalStore` (весь persistence, використовують S13–S17), `EvalAgentReader`, `EvalSkillsReader` (`forAgentWithVersion` → `{id, name, body, source, version}`), `EvalLlmResolver = (provider) => Promise<LLMProvider>`, `EvalLogger`;
    - доменні типи: `PinnedConfig`, `PinnedCase`, `CaseOutcome`, `DraftSource`.
  - **create** `server/src/modules/eval/constants.ts`:
    - `CASE_TIMEOUT_MS = 90_000`, `LLM_BUDGET_MS = 60_000`, `HTTP_RETRIES = 0`, `STRUCTURED_RETRIES = 2`, `EVAL_TEMPERATURE = 0`;
    - ліміти NFR-3: `MAX_CASES_PER_AGENT = 200`, `MAX_DIFF_BYTES = 65_536`, `MAX_EXPECTATIONS = 20`, `MAX_NAME = 120`;
    - `ATTEMPT_TTL_MS`, `RECENT_RUNS_LIMIT = 6`, `AGENT_RUNS_LIMIT = 10`, `REGRESSION_PTS = 5`;
    - `EVAL_TASK_LINE` — фіксований текст без title PR.
- skills: onion-architecture — lane 5; typescript-expert — lane 13; engineering-insights
- constraints: C1, C3, C8
- covers: NFR-3, NFR-5 (константи)
- done-when: `pnpm -C server typecheck` і `arch:check` зелені.
- depends-on: S1

### S7 — Хелпери draft: ім'я, expectation, вилучення diff
- package: W5
- files: **create** `server/src/modules/eval/helpers.ts`, частина 1:
  - `draftName(type, title)`: `must-find-` або `no-` плюс lowercase kebab-case slug, усе обрізано до 120 символів (AC-8);
  - `expectationFromFinding(f)` (AC-7);
  - `caseTypeFor(finding)`: `accepted_at` → `must_find`, `dismissed_at` → `must_not_flag`, інакше `null` (AC-6, EC-2);
  - `diffFromTrace(trace)`: `unwrapUntrusted('diff', trace.prompt_assembly?.user)` або `null` (AC-11, AC-12);
  - `cutFragment(diff: UnifiedDiff, file, start, end, kind)`: повертає тільки ті hunk-и файлу (з `diff --git`, `---`, `+++` і `@@`), що перетинають діапазон; для full-file kind — усі hunk-и файлу (AC-9, AC-10); якщо перетину немає — `null` (AC-14).
- skills: onion-architecture; typescript-expert; engineering-insights
- constraints: C1, C10
- covers: AC-6, AC-7, AC-8, AC-9, AC-10, AC-11, AC-12, AC-14
- reuse: `server/src/adapters/git/diff-parser.ts:14` (прецедент імпорту — `reviews/diff-loader.ts:3`), `reviewer-core` `unwrapUntrusted`/`isFullFileKind`, `server/src/modules/reviews/diff-loader.ts:33-44` (збирання diff із `pr_files`)
- done-when: T5 зелений; `arch:check` 0 errors.
- depends-on: S3, S6

### S8 — Скоринг (чистий код, без LLM)
- package: W5
- files: **modify** `server/src/modules/eval/helpers.ts`, частина 2:
  - `matches(finding, exp)`: file збігається і включні діапазони перетинаються; для full-file kind — лише file (AC-25, AC-26);
  - `scoreCase(type, expectations, kept, dropped, error?)` → `{status, matched, match per finding (matched|unmatched|forbidden_hit), expected_count, actual_count}`. Правила:
    - `must_find` → `pass`, якщо кожен expectation має відповідний finding (AC-27);
    - `must_not_flag` → `pass`, якщо жоден kept finding не перетинає заборонений діапазон (AC-28);
    - `error` → ніколи не `pass` (AC-171).
  - `aggregate(outcomes)` рахує лише кейси без помилок (AC-172):
    - recall = matched must_find expectations / усі must_find expectations (AC-29);
    - precision = kept findings, що збіглися з must_find, / усі kept (AC-30);
    - citation = kept / (kept + dropped) (AC-31);
    - cases_passed (AC-32);
    - знаменник 0 → `null` (AC-33);
    - cost — `null`, якщо жоден кейс не мав вартості (AC-90);
    - status: `completed`, `partial` або `failed`; при `failed` метрики `null` (AC-78, AC-79).
  - **create** `server/test/eval-scoring.test.ts` (T4): містить spy-LLM `MockLLMProvider` з лічильником викликів = 0 (AC-34) і бенчмарк на 200 кейсах < 100 мс (NFR-2).
- skills: onion-architecture; typescript-expert; engineering-insights
- constraints: C1, C12
- covers: AC-25, AC-26, AC-27, AC-28, AC-29, AC-30, AC-31, AC-32, AC-33, AC-34, AC-78, AC-79, AC-90, AC-138, AC-171, AC-172, NFR-2, NFR-4 (scoring 0), EC-5, EC-17, EC-19, EC-25, EC-31
- reuse: `reviewer-core` `isFullFileKind`; `server/src/adapters/mocks.ts` (`MockLLMProvider`)
- done-when: T4 зелений.
- depends-on: S7

### S9 — Порівняння прогонів і похідні метрики
- package: W5
- files: **modify** `server/src/modules/eval/helpers.ts`, частина 3:
  - `orderRuns(a, b)`: за `started_at`, older = `a`;
  - `compareRuns(a, b)` → `case_set {added, removed}` (AC-165); `flips` з outcome `pass|fail|error|absent` і маркером `pass→fail` / `fail→pass` / `none` (AC-127); `identical_config` — порівняння `config` і `skills` (AC-125).
  - `hasMetrics(status)`: лише `completed|partial`.
  - **create** `server/test/eval-helpers.test.ts` (T5) — покриває S7 і S9.
- skills: onion-architecture; typescript-expert; engineering-insights
- constraints: C1
- covers: AC-125, AC-127, AC-130 (передумова), AC-165, EC-20, EC-21
- done-when: T5 зелений.
- depends-on: S8

### S10 — Спільний `toSkillBlock` (без зміни поведінки PR-review)
- package: W5
- files:
  - **modify** `server/src/modules/reviews/helpers.ts`: `export function toSkillBlock(s: {name, body, source}): string` — `manual` повертає тіло як є, інші джерела загортає в `wrapUntrusted('skill:'+name, body)`.
  - **modify** `server/src/modules/reviews/run-executor.ts:513-517`: використати `toSkillBlock`.
- skills: onion-architecture — lane 5; engineering-insights
- constraints: C3, C10, C20
- covers: AC-18 (однакові skill-блоки), AC-20
- reuse: `server/src/modules/reviews/run-executor.ts:501-519`
- done-when: наявні тести `run-executor*`, `skills-review*` (unit) зелені; `arch:check` 0 errors.
- depends-on: S6

### S11 — `llm-params`: фактично надіслана temperature
- package: W5
- files:
  - **create** `server/src/platform/llm-params.ts`: `isReasoningModel(model)` і `sentTemperature(provider, model, requested)`. Для OpenAI reasoning-моделей повертає `null`, інакше `requested`.
  - **modify** `server/src/adapters/llm/openai.ts:23-25`: імпортувати `isReasoningModel` звідти; поведінка не змінюється.
  - **create** `server/test/llm-params.test.ts` (T6).
- skills: onion-architecture — lanes 5/8; engineering-insights
- constraints: C1, C20
- covers: AC-170, NFR-7
- reuse: `server/src/adapters/llm/openai.ts:23-38`
- done-when: T6 і наявні тести адаптерів (`adapters.test.ts`, `llm-http-retries.test.ts`) зелені.
- depends-on: —

### S12 — Seed-фікстури для e2e і демо
- package: W6
- files:
  - **create** `server/src/db/seed-eval.ts`, ідемпотентно:
    - на PR #482 — окремий review з `agentId` = Security Reviewer і `model: 'seed'`;
    - у ньому одна accepted, одна dismissed і одна open знахідка, з іншими title, ніж у наявних;
    - для Performance Reviewer — 3 eval-кейси (`diff_source: 'manual'`, `source_finding_id: null`, обидва типи);
    - 2 suite runs зі статусом `completed`, різними `config.system_prompt`, різною версією, повними метриками і рядками `eval_runs`.
    - Інші агенти без прогонів (AC-163).
  - **modify** `server/src/db/seed.ts`: викликати `seedEval(db, workspaceId)` після `seedAgents`.
- skills: drizzle-orm-patterns — lane 6; engineering-insights
- constraints: C4, C7
- covers: опора для e2e AC-2, AC-4, AC-122, AC-163 (handoff `test-writer`); не підміняє AC-139 (кейси не «from findings»)
- reuse: `server/src/db/seed.ts:159-198`, `:343-383`
- done-when:
  - `pnpm -C server typecheck` і `lint` зелені;
  - imports ведуть лише в `db/*` і `drizzle-orm`;
  - ідемпотентність перевірена кодом (повторний виклик нічого не вставляє — select-before-insert, як у `seed.ts:381-383`).
  - Сід не запускати.
- depends-on: S5

### S13 — `eval/repository.ts`
- package: W8
- files: **create** `server/src/modules/eval/repository.ts`. Реалізує `EvalStore`; кожен метод мапить рядок у доменний тип.
  - **cases:** `listCases(ws, agentId)` з `last_result` (останній `eval_runs` по кейсу) і `source`; `getCase(ws, id)`; `insertCase`, `updateCase` (`updated_at`); `deleteCase`; `countCases`; `findCaseBySourceFinding(agentId, findingId)`.
    - Порушення unique → `AppError('name_taken', …, 409)`.
  - **finding context для draft:** знахідка з review (`agent_id`, `run_id`, `pr_id`), PR (title, body, number, repo full_name), агент (ім'я, чи існує), `run_traces.trace` за `run_id`, `pr_files` patches.
  - **runs:**
    - `createRunWithCases(tx)`: run зі статусом `queued` і рядки `eval_runs` зі статусом `queued` на кожен кейс в одній транзакції. Порушення часткової unique-умови → `AppError('run_active', …, 409, {active_run_id})`;
    - `markRunRunning`, `setCaseRunning`, `saveCaseResult` (зачіпає 0 рядків, якщо кейс видалили), `finishRun` (агрегат, `finished_at`);
    - `getRun`, `listRuns(agentId, since?, limit)`, `activeRun(agentId)`, `recentRuns(ws, 6)`, `agentsOverview(ws)`;
    - `reapActiveRuns()`: переводить `queued`/`running` в `interrupted`, метрики `null`.
  - Workspace-фільтр у кожному запиті (AC-133).
- skills: drizzle-orm-patterns, onion-architecture — lane 6; postgresql-table-design (запити під індекси); security — lane 14 (workspace scoping); engineering-insights
- constraints: C1, C4, C7, C13
- covers: AC-6, AC-11, AC-12, AC-16, AC-48, AC-50, AC-61, AC-63, AC-65, AC-69, AC-73, AC-82, AC-87, AC-88, AC-89, AC-96, AC-105, AC-132, AC-133, AC-135, AC-140, NFR-1, NFR-8
- reuse: `server/src/modules/reviews/repository/review.repo.ts:148,161` (accept/dismiss), шаблон транзакцій `insertReviewWithFindings`
- done-when: `typecheck` і `arch:check` зелені; T12 (it) покриває методи.
- depends-on: S5, S6

### S14 — `EvalService`: draft, CRUD кейсів, overview, compare
- package: W8
- files: **create** `server/src/modules/eval/service.ts` (порти через конструктор):
  - **`getDraft(ws, findingId)`:**
    - помилки: `finding_untriaged` (422), `agent_missing` (422);
    - джерело diff: trace (`diff_source: run_trace`), інакше `pr_files` (`current_pr_files`);
    - якщо hunk не знайдено — `diff_unavailable` (422);
    - `existing_case` — якщо кейс з цієї знахідки вже є.
  - **`createCase` / `updateCase`:** ліміт 200 → 422 `case_limit`; власник береться з path.
  - **`deleteCase`**
  - **`overview(ws)`:** агенти з `latest` і `recall_trend`; 6 останніх прогонів.
  - **`listRuns`, `getRun`**
  - **`compare(ws, a, b)`:** `different_agents` (422), `no_metrics` (422), інакше `compareRuns`.
  - Невідомий або чужий id → `NotFoundError` (404).
- skills: onion-architecture — lane 5; engineering-insights
- constraints: C1, C3, C13
- covers: AC-6, AC-11, AC-12, AC-14, AC-16, AC-48, AC-50, AC-52, AC-63, AC-65, AC-105, AC-125, AC-127, AC-130, AC-133, AC-135, AC-140, AC-165, NFR-3, EC-2, EC-4, EC-9, EC-10, EC-23, EC-26
- reuse: S7, S9
- done-when: T7 (unit на fake `EvalStore`) зелений.
- depends-on: S7, S9, S13

### S15 — Eval-рецензія (фіксовані входи) і `EvalAttemptService`
- package: W8
- files: **create** `server/src/modules/eval/attempt-service.ts`.
  - **`runEvalReview(pinned, case)`** — спільна для attempt і suite run:
    - розбір diff: `parseUnifiedDiff(case.input_diff)`;
    - один виклик `reviewPullRequest` з полями `systemPrompt`, `model`, `strategy`, `skills` (блоки через `toSkillBlock`), `diff`, `prDescription` = «Title: …\n\nBody» (untrusted), `task: EVAL_TASK_LINE`, `temperature: 0`, `timeoutMs: 60_000`, `httpRetries: 0`, `maxRetries: 2`;
    - без `callers`, `repoMap`, `intent`, `specs`, `memory`;
    - зовнішня межа 90 с через `withTimeout` і `{abandoned, deadlineAt}`;
    - мапінг помилок: `ConfigError` → `missing_key`, `withTimeout` → `timeout`, помилка parse/repair → `invalid_output`, інше → `provider_error`;
    - результат: `scoreCase`, `EvalCaseResult`, `request` для config.
  - **`EvalAttemptService`:**
    - Map attempt-ів у пам'яті з TTL;
    - `start(ws, agentId, input)` → `attempt_id` і фоновий запуск з поточною конфігурацією агента;
    - `startForCase(ws, caseId)` (should, AC-67);
    - `get(ws, id)` → `EvalAttempt`, або `AppError('attempt_not_found', 404)`.
  - Нічого не записує в БД.
- skills: onion-architecture; security (untrusted-вміст у prompt); engineering-insights
- constraints: C8, C9, C10, C11, C12
- covers: AC-18, AC-19, AC-20, AC-21, AC-23, AC-39, AC-46, AC-57, AC-67 (server), AC-159 (server 404), AC-161 (reason), AC-167, AC-168, AC-169, AC-170, NFR-4, NFR-5, NFR-7, EC-12, EC-18, EC-27
- reuse: `reviewer-core` `reviewPullRequest`; `server/src/platform/resilience.ts:13` (`withTimeout`); `server/src/platform/errors.ts:43` (`ConfigError`); S10, S11
- done-when: T8 (fixed inputs) і T9 (attempts) зелені.
- depends-on: S10, S11, S13

### S16 — `EvalSuiteRunService` (послідовний executor)
- package: W8
- files: **create** `server/src/modules/eval/suite-run-service.ts`:
  - **`start(ws, agentId)`:**
    - 0 кейсів → `no_cases` (422);
    - конфігурацію знімаємо одразу: агент, версія, provider, model, strategy, system_prompt, skills `{id, version}`, temperature;
    - також на старті знімаємо входи всіх кейсів (тримаємо в пам'яті) і `case_ids`;
    - `createRunWithCases`, далі `202 { run_id }`;
    - при `run_active` — 409 з `active_run_id`.
  - **Фоновий цикл, по одному кейсу (AC-76):**
    - `setCaseRunning` → `runEvalReview` → `saveCaseResult` (findings, dropped з причинами, status/reason, duration, cost; без тексту prompt);
    - помилка кейсу → кейс `error`, цикл іде далі.
  - **Фініш:** `aggregate` → `finishRun`. Автоматичних повторів немає.
  - **`cancel(ws, runId)`** (could): прапорець, який перевіряється перед наступним кейсом; status `cancelled`, метрики `null`. Якщо прогін не активний — `not_running` (409).
  - **`runAll(ws)`** (could): запускає по одному прогону для кожного агента з ≥1 кейсом і без активного прогону.
  - **`reapOnBoot()`** → `reapActiveRuns()`.
  - **Логи:**
    - прогін: `run_id`, `agent_id`, `agent_version`, case count, status, metrics, duration, cost;
    - кейс: `case_id`, status, duration, cost;
    - без вмісту (NFR-14).
- skills: onion-architecture; engineering-insights
- constraints: C7, C8, C9, C10, C11, C12
- covers: AC-72, AC-73, AC-74, AC-75, AC-76, AC-78, AC-79, AC-80, AC-82, AC-87, AC-88, AC-89, AC-90, AC-91, AC-114, AC-161, AC-162, NFR-4, NFR-6, NFR-14, EC-13, EC-14, EC-15, EC-16, EC-17, EC-18
- reuse: S8 (`aggregate`), S15 (`runEvalReview`)
- done-when: T10 зелений.
- depends-on: S15

### S17 — Routes, реєстрація, container, boot-sweep
- package: W8
- files:
  - **create** `server/src/modules/eval/routes.ts` — усі ендпоінти з таблиці *Contracts → Endpoints* спеки, кожен із Zod `params`, `body`, `response`. Статуси: 202 для attempts і runs, 201 для створення кейсу. `getContext` → `workspaceId`. Rate-limit глобальний.
  - **modify** `server/src/modules/index.ts`: `import evalModule from './eval/routes.js'` і запис `eval: evalModule`.
  - **modify** `server/src/platform/container.ts`: мемоізовані `evalRepo`, `evalService()`, `evalAttemptService()`, `evalSuiteRunService()`. Порти: `agentsRepo`, `skillsRepo` (адаптер `forAgentWithVersion`), `llm`, logger.
  - **modify** `server/src/app.ts:70-85`: після `reapStaleRuns` — `await container.evalSuiteRunService().reapOnBoot()` у власному non-fatal `try/catch`.
- skills: fastify-best-practices, onion-architecture — lane 4; security — lane 14; onion-architecture — lane 8 (container); response-schema, breaking-change — lanes 17/18 (нові маршрути, старі не змінюються); engineering-insights
- constraints: C1, C2, C9, C13, C20
- covers: AC-57, AC-72, AC-80, AC-82, AC-87, AC-91, AC-114, AC-128 (server compare), AC-130, AC-133, NFR-6, NFR-8, NFR-15
- reuse: `server/src/modules/agents/routes.ts:83-102` (`getContext`), `server/src/modules/onboarding/routes.ts:30-62` (шаблон 202 + polling)
- done-when: `pnpm -C server lint`, `typecheck`, `arch:check` (0 errors) і unit-тести зелені; T12 покриває маршрути.
- depends-on: S14, S16

### S18 — `verify:l06` і інтеграційні тести
- package: W8
- files:
  - **modify** `server/package.json`: `"verify:l06": "vitest run test/eval-scoring.test.ts test/eval-helpers.test.ts test/eval-fixed-inputs.test.ts test/eval-suite-executor.test.ts test/eval-contract-parity.test.ts test/eval-contracts.test.ts test/contracts.test.ts test/eval.it.test.ts"`
  - **create** `server/test/eval.it.test.ts` (T12): через `app.inject` з `MockLLMProvider`; `dockerAvailable()` gate.
  - **create** `server/test/eval-perf.it.test.ts` (T13, NFR-1): seed 200×50, p95 трьох read-ендпоінтів ≤ 300 мс.
  - **create** `server/test/eval-service.test.ts` (T7), `server/test/eval-fixed-inputs.test.ts` (T8), `server/test/eval-attempts.test.ts` (T9), `server/test/eval-suite-executor.test.ts` (T10).
- skills: fastify-best-practices (rules/testing.md); engineering-insights
- constraints: C21
- covers: AC-137, AC-138 (+ усі integration-AC, див. T12)
- done-when:
  - `pnpm -C server verify:l06` exit 0;
  - локально it-тест може бути `skipped` без Docker — у звіті позначити його як skipped;
  - unit-набір повністю зелений.
- depends-on: S17

### S19 — i18n повідомлення (єдиний власник)
- package: W4
- files:
  - **rewrite** `client/messages/en/eval.json`: переписати namespace повністю, `rg` не знаходить жодного споживача. Секції: `modal`, `casesSection`, `metrics`, `runs`, `overview`, `agentView`, `compare`, `common`, `errors`, `status`. Уся копія зі спеки, разом із реченнями AC-1, AC-4, AC-13, AC-41, AC-43, AC-44, AC-68, AC-70, AC-81, AC-95, AC-99, AC-110, AC-113, AC-115, AC-125, AC-129, AC-149, AC-150, AC-159, AC-163, AC-166, AC-178.
  - Терміни DD-3, DD-4, DD-5: «cases», «Citation accuracy», «Run all evals».
  - **modify** `client/messages/en/prReview.json`: `finding.turnIntoEvalCase`, `finding.evalReasonUntriaged`, `finding.evalReasonAgentMissing`.
  - **modify** `client/messages/en/shell.json`: `nav.evalDashboard` = «Eval Dashboard». Якщо namespace має іншу назву, обрати ту, що вже використовує AppShell.
  - **modify** `client/messages/en/agents.json`: перевірити, що `editor.tabs.evals` є (є, рядок 56).
- skills: next-best-practices, frontend-architecture — lane 11 (i18n); engineering-insights
- constraints: C16
- covers: NFR-16, AC-92, DD-3, DD-4, DD-5
- done-when:
  - JSON валідний;
  - `rg '<[a-z]+>' client/messages/en/eval.json` нічого не знаходить;
  - `pnpm -C client test` зелений.
- depends-on: —

### S20 — Пункт Sidebar «Eval Dashboard»
- package: W4
- files:
  - **modify** `client/src/vendor/ui/nav.ts`:
    - `NavItemDef` отримує опційне `labelKey?: string`;
    - у SKILLS LAB після `conventions` додати `{ key: 'eval', label: 'Eval Dashboard', labelKey: 'nav.evalDashboard', icon: 'Gauge', href: '/eval' }`, без `gKey`.
  - **modify** `client/src/vendor/ui/shell/types.ts`, `Sidebar.tsx`, `NavItem.tsx`: ctx отримує опційний `labelFor?: (key: string, fallback: string) => string`. `NavItem` рендерить `labelFor?.(labelKey, label) ?? label`. Існуючі пункти не змінюються.
  - **modify** `client/src/components/app-shell/AppShell.tsx`: передати `labelFor` через `useTranslations('shell')`.
  - **create** `client/src/components/app-shell/AppShell.test.tsx` (T30).
  - Design: `docs/designs/eval-pipeline/jsx/chrome.jsx:13`.
- skills: react-best-practices, frontend-architecture — lane 10; react-testing-library — lane 12; engineering-insights
- constraints: C15, C16, C18
- covers: AC-100, AC-101 (active key вже є — `client/src/components/app-shell/helpers.ts:36`), NFR-16
- done-when: T30 зелений; `pnpm -C client typecheck` зелений.
- depends-on: S19

### S21 — Перенос `useModalFocus` у shared
- package: W4
- files:
  - **create** `client/src/components/modal-focus/useModalFocus.ts`: перенести як є з `…/PromptBlock/useModalFocus.ts`.
  - **create** `client/src/components/modal-focus/index.ts`.
  - **create** `client/src/components/modal-focus/useModalFocus.test.tsx` (T31).
  - **delete** старий файл; **modify** `…/PromptBlock/PromptBlock.tsx`: оновити імпорт.
- skills: react-best-practices, frontend-architecture — lane 10; react-testing-library; engineering-insights
- constraints: C15, C17
- covers: NFR-9 (основа)
- done-when: T31 і наявні тести `PromptBlock`/`RunTraceDrawer` зелені.
- depends-on: —

### S22 — `lib/hooks/eval.ts`
- package: W7
- files:
  - **create** `client/src/lib/hooks/eval.ts`:
    - запити: `useEvalDraft(findingId, enabled)`, `useEvalCases(agentId)`, `useEvalRuns(agentId, since?)`, `useEvalRun(runId)` (`refetchInterval` 2000, поки `queued`/`running`), `useEvalOverview()`, `useEvalComparison(a, b)`, `useEvalAttempt(attemptId)` (`refetchInterval` 1000, поки `running`);
    - мутації: `useStartEvalAttempt`, `useStartCaseAttempt`, `useCreateEvalCase`, `useUpdateEvalCase`, `useDeleteEvalCase`, `useStartEvalRun`, `useCancelEvalRun`;
    - після успіху мутації кейсу — invalidate `["eval-cases", agentId]`, `["eval-runs", agentId]`, `["eval-overview"]` (AC-136);
    - `useStartEvalRun` при `ApiError` 409 `run_active` повертає `details.active_run_id` (AC-83).
  - **modify** `client/src/lib/hooks/index.ts`: `export * from "./eval"`.
- skills: frontend-architecture — lane 11; react-best-practices (Data Fetching); engineering-insights
- constraints: C14
- covers: AC-57 (клієнт), AC-83, AC-136, NFR-6 (≤ 2 с)
- reuse: `client/src/lib/hooks/conventions.ts:41` (шаблон polling), `client/src/lib/api.ts:8-19`
- done-when: T32 зелений; `typecheck` зелений.
- depends-on: S1

### S23 — Тест хуків
- package: W7
- files: **create** `client/src/lib/hooks/eval.test.tsx` (T32)
- skills: react-testing-library — lane 12; engineering-insights
- constraints: C18
- covers: AC-83, AC-136, NFR-6
- done-when: T32 зелений.
- depends-on: S22

### S24 — Чисті хелпери і стан чернетки EvalCaseModal
- package: W9
- files:
  - **create** `client/src/components/eval-case-modal/helpers.ts`:
    - `contentFingerprint(diff, meta, expectedJson)`;
    - `assertionText(type, exp)`;
    - `parseExpected(text, type, diff)` через `EvalCaseInput.safeParse` → помилки за path (AC-145);
    - `isDirtyVsSeed`.
  - **create** `client/src/components/eval-case-modal/useEvalCaseDraft.ts`:
    - редагована чернетка, `lastRun = {fingerprint, attempt}`;
    - `saveDisabledReason`: «Run the case first» (AC-43), помилки валідації (AC-146), attempt у польоті (AC-148), `attempt_not_found` (AC-160), `diff_unavailable` (AC-144);
    - `outdated` (AC-44);
    - `saving` guard (AC-53).
  - **create** `client/src/components/eval-case-modal/helpers.test.ts` (T33).
- skills: react-best-practices; frontend-architecture — lane 10; engineering-insights
- constraints: C15
- covers: AC-43, AC-44, AC-45, AC-53, AC-144, AC-145, AC-146, AC-148, AC-154, AC-160
- done-when: T33 зелений.
- depends-on: S22

### S25 — EvalCaseModal (UI)
- package: W9
- files:
  - **create** `client/src/components/eval-case-modal/EvalCaseModal/EvalCaseModal.tsx`:
    - вендорений `Modal` плюс `useModalFocus`;
    - title «Eval case · <name>», subtitle з агентом (agent тільки для читання);
    - footer: Cancel, Run case, Save.
  - **create** `…/EvalCaseModal/_components/CaseBanner/CaseBanner.tsx` — банер Positive/Negative з assertion-текстом.
  - **create** `…/EvalCaseModal/_components/InputTabs/InputTabs.tsx`:
    - вкладки Diff і PR meta (Title, Body) — DD-10;
    - textarea з plain text;
    - попередження AC-13 для `current_pr_files`.
  - **create** `…/EvalCaseModal/_components/ExpectedOutputEditor/ExpectedOutputEditor.tsx`:
    - бейдж valid/invalid;
    - помилка біля поля з `aria-describedby`.
  - **create** `…/EvalCaseModal/_components/ResultPanel/ResultPanel.tsx`:
    - «Last run passed/failed», «expected N, got M», секунди, `$` або «—»;
    - список findings з `matched`/`unmatched`/`forbidden hit`, dropped з причинами (AC-42);
    - «Outdated — run again»;
    - помилка з причиною, для `missing_key` — посилання `/settings/api-keys`;
    - «Run interrupted — run again»;
    - прогрес з elapsed seconds;
    - `aria-live="polite"`.
  - **create** `…/EvalCaseModal/_components/DuplicateWarning/DuplicateWarning.tsx` — посилання на `/agents/<id>?tab=evals` (AC-153).
  - **create** `…/EvalCaseModal/_components/DiscardConfirm/DiscardConfirm.tsx` — AC-55.
  - Поведінка:
    - закриття під час attempt — результат відкидається (AC-56);
    - Save → закрити модалку (AC-155);
    - `409 name_taken` → помилка біля Name, чернетка зберігається (AC-157/158);
    - `422` — показати поле з `details`;
    - Cancel нічого не зберігає (AC-54).
  - Режими: `{findingId}` (draft), `{caseId, case}` (редагування, AC-62), `{agentId, manual: true}` (could, AC-71).
  - **create** `…/EvalCaseModal/EvalCaseModal.test.tsx` (T34), `styles.ts`, `index.ts`.
  - Design: `docs/designs/eval-pipeline/screenshots/eval-case-modal.png`, `jsx/screen_cizruns.jsx:56-104`; DD-1 (без Run-on-save), DD-8, DD-9, DD-10, DD-16, DD-17.
- skills: react-best-practices, frontend-architecture — lane 10; react-testing-library — lane 12; security (Markdown лише для rationale через `Markdown` з `@devdigest/ui`); engineering-insights
- constraints: C14, C15, C16, C17, C18
- covers: AC-5, AC-13, AC-36, AC-37, AC-41, AC-42, AC-43, AC-44, AC-45, AC-53, AC-54, AC-55, AC-56, AC-62, AC-71, AC-118 (довгі імена), AC-143, AC-144, AC-145, AC-146, AC-147, AC-148, AC-149, AC-150, AC-153, AC-154, AC-155, AC-157, AC-158, AC-159, AC-160, NFR-9, NFR-10 (клавіатурний шлях у компоненті), NFR-11, NFR-13 (стилі одноколонкового reflow), EC-6, EC-7, EC-8, EC-9, EC-10, EC-11, EC-12
- reuse: `@devdigest/ui` `Modal`, `Tabs`, `Button`, `Markdown`; `client/src/components/modal-focus`; S22, S24
- done-when: T34 зелений; `typecheck` і `lint` зелені.
- depends-on: S21, S24

### S26 — `useEvalCaseLauncher` (причини disabled і відкриття)
- package: W9
- files:
  - **create** `client/src/components/eval-case-modal/useEvalCaseLauncher.ts`:
    - вхід: `reviews: ReviewRecord[]` і `agents: Agent[]`;
    - `reasonFor(f)`: «Accept or dismiss this finding first», якщо немає ні `accepted_at`, ні `dismissed_at` (AC-1); «The agent that produced this finding no longer exists», якщо `review.agent_id` дорівнює `null` або агента немає серед агентів (AC-4); інакше `null`;
    - `open(findingId)` і стан модалки.
  - **create** `useEvalCaseLauncher.test.tsx` (T35).
- skills: react-best-practices; frontend-architecture; engineering-insights
- constraints: C14, C15
- covers: AC-1, AC-2, AC-4, EC-1, EC-3, EC-30
- done-when: T35 зелений.
- depends-on: S25

### S27 — Кнопка «Turn into eval case» у FindingCard і diff-viewer
- package: W9
- files:
  - **modify** `client/src/components/finding-card/FindingCard/FindingCard.tsx`:
    - опційні props `onTurnIntoEvalCase?: () => void` і `evalDisabledReason?: string | null`;
    - кнопка з іконкою `FlaskConical` після Accept і Dismiss у рядку дій;
    - коли вимкнена — `disabled`, `title` і `aria-describedby` з прихованим текстом причини;
    - на muted dismissed-картці кнопка лишається активною;
    - рендериться лише якщо переданий `onTurnIntoEvalCase`.
  - **modify** `FindingCard.test.tsx` (T36).
  - **modify** `client/src/components/diff-viewer/findings.ts`: `DiffFindingApi` отримує опційні `onTurnIntoEvalCase?(findingId)` і `evalDisabledReason?(f)`.
  - **modify** `CodeLine/CodeLine.tsx:117-124`, `OutsideDiffFindings/OutsideDiffFindings.tsx`, `FileCard/FileCard.tsx:170`: прокинути ці поля.
  - Design: `docs/designs/eval-pipeline/screenshots/finding-card-turn-into-eval-case.png`, `jsx/findings.jsx:19-45`; DD-7 (вимкнена для open); кнопки Learn і Reply не додаємо.
- skills: react-best-practices, frontend-architecture — lane 10; react-testing-library; engineering-insights
- constraints: C15, C16, C17, C20
- covers: AC-1, AC-2, AC-3, AC-4
- done-when: T36 і наявні тести `diff-viewer`/`FindingCard`/`smoke` зелені.
- depends-on: S26

### S28 — Підключення на сторінці PR (три місця рендеру)
- package: W9
- files:
  - **modify** `…/pulls/[number]/_components/DiffTab/DiffTab.tsx:47,98-110`: `useEvalCaseLauncher(reviews, agents)` → `findingApi.onTurnIntoEvalCase` і `evalDisabledReason`; рендер `<EvalCaseModal>`.
  - **modify** `…/FindingsPanel/FindingsPanel.tsx:80-90`: те саме для `FindingCard`; `reviews` і `agents` отримати від `ReviewRunAccordion` через props.
  - **modify** `…/ReviewRunAccordion/ReviewRunAccordion.tsx:160`: передати props.
  - **modify** `client/src/test/smoke.test.tsx` та наявні тести `DiffTab`/`FindingsPanel`: додати namespace `eval` у провайдери, де монтується модалка (C16).
- skills: react-best-practices, frontend-architecture — lane 10; react-testing-library; engineering-insights
- constraints: C14, C15, C16
- covers: AC-3 (три місця), AC-5
- reuse: `useAgents` (`client/src/lib/hooks/agents.ts:8`), `usePrReviews`
- done-when: `pnpm -C client test` (усі) і `typecheck` зелені.
- depends-on: S27

### S29 — Evals tab: метрики і нотатки
- package: W10
- files:
  - **create** `client/src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/EvalsTab.tsx` (контейнер), `helpers.ts`, `styles.ts`, `index.ts`.
  - **create** `…/EvalsTab/_components/EvalMetricTiles/EvalMetricTiles.tsx`:
    - плитки Recall, Precision, Citation accuracy (%) і Cases passed (x/y) з останнього `completed|partial` прогону;
    - Δ у пунктах з ▲/▼ і текстом;
    - без попереднього прогону — без Δ;
    - `null` → «—» з tooltip-причиною;
    - без прогонів — «—».
  - **create** `…/EvalsTab/_components/EvalNotes/EvalNotes.tsx` — дві нотатки AC-95 і hint AC-70.
  - **create** `…/EvalsTab/_components/SuiteRunProgress/SuiteRunProgress.tsx`:
    - «k / N cases»;
    - polite-оголошення фінального статусу й метрик без переміщення фокуса.
  - Design: `screenshots/agents-evals-tab.png`, `focus-eval.png`, `jsx/screen_agents.jsx:162-201`; DD-3, DD-4, DD-17.
- skills: react-best-practices, frontend-architecture — lane 10; engineering-insights
- constraints: C14, C15, C16, C17
- covers: AC-70, AC-86, AC-93, AC-95, AC-99, AC-116, AC-151, AC-175, AC-176, AC-177, AC-179, AC-180, NFR-11, NFR-12 (стилі), EC-22, EC-32
- reuse: `@devdigest/ui` `MetricCard`, `Skeleton`, `ErrorState`; S22
- done-when: T37 зелений.
- depends-on: S22

### S30 — Evals tab: секція Eval cases
- package: W10
- files:
  - **create** `…/EvalsTab/_components/EvalCasesSection/EvalCasesSection.tsx`:
    - заголовок: «x / y passing» (кейси з результатом у останньому `completed|partial` прогоні) і «N cases»;
    - empty state AC-68;
    - кнопка «New eval case» (could);
    - «Run all evals»: вимкнена з «Add a case first» при 0 кейсах; вимкнена під час активного прогону; при `409` — стежити за `active_run_id`.
  - **create** `…/EvalCasesSection/_components/EvalCaseRow/EvalCaseRow.tsx`:
    - іконка плюс текст статусу: pass, fail, error, never run; під час прогону — queued і running (AC-85);
    - моно-назва з ellipsis, `title` і `tabIndex`;
    - тег `must find`/`must not flag`;
    - «expected N findings, got M»;
    - бейдж «SEVERITY · category» або «empty []»;
    - провенанс «From finding …» з посиланням на PR (AC-69);
    - рядок відкривається з Enter/Space (`role="button"`);
    - кнопки Run, Edit, Delete з `aria-label`, видимі на `:hover` і `:focus-within`;
    - Run показує результат attempt у рядку (AC-67).
  - **create** `…/EvalCasesSection/_components/DeleteCaseDialog/DeleteCaseDialog.tsx`:
    - називає кейс і повідомляє, що історія кейсу видаляється, а записані метрики лишаються;
    - використовує `useModalFocus`.
  - Інтеграція з `EvalCaseModal` для Edit і New.
  - Design: `jsx/components2.jsx:75-100`, `screenshots/agents-evals-tab.png`; DD-13, DD-14, DD-15.
- skills: react-best-practices, frontend-architecture — lane 10; engineering-insights
- constraints: C14, C15, C16, C17
- covers: AC-60, AC-61, AC-62, AC-64, AC-67, AC-68, AC-69, AC-71, AC-81, AC-83, AC-85, AC-92, AC-118, AC-136, AC-152, AC-156, AC-173, AC-174, NFR-9, NFR-10, EC-13, EC-14, EC-28, EC-29
- reuse: `client/src/components/eval-case-modal`, `client/src/components/modal-focus`, `@devdigest/ui` `Checkbox`/`Button`
- done-when: T38 зелений.
- depends-on: S29

### S31 — Evals tab: секція Runs
- package: W10
- files:
  - **create** `…/EvalsTab/_components/RunsSection/RunsSection.tsx`:
    - 10 останніх прогонів, найновіші першими: ran at, version, recall, precision, citation accuracy, cases passed, cost, status;
    - empty «No runs yet — Run all evals»;
    - посилання «View full dashboard →» на `/eval?agent=<id>`.
  - DD-6.
- skills: react-best-practices, frontend-architecture; engineering-insights
- constraints: C14, C15, C16
- covers: AC-78 (відображення partial), AC-96, AC-97, AC-178
- done-when: T39 зелений.
- depends-on: S29

### S32 — Тести Evals tab
- package: W10
- files: **create** `…/EvalsTab/EvalsTab.test.tsx` (T37), `…/EvalCasesSection/EvalCasesSection.test.tsx` (T38), `…/RunsSection/RunsSection.test.tsx` (T39)
- skills: react-testing-library — lane 12; engineering-insights
- constraints: C18
- covers: див. T37–T39
- done-when: T37–T39 зелені.
- depends-on: S29, S30, S31

### S33 — Вкладка Evals в AgentEditor і `VALID_TABS`
- package: W10
- files:
  - **modify** `…/AgentEditor/constants.ts`: `TABS` отримує `{ key: 'evals', labelKey: 'editor.tabs.evals', icon: 'FlaskConical' }` одразу після `context`.
  - **modify** `…/AgentEditor/AgentEditor.tsx:24-28`: гілка `tab === "evals"` → `<EvalsTab agentId=… />`.
  - **create** `client/src/app/agents/[id]/constants.ts`: `export const VALID_TABS = ["config", "skills", "context", "evals"]`.
  - **modify** `client/src/app/agents/[id]/page.tsx:15`: імпортувати `VALID_TABS` замість локального.
  - **create** `client/src/app/agents/[id]/constants.test.ts` (T40): кожен `TABS.key` присутній у `VALID_TABS`.
  - **modify** `AgentEditor.test.tsx`: додати namespace `eval` у провайдер.
- skills: next-best-practices, frontend-architecture — lane 9; react-best-practices — lane 10; react-testing-library; engineering-insights
- constraints: C15, C16
- covers: AC-59
- done-when: T40, наявні тести `AgentEditor` і `typecheck` зелені.
- depends-on: S32

### S34 — Сторінка `/eval`: маршрут, стан URL, overview
- package: W11
- files:
  - **create** `client/src/app/eval/page.tsx`: тонка, `metadata` «Eval Dashboard — DevDigest», `<EvalDashboardView/>` у `<Suspense>` (бо `useSearchParams`).
  - **create** `client/src/app/eval/_components/EvalDashboardView/EvalDashboardView.tsx`:
    - `AppShell` з crumb «Skills Lab › Eval Dashboard»;
    - `useDashboardUrl.ts`: `?agent=`, `compare=`;
    - невідомий агент → overview з «Agent not found».
  - **create** `…/_components/OverviewView/OverviewView.tsx`:
    - заголовок і підзаголовок AC-102;
    - секція AGENTS;
    - empty state з поясненням і посиланням на `/agents`.
  - **create** `…/_components/AgentEvalCard/AgentEvalCard.tsx`:
    - назва, бейдж моделі;
    - «Last run v… · дата · x/y pass» або «No eval runs yet»;
    - `Sparkline` recall, три % і chevron;
    - уся картка — посилання або кнопка на `?agent=`.
  - **create** `…/_components/RecentRunsFeed/RecentRunsFeed.tsx`:
    - 6 рядків: агент, дата, версія, три `BarRow` з %, x/y pass;
    - рядки клавіатурно-операбельні.
  - **create** `helpers.ts` (формати %, Δ у пунктах, null-причини), `styles.ts`, `index.ts`.
  - Перед `typecheck` — `pnpm -C client exec next typegen`.
  - Design: `screenshots/eval-dashboard-overview.png`, `jsx/screen_skills.jsx:284-477`; DD-3, DD-4, DD-11, DD-13.
- skills: next-best-practices, frontend-architecture — lane 9; react-best-practices — lane 10; engineering-insights
- constraints: C14, C15, C16, C17
- covers: AC-101, AC-102, AC-103, AC-104, AC-110, AC-115, AC-116, AC-118, AC-179, AC-180, NFR-13 (стилі), EC-34
- reuse: `@devdigest/ui` `Sparkline`, `BarRow`, `Skeleton`, `ErrorState`, `Badge`; `client/src/app/conventions/page.tsx` (шаблон)
- done-when: T41 і T42 зелені; `typecheck` зелений.
- depends-on: S22

### S35 — Agent view
- package: W11
- files:
  - **create** `…/_components/AgentView/AgentView.tsx`:
    - «‹ All agents», назва з бейджем моделі, «Regression harness · N runs on M cases»;
    - `Dropdown` агента: зміна оновлює `?agent=`;
    - «Run all evals»: disabled під час активного прогону, «k / N cases», polite announce;
    - empty «No eval runs for <agent> yet» з «Run all evals»; жодних даних іншого агента.
  - **create** `…/_components/AgentMetricCards/AgentMetricCards.tsx`: 3 `MetricCard` з %, Δ у пунктах (без Δ при 1 прогоні) і sparkline.
  - **create** `…/_components/MetricTrendChart/MetricTrendChart.tsx` (should): `LineChart`, точка на кожен завершений прогін, tooltip з версією і cost.
  - **create** `…/_components/RangeFilter/RangeFilter.tsx` (should): «30 days» → `since`, «All».
  - **create** `…/_components/RegressionAlert/RegressionAlert.tsx` (should): лише обчислений текст «Precision −5 pts on v7 vs v6», коли падіння ≥ 5 пунктів.
  - **create** `…/_components/RecentRunsTable/RecentRunsTable.tsx`:
    - колонки: checkbox, ran at, version, recall, precision, citation (`BarRow` з %), x/y, cost, status;
    - заголовок «Select two runs to compare» / «N selected»; Compare активний лише при рівно двох;
    - третій вибір знімає найраніше вибраний;
    - checkbox для `failed`/`interrupted`/`cancelled`/`queued`/`running` — disabled із «No metrics for this run»;
    - Cancel (could) для активного прогону; «Run all agents» (could) в overview.
  - Design: `screenshots/eval-dashboard-agent.png`; DD-5, DD-11, DD-12, DD-13.
- skills: react-best-practices, frontend-architecture — lane 10; engineering-insights
- constraints: C14, C15, C16, C17
- covers: AC-86, AC-91 (UI), AC-92, AC-106, AC-107, AC-108, AC-111, AC-112, AC-113, AC-114 (UI), AC-116, AC-119, AC-120, AC-121, AC-151, AC-152, AC-163, AC-164, AC-175, AC-176, NFR-10, NFR-11, NFR-12 (стилі), EC-22, EC-33
- reuse: `@devdigest/ui` `MetricCard`, `LineChart`, `Checkbox`, `Dropdown`; S22
- done-when: T43 зелений.
- depends-on: S34

### S36 — Compare modal
- package: W11
- files:
  - **create** `…/_components/CompareRunsModal/CompareRunsModal.tsx`:
    - `Modal` з `useModalFocus`, фокус повертається на Compare;
    - заголовок «Compare runs · v<older> → v<newer>», підзаголовок AC-122;
    - плитки Recall, Precision, Citation accuracy, Cost: old → new, ▲/▼ у пунктах або USD;
    - word-level «System prompt diff» з легендою old/new як текст;
    - «Identical configuration — …»;
    - банер «Case sets differ: +N added, −M removed»;
    - таблиця flips;
    - footer лише з Close (DD-2);
    - deep-link `compare=a,b` відкриває модалку; невідомий id або run без метрик → agent view з «Run not available for comparison».
  - **create** `…/CompareRunsModal/helpers.ts`: `wordDiff(old, new)` (LCS за словами); `orderByStart`.
  - Design: `screenshots/eval-compare-runs-modal.png`, `jsx/screen_skills.jsx:284-477`; DD-2, DD-4.
- skills: react-best-practices, frontend-architecture — lane 10; engineering-insights
- constraints: C15, C16, C17
- covers: AC-122, AC-123, AC-124, AC-125, AC-128, AC-129, AC-131, AC-166, NFR-9, NFR-13 (стилі), EC-20, EC-21, EC-34
- reuse: LCS-підхід `client/src/app/skills/_components/SkillsView/_components/SkillEditor/_components/VersionsTab/helpers.ts:13`
- done-when: T44 і T45 зелені.
- depends-on: S35

### S37 — Тести дашборду
- package: W11
- files: **create** `…/EvalDashboardView/EvalDashboardView.test.tsx` (T41, T42), `…/AgentView/AgentView.test.tsx` (T43), `…/CompareRunsModal/CompareRunsModal.test.tsx` (T44), `…/CompareRunsModal/helpers.test.ts` (T45)
- skills: react-testing-library — lane 12; engineering-insights
- constraints: C18
- covers: див. T41–T45
- done-when: T41–T45 зелені; `pnpm -C client test`, `typecheck` і `lint` зелені.
- depends-on: S34, S35, S36

### Delivery (не кроки implementer-а; виконує користувач після `/run-plan`)
- **D1** — `pnpm -C server db:migrate`, потім за бажанням `pnpm -C server db:seed`. Без міграції eval-ендпоінти повертають `relation … does not exist`.
- **D2 (AC-139)** — triage знахідок на реальних PR, потім ≥ 8 кейсів через «Turn into eval case» в агента для домашки (не Performance Reviewer), обидва типи.
- **D3 (AC-141)** — два «Run all evals» з різними system prompt, потім Compare: Δ recall або precision ≠ 0. Зробити скріншот модалки.
- **D4 (AC-142)** — prompt «flag every changed line», прогін, перевірити, що precision нижча за baseline.
- **D5 (NFR-12, NFR-13)** — контраст у темній і світлій темах; 320 px і 200 % zoom на модалці, compare і двох видах дашборду.
- **D6** — `pnpm -C server verify:l06` з увімкненим Docker (it-тест не повинен бути skipped). Відео для здачі.

## Test plan
- **Нові й змінені тести:** T1–T13 у `server/test/**`; T3 у `reviewer-core/test/`; T30–T45 у `client/**`. Кожен T# пише implementer у кроці, вказаному в рядку.

**Server**

- **T1** → `server/test/eval-contracts.test.ts` — unit — S2
  - AC-7: expectation має `file`, `start_line`, `end_line`, а severity, category, title можуть бути `null`.
  - AC-52, AC-145, EC-6, EC-7: `safeParse` повертає помилку за path для:
    - невалідного JSON-рядка (проходить на рівні клієнта, див. T33);
    - порожнього `must_find`;
    - `end_line < start_line`;
    - файлу не з фрагмента;
    - рядків поза hunk.
  - NFR-3, EC-26: name 121 символ → помилка; diff 65 537 байт → помилка; 21 expectation → помилка; невідомий ключ → помилка.
  - AC-140: `EvalCaseInput` приймає `source_finding_id`.
- **T2** → `server/test/eval-contract-parity.test.ts` — unit — S2
  - AC-134, NFR-15: три копії `knowledge.ts` і дві копії `eval-ci.ts` побайтово однакові.
- **T3** → `reviewer-core/test/eval-support.test.ts` — unit — S3, S4
  - AC-11: `unwrapUntrusted` проходить round-trip з `</untrusted>` у вмісті.
  - AC-10, AC-26: `isFullFileKind('secret_leak')` → true, `'bug'` → false.
  - AC-169, NFR-5: stub-провайдер отримує `temperature: 0`, `timeoutMs: 60000`, `httpRetries: 0`.
  - AC-170: `outcome.request` дорівнює надісланому.
  - C20: без нових полів запит без змін.
- **T4** → `server/test/eval-scoring.test.ts` — unit — S8
  - AC-25: є збіг при тому самому файлі й перетині 10-12 і 12-15; немає збігу при 10-11 і 12-13 або при іншому файлі.
  - AC-26, EC-5: `secret_leak` на іншому рядку того ж файлу → matched.
  - AC-27: 2 expectation, знайдено 1 → fail; знайдено обидва → pass.
  - AC-28: перетин із забороненим діапазоном → fail; finding поза діапазоном → pass.
  - AC-29: recall = 3/4.
  - AC-30, EC-31: precision = 2/5 при 3 непозначених findings.
  - AC-31, EC-25: citation = kept/(kept+dropped).
  - AC-32: кількість пройдених кейсів.
  - AC-33, EC-19: 0 must_find → recall `null`; 0 findings → precision і citation `null`.
  - AC-171: кейс з error ніколи не pass.
  - AC-172: error-кейс не впливає на жодну метрику.
  - AC-78, AC-79, EC-17: 1 з 3 error → `partial`, `cases_errored=1`; усі error → `failed`, метрики `null`.
  - AC-90: усі cost `null` → `null`, а не 0.
  - AC-34, AC-138, NFR-4: у spy-`MockLLMProvider` 0 викликів `completeStructured` під час `scoreCase` і `aggregate`.
  - NFR-2: 200 кейсів < 100 мс.
- **T5** → `server/test/eval-helpers.test.ts` — unit — S7, S9
  - AC-8: `must-find-hardcoded-stripe-secret-key`, `no-…`, довжина ≤ 120.
  - AC-6, EC-2: accepted → `must_find`, dismissed → `must_not_flag`, open → `null`.
  - AC-9: фрагмент містить лише hunk-и, що перетинаються, з заголовками; номери рядків нової сторони збігаються з вихідним diff.
  - AC-10: для full-file kind — усі hunk-и файлу.
  - AC-11: `diffFromTrace` повертає diff з `prompt_assembly.user`.
  - AC-12: `null`, якщо трейс без diff.
  - AC-14: немає перетину → `null`.
  - AC-127, AC-165, EC-20: є added і removed; flip `pass→fail`; кейс, якого немає в одному з прогонів, — `absent`.
  - AC-125, EC-21: однакова config → `identical_config: true`.
- **T6** → `server/test/llm-params.test.ts` — unit — S11
  - AC-170, NFR-7: для `gpt-5` sent temperature = `null`; для `deepseek/…` = 0.
- **T7** → `server/test/eval-service.test.ts` — unit (fake store) — S14
  - AC-6: draft має owner, type, name, meta, fragment і `source_finding_id`.
  - AC-11 і AC-12, EC-4: при трейсі — `diff_source: run_trace`; без трейсу — `current_pr_files`.
  - AC-14: `diff_unavailable` (422).
  - AC-16, EC-10: `existing_case: {id, name}`.
  - AC-130: різні агенти → `different_agents`.
  - AC-133: чужий workspace → 404.
  - NFR-3: 201-й кейс → 422.
- **T8** → `server/test/eval-fixed-inputs.test.ts` — unit — S15
  - AC-18: stub бачить лише system, skills, task і untrusted-секції `diff` та `pr-description`.
  - AC-19: у повідомленнях немає секцій `repo_map`, `callers`, `intent`, `specs`, `memory`.
  - AC-20: title PR усередині `<untrusted source="pr-description">`, а не в task; `INJECTION_GUARD` присутній.
  - AC-21, NFR-4: 1 виклик `reviewPullRequest` на кейс.
  - AC-23, NFR-5: fake timers; без відповіді 90 с → `error/timeout`; пізня відповідь не перезаписує стан.
  - AC-46, EC-12: `ConfigError` → `missing_key`; provider throw → `provider_error`; невдала спроба repair → `invalid_output`.
  - AC-169, AC-170, NFR-7: config записує `temperature: 0` і model id агента, а не модель з feature-model.
  - AC-167, AC-168: fake-store без методів review/finding/agent_run/markReviewed; виклики шпигуна = 0.
- **T9** → `server/test/eval-attempts.test.ts` — unit — S15
  - AC-57: `start` повертає `attempt_id`; `get` повертає спершу `running`, потім `done` з result.
  - AC-39: нічого не записано в store.
  - AC-159, EC-18: невідомий id → 404 `attempt_not_found`.
  - AC-67: `startForCase` використовує збережений кейс.
- **T10** → `server/test/eval-suite-executor.test.ts` — unit — S16
  - AC-76: кейси обробляються строго послідовно; наступний не починається до кінця попереднього.
  - AC-74, EC-15: редагування агента після старту не змінює prompt у stub.
  - AC-75, EC-16: доданий кейс не запускається, видалений — запускається з знімка.
  - AC-161: error-кейс із reason; AC-162: наступний кейс виконується.
  - AC-88: збережений результат містить findings, dropped з reason, status, duration і cost, але не містить system prompt і diff.
  - AC-91: cancel після кейсу 1 → `cancelled`, кейс 2 не стартує.
  - AC-114: run-all пропускає агентів без кейсів і з активним прогоном.
  - NFR-4: після failure повтору немає.
  - NFR-14: лог-шпигун має `run_id`, `agent_version`, metrics, cost; не має diff, body, prompt, expected, raw.
- **T12** → `server/test/eval.it.test.ts` — integration (`app.inject`, Postgres) — S18
  - AC-6: `GET /findings/:id/eval-draft` → 200 (accepted → `must_find`).
  - AC-11 і AC-12: з seeded `run_traces` → `run_trace`; без трейсу → `current_pr_files`.
  - AC-14: 422 `diff_unavailable`.
  - AC-16: другий draft має `existing_case`.
  - AC-48 і AC-140: `POST /agents/:id/eval-cases` → 201; з accepted і з dismissed — відповідні типи й `source_finding_id`.
  - AC-50, EC-9: дубль імені → 409 `name_taken`.
  - AC-52: невалідний діапазон → 422 з path.
  - AC-63: PUT оновлює той самий id.
  - AC-65, AC-89, EC-23: DELETE кейсу видаляє рядки `eval_runs` і лишає метрики прогону незмінними.
  - AC-72: `POST eval-runs` → 202 з `run_id`.
  - AC-73: run.config має версію, provider, model, strategy, prompt і skills `{id, version}`.
  - AC-80: 0 кейсів → 422 `no_cases`.
  - AC-82, EC-14: два паралельні POST → один 202 і один 409 з `active_run_id`.
  - AC-87, EC-18: рядок `running` після `buildApp` стає `interrupted` з `null`-метриками.
  - AC-105: overview має ≤ 6 recent, найновіші першими.
  - AC-130: compare двох агентів → 422 `different_agents`.
  - AC-132, EC-24: DELETE агента прибирає кейси й прогони.
  - AC-133: id з іншого workspace → 404 на кожному ендпоінті.
  - AC-135, EC-2: re-triage знахідки після save не змінює кейс.
  - AC-165, AC-127: compare повертає `case_set` і `flips`.
  - AC-167, AC-168: після attempt і run кількість рядків `reviews`, `findings`, `agent_runs` не змінилась; `last_reviewed_sha` той самий.
  - AC-91: cancel → `cancelled`.
  - AC-114: run-all.
  - AC-161, AC-162: при `missing_key` (без override LLM) кейси `error`, прогін `failed`.
  - NFR-3: 409 при другому активному прогоні; 422 за лімітами.
  - NFR-6: прогін завершується, рядок незмінний.
  - NFR-8: workspace-scope.
  - NFR-15: `GET /agents` і accept/dismiss мають ту саму форму.
  - AC-137: «one DB integration test».
- **T13** → `server/test/eval-perf.it.test.ts` — integration — S18
  - NFR-1: 200 кейсів × 50 прогонів; p95 (20 запитів) для `GET eval-cases`, `GET eval-runs`, `GET /eval/overview` ≤ 300 мс.

**Client**

- **T30** → `client/src/components/app-shell/AppShell.test.tsx` — component — S20
  - AC-100: «Eval Dashboard» з іконкою Gauge стоїть одразу після Conventions і не має shortcut.
  - AC-101: на `/eval` пункт active (`activeKeyFor`).
  - NFR-16: label береться з messages.
- **T31** → `client/src/components/modal-focus/useModalFocus.test.tsx` — hook — S21
  - NFR-9: фокус всередині; Tab циклічний; Escape → `onClose`; фокус повертається на тригер.
- **T32** → `client/src/lib/hooks/eval.test.tsx` — hook — S23
  - NFR-6: `refetchInterval` = 2000 при running і `false` після.
  - AC-136: мутація invalidate-ить три ключі.
  - AC-83: 409 повертає `active_run_id`.
- **T33** → `client/src/components/eval-case-modal/helpers.test.ts` — unit — S24
  - AC-145 (невалідний JSON → помилка біля поля), AC-146.
  - AC-43: Save disabled «Run the case first».
  - AC-44: зміна fingerprint → outdated.
  - AC-45: fail-результат → Save enabled.
  - AC-148: Save disabled під час attempt.
  - AC-160: Save disabled після `attempt_not_found`.
  - AC-154: `existing_case` не блокує Save.
  - AC-53: другий save ігнорується.
- **T34** → `…/EvalCaseModal/EvalCaseModal.test.tsx` — component — S25
  - AC-36: title, subtitle, banner «MUST find '…' at file:range», Name, вкладки Diff/PR meta, бейдж, footer.
  - AC-37: агент як текст, не input.
  - AC-5: відкриття не робить POST `eval-cases`.
  - AC-13: попередження для `current_pr_files`.
  - AC-143 і AC-144: показано reason з `diff_unavailable`, Run і Save disabled.
  - AC-147 і NFR-11: прогрес з секундами (fake timers) у `role=status`.
  - AC-41: «Last run passed · expected 1, got 1», секунди, «—» при `cost=null`.
  - AC-42: позначки matched, unmatched, forbidden hit і dropped з reason.
  - AC-149 і AC-150: reason показано; при `missing_key` — посилання `/settings/api-keys`.
  - AC-159: «Run interrupted — run again».
  - AC-56: закриття під час attempt → результат не показано, і він не застосовується після повторного відкриття.
  - AC-155: після 201 модалка закрилась.
  - AC-157 і AC-158: 409 → помилка біля Name, значення полів не змінились.
  - AC-153: попередження з посиланням на кейс.
  - AC-54: Cancel → 0 POST/PUT.
  - AC-55: зміна контенту плюс Cancel → підтвердження.
  - AC-62: режим редагування робить PUT.
  - AC-71: ручний режим з `diff_source: manual`.
  - AC-118: довга назва має `title` і focusable.
  - NFR-9: Escape закриває модалку, фокус на тригері.
  - NFR-10 (компонентний рівень): клавіатурний ланцюжок Tab → Run → Save без миші.
- **T35** → `…/eval-case-modal/useEvalCaseLauncher.test.tsx` — hook — S26
  - AC-1, EC-1: open-знахідка → «Accept or dismiss this finding first».
  - AC-2, EC-30: accepted або dismissed → `null`.
  - AC-4, EC-3: `agent_id: null` або видалений агент → «The agent that produced this finding no longer exists».
- **T36** → `client/src/components/finding-card/FindingCard/FindingCard.test.tsx` — component — S27
  - AC-3: кнопка з FlaskConical стоїть після Accept і Dismiss.
  - AC-1: disabled, з `title` і доступним описом (`toHaveAccessibleDescription`).
  - AC-2: на dismissed (muted) картці кнопка enabled, клік викликає `onTurnIntoEvalCase`.
  - AC-4: показано reason про відсутній агент.
  - Без callback кнопки немає (C20).
- **T37** → `…/EvalsTab/EvalsTab.test.tsx` — component — S32
  - AC-93: чотири плитки з даних останнього `partial`.
  - AC-175: Δ «▲ 5 pts».
  - AC-176: один прогін → без Δ.
  - AC-177: без прогонів → «—».
  - AC-99: `null` → «—» з tooltip «no must-find cases» / «no findings».
  - AC-95: обидві нотатки.
  - AC-70, EC-32: 3 кейси → hint «Small or one-sided set — metrics are noisy».
  - AC-116: skeleton під час завантаження.
  - AC-179: помилка з Retry.
  - AC-180: дані лишаються після невдалого refetch.
  - AC-151: «2 / 5 cases».
  - AC-86 і NFR-11: фінальний статус у `role=status`, фокус не змінився.
- **T38** → `…/EvalCasesSection/EvalCasesSection.test.tsx` — component — S32
  - AC-60: рядок має іконку і текст «never run», моно-назву, тег, «expected N findings, got M», бейдж «WARNING · perf» або «empty []».
  - AC-61: «2 / 3 passing · 3 cases».
  - AC-62: клік по рядку відкриває модалку в режимі edit.
  - AC-173: Enter і Space відкривають.
  - AC-174: Run, Edit, Delete — кнопки з `aria-label`; focus-within показує їх (computed style).
  - AC-64: діалог називає кейс і містить текст про історію й метрики.
  - AC-67: Run показує результат у рядку.
  - AC-68: empty-текст.
  - AC-69: провенанс з посиланням на PR.
  - AC-81, EC-13: «Run all evals» disabled з «Add a case first».
  - AC-152: disabled під час активного прогону.
  - AC-83, EC-14: 409 → показано прогрес активного прогону.
  - AC-85: статуси queued/running/pass по рядках.
  - AC-92: label «Run all evals».
  - AC-118, EC-29: ellipsis з `title` і focusable.
  - AC-136, EC-28: після delete — refetch списку.
  - AC-156: новий кейс зі статусом «never run».
  - AC-71: «New eval case» відкриває порожню модалку.
  - NFR-9: Delete-діалог тримає фокус.
- **T39** → `…/RunsSection/RunsSection.test.tsx` — component — S32
  - AC-96: ≤ 10 рядків, найновіші першими, усі колонки.
  - AC-78: статус «partial» видно.
  - AC-97: посилання веде на `/eval?agent=a1`.
  - AC-178: «No runs yet — Run all evals».
- **T40** → `client/src/app/agents/[id]/constants.test.ts` — unit — S33
  - AC-59: `evals` є в `TABS` після `context` і в `VALID_TABS`.
- **T41** → `…/EvalDashboardView/EvalDashboardView.test.tsx` (overview) — component — S37
  - AC-101: crumb «Skills Lab › Eval Dashboard».
  - AC-102: heading, subtitle і дві секції.
  - AC-103: картка має модель, «Last run v3 · … · 2/3 pass» або «No eval runs yet», sparkline і три %.
  - AC-104: клік або Enter по картці чи рядку змінює URL на `?agent=`.
  - AC-105 (UI): 6 рядків з bar-ами і %.
  - AC-115, EC-34: `?agent=zzz` → overview з «Agent not found».
  - AC-116: skeleton.
  - AC-118: ellipsis.
  - AC-179, AC-180: помилка з Retry, дані лишаються.
- **T42** → той самий файл — component — S37
  - AC-110: без агентів, або коли жоден агент не має прогону → empty-текст з причиною і посиланням `/agents`.
  - e2e-варіант — handoff.
- **T43** → `…/AgentView/AgentView.test.tsx` — component — S37
  - AC-106: «‹ All agents», бейдж, «Regression harness · 2 runs on 3 cases», dropdown, «Run all evals», три MetricCards з Δ, таблиця.
  - AC-107: колонки й checkbox.
  - AC-108: вибір у dropdown змінює `?agent=`.
  - AC-111: «30 days» → запит із `since`.
  - AC-112: точки графіка з tooltip «v3 · $0.01».
  - AC-113: обчислений текст «Precision −5 pts on v7 vs v6»; при −4 — відсутній.
  - AC-119: «Select two runs to compare» → «2 selected», Compare enabled лише при двох.
  - AC-120: третій checkbox знімає перший вибраний.
  - AC-121, EC-33: `failed` → disabled з «No metrics for this run».
  - AC-151, AC-152: прогрес і disabled.
  - AC-163: «No eval runs for X yet» плюс кнопка «Run all evals».
  - AC-164: немає чисел, рядків чи графіка іншого агента.
  - AC-175, AC-176: Δ і її відсутність.
  - AC-86: announce.
  - AC-91: Cancel видно для running.
  - AC-114: «Run all agents».
  - NFR-10: checkbox через Space, потім Compare з клавіатури.
- **T44** → `…/CompareRunsModal/CompareRunsModal.test.tsx` — component — S37
  - AC-122: заголовок «Compare runs · v2 → v3» з порядком за `started_at`, підзаголовок.
  - AC-123: 4 плитки old → new з ▲/▼ (у пунктах і USD).
  - AC-124: diff показує вставки й видалення слів та легенду.
  - AC-125: банер identical.
  - AC-166: «Case sets differ: +1 added, −1 removed».
  - AC-128: deep-link `compare=` відкриває модалку.
  - AC-129: невідомий id → без модалки, з «Run not available for comparison».
  - AC-131 і NFR-9: Close або Escape → фокус на Compare.
- **T45** → `…/CompareRunsModal/helpers.test.ts` — unit — S37
  - AC-124: `wordDiff` повертає мінімальні add/remove для двох prompt.

**Ручні перевірки:** AC-139, AC-141, AC-142, NFR-12, NFR-13 → *Delivery* D2–D5.

**e2e (handoff для test-writer, поза `/run-plan`):**
- AC-1, AC-2, AC-5, AC-54 — journey 1, на seed з S12;
- AC-163, AC-122 — journey 2, Performance Reviewer має seeded прогони;
- AC-110 — див. *Risks*;
- NFR-10 — повний клавіатурний шлях.
Компонентні тести T34–T36, T38, T41–T44 покривають ці AC на рівні компонентів.

**Команди:**
- `pnpm -C server lint && pnpm -C server typecheck && pnpm -C server arch:check && pnpm -C server exec vitest run --exclude '**/*.it.test.ts'`
- `pnpm -C server verify:l06`
- `pnpm -C client exec next typegen && pnpm -C client lint && pnpm -C client typecheck && pnpm -C client test`
- `npm --prefix reviewer-core run typecheck && npm --prefix reviewer-core test`
- `pnpm -C mcp-server typecheck && pnpm -C mcp-server test`
- `./scripts/check-shared-sync.sh`
- Integration (`*.it.test.ts`) implementer не запускає. Їх ганяє CI (`server-integration.yml`) або користувач з Docker.

**Multi-agent:** implementer-и запускають цільові тести і typecheck своїх пакетів. Повна таблиця перевірок запускається один раз на хвилю в main session.

## Risks & open questions
- **e2e AC-110** — не можна перевірити на одному seed разом з AC-122. Seed S12 містить прогони, тому overview не порожній. AC-110 покриває T42. `test-writer` має перевірити e2e на окремому порожньому стеку або задокументувати прогалину. Спеку не змінюємо (рішення користувача). — for: user / test-writer
- **Docker skip:** `eval.it.test.ts` і `eval-perf.it.test.ts` пропускаються без Docker (`server/test/helpers/pg.ts:10-11`). Тоді `verify:l06` зелений, хоча міграцію не перевірено. Здавати треба з запущеним Docker (D6). — for: user
- **Міграція вручну:** до `pnpm db:migrate` eval-маршрути падають з `relation … does not exist`, а boot-sweep пише warning (non-fatal). Те саме для `db:seed`. — for: user
- **Дзеркало mcp-server:** `knowledge.ts` змінюється і в mcp-server. Lane 21 і `pnpm -C mcp-server typecheck/test` входять у перевірки хвилі 1. Опис implementer-а не згадує mcp-server, але тут лише копія файлу. — for: user
- **`server/test/**` не typecheck-ується** (`server/INSIGHTS.md:63`): fake-порти в T7–T10 можуть розійтися з `types.ts`. Їх ловить лише запуск тестів. — for: implementer
- **`superRefine` у контракті:** зміна `EvalCaseInput` з `.object` на refined-схему змінює спосіб композиції (`.omit`/`.extend` на refined-об'єкті недоступні). Базу і refined-версію треба тримати окремими константами: `EvalCaseInputBase` і `EvalCaseInput`. (inference) — for: implementer
- **Детермінізм:** deepseek-v4-flash може ігнорувати temperature (RQ2, Q-2 спеки). Через це AC-141/142 можуть показати шум; два прогони однієї версії — це перевірка шуму. — for: researcher (Q-2)
- **Q-4 спеки:** чи завжди `run_traces` містить блок `diff`, на живих даних не перевірено. Fallback AC-12 покриває випадок, коли блоку немає. — for: researcher
- **Attempts у пам'яті:** розраховано на один інстанс API (`server/src/app.ts:70-85`); після рестарту → AC-159.
- **Rate limit:** 120/хв на IP. Одночасний polling attempt, run і overview — це ≈ 90/хв в одній вкладці. Дві відкриті вкладки можуть отримати 429. Polling стоїть лише на активних об'єктах. (inference) — for: user
- **Вартість:** число паралельних attempts спека не обмежує (лише один suite run на агента). Передати security-reviewer. — for: user
- **`next typegen`:** нова тека `app/eval` дасть локальну помилку typecheck через застарілий `.next` (`client/INSIGHTS.md:49`).

## Review handoff
- **Architecture:**
  - `modules/eval/*`: порти в `types.ts`; сервіси приймають порти, не `Container`; мемоізація в `container.ts`; boot-sweep в `app.ts`;
  - `helpers.ts` імпортує `adapters/git/diff-parser` (MEDIUM, прецедент — `reviews/diff-loader.ts:3`);
  - `reviews/helpers.ts#toSkillBlock` як спільний helper;
  - `platform/llm-params.ts`;
  - патч вендореного `vendor/ui/nav.ts` і `shell/*`;
  - перенос `useModalFocus` у `components/modal-focus`;
  - `components/eval-case-modal` як shared між двома route-деревами;
  - `superRefine` з парсером у ring 0.
- **Security:**
  - workspace-scope на всіх 15 ендпоінтах (AC-133);
  - untrusted diff і title/body PR у prompt (`EVAL_TASK_LINE` без title);
  - відсутність контенту в логах (NFR-14);
  - Markdown лише для rationale;
  - валідація expectations і ліміти (A08);
  - зловживання вартістю: один активний прогін на агента, attempts без ліміту;
  - `run_active` details розкриває лише id;
  - jsonb `config` зберігає system prompt, повертається в `GET /eval-runs/:id`, але не в summary.
- **API compatibility:**
  - нові маршрути з таблиці спеки;
  - змінені експорти контрактів `EvalCaseInput`, `EvalCase`, `EvalRun` (метрики nullable); `EvalRunRecord`/`EvalRunResult`/`EvalDashboard` позначені `@deprecated` і залишені;
  - `PluginEvalCase` і `FindingRecord`/`ReviewRecord` без змін;
  - `reviewer-core` `ReviewInput`/`ReviewOutcome` — лише нові опційні або додаткові поля.
  - Lanes 17–20: breaking-change, response-schema, semver-discipline, deprecation-policy.
- **Tests:** e2e-флоу для AC-1, AC-2, AC-5, AC-54, AC-110, AC-122, AC-163, NFR-10 — `test-writer` на seed з S12 (`e2e/specs/10-eval-*.flow.json`, оновити `e2e/specs/coverage.md`).
- **Docs** (`doc-writer` після верифікації):
  - `server/docs/api-contracts.md` (ендпоінти eval);
  - `server/docs/architecture.md` (модуль eval, executor, boot-sweep);
  - `client/docs/ui-architecture.md` (`/eval`, вкладка Evals, `components/eval-case-modal`, `modal-focus`);
  - `server/specs/` і `client/specs/pages.md` (реалізовані гарантії);
  - `reviewer-core/README.md` (нові експорти);
  - реєстр `docs/specs/README.md` (status → implemented).
- **Manual verification:**
  - polling у видимій вкладці (`client/INSIGHTS.md:51`);
  - elapsed-лічильник модалки;
  - hover і focus-within для дій рядків (jsdom не бачить `:hover`);
  - reflow 320 px і 200 %;
  - контраст (D5).
  - Жодних DOM-вимірювань чи sticky-елементів план не додає.

## Not found / gaps
- Окремий тест contract-parity у репо — searched: `rg -n "parity" server/test` — result: нічого (є лише `scripts/check-shared-sync.sh`); створюється в S2.
- Хелпер word-level diff — searched: `rg "export function \w*[dD]iff"` у `client/src`, `server/src/modules/skills` — result: лише line-level `lineDiff`; новий `wordDiff` в S36.
- Мок LLM в e2e-стеку — searched: `grep -i "mock\|LLM" scripts/e2e.sh`, `server/src/platform/config.ts` — result: нічого; звідси ризик AC-110 і seeded прогони.
- Seeded triaged-знахідки і review з агентом — searched: `grep acceptedAt|dismissedAt server/src/db/seed.ts`; seeded review без `agentId` (`seed.ts:159-171`) — result: немає; додаються в S12.
- Версія скіла у `SkillsRepository.forAgent` — searched: `server/src/modules/skills/repository.ts:215-228` — result: версія не повертається. Порт `EvalSkillsReader.forAgentWithVersion` реалізується адаптером у `container.ts` (S17) через `skills.version` (`server/src/db/schema/skills.ts:20`), без змін у модулі skills. Якщо потрібен окремий repository-метод, W8 не має права на `skills/repository.ts` → фіксувати як `blocked`, і main session вирішує.
