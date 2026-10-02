# План реалізації: PR Brief — Why + Risk brief на вкладці Overview

## Мета та обсяг
- **В обсязі:**
  - Новий серверний модуль `server/src/modules/brief/` з двома роутами:
    - `GET /pulls/:id/brief` — читає збережений бриф;
    - `POST /pulls/:id/brief` — синхронна генерація: single-flight на PR, rate limit 10 запитів/хв на workspace, рівно один виклик `completeStructured`.
  - Вхід моделі зібраний детерміновано, бюджет ≤ 8 000 токенів `cl100k_base`.
  - Валідація відповіді за allow-list шляхів. Кеш у наявній таблиці `pr_brief` (jsonb + `schema_version`).
  - Зміна контракту `PrBrief` і нові `PrBriefRecord` / `ReviewFocusItem` / `BriefMissingInput` у трьох копіях `brief.ts`.
  - Адаптери OpenAI/Anthropic враховують `httpRetries: 0` (Q1).
  - Новий метод `ContextAttachmentsService.resolveForRepo` (REC1).
  - Клієнт:
    - хуки `usePrBrief` / `useGenerateBrief`;
    - нова розкладка Overview: банер вердикту, підсумок, Intent + Risk areas | Blast radius, Review focus;
    - перехід з Review focus і з ризику на Files changed з `?tab=diff&file=&line=`: розгортання групи й картки, скрол, підсвітка, фокус;
    - нові ключі у `client/messages/en/brief.json`.
- **Поза обсягом:**
  - Усе з *Non-goals* спеки: історія PR у брифі, автогенерація, фонова генерація / polling, тіла hunks у моделі, пейджинг файлів GitHub понад 100, MCP-інструмент, «Next focus item».
  - E2E-флоу над seeded брифом (`e2e/specs/*.flow.json`) — це робота `test-writer`, на вимогу.
  - Документація роутів — `doc-writer` після верифікації.
  - Відхилених REC немає.

## Рішення щодо вимог
- **Спека:** `2026-10-02-pr-brief` (approved) — `docs/specs/2026-10-02-pr-brief.md`.
- **Q1:** як забезпечити «no HTTP retry» → (a). `OpenAIProvider` і `AnthropicProvider` враховують `httpRetries`: при `0` немає `withRetry` і передається per-request SDK `maxRetries: 0`. Якщо `httpRetries` не задано, поведінка як зараз → S3.
- **Q2:** що таке «new-side changed line» → (a). Лише додані (`+`) рядки, зібрані в суцільні діапазони. Снеп іде на перший доданий рядок. Файл без доданих рядків дає `line_verified: false` → S6.
- **Q3:** linked issue → (a). Перше same-repo посилання з `extractReferences` (`server/src/modules/intent/helpers.ts:144`): один виклик `getIssue`, таймаут 5 с → S6, S13.
- **Q4:** розкладка → (a). Risk areas — окремий блок під незміненим `IntentCard` у лівій колонці → S11.
- **Q5:** порядок і фільтр specs → (a)+(i). Агенти впорядковані за `created_at, id`; скіли беруться лише `enabled && safe` → S4.
- **Додаткове рішення (не з Q):** фіксовані капи AC-27/AC-28/AC-29 не дають `over_budget`. `over_budget` пишеться лише при скороченні за бюджетом (AC-25, AC-26).
- **Додаткове рішення:** allow-list blast-шляхів (AC-49) будується з blast **у тому вигляді, як його надіслали** моделі. Збережений `blast` (AC-60) — та сама версія.
- Прийняті рекомендації:

  | REC | Що | Кроки |
  |---|---|---|
  | REC1 | `resolveForRepo` | S4, S13 |
  | REC2 | вузькі порти через контейнер | S13, S14 |
  | REC3 | rate limit усередині сервісу | S13 |
  | REC4 | чистий парсер діапазонів | S6 |
  | REC5 | strict-safe схема виходу | S7 |
  | REC6 | URL-ціль і `push` | S15, S18 |
  | REC7 | diff-viewer без нового namespace | S16, S17 |
  | REC8 | i18n у W1, P3 останнім | S2, S10 / S11 |

## Режим виконання
multi-agent — дві пакети плюс копія контракту в mcp-server, незалежні зрізи, один малий спільний контракт. W3 не залежить від контракту, тому перенесено у хвилю 1 (більше паралелізму, ніж у пропозиції pass 1).

## Пакети робіт
| WP | Кроки | owns | depends-on | wave |
|---|---|---|---|---|
| W1 — контракти + i18n | S1, S2 | `server/src/vendor/shared/contracts/brief.ts`, `client/src/vendor/shared/contracts/brief.ts`, `mcp-server/src/vendor/shared/contracts/brief.ts`, `client/messages/en/brief.json`, `server/test/brief-contracts.test.ts` | — | 1 |
| W3 — адаптери LLM + attachments | S3, S4 | `server/src/adapters/llm/openai.ts`, `server/src/adapters/llm/anthropic.ts`, `server/test/llm-http-retries.test.ts`, `server/src/modules/context-attachments/service.ts`, `server/src/modules/context-attachments/types.ts`, `server/src/modules/agents/repository.ts`, `server/test/context-attachments-service.test.ts` | — | 1 |
| W2 — brief: чиста логіка | S5, S6, S7 | `server/src/modules/brief/constants.ts`, `server/src/modules/brief/helpers.ts`, `server/src/modules/brief/prompt.ts`, `server/test/brief-helpers.test.ts`, `server/test/brief-prompt.test.ts` | W1 | 2 |
| W5 — клієнт: дані + Overview | S8, S9, S10, S11 | `client/src/lib/hooks/brief.ts`, `client/src/lib/hooks/index.ts`, `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/**` | W1 | 2 |
| W4 — brief: I/O, сервіс, роути, DI | S12, S13, S14 | `server/src/modules/brief/repository.ts`, `server/src/modules/brief/service.ts`, `server/src/modules/brief/routes.ts`, `server/src/modules/index.ts`, `server/src/platform/container.ts`, `server/test/brief-service.test.ts`, `server/test/brief.it.test.ts` | W1, W2, W3 | 3 |
| W6 — клієнт: навігація на Files changed | S15, S16, S17, S18 | `client/src/app/repos/[repoId]/pulls/[number]/page.tsx`, `client/src/app/repos/[repoId]/pulls/[number]/file-target.ts`, `client/src/app/repos/[repoId]/pulls/[number]/file-target.test.ts`, `client/src/app/repos/[repoId]/pulls/[number]/use-pr-file-navigation.ts`, `client/src/app/repos/[repoId]/pulls/[number]/use-pr-file-navigation.test.ts`, `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/**`, `client/src/components/diff-viewer/**` | W1, W5 | 3 |

- **Перевірка перетинів.**
  - Хвиля 1: W1 і W3 — немає спільних шляхів.
  - Хвиля 2: W2 і W5 — немає.
  - Хвиля 3: W4 і W6 — немає.
  - `server/src/modules/brief/*` поділено пофайлово (W2: constants/helpers/prompt; W4: repository/service/routes).
  - `container.ts` і `modules/index.ts` мають одного власника — W4.
  - `brief.json` має одного власника — W1.
- **Перевірка залежностей.** Кожен `depends-on` — з ранішої хвилі: W2←W1; W5←W1; W4←W1, W2, W3; W6←W1, W5.

DAG:
```
wave 1:  W1 ──┬──────────────► W2 ──┐
              │                     ├──► W4   (wave 3)
         W3 ──┼─────────────────────┘
              └──────────────► W5 ──────► W6   (wave 3)
```

## Контекст
Спека вимагає один обмежений виклик моделі над уже порахованими фактами, без коду hunks. Модель-вихід валідується, а бриф кешується з SHA. INSIGHTS, що вплинули на план:
- `server/INSIGHTS.md:47` — сервіс зі станом у пам'яті (single-flight, вікна rate limit) мусить бути мемоізований у контейнері, інакше single-flight не працює між викликачами → C3.
- `server/INSIGHTS.md:49,53,55`:
  - `no-sideways-module-imports` ловить і `import type` з `service|routes|repository` іншого модуля;
  - імпорт з `helpers.ts` / `classify.ts` дозволений → використовуємо `extractReferences` і `classifyFile`, а не сервіси;
  - порти оголошуються в споживачі.
- `server/INSIGHTS.md:57` — GitHub лише через лінивий `() => this.github()`, щоб ротація токена працювала.
- `server/INSIGHTS.md:59` — `test/**` не покривається `typecheck`. Нові тести треба обов'язково прогнати. Фейки портів, що змінюються (`AgentContextStore`), оновити разом.
- `server/INSIGHTS.md:23` — вартість `null` ≠ `0` → AC-77 «cost not reported».
- `client/INSIGHTS.md:41`:
  - новий `useTranslations` у широко змонтованому дереві ламає провайдери інших тестів;
  - через це diff-viewer отримує готові рядки пропсами → C17;
  - тестам Overview потрібні namespaces `brief` і `prReview` (VerdictBanner).
- `client/INSIGHTS.md:39` — у повідомленнях next-intl не можна кутових дужок → C14.
- `client/INSIGHTS.md:45` — вимірювання DOM лише через callback ref; `page.tsx` не має тестів → логіка навігації винесена в хук із тестом.
- `client/INSIGHTS.md:47` — `@testing-library/user-event` не встановлено, тому `fireEvent`.
- `client/INSIGHTS.md:27` — імпорт `messages/*.json` з тестів потребує на один `../` більше.
- `client/INSIGHTS.md:61` — sticky / скрол не видно в jsdom → ручна перевірка.

## Зачеплені модулі
| Пакет | Lanes (routing.md) | Пакетний менеджер | Перевірки |
|---|---|---|---|
| `server/` | 2 contracts, 4 backend-http, 5 backend-service, 6 backend-data, 8 backend-adapters, 13 types, 14 security, 17–20 api-compat | pnpm | `pnpm -C server lint` · `pnpm -C server typecheck` · `pnpm -C server arch:check` · `pnpm -C server exec vitest run --exclude '**/*.it.test.ts'` |
| `client/` | 2 contracts, 9 frontend-routes, 10 frontend-components, 11 frontend-lib, 12 frontend-tests, 13 types | pnpm | `pnpm -C client lint` · `pnpm -C client typecheck` · `pnpm -C client test` |
| `mcp-server/` | 21 mcp-server (лише байтова копія `brief.ts`) | pnpm | `pnpm -C mcp-server typecheck` · `pnpm -C mcp-server test` |
| спільне | 2 contracts | — | `./scripts/check-shared-sync.sh` |

## Обмеження
- **C1** — Поля контракту в `snake_case`. Zod-константа і тип мають одне PascalCase-ім'я. Значення enum — `lower_snake_case`. Три копії `brief.ts` байт-в-байт однакові; перевіряється `./scripts/check-shared-sync.sh`. — джерело: root `AGENTS.md` (Naming, Non-default conventions)
- **C2** — `service.ts` приймає лише порти (інтерфейси, оголошені в самому `service.ts`), ніколи `Container`. Не імпортує `drizzle-orm`, `db/*`, `adapters/**`, а також `service|routes|repository` іншого модуля. Дозволено `../intent/helpers.js`, `../smart-diff/classify.js`, `../context-attachments/types.js`, `@devdigest/reviewer-core`, `platform/errors|resilience`. — джерело: onion-architecture; `server/INSIGHTS.md:49,55`
- **C3** — `briefService()` у контейнері мемоізований (`this._briefService ??= …`). `new` на конкретних класах — лише в `container.ts`. — джерело: onion-architecture (container); `server/INSIGHTS.md:47`
- **C4** — Роут тонкий: Zod `params` / `response` через `fastify-type-provider-zod`, один виклик сервісу, жодних бізнес-правил. Невалідний id дає `422` до хендлера. — джерело: fastify-best-practices; `server/AGENTS.md`
- **C5** — Помилки лише через `AppError`-підкласи з `details.reason`:
  - `NotFoundError` → 404;
  - `TooManyRequestsError` → 429;
  - `ConflictError(msg, { reason: 'no_diff_data' })` → 409;
  - `ConflictError(msg, { reason: 'missing_key', provider })` → 409;
  - `ExternalServiceError(msg, { reason: 'llm_timeout' | 'llm_error' | 'invalid_output' })` → 502.

  Повідомлення не містять тексту PR чи моделі. — джерело: `server/src/platform/errors.ts:7-53`; spec *Contracts*
- **C6** — У логах лише метадані: outcome, reason, provider, model, токени, cost, оцінка токенів, бюджет, скорочені / відсутні секції, лічильники відкинутого, тривалість. Ніколи prompt, опис PR, issue, spec-текст чи вихід моделі. — джерело: AC-106, AC-107; security A09
- **C7** — Увесь PR-, repo- і model-текст (title, description, issue, intent, spec, шляхи, імена символів) потрапляє лише в user message і лише через `wrapUntrusted(label, content)` з `reviewer-core/src/prompt.ts:48`. Системний prompt статичний. — джерело: AC-30; security ASI01
- **C8** — Схема виходу моделі `BriefModelOutput`:
  - без `.optional()` (OpenAI strict `json_schema`, `server/src/adapters/llm/openai.ts:103-104`);
  - `kind: z.string()`, а не enum;
  - `line: z.number().int()`.

  Обрізання, дедуплікація і коерсія `kind` — після парсингу, не в схемі. — джерело: zod; REC5
- **C9** — Діапазони нових рядків рахує чиста функція в `brief/helpers.ts`. `adapters/git/diff-parser.ts` не імпортується. — джерело: onion-architecture; REC4
- **C10** — GitHub, LLM і модель приходять в'язаними замиканнями з контейнера: `() => this.github()`, `(p) => this.llm(p)`, `(ws) => resolveFeatureModel(this, ws, 'risk_brief')`. Жодного `process.env`. — джерело: `server/AGENTS.md`; `server/INSIGHTS.md:57`
- **C11** — Без міграцій і без `db:generate`. Збережений документ — `pr_brief.json` з `schema_version: 1`. Запис — один upsert по `pr_id`, лише після успіху. — джерело: NFR-8; `server/AGENTS.md`
- **C12** — Клієнтські дані — лише через `src/lib/hooks/*` → `src/lib/api.ts`. Жодних `fetch` у компонентах. — джерело: `client/AGENTS.md`
- **C13** — Один компонент на файл у `_components/<Name>/<Name>.tsx` (+ `index.ts`), ≤ 200 рядків, ≤ 7 пропсів. Бізнес-логіка — у чистому `helpers.ts`. Без render-factory. Без `useEffect` для похідного стану. — джерело: react-best-practices; frontend-architecture; root `AGENTS.md`
- **C14** — Кожен новий рядок UI береться з `client/messages/en/brief.json` під новими ключами, наявні ключі `brief.*` не змінюються. У текстах повідомлень немає `<…>`. — джерело: AC-104, NFR-9; `client/INSIGHTS.md:39`
- **C15** — Модельний текст рендериться лише як текст JSX: ні `dangerouslySetInnerHTML`, ні `react-markdown`. Шляхи — текст, а не URL. — джерело: AC-80; security A05
- **C16** — Тести клієнта:
  - `fireEvent` з `@testing-library/react`, а не `user-event`;
  - `fetch` мокається;
  - `NextIntlClientProvider` містить усі використані namespaces (`brief`, `prReview`, `shell`).

  — джерело: react-testing-library; `client/INSIGHTS.md:41,47`
- **C17** — `client/src/components/diff-viewer/**` не отримує нового `useTranslations`. Рядки цілі («Line n isn't part of this diff») передаються пропсами з `DiffTab`. — джерело: REC7; `client/INSIGHTS.md:41`
- **C18** — Будь-яке вимірювання чи скрол DOM робиться через callback ref у `useState`, а не `useRef` + `[]`. Відступ під sticky-заголовки береться з `headerHeight`. — джерело: `client/INSIGHTS.md:45`
- **C19** — DB-тести мають назву `*.it.test.ts`. Implementer їх пише, але не запускає. — джерело: `server/AGENTS.md`
- **C20** — Нових залежностей немає. Lockfile-и не змінюються. — джерело: root `AGENTS.md` (Do-not-touch)
- **C21** — Зміна адаптерів зворотно сумісна: при `httpRetries === undefined` поведінка ідентична нинішній (рев'ю, intent, narrative не змінюються). — джерело: onion-architecture (adapters); Q1
- **C22** — Публічний API лише адитивний: два нові роути. Наявні ендпоінти й параметри URL `tab` / `trace` не змінюються. `file` / `line` — опційні. — джерело: NFR-8; breaking-change / response-schema

## Кроки

### S1 — Контракт `brief.ts` у трьох копіях
- package: W1
- files:
  - modify `server/src/vendor/shared/contracts/brief.ts`:
    - додати `ReviewFocusItem` `{ file: string, line: int ≥ 1, reason: string, line_verified: boolean }`;
    - додати `BriefMissingInputName` (enum `intent | blast | linked_issue | description | specs | diff_stats`);
    - додати `BriefMissingReason` (enum з 16 значень за spec *Contracts*);
    - додати `BriefMissingInput` `{ input, reason }`;
    - додати `BriefSpecUsed` `{ path: string, est_tokens: int }`;
    - змінити `PrBrief`: `summary: string`, `review_focus: ReviewFocusItem[]`, `intent: Intent.nullable()`, `blast: BlastRadius.nullable()`, `risks: Risks`, `history: PrHistory.nullable()`;
    - додати `PrBriefRecord = PrBrief.extend({ pr_id, head_sha, stale, generated_at, provider, model, tokens_in: int|null, tokens_out: int|null, cost_usd: number|null, input_tokens_est: int, missing_inputs: BriefMissingInput[], specs_sha: string|null, specs_used: BriefSpecUsed[] })`;
    - оновити коментар-заголовок блоку `PrBrief`.
  - modify `client/src/vendor/shared/contracts/brief.ts`, `mcp-server/src/vendor/shared/contracts/brief.ts` — байтова копія (`./scripts/check-shared-sync.sh --fix` або вручну).
  - create `server/test/brief-contracts.test.ts` — `PrBriefRecord` парсить валідний запис. Відкидає `line: 0`, невідомий `reason`, відсутній `summary`. Приймає `intent: null`, `blast: null`, `history: null`.
- skills: zod — схеми й типи (lane 2); typescript-expert — змінений експортований тип (lane 13); response-schema — новий тип відповіді (lane 18)
- constraints: C1, C22
- covers: NFR-8, AC-1, AC-13, AC-44 (форма полів)
- reuse: `server/src/vendor/shared/contracts/brief.ts:9-14,73-78,116-135` — `Intent`, `BlastRadius`, `Risks`, `PrHistory`; `server/src/vendor/shared/index.ts:21` уже реекспортує `brief.js` (barrel не змінюється)
- done-when: `./scripts/check-shared-sync.sh` exit 0; `pnpm -C server typecheck`, `pnpm -C client typecheck`, `pnpm -C mcp-server typecheck` проходять; `pnpm -C server exec vitest run test/brief-contracts.test.ts` зелений (T1).
- depends-on: —

### S2 — Нові i18n-ключі PR Brief
- package: W1
- files: modify `client/messages/en/brief.json` — додати об'єкт `card` (наявні ключі не чіпати):
  - `title` «PR Brief», `aiLabel` «AI-generated»;
  - `empty.title` «No brief yet», `empty.body` (одне речення: підсумок, ризики, з чого почати), `modelHint` «Model: {model}»;
  - `generate` «Generate brief», `regenerate` «Regenerate», `generating` «Generating…»;
  - `provenance` «Generated {when} for commit {sha} · {model} · {cost}», `costNotReported` «cost not reported»;
  - `outdated` «Outdated — the PR has new commits since this brief»;
  - `riskAreas` «Risk areas», `noRisks` «No notable risks flagged.»;
  - `severity.{high,medium,low}`, `expandRisk`, `collapseRisk`;
  - `reviewFocus.title` «Review focus — read these first», `reviewFocus.empty` «No specific lines to start from — read the diff in Smart order.»;
  - `notInDiff` «not in this PR's diff», `fileNotInDiff` «File not in this PR's diff», `lineNotInDiff` «Line {line} isn't part of this diff»;
  - `missing.title` «Generated without:», `missing.input.{intent,blast,linked_issue,description,specs,diff_stats}`, `missing.reason.{…16 значень}`, `missing.fix.intent`, `missing.fix.specs`;
  - `error.llm_timeout`, `error.llm_error`, `error.invalid_output`, `error.no_diff_data`, `error.missingKey` «Add an API key for {provider} in Settings», `error.apiKeysLink`, `error.modelsLink`, `error.rateLimited` «Too many brief requests — try again in a minute», `error.loadFailed` «Couldn't load the brief», `retry` «Retry»;
  - `status.generating`, `status.generated`, `status.failed`.
- skills: next-best-practices — повідомлення next-intl (lane 9 / 11); frontend-architecture — i18n живе в `messages/` (lane 11)
- constraints: C14
- covers: AC-104, NFR-9
- reuse: `client/messages/en/brief.json:1-48` — наявна структура namespace `brief`
- done-when: JSON валідний (`pnpm -C client typecheck` + `pnpm -C client test` зелені); `git diff` показує лише додані рядки в `brief.json`; жоден рядок не містить `<`.
- depends-on: —

### S3 — Адаптери LLM враховують `httpRetries: 0`
- package: W3
- files:
  - modify `server/src/adapters/llm/openai.ts` — у `completeStructured`, коли `req.httpRetries === 0`:
    - не обгортати виклик у `withRetry`;
    - передавати `{ maxRetries: 0 }` другим аргументом (request options) у `chat.completions.create`.

    Коли `httpRetries` має інше значення > 0, передавати його як `maxRetries`. Коли не задано — без змін.
  - modify `server/src/adapters/llm/anthropic.ts` — те саме для `messages.create`.
  - create `server/test/llm-http-retries.test.ts` — фейковий SDK-клієнт (підміна `provider['client']`), що кидає 429 / 5xx:
    - при `httpRetries: 0, maxRetries: 0` рівно 1 виклик create, request options містять `maxRetries: 0`;
    - без `httpRetries` поведінка `withRetry` збережена.
- skills: onion-architecture — адаптер за портом `LLMProvider` (lane 8); typescript-expert — типи SDK request options (lane 13)
- constraints: C21, C20
- covers: AC-9, EC-7, NFR-2
- reuse: `server/src/vendor/shared/adapters.ts:50-55` (поле `httpRetries` уже в порті); `reviewer-core/src/llm/openrouter.ts:107` (зразок)
- done-when: T2 зелений; `pnpm -C server typecheck` і `pnpm -C server exec vitest run --exclude '**/*.it.test.ts'` проходять (наявні тести рев'ю / intent не змінились).
- depends-on: —

### S4 — `ContextAttachmentsService.resolveForRepo`
- package: W3
- files:
  - modify `server/src/modules/agents/repository.ts` — новий метод `listEnabledIdsOrdered(workspaceId): Promise<{ id: string }[]>`: `enabled = true`, `ORDER BY created_at, id`. `listEnabled` не чіпати.
  - modify `server/src/modules/context-attachments/types.ts`:
    - додати до `AgentContextStore` метод `listEnabledIdsOrdered`;
    - новий порт `ProjectContextForRepo { resolveForRepo(workspaceId, repoId, logger?): Promise<RepoContextResult> }`;
    - `RepoContextResult = { kind: 'none' } | { kind: 'unavailable'; reason: ProjectContextUnavailableReason } | { kind: 'resolved'; sha: string; docs: { path: string; text: string; estTokens: number | null }[] }`.

    `ProjectContextForRun` не змінюється.
  - modify `server/src/modules/context-attachments/service.ts` — `resolveForRepo`:
    - агенти в порядку `listEnabledIdsOrdered`;
    - для кожного: власні документи цього repo (`listContextDocs`), далі документи linked-скілів з `linkedForAgentWithState`, відфільтрованих `enabled && safe`, у порядку `order`;
    - дедуп за першою позицією;
    - `catalog.resolveDocs`;
    - лише читабельні документи (`isReadable`), без бюджету;
    - `withTimeout(RESOLVE_TIMEOUT_MS)`;
    - помилки → `unavailable` (як `resolveForRun`, `service.ts:205-213`).

    Клас декларує `implements ProjectContextForRun, ProjectContextForRepo`.
  - modify `server/test/context-attachments-service.test.ts` — фейк `AgentContextStore` отримує `listEnabledIdsOrdered`. Нові кейси: порядок агентів, порядок own→skills, дедуп, вимкнений / unsafe скіл виключено, `none`, `no_clone`, `no_catalog`, `timeout`.
- skills: onion-architecture — порт у споживачі, без рядків через межу (lane 5 / 6); drizzle-orm-patterns — `orderBy(asc(createdAt), asc(id))` (lane 6)
- constraints: C2, C19
- covers: AC-38, AC-39, AC-41, AC-42 (джерело даних)
- reuse: `server/src/modules/context-attachments/helpers.ts:22` (`orderRunCandidates`); `server/src/modules/context-attachments/service.ts:205-283`; `server/src/modules/project-context/service.ts:142-157` (`resolveDocs` → `sha`); `server/src/modules/skills/repository.ts:231-243`
- done-when: T3 зелений; `pnpm -C server arch:check`, `typecheck`, unit-набір зелені; `test/run-executor-project-context.test.ts` не змінювався і проходить.
- depends-on: —

### S5 — Константи модуля brief
- package: W2
- files: create `server/src/modules/brief/constants.ts`:
  - бюджет і ліміти входу: `INPUT_BUDGET_TOKENS = 8000`, `MAX_DESCRIPTION_CHARS = 4000`, `MAX_ISSUE_CHARS = 2000`, `MAX_DIFF_STAT_ENTRIES = 300`;
  - таймаути: `BLAST_TIMEOUT_MS = 10_000`, `ISSUE_TIMEOUT_MS = 5_000`, `SPECS_TIMEOUT_MS = 5_000`, `LLM_TIMEOUT_MS = 60_000`;
  - виклик моделі: `MAX_OUTPUT_TOKENS = 2000`, `TEMPERATURE = 0.2`;
  - обмеження виходу: `MAX_RISKS = 6`, `MAX_REFS_PER_RISK = 3`, `MAX_FOCUS_ITEMS = 8`, `MAX_SUMMARY_CHARS = 600`, `MAX_RISK_TITLE_CHARS = 80`, `MAX_EXPLANATION_CHARS = 600`, `MAX_REASON_CHARS = 160`;
  - `RISK_KINDS = ['security','db_migration','breaking_api','perf','deps','config','other'] as const`;
  - `RATE_LIMIT = { max: 10, windowMs: 60_000 }`;
  - `STORED_SCHEMA_VERSION = 1`;
  - `REDUCE_ORDER = ['specs','linked_issue','description','blast_callers','diff_stats'] as const`;
  - `SCHEMA_NAME = 'PrBriefOutput'`.
- skills: onion-architecture — ring 3, без I/O (lane 5)
- constraints: C2
- covers: NFR-3
- reuse: `server/src/modules/intent/constants.ts:60` (форма rate limit), `server/src/modules/onboarding/narrative-service.ts:196-206`
- done-when: `pnpm -C server typecheck` проходить.
- depends-on: S1

### S6 — Чисті хелпери: діапазони, валідація виходу, збережений документ, класифікація збоїв
- package: W2
- files:
  - create `server/src/modules/brief/helpers.ts` з функціями:
    - `addedLineRanges(patch: string | null): { start: number; end: number }[]` — лише `+`-рядки нової сторони, з парсингу заголовків `@@`; per-file patch без `diff --git` (Q2). `null` / бінарний / лише видалення → `[]`.
    - `pickLinkedIssueNumber(pull, repo): number | null` — перше same-repo число з `extractReferences` (`../intent/helpers.js`) (Q3).
    - `blastMissingReason(...)` — мапінг `BlastRadiusResponse.degraded/reason` → `BriefMissingReason`.
    - `specsMissingReason(...)` — мапінг `RepoContextResult` → `none_attached | not_cloned | no_catalog | unavailable`.
    - `validateBriefOutput(output, ctx)`, де `ctx = { prPaths: Set, blastPaths: Set, rangesByPath: Map }`; повертає `{ summary, risks, review_focus, dropped: { risks, refs, focus } }`. Правила:
      - path-частина `file_ref` (до `:<n>` або `:<a>-<b>`) має бути в `prPaths ∪ blastPaths`, інакше ref видаляється;
      - ризик без ref-ів відкидається;
      - невідомий `kind` → `other`;
      - сортування ризиків high > medium > low зі збереженням порядку моделі, далі кап 6;
      - кап 3 ref-и на ризик;
      - focus з файлом поза `prPaths` відкидається;
      - якщо файл має діапазони: рядок поза ними снепиться на `ranges[0].start`, `line_verified: true`;
      - якщо файл діапазонів не має: рядок лишається, `line_verified: false`;
      - дедуп `file:line` (перший виграє), далі кап 8;
      - обрізання з «…»: 600 / 80 / 600 / 160;
      - якщо порожньо — все одно повертається з summary.
    - `StoredBrief = PrBriefRecord.omit({ pr_id: true, stale: true }).extend({ schema_version: z.literal(STORED_SCHEMA_VERSION) })` + `parseStoredBrief(json: unknown): StoredBrief | null` (`safeParse`, `null` при невдачі).
    - `toBriefRecord(prId, stored, currentHeadSha): PrBriefRecord` (`stale = stored.head_sha !== currentHeadSha`).
    - `classifyBriefFailure(err): 'llm_timeout' | 'llm_error' | 'invalid_output'` — за `name`:
      - `TimeoutError` / `AbortError` / `APIConnectionTimeoutError` → timeout;
      - `ZodError` / `SyntaxError` / `InvalidBriefOutputError` або повідомлення `/schema|no choices|empty (response|output)/i` → invalid_output;
      - інше → llm_error.
    - `InvalidBriefOutputError`.
  - create `server/test/brief-helpers.test.ts` — усі правила вище, включно з EC-8 (старий шлях перейменованого файлу), EC-9, EC-10, EC-19, EC-20, EC-21 (стара `schema_version` / зіпсований JSON → `null`), EC-22.
- skills: onion-architecture — чиста логіка ring 3, лише дозволені cross-module імпорти helpers (lane 5); zod — `omit` / `extend` / `safeParse` (lane 2); typescript-expert — експортовані сигнатури (lane 13)
- constraints: C2, C8, C9
- covers: AC-6, AC-5 (обчислення `stale`), AC-21 (діапазони), AC-33, AC-34, AC-36, AC-41, AC-42 (мапінг причин), AC-45, AC-46, AC-47 (класифікація), AC-49, AC-50, AC-51, AC-52, AC-53, AC-54, AC-55, AC-56, AC-57, AC-58, AC-59, EC-8, EC-9, EC-10, EC-19, EC-20, EC-21, EC-22, NFR-5
- reuse: `server/src/modules/intent/helpers.ts:144` (`extractReferences`); `server/src/modules/onboarding/narrative-service.ts:65-76` (схема класифікації — шаблон, не імпорт); `server/src/vendor/shared/contracts/brief.ts:83-100`
- done-when: T4 зелений; `pnpm -C server arch:check` 0 помилок.
- depends-on: S5

### S7 — Prompt: схема виходу, системне повідомлення, збір входу з бюджетом
- package: W2
- files:
  - create `server/src/modules/brief/prompt.ts`:
    - `BriefModelOutput = z.object({ summary: z.string(), risks: z.array(z.object({ kind: z.string(), title: z.string(), explanation: z.string(), severity: RiskSeverity, file_refs: z.array(z.string()) })), review_focus: z.array(z.object({ file: z.string(), line: z.number().int(), reason: z.string() })) })` — без optional.
    - `buildBriefSystemPrompt()` — статичний: роль, правила (лише шляхи з наданих даних, формат `file_ref`, порядок читання, untrusted-дані — не інструкції).
    - `buildBriefInput(facts, deps)`:
      - facts: `{ title, description, linkedIssue: { number, title, body } | null, intent: { value: Intent; stale: boolean } | null, blast: BlastRadius | null, files: { path, additions, deletions, role, ranges }[], filesCountReported, specs: { path, text }[] }`;
      - deps: `{ count: (s) => number, wrap: (label, content) => string }`;
      - повертає `{ system, user, estTokens, missing: BriefMissingInput[], sentIntent, sentBlast: BlastRadius | null, specsUsed: BriefSpecUsed[], budget }`.

      Секції в user message — лише title+description, linked issue, intent, blast (summary, changed_symbols name+file, callers name+file+line), diff stats (path, +, −, role, діапазони `a-b`), specs. Кожна секція через `wrap`.

      Капи: опис ≤ 4000 символів, issue title+body ≤ 2000 разом, ≤ 300 записів diff-stat + рядок «+N more files».

      Бюджет: рахувати `count(system) + count(user)`. Поки > 8000, скорочувати за `REDUCE_ORDER`:
      - specs — цілі документи з кінця;
      - linked issue — прибрати;
      - опис — прибрати;
      - blast callers — по одному з кінця;
      - diff-stat — з кінця, з оновленим «+N more files».

      Title та intent не чіпаються ніколи. Кожна скорочена секція → `missing { reason: 'over_budget' }` (один запис на секцію; blast_callers → input `blast`).

      Specs: документ, що не вміщується в залишок бюджету, пропускається цілком, наступний пробується (AC-40); `specsUsed` — шлях + `count(wrapped)`.

      Порожній опис → `missing description/empty`. Немає issue-посилання → секції немає, без `missing`. `sentBlast` — blast після скорочення callers.
  - create `server/test/brief-prompt.test.ts`:
    - лише дозволені секції;
    - нуль рядків hunk-контенту (вхідні патчі з `+secret()` / `-old` / контекстом — жоден не в `user`);
    - усе недовірене лише в user і в обгортці, з екранованим `</untrusted>`;
    - капи 4000 / 2000 / 300 + «+N more files»;
    - порядок редукції і `over_budget` на фейковому лічильнику (1 токен = 1 символ);
    - title + intent ніколи не прибрані;
    - пропуск цілого spec-документа;
    - `specsUsed`;
    - `≤ 8000` на справжньому `TiktokenTokenizer` для великого PR (EC-17);
    - EC-26 (ін'єкційний текст лишається в обгортці).
- skills: onion-architecture — чисто, ring 3 (lane 5, файл `prompt.ts`); zod — strict-safe схема (lane 2); security — обробка недовірених вхідних (lane 14)
- constraints: C7, C8, C2
- covers: AC-20, AC-21, AC-22, AC-23, AC-24, AC-25, AC-26, AC-27, AC-28, AC-29, AC-30, AC-36, AC-37, AC-40, AC-44, AC-60 (`sentIntent` / `sentBlast`), EC-17, EC-26, NFR-3, NFR-5
- reuse: `reviewer-core/src/prompt.ts:48` (`wrapUntrusted` — передається як `wrap`); `server/src/adapters/tokenizer/index.ts:33` (`cl100k_base`, у тесті через `TiktokenTokenizer`); `server/src/modules/intent/prompt.ts` (шаблон системного prompt); `server/src/modules/onboarding/narrative/input.ts` (шаблон бюджетного збирання)
- done-when: T5 зелений; `pnpm -C server arch:check` і `typecheck` проходять.
- depends-on: S6

### S8 — Хуки `usePrBrief` / `useGenerateBrief`
- package: W5
- files:
  - create `client/src/lib/hooks/brief.ts`:
    - `usePrBrief(prId)` — `useQuery(["pr-brief", prId], GET /pulls/:id/brief)`, `enabled: !!prId`;
    - `useGenerateBrief(prId)` — `useMutation(POST /pulls/:id/brief)`, `onSuccess` → `setQueryData(["pr-brief", prId], record)`; при помилці кеш не змінюється, тост не показується (помилка inline);
    - експорт `briefErrorOf(err): { kind: 'reason'; reason } | { kind: 'missing_key'; provider } | { kind: 'rate_limited' } | { kind: 'other'; message }` — з `ApiError.status` / `details.reason` / `details.provider`.
  - modify `client/src/lib/hooks/index.ts` — `export * from "./brief";`.
- skills: frontend-architecture — дані лише через `lib/hooks` (lane 11); react-best-practices — TanStack Query (lane 11)
- constraints: C12
- covers: AC-63, AC-66, AC-67, AC-81 (кеш не чіпається при збої)
- reuse: `client/src/lib/hooks/intent.ts:13-36` (шаблон query + mutation); `client/src/lib/api.ts:8-62` (`ApiError.status` / `details`)
- done-when: `pnpm -C client typecheck` проходить; хуки покриті через T6 (OverviewTab).
- depends-on: S1

### S9 — Чисті хелпери Overview-брифу
- package: W5
- files:
  - create `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/helpers.ts`:
    - `middleTruncate(path, max)`;
    - `shortSha(sha)`;
    - `formatBriefCost(cost: number | null): string | null`;
    - `relativeTime(iso, now)`;
    - `riskModelLabel(settings)` — `risk_brief` з `settings.feature_models` або default з `client/src/lib/feature-models.ts`;
    - `latestReview(reviews)` — найновіший `kind === 'review'` за `created_at`;
    - `missingFixHref(input, repoId)` — intent → якір `#intent`; specs → `/repos/:repoId/context`;
    - `parseFileRef(ref)` → `{ path, line | null }`;
    - `SEVERITY_META` (іконка + колір; текстова мітка з i18n).
  - create `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/helpers.test.ts` — кожна функція (обрізання посередині, `null` cost, вибір найновішого рев'ю серед кількох агентів (EC-31), `parseFileRef` для `a.ts`, `a.ts:12`, `a.ts:3-9`).
- skills: frontend-architecture — логіка на найнижчому шарі (lane 9 / 10); react-testing-library — unit для утиліт (lane 12)
- constraints: C13, C16
- covers: AC-77, AC-78, AC-102, AC-105, AC-108, EC-28, EC-31
- reuse: `client/src/lib/feature-models.ts:13-40`; `client/src/lib/hooks/core.ts:21` (`useSettings`); `client/INSIGHTS.md:19` (локальні форматери)
- done-when: T7 зелений.
- depends-on: S1

### S10 — Компоненти блоків брифу
- package: W5
- files: create під `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/`, кожен `<Name>/<Name>.tsx` + `index.ts`:
  - `BriefHeader`:
    - нема брифу: «No brief yet» + пояснення + primary «Generate brief» + назва моделі;
    - є бриф: «Regenerate» (enabled), provenance-рядок, «Outdated …» при `stale`;
    - pending: кнопка disabled «Generating…»;
    - inline-помилки за `briefErrorOf`: текст причини + Retry; `missing_key` з лінками `/settings/api-keys` і `/settings/models`; 429 — текст, кнопка лишається enabled;
    - `role="status" aria-live="polite"` для generating / generated / failed;
    - цілі ≥ 24×24.
  - `BriefSummary` — мітка «AI-generated» + summary як текст.
  - `BriefMissingInputs` — «Generated without:» + вхід + причина словами + лінк-фікс AC-105.
  - `RiskAreas` + `RiskItem`:
    - іконка severity + текстова мітка + назва + file_ref-и;
    - кнопка розгортання `aria-expanded` → explanation;
    - порожньо → «No notable risks flagged.».
  - `BriefFileRef`:
    - шлях обрізаний посередині, `title` і `aria-label` — повний шлях;
    - якщо файл у змінених — кнопка, що викликає `onOpenFile(path, line)`;
    - інакше — текст + «not in this PR's diff».
  - `ReviewFocus`:
    - заголовок «Review focus — read these first»;
    - нумерований список `file:line — reason` у збереженому порядку, кожен пункт — кнопка `onOpenFile(file, line)`;
    - порожньо → empty-текст.
  - `BriefSkeleton` — скелет для risk / focus.

  Тести: `RiskAreas/RiskAreas.test.tsx`, `ReviewFocus/ReviewFocus.test.tsx`, `BriefHeader/BriefHeader.test.tsx` (стани empty / pending / помилки / 429 / outdated / provenance / cost null).
- skills: react-best-practices — компоненти, a11y, умовний рендер (lane 10); frontend-architecture — розміщення в `_components` (lane 10); react-testing-library — тести (lane 12)
- constraints: C13, C14, C15, C16
- covers: AC-61, AC-62, AC-64, AC-65, AC-68, AC-70, AC-71, AC-72, AC-73, AC-74, AC-75, AC-76, AC-77, AC-78, AC-79, AC-80, AC-82, AC-83, AC-84, AC-85, AC-96, AC-100, AC-101 (виклик `onOpenFile`), AC-105, AC-108, EC-22, EC-27, NFR-6 (клавіатура, не лише колір, статуси)
- reuse: `@devdigest/ui` (`Button`, `Skeleton`, `SectionLabel`, `Icon`, `Badge`); `client/src/app/repos/[repoId]/pulls/[number]/_components/IntentCard/IntentCard.tsx` (стиль карток / станів); `client/src/app/repos/[repoId]/pulls/[number]/_components/BlastRadiusCard/BlastRadiusCard.test.tsx` (налаштування провайдера + mock fetch)
- done-when: T8 зелений (`pnpm -C client exec vitest run <ці тести>`); кожен компонент ≤ 200 рядків.
- depends-on: S8, S9, S2

### S11 — Композиція `OverviewTab` і розкладка
- package: W5
- files:
  - modify `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/OverviewTab.tsx`. Нові пропси: `changedFiles: string[]`, `latestReview: ReviewRecord | null`, `onOpenFile: (path: string, line: number | null) => void` (зберегти `prId`, `repoId`, `prBody`, `repoFullName`, `headSha`). Порядок:
    1. `VerdictBanner` — лише коли є `latestReview` з `verdict` (`summary={null}`, score / findings / blockers з рев'ю);
    2. картка брифу: `BriefHeader` + (`BriefSkeleton` під час завантаження | помилка завантаження «Couldn't load the brief» + Retry | `BriefSummary` + `BriefMissingInputs`);
    3. дві колонки: ліва — `IntentCard` (без змін) + `RiskAreas` (або скелет під час pending); права — `BlastRadiusCard`;
    4. `ReviewFocus` (або скелет);
    5. Description, як зараз.

    `IntentCard` / `BlastRadiusCard` видимі завжди, зокрема при помилці брифу. Сітка: `display: grid; gridTemplateColumns: repeat(auto-fit, minmax(min(100%, 420px), 1fr))` (перенос в одну колонку на 320px / 200%).
  - modify `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/styles.ts` — стилі сітки.
  - create `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/OverviewTab.test.tsx` (mock fetch + `NextIntlClientProvider` з `brief`, `prReview`, `shell`). Флоу:
    - (a) GET → `null`: empty-стан, без POST; клік Generate → рівно 1 POST, disabled «Generating…», скелет; успіх → бриф без reload;
    - (b) GET → запис: показано одразу, жодного POST, summary над блоками;
    - (c) помилка Regenerate 502 → попередній бриф лишається + повідомлення + Retry;
    - (d) 409 `missing_key` → лінки Settings;
    - (e) 429 → текст, кнопка enabled;
    - (f) GET падає → «Couldn't load the brief», Intent / Blast на місці;
    - (g) є рев'ю → банер; немає → без банера;
    - (h) клік по focus → `onOpenFile(path, line)`;
    - (i) HTML у summary відображається літерально.
- skills: react-best-practices — container / presentational, ранні повернення (lane 10); frontend-architecture (lane 10); react-testing-library (lane 12); next-best-practices — `'use client'` біля листя (lane 10)
- constraints: C12, C13, C15, C16
- covers: AC-61, AC-62, AC-63, AC-64, AC-65, AC-66, AC-67, AC-68, AC-69 (unit-частина), AC-81, AC-86, AC-87 (виклик), AC-102, AC-103, EC-1 (кнопка disabled), EC-2, EC-5, EC-20, EC-21, EC-27, NFR-6 (reflow), NFR-9
- reuse: `client/src/app/repos/[repoId]/pulls/[number]/_components/VerdictBanner/VerdictBanner.tsx:12-26`; `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/OverviewTab.tsx:17-30`
- done-when: T6 зелений; `pnpm -C client typecheck` проходить. Поки W6 не оновить `page.tsx`, typecheck може падати через нові обов'язкові пропси. Тому W5 робить їх **опційними** з безпечними дефолтами (`changedFiles = []`, `latestReview = null`, `onOpenFile` — no-op), і хвиля 2 лишається зеленою.
- depends-on: S10

### S12 — `BriefRepository`
- package: W4
- files: create `server/src/modules/brief/repository.ts` — `class BriefRepository { constructor(db: Db) }`:
  - `get(prId): Promise<StoredBrief | null>` — select `pr_brief.json`, далі `parseStoredBrief`;
  - `replace(prId, doc: StoredBrief): Promise<void>` — один `insert … onConflictDoUpdate({ target: prBrief.prId, set: { json } })`.
- skills: drizzle-orm-patterns — upsert (lane 6); onion-architecture — мапінг рядка в домен на межі (lane 6)
- constraints: C11, C2
- covers: AC-6, AC-11, AC-48 (запис лише через `replace`)
- reuse: `server/src/db/schema/reviews.ts:86-91`; `server/src/modules/intent/repository.ts` (шаблон upsert)
- done-when: `pnpm -C server typecheck` і `arch:check` проходять; покрито T10 (it).
- depends-on: S6

### S13 — `BriefService`
- package: W4
- files:
  - create `server/src/modules/brief/service.ts`.

    Порти, оголошені тут:
    - `BriefStore` (`get` / `replace`);
    - `BriefPullStore`: `findPull(ws, prId)` → `{ id, repoId, number, title, body, branch, headSha, filesCount }`; `findRepo(ws, repoId)` → `{ owner, name }`; `listFiles(prId)` → `{ path, additions, deletions, patch }`;
    - `BriefIntentReader { getIntent(ws, prId): Promise<PrIntentRecord | null> }`;
    - `BriefBlastReader { getBlast(ws, prId): Promise<BlastRadiusResponse> }`;
    - `ProjectContextForRepo` (тип з `../context-attachments/types.js` — це порт-поверхня);
    - `githubFor`, `llmFor`, `modelFor`, `count`, `wrap`, `now`;
    - опційні `limits` (таймаути — для тестів).

    `getBrief(ws, prId)`: `findPull` → 404; `get` → `null` або `toBriefRecord(prId, doc, pull.headSha)`. Без LLM / GitHub / git.

    `generate(ws, prId, logger?)`:
    1. `findPull` → 404;
    2. `takeToken(ws)` → `TooManyRequestsError`;
    3. single-flight `Map<ws:prId, Promise<PrBriefRecord>>` — наявний → повернути той самий promise;
    4. `run`:
       - `files.length === 0` → `ConflictError({ reason: 'no_diff_data' })`;
       - `choice = modelFor(ws)`; `llmFor(choice.provider)` → `ConfigError` → `ConflictError({ reason: 'missing_key', provider })`;
       - `headSha` з початку;
       - паралельно (`Promise.all`):
         - intent (немає → `not_derived`, `stale` → `stale`);
         - blast під `withTimeout(10 s)` (throw → `unavailable`, `TimeoutError` → `timeout`, degraded → причина);
         - issue: `pickLinkedIssueNumber` → `githubFor()` + `getIssue` під `withTimeout(5 s)`, будь-яка помилка / ConfigError → `github_unavailable`;
         - specs: `resolveForRepo` під `withTimeout(5 s)` → мапінг причин;
       - `filesCount > files.length` → `diff_stats/truncated`;
       - ролі через `classifyFile`, діапазони через `addedLineRanges`;
       - `buildBriefInput`;
       - рівно один `llm.completeStructured({ model, schema: BriefModelOutput, schemaName, messages: [system, user], temperature, maxTokens: 2000, timeoutMs: 60 000, maxRetries: 0, httpRetries: 0 })` у `withTimeout(60 s)`;
       - порожній summary → `InvalidBriefOutputError`;
       - `validateBriefOutput` з `prPaths` + шляхами `sentBlast`;
       - `replace(prId, doc)` з `head_sha`, `generated_at`, `provider`, `model`, `tokens_in` / `out`, `cost_usd`, `input_tokens_est`, `missing_inputs`, `specs_sha`, `specs_used`, `intent: sentIntent`, `blast: sentBlast`, `history: null`, `schema_version`;
       - перечитати `findPull` для `stale`;
       - повернути запис;
       - збій LLM → `ExternalServiceError({ reason: classifyBriefFailure(err) })`, без запису.

    Генерація не прив'язана до request / abort (AC-16). Один структурований лог-рядок на завершення: успіх або збій, лише метадані.
  - create `server/test/brief-service.test.ts` (unit, фейкові порти). Кейси:
    - get: `null` / запис / `stale` / 404, 0 викликів llm / github;
    - один виклик `completeStructured` з `maxRetries: 0, httpRetries: 0`;
    - модель з `modelFor` (override і default);
    - single-flight: два паралельні `generate` → 1 виклик, однаковий результат / помилка;
    - rate limit: 11-й за хвилину → 429 без виклику;
    - `no_diff_data` і `missing_key` без виклику llm;
    - таймаут LLM (мала `limits.llmTimeoutMs`) → `llm_timeout`;
    - помилка провайдера → `llm_error`;
    - невалідний / порожній вихід → `invalid_output`;
    - при будь-якому збої `replace` не викликано;
    - intent `not_derived` / `stale`; intent не деривується (`getIntent` — єдиний метод порту);
    - blast throw / timeout / degraded → `missing` + allow-list лише PR;
    - issue: без посилання / помилка / таймаут / без токена;
    - specs: `none_attached` / `not_cloned` / `no_catalog` / `unavailable` + `specs_sha`;
    - `truncated`;
    - `headSha` зміниться під час генерації → запис зі старим SHA і `stale: true` (EC-4);
    - лог: один запис, жодних полів із текстом (перевірка, що в `JSON.stringify(logCalls)` немає title / body / summary фікстури);
    - клієнт «відключився» — promise усе одно завершується і пише.
- skills: onion-architecture — use case на портах (lane 5); security — недовірене, логи, rate limit (lane 14); typescript-expert (lane 13)
- constraints: C2, C5, C6, C7, C10, C11
- covers: AC-1, AC-2, AC-3, AC-4, AC-5, AC-7, AC-8, AC-9, AC-10, AC-11, AC-12, AC-13, AC-14, AC-15, AC-16, AC-17, AC-18, AC-19, AC-31, AC-32, AC-33, AC-34, AC-35, AC-38, AC-39, AC-41, AC-42, AC-43, AC-45, AC-46, AC-47, AC-48, AC-60, AC-106, AC-107, EC-1, EC-2, EC-3, EC-4, EC-5, EC-6, EC-7, EC-12, EC-13, EC-14, EC-15, EC-16, EC-18, EC-23, EC-24, EC-28, EC-29, NFR-2, NFR-4, NFR-7
- reuse: `server/src/modules/intent/service.ts:169-175,201-224` (`getIntent`, single-flight); `server/src/modules/onboarding/narrative-service.ts:196-206,234-252` (вікно rate limit, один виклик); `server/src/modules/blast/service.ts:37-48`; `server/src/modules/smart-diff/classify.ts:18`; `server/src/platform/resilience.ts:13` (`withTimeout`)
- done-when: T9 зелений; `pnpm -C server arch:check` 0 помилок; `typecheck` і unit-набір зелені.
- depends-on: S12, S7, S4, S3

### S14 — Роути, реєстрація модуля, DI
- package: W4
- files:
  - create `server/src/modules/brief/routes.ts`:
    - `GET /pulls/:id/brief` — `params: IdParams`, `response: { 200: PrBriefRecord.nullable() }`;
    - `POST /pulls/:id/brief` — `params: IdParams`, `response: { 200: PrBriefRecord }`. `config: { rateLimit: false }` не ставити: глобальний ліміт 120/хв лишається, власний ліміт — у сервісі;
    - обидва: `getContext` → один виклик сервісу, логер `req.log`.
  - modify `server/src/modules/index.ts` — імпорт і запис `brief`.
  - modify `server/src/platform/container.ts`:
    - `_briefRepo` / `get briefRepo`;
    - мемоізований `briefService()`, що зв'язує:
      - `briefRepo`, `pullsRepo`;
      - `{ getIntent: (ws, id) => this.intentService().getIntent(ws, id) }`;
      - `{ getBlast: (ws, id) => this.blastService().getBlast(ws, id) }`;
      - `this.contextAttachments`;
      - `() => this.github()`, `(p) => this.llm(p)`, `(ws) => resolveFeatureModel(this, ws, 'risk_brief')`;
      - `(t) => this.tokenizer.count(t)`, `wrapUntrusted`.
  - create `server/test/brief.it.test.ts` (testcontainers, `MockLLMProvider` з `structuredBySchema.PrBriefOutput`, override `llm.openai`). Кейси:
    - GET `null` → POST 200 → GET той самий запис;
    - `calls` — рівно 1 `completeStructured`;
    - модель `risk_brief` default `openai/gpt-4.1` і override із settings;
    - чужий workspace / неіснуючий PR → 404 на GET і POST; невалідний id → 422;
    - PR без файлів → 409 `details.reason = no_diff_data`;
    - без ключа (немає override, порожні секрети) → 409 `missing_key` + `provider`;
    - 11 POST за хвилину → 429;
    - два паралельні POST → 1 виклик, однакові тіла;
    - невалідна фікстура → 502 `invalid_output`, попередній бриф не змінено;
    - фейковий LLM, що кидає → 502 `llm_error`;
    - зміна `head_sha` PR → GET `stale: true`;
    - зіпсований `json` у `pr_brief` → GET `null`;
    - `files_count > rows` → `truncated`;
    - attachments кількох агентів → порядок `specs_used`.
- skills: fastify-best-practices — роут зі схемами (lane 4); onion-architecture — composition root (lane 8); security — вхід запиту (lane 14); breaking-change, response-schema — нові роути без змін наявних (lanes 17–18)
- constraints: C3, C4, C5, C10, C19, C22
- covers: AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-11, AC-12, AC-13, AC-14, AC-15, AC-16, AC-17, AC-18, AC-19, AC-38, AC-43, AC-46, AC-47, AC-48, NFR-4, NFR-7, NFR-8
- reuse: `server/src/modules/intent/routes.ts:16-41`; `server/src/platform/container.ts:158-167,218-220,275-288`; `server/src/modules/_shared/schemas.ts` (`IdParams`); `server/src/adapters/mocks.ts:99-108` (`structuredBySchema`)
- done-when: `pnpm -C server lint`, `typecheck`, `arch:check` і unit-набір зелені; `brief.it.test.ts` написаний (T10), запускається не implementer-ом.
- depends-on: S13

### S15 — Ціль файлу в URL і хук навігації
- package: W6
- files:
  - create `client/src/app/repos/[repoId]/pulls/[number]/file-target.ts`:
    - `parseFileTarget(search, changedPaths): { file: string; line: number | null; inPr: boolean } | null` — `line` лише ціле > 0, інакше `null`;
    - `buildDiffHref(base, search, path, line)` — встановлює `tab=diff`, `file`, `line`, зберігає `trace`;
    - `withoutTarget(search)`.
  - create `client/src/app/repos/[repoId]/pulls/[number]/file-target.test.ts` — валідація `line` (`"0"`, `"-3"`, `"abc"`, `"1.5"` → ігнор), шлях поза PR → `inPr: false`, href.
  - create `client/src/app/repos/[repoId]/pulls/[number]/use-pr-file-navigation.ts` — `usePrFileNavigation({ repoId, number, changedPaths })` → `{ openFile(path, line), statusMessage }`:
    - файл у PR → `router.push(buildDiffHref…)` (нова історія);
    - не в PR → `statusMessage = 'fileNotInDiff'`, без навігації.
  - create `client/src/app/repos/[repoId]/pulls/[number]/use-pr-file-navigation.test.ts` — `vi.mock("next/navigation")`: перевірити `push` (не `replace`) з `tab=diff&file=&line=`, і що поза PR немає `push`, а є статус.
- skills: next-best-practices — `useRouter` / `useSearchParams` (lane 9); frontend-architecture — розміщення поруч з route (lane 9); react-testing-library — `renderHook` (lane 12); security — недовірені параметри URL (lane 14)
- constraints: C13, C16
- covers: AC-87, AC-88, AC-95, AC-97, AC-98, EC-25
- reuse: `client/src/app/repos/[repoId]/pulls/[number]/page.tsx:78-86` (поточний `setParam`)
- done-when: T11 зелений.
- depends-on: S2

### S16 — diff-viewer: пропси цілі (розгортання, підсвітка, фокус, повідомлення)
- package: W6
- files:
  - modify `client/src/components/diff-viewer/DiffViewer/DiffViewer.tsx` — опційний проп `target?: { path; line: number | null; key: string; lineNotInDiffLabel: string; onApplied(el: HTMLElement) }`, що передається у `FileCard` лише для відповідного файлу.
  - modify `client/src/components/diff-viewer/FileCard/FileCard.tsx`, коли отримує `target`:
    - відкривається (зміна `target.key` розгортає картку навіть понад `AUTO_EXPAND_MAX_LINES`; патерн «adjust state on prop change», без ланцюжка effect-ів);
    - визначає, чи рендериться рядок (`parsePatch` → `newNo === line`);
    - якщо так — `CodeLine` отримує `highlighted` і `focusTarget`;
    - якщо ні — показує `target.lineNotInDiffLabel` біля заголовка і фокусує кнопку заголовка;
    - викликає `onApplied(елемент)` через callback ref.

    Атрибут `data-diff-file={path}`.
  - modify `client/src/components/diff-viewer/CodeLine/CodeLine.tsx` — опційні `highlighted`, `focusTarget`:
    - `data-new-line`;
    - `tabIndex={-1}` при `focusTarget`;
    - фон підсвітки; `transition` лише без `prefers-reduced-motion`.
  - modify `client/src/components/diff-viewer/styles.ts` — стилі підсвітки / повідомлення.
  - modify `client/src/components/diff-viewer/DiffViewer/DiffViewer.test.tsx`:
    - файл > 200 рядків відкривається за ціллю;
    - рядок у патчі підсвічений і в фокусі;
    - рядок поза патчем → повідомлення + фокус заголовка;
    - без `target` поведінка як раніше.

  Новий `useTranslations` у diff-viewer заборонений (C17).
- skills: react-best-practices — без похідного стану через effect, a11y фокус (lane 10); frontend-architecture — спільний компонент не знає про brief (lane 10); react-testing-library (lane 12)
- constraints: C13, C16, C17, C18
- covers: AC-89 (картка), AC-92, AC-93, AC-94, EC-10, EC-11 (картка > 200 рядків)
- reuse: `client/src/components/diff-viewer/FileCard/FileCard.tsx:53-56` (`open` / `parsePatch`); `client/src/components/diff-viewer/helpers.ts` (`parsePatch`)
- done-when: T12 зелений; `client/src/test/smoke.test.tsx` не змінювався і проходить.
- depends-on: S2

### S17 — DiffTab: застосування цілі один раз, розгортання групи, скрол
- package: W6
- files:
  - modify `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.tsx` — проп `target?: { path; line: number | null; key: string } | null`:
    - через `useDiffTarget` визначає роль файлу (з `smartDiff.groups`);
    - відкриває відповідну `RoleGroup` у Smart order;
    - передає `target` у `DiffViewer`;
    - текст `lineNotInDiff` з namespace `brief`.
  - create `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/useDiffTarget.ts`:
    - ціль застосовується **один раз на `key`** і лише коли `files` є, а smart diff завантажено або впав (AC-99, EC-30);
    - `onApplied(el)` → `scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' })` з `scroll-margin-top = headerHeight + висота sticky-заголовка RoleGroup`;
    - знімає `highlighted` через ≤ 2000 мс (таймер з cleanup).
  - modify `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/_components/RoleGroup/RoleGroup.tsx` — опційний `openKey?: string`: зміна значення розгортає групу (adjust-on-prop-change); передає `target` у `DiffViewer`.
  - modify `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.test.tsx`:
    - провайдер отримує `brief` messages;
    - ціль у згорнутій `docs`-групі розгортає групу і картку в Smart та Original order;
    - застосування один раз (повторний ререндер не перескроллює; `scrollIntoView` замокано);
    - ціль до завантаження даних застосовується після;
    - підсвітка знімається через 2 с (fake timers).
- skills: react-best-practices — effect з cleanup, без ланцюжків (lane 10); react-testing-library (lane 12); frontend-architecture (lane 10)
- constraints: C13, C16, C17, C18
- covers: AC-89, AC-90 (логіка; перевірка вручну), AC-91 (логіка; вручну), AC-92, AC-93, AC-94, AC-99, EC-11, EC-30
- reuse: `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.tsx:52-137`; `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/constants.ts:25-28` (`COLLAPSED_BY_DEFAULT`); `client/src/app/repos/[repoId]/pulls/[number]/page.tsx:60-76` (`headerHeight`)
- done-when: T13 зелений.
- depends-on: S16

### S18 — Підключення в `page.tsx`
- package: W6
- files: modify `client/src/app/repos/[repoId]/pulls/[number]/page.tsx`:
  - `usePrFileNavigation({ repoId, number, changedPaths: pr.files.map(f => f.path) })`;
  - `setTab` також видаляє `file` / `line` (`replace`, як і було);
  - `OverviewTab` отримує `changedFiles`, `latestReview` (з `reviews` через `latestReview` з `OverviewTab/helpers.ts` — допустимий імпорт: `app/` компонує свої `_components`), `onOpenFile={openFile}`;
  - при `tab=diff` — `parseFileTarget(search, changedPaths)`:
    - `inPr` → `DiffTab target={{ path, line, key: search.toString() }}`;
    - інакше статус «File not in this PR's diff» у `role="status"` (вкладка не змінюється), без цілі;
  - `statusMessage` з хука рендериться в тому ж live-регіоні (рядок з `brief.card.fileNotInDiff`).
- skills: next-best-practices — тонкий route, `useSearchParams` (lane 9); frontend-architecture — `app/` лише компонує (lane 9); react-best-practices (lane 10)
- constraints: C12, C13, C18, C22
- covers: AC-87, AC-88, AC-95, AC-97, AC-98, AC-101, EC-25
- reuse: `client/src/app/repos/[repoId]/pulls/[number]/page.tsx:78-86,159-205`
- done-when: `pnpm -C client lint`, `typecheck`, `test` повністю зелені; у `page.tsx` немає логіки валідації URL (вона в `file-target.ts`).
- depends-on: S15, S17, S11

## План тестування
- T1: NFR-8, AC-1, AC-13, AC-44 (форма) → `server/test/brief-contracts.test.ts` — unit — S1
- T2: AC-9, EC-7, NFR-2 (адаптери) → `server/test/llm-http-retries.test.ts` — unit — S3
- T3: AC-38, AC-39, AC-41, AC-42 (джерело) → `server/test/context-attachments-service.test.ts` — unit — S4
- T4: AC-6, AC-21 (діапазони), AC-36, AC-49…AC-59, EC-8, EC-9, EC-10, EC-19, EC-20, EC-21, EC-22, NFR-5 → `server/test/brief-helpers.test.ts` — unit — S6
- T5: AC-20…AC-30, AC-37, AC-40, AC-44, AC-60, EC-17, EC-26, NFR-3 → `server/test/brief-prompt.test.ts` — unit — S7
- T6: AC-61…AC-69 (unit), AC-81, AC-86, AC-87, AC-102, AC-103, EC-1, EC-2, EC-5, EC-20, EC-21, EC-27, NFR-9 → `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/OverviewTab.test.tsx` — component — S11
- T7: AC-77, AC-78, AC-102, AC-105, AC-108, EC-28, EC-31 → `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/helpers.test.ts` — unit — S9
- T8: AC-70…AC-80, AC-82…AC-85, AC-96, AC-100, AC-101, AC-108, EC-22, EC-27 → `RiskAreas.test.tsx`, `ReviewFocus.test.tsx`, `BriefHeader.test.tsx` під `OverviewTab/_components/` — component — S10
- T9: AC-1…AC-5, AC-7, AC-8, AC-10…AC-19, AC-31…AC-35, AC-38, AC-39, AC-41…AC-43, AC-45…AC-48, AC-60, AC-106, AC-107, EC-1…EC-7, EC-12…EC-16, EC-18, EC-23, EC-24, EC-28, EC-29, NFR-2, NFR-4, NFR-7 → `server/test/brief-service.test.ts` — unit (фейкові порти) — S13
- T10: AC-1…AC-8, AC-11…AC-19, AC-38, AC-43, AC-46…AC-48, NFR-4, NFR-7, NFR-8 → `server/test/brief.it.test.ts` — it (не запускається implementer-ом) — S14
- T11: AC-87, AC-88, AC-95, AC-97, AC-98, EC-25 → `client/src/app/repos/[repoId]/pulls/[number]/file-target.test.ts`, `client/src/app/repos/[repoId]/pulls/[number]/use-pr-file-navigation.test.ts` — unit / hook — S15
- T12: AC-89, AC-92, AC-93, AC-94, EC-10, EC-11 → `client/src/components/diff-viewer/DiffViewer/DiffViewer.test.tsx` — component — S16
- T13: AC-89, AC-92, AC-93, AC-94, AC-99, EC-11, EC-30 → `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.test.tsx` — component — S17
- AC-104 / NFR-9 додатково перевіряються: у компонентах немає захардкоджених рядків (T6 / T8 рендерять через повідомлення `brief.json`).
- Ручні перевірки (`verify: manual`): AC-69 (візуальна розкладка), AC-90, AC-91, NFR-1, NFR-6 → *Review handoff → Manual verification*.
- Команди:
  - `server/`: `pnpm -C server lint` · `pnpm -C server typecheck` · `pnpm -C server arch:check` · `pnpm -C server exec vitest run --exclude '**/*.it.test.ts'`
  - `client/`: `pnpm -C client lint` · `pnpm -C client typecheck` · `pnpm -C client test`
  - `mcp-server/`: `pnpm -C mcp-server typecheck` · `pnpm -C mcp-server test`
  - спільне: `./scripts/check-shared-sync.sh`
  - не запускається implementer-ом: `pnpm -C server exec vitest run .it.test` (CI `server-integration.yml`)
- Multi-agent: implementer-и запускають цільові тести своїх файлів (`pnpm -C <pkg> exec vitest run <file>`) і `typecheck` своїх пакетів, а для серверних пакетів ще й `arch:check`. Повну таблицю main session запускає раз на хвилю. `test/**` не покривається `typecheck` (`server/INSIGHTS.md:59`), тому нові серверні тест-файли треба обов'язково прогнати.

## Ризики та відкриті питання
- `withTimeout` не скасовує роботу. Blast fallback-обхід (`server/src/modules/blast/service.ts:37-48`) і git-читання specs продовжують виконуватися у фоні після 10 / 5 с; навантаження лишається. (inference) — для: user
- Якщо OpenAI SDK не приймає per-request `maxRetries` у поточній версії пакета, S3 потребує альтернативи (окремий клієнт з `maxRetries: 0`). Перевірити поведінку SDK `openai` / `@anthropic-ai/sdk` щодо per-request `maxRetries`. — для: researcher
- `MockLLMProvider` кидає `Error("…fixture failed schema…")` (`server/src/adapters/mocks.ts:103-104`); `classifyBriefFailure` має ловити це регекспом `/schema/i`, інакше it-тест AC-47 отримає `llm_error`. — для: user (врахувано в S6)
- Rate limit і single-flight живуть у пам'яті процесу; перезапуск їх скидає (EC-24 прийнятно за спекою). — для: user
- Глобальний `@fastify/rate-limit` 120/хв за IP (`server/src/app.ts:95`) лишається поверх сервісного ліміту 10/хв. — для: user
- Модель може посилатися на файл з blast callers, які були обрізані бюджетом. Такі refs видаляються, бо allow-list будується з надісланого blast (рішення вище). (inference) — для: user
- Між S11 і S18 обов'язкові пропси `OverviewTab` зроблені опційними, щоб хвиля 2 лишалася зеленою; S18 передає їх реально. — для: user

## Передача на рев'ю
- **Architecture:**
  - `server/src/modules/brief/service.ts` (порти, без `Container`; дозволені імпорти лише `../intent/helpers.js`, `../smart-diff/classify.js`, `../context-attachments/types.js`);
  - `server/src/platform/container.ts` (мемоізація `briefService`);
  - `server/src/modules/context-attachments/service.ts` (`resolveForRepo` не змінює `resolveForRun`);
  - `server/src/adapters/llm/{openai,anthropic}.ts` (зворотна сумісність);
  - клієнт: diff-viewer не знає про brief; `page.tsx` лише компонує; один компонент на файл.
- **Security:**
  - недовірені PR / issue / spec / шляхи в `wrapUntrusted`, лише в user message (S7);
  - allow-list шляхів (S6);
  - логи без тексту (S13);
  - rate limit на workspace і single-flight (S13);
  - URL `file` / `line` — лише порівняння зі списком змінених файлів і додатне ціле (S15);
  - модельний текст лише як JSX-текст (S10);
  - `getIssue` тільки для same-repo номера.
- **API compatibility:** нові `GET` і `POST /pulls/:id/brief`. `PrBrief` послаблено (`intent` / `blast` / `history` nullable) і доповнено — на дроті ніхто не споживає (`client/src/lib/types.ts:52` — лише реекспорт типу). URL сторінки отримує адитивні `file` / `line`. Наявні роути не змінюються. Lanes 17–20.
- **Tests:** опційний e2e-флоу над seeded брифом для PR #482 (Overview → Review focus → Files changed) — для `test-writer`; `e2e/specs/05-pr-diff.flow.json` перевіряє лише `tab=diff`, не зачеплено.
- **Docs:**
  - `server/docs/api-contracts.md` + API-мапа `server/README.md`: два роути, коди 404 / 409 / 429 / 502 і `details.reason`;
  - `server/docs/architecture.md`: модуль brief (входи, бюджет, single-flight);
  - `client/docs/ui-architecture.md`: Overview-бриф і URL-ціль `file` / `line`;
  - запис реалізованої фічі в реєстрі spec — для `doc-writer`.
- **Manual verification:**
  - S17 / S18 — скрол до заголовка файлу й рядка під sticky `PrDetailHeader` і sticky-заголовком `RoleGroup` (AC-90, AC-91), включно зі згорнутою `docs`-групою і файлом > 200 рядків в обох порядках; Back повертає Overview (AC-97);
  - S11 — двоколонкова розкладка і перенос в одну колонку на 320px / 200% (AC-69, NFR-6);
  - клавіатура / скрінрідер (NFR-6);
  - `GET /pulls/:id/brief` p95 ≤ 300 мс на seeded БД і генерація ≤ 75 с (NFR-1).

  Live-браузер, видима вкладка — `client/INSIGHTS.md:51,57`.

## Не знайдено / прогалини
- Порядок агентів у БД — шукалось: `server/src/db/schema/agents.ts`, `AgentsRepository.list*` — результат: немає колонки порядку і `ORDER BY`; вирішено Q5 (`created_at, id`).
- Збережений номер linked issue — шукалось: `pr_intent.sources`, `pull_requests` — результат: лише метадані intent; вирішено Q3 (живий `getIssue`).
- Тести для `OpenAIProvider` / `AnthropicProvider` — шукалось: `grep OpenAIProvider|AnthropicProvider server/test` — результат: немає; S3 створює перший.
- Тест для `page.tsx` — шукалось: `client/src/app/repos/[repoId]/pulls/[number]/` — результат: немає; логіку винесено в `use-pr-file-navigation.ts` з тестом (S15).
- Per-repo API для attachments між агентами — шукалось: `server/src/modules/context-attachments/service.ts` — результат: лише `resolveForRun` на одного агента; S4 додає `resolveForRepo`.
