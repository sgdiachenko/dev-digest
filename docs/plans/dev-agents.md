# План реалізації: сабагенти `stack-reviewer` і `conventions-reviewer`

## Мета і межі
- **У межах:**
  - два нові read-only сабагенти на `sonnet`, які запускаються на вимогу:
    - `.claude/agents/stack-reviewer.md` — ревʼю ідіом стеку в `server/`, `client/`, `reviewer-core/`, `mcp-server/`, `e2e/`;
    - `.claude/agents/conventions-reviewer.md` — ревʼю диффу на правила іменування і структури з кореневого `AGENTS.md`;
  - evals для обох агентів у `evals/agents/<name>/`;
  - реєстрація в `.claude/agents/README.md`, кореневому `AGENTS.md` і `evals/src/harness-docs.test.ts`.
- **Поза межами:**
  - зміни `run-plan/SKILL.md` Phase 3 і flow-діаграм (Q5=a);
  - правки `architecture-reviewer.md` (Q4=a);
  - агент, що імплементує стек (Q2=a);
  - REC8, прибирання `ci-trigger`-коментарів (відхилено);
  - нові workflow-кейси в `evals/workflow/`;
  - коміти, push, PR.

## Рішення
- **Spec:** немає. Це невелика зміна тулінгу (Q1=a, `.claude/agents/README.md:33-34`).
- **Q2=a** → S1; **Q3** (усі 5 пакетів) → S1; **Q4=a** → S3; **Q5=a** → S5, S6; **Q6** → single-agent, `sonnet`.
- **REC1–REC7** прийнято. **REC8** відхилено.

## Режим виконання
single-agent. Близько 9 файлів Markdown і TS, без збірки. Спільні реєстри (`README.md`, `AGENTS.md`, `harness-docs.test.ts`) мають одного власника.

## Контекст
- Форма агента-рецензента: `.claude/agents/architecture-reviewer.md:1-12`; виняток для одного pipe: `.claude/agents/security-reviewer.md:33-40`.
- Наявні власники перевірок, які нові агенти не дублюють:
  - shared-mirroring і `adapters.ts`: `architecture-reviewer.md:35-36,94-96`;
  - інваріанти lane 1: `.claude/skills/pr-self-review/severity.md:77-84`;
  - correctness: `/code-review` (`.claude/skills/run-plan/SKILL.md:136-139`).
- Ризик плутанини назв: функція застосунку Conventions Extractor (`docs/specs/conventions.md:1-11`).
- Історичні міграції названі неоднорідно (`0000_init.sql`, `0001_add_agent_run_error.sql`, `0002_warm_moonstone.sql`). Тому перевіряються тільки додані файли.
- Skills без власної шкали (fastify, drizzle, postgresql, zod, typescript-expert) дають максимум `WARNING` (`severity.md:30`).
- В eval-харнесі немає Bash (`evals/agents/architecture-reviewer/architecture-reviewer.cases.ts:8-17`). Фікстури — диффи файлів, яких немає на диску.
- `harness-docs.test.ts:66-79` перевіряє, що кожен сабагент зі списку названий у кореневому `AGENTS.md` і має файл `.claude/agents/<name>.md`.
- `pnpm eval:quality` перевіряє тільки `SKILL.md` (`evals/src/skill-quality.ts:1-7`), тому статичного gate для агентів немає.
- INSIGHTS: зміна не торкається пакетів застосунку; записи INSIGHTS на план не впливають.
- **Design:** немає.

## Модулі, яких торкається зміна
| Пакет | Lanes (routing.md) | Пакетний менеджер | Перевірки |
|---|---|---|---|
| `.claude/agents/` | 16 `docs` | — | `pnpm vitest run agents/<n>/`, `pnpm eval:workflow` |
| `AGENTS.md` (корінь) | 1, 16 | — | `pnpm eval:workflow`, `pnpm vitest run src/harness-docs` |
| `evals/` | поза lanes (TS-тести харнесу) | pnpm | `pnpm eval:quality`, `pnpm vitest run agents/<n>/`, `pnpm vitest run src/harness-docs`, `pnpm eval:workflow` |

## Обмеження
- **C1.** Frontmatter обох агентів:
  - `name`, `description` з тригер-словами і позначкою "on demand";
  - `model: sonnet`;
  - `tools: Read, Grep, Glob, Bash`;
  - `disallowedTools: Write, Edit, NotebookEdit, Agent, Skill, WebFetch, WebSearch`;
  - `skills: [engineering-insights]`;
  - без `permissionMode`.
  Джерело: `architecture-reviewer.md:1-12`, `.claude/agents/README.md:278-283`.
- **C2.** Тільки читання. Bash-allow-list і заборони — як у `architecture-reviewer.md:27-40`. Перевірки запускаються без pipe, з `; echo "exit=$?"`.
- **C3.** Формат знахідок — JSON-масив `{severity, file, line, skill, rule, summary, evidence, fix}`. Verdict — чиста функція від знахідок; нуль знахідок теж валідна відповідь. Є режим *Delta re-review* з `Re-check:` і `Fix files:`. Джерело: `architecture-reviewer.md:52-61,104-147`, `pr-self-review/report.md`.
- **C4.** Ревʼю тільки змінених рядків. Список того, що ніколи не флагається: `severity.md:141-150`. Scope за замовчуванням — `gate.sh base` плюс staged, unstaged і untracked.
- **C5.** Severity за `severity.md:19-37`:
  - skills без шкали дають максимум `WARNING`;
  - `CRITICAL` можливий тільки зі skill, у якого є власний CRITICAL, і тільки за evidence rule (`severity.md:129-139`);
  - у `conventions-reviewer` максимум `WARNING`.
- **C6.** `stack-reviewer` не преloadить stack-skills. Він зіставляє кожен змінений файл із lane у `routing.md` і читає `.claude/skills/<n>/SKILL.md` тих lanes, що йому належать:
  - 2 (zod), 4 (fastify), 6 і 7 (drizzle, postgresql), 9 (next), 10 (react), 12 (RTL), 13 (typescript-expert), 21 (zod, ts) — один раз на skill;
  - для `e2e/` (lane 15) читає `e2e/AGENTS.md`.
  Джерело: `.claude/agents/README.md:255-264`, `routing.md:14-37`.
- **C7.** Кожен агент має абзац «Не моя робота → агент»:
  - onion і placement → architecture-reviewer;
  - OWASP і секрети → security-reviewer;
  - correctness → `/code-review`;
  - API-сумісність (lanes 17–20) і інваріанти lane 1 (shared-sync, `adapters.ts`, lockfiles, symlink) → `/pr-self-review` / architecture-reviewer.
  `stack-reviewer` не робить onion/frontend-architecture-ревʼю, навіть коли lane 4–6/9–11 його згадує.
- **C8.** У `conventions-reviewer` детерміновані перевірки йдуть перед ручним проходом. Дозволено рівно одну форму з pipe: `git diff <range> -- <paths> | grep -nE '<pattern>'`, плюс `git diff --no-index /dev/null <untracked>`. Кожна знахідка посилається на рядок кореневого `AGENTS.md` «Naming conventions». Джерело: `security-reviewer.md:33-40`.
- **C9.** Редагувати `AGENTS.md`, ніколи `CLAUDE.md`. Відносні посилання мають резолвитися. Джерело: кореневий `AGENTS.md` «Non-default conventions», `routing.md:31`, `harness-docs.test.ts:47-62`.
- **C10.** Eval-файли:
  - створюються через `pnpm -C evals eval:scaffold --agent <name>`;
  - тонкий `*.eval.ts`, дані в `*.cases.ts`, фікстури в `fixtures/`, не в `.claude/`;
  - перший рядок промпта (`HEADER`) каже, що Bash немає;
  - є хоча б один «benign → approve» кейс;
  - нових залежностей немає. Джерело: `evals/README.md:330-378`, `architecture-reviewer.cases.ts`.
- **C11.** Без комітів, push і `gh pr`. Скрипти не запускаються з `--fix`.
- **C12.** Перевірка імені міграції стосується тільки доданих файлів (`--diff-filter=A` плюс untracked) під `server/src/db/migrations/*.sql`. Шаблон `^[0-9]{4}_[a-z]+_[a-z]+\.sql$`; `meta/**` не перевіряється.

## Кроки

### S1 — `stack-reviewer.md`
- **files:** create `.claude/agents/stack-reviewer.md`:
  - frontmatter за C1. `description`: read-only ревʼю диффу проти ідіом стеку (Fastify 5, Drizzle/Postgres, Next.js 15 App Router, React, Zod, TS) у `server/`, `client/`, `reviewer-core/`, `mcp-server/`, `e2e/`; on demand; trigger terms: stack review, framework idioms, fastify/drizzle/next/react review;
  - hard limits (C2). Команди перевірок, лише для пакетів у диффі: `pnpm -C server typecheck`, `pnpm -C server lint`, `pnpm -C client typecheck`, `pnpm -C client lint`, `npm --prefix reviewer-core run typecheck`, `pnpm -C mcp-server typecheck`, `npm --prefix e2e run typecheck`. Тести не запускаються;
  - Step 0 (scope / Delta re-review);
  - Workflow: Orient (`AGENTS.md` і `INSIGHTS.md` пакетів) → список файлів → lanes → skill loading (C6) → механічні перевірки → ручний прохід → знахідки → verdict;
  - межі (C7), severity (C5), формат «Stack Review» (C3) з полем `skill` = прочитаний skill і `rule` = ID або розділ правила;
  - секція «Skill sources read».
- **skills:** none (lane 16 `docs`)
- **constraints:** C1, C2, C3, C4, C5, C6, C7, C11
- **reuse:** `.claude/agents/architecture-reviewer.md:1-147` (структура, Step 0, формат); `.claude/agents/plan-verifier.md` (skill loading rule)
- **done-when:** розділи на місці; frontmatter збігається з C1; lanes 2/4/6/7/9/10/12/13/15/21 перелічені явно; абзац C7 є; T1 зелений (S2).
- **depends-on:** —

### S2 — evals для `stack-reviewer`
- **files:**
  - create через scaffold: `evals/agents/stack-reviewer/stack-reviewer.eval.ts`, `stack-reviewer.cases.ts`;
  - `fixtures/stack-idioms.diff` — Fastify-route з `reply.send()` і `return` в одному async-хендлері без response-схеми; `Schema.parse(req.body)` замість `safeParse`; React `{count && <X/>}` і `key={index}` у списку, що фільтрується; Next page, що читає `params.id` без `await`;
  - `fixtures/stack-benign.diff` — ідіоматична зміна, наприклад нове поле в Zod-схемі з `.default()`;
  - `fixtures/stack-out-of-lane.diff` — сервіс з імпортом `drizzle-orm` (onion) і `exec(req.query.cmd)` (security);
  - видалити `fixtures/.gitkeep`, якщо фікстури додано.
- **skills:** typescript-expert (`cases.ts` експортує типізований `AgentCase[]`)
- **constraints:** C10, C11
- **reuse:** `evals/agents/architecture-reviewer/architecture-reviewer.cases.ts:1-101`
- **covers:** T1
- **done-when:**
  - 3 кейси: виявлення ідіом (threshold 0.8), benign → `approve` (1.0), out-of-lane → без onion- і security-знахідок, з посиланням на architecture-reviewer / security-reviewer (1.0);
  - `pnpm -C evals vitest run agents/stack-reviewer/` завершився з exit 0, або вимкнення моделі записане в Implementation Report.
- **depends-on:** S1

### S3 — `conventions-reviewer.md`
- **files:** create `.claude/agents/conventions-reviewer.md`:
  - frontmatter за C1. `description` з «naming and structure rules from root AGENTS.md … on demand … not the in-app Conventions Extractor»;
  - правила R1–R7, кожне з цитатою з кореневого `AGENTS.md`:
    - R1: DB-колонки `snake_case`, явно задані поряд із `camelCase` TS-полем;
    - R2: поля wire-контрактів `snake_case`;
    - R3: Zod-конст і її тип мають одне `PascalCase`-імʼя;
    - R4: значення enum — `UPPER_CASE` для severity-подібних, `lower_snake_case` для решти;
    - R5: компонент `PascalCase`, один на файл, `_components/<Name>/<Name>.tsx`, тест поряд;
    - R6: сегменти маршрутів у нижньому регістрі, `[brackets]`;
    - R7: міграції з автоіменем (C12);
  - детерміновані перевірки (C8), кожна — точна команда в промпті:
    - додані міграції (C12);
    - `^\+.*:\s*[a-zA-Z]+\('[^']*[A-Z][^']*'` у `server/src/db/schema*` → R1;
    - `^\+.*export const [a-z][A-Za-z0-9]* = z\.` у `*/src/vendor/shared/contracts/**` → R3;
    - шляхи доданих файлів `client/src/app/**/_components/*/*.tsx`, де імʼя файлу ≠ імʼя теки або не `PascalCase` → R5;
    - нові теки під `client/src/app/**` з великими літерами, крім `_components`, `[..]`, `(..)` → R6;
  - ручний прохід для R2/R4 і для «два компоненти в одному файлі»;
  - межі (C7: shared-sync, `adapters.ts`, lockfiles і symlink — не тут);
  - severity — максимум `WARNING` (C5); формат «Conventions Review» (C3).
- **skills:** none (lane 16 `docs`)
- **constraints:** C1, C2, C3, C4, C5, C7, C8, C11, C12
- **reuse:** `.claude/agents/security-reviewer.md:33-40` (виняток для pipe); `architecture-reviewer.md:110-147` (формат)
- **done-when:** R1–R7 на місці, кожне посилається на рядок `AGENTS.md`; кожна детермінована перевірка — готова команда; C12 обмежує перевірку доданими файлами; severity ≤ `WARNING`; T2 зелений (S4).
- **depends-on:** —

### S4 — evals для `conventions-reviewer`
- **files:**
  - create через scaffold: `evals/agents/conventions-reviewer/conventions-reviewer.eval.ts`, `conventions-reviewer.cases.ts`;
  - `fixtures/naming-violations.diff` — `costUsd: doublePrecision('costUsd')`; `export const severity = z.enum(['critical','Warning'])`; файл `client/src/app/repos/_components/prCard/PrCard.tsx` з двома компонентами; додана міграція `server/src/db/migrations/0042_AddCost.sql`;
  - `fixtures/naming-benign.diff` — ті самі місця, названі правильно;
  - `fixtures/naming-out-of-scope.diff` — дрейф між двома копіями shared-контракту і правка lockfile;
  - видалити `fixtures/.gitkeep`.
- **skills:** typescript-expert (типізований `AgentCase[]`)
- **constraints:** C10, C11, C12
- **reuse:** `evals/agents/architecture-reviewer/architecture-reviewer.cases.ts:1-101`
- **covers:** T2
- **done-when:**
  - 3 кейси: усі 4 порушення знайдені з цитатою рядка і посиланням на правило `AGENTS.md`, жодне не вище `WARNING` (0.8); benign → `approve` (1.0); out-of-scope → без знахідок про mirroring або lockfile, з посиланням на architecture-reviewer / `/pr-self-review` (1.0);
  - `pnpm -C evals vitest run agents/conventions-reviewer/` завершився з exit 0, або вимкнення моделі записане.
- **depends-on:** S3

### S5 — реєстрація в `.claude/agents/README.md`
- **files:** modify `.claude/agents/README.md`:
  - 2 рядки в Catalog (`:164-175`): роль, `sonnet`, інструменти, вхід, вихід, позначка «on demand, not in /run-plan»;
  - рядки в таблиці «Role-scoped skills» (`:211-253`): `engineering-insights` для обох; для stack-reviewer — опис підвантаження stack-skills через `routing.md`;
  - абзац про підвантаження на вимогу (`:255-264`) згадує `stack-reviewer`;
  - Sources для обох агентів (`architecture-reviewer.md`, `security-reviewer.md`, `severity.md`, кореневий `AGENTS.md`, рішення користувача 2026-10-09);
  - рядок у «Maintaining the set» (`:400-403`) додає обидва агенти до списку role-scoped;
  - Flow-діаграма (`:13-31`) не змінюється.
- **skills:** none (lane 16 `docs`)
- **constraints:** C7, C9
- **done-when:** обидва агенти є в Catalog, Role-scoped і Sources; діаграма не змінена (`git diff` по `:13-31` порожній); відносні посилання резолвляться.
- **depends-on:** S1, S3

### S6 — реєстрація в кореневому `AGENTS.md` і `harness-docs.test.ts`
- **files:**
  - modify `AGENTS.md`:
    - список `.claude/agents/` (`:22-35`) отримує `stack-reviewer` (read-only ревʼю ідіом стеку, на вимогу) і `conventions-reviewer` (read-only ревʼю іменування і структури, на вимогу); рядок Flow (`:36-42`) не змінюється;
    - речення про role-scoped (`:136-139`) доповнюється обома агентами;
  - modify `evals/src/harness-docs.test.ts:66-77` — додати `"stack-reviewer"` і `"conventions-reviewer"` до `test.each`.
- **skills:** typescript-expert (правка `test.each`)
- **constraints:** C9
- **covers:** T3
- **done-when:** `CLAUDE.md` не змінено (`git status` не показує його); `pnpm -C evals vitest run src/harness-docs` завершився з exit 0.
- **depends-on:** S1, S3

### S7 — фінальні перевірки
- **files:** — (тільки запуск; якщо щось падає — виправлення у файлах S1–S6)
- **constraints:** C11
- **done-when:** послідовно, кожна команда з exit-кодом:
  1. `pnpm -C evals eval:quality` — exit 0;
  2. `pnpm -C evals vitest run src/harness-docs` — exit 0;
  3. `pnpm -C evals vitest run agents/stack-reviewer/` і `agents/conventions-reviewer/` — exit 0;
  4. `pnpm -C evals eval:workflow` — exit 0, без регресії наявних кейсів;
  5. `pnpm -C evals eval:scaffold` показує `✓ evals` для обох агентів.
  Результати записані в Implementation Report.
- **depends-on:** S2, S4, S5, S6

## План тестів
- **T1** → `evals/agents/stack-reviewer/stack-reviewer.cases.ts` (S2). Виявлення: fastify `reply.send`/`return` і відсутність response-схеми; zod `parse` на вводі користувача; react `count && <X/>` і index-key; next `params` без `await`. Benign → `approve`. Out-of-lane → немає onion/OWASP-знахідок, є посилання на інших рев'юерів.
- **T2** → `evals/agents/conventions-reviewer/conventions-reviewer.cases.ts` (S4). Виявлення: 4 порушення (R1 `'costUsd'`, R3/R4 `severity`/`'Warning'`, R5 `prCard`/два компоненти, R7 `0042_AddCost.sql`), кожне з цитатою і правилом, severity ≤ `WARNING`. Benign → `approve`. Out-of-scope → немає знахідок про mirroring або lockfile.
- **T3** → `evals/src/harness-docs.test.ts` (S6). Обидві назви в кореневому `AGENTS.md`, файли `.claude/agents/<name>.md` існують.
- **Команди:** `pnpm -C evals eval:quality`; `pnpm -C evals vitest run src/harness-docs`; `pnpm -C evals vitest run agents/stack-reviewer/`; `pnpm -C evals vitest run agents/conventions-reviewer/`; `pnpm -C evals eval:workflow`.

## Ризики і відкриті питання
- Evals агентів і workflow роблять реальні виклики моделі (через OpenRouter або підписку, `evals/README.md:74`). Вони коштують грошей, і результат може відрізнятися між запусками. Якщо автентифікації немає, записується «not run». Для: user.
- Regex у `conventions-reviewer` (R1, R5, R6) можуть давати хибні спрацювання (inference). Пом'якшення: regex лише кандидат, знахідку підтверджує ручний перегляд рядка. Для: user.
- `stack-reviewer` на великому диффі може читати багато `SKILL.md`, до ~40k токенів (inference за `README.md:195`). Пом'якшення: кожен skill читається один раз за прогін. Для: user.
- `eval:workflow` не має кейсу на dispatch нових агентів, тож активація за `description` не перевірена. Для: user.

## Передача на ревʼю
- **Architecture:** немає коду застосунку. Перевірити, що межі C7 не перекриваються з `architecture-reviewer.md:3,94-96`.
- **Security:** Bash-allow-list і виняток для одного pipe в `conventions-reviewer.md` (C8). Перевірити, що агенти не дозволяють `--fix`, redirect і state-changing git.
- **API compatibility:** немає.
- **Tests:** немає e2e.
- **Docs:** реєстрація в S5 і S6.
- **Manual verification:** один ручний запуск кожного агента на реальному диффі, бо в eval-харнесі Bash немає.

## Не знайдено / прогалини
- Наявний lint чи скрипт для правил іменування не знайдено (`routing.md`, `severity.md:77-84`, `pr-self-review/SKILL.md:85-100`). `client/eslint.config.mjs` повністю не читано.
- Evals для `security-reviewer` відсутні; є тільки `architecture-reviewer` як приклад.
- `eval:quality` не перевіряє `.claude/agents/*.md`.
