# План: локальний MCP-сервер (`mcp-server/`)

> Після затвердження цей план копіюється в `docs/plans/mcp-server.md`.

## Контекст

Курс просить MCP-сервер з п'ятьма інструментами, що дає AI-агенту (Claude
Code) керувати вже наявним review-флоу dev-digest програмно: `list_agents`,
`run_agent_on_pull_request`, `get_findings`, `get_conventions`,
`get_blast_radius` (останній — свідома заглушка, повна реалізація — домашнє
завдання пізнішого уроку).

Дослідження (зовнішнє, до плану) дало два блоки best practices: загальні
принципи MCP-сервера (іменування, схеми, `isError` vs protocol error,
annotations, resources vs tools) і — окремо, як пріоритет користувача — як не
роздувати контекст токенами на старті нового чату (лінива підвантажка
інструментів — це можливість Anthropic API (`defer_loading`), а не MCP-
протоколу; сам MCP не має офіційного механізму лінивих схем — підтверджений
gap у specification-репо). Ці висновки лягли в основу C11 нижче.

Окремо користувач надав 4 принципи дизайну з курсового матеріалу — вони
застосовуються до **кожного** з 5 інструментів без винятку:

1. **Результат, а не операція** — інструмент сам робить усі проміжні кроки
   (resolve → trigger → poll → fetch) і повертає готовий результат за один
   виклик.
2. **Плоскі аргументи** — лише прості top-level поля (`repo`, `pr`, `agent`,
   `run_id`), ніколи вкладені об'єкти.
3. **Стисла структурована відповідь** — лише потрібні агенту поля, не сирий
   дамп БД-запису.
4. **Помилка веде далі** — текст помилки завжди називає наступний конкретний
   виклик чи дію.

`planner` під час дослідження реального бекенду виявив критичну розбіжність:
`POST /pulls/:id/review` **не синхронний**, попри застарілий коментар у
`server/src/vendor/shared/contracts/review-api.ts:43-46` ("(synchronous)").
Реальна поведінка (`server/src/modules/reviews/service.ts:114-149`) —
fire-and-forget: ендпоінт створює `agent_runs`-рядки, запускає ран у фоні
(`void this.executor.executeRuns(...)`, без `await`) і одразу повертає
`{ runs, reviews: [] }`. Це означає, що `run_agent_on_pull_request` мусить
сам робити polling всередині одного виклику tool'а — що й збігається з
курсовим формулюванням "run_agent_on_pr сам... чекає, забирає findings".
Підтверджено також, що review гарантовано записаний у БД **до** того, як
ран отримує статус `done` (`run-executor.ts:308` vs `:375`) — після `done`
`GET /pulls/:id/reviews` завжди містить результат, race condition немає.

`get_findings` шукає результат за `run_id`, але в API немає ендпоінта
"review за run_id" (лише "reviews за pr_id"). Тому `run_agent_on_pull_request`
кешує `{run_id → pull_id}` у пам'яті процесу (простий `Map`, без
персистентності) — `get_findings` шукає в цьому кеші; для run_id з іншого
процесу/сесії чи запущеного через web UI повертає прозору помилку за
принципом 4, а не вигадує обхідний шлях.

## Ухвалені рішення

| # | Рішення |
|---|---|
| D1 | Новий окремий пакет `mcp-server/` у корені репо, **pnpm** (як `server/`/`client/`), stdio-транспорт, офіційний `@modelcontextprotocol/sdk`. Без workspace-файлу — узгоджено зі стилем репо ("кожен пакет — окрема вершина залежностей"). |
| D2 | `agent` у `run_agent_on_pull_request` — **обов'язковий** `agent_id` (без режиму "запустити всіх агентів"). |
| D3 | `get_findings` ключується **виключно на `run_id`**; резолв через in-memory кеш `{run_id → pull_id}`, без змін бекенду. |
| D4 | Початкову м’яку заглушку `get_blast_radius` замінено в L04: інструмент резолвить repo/PR, викликає спільний із web UI `GET /pulls/:id/blast` і валідує `BlastRadiusResponse`. Інструмент залишається read-only. |
| D5 | `get_conventions` повертає лише `status === 'accepted'` конвенції, стиснуті до `{rule, rationale, category}` — це усталене правило репо, легко змінюваний іменований константний прапорець (`ACCEPTED_ONLY`), а не хардкод без пояснення. |
| D6 | Контракти `@devdigest/shared` — **ручне копіювання** 6 файлів (`findings`, `review-api`, `brief`, `knowledge`, `platform`, `trace`) у `mcp-server/src/vendor/shared/`, за існуючою конвенцією репо (а не tsconfig-аліас на `server/`, як робить `reviewer-core`) — `check-shared-sync.sh` розширюється на третій пакет (одностороння перевірка: mcp-server-копія повинна збігатись із server-оригіналом). |
| D7 | Резолвер `repo` (`"owner/name"` → `Repo.full_name`) порівнює **без урахування регістру** — імена GitHub-репозиторіїв регістронезалежні. |
| D8 | Findings зі знятим статусом (`dismissed_at != null`) виключаються з відповіді `run_agent_on_pull_request`/`get_findings` — вони не можуть з'явитись у щойно запущеному рані, але можуть — при пізнішому `get_findings` того самого run_id. |
| D9 | Застарілий коментар "(synchronous)" у `server/src/vendor/shared/contracts/review-api.ts:43-46` **виправляється** в рамках цієї роботи (і дзеркально в `client/src/vendor/shared/`) — суто docstring, без зміни поведінки; єдиний свідомий виняток із правила "жодних змін у server/client". |
| D10 | Точні тексти `description` для всіх 5 інструментів затверджені дослівно — див. підрозділ під S7. Implementer копіює без перефразування. |

## Кроки

### S1. Каркас пакета
- `mcp-server/package.json` (`@devdigest/mcp-server`, `"type": "module"`, `private: true`), скрипти `start`/`dev`/`typecheck`/`test`; залежності `@modelcontextprotocol/sdk`, `zod`; без `build` — пакет виконується з джерела через `tsx`, як `reviewer-core`.
- `mcp-server/tsconfig.json` — компіляторні опції як у `server/tsconfig.json` (strict, `noUncheckedIndexedAccess`), `paths` на власний `src/vendor/shared`.
- `mcp-server/vitest.config.ts`.
- `pnpm -C mcp-server install` генерує `pnpm-lock.yaml` (руками не редагувати).

### S2. Дзеркало контрактів
- Побайтові копії 6 файлів (`findings`, `review-api`, `brief`, `knowledge`, `platform`, `trace`) у `mcp-server/src/vendor/shared/contracts/` + власний barrel `index.ts` із коментарем-посиланням на `check-shared-sync.sh`. `adapters.ts` не копіюється (server-only).

### S3. Розширення guard'а синхронізації
- `scripts/check-shared-sync.sh`: додати односторонню перевірку mcp-server-копії проти server-оригіналу (файли, яких немає в mcp-server, ігноруються; вміст наявних файлів має збігатись); `--fix` перезаписує лише наявні файли.
- `.github/workflows/shared-contracts.yml`: додати `mcp-server/src/vendor/shared/**` у `paths`.

### S4. Конфіг і каталог помилок
- `src/config.ts` — єдине місце читання `process.env` (`DEVDIGEST_API_URL` за замовчуванням `http://localhost:3001`, `DEVDIGEST_MCP_POLL_INTERVAL_MS` = 2000, `DEVDIGEST_MCP_RUN_TIMEOUT_MS` = 300000), валідація через Zod.
- `src/errors.ts` — `ToolError` + `toErrorResult()` (→ `isError: true`) + іменовані білдери повідомлень, кожне з яких називає наступний крок (принцип 4): agent/repo/PR не знайдено, run_id невідомий, ран ще виконується/впав/скасований/протух за таймаутом, API недоступний, rate limit.

### S5. HTTP-клієнт (єдиний I/O-модуль)
- `src/api/client.ts` — інтерфейс `DevDigestApi` (list agents/repos/pulls, trigger review, list runs/reviews/conventions), реалізація на `fetch`. Кожна відповідь проходить `safeParse` проти дзеркальної Zod-схеми (нема довіри до JSON з мережі); шляхи URL — через `encodeURIComponent`; 404-конверт `{error:{code,message}}`, 429 → окрема rate-limit помилка, мережевий збій → "API недоступний, запустіть `./scripts/dev.sh`".

### S6. Резолвери, кеш, poller, presenter'и
- `src/resolve.ts` — repo (case-insensitive за `full_name`) → pr (за `number`) → agent (за `id`), кожен кидає відповідну actionable-помилку.
- `src/run-cache.ts` — один інстанс `RunCache` (простий `Map`), створюється один раз у композиційному корені.
- `src/poll.ts` — `waitForRun()`: `GET /pulls/:id/runs`, чекає статус, відмінний від `running`, з таймаутом і injectable sleep/now (для тестів на фейкових таймерах).
- `src/present.ts` — Zod-схеми стислих відповідей + мапери, що ріжуть persisted-поля (`id`, `review_id`, `accepted_at`, `created_at` тощо) і фільтрують dismissed-findings (D8) та `ACCEPTED_ONLY`-конвенції (D5).

### S7. П'ять модулів інструментів
- `src/tools/{list-agents,run-agent-on-pull-request,get-findings,get-conventions,get-blast-radius}.ts` — кожен експортує ім'я, `description` (**дослівно з D10 нижче — не перефразовувати**), плоский `inputSchema`, `outputSchema`, `annotations` і `handler`.
- `run_agent_on_pull_request`: resolve repo/pr/agent → trigger → **кешує run_id ДО початку polling** (щоб навіть таймаут лишав ран доступним через `get_findings`) → poll → fetch → стисла відповідь.
- `get_blast_radius`: жодного API-виклику, завжди однакова заглушка, `isError` не встановлюється.

#### D10 — Затверджені тексти `description` (implementer бере дослівно)

Погоджено в обговоренні плану; кожен опис навмисно короткий і стабільний
(не прив'язаний до деталей імплементації типу конкретного таймауту в мс),
щоб не інвалідувати prompt-cache префікс tool-визначень при майбутніх
правках коду. Implementer **копіює текст як є**, без перефразування;
будь-яка зміна формулювання — окремий свідомий diff, не побічний ефект
рефакторингу.

**`list_agents`** (~215 симв.)
```
List the reviewer agents configured in this DevDigest workspace. Returns
each agent's id, name, description, provider and model. Call this first to
get a valid `agent` id before calling run_agent_on_pull_request.
```
`annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false }`

**`run_agent_on_pull_request`** (~490 симв.)
```
Run one reviewer agent on a pull request and return the finished review in
a single call. Resolves `repo` (GitHub "owner/name") and `pr` (PR number)
to the pull already tracked in DevDigest, triggers `agent` (an id from
list_agents), and waits for the run to complete before returning verdict,
summary, score and findings. A real LLM review can take up to a few
minutes; if it doesn't finish before the timeout, the run keeps going in
the background — call get_findings with the returned run_id to pick up the
result later.
```
`annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }`

**`get_findings`** (~305 симв.)
```
Fetch the result of a review run by its run_id (the id run_agent_on_pull_
request returns). Returns the same verdict/summary/findings shape once the
run has finished. If the run is still in progress, failed, or unrecognized
in this session, returns a message explaining what to do next instead of
the findings.
```
`annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false }`

**`get_conventions`** (~300 симв.)
```
List the accepted coding conventions DevDigest has extracted for a
repository, identified by repo (GitHub "owner/name"). Each item has a
rule, its rationale and a category — the same accepted house rules
injected into this repo's review prompts. Pending or rejected candidates
are not included.
```
`annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false }`

**`get_blast_radius`** (~285 симв.)
```
Not implemented yet: a future analysis of which files and symbols a pull
request's changes affect downstream. Always returns
{ implemented: false, message, affected_files: [] } regardless of input,
and never fails — treat implemented: false as "not available yet", not as
an error.
```
`annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false }`

Усі п'ять — під стелею Claude Code (~2048 симв.) з великим запасом;
найдовший (`run_agent_on_pull_request`) — 490 симв.

### S8. Server factory та stdio entrypoint
- `src/server.ts` — `createServer(deps)` реєструє 5 інструментів на `McpServer`.
- `src/index.ts` — єдине місце, що створює конкретні інстанси (`loadConfig` → HTTP-клієнт → `RunCache` → `createServer` → `connect(new StdioServerTransport())`). Ніде в пакеті немає `console.log` (stdout зайнятий JSON-RPC) — лише `console.error` для фатальних стартових помилок.

### S9. Документація пакета
- `mcp-server/AGENTS.md` (+ закомічений symlink `CLAUDE.md`), `INSIGHTS.md` (скелет), `README.md` (5 інструментів, форми входу/виходу, приклади помилок, коротка нотатка про 4 принципи дизайну).

### S10. Юніт-тести (Vitest, без Docker/БД)
- `mcp-server/test/{api-client,resolve,poll,tools,server}.test.ts` — мокнутий `fetch`/`DevDigestApi`, фейкові таймери для poll-логіки, перевірка точного набору полів у стислих відповідях (принцип 3), текстів помилок (принцип 4), `tools/list` (плоскі схеми — принцип 2, `outputSchema` присутній, annotations, довжина описів).

### S11. Кореневі документи
- `AGENTS.md` — новий пункт `mcp-server/` у "Where things live".
- `README.md` — рядок у таблиці пакетів + вузол на mermaid-діаграмі архітектури + рядок у таблиці тестів/CI.
- `TESTING.md` — новий workflow і suite.

### S12. CI та маршрутизація `pr-self-review`
- `.github/workflows/mcp-server.yml` — за зразком `reviewer-core.yml`, але pnpm (`pnpm install --frozen-lockfile`, `typecheck`, `test`), path-filter `mcp-server/**`.
- `.claude/skills/pr-self-review/routing.md` — нова lane для `mcp-server/src/**` (skills: `zod`, `typescript-expert`, `security`).
- `.claude/skills/pr-self-review/SKILL.md` — новий рядок у таблиці перевірок Step 5.

### S13. Виправлення застарілого коментаря (D9)
- `server/src/vendor/shared/contracts/review-api.ts:43-46` і дзеркальна копія в `client/src/vendor/shared/contracts/review-api.ts`: прибрати слово "(synchronous)", описати реальну fire-and-forget поведінку одним реченням. Лише docstring, без зміни коду/поведінки.

## Поза межами

- Реальна реалізація blast radius — заглушка лишається заглушкою.
- Режим "запустити всіх агентів" в `run_agent_on_pull_request`.
- Персистентність run-кешу між перезапусками MCP-сервера.
- Віддалений транспорт (HTTP/SSE) і будь-яка автентифікація.
- Новий `mcp-*` skill у `.claude/skills/`.
- Будь-які інші зміни в `server/`, `client/`, `reviewer-core/`, `e2e/` окрім S13.
- Автоматизований smoke-тест проти живого сервера (лишається ручною перевіркою перед `doc-writer`).

## Перевірка

1. `pnpm -C mcp-server install && pnpm -C mcp-server typecheck && pnpm -C mcp-server test` — зелені.
2. `./scripts/check-shared-sync.sh` — зелений (з новою 3-сторонньою перевіркою).
3. `tools/list` повертає рівно 5 інструментів; кожен — плоский `inputSchema`, присутній `outputSchema`, коректні `annotations`, опис ≤2048 символів.
4. Ручний прогін проти `./scripts/dev.sh` з реальним доданим репо, відкритим PR і увімкненим агентом: `list_agents` → `run_agent_on_pull_request` → `get_findings` тим самим `run_id` дають узгоджений результат; невірний `agent`/`repo`/`run_id` — кожен дає помилку, що називає наступний крок; перезапуск MCP-сервера робить старий `run_id` "невідомим" для `get_findings`.
5. Нуль diff'ів під `server/`, `client/`, `reviewer-core/`, `e2e/` окрім двох рядків S13.
6. `git grep -n "(synchronous)" server/src/vendor/shared client/src/vendor/shared` — нічого не повертає.

## Технічні невідомі, що закриваються дослідженням під час імплементації

Не блокують затвердження плану — плановані як короткий research-прохід перед/під час `implementer`:

- Точна версія `@modelcontextprotocol/sdk` і сумісність із `zod ^3.24.1`, уже використаним у репо.
- Точний API `registerTool`/`outputSchema`/`annotations`/`AbortSignal` у поточній версії SDK.
- Чи можна безпечно запускати сервер через `pnpm start` (ризик stdout-банера, що зіпсує JSON-RPC) — план вважає безпечнішим прямий виклик `tsx src/index.ts` в інструкції реєстрації Claude Code.
- Дефолтний таймаут виклику MCP tool'а в Claude Code — чи не коротший він за внутрішній `DEVDIGEST_MCP_RUN_TIMEOUT_MS`; кеш `run_id` записується до початку polling саме на випадок такого обриву.

## Результат реалізації

_Заповнюється після виконання `implementer`._
