# План: Blast Radius (H04)

> Development Plan від `planner`, погоджений з користувачем перед виконанням
> `implementer`. Гілка `H04`.

## Контекст

Домашнє завдання курсу: реалізувати фічу **Blast Radius**, яку лабораторна
лишила заглушкою в `devdigest-mcp` (`get_blast_radius`). Рев'ювер PR бачить
лише змінені рядки, але не бачить, що ще в репозиторії залежить від
зміненого коду. Blast Radius відповідає на це: показує змінені символи, їхніх
викликачів (`файл:рядок`) і HTTP-ендпоінти/крони, які від них залежать.

Усі дані вже пораховані заздалегідь модулем `repo-intel` під час індексації
репозиторію (AST + call graph). Ця фіча **нічого не аналізує заново і не
викликає LLM** — вона лише читає готовий результат і показує його: один раз
у Web UI (блок на вкладці Overview сторінки PR), і один раз через MCP-
інструмент `get_blast_radius`, щоб ту саму карту міг отримати Claude Code без
браузера.

Виконується конвеєром `planner → implementer → test-writer → plan-verifier →
architecture-reviewer ∥ security-reviewer → doc-writer → /pr-self-review`, як
і решта фіч цього курсу.

Зовнішнє дослідження (researcher) підтвердило напрямок: у промислових
інструментах "хто викликає / що залежить" показується як **дерево** (не
граф) із file:line-цитатами на кожному листку; деградований/неповний стан
показується **на місці**, приглушеним попередженням, а не як помилка чи
порожній екран; MCP-конвенції для read-only інструмента — `readOnlyHint:
true`, компактна структурована відповідь через `outputSchema`, і "даних
немає / індекс неповний" повертається як звичайний успішний результат, а не
`isError`. P1-скоуп (плаский список, не дерево) сумісний із цим — дерево/
граф лишаються P3.

## Скоуп

**In scope (P1, обов'язково):**
- Серверний модуль `server/src/modules/blast/` з роутом `GET /pulls/:id/blast`.
- Адитивна Zod-схема `BlastRadiusResponse` (розширює `BlastRadius` полями
  `degraded`/`reason`), дзеркалена в трьох vendor-копіях.
- Блок `BlastRadiusCard` на вкладці Overview: підсумок, змінені символи →
  викликачі `file:line` (клікабельні на GitHub) → ендпоінти/крони; текст для
  "немає викликачів"; позначка для деградованого індексу.
- Робочий `get_blast_radius` у `devdigest-mcp` замість заглушки.

**Explicitly out of scope (P2/P3 — не блокують, окремо позначені нижче):**
- Будь-які зміни всередині `repo-intel` (facade вже повністю робочий).
- Graph view, дерево, що згортається, "Prior PRs touching these files",
  сортування за rank, кнопка resync біля degraded-позначки.
- Нові БД-колонки/міграції.
- Відкриття PR і запис демо-відео — дії користувача після коду, не кроки
  плану.

## Ухвалені рішення

| # | Рішення |
|---|---|
| D1 | Деградація живе у новій адитивній схемі `BlastRadiusResponse = BlastRadius.extend({ degraded, reason })` — `BlastRadius`/`PrBrief` лишаються незмінними. Роут валідує вихід через `response: { 200: BlastRadiusResponse }`. `reason` завжди присутній (`null`, коли даних досить) — клієнт не гілкує на `undefined`. |
| D2 | На ripgrep-шляху (без `factsByFile`, тобто `degraded: true`) кожна група `downstream` з ≥1 викликачем отримує повний `impactedEndpoints` (свідома надоцінка "може зачепити"); `crons_affected: []`. На persistent-шляху атрибуція точна через `factsByFile[caller.file]`. |
| D3 | Групування — один `downstream`-елемент на кожен `viaSymbol` (плаский список фасаду групується за цим полем), у порядку першої появи в `changedSymbols`. Символи без викликачів у `downstream` не потрапляють — вони є в `changed_symbols`, UI показує їх окремо. |
| D4 | `summary` — детермінований рядок із лічильниками (для MCP-агента; UI рахує ту саму статистику сам). |

## Affected modules

| Package | Package manager | Checks |
|---|---|---|
| `server/` | pnpm | `pnpm -C server lint && typecheck && arch:check && exec vitest run --exclude '**/*.it.test.ts'` |
| `client/` | pnpm | `pnpm -C client lint && typecheck && test` |
| `mcp-server/` | pnpm | `pnpm -C mcp-server typecheck && test` |
| root | — | `./scripts/check-shared-sync.sh` |

## Кроки

### S1 — Адитивний контракт `BlastRadiusResponse`
- Modify `server/src/vendor/shared/contracts/brief.ts`: додати
  `BlastDegradedReason` і `BlastRadiusResponse` одразу після `BlastRadius`
  (значення дзеркалять `DegradedReason` з `repo-intel/types.ts`).
- Запустити `./scripts/check-shared-sync.sh --fix` — синхронізує
  `client/src/vendor/shared/...` і `mcp-server/src/vendor/shared/...`.
- **Done-when:** `check-shared-sync.sh` виходить з 0; тип імпортується з
  усіх трьох vendor-барелів.

### S2 — Чистий мапер `buildBlastRadius`
- Create `server/src/modules/blast/helpers.ts`:
  `buildBlastRadius(result: BlastResult): BlastRadiusResponse` — групує
  `callers` за `viaSymbol` (D3), підтягує `endpoints_affected`/
  `crons_affected` із `factsByFile` (persistent) або D2 (ripgrep), рахує
  `summary` (D4), мапить `degraded`/`reason`.
- Reuse: форма `server/src/modules/smart-diff/helpers.ts` (`build*` чиста
  функція); типи з `repo-intel/types.ts` (`import type` — onion rule).
- **Done-when:** файл не імпортує нічого, крім `@devdigest/shared` і
  `repo-intel/types.js` (type-only); unit-тести (Test plan) проходять.

### S3 — Use case `BlastService`
- Create `server/src/modules/blast/service.ts`: локальні вузькі порти
  `BlastStore` (`findPull`, `listFiles`) і `BlastIntel` (`getBlastRadius`),
  метод `getBlast(workspaceId, prId)` → 404 якщо PR нема → бере змінені
  файли → викликає facade → `buildBlastRadius`.
- Reuse: `smart-diff/service.ts` (порт-патерн + 404), `platform/errors.ts`
  (`NotFoundError`); `PullsRepository.findPull`/`listFiles` задовольняють
  `BlastStore` структурно.
- **Done-when:** `pnpm -C server arch:check` чистий для `modules/blast/*`.

### S4 — Composition root: `blastService()`
- Modify `server/src/platform/container.ts`: мемоізований геттер
  `blastService()` поруч зі `smartDiffService()`, конструює
  `new BlastService(this.pullsRepo, this.repoIntel)`.
- **Done-when:** `pnpm -C server typecheck` проходить.

### S5 — Роут `GET /pulls/:id/blast` + реєстрація
- Create `server/src/modules/blast/routes.ts`: `IdParams` + `getContext` +
  один виклик сервісу + `response: { 200: BlastRadiusResponse }`.
- Modify `server/src/modules/index.ts`: імпорт + запис у `modules`.
- Reuse: `smart-diff/routes.ts` 1:1 шаблон.
- **Done-when:** `lint && typecheck && arch:check` зелені; 422 на non-uuid
  `:id`.

### S6 — MCP: метод API-клієнта
- Modify `mcp-server/src/api/client.ts`: додати
  `getBlastRadius(pullId): Promise<BlastRadiusResponse>` у порт
  `DevDigestApi` і в `FetchDevDigestApi` (`GET /pulls/:id/blast`, `safeParse`
  через існуючий `request()`).
- Modify `mcp-server/test/fixtures.ts`: додати `getBlastRadius: vi.fn()` у
  `makeMockApi`.
- **Done-when:** `pnpm -C mcp-server typecheck` проходить.

### S7 — MCP: вихідна схема і тіло інструмента
- Modify `mcp-server/src/present.ts`: `GetBlastRadiusOutput = BlastRadiusResponse`
  (прибрати стаб-форму `{implemented:false,...}`).
- Modify `mcp-server/src/tools/get-blast-radius.ts`: реальний handler —
  `resolveRepo` → `resolvePull` → `api.getBlastRadius(pull.id)` → parse →
  `structuredContent`; помилки через існуючий `ToolError`/`toErrorResult`
  (як у `get-findings.ts`); `inputSchema`/`annotations` (`readOnlyHint: true`
  лишається) не чіпати; переписати `GET_BLAST_RADIUS_DESCRIPTION` під
  реальну поведінку (що повертає, коли викликати, що означає `degraded`,
  помилка для невідомого PR).
- Modify `mcp-server/src/server.ts`: `createGetBlastRadiusTool({ api: deps.api })`.
- **Done-when:** `pnpm -C mcp-server typecheck` проходить; жодного
  `console.*` у змінених файлах.

### S8 — MCP: оновити тести, що зламалися
- Modify `mcp-server/test/tools.test.ts`: замінити тест стабу на (1) happy
  path — mock `listRepos`/`listPullsForRepo`/`getBlastRadius`, перевірити
  `structuredContent`; (2) невідомий PR → `isError: true`.
- **Done-when:** `pnpm -C mcp-server test` зелений.

### S9 — Client: хук `useBlastRadius`
- Create `client/src/lib/hooks/blast.ts`: `useBlastRadius(prId)` —
  `useQuery` за `GET /pulls/:id/blast` (шаблон 1:1 з `hooks/smart-diff.ts`).
- Modify `client/src/lib/hooks/index.ts`: `export * from "./blast"`.
- **Done-when:** `pnpm -C client typecheck` проходить.

### S10 — Client: i18n-ключі
- Modify `client/messages/en/blast.json`: додати `error`, `endpoints`,
  `crons` (підзаголовки), `degraded`, `reason.{flag_off,index_failed,
  index_partial,repo_too_large,no_data}`. Наявні ключі (`stat.*`,
  `callerCount`, `noDownstream`, `view.*`) не чіпати. Заголовок секції — з
  `brief.json`'s `block.blast` (уже є).
- **Done-when:** JSON валідний; жодного `MISSING_MESSAGE` у клієнтських
  тестах.

### S11 — Client: компонент `BlastRadiusCard` (+ `BlastSymbolGroup`)
- Create `_components/BlastRadiusCard/{BlastRadiusCard.tsx,helpers.ts,
  styles.ts,index.ts}`: стани loading/error/degraded-badge/summary-рядок/
  порожньо/список груп, за зразком `IntentCard`.
- Create `_components/BlastSymbolGroup/{BlastSymbolGroup.tsx,styles.ts,
  index.ts}`: ім'я символу + кількість викликачів, список `file:line` з
  посиланням через `githubBlobUrl(repoFullName, headSha, file, line)` (коли
  обидва доступні, інакше plain text), ендпоінти/крони під ним (рендер лише
  коли `length > 0`).
- **Done-when:** кожен файл ≤200 рядків; `lint && typecheck` зелені.

### S12 — Client: проброс у `OverviewTab` і `page.tsx`
- Modify `OverviewTab.tsx`: нові props `repoFullName`, `headSha`; рендер
  `<BlastRadiusCard/>` одразу після `<IntentCard/>`.
- Modify `.../pulls/[number]/page.tsx`: прокинути вже обчислені
  `repoFullName`/`pr.head_sha` в `OverviewTab`.
- **Done-when:** `typecheck && lint && test` зелені; блок видно на Overview
  (ручна перевірка в S13).

### S13 — Ручна верифікація (P1 #1–#7) + вибір тестового PR
- **Тестовий PR:** зміна `getContext` у `server/src/modules/_shared/
  context.ts` (не `reviews/helpers.ts`/`diff-viewer/helpers.ts` — ці не
  реєструють HTTP-роутів напряму, тож карта не покаже жодного ендпоінта, а
  це обов'язковий критерій P1 #4). `getContext` імпортують 13 файлів
  `routes.ts`, кілька реєструють роут в один рядок — repo-intel's
  `extractEndpoints` читає по рядках, тож і викликачі, і ≥1 ендпоінт
  гарантовано з'являться.
- Сценарій:
  1. `./scripts/dev.sh`.
  2. `curl localhost:3001/repos/<repoId>/index-state` → `status: full`
     (інакше `POST /repos/:id/resync`, дочекатись оновлення).
  3. `curl localhost:3001/pulls/<prId>/blast` — перевірити групу `getContext`
     з ≥2 викликачами і ≥1 `endpoints_affected`.
  4. Overview → блок Blast radius: підсумок, клік на `file:line` відкриває
     точний рядок на GitHub, PR без спільних символів показує "немає
     викликачів".
  5. `REPO_INTEL_ENABLED=false` + рестарт API → перевірити degraded-позначку.
  6. У Claude Code викликати `get_blast_radius {repo, pr}` — відповідь
     збігається з `curl`; невідомий PR → зрозуміла помилка.

## Test plan (для test-writer)
- `server/test/blast-helpers.test.ts`: групування, атрибуція
  endpoints/crons (persistent і ripgrep шляхи), degraded/reason мапінг,
  символ без викликачів не створює групу, результат проходить
  `BlastRadiusResponse.parse`.
- `server/test/blast-service.test.ts`: невідомий PR → `NotFoundError`;
  facade отримує правильні `repoId`/`changedFiles`.
- `server/test/blast-routes.test.ts`: 422 на невалідний `:id`.
- `mcp-server/test/tools.test.ts` (S8), `mcp-server/test/api-client.test.ts`:
  правильний URL, `ToolError` на невалідну форму відповіді.
- `client/.../BlastRadiusCard/BlastRadiusCard.test.tsx`: дані (підсумок,
  href з `#L<line>`, ендпоінт під символом), порожній стан, degraded-стан.

## Ризики / відомі обмеження (не блокують P1, зазначити в описі PR)
- `MAX_CALLERS_PER_SYMBOL` у facade застосовує ліміт глобально на весь
  список викликачів, а не на кожен символ окремо (repo-intel internals, поза
  скоупом цієї фічі).
- `extractEndpoints` парсить рядки, тож багаторядкові реєстрації роутів
  (`app.get(\n  '/path', ...)`) на цьому репо не розпізнаються — саме тому
  тестовий PR обрано на `getContext`, а не на довільний хелпер.
- Рядок викликача береться з останнього індексованого SHA, а посилання на
  GitHub закріплене на `head_sha` PR — для файлів, не змінених у цьому PR,
  збігається; прийнятно для MVP.
- Документація (`mcp-server/AGENTS.md`, `README.md`,
  `docs/plans/mcp-server.md`) описує `get_blast_radius` як "ніколи не
  викликає API" — застаріє після цієї фічі; оновлення — робота
  `doc-writer`, не `implementer`.

## Verification (end-to-end)
1. Усі команди перевірки пакетів (Affected modules) зелені +
   `./scripts/check-shared-sync.sh`.
2. Сценарій S13 повністю пройдений вручну (це і є сценарій демо-відео).
3. Після коду: `plan-verifier` → `architecture-reviewer` ∥
   `security-reviewer` → `doc-writer` → `/pr-self-review` → відкриття PR з
   описом (хто з субагентів що зробив) і демо-відео.
