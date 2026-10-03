# План реалізації: Onboarding Tour — факти (A) + AI-наратив (B)

## Мета та обсяг
- **В обсязі (A):**
  - `GET /repos/:id/tour` у новому модулі `server/src/modules/onboarding/`. Детерміновані факти з фасаду repo-intel та git-об'єктів на `lastIndexedSha`, без LLM.
  - Контракт `Onboarding` замінюється в трьох вендорних копіях.
  - Новий фасадний метод `RepoIntel.getGraphFacts` і новий порт `GitClient.grepAt`.
  - In-memory кеш фактів.
  - Сторінка `/repos/:repoId/tour`: пункт сайдбару, виправлення `activeKeyFor`, `githubTreeUrl`, i18n.
  - Правило чистоти для `modules/onboarding/(facts|narrative)/**`.
- **В обсязі (B):**
  - `POST /repos/:id/tour/narrative`: фонова генерація, рівно один структурований LLM-виклик фічі `onboarding`.
  - Обмеження: single-flight на репо, 10 запитів/хв на workspace, 0 ретраїв, 0 re-prompt, таймаут 60 с, `interrupted` через 90 с або після рестарту.
  - Grounding виходу моделі (шляхи, команди, числа, посекційний fallback).
  - Зберігання останнього доброго наративу в legacy-таблиці `onboarding` (jsonb, без міграції).
  - Адитивні поля `narrative` та `estimated_cost` у `GET /tour`.
  - Маршрутизація OpenRouter лише на провайдерів зі structured output; HTTP-ретраї SDK вимкнено на рівні запиту (reviewer-core).
  - Переписаний промпт.
  - Клієнт: Generate/Regenerate, polling, live-region, повідомлення про збої, чип Outdated, безпечний Markdown, strict mermaid із fallback, експорт.
- **Поза обсягом:**
  - Non-goals обох специфікацій.
  - Зміни схеми БД та міграції.
  - Нові npm/pnpm-залежності; lockfile-и не змінюються.
  - Нові e2e-флоу (test-writer на запит).
  - Зміни індексатора (`failed` ніхто не пише).
  - Верифікація U-рядків Appendix A (A:Q-3, researcher).

## Рішення щодо вимог
- **Специфікації:**
  - A — `2026-10-01-onboarding-tour-facts` (approved), `docs/specs/2026-10-01-onboarding-tour-facts.md`;
  - B — `2026-10-01-onboarding-tour-narrative` (approved), `docs/specs/2026-10-01-onboarding-tour-narrative.md`.
- **Нумерація:** усі ID мають префікс специфікації (`A:AC-37` ≠ `B:AC-37`).
- **Рішення A (pass 2):**

| Питання | Рішення |
|---|---|
| A-Q1 | (a1): новий модуль, чиста підпапка `facts/` під правилом dependency-cruiser |
| A-Q2 | (a)+(i): `listTree`/`readBlob` + `grepAt`, рукописні екстрактори |
| A-Q3 | (a): in-memory кеш |
| A-Q4 | (a): layout клієнта |
| A-Q5a | (a) → **D1** |
| A-Q5b | (a) → **D2** |
| REC1–REC12 | прийняті |

- **Рішення B (pass 2):**

| Питання | Рішення |
|---|---|
| B-Q1 | (a): legacy-таблиця `onboarding`, jsonb `StoredNarrativeState`, без міграції |
| B-Q2 | (a): in-process фонова робота + single-flight + сервісний лімітер + `interrupted` при читанні |
| B-Q3 | (a): поля `StructuredRequest` + зміна `reviewer-core/src/llm/openrouter.ts` |
| B-Q4a | (a) → **D3** |
| B-Q4b | (a) → **D4** |
| B-Q5 | (a): `NARRATIVE_MAX_TOKENS = 8000`; оцінка = `priceBook.estimate(model, 12000, 8000)` з позначкою «approx.» |
| B-REC1–REC12 | прийняті, разом із правками A1–A5 до плану A |

- **Відхилення від затверджених специфікацій** (прийняті користувачем; рекомендовано зафіксувати новою ревізією spec-creator — затверджені специфікації не переписуються):
  - **D1** (A:AC-37). Кнопка Resync у стані «not cloned» викликає `POST /repos/:id/refresh` (`useRefreshRepo`): `POST /resync` без клону нічого не робить (`server/src/modules/repo-intel/service.ts:150-155`). Банер (A:AC-39) лишається на `POST /resync`.
  - **D2** (A:AC-13 / A:NFR-9). Summary рендерить клієнт із `messages/en/onboarding.json` за структурованими аргументами. Сервер усе одно заповнює `architecture.summary` англійським шаблоном (експорт, вхід наративу).
  - **D3** (B:AC-35 / B:AC-104). Адитивні поля `narrative.last_failure.provider` та `.model` (`string | null`) — у контракті B їх немає.
  - **D4** (B:AC-65 / B:AC-73). Сервер переписує `body_markdown`:
    - шлях, що існує на `source_sha` наративу, стає `[path](repo:path)`;
    - будь-яке інше посилання зводиться до тексту.

    Клієнт робить посиланнями лише `repo:`-href. Контракт не змінюється.
- **Спосіб виконання:** multi-agent, interleaved, 5 хвиль.

## Спосіб виконання
Multi-agent, з чергуванням: три пакети + reviewer-core, близько 200 AC. Чиста частина B (reviewer-core, `narrative/*`, промпт) залежить лише від контрактів і йде паралельно з хвилями 2–3 A. Точки інтеграції (`container.ts`, `routes.ts`, `repository.ts`, header, view, sections) передаються між хвилями одному власнику.

## Робочі пакети
`…` = `client/src/app/repos/[repoId]/tour/_components`, `OTV` = `…/OnboardingTourView`.

| WP | Кроки | owns | depends-on | хвиля |
|---|---|---|---|---|
| W1 — контракти A+B | S1, S2, S3 | `server/src/vendor/shared/contracts/knowledge.ts`, `client/src/vendor/shared/contracts/knowledge.ts`, `mcp-server/src/vendor/shared/contracts/knowledge.ts`, `server/test/contracts.test.ts`, `client/src/lib/types.ts` | — | 1 |
| W2 — порти git+LLM | S4 | `server/src/vendor/shared/adapters.ts`, `server/src/adapters/git/simple-git.ts`, `server/src/adapters/git/show-file-at-guard.ts`, `server/src/adapters/mocks.ts`, `server/test/git-grep.test.ts` | — | 1 |
| W3 — фасад repo-intel | S5 | `server/src/modules/repo-intel/{types,service,repository}.ts`, `server/test/repo-intel-facade-degraded.test.ts`, `server/test/repo-intel-graph-facts.test.ts`, `server/test/conventions.it.test.ts` | — | 1 |
| W4 — nav і URL | S6 | `client/src/vendor/ui/nav.ts`, `client/src/components/app-shell/helpers.ts`, `client/src/components/app-shell/helpers.test.ts`, `client/src/lib/github-urls.ts`, `client/src/lib/github-urls.test.ts` | — | 1 |
| W5 — tooling | S7 | `.claude/skills/pr-self-review/routing.md`, `.claude/agents/implementer.md`, `server/.dependency-cruiser.cjs` | — | 1 |
| W6 — чисті факти (A) | S8–S13 | `server/src/modules/onboarding/facts/**`, `server/test/onboarding-facts-*.test.ts` | W1, W5 | 2 |
| W7 — клієнтська основа (A) | S14–S17 | `client/messages/en/onboarding.json`, `client/src/lib/hooks/tour.ts`, `client/src/lib/hooks/index.ts`, `OTV/{helpers.ts,helpers.test.ts,constants.ts}`, `OTV/_components/{TourSection,MiddleTruncatedPath,CommandRow,OpenOnGitHub}/**` | W1, W4 | 2 |
| W12 — reviewer-core LLM (B) | S29 | `reviewer-core/src/llm/openrouter.ts`, `reviewer-core/src/llm/errors.ts`, `reviewer-core/src/index.ts`, `reviewer-core/test/openrouter.test.ts` | W2 | 2 |
| W13 — чистий наратив + промпт (B) | S30–S35 | `server/src/modules/onboarding/narrative/**`, `server/test/onboarding-narrative-*.test.ts`, `server/src/prompts/onboarding.system.md` | W1, W5 | 2 |
| W14 — клієнтські примітиви (B) | S36, S37 | `client/src/components/mermaid-diagram/**`, `OTV/_components/NarrativeMarkdown/**` | W1, W4 | 2 |
| W8 — серверний модуль (A) | S18–S21 | `server/src/modules/onboarding/{types,constants,repository,service,routes}.ts`, `server/src/platform/container.ts`, `server/src/modules/index.ts`, `server/test/onboarding-service.test.ts`, `server/test/onboarding.it.test.ts` | W1, W2, W3, W6 | 3 |
| W9 — секції (A) | S22–S24 | `OTV/_components/{ArchitectureSection,CriticalPathsSection,ReadingPathSection,RunLocallySection,FirstTasksSection}/**` | W7 | 3 |
| W10 — chrome (A) | S25, S26 | `OTV/_components/{TourHeader,StatusBanner,TourUnavailable,OnThisPage}/**` | W7 | 3 |
| W11 — view і маршрут (A) | S27, S28 | `OTV/{OnboardingTourView.tsx,OnboardingTourView.test.tsx,index.ts,styles.ts}`, `client/src/app/repos/[repoId]/tour/page.tsx` | W9, W10 | 4 |
| W15 — серверна інтеграція наративу (B) | S38–S41 | `server/src/modules/onboarding/{types,constants,repository,routes}.ts` (передача від W8), `server/src/modules/onboarding/narrative-service.ts`, `server/src/platform/container.ts` (передача від W8), `server/src/platform/errors.ts`, `server/test/onboarding-narrative-service.test.ts`, `server/test/onboarding-narrative.it.test.ts` | W8, W12, W13 | 4 |
| W17 — наратив у секціях (B) | S42 | `OTV/_components/{ArchitectureSection,CriticalPathsSection,ReadingPathSection,RunLocallySection,FirstTasksSection}/**` (передача від W9) | W9, W14 | 4 |
| W16 — клієнтські дії наративу (B) | S43, S44 | `client/src/lib/hooks/tour.ts` (від W7), `OTV/_components/TourHeader/**` (від W10), `OTV/_components/{NarrativeControls,NarrativeStatus}/**`, `OTV/{OnboardingTourView.tsx,OnboardingTourView.test.tsx,styles.ts}` (від W11), `OTV/{helpers.ts,helpers.test.ts}` (від W7) | W11, W15, W17 | 5 |

**Передачі спільних файлів** (один власник на хвилю):

| Файл | Власники |
|---|---|
| `knowledge.ts` ×3 | лише W1 (хв. 1; містить і поля B) |
| `adapters.ts` | лише W2 (хв. 1; `grepAt` + поля `StructuredRequest`) |
| `container.ts` | W8 (хв. 3) → W15 (хв. 4) |
| `modules/index.ts` | лише W8 (хв. 3) |
| `onboarding/routes.ts`, `types.ts`, `constants.ts`, `repository.ts` | W8 (хв. 3) → W15 (хв. 4) |
| `onboarding/service.ts` | лише W8 (seam `TourOverlay` закладено в S19) |
| `onboarding.json` | лише W7 (хв. 2; містить ключі B) |
| `hooks/tour.ts`, `OTV/helpers.ts` | W7 (хв. 2) → W16 (хв. 5) |
| `TourHeader` | W10 (хв. 3) → W16 (хв. 5) |
| Секції | W9 (хв. 3) → W17 (хв. 4) |
| `OnboardingTourView.tsx` | W11 (хв. 4) → W16 (хв. 5) |

- **Перевірка перетинів:** у межах однієї хвилі жоден шлях не належить двом пакетам.

## Контекст
- **Навіщо:**
  - A: сайдбар має мітку без пункту, ендпоінта немає.
  - B: користувачеві потрібне пояснення «чому», а не лише «що», без вигаданих шляхів чи команд і без неочікуваних витрат.
- **INSIGHTS, що сформували план:**
  - `server/INSIGHTS.md:45` — feature-model без циклу контейнера;
  - `server/INSIGHTS.md:47` — мемоізувати сервіс зі станом у пам'яті;
  - `server/INSIGHTS.md:49,53-55` — без бічних імпортів; repo-intel лише через `types.ts`;
  - `server/INSIGHTS.md:59` — `test/**` не тайпчекається;
  - `server/INSIGHTS.md:61` — перечитати рядок перед оголошенням «мертвого» прогону;
  - `server/INSIGHTS.md:19` — вартість уже протягнута;
  - `client/INSIGHTS.md:39,41,45,47,49,55`.
- **Факти коду:**
  - Граф і ранги є лише в репозиторії repo-intel: `server/src/modules/repo-intel/repository.ts:434,451,536`.
  - Повний реіндекс не атомарний: `server/src/modules/repo-intel/pipeline/full.ts:203-262`.
  - Наявні git-порти: `server/src/vendor/shared/adapters.ts:250-262`.
  - JobRunner має глобальні timeout/retries: `server/src/platform/jobs.ts:41-42,63-78`.
  - SDK усередині `OpenRouterProvider` ретраїть 429/5xx двічі й має 90 с таймауту: `reviewer-core/src/llm/openrouter.ts:51-56`. `req.timeoutMs` не передається в HTTP: `openrouter.ts:71-86`. Re-prompt-цикл: `:99-117`.
  - Відсутній ключ дає `ConfigError`: `server/src/platform/container.ts:329-349`.
  - Глобальний rate-limit вимкнено в `test`: `server/src/app.ts:93-96`.
  - Конверт помилок `{ error: { code, message, details } }`: `server/src/app.ts:152-156`, тож 409 `{ reason }` мапить маршрут.
  - Legacy-таблиця `onboarding(repo_id PK→repos CASCADE, json jsonb, generated_at)`: `server/src/db/schema/context.ts:120-126`, без читачів і записувачів.
  - Промпт `server/src/prompts/onboarding.system.md:3-13` має інший набір секцій.
  - `MermaidDiagram` повертає `null` без сигналу: `client/src/components/mermaid-diagram/MermaidDiagram.tsx:58-59`.
  - Вендорний `Markdown` рендерить будь-який `href`: `client/src/vendor/ui/primitives/Markdown.tsx:30-34`.

## Зачеплені модулі
| Пакет | Lanes (routing.md) | Package manager | Перевірки |
|---|---|---|---|
| server | 2, 4, 5, 6, 8, 13, 14, 17, 18, 19, 20 (lanes 5 і 6 розширено в S7) | pnpm | `pnpm -C server lint` · `pnpm -C server typecheck` · `pnpm -C server arch:check` · `pnpm -C server exec vitest run --exclude '**/*.it.test.ts'` · `*.it.test.ts` — implementer не запускає |
| client | 2, 9, 10, 11, 12, 13, 17, 18 | pnpm | `pnpm -C client lint` · `pnpm -C client typecheck` (за потреби спершу `pnpm -C client exec next typegen`) · `pnpm -C client test` |
| reviewer-core | 3, 13, 19, 20 | npm | `npm --prefix reviewer-core run typecheck` · `npm --prefix reviewer-core test` |
| mcp-server | 21 | pnpm | `pnpm -C mcp-server typecheck` · `pnpm -C mcp-server test` |
| e2e | 15 (без змін файлів) | npm | `./scripts/e2e.sh` — лише головна сесія (флоу `06`) |
| tooling | 16 | — | `./scripts/check-shared-sync.sh` · команда coverage-invariant із `routing.md` |

## Обмеження
- **C1** — `server/src/modules/onboarding/(facts|narrative)/**` чисті. Дозволено імпортувати лише контракти та типи `@devdigest/shared`, власні файли папки та `zod`. Заборонено `db/*`, `adapters/*`, `platform/*`, `fastify`, `drizzle-orm`, `simple-git`, `openai`, `node:fs`, `process.env`; жодного I/O. Залежності (лічильник токенів, функція untrusted-фреймінгу, `now`) інжектуються параметрами. Джерело: onion-architecture; правило S7.
- **C2** — `OnboardingService` і `OnboardingNarrativeService` приймають вузькі порти, ніколи не `Container`. Гетери в контейнері мемоізовані через `??=`. Джерело: onion-architecture; `server/INSIGHTS.md:47`.
- **C3** — Без бічних імпортів. `onboarding/*` робить `import type` лише з `../repo-intel/types.js`. `project-context/*` та `intent/*` не імпортуються. Джерело: `server/INSIGHTS.md:49,53-55`; `server/.dependency-cruiser.cjs:82-92`.
- **C4** — Маршрути тонкі:
  - Zod `params` / `response` (`IdParams`: uuid, інакше 422);
  - `getContext` → один виклик сервісу → мапінг статусу;
  - 404 через `NotFoundError`;
  - 429 через новий `TooManyRequestsError`;
  - 409 `{ reason: 'tour_unavailable' }` мапиться з outcome-union сервісу (схема відповіді `NarrativeUnavailable`).

  Джерело: fastify-best-practices; onion-architecture, commandment 4; `server/AGENTS.md`.
- **C5** — Контракти:
  - поля snake_case;
  - Zod-константа і тип мають одне PascalCase-ім'я;
  - enum-значення в lower_snake;
  - три копії синхронізуються через `./scripts/check-shared-sync.sh --fix`, потім check;
  - `adapters.ts` не дзеркалиться.

  Джерело: root `AGENTS.md`; zod.
- **C6** — Вміст репозиторію читається лише з git-об'єктів на зафіксованому SHA (`listTree`, `readBlob`, `grepAt`) і ніколи не виконується. Джерело: A:AC-54, A:AC-56, A:NFR-5.
- **C7** — Ліміти читання:
  - `readBlob(oid, 512 KiB)`; `BlobTooLargeError` → пропустити й порахувати;
  - щонайбільше 50 маніфестів у порядку шляху;
  - збій парсингу → пропустити й порахувати, ніколи не 500.

  Для уривків наративу: ≤ 20 файлів, кожен ≤ 8 KiB. Джерело: A:AC-96, A:AC-97, B:AC-57.
- **C8** — Значення env ніколи не потрапляють у відповідь, логи, експорт чи LLM-вхід. Файли `.env*` (крім імен змінних з example-файлів) не потрапляють у вхід. Джерело: A:AC-65, A:AC-66, B:AC-12.
- **C9** — У логах лише метадані:
  - A: repo id, sha, тривалість, лічильники, skipped, причина;
  - B: provider, model, токени, вартість, тривалість, outcome, причина, fallback-секції.

  Ніколи текст файлів, промпту, уривків, виходу моделі. Джерело: A:NFR-7, B:NFR-7; security (A09).
- **C10** — argv git — лише масив:
  - `assertSafeRef` для SHA;
  - патерни лише через `-e`, без NUL;
  - pathspecs після `--` з перевіркою `assertSafePath`;
  - без shell.

  Джерело: security; `server/src/adapters/git/show-file-at-guard.ts:59-109`.
- **C11** — Детермінізм: явні компаратори, шляхи порівнюються code-unit-ом (без `localeCompare`), сортування перед обрізанням. Джерело: A:NFR-4.
- **C12** — Дані на клієнті лише через `src/lib/hooks/*` → `src/lib/api.ts`. Джерело: `client/AGENTS.md`.
- **C13** — Один компонент на файл `_components/<Name>/<Name>.tsx` + `index.ts` + тест поруч. Сторінка тонка, у `<Suspense>`. Джерело: root `AGENTS.md`; frontend-architecture; next-best-practices.
- **C14** — Увесь текст UI — у `client/messages/en/onboarding.json`. Без `<літера` у повідомленнях. Текст репозиторію та наратив — дослівно. Простір імен `onboarding` додається у провайдери тестів. Джерело: A:NFR-9, B:NFR-9; `client/INSIGHTS.md:39,41`.
- **C15** — У тестах `fireEvent`, `vi.mock` для хуків (як `ProjectContextView.test.tsx`), без `user-event`. Джерело: react-testing-library; `client/INSIGHTS.md:47`.
- **C16** — Вимірювання DOM і observer-и працюють через callback-ref у стані, не через `useRef` з `[]`. Джерело: `client/INSIGHTS.md:45`.
- **C17** — Текст репозиторію та виходу моделі рендериться як текст.
  - Без `dangerouslySetInnerHTML` і без `rehype-raw`.
  - Посилання — лише `repo:` (D4) → GitHub на потрібному SHA.
  - Mermaid лише `securityLevel: "strict"`; згенеровані id та екрановані мітки для фактів; для наративу — fallback через `onInvalid`.

  Джерело: A:NFR-5, B:AC-71–73; security (XSS).
- **C18** — GitHub-посилання: файл → `githubBlobUrl`, директорія → `githubTreeUrl`, посегментне кодування, прив'язка до SHA, `target="_blank" rel="noopener noreferrer"`. Джерело: A:AC-49, B:AC-97.
- **C19** — Без змін залежностей, lockfile-ів і міграцій. Джерело: root `AGENTS.md`.
- **C20** — Споживачі змінених інтерфейсів оновлюються в тому ж кроці; тести сервера — єдиний runtime-сигнал. Джерело: `server/INSIGHTS.md:59`.
- **C21** — Єдиний споживач старого контракту, `server/test/contracts.test.ts:151-155`, оновлюється. Заміна не ламає API (старої форми не віддавав жоден ендпоінт). Джерело: breaking-change / response-schema.
- **C22** — Один LLM-виклик:
  - `maxRetries: 0` (без re-prompt);
  - `httpRetries: 0`;
  - `timeoutMs: 60_000` (передається в HTTP-запит) плюс обгортка `withTimeout(60_000)`;
  - `requireStructuredProviders: true`;
  - `maxTokens: NARRATIVE_MAX_TOKENS` (8000);
  - JobRunner не використовується.

  Джерело: B:AC-2, B:AC-14, B:AC-44, B:AC-49, B:AC-50.
- **C23** — Схема виходу для моделі поблажлива: кожна секція nullable, без `maxLength`. Довжини та ліміти перевіряються після парсингу посекційно; невалідна секція → fallback. Джерело: B:AC-62, B:AC-63; `reviewer-core/src/llm/openrouter.ts:99-117`.
- **C24** — Grounding:
  - шлях, якого немає на `source_sha`, → елемент відкидається;
  - команди лише з фактів за `command_id`, текст команд моделі відкидається;
  - числа лише з фактів;
  - complexity лише `low | medium`;
  - невідомі `task_id` / `command_id` відкидаються;
  - діаграма: `flowchart`, ≤ 20 вузлів.

  Джерело: B:AC-20, B:AC-64, B:AC-66–70, B:AC-76–79.
- **C25** — Увесь текст із репозиторію у вході обгортається untrusted-фреймінгом (`wrapUntrusted`, `server/src/platform/prompt.ts:48`, інжектується). Інструкція велить вважати його даними. Джерело: B:AC-60, B:AC-61.
- **C26** — Стан генерації:
  - single-flight `Map<repoId, generationId>` у мемоізованому сервісі;
  - ковзне вікно 10/хв на `workspaceId` у сервісі;
  - `interrupted` обчислюється при читанні: рядок `generating`, а id не in-flight або старіший за 90 с; перед записом рядок перечитується.

  Джерело: B:AC-6, B:AC-51, B:AC-52, B:AC-84, B:AC-85; `server/INSIGHTS.md:61`.
- **C27** — Зберігання:
  - один upsert на перехід стану;
  - jsonb валідується Zod (`safeParse`; зіпсований рядок = відсутній);
  - збій ніколи не перезаписує `narrative` (лише `generation`);
  - FK `23503` → «відкинуто», нічого не збережено.

  Джерело: B:AC-80–83, B:AC-86, B:NFR-4; drizzle-orm-patterns.
- **C28** — `GET /tour` не робить LLM-викликів. Оверлей = одне читання сховища + `resolveFeatureModel` + синхронний `priceBook.estimate`. Наратив не кешується разом із фактами; `outdated` обчислюється на кожному запиті. Джерело: A:AC-5, B:AC-4, B:NFR-1.
- **C29** — Resync чи reindex ніколи не стартують генерацію: жодного job handler для наративу, жодного enqueue з repo-intel. Джерело: B:AC-40.

## Кроки

### S1 — Контракт `Onboarding` (A + поля B)
- package: W1
- files: modify `server/src/vendor/shared/contracts/knowledge.ts`.
  - Видалити `OnboardingLink`, `OnboardingSection` і старий `Onboarding` (`:28-47`).
  - Додати схеми A за розділом *Contracts* специфікації A:
    - `OnboardingAvailability`, `OnboardingIndexStatus`, `OnboardingIndexInfo`, `CriticalTag`;
    - `OnboardingStackEntry`, `OnboardingModule`, `OnboardingDiagram`, `OnboardingArchitecture`;
    - `OnboardingCriticalItem`, `OnboardingCriticalPaths`;
    - `OnboardingCommandWarning`, `OnboardingCommand`, `OnboardingCommandGroup`, `OnboardingRunLocally`;
    - `OnboardingReadingItem`, `OnboardingReadingPath`;
    - `OnboardingFirstTask`, `OnboardingFirstTasks`;
    - `OnboardingSections`.
  - **(A2)** Додати схеми B за розділом *Contracts* специфікації B:
    - `NarrativeStatus`, `NarrativeFailureReason`, `NarrativeSectionKey`;
    - `OnboardingNarrativeFailure` (`reason`, `at`, **`provider`, `model`** — D3);
    - `OnboardingNarrativeSections`, `OnboardingNarrative`, `OnboardingEstimatedCost`;
    - `NarrativeGenerateAccepted` (`status: 'accepted'`, `generation_id`, `already_running`);
    - `NarrativeUnavailable` (`reason: 'tour_unavailable'`).
  - `Onboarding` = поля A + `narrative: OnboardingNarrative.nullable()` + `estimated_cost: OnboardingEstimatedCost.nullable()`.
  - Правила полів: `computed_at` / `generated_at` / `at` — `z.string().datetime()`; цілі — `int().nonnegative()`.
- skills: zod — lane 2; typescript-expert — lane 13.
- constraints: C5, C21
- covers: A:AC-8, A:AC-57, A:AC-66, A:NFR-8, B:NFR-8
- reuse: розділи *Contracts* обох специфікацій.
- done-when: усі схеми експортовано з однойменними типами; `OnboardingSection` / `OnboardingLink` поза `docs/` не знаходяться.
- depends-on: —

### S2 — Дзеркала та реекспорт клієнтських типів
- package: W1
- files:
  - `client/` та `mcp-server/` копії `knowledge.ts` через `./scripts/check-shared-sync.sh --fix`;
  - `client/src/lib/types.ts`: реекспорт типів з S1, разом із `OnboardingNarrative`, `OnboardingNarrativeSections`, `NarrativeFailureReason`, `NarrativeGenerateAccepted`, `OnboardingEstimatedCost`.
- skills: zod; frontend-architecture — lane 11.
- constraints: C5
- covers: A:NFR-8, B:NFR-8
- done-when: `./scripts/check-shared-sync.sh` повертає 0; `pnpm -C mcp-server typecheck`, `pnpm -C mcp-server test` і `pnpm -C client typecheck` чисті.
- depends-on: S1

### S3 — Тест контракту
- package: W1
- files: modify `server/test/contracts.test.ts` (T1).
- skills: zod
- constraints: C21
- covers: A:AC-8, A:AC-57, A:NFR-8, B:NFR-8
- done-when: T1 проходить.
- depends-on: S1

### S4 — Порти: `GitClient.grepAt` + поля `StructuredRequest` (A4)
- package: W2
- files:
  - `server/src/vendor/shared/adapters.ts`:
    - `GitGrepMatch { path; line }`;
    - `grepAt(repo, sha, patterns, opts?: { pathspecs?; ignoreCase?; maxPerFile?; maxResults? })` з JSDoc «лише git-об'єкти»;
    - **(A4)** у `StructuredRequest`: `httpRetries?: number` (HTTP-ретраї SDK на запит) та `requireStructuredProviders?: boolean` (обмеження маршрутизації OpenRouter). Обидва опційні, тож поведінка за замовчуванням не змінюється.
  - `server/src/adapters/git/show-file-at-guard.ts`: `assertSafeGrepArgs`.
  - `server/src/adapters/git/simple-git.ts`: `['grep', '-n', '-I', '--null', '--no-color', …, ...patterns.flatMap(p => ['-e', p]), sha, '--', ...pathspecs]`, зняти префікс `<sha>:`, вихід 1 → `[]`, обрізати до `maxResults`.
  - `server/src/adapters/mocks.ts`: `MockGitOptions.grep`, `grepError`, `grepCalls`.
  - create `server/test/git-grep.test.ts` (T2).
- skills: onion-architecture — lane 8; security — lane 14; typescript-expert.
- constraints: C6, C10, C20
- covers: A:AC-54, A:NFR-5 (опора для B:AC-44, B:AC-49)
- reuse: `server/src/adapters/git/simple-git.ts:158-173`; `server/test/git-tree.test.ts:12-60`.
- done-when: T2 проходить; typecheck і `arch:check` чисті.
- depends-on: —

### S5 — Фасадний метод `RepoIntel.getGraphFacts`
- package: W3
- files:
  - `server/src/modules/repo-intel/types.ts`: тип `GraphFacts` + метод.
  - `repository.ts`: `getAllFileRank` і `getAllFileFacts` → доменні форми.
  - `service.ts`: реалізація; прапорець вимкнено → порожні масиви.
  - тести `server/test/repo-intel-facade-degraded.test.ts`, `server/test/repo-intel-graph-facts.test.ts` (T3).
  - у `server/test/conventions.it.test.ts:78-80` додати `getGraphFacts: notImplemented`.
- skills: onion-architecture; drizzle-orm-patterns — lane 6; typescript-expert.
- constraints: C3, C20
- covers: A:AC-14, A:AC-15, A:AC-16, A:AC-28, A:AC-29, A:AC-58
- reuse: `server/src/modules/repo-intel/repository.ts:434-462,536-552`; `service.ts:653-670`.
- done-when: T3 проходить; typecheck і `arch:check` чисті.
- depends-on: —

### S6 — Пункт сайдбару, `activeKeyFor`, `githubTreeUrl`
- package: W4
- files:
  - `client/src/vendor/ui/nav.ts`: `{ key: "onboarding-tour", label: "Onboarding Tour", icon: "Layers", href: "/repos/:repoId/tour" }` між `pulls` і `context`.
  - `client/src/components/app-shell/helpers.ts:29`: `/^\/repos\/[^/]+\/tour(\/|$)/` → `"onboarding-tour"`; `/onboarding` → `""`.
  - `client/src/components/app-shell/helpers.test.ts` (T4).
  - `client/src/lib/github-urls.ts`: `githubTreeUrl`; тест `client/src/lib/github-urls.test.ts` (T5).
- skills: frontend-architecture; react-testing-library; typescript-expert.
- constraints: C18
- covers: A:AC-1, A:AC-2, A:AC-3, A:AC-4, A:AC-49, A:EC-15, A:EC-19
- done-when: T4 і T5 проходять; typecheck і lint чисті.
- depends-on: —

### S7 — Tooling для чистих папок і `*-service.ts`
- package: W5
- files:
  - `.claude/skills/pr-self-review/routing.md`:
    - lane 5 + `server/src/modules/*/facts/**`, `server/src/modules/*/narrative/**`, `server/src/modules/*/*-service.ts`;
    - lane 6 + `server/src/modules/*/*-repository.ts` (на майбутнє; у цьому плані не використовується).
  - `.claude/agents/implementer.md:86`: ті самі глоби в рядку onion-architecture.
  - `server/.dependency-cruiser.cjs`:
    - нове правило `pure-folders-are-pure` (severity `error`, `from: '^src/modules/[^/]+/(facts|narrative)/'`, `to: ['^src/(db|adapters|platform)/', '^src/modules/[^/]+/(service|routes|repository|[a-z-]+-service)', 'node_modules/(drizzle-orm|fastify|postgres|simple-git|octokit|openai)', '^node:fs', '^fs$']`);
    - `from` правил `service-names-no-persistence` і `service-takes-ports-not-container` розширити до `(service|run-executor|helpers|constants|[a-z-]+-service)\.ts$` (у межах кожного правила — лише з наявними у ньому іменами плюс `[a-z-]+-service`).
- skills: onion-architecture (enforcement.md).
- constraints: C1, C2
- covers: — (забезпечує C1 і C2)
- reuse: `server/.dependency-cruiser.cjs:59-80,82-92`.
- done-when: `pnpm -C server arch:check` = 0 помилок; coverage-invariant не друкує нового.
- depends-on: —

### S8 — facts: типи, константи, правила шляхів
- package: W6
- files:
  - create `server/src/modules/onboarding/facts/types.ts`: `TourTreeFile`, `TourReadFile`, `TourGraph` (локальна структурна копія), `TourGrepHits`, `TourInput`.
  - create `facts/constants.ts`: ліміти A, ваги Appendix B, ключові слова, виключення, фази, шаблон summary англійською.
  - create `facts/paths.ts`: `isExcluded`, `topLevelModule`, `hasTestFile`, `matchesKeyword`, `comparePath`.
  - create `server/test/onboarding-facts-paths.test.ts` (T6).
- skills: onion-architecture (lane 5 після S7); typescript-expert.
- constraints: C1, C11
- covers: A:AC-19, A:NFR-3
- done-when: T6 проходить; `arch:check` чистий.
- depends-on: S1, S7

### S9 — facts: вибір маніфестів, екстрактори, правила екосистем
- package: W6
- files:
  - create `facts/manifests.ts` (`selectFilesToRead` + вузькі екстрактори: `package.json`, `pnpm-workspace.yaml`, `pyproject.toml`, `Cargo.toml`, `go.mod`/`go.work`, `pom.xml`, `settings.gradle`, `*.csproj`, `composer.json`, `Gemfile`; збій → `null`).
  - create `facts/ecosystems.ts`: таблиця Appendix A, точки входу (разом із `goMain` / `springApp`), команди, `by_convention`, lifecycle-хуки, правило монорепо.
  - create `server/test/onboarding-facts-ecosystems.test.ts` (T7).
- skills: onion-architecture; security (недовірений парсинг); typescript-expert.
- constraints: C1, C7, C11
- covers: A:AC-11, A:AC-22, A:AC-25, A:AC-62, A:AC-96, A:EC-7, A:EC-10, A:EC-11
- done-when: T7 проходить; зіпсований маніфест не кидає виняток і рахується як skipped.
- depends-on: S8

### S10 — facts: README, env-example, run-locally
- package: W6
- files:
  - create `facts/readme.ts` (заголовки та fenced-блоки, `detectRemoteCode`).
  - create `facts/env-example.ts` (`envNames`, лише імена).
  - create `facts/run-locally.ts`: фази install → environment → infrastructure → dev → test; нумерація з 1; root + ≤ 3 пакети; ≤ 10 команд у групі; `id = ${package_path}#${phase}#${index}`.
  - тести `server/test/onboarding-facts-readme.test.ts` (T8), `server/test/onboarding-facts-run-locally.test.ts` (T9).
- skills: onion-architecture; security.
- constraints: C1, C8, C11
- covers: A:AC-20, A:AC-21, A:AC-22, A:AC-25, A:AC-26, A:AC-60–A:AC-66, A:EC-6, A:EC-7, A:EC-8, A:EC-9, A:NFR-3
- done-when: T8 і T9 проходять (жодне значення env не потрапляє в `JSON.stringify` результату).
- depends-on: S9

### S11 — facts: критичність, архітектура, шлях читання, перші задачі
- package: W6
- files:
  - create `facts/criticality.ts`, `facts/architecture.ts`, `facts/reading-path.ts`, `facts/first-tasks.ts`.
  - тести `onboarding-facts-criticality` (T10), `onboarding-facts-architecture` (T11), `onboarding-facts-reading-path` (T12), `onboarding-facts-first-tasks` (T13).
  - Логіка та сама, що в плані A:
    - ваги та тайбрейки;
    - директорія migrations — один елемент;
    - `route_count` / `importer_count` або `null`;
    - діаграма ≤ 20 вузлів, id `m0..`;
    - BFS шляху читання ≤ 7;
    - задачі ≤ 4.
- skills: onion-architecture; typescript-expert.
- constraints: C1, C11
- covers: A:AC-12–A:AC-17, A:AC-19, A:AC-28–A:AC-32, A:AC-58, A:AC-59, A:EC-2, A:EC-17, A:EC-18, A:EC-19, A:NFR-3
- done-when: T10–T13 проходять.
- depends-on: S8, S9

### S12 — facts: збірка секцій
- package: W6
- files: create `facts/tour.ts` (`buildSections(input): OnboardingSections`, `graph_available = edges.length > 0`); `server/test/onboarding-facts-tour.test.ts` (T15).
- skills: onion-architecture; zod.
- constraints: C1, C11
- covers: A:NFR-3, A:NFR-4, A:AC-97, A:EC-2
- done-when: T15 проходить (`OnboardingSections.parse`, інваріантність до перемішування входу).
- depends-on: S10, S11, S13

### S13 — facts: рішення про доступність
- package: W6
- files: create `facts/availability.ts` (`decideAvailability`, `toIndexInfo`); `server/test/onboarding-facts-availability.test.ts` (T14).
- skills: onion-architecture
- constraints: C1
- covers: A:AC-8, A:AC-9, A:AC-10, A:EC-1, A:EC-5
- done-when: T14 проходить.
- depends-on: S8

### S14 — i18n-простір `onboarding` (A + ключі B, A5)
- package: W7
- files: переписати `client/messages/en/onboarding.json` (зараз без викликів).
  - **Ключі A:** `title`, `crumb`, `fromFacts`, `header.*`, `sections.*`, `collapse`, `expand`, `onThisPage`, `jumpTo`, `states.*`, `empty.*`, `architecture.*`, `critical.*`, `runLocally.*`, `readingPath.*`, `firstTasks.*`, `export.*` (перелік як у плані A).
  - **(A5) Ключі B:**
    - `aiWritten` «AI-written»;
    - `narrative.generate` «Generate narrative», `narrative.regenerate` «Regenerate», `narrative.generating` «Generating…», `narrative.regeneratingNote` «Regenerating»;
    - `narrative.approx` «approx. {cost}», `narrative.costUnknown` «cost unknown», `narrative.costNotReported` «cost not reported»;
    - `narrative.generatedLine` «Generated {time} from commit {sha} · {model} · {cost}»;
    - `narrative.outdated` «Outdated — repository changed since»;
    - `narrative.updated` «Narrative updated», `narrative.failedAnnounce` «Generation failed»;
    - `narrative.failure.{llm_timeout, llm_error, invalid_output, interrupted}`, `narrative.retry`;
    - `narrative.missingKey` «Add an API key for {provider} in Settings», `narrative.noStructuredProvider` «No provider for {model} supports structured output — choose another model in Settings», `narrative.openSettings`;
    - `narrative.rateLimited` «Too many generation requests — try again in a minute»;
    - `narrative.notInIndex` «Not in current index»;
    - `narrative.aiDiagramUnavailable` «AI diagram unavailable»;
    - `export.aiWritten`, `export.fromFacts`.
- skills: frontend-architecture (i18n).
- constraints: C14
- covers: A:NFR-9, A:AC-34, A:AC-37, A:AC-69, A:AC-71, A:AC-74, A:AC-83, A:AC-85, A:AC-87, B:NFR-9, B:AC-35, B:AC-36, B:AC-37, B:AC-38, B:AC-39, B:AC-88, B:AC-89, B:AC-90, B:AC-92, B:AC-94, B:AC-96, B:AC-100, B:AC-104, B:AC-23
- done-when: валідний JSON з усіма ключами; жодного `<[A-Za-z]` (перевіряє T16).
- depends-on: —

### S15 — Хук даних (A5: polling seam)
- package: W7
- files:
  - create `client/src/lib/hooks/tour.ts`: `useRepoTour(repoId)` з `refetchInterval: (q) => q.state.data?.narrative?.status === "generating" ? 1500 : false`;
  - `client/src/lib/hooks/index.ts`: `export * from "./tour"`.
- skills: frontend-architecture; react-best-practices.
- constraints: C12
- covers: A:AC-5, A:AC-70, B:AC-91, B:EC-18
- reuse: `client/src/lib/hooks/context.ts:23-35`; `useRepoIntelStatus` і `useResyncRepoIntel` (`client/src/lib/hooks/repo-intel.ts:26-50`); `useRefreshRepo` (`client/src/lib/hooks/core.ts:80-88`).
- done-when: typecheck чистий.
- depends-on: S2

### S16 — Допоміжні функції та константи view
- package: W7
- files: create `OTV/constants.ts` (`SECTION_IDS`, `NARROW_BREAKPOINT_PX = 1024`, `INDEX_POLL_MS = 1500`); `OTV/helpers.ts` (`parseHash`, `fenceFor`, `exportFileName`, `buildMarkdown(tour: Onboarding, repoName, t)` — приймає весь `Onboarding`, тож у S44 розширюється лише реалізація; `summaryArgs`, `taskTitleKey`, `fileUrl(repoFullName, sha, path, kind)`, `splitForMiddleTruncation`); `OTV/helpers.test.ts` (T16).
- skills: frontend-architecture; react-testing-library.
- constraints: C8, C14, C18
- covers: A:AC-42, A:AC-43, A:AC-49, A:AC-88, A:AC-89, A:AC-90, A:NFR-9, A:EC-14, A:EC-15, A:EC-19
- done-when: T16 проходить.
- depends-on: S14, S6

### S17 — Листові компоненти (A5: варіант мітки)
- package: W7
- files:
  - `OTV/_components/TourSection/` — **(A5)** проп `origin: "facts" | "ai"` → мітка «From repository facts» / «AI-written»; колапс-кнопка `aria-expanded` з ім'ям «Collapse/Expand <title>»; заголовок `tabIndex={-1}` зі `scroll-margin-top`; слот `emptyMessage`; керований `expanded` / `onToggle`.
  - `OTV/_components/MiddleTruncatedPath/`.
  - `OTV/_components/CommandRow/` (копіювання, fallback, попередження, `onCopied`).
  - `OTV/_components/OpenOnGitHub/` (приймає `sha`, тож B може передати SHA наративу).
  - тести T17–T20.
- skills: react-best-practices; frontend-architecture; react-testing-library.
- constraints: C13, C14, C15, C17, C18
- covers: A:AC-21, A:AC-22, A:AC-25, A:AC-26, A:AC-34, A:AC-49, A:AC-74, A:AC-80, A:AC-81, A:AC-82–A:AC-85, A:AC-91–A:AC-95, A:EC-12, A:EC-13, A:NFR-6, B:AC-36 (seam)
- done-when: T17–T20 проходять; lint чистий.
- depends-on: S14, S16

### S18 — Порти модуля та репозиторій (A)
- package: W8
- files:
  - create `server/src/modules/onboarding/types.ts`:
    - `TourRepo`, `TourRepoStore`;
    - `TourIndex = Pick<RepoIntel, 'getIndexState' | 'getGraphFacts'>`;
    - `TourGit = Pick<GitClient, 'listTree' | 'readBlob' | 'grepAt'>`;
    - `TourLogger`;
    - **(A1)** `TourFacts` (`index`, `availability`, `source_sha`, `computed_at`, `sections`, `treeIndex: ReadonlyMap<string, { oid; size; kind }>`);
    - **(A1)** `TourOverlay { forTour(workspaceId, repoId, factsSha: string | null): Promise<{ narrative; estimated_cost }> }`.
  - create `constants.ts` (`TOUR_CACHE_MAX = 32`, патерни та pathspecs для grep).
  - create `repository.ts` (`OnboardingRepository implements TourRepoStore`).
- skills: onion-architecture; drizzle-orm-patterns.
- constraints: C2, C3
- covers: A:AC-7
- done-when: typecheck і `arch:check` чисті.
- depends-on: S4, S5

### S19 — Сервіс фактів: кеш лише фактів, `getFacts`, seam оверлею (A1)
- package: W8
- files: create `server/src/modules/onboarding/service.ts`. `OnboardingService(store, index, git, overlay: TourOverlay = NULL_OVERLAY, now)`.
  - `getFacts(workspaceId, repoId, logger?)`:
    - потік з A:S19 (404 → `getIndexState` → доступність → кеш → `listTree` → `getGraphFacts` → читання з лімітами → `grepAt` → `buildSections` → лог);
    - у LRU кешуються лише `TourFacts` (з `treeIndex`), тільки для `available`;
    - single-flight на ключ.
  - `getTour(workspaceId, repoId, logger?)` = `getFacts` + `overlay.forTour(..., facts.source_sha)` → `Onboarding`. `NULL_OVERLAY` повертає `{ narrative: null, estimated_cost: null }`.
  - `server/test/onboarding-service.test.ts` (T21): додано перевірки, що оверлей викликається на кожному запиті й не кешується.
- skills: onion-architecture; security; typescript-expert.
- constraints: C2, C3, C6, C7, C8, C9, C11, C28
- covers: A:AC-5, A:AC-7, A:AC-8, A:AC-9, A:AC-10, A:AC-54, A:AC-56, A:AC-57, A:AC-96, A:AC-97, A:NFR-1, A:NFR-2, A:NFR-4, A:NFR-5, A:NFR-7, A:EC-1, A:EC-3, A:EC-4, A:EC-5, A:EC-11, B:AC-4 (seam), B:AC-55 (`getFacts`)
- reuse: `server/src/modules/project-context/service.ts:53-63,305-330`; `BlobTooLargeError`.
- done-when: T21 проходить.
- depends-on: S18, S12, S13

### S20 — Маршрут, гетер контейнера, реєстр модулів (A)
- package: W8
- files:
  - create `onboarding/routes.ts` (`GET /repos/:id/tour`);
  - `server/src/platform/container.ts`: `get onboarding()` = `??= new OnboardingService(new OnboardingRepository(this.db), this.repoIntel, this.git)` (оверлей підключає S40);
  - `server/src/modules/index.ts`: `onboarding`.
- skills: fastify-best-practices; onion-architecture; security.
- constraints: C2, C4
- covers: A:AC-5, A:AC-7, A:NFR-8
- done-when: typecheck, lint, `arch:check` чисті; повний набір unit-тестів сервера зелений.
- depends-on: S19

### S21 — Інтеграційний тест A (написаний, не запускається)
- package: W8
- files: create `server/test/onboarding.it.test.ts` (T22).
- skills: fastify-best-practices; security.
- constraints: C20
- covers: A:AC-5, A:AC-7, A:AC-8, A:AC-9, A:AC-10, A:AC-54, A:AC-56, A:AC-57, A:AC-96, A:AC-97, A:NFR-2, A:NFR-7, A:NFR-8, A:EC-16
- done-when: файл існує; у звіті позначено «не запускався».
- depends-on: S20

### S22 — `ArchitectureSection` (A)
- package: W9
- files: `OTV/_components/ArchitectureSection/**` — summary з i18n, стек, модулі (текстова альтернатива), `MermaidDiagram` над `toMermaid(diagram)` або мітка «No import graph»; тест T23.
- skills: react-best-practices; frontend-architecture; react-testing-library.
- constraints: C13, C14, C15, C17
- covers: A:AC-11–A:AC-15, A:AC-34, A:AC-74, A:EC-17, A:NFR-6
- done-when: T23 проходить.
- depends-on: S17

### S23 — `CriticalPathsSection` і `ReadingPathSection` (A)
- package: W9
- files: `OTV/_components/CriticalPathsSection/**`, `OTV/_components/ReadingPathSection/**`; тести T24, T25.
- skills: react-best-practices; frontend-architecture; react-testing-library.
- constraints: C13, C14, C15, C18
- covers: A:AC-16, A:AC-17, A:AC-19, A:AC-28, A:AC-29, A:AC-30, A:AC-49, A:AC-58, A:AC-59, A:AC-74, A:AC-91
- done-when: T24 і T25 проходять.
- depends-on: S17

### S24 — `RunLocallySection` і `FirstTasksSection` (A)
- package: W9
- files: `OTV/_components/RunLocallySection/**`, `OTV/_components/FirstTasksSection/**`; тести T26, T27.
- skills: react-best-practices; frontend-architecture; react-testing-library.
- constraints: C13, C14, C15, C18
- covers: A:AC-20, A:AC-21, A:AC-22, A:AC-25, A:AC-26, A:AC-31, A:AC-32, A:AC-60–A:AC-65, A:AC-74, A:EC-6, A:EC-19, A:NFR-6
- done-when: T26 і T27 проходять.
- depends-on: S17

### S25 — `TourHeader` (A5: слоти), `StatusBanner`, `TourUnavailable`
- package: W10
- files: `OTV/_components/{TourHeader,StatusBanner,TourUnavailable}/**`.
  - **(A5)** `TourHeader` має слоти `actions?: ReactNode` (B: Generate/Regenerate, модель, оцінка) та `meta?: ReactNode` (B: рядок «Generated…», чип Outdated, inline-збій), а також кнопки Copy link і Export.
  - `TourUnavailable` для `not_cloned` → колбек (view під'єднує `useRefreshRepo`, **D1**).
  - Тест T28.
- skills: react-best-practices; frontend-architecture; react-testing-library.
- constraints: C13, C14, C15
- covers: A:AC-33, A:AC-37, A:AC-39, A:AC-71, A:AC-86, A:AC-88, A:NFR-6
- done-when: T28 проходить.
- depends-on: S17

### S26 — `OnThisPage` (A)
- package: W10
- files: `OTV/_components/OnThisPage/**`; тест T29.
- skills: react-best-practices; frontend-architecture; react-testing-library.
- constraints: C13, C14, C15, C16
- covers: A:AC-44, A:AC-46, A:AC-68, A:AC-75, A:AC-76–A:AC-79
- done-when: T29 проходить.
- depends-on: S16

### S27 — `OnboardingTourView` (A)
- package: W11
- files: `OTV/{OnboardingTourView.tsx,index.ts,styles.ts,OnboardingTourView.test.tsx}`.
  - Поведінка з A:S27: стани, polling not-indexed, D1, колапс, `navigate`, hash, scroll-spy, live-region, копіювання посилання, експорт.
  - Live-region оформлено як функцію `announce(text)`, яку повторно використовує S44.
  - Секції рендеряться з `origin="facts"`.
- skills: react-best-practices; frontend-architecture; next-best-practices; react-testing-library.
- constraints: C12, C13, C14, C15, C16
- covers: A:AC-37, A:AC-39, A:AC-42, A:AC-43, A:AC-44, A:AC-67–A:AC-70, A:AC-72, A:AC-73, A:AC-76–A:AC-80, A:AC-83, A:AC-86, A:AC-87, A:AC-88, A:EC-4, A:EC-14, A:EC-16
- reuse: `client/src/app/repos/[repoId]/context/_components/ProjectContextView/ProjectContextView.tsx:22-80`; `ProjectContextView.test.tsx:1-50`.
- done-when: T30 проходить; test, typecheck, lint чисті.
- depends-on: S22–S26

### S28 — Точка входу маршруту (A)
- package: W11
- files: create `client/src/app/repos/[repoId]/tour/page.tsx` (metadata + `<Suspense>`).
- skills: next-best-practices; frontend-architecture.
- constraints: C13
- covers: A:AC-1, A:AC-2
- done-when: `pnpm -C client exec next typegen && pnpm -C client typecheck` і lint чисті.
- depends-on: S27

### S29 — reviewer-core: маршрутизація, вимкнені HTTP-ретраї, таймаут запиту, `NoEligibleProviderError` (B)
- package: W12
- files:
  - `reviewer-core/src/llm/openrouter.ts`:
    - у `chat.completions.create(body, { maxRetries: req.httpRetries, timeout: req.timeoutMs })` передаються лише визначені значення, тож за замовчуванням поведінка незмінна;
    - коли `this.id === 'openrouter' && req.requireStructuredProviders`, у тіло додається `provider: { require_parameters: true }`;
    - відповідь «немає придатного endpoint» (форму підтверджує researcher, R-B1) → `throw new NoEligibleProviderError(model)`.
  - create `reviewer-core/src/llm/errors.ts` (`NoEligibleProviderError` з `name = 'NoEligibleProviderError'`).
  - `reviewer-core/src/index.ts`: експорт.
  - `reviewer-core/test/openrouter.test.ts` (T32).
- skills: onion-architecture — lane 3; typescript-expert; security (LLM A06).
- constraints: C22
- covers: B:AC-44, B:AC-49, B:AC-50 (через `maxRetries: 0`), B:AC-102, B:AC-14 (HTTP-таймаут), B:NFR-2, B:EC-22
- reuse: `reviewer-core/src/llm/openrouter.ts:58-121`; `reviewer-core/test/openrouter.test.ts` (з комміту 19fe28a).
- done-when: T32 проходить; `npm --prefix reviewer-core run typecheck` і `test` чисті; існуючі тести рев'ю та intent у сервері зелені.
- depends-on: S4 + відповідь researcher на R-B1 до реалізації мапінгу помилки

### S30 — narrative: типи та константи (B)
- package: W13
- files:
  - create `server/src/modules/onboarding/narrative/types.ts`: `NarrativeFactsInput` — структурний вхід: `Onboarding['sections']`, `source_sha`, `paths: ReadonlySet<string>`, `commandIds`, `taskIds`, `stack`, `modules`. Без залежності від W6.
  - `StoredNarrativeState` (Zod) = `{ narrative: <збережена добра частина OnboardingNarrative без status/outdated> | null, generation: { id, status: 'generating' | 'ready' | 'failed', started_at, last_failure } | null }`.
  - create `narrative/constants.ts`:

    | Константа | Значення |
    |---|---|
    | `MAX_INPUT_TOKENS` | 12000 |
    | `MAX_EXCERPTS` | 20 |
    | `MAX_EXCERPT_BYTES` | 8192 |
    | `NARRATIVE_MAX_TOKENS` | 8000 |
    | `NARRATIVE_TIMEOUT_MS` | 60000 |
    | `INTERRUPTED_AFTER_MS` | 90000 |
    | `RATE_LIMIT` | `{ max: 10, windowMs: 60000 }` |
    | `MAX_ARCH_BODY` | 1500 |
    | `MAX_DESC` | 140 |
    | `MAX_TASK_TITLE` | 80 |
    | `MAX_DIAGRAM_NODES` | 20 |
    | `ESTIMATE_INPUT_TOKENS` | 12000 |

- skills: onion-architecture (lane 5 після S7); zod; typescript-expert.
- constraints: C1
- covers: B:NFR-3
- done-when: typecheck і `arch:check` чисті.
- depends-on: S1, S7

### S31 — narrative: побудова LLM-входу (B)
- package: W13
- files:
  - create `narrative/input.ts`: `buildNarrativeInput({ facts, repoMap, excerpts, count, frame })`.
    - Заповнення за пріоритетом: точки входу > критичні файли > route facts > команди > repo map > уривок README, до ≤ 12000 токенів (`count` інжектується, `frame` = `wrapUntrusted`).
    - Уривки ≤ 20 і ≤ 8 KiB кожен.
    - Відкидаються шляхи `.env*` і значення env.
    - Повертає `{ userMessage, includedPaths, tokens }`.
  - Допоміжна `selectExcerptPaths(facts)` — детермінований перелік до 20 шляхів.
  - create `server/test/onboarding-narrative-input.test.ts` (T33).
- skills: onion-architecture; security (ASI01).
- constraints: C1, C8, C25
- covers: B:AC-12, B:AC-57, B:AC-58, B:AC-59, B:AC-60, B:NFR-5
- done-when: T33 проходить.
- depends-on: S30

### S32 — narrative: схема виходу та grounding (B)
- package: W13
- files:
  - create `narrative/output-schema.ts`: `NarrativeModelOutput` — поблажлива Zod-схема для `completeStructured`, кожна секція nullable, без `max`.
  - create `narrative/ground.ts`: `groundNarrative(output, facts) → { sections: OnboardingNarrativeSections, fallback: NarrativeSectionKey[] }`:
    - посекційна валідація довжин (1500, 140, 80, ≤ 20 вузлів);
    - відкидання невідомих шляхів, `task_id` і `command_id`;
    - для команд — лише перестановка в межах групи + ≤ 1 нотатка на `command_id`, без тексту команд;
    - числа ігноруються;
    - `complexity ∈ { low, medium }`;
    - порядок critical / reading — з фактів;
    - невалідна секція → `null` + до `fallback`.
  - create `server/test/onboarding-narrative-ground.test.ts` (T34).
- skills: onion-architecture; zod; security (ASI09).
- constraints: C1, C23, C24
- covers: B:AC-16 (top-level), B:AC-20, B:AC-22, B:AC-62, B:AC-63, B:AC-64, B:AC-66, B:AC-67, B:AC-68, B:AC-69, B:AC-70, B:AC-74, B:AC-75, B:AC-76, B:AC-77, B:AC-78, B:AC-79, B:EC-6, B:EC-7, B:EC-8, B:EC-17
- done-when: T34 проходить.
- depends-on: S30

### S33 — narrative: переписування посилань у Markdown і перевірка mermaid (B)
- package: W13
- files:
  - create `narrative/markdown-links.ts`: `rewriteLinks(md, paths)` (**D4**) — відомі шляхи в інлайн-коді або тексті → `[path](repo:path)`; усі інші `[x](url)` → `x`; HTML не чіпається (клієнт його не рендерить).
  - create `narrative/mermaid.ts`: `checkFlowchart(src)` — перший рядок `flowchart|graph`, ≤ 20 вузлів, інакше `null`.
  - create `server/test/onboarding-narrative-markdown.test.ts` (T35).
- skills: onion-architecture; security (XSS).
- constraints: C1, C17, C24
- covers: B:AC-23 (серверна частина), B:AC-65, B:AC-73, B:EC-9, B:EC-10
- done-when: T35 проходить.
- depends-on: S30

### S34 — narrative: подання статусу (B)
- package: W13
- files:
  - create `narrative/overlay.ts`: `toNarrativeView(stored, factsSha, now, isInFlight) → OnboardingNarrative | null`.
    - `outdated = stored.narrative.source_sha !== factsSha`;
    - `generating` і (`!isInFlight(id)` або `now - started_at > 90 с`) → `failed`, причина `interrupted`, з позначкою `needsPersistInterrupted`;
    - останній збій ніколи не прибирає `narrative`.
  - `estimateCost(model, estimate)` → `OnboardingEstimatedCost`.
  - create `server/test/onboarding-narrative-overlay.test.ts` (T36).
- skills: onion-architecture
- constraints: C1, C26
- covers: B:AC-37, B:AC-39, B:AC-84, B:AC-85, B:AC-95, B:NFR-4, B:EC-12, B:EC-14
- done-when: T36 проходить.
- depends-on: S30

### S35 — Переписаний промпт (B)
- package: W13
- files: переписати `server/src/prompts/onboarding.system.md`:
  - п'ять секцій B;
  - лише англійська;
  - шляхи, ідентифікатори й команди дослівно;
  - жодних команд, чисел чи складності від моделі;
  - посилання на елементи лише через `path`, `command_id`, `task_id` з фактів;
  - mermaid лише `flowchart`, ≤ 20 вузлів;
  - вміст `<untrusted>` — дані, не інструкції;
  - Markdown без HTML.

  Тест T33 перевіряє, що шаблон містить інструкції щодо untrusted та англійської.
- skills: security (ASI01); onion-architecture (шаблон завантажує `platform/prompts.ts`).
- constraints: C25
- covers: B:AC-13, B:AC-61
- reuse: `server/src/platform/prompts.ts:23-29`.
- done-when: T33 (частина про промпт) проходить.
- depends-on: —

### S36 — `MermaidDiagram.onInvalid` (B)
- package: W14
- files: modify `client/src/components/mermaid-diagram/MermaidDiagram.tsx` — опційний `onInvalid?: () => void` викликається, коли стан стає `invalid`. Наявні виклики не змінюються. Create `MermaidDiagram.test.tsx` (T37, mermaid мокається).
- skills: react-best-practices; frontend-architecture; react-testing-library.
- constraints: C17
- covers: B:AC-23, B:AC-72, B:EC-10
- done-when: T37 проходить; наявні тести клієнта зелені.
- depends-on: —

### S37 — `NarrativeMarkdown` (B)
- package: W14
- files: create `OTV/_components/NarrativeMarkdown/{NarrativeMarkdown.tsx,index.ts,NarrativeMarkdown.test.tsx}`.
  - `react-markdown` + `remark-gfm`, без `rehype-raw`.
  - `components.a`: `href` починається з `repo:` → `fileUrl(repoFullName, sha, path, kind)` з `target="_blank" rel="noopener noreferrer"`; інакше — текст.
  - `urlTransform` пропускає `repo:`.
  - Тест T38.
- skills: react-best-practices; frontend-architecture; react-testing-library; security.
- constraints: C13, C17, C18
- covers: B:AC-65, B:AC-71, B:AC-73, B:EC-9
- reuse: `client/src/vendor/ui/primitives/Markdown.tsx` (лише стилі; не патчити).
- done-when: T38 проходить.
- depends-on: S16 (`fileUrl`), S6

### S38 — `NarrativeStore` у репозиторії (B)
- package: W15 (передача `repository.ts` і `types.ts` від W8)
- files:
  - `onboarding/types.ts`: порт `NarrativeStore { read(repoId): Promise<StoredNarrativeState | null>; write(repoId, state): Promise<'ok' | 'repo_gone'> }`.
  - `onboarding/repository.ts`: реалізація над `t.onboarding`:
    - upsert `json`;
    - `generatedAt = now`;
    - `safeParse` при читанні;
    - перехоплення `23503` → `'repo_gone'`.
- skills: drizzle-orm-patterns; onion-architecture; postgresql-table-design (без змін схеми).
- constraints: C3, C27
- covers: B:AC-80, B:AC-82, B:AC-86, B:NFR-4, B:NFR-8
- done-when: typecheck і `arch:check` чисті.
- depends-on: S20, S30

### S39 — `OnboardingNarrativeService` (B)
- package: W15
- files: create `server/src/modules/onboarding/narrative-service.ts`.
  - Порти:
    - `store: NarrativeStore`;
    - `facts: { getFacts(workspaceId, repoId): Promise<TourFacts> }`;
    - `repoMap: Pick<RepoIntel, 'getRepoMap'>`;
    - `git: Pick<GitClient, 'readBlob'>`;
    - `llmFor`, `modelFor(workspaceId)`, `estimate(model, in, out)`, `count(text)`, `frame(label, text)`, `loadSystemPrompt()`, `now`.
  - `implements TourOverlay`: `forTour` = `store.read` + `toNarrativeView`; збереження `interrupted` з повторним читанням.
  - `requestGeneration(workspaceId, repoId, logger)` → `{ kind: 'rate_limited' } | { kind: 'not_found' } | { kind: 'unavailable' } | { kind: 'accepted', id, alreadyRunning }`, у порядку B-REC7:
    1. лімітер;
    2. `getFacts` (404 / доступність);
    3. single-flight;
    4. запис `generating`;
    5. `void this.run(...)`.

    Повертає без очікування LLM.
  - `run`:
    1. `modelFor`;
    2. `llmFor` — `ConfigError` дає `missing_key` без виклику;
    3. збирання входу (S31) з уривками через `readBlob` на SHA запиту;
    4. рівно один `completeStructured` з параметрами C22 у `withTimeout(60_000)`;
    5. `groundNarrative` + `rewriteLinks` + `checkFlowchart`;
    6. запис `ready` (`narrative` + `provider`, `model`, `tokens`, `cost`, `fallback_sections`);
    7. на збій — лише `generation.last_failure` з `provider` / `model` (**D3**);
    8. `'repo_gone'` → відкинути.
  - Експортована `classifyFailure(err)` (за `err.name`: `ConfigError` → `missing_key`, `TimeoutError` / abort → `llm_timeout`, `NoEligibleProviderError` → `no_structured_provider`, помилки парсингу / порожня відповідь → `invalid_output`, інше → `llm_error`). Лог B:NFR-7 через вузький логер.
  - create `server/test/onboarding-narrative-service.test.ts` (T39).
- skills: onion-architecture (lane 5 після S7); security (ASI, A06, A09); typescript-expert.
- constraints: C2, C3, C8, C9, C22, C23, C24, C25, C26, C27, C28, C29
- covers: B:AC-2, B:AC-4, B:AC-6, B:AC-8, B:AC-14, B:AC-15, B:AC-16, B:AC-47, B:AC-48, B:AC-49, B:AC-50, B:AC-51, B:AC-52, B:AC-53, B:AC-54, B:AC-55, B:AC-56, B:AC-80, B:AC-81, B:AC-82, B:AC-83, B:AC-84, B:AC-85, B:AC-86, B:AC-102, B:AC-103, B:NFR-1, B:NFR-2, B:NFR-4, B:NFR-5, B:NFR-7, B:EC-1, B:EC-2, B:EC-3, B:EC-4, B:EC-5, B:EC-11, B:EC-12, B:EC-13, B:EC-16, B:EC-19, B:EC-20, B:EC-21, B:EC-22
- reuse: `server/src/modules/intent/service.ts:152-222,306-327` (single-flight і виклик; форма, не імпорт); `server/src/platform/resilience.ts` (`withTimeout`).
- done-when: T39 проходить.
- depends-on: S38, S29, S31–S35

### S40 — Маршрут генерації, `TooManyRequestsError`, контейнер (B)
- package: W15 (передача `routes.ts`, `container.ts` від W8)
- files:
  - `server/src/platform/errors.ts`: `TooManyRequestsError` (`rate_limited`, 429).
  - `onboarding/routes.ts`: `POST /repos/:id/tour/narrative`:
    - `schema: { params: IdParams, response: { 202: NarrativeGenerateAccepted, 409: NarrativeUnavailable } }`;
    - мапінг outcome: `rate_limited` → `throw TooManyRequestsError`, `not_found` → `throw NotFoundError`, `unavailable` → `reply.code(409)` + `{ reason: 'tour_unavailable' }`, `accepted` → 202.
  - `container.ts`:
    - `get onboardingNarrative()` = `??= new OnboardingNarrativeService(new OnboardingRepository(this.db), this.onboarding, this.repoIntel, this.git, (p) => this.llm(p), (ws) => resolveFeatureModel(this, ws, 'onboarding'), (m, i, o) => this.priceBook.estimate(m, i, o), (s) => this.tokenizer.count(s), wrapUntrusted, () => loadPromptTemplate('onboarding.system.md'))`;
    - гетер `onboarding` отримує оверлей: тут розірвати цикл — `OnboardingService` бере `overlay` лінивим замиканням `{ forTour: (...a) => this.onboardingNarrative.forTour(...a) }`;
    - перевірити, що `arch:check` не знаходить `no-circular`.
- skills: fastify-best-practices; onion-architecture; security (A06).
- constraints: C2, C4, C28, C29
- covers: B:AC-6, B:AC-47, B:AC-48, B:AC-51, B:AC-53, B:AC-54, B:NFR-8, B:AC-40
- reuse: `server/src/modules/intent/routes.ts:28-38`; `server/src/platform/container.ts:151-160`; `server/INSIGHTS.md:45`.
- done-when: typecheck, lint, `arch:check` чисті; повний набір unit-тестів сервера зелений.
- depends-on: S39

### S41 — Інтеграційний тест B (написаний, не запускається)
- package: W15
- files: create `server/test/onboarding-narrative.it.test.ts` (T40) — `MockLLMProvider` / фейк, `MockGitClient`, фейк repo-intel, реальна Postgres.
- skills: fastify-best-practices; security.
- constraints: C20
- covers: B:AC-4, B:AC-6, B:AC-40, B:AC-47, B:AC-48, B:AC-51, B:AC-53, B:AC-80, B:AC-81, B:AC-82, B:AC-83, B:AC-84, B:AC-86, B:AC-102, B:AC-103, B:NFR-7, B:NFR-8
- done-when: файл існує; у звіті — «не запускався».
- depends-on: S40

### S42 — Наратив у секціях (B)
- package: W17 (передача секцій від W9)
- files: modify п'ять папок секцій (+ їхні тести T41). Нові опційні пропси: `narrative?: OnboardingNarrativeSections[<key>] | null`, `narrativeSha?: string`, `outdated?: boolean`, `currentPaths?: ReadonlySet<string>`.
  - `TourSection origin="ai"`, коли секція наративу не `null` (інакше `"facts"`).
  - Architecture: `NarrativeMarkdown` тіла замість шаблонного summary; `MermaidDiagram onInvalid` → діаграма фактів або список модулів + «AI diagram unavailable»; стек і модулі лишаються.
  - Critical / Reading: порядок фактів, опис за шляхом.
  - Run locally: команди фактів, перестановка в групі за `position`, нотатка за `command_id`.
  - First tasks: заголовок, опис і складність наративу за `task_id`; числа лише з фактів.
  - У стані outdated: елемент, шляху якого немає в `currentPaths`, отримує «Not in current index», а `OpenOnGitHub sha={narrativeSha}`.
- skills: react-best-practices; frontend-architecture; react-testing-library.
- constraints: C13, C14, C15, C17, C18
- covers: B:AC-22, B:AC-23, B:AC-36, B:AC-66, B:AC-67, B:AC-68, B:AC-69, B:AC-72, B:AC-74, B:AC-75, B:AC-76, B:AC-77, B:AC-78, B:AC-87, B:AC-96, B:AC-97, B:EC-6, B:EC-10, B:EC-15
- done-when: T41 проходить; старі T23–T27 зелені (без пропсів наративу поведінка A незмінна).
- depends-on: S22–S24, S36, S37

### S43 — Хук генерації та дії в хедері (B)
- package: W16 (передача `hooks/tour.ts`, `TourHeader` від W7 / W10)
- files:
  - `client/src/lib/hooks/tour.ts`: `useGenerateNarrative(repoId)` (`POST /repos/${repoId}/tour/narrative` → `NarrativeGenerateAccepted`; `onSuccess` інвалідує `["repo-tour", repoId]`).
  - create `OTV/_components/NarrativeControls/` — кнопка Generate / Regenerate:
    - `disabled` + «Generating…» поки `generating`;
    - модель + «approx.» / «cost unknown» з `estimated_cost`;
    - 429 (`ApiError.status === 429`) → повідомлення, кнопка лишається активною.
  - create `OTV/_components/NarrativeStatus/`:
    - «Generated {relative time} from commit {sha7} · {model} · {cost | cost not reported}»;
    - чип Outdated поруч з активним Regenerate;
    - inline-збій з причиною + Retry;
    - `missing_key` → посилання на `/settings/api-keys` з `provider` (D3);
    - `no_structured_provider` → `/settings/models` з `model` (D3).
  - `TourHeader` лише передає їх через слоти `actions` / `meta`.
  - Тести T42.
- skills: react-best-practices; frontend-architecture; react-testing-library.
- constraints: C12, C13, C14, C15
- covers: B:AC-35, B:AC-37, B:AC-38, B:AC-39, B:AC-88, B:AC-89, B:AC-94, B:AC-100, B:AC-101, B:AC-104, B:NFR-6, B:EC-21, B:EC-22
- reuse: `relativeTime` як патерн (`client/src/app/conventions/_components/ConventionsView/helpers.ts`; локальна копія, `client/INSIGHTS.md:19`).
- done-when: T42 проходить.
- depends-on: S25, S40 (контракт ендпоінта), S14

### S44 — Інтеграція наративу у view та експорт (B)
- package: W16 (передача view від W11, `helpers.ts` від W7)
- files:
  - `OTV/OnboardingTourView.tsx`:
    - передати пропси наративу в секції (S42) і контроли в хедер (S43);
    - примітка «Regenerating» поверх поточного вмісту під час `generating`;
    - переходи `generating` → `ready|failed` оголошуються через `announce` («Narrative updated» / «Generation failed»), без перезавантаження й без переміщення фокусу;
    - попередній наратив або факти лишаються видимими при збої.
  - `OTV/helpers.ts`: `buildMarkdown` додає текст наративу та мітку «AI-written» / «From repository facts» для кожної секції.
  - Розширити `OTV/OnboardingTourView.test.tsx` (T43) і `OTV/helpers.test.ts` (T44).
- skills: react-best-practices; frontend-architecture; react-testing-library.
- constraints: C12, C14, C15, C16, C17
- covers: B:AC-87, B:AC-90, B:AC-91, B:AC-92, B:AC-93, B:AC-95, B:AC-98, B:AC-99, B:AC-105, B:NFR-6, B:EC-18
- done-when: T43 і T44 проходять; test, typecheck, lint чисті.
- depends-on: S27, S42, S43

## План тестування
**A (без змін за суттю):**

| T# | Покриває | Файл | Рівень | Крок |
|---|---|---|---|---|
| T1 | A:AC-8, A:AC-57, A:NFR-8, B:NFR-8 (зразки з `narrative: null` і з повним наративом) | `server/test/contracts.test.ts` | unit | S3 |
| T2 | A:AC-54, A:NFR-5 | `server/test/git-grep.test.ts` | unit | S4 |
| T3 | A:AC-14, A:AC-58, A:AC-15/A:AC-29 | `server/test/repo-intel-graph-facts.test.ts`, `repo-intel-facade-degraded.test.ts` | unit | S5 |
| T4 | A:AC-1, A:AC-2, A:AC-3 | `client/src/components/app-shell/helpers.test.ts` | unit | S6 |
| T5 | A:AC-49, A:EC-15, A:EC-19 | `client/src/lib/github-urls.test.ts` | unit | S6 |
| T6–T15 | див. S8–S13 | `server/test/onboarding-facts-*.test.ts` | unit | S8–S13 |
| T16 | A:AC-42, A:AC-43, A:AC-88–90, A:NFR-9, B:NFR-9 (guard без `<тегів` на всьому `onboarding.json`) | `OTV/helpers.test.ts` | unit | S16 |
| T17–T20 | див. S17 + B:AC-36 (варіант `origin`) | `OTV/_components/*/*.test.tsx` | component | S17 |
| T21 | див. S19 + оверлей на кожен запит, некешований | `server/test/onboarding-service.test.ts` | unit | S19 |
| T22 | див. S21 | `server/test/onboarding.it.test.ts` | it — **не запускає implementer** | S21 |
| T23–T27 | див. S22–S24 | тести секцій | component | S22–S24 |
| T28 | A:AC-33, A:AC-37, A:AC-39, A:AC-71 | тести chrome | component | S25 |
| T29 | A:AC-68, A:AC-75, A:AC-44 (проп) | `OnThisPage.test.tsx` | component | S26 |
| T30 | див. S27 | `OnboardingTourView.test.tsx` | component | S27 |
| T31 | A:AC-4 | `e2e/specs/06-onboarding.flow.json` (без змін) через `./scripts/e2e.sh` | e2e — головна сесія | — |

**B:**

| T# | Покриває | Файл | Рівень | Крок |
|---|---|---|---|---|
| T32 | B:AC-44, B:AC-49, B:AC-50, B:AC-102, B:EC-22 — тіло містить `provider.require_parameters` лише з прапорцем; per-request `maxRetries: 0` / `timeout`; відповідь no-endpoint → `NoEligibleProviderError`; за замовчуванням без змін | `reviewer-core/test/openrouter.test.ts` | unit | S29 |
| T33 | B:AC-12, B:AC-13, B:AC-57–B:AC-61 — бюджет ≤ 12000; пріоритет; ≤ 20 × ≤ 8 KiB; `frame` на кожному репо-тексті; без `.env*` / значень; промпт: untrusted + English | `server/test/onboarding-narrative-input.test.ts` | unit | S31, S35 |
| T34 | B:AC-16, B:AC-20, B:AC-22, B:AC-62–B:AC-64, B:AC-66–B:AC-70, B:AC-74–B:AC-79, B:EC-6, B:EC-7, B:EC-8, B:EC-17 | `server/test/onboarding-narrative-ground.test.ts` | unit | S32 |
| T35 | B:AC-23 (сервер), B:AC-65, B:AC-73, B:EC-9, B:EC-10 | `server/test/onboarding-narrative-markdown.test.ts` | unit | S33 |
| T36 | B:AC-37, B:AC-39, B:AC-84, B:AC-85, B:AC-95, B:NFR-4, B:EC-12, B:EC-14 | `server/test/onboarding-narrative-overlay.test.ts` | unit | S34 |
| T37 | B:AC-23, B:AC-72 | `client/src/components/mermaid-diagram/MermaidDiagram.test.tsx` | component | S36 |
| T38 | B:AC-65, B:AC-71, B:AC-73, B:EC-9 | `OTV/_components/NarrativeMarkdown/NarrativeMarkdown.test.tsx` | component | S37 |
| T39 | див. S39: фейкові порти; 202 без очікування LLM; один виклик із прапорцями C22; single-flight; 11-й запит → `rate_limited`; `ConfigError` → `missing_key` без виклику; timeout / помилка / невалідний / no-provider → причини; збій не змінює `narrative`; `'repo_gone'` → нічого; логи без тексту промпту / виходу; `forTour` без виклику LLM | `server/test/onboarding-narrative-service.test.ts` | unit | S39 |
| T40 | див. S41: 202 / 409 / 404 / 422; 429 через сервісний лімітер (працює під `test`); видалення репо під час прогону → рядка немає; resync не створює рядок (B:AC-40); `GET /tour` адитивний | `server/test/onboarding-narrative.it.test.ts` | it — **не запускає implementer** | S41 |
| T41 | B:AC-22, B:AC-23, B:AC-36, B:AC-66–B:AC-69, B:AC-74–B:AC-78, B:AC-87, B:AC-96, B:AC-97, B:EC-15 | розширені тести секцій | component | S42 |
| T42 | B:AC-35, B:AC-37, B:AC-38, B:AC-39, B:AC-88, B:AC-89, B:AC-94, B:AC-100, B:AC-101, B:AC-104, B:EC-21 | `NarrativeControls.test.tsx`, `NarrativeStatus.test.tsx` | component | S43 |
| T43 | B:AC-90–B:AC-93, B:AC-95, B:AC-105, B:EC-18 | `OnboardingTourView.test.tsx` | component | S44 |
| T44 | B:AC-98, B:AC-99 | `OTV/helpers.test.ts` | unit | S44 |

- **Лише вручну:**
  - A: A:AC-44, A:AC-46, таймінги A:NFR-1, A:NFR-6.
  - B: оголошення live-region зі скрінрідером (B:NFR-6); підтвердження 202 з p95 ≤ 300 мс за теплого кешу (B:NFR-1); один реальний прогін з ключем OpenRouter і моделлю за замовчуванням (структурований вихід, вартість, чип Outdated після resync).
- **Команди:**
  - server: `pnpm -C server lint` · `pnpm -C server typecheck` · `pnpm -C server arch:check` · `pnpm -C server exec vitest run --exclude '**/*.it.test.ts'`
  - client: `pnpm -C client lint` · `pnpm -C client typecheck` · `pnpm -C client test`
  - reviewer-core: `npm --prefix reviewer-core run typecheck` · `npm --prefix reviewer-core test`
  - mcp-server: `pnpm -C mcp-server typecheck` · `pnpm -C mcp-server test`
  - спільне: `./scripts/check-shared-sync.sh`
  - e2e (головна сесія, після хвилі 5): `./scripts/e2e.sh`
- **Multi-agent:** implementer-и запускають цільові тести та typecheck своїх пакетів. Повна таблиця — один раз на хвилю в головній сесії.

## Ризики та відкриті питання
- **R-B1 (researcher, блокує мапінг помилки в S29).** Точна семантика `provider: { require_parameters: true }` в OpenRouter для `response_format: json_schema` та форма відповіді, коли придатного endpoint немає (HTTP-статус і текст). До відповіді S29 реалізує лише передачу прапорця.
- **R-B2 (researcher).** Чи підтримує встановлений `openai` (^4.77) per-request опції `{ maxRetries, timeout }` у `chat.completions.create(body, options)`. T32 закріплює поведінку.
- **R-B3 (researcher, неблокуючий).** Що `react-markdown` v9 без `rehype-raw` не рендерить сирий HTML, і як `urlTransform` поводиться зі схемою `repo:`. T38 закріплює поведінку.
- **R-B4.** Асинхронний `keyGenerator` у `@fastify/rate-limit` **не потрібен**: ліміт 10/хв на workspace реалізовано в сервісі (C26). Глобальний ліміт плагіна 120/хв лишається як є.
- **R-B5.** Підтвердження ≤ 300 мс (B:NFR-1) покладається на теплий кеш фактів (сторінка щойно завантажила `GET /tour`). Холодний `getFacts` може тривати до 2 с (A:NFR-1) — ручне вимірювання.
- **R-B6.** Single-flight і виявлення рестарту зберігаються в пам'яті процесу. Припускається один процес сервера (як у project-context та intent) (інференція).
- **R-B7.** Чи вміщується `NARRATIVE_MAX_TOKENS = 8000` для reasoning-моделі в 60 с — не виміряно. Хибне значення проявиться як `llm_timeout` або `invalid_output` (B:EC-3, B:EC-19).
- **R-B8.** Статична таблиця `PriceBook` може не мати ціни моделі за замовчуванням, поки живий прайс не підтягнувся. Тоді UI показує «cost unknown»; холодний `PriceBook` у фоні робить мережевий запит `/models` — це не LLM-виклик (B:AC-4 дотримано).
- **R-B9.** Зберігання в jsonb без міграції (B-Q1a): стан нетипізований на рівні БД. Захищено Zod-валідацією при читанні.
- **R-A.** Ризики плану A лишаються:
  - D1/D2 — потрібна ревізія специфікацій;
  - `failed` ніхто не записує;
  - холодне читання під час реіндексу;
  - формат `git grep --null`;
  - таймінг A:NFR-1;
  - наближений summary;
  - U-рядки Appendix A;
  - застарілий `.next`.
- **R-D.** D3/D4 відхиляються від контракту B. Рекомендовано зафіксувати їх ревізією через spec-creator разом із D1/D2 — для: користувача.

## Передача на рев'ю
- **Архітектура:**
  - `server/src/modules/onboarding/**`: два сервіси на портах; правило `pure-folders-are-pure`; лише `import type` з `repo-intel/types.ts`.
  - Розрив циклу `onboarding` ↔ `onboardingNarrative` через ліниве замикання в `container.ts`.
  - `narrative-service.ts` під розширеними правилами S7.
  - `StructuredRequest` і `grepAt` у ring 2; reviewer-core `openrouter.ts` і `errors.ts` (ring 1).
  - Клієнт: напрям залежностей, слоти хедера, адитивний проп `MermaidDiagram`, правка `nav.ts`.
- **Безпека:**
  - argv `grepAt`;
  - недовірені маніфести, README, env;
  - фреймінг prompt-injection (ASI01);
  - grounding виходу (шляхи, команди, числа, складність);
  - XSS у Markdown і mermaid (без сирого HTML, лише `repo:`-посилання, strict);
  - ліміт вартості (10/хв, single-flight, без ретраїв);
  - логи без тексту промпту чи виходу;
  - `missing_key` не розкриває секретів.
- **Сумісність API (lanes 17–20):**
  - новий `GET /repos/:id/tour` і `POST /repos/:id/tour/narrative`;
  - контракт `Onboarding` замінено на місці (старої форми не віддавав жоден ендпоінт);
  - поля B адитивні, D3 адитивний;
  - `/index-state` і `/resync` без змін;
  - внутрішні порти — не публічний API;
  - `reviewer-core` `OpenRouterProvider`: нові опційні поля, за замовчуванням поведінка незмінна (перевірити рев'ю та intent).
- **Тести:** e2e-флоу для `/repos/:repoId/tour` (стан not-cloned + сайдбар) — прогалина для test-writer на запит. Е2е для генерації не планується (флоу без LLM за правилами `e2e/AGENTS.md`).
- **Документація (doc-writer після верифікації):**
  - `server/docs/api-contracts.md`, API-карта в `server/README.md` (два маршрути);
  - `server/docs/architecture.md` (модуль `onboarding`, наратив, оверлей);
  - `server/src/modules/repo-intel/README.md` (`getGraphFacts`);
  - `client/specs/pages.md` (нова сторінка);
  - `client/docs/ui-architecture.md` (`hooks/tour.ts`);
  - список маршрутів у `client/AGENTS.md`;
  - `reviewer-core` (нові опції `StructuredRequest`);
  - специфікації реалізованої фічі;
  - записи INSIGHTS.
- **Ручна перевірка (живий браузер, до doc-writer):**
  - A: sticky «On this page» і scroll-spy (A:AC-44); Jump-to < 1024 px (A:AC-46); прокрутка за hash після завантаження (A:AC-42); фокус не під sticky-панеллю (A:NFR-6, 2.4.11); рендер mermaid фактів; таймінги A:NFR-1.
  - B: живий прогін генерації з реальним ключем (кнопка «Generating…», polling, оголошення, мітки AI-written); fallback «AI diagram unavailable» на невалідній діаграмі; оголошення live-region зі скрінрідером (B:NFR-6); чип Outdated після resync без автоматичного виклику (B:AC-40); підтвердження 202 ≤ 300 мс.

## Не знайдено / прогалини
- Серверний TOML/YAML/XML-парсер — шукано в `server/package.json:19-56` і `server/node_modules/.pnpm` — лише транзитивні `yaml`, `js-yaml` (вирішено A-Q2(i)).
- Читання графу на рівні всього репо у фасаді — `server/src/modules/repo-intel/types.ts:146-176` — немає (S5).
- Пошук вмісту на коміті в порті — `server/src/vendor/shared/adapters.ts:213-263` — немає (S4).
- Запис `status='failed'` індексатором — `git grep "failed" server/src/modules/repo-intel` — лише коментарі.
- GitHub-URL для директорії — `client/src/lib/github-urls.ts` — немає (S6).
- Виклики `client/messages/en/onboarding.json` — `client/src` — немає (S14).
- Обмеження маршрутизації та вимкнення HTTP-ретраїв на рівні запиту — `reviewer-core/src/llm/openrouter.ts:51-86` — немає (S29).
- Per-kind timeout/retries у JobRunner — `server/src/platform/jobs.ts:30-80` — немає (тому не використовується, B-Q2a).
- Сигнал невалідної діаграми в `MermaidDiagram` — `client/src/components/mermaid-diagram/MermaidDiagram.tsx:22-61` — немає (S36).
- Помилка 429 у таксономії — `server/src/platform/errors.ts:1-47` — немає (S40).
- Читачі чи записувачі legacy-таблиці `onboarding` — `git grep "t.onboarding\|onboarding\b" server/src` — немає (S38).
