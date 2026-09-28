# Blast Radius — P3 Extensions: Tree collapse + Graph view + Prior PRs

## Context

Blast Radius (P1) уже повністю реалізований, перевірений і працює на живих
даних (dev-digest і gm-vocabulary): контракт `BlastRadiusResponse`, сервер
(`server/src/modules/blast/{routes,service,helpers}.ts`), клієнт
(`BlastRadiusCard` + `BlastSymbolGroup`), MCP-інструмент. Поточний UI показує
все плоским списком — користувач знайшов це важким для читання і показав
референс-скріншот: символи згортаються/розгортаються деревом, ендпоінти/крони
показані кольоровими pill-чіпами, є перемикач Tree/Graph із реальним
node-link графом (3 колонки: символ → викликачі → ендпоінти), і внизу —
collapsible секція "Prior PRs touching these files".

Це три незалежні P3-покращення поверх того самого контракту й тих самих
даних, без зміни архітектури `repo-intel` чи вже здобутого P1-скоупу.
Виконується як продовження того самого конвеєра (`planner → implementer →
test-writer → plan-verifier → architecture-reviewer ∥ security-reviewer →
doc-writer → /pr-self-review`).

**Рішення користувача про графову бібліотеку:** звичайний SVG, без нової
залежності (не React Flow, не D3, не Highcharts) — узгоджено зі стилем
дизайн-системи проєкту, де всі чарти (`Sparkline`, `Donut`, `BarRow`) вже
ручний SVG, а `recharts` використовується лише для звичайних дата-чартів.

Ключове технічне рішення підтверджено читанням реального коду (не
припущення): `server/src/modules/blast/helpers.ts` уже має приватну чисту
функцію `endpointsAndCronsFor(result, callerFiles)` — точний зв'язок
symbol→caller→endpoint для Graph-вигляду вимагає лише викликати цю ж функцію
per-caller-рядок замість лише раз на групу. Жодних змін у `repo-intel`.

## Скоуп (3 фази, виконуються послідовно)

- **Фаза A** — дерево, що згортається + pill-чіпи для ендпоінтів/кронів.
  Клієнт лише.
- **Фаза B** — Graph-вигляд + перемикач Tree/Graph. Клієнт + мінімальне
  адитивне розширення контракту (`BlastCaller`) і `blast/helpers.ts` (без
  `repo-intel`).
- **Фаза C** — "Prior PRs touching these files". Новий серверний зріз (порт
  GitHub-читання + модуль) + клієнт.

**Explicitly out of scope:** зміни в `repo-intel` (індексація/факти лишаються
як є); будь-яка графова/force-layout бібліотека; показ Prior PRs у
MCP-інструменті (контракт `PrBrief.history: PrHistory` зарезервований, але
нічого його сьогодні не споживає поза цим планом).

## Ухвалені рішення (ADR)

| # | Питання | Рішення |
|---|---|---|
| E1 | Точність графа symbol→caller→endpoint | **Точна атрибуція**. Додати до `BlastCaller` два поля `endpoints_affected: string[]` / `crons_affected: string[]` (завжди присутні, не `undefined`). У `buildBlastRadius` викликати вже наявний `endpointsAndCronsFor(result, [c.file])` **на кожен caller-рядок**, а не лише раз на групу. На persistent-шляху атрибуція точна per-caller-файл; на ripgrep/degraded-шляху `endpointsAndCronsFor` і так завжди повертає `result.impactedEndpoints` незалежно від `callerFiles` — деградований фолбек ("кожен caller → усі ендпоінти групи") виходить автоматично, без спеціального гілкування. Групове `DownstreamImpact.endpoints_affected/crons_affected` лишається без змін (для Tree-вигляду й лічильників). |
| E2 | Дедуплікація caller-вузлів графа за іменем | На клієнті, у `BlastSymbolGraph/helpers.ts`, не на сервері. Контракт `callers: BlastCaller[]` лишається рядковим (один на `file:line`) — це потрібно Tree-вигляду незмінно. Граф-хелпер групує рядки за `name`, унією об'єднує їхні `endpoints_affected`/`crons_affected` в один вузол-викликач. |
| E3 | Layout-техніка для 3-колоночного графа | **HTML-вузли поверх SVG-ліній**: один абсолютно позиційований `<svg>` (`inset:0; pointer-events:none`) малює лише сірі лінії між прекомпʼютованими координатами; три колонки звичайних `<div>` із вузлами на основі `Badge` (синя рамка для символу/ендпоінтів, звичайна — для caller-вузлів), позиціонованих `position:absolute` за тими самими координатами. Координати рахує чиста функція `layoutGraph(group)` — фіксовані x на колонку, y рівномірно розподілені. Текст лишається в звичайному DOM (доступність, тести), SVG відповідає лише за лінії. |
| E4 | Один граф на весь PR чи на групу | Один `<BlastSymbolGraph>` на кожну `downstream`-групу (так само, як зараз `BlastSymbolGroup`). `BlastRadiusCard` тримає `view: "tree" \| "graph"`. Легенда — одна на картку під списком, коли `view === "graph"`. Порожній стан: `data.downstream.length === 0` → `t(view === "graph" ? "graph.empty" : "noDownstream", {count})` (ключі `graph.empty`/`graph.ariaLabel` уже є в `blast.json`, ще не використані). |
| E5 | Prior PRs: окремий роут чи поле в `/blast` | **Окремий роут** `GET /pulls/:id/history` → `PrHistory`. Причини: (1) лінива підвантаженість — секція collapsible, дані GitHub тягнуться лише при розгортанні; (2) Blast Radius навмисно "ніколи не викликає мережу" (лише читає repo-intel) — вплітання GitHub-читання в ту саму відповідь ламає цю властивість; (3) `PrBrief` у контракті вже моделює `history: PrHistory` як окреме поле поруч із `blast: BlastRadius`. |
| E6 | Джерело даних "чиї це PR" | GitHub REST напряму, не таблиця `pull_requests` (вона містить лише PR, імпортовані в DevDigest, не всю історію GitHub). Новий вузький порт `PrHistorySource` (2 методи) поверх `Octokit`, не весь `GitHubClient` — за зразком `BlastService`'s локальних `BlastStore`/`BlastIntel`. |
| E7 | Ліміти на кількість GitHub-запитів | `MAX_FILES = 5` (перші 5 змінених файлів PR), `MAX_COMMITS_PER_FILE = 5` (найновіші спочатку). Найгірший випадок ≤30 викликів **на розгортання секції** (не на кожен рендер Overview, завдяки E5). Дедуп за `pr_number`, виключення поточного PR, лише `merged_at != null`, сортування desc, `MAX_RESULTS = 10`. Явне P3-обмеження домашньої роботи — без кешу й без урахування rate-limit заголовків. |

## Affected modules

| Package | Checks |
|---|---|
| `server/` | `pnpm -C server lint && typecheck && arch:check && exec vitest run --exclude '**/*.it.test.ts'` |
| `client/` | `pnpm -C client lint && typecheck && test` |
| root | `./scripts/check-shared-sync.sh` (Фази B і C зачіпають контракт) |

---

## Фаза A — Дерево, що згортається + pill-чіпи

Суто клієнтська, найменша. Контракт і сервер не чіпає.

### A1 — `BlastSymbolGroup`: collapse за зразком `IntentCard`
- Modify `client/.../BlastSymbolGroup/BlastSymbolGroup.tsx`: локальний
  `useState(true)` (за замовчуванням розгорнуто — не ховати дані з першого
  погляду), `React.useId()`, шеврон `Icon.ChevronDown` з `rotate(...)` — 1:1
  патерн `IntentCard.tsx`'s `sourcesOpen`/`sourcesToggle`. `aria-expanded`/
  `aria-controls` на кнопці-заголовку. Список викликачів + pill-и рендеряться
  лише коли розгорнуто; заголовок (ім'я символу + `callerCount`) завжди
  видимий.
- Modify `styles.ts`: `toggleRow`/`chevron` стилі (дух `IntentCard/styles.ts`).
- **Done-when:** Enter/Space на заголовку перемикає `aria-expanded`;
  lint/typecheck зелені.

### A2 — Ендпоінти/крони як pill-чіпи (`Badge`)
- Modify `BlastSymbolGroup.tsx`: замінити mono-текстові списки на
  `<Badge icon="Globe" color="var(--accent)" bg="var(--accent-bg)">` для
  ендпоінтів, `<Badge icon="Clock" color="var(--warn)" bg="var(--warn-bg)">`
  для кронів, у `flex-wrap` ряд. Жодних нових CSS-змінних — уже є в
  `styles.css`.
- Modify `styles.ts`: `subList` → `flex-wrap: wrap` ряд.
- **Done-when:** ендпоінти/крони — кольорові pill-и з іконками; guard
  `length > 0` незмінний.

### Test plan (Фаза A)
- `client/.../BlastSymbolGroup/BlastSymbolGroup.test.tsx` (новий): клік по
  заголовку перемикає видимість списку; `aria-expanded` синхронний; ендпоінт
  рендериться як Badge-елемент, не голий mono-рядок.

---

## Фаза B — Graph-вигляд + перемикач Tree/Graph

### B1 — Контракт: `BlastCaller` += `endpoints_affected`/`crons_affected`
- Modify `server/src/vendor/shared/contracts/brief.ts`:
  ```ts
  export const BlastCaller = z.object({
    name: z.string(), file: z.string(), line: z.number().int(),
    endpoints_affected: z.array(z.string()),
    crons_affected: z.array(z.string()),
  });
  ```
  Не-опційне (нове поле, але контракт цей тип поки ніхто зовні не consume
  напряму крім наших власних client/mcp копій — адитивність тут про
  розширення форми, не про сумісність зі старими даними) — implementer
  звіряє з S1-конвенцією (`--fix` sync).
- Run `./scripts/check-shared-sync.sh --fix`.
- **Done-when:** `check-shared-sync.sh` виходить з 0.

### B2 — `blast/helpers.ts`: per-caller атрибуція (E1)
- Modify `buildBlastRadius`: у циклі, що будує `callers: BlastCaller[]`,
  викликати `endpointsAndCronsFor(result, [c.file])` для кожного `c` і
  покласти в `endpoints_affected`/`crons_affected` цього рядка.
- **Done-when:** unit-тест підтверджує різні caller-рядки з різних файлів
  групи отримують РІЗНІ списки на persistent-шляху; на ripgrep/degraded —
  кожен рядок отримує повний `impactedEndpoints`, той самий що й груповий.

### B3 — `BlastSymbolGraph` (новий компонент)
- Create `client/.../BlastSymbolGraph/{BlastSymbolGraph.tsx, helpers.ts,
  styles.ts, index.ts}`.
- `helpers.ts`: чиста `layoutGraph(group: DownstreamImpact): GraphLayout` —
  дедуп caller-рядків за `name` (E2, унія endpoints/crons); правий стовпець =
  унікальні ендпоінти ∪ крони; координати — фіксовані x на колонку, y
  рівномірно по вертикалі; ребра symbol→caller (завжди) і caller→його
  ендпоінт/крон-вузли (з унії).
- `BlastSymbolGraph.tsx`: контейнер `position:relative`; фоновий `<svg>`
  (`position:absolute;inset:0;pointer-events:none`) з `<line>` по
  `layout.edges`; три `<div>`-колонки з `Badge`-вузлами, позиціонованих
  `position:absolute` за тими самими координатами. `aria-label={t("graph.
  ariaLabel")}` на `<svg>`.
- **Done-when:** кожен файл ≤200 рядків; рендер фікстури (1 символ, 3
  caller, 2 endpoint) дає очікувану кількість ліній і вузлів.

### B4 — `BlastRadiusCard`: перемикач Tree/Graph
- Modify `BlastRadiusCard.tsx`: `useState<"tree"|"graph">("tree")`; пара
  `<Chip active={view==="tree"}>`/`<Chip active={view==="graph"}>` над
  списком груп (лише коли `data.downstream.length > 0`). Список: `view ===
  "tree" ? <BlastSymbolGroup/> : <BlastSymbolGraph/>`. Порожній стан:
  `t(view === "graph" ? "graph.empty" : "noDownstream", {count})` (E4).
  Легенда (маленький підкомпонент або інлайн) — три `Badge`-swatches
  ("changed symbol"/"callers"/"endpoints affected", + crons якщо є хоч один)
  — лише коли `view === "graph" && downstream.length > 0`.
- Modify `client/messages/en/blast.json`: додати `legend.symbol/callers/
  endpoints/crons` (нові ключі; `view.*`/`graph.*` вже є).
- **Done-when:** `lint && typecheck` зелені.

### Test plan (Фаза B)
- `server/test/blast-helpers.test.ts` (розширити): per-caller атрибуція,
  persistent точна / degraded повна; результат далі проходить
  `BlastRadiusResponse.parse`.
- `client/.../BlastSymbolGraph/BlastSymbolGraph.test.tsx` (новий):
  `layoutGraph` дедуп за іменем, кількість ребер = унії; рендер — усі вузли й
  очікувана кількість ліній.
- `client/.../BlastRadiusCard/BlastRadiusCard.test.tsx` (новий — ще не існує
  жодного тесту на цей компонент, створюється ретроактивно й для P1
  Tree-стану теж): клік по `Chip` "graph" перемикає рендер; порожній стан
  показує graph-специфічний текст у graph-режимі.

### Ризики (Фаза B)
- `BlastCaller` дублюється по `file:line`; per-caller `endpoints_affected`
  трохи роздуває payload на PR з дуже великою кількістю caller-рядків —
  прийнятно, бо `MAX_CALLERS_PER_SYMBOL` у facade вже обмежує список.
- HTML-поверх-SVG позиціонування чутливе до переносу довгого тексту — те
  саме обмеження вже прийняте для решти mono-полів картки (fixed-width +
  ellipsis).

---

## Фаза C — "Prior PRs touching these files"

Найбільша частина: новий серверний зріз (порт + Octokit-реалізація + мок +
сервіс + роут), контракт (`PrHistory`/`PrHistoryItem`) уже готовий у
`brief.ts`.

### C1 — Порт: `GitHubClient` += 2 методи
- Modify `server/src/vendor/shared/adapters.ts`:
  ```ts
  listCommitsForPath(repo: RepoRef, path: string, perPage: number): Promise<{ sha: string }[]>;
  listPullRequestsForCommit(repo: RepoRef, sha: string): Promise<{
    number: number; title: string; merged_at: string | null; author: string;
  }[]>;
  ```
- `adapters.ts` — server-only, НЕ дзеркалиться на клієнт (root `AGENTS.md`);
  `check-shared-sync.sh` цей файл не чіпає.
- **Done-when:** типи узгоджені (реалізація в C2).

### C2 — `OctokitGitHubClient`: реалізація
- Modify `server/src/adapters/github/octokit.ts`: `listCommitsForPath` →
  `octokit.rest.repos.listCommits({owner, repo, path, per_page: perPage})`;
  `listPullRequestsForCommit` →
  `octokit.rest.repos.listPullRequestsAssociatedWithCommit({owner, repo,
  commit_sha: sha})`. Обидва — через наявний `withRetry(() =>
  withTimeout(...))` патерн (уже консистентно використаний по всьому файлу).
- **Done-when:** `pnpm -C server typecheck` проходить.

### C3 — `MockGitHubClient`: тестовий дубль
- Modify `server/src/adapters/mocks.ts`: `listCommitsForPath`/
  `listPullRequestsForCommit` з детермінованими фікстурами, настроюваними
  через `MockGitHubOptions` (за зразком наявних `opts.pulls`).
- **Done-when:** typecheck проходить (мок задовольняє `GitHubClient`).

### C4 — Новий модуль `pr-history`: вузький порт + сервіс
- Create `server/src/modules/pr-history/service.ts`: локальні вузькі порти
  `PrHistorySource` (2 методи вище), `PrHistoryStore{findPull,listFiles}`,
  `PrHistoryRepos{findRepoById}` — за зразком `BlastService`.
  `PrHistoryService.getHistory(workspaceId, prId): Promise<PrHistory>`:
  `findPull` → 404 якщо нема → `findRepoById` → `listFiles` (обрізати до
  `MAX_FILES=5`) → на кожен файл `listCommitsForPath(repo, path,
  MAX_COMMITS_PER_FILE=5)` → на кожен коміт `listPullRequestsForCommit` →
  зібрати в `Map<number, PrHistoryItem>` (дедуп за `pr_number`,
  `files_overlap` — union шляхів), відфільтрувати `merged_at != null` і
  виключити поточний PR (`pull.number`), сортувати `merged_at` desc,
  `slice(0, MAX_RESULTS=10)`.
- **Constraints:** `new` жодного адаптера всередині сервісу; порти лише
  вузькі, локально оголошені; файл не імпортує `db/*`/`drizzle-orm`; не
  імпортує `modules/pulls/repository.ts`/`modules/repos/repository.ts`
  напряму (`no-sideways-module-imports`).
- **Done-when:** `pnpm -C server arch:check` чистий для `modules/pr-history/*`.

### C5 — Composition root
- Modify `server/src/platform/container.ts`: мемоізований `Promise`-геттер
  `prHistoryService()` (потребує `await this.github()`, той самий підхід що
  й інші async-залежні сервіси в контейнері).
- **Done-when:** `pnpm -C server typecheck` проходить.

### C6 — Роут
- Create `server/src/modules/pr-history/routes.ts`: `GET /pulls/:id/history`
  → `IdParams` + `getContext` + `await container.prHistoryService()` →
  `response: {200: PrHistory}`. 1:1 шаблон `blast/routes.ts`.
- Modify `server/src/modules/index.ts`: імпорт + запис `prHistory`.
- **Done-when:** `lint && typecheck && arch:check` зелені; 422 на non-uuid
  `:id`; 404 на невідомий PR.

### C7 — Клієнт: хук
- Create `client/src/lib/hooks/pr-history.ts`: `usePrHistory(prId, opts?:
  {enabled?: boolean})` — `useQuery` за `GET /pulls/:id/history`, `enabled:
  !!prId && (opts?.enabled ?? true)` (лінива підвантажка при розгортанні,
  E5).
- Modify `client/src/lib/hooks/index.ts`: `export * from "./pr-history"`.
- **Done-when:** `pnpm -C client typecheck` проходить.

### C8 — Клієнт: collapsible секція
- Create `client/messages/en/pr-history.json` (новий namespace, авто-
  підхоплюється): `title`, `empty`, `error.title`, `toggle` (`{count} PRs`).
- Create `client/.../PriorPrsSection/{PriorPrsSection.tsx, styles.ts,
  index.ts}`: локальний `useState(false)` collapse (патерн `IntentCard`,
  Фаза A1), `usePrHistory(prId, {enabled: open})`, рендер через
  `githubPrUrl(repoFullName, item.pr_number)` (уже є в `client/src/lib/
  github-urls.ts` — нічого нового тут не треба), skeleton/error/empty стани
  за зразком `BlastRadiusCard`.
- Modify `BlastRadiusCard.tsx`: рендер `<PriorPrsSection/>` внизу картки.
- **Done-when:** секція за замовчуванням згорнута; розгортання вперше
  запускає запит (не раніше); `lint && typecheck` зелені.

### Test plan (Фаза C)
- `server/test/pr-history-service.test.ts` (новий): невідомий PR →
  `NotFoundError`; дедуп PR за номером через кілька файлів/комітів;
  виключення поточного PR; фільтр лише merged; ліміти дотримані; порт
  отримує правильні `RepoRef`.
- `server/test/pr-history-routes.test.ts` (новий): 422 на невалідний `:id`;
  щасливий шлях повертає `PrHistory`-сумісну форму.
- `client/.../PriorPrsSection/PriorPrsSection.test.tsx` (новий): запит НЕ
  відбувається до розгортання (мок `fetch` не викликаний); після
  розгортання — рендер списку, порожній і error-стани.

### Ризики (Фаза C, зазначити в описі PR)
- До ~30 GitHub REST викликів на одне розгортання секції — без кешу, без
  урахування rate-limit заголовків; явне P3-обмеження курсового обсягу.
- `listPullRequestsForCommit` повертає й не-змерджені PR — фільтрується на
  рівні сервісу (`merged_at != null`), Octokit-виклик такого фільтра не має.
- Перейменовані файли можуть губити частину історії до перейменування
  (REST `path`-фільтр без `--follow`) — прийнятне обмеження.

---

## Critical files

- `server/src/modules/blast/helpers.ts` — `buildBlastRadius`/
  `endpointsAndCronsFor` (Фаза B, E1)
- `server/src/vendor/shared/contracts/brief.ts` — `BlastCaller` розширення
  (Фаза B), `PrHistory`/`PrHistoryItem` уже готові (Фаза C)
- `server/src/vendor/shared/adapters.ts` + `server/src/adapters/github/
  octokit.ts` + `server/src/adapters/mocks.ts` — новий `GitHubClient` порт
  (Фаза C)
- `server/src/platform/container.ts` — DI-реєстрація `prHistoryService()`
- `client/.../BlastRadiusCard/BlastRadiusCard.tsx` — точка інтеграції всіх
  трьох фаз (Tree/Graph перемикач, `PriorPrsSection`)
- `client/.../BlastSymbolGroup/BlastSymbolGroup.tsx` — Фаза A
- `client/src/vendor/ui/primitives/{Chip.tsx,Badge.tsx}` — перевикористовувані
  примітиви (Фази A, B)
- `client/src/lib/github-urls.ts` — `githubPrUrl` уже готовий для Фази C

## Verification (end-to-end)
1. Усі команди перевірки пакетів (Affected modules) зелені +
   `./scripts/check-shared-sync.sh` після Фази B.
2. Ручна перевірка на живому PR (той самий тестовий PR, що й для P1):
   Tree-вигляд згортається/розгортається, ендпоінти/крони — кольорові pill-и;
   перемикач Graph показує 3-колонковий node-link зі шляхом symbol→caller→
   endpoint, що збігається з Tree-даними; Prior PRs розгортається, тягне
   дані лише при першому розгортанні, посилання ведуть на реальні PR у
   GitHub.
3. Далі — `plan-verifier` → `architecture-reviewer` ∥ `security-reviewer` →
   `doc-writer` → `/pr-self-review`.
