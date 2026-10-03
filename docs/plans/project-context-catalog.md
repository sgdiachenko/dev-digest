# Implementation Plan: Project Context — каталог документів, прев'ю та оцінка токенів

## Goal & scope
- **In scope:**
  - read-only сторінка `/repos/:repoId/context`: список `.md`/`.mdx` репозиторію з категорією, розміром і `est_tokens`; безпечне прев'ю; футер з branch@sha і часом сканування; фільтри в URL; Rescan;
  - серверний модуль `project-context`, де каталог зберігається в БД. Каталог перебудовується після clone job, після успішного resync, після Rescan, а також лазі при першому відкритті сторінки;
  - нові порти `GitClient.listTree`/`readBlob`; порт `Tokenizer` переноситься в ring 2;
  - дві нові таблиці та одна згенерована міграція;
  - новий контракт `project-context.ts` у двох копіях;
  - пункт сайдбару, i18n.
- **Out of scope:**
  - редагування, завантаження і створення документів (AC-29);
  - Coverage, chunks, «Onboarding Tour», хоткей;
  - заповнення `used_by`. Поле вже має фінальну форму, але поки завжди `null`; це робота спеки attachments;
  - e2e;
  - виправлення відсутньої перевірки власника у наявному `POST /repos/:id/resync`. Лише прапорець для security-reviewer;
  - `origin/full-functionality` (Q5).

## Requirements decisions
- **Spec:** `2026-09-30-project-context-catalog` (approved) — `docs/specs/2026-09-30-project-context-catalog.md`.
- **Spec Q-4** → вирішено за кодом.
  - Модуль `repoIntel` реєструється без прапорця (`server/src/modules/index.ts:40`).
  - `resyncRepo` не читає `repoIntelEnabled` (`server/src/modules/repo-intel/service.ts:150-170`).
  - Отже resync працює і при `REPO_INTEL_ENABLED=false`. Rescan однаково отримує власний маршрут, згідно з Q1.
- **Q1 → (a).**
  - Новий `POST /repos/:id/context/rescan` → 202. Власний статус зберігається в БД, single-flight на репозиторій.
  - Новий job kind `CONTEXT_SCAN_JOB_KIND` ставиться в чергу з `RepoService.runCloneJob` і з success-гілки `resyncRepo`; обидва модулі імпортують лише `constants`.
  - Відповідь `/resync` не змінюється.
  - Після успішного rescan best-effort ставиться repo-intel `REFRESH_JOB_KIND`.
- **Q2 → (a).** `GET /context` для клонованого репо без каталогу стартує перше сканування на поточному HEAD (без fetch) і повертає `status:'scanning'`. Клієнт опитує сервер.
- **Q3 (spec Q-3) → (a).** Прев'ю повертає `404` з `details.reason='commit_unavailable'`. UI: «Document not found in <branch>@<sha>» + Rescan + назад до списку.
- **Q4 → (a).** Новий `contracts/project-context.ts` лише в server і client (не в mcp-server). Експорт з обох `vendor/shared/index.ts`. `used_by` = `{agents:{id,name}[], skills:{id,name}[]} | null`, завжди `null`.
- **Q5 → (a).** `origin/full-functionality` не читати і не цитувати.
- **Дослідницькі питання, закрито без researcher:**
  - `simple-git` 3.36.0 (`server/node_modules/simple-git/package.json:4`) має `showBuffer(option): Response<Buffer>` (`.../dist/typings/simple-git.d.ts:915`). Власний `execFile` для `readBlob` не потрібен.
  - `git ls-tree -r -l` для symlink повертає `120000 blob <oid> <розмір = довжина цілі>`; перевірено на `CLAUDE.md` цього репо: `120000 blob 47dc3e3… 9`.
  - Для gitlink (`160000 commit`) і дерев розмір подається як `-`, за `man git-ls-tree`: «Object size is given only for blobs; for other entries - character is used». Парсер мапить `-` → `size: null`.
- **REC1 (listTree/readBlob + mocks): accepted** → S3.
- **REC2 (`blob_oid`, повторне використання полів): accepted** → S4, S7.
- **REC3 (порт `Tokenizer` у `adapters.ts`, `container.tokenizer`): accepted** → S2, S8.
- **REC4 (дві адитивні таблиці, одна міграція, заміна в одній транзакції): accepted** → S4, S6.
- **REC5 (вузький порт `ProjectContextCatalog`, мемоізований getter у контейнері): accepted** → S6, S8.
- **REC6 (новий `hooks/context.ts`, видалення стабів): accepted** → S11.
- **REC7 (захист від застряглого `scanning`): accepted** → S7.
- **REC8 (перевірка власника на нових маршрутах; прогалину `/resync` лише позначити): accepted** → S7, S8, Review handoff.
- **REC9 (прибрати мертві ключі `context.json`, додати namespace у провайдери наявних тестів): accepted** → S12.
  - Уточнення: жоден спільний компонент (shell, `diff-viewer`) не викликатиме `useTranslations("context")`, бо пункт сайдбару бере підпис з `shell.nav.context` (`client/messages/en/shell.json:20`).
  - Тому `context` додається в провайдери всіх нових тестів, а наявні провайдери змінюються лише якщо `pnpm -C client test` покаже `MISSING_MESSAGE`. Це включено в done-when S12.

## Execution mode
**multi-agent.** Сервер і клієнт незалежні після контрактів; серверний фундамент (порти, схема) не залежить від контрактів. Дві хвилі, по два пакети в кожній.

## Work packages
| WP | Steps | owns | depends-on | wave |
|---|---|---|---|---|
| W1 — contracts | S1 | `server/src/vendor/shared/contracts/project-context.ts`, `client/src/vendor/shared/contracts/project-context.ts`, `server/src/vendor/shared/index.ts`, `client/src/vendor/shared/index.ts`, `server/test/project-context-contracts.test.ts` | — | 1 |
| W2 — server foundation | S2, S3, S4 | `server/src/vendor/shared/adapters.ts`, `server/src/adapters/tokenizer/**`, `server/src/adapters/git/**`, `server/src/adapters/mocks.ts`, `server/src/db/schema/project-context.ts`, `server/src/db/schema.ts`, `server/src/db/migrations/**`, `server/test/tokenizer.test.ts`, `server/test/git-tree.test.ts` | — | 1 |
| W3 — server module | S5, S6, S7, S8, S9, S10 | `server/src/modules/project-context/**`, `server/src/modules/index.ts`, `server/src/platform/container.ts`, `server/src/modules/repos/service.ts`, `server/src/modules/repo-intel/service.ts`, `server/src/modules/repo-intel/repository.ts`, `server/test/project-context-*.test.ts` (крім `-contracts`), `server/test/project-context.it.test.ts`, `server/test/repo-intel-resync.test.ts` | W1, W2 | 2 |
| W4 — client | S11, S12, S13, S14, S15 | `client/src/lib/hooks/context.ts`, `client/src/lib/hooks/core.ts`, `client/src/lib/hooks/index.ts`, `client/src/lib/types.ts`, `client/src/app/repos/[repoId]/context/**`, `client/src/vendor/ui/nav.ts`, `client/src/components/app-shell/helpers.test.ts`, `client/messages/en/context.json`, будь-який наявний `client/src/**/*.test.tsx` лише для додавання namespace `context` у провайдер (S12) | W1 | 2 |

**Overlap check:**
- Хвиля 1: W1 і W2 не мають спільних шляхів. `vendor/shared/index.ts` належить W1, а `vendor/shared/adapters.ts` — W2; це різні файли.
- Хвиля 2: W3 має лише `server/**`, W4 — лише `client/**`. `server/test/project-context-contracts.test.ts` належить W1; glob W3 його явно виключає.
- W2 не торкається `platform/container.ts`: імпорт `Tokenizer` звідти лишається робочим через реекспорт.

## Context
- Спека вимагає читати документи лише з git-об'єктів при фіксованому SHA. `readFile` не має захисту від symlink і `..` (`server/src/adapters/git/simple-git.ts:130-132`).
- `showFileAt` повертає вже декодований utf8-рядок (`simple-git.ts:134-150`), тому AC-14 потребує байтів — звідси `readBlob`.
- `resyncRepo` ковтає помилку sync як `degraded` (`repo-intel/service.ts:158-168`), не має lock і повертає лише 202 (`repo-intel/routes.ts:80-104`). Звідси власний маршрут Rescan.
- INSIGHTS, що формують план:
  - `server/INSIGHTS.md` 2026-09-23: сервіс із single-flight `Map` має бути мемоізований у контейнері.
  - 2026-09-24/2026-09-27: `no-sideways-module-imports` рахує і type-імпорти. Між модулями — лише `constants`/`helpers` або port-surface `types.ts`.
  - 2026-09-18: `drizzle-kit generate` питає інтерактивно на add+drop, тому зміна лише адитивна.
  - `client/INSIGHTS.md` 2026-09-18: `<word>` у повідомленнях next-intl; `messages/*` потребує на один `../` більше.
  - 2026-09-24: мертві i18n-ключі; новий namespace ламає провайдери наявних тестів.
  - 2026-09-27: `@testing-library/user-event` відсутній, використовувати `fireEvent`.
  - 2026-09-16: форматтери колокуються за деревом; `relativeTime` є лише в `conventions/_components/ConventionsView/helpers.ts`, тому тут потрібна локальна копія.
- Відхилені/не розглянуті варіанти: `origin/full-functionality` не використовується (Q5); Q1 (b)/(c) відхилено.

## Affected modules
| Package | Lanes (routing.md) | Package manager | Checks |
|---|---|---|---|
| `server/` | 1, 2, 4, 5, 6, 7, 8, 13, 14, 17, 18, 19, 20 | pnpm | `pnpm -C server lint` · `pnpm -C server typecheck` · `pnpm -C server arch:check` · `pnpm -C server exec vitest run --exclude '**/*.it.test.ts'`; `*.it.test.ts` — not run by implementer |
| `client/` | 1, 2, 9, 10, 11, 12, 13, 17, 18, 19, 20 | pnpm | `pnpm -C client lint` · `pnpm -C client typecheck` · `pnpm -C client test` |
| root | 2 | — | `./scripts/check-shared-sync.sh` |

## Constraints
- **C1:** Сервіс приймає порти (`ProjectContextStore`, `GitClient`, `Tokenizer`, `JobRegistrar`), ніколи `Container`/`db`. У `service.ts`/`helpers.ts`/`constants.ts` немає `drizzle-orm`, `db/*`, `fastify`, `adapters/**` — source: onion-architecture (commandments 1–2), `.dependency-cruiser.cjs:59-80`.
- **C2:** `routes.ts` — транспортний адаптер. Zod `params`/`querystring`/`response` через `fastify-type-provider-zod`, один виклик сервісу; помилки — `AppError`-підкласи (`NotFoundError` з `details`, `ConflictError`); JSON помилки вручну не складається. Параметр шляху — `:id` з `IdParams` (як усі `/repos/:id/*`, наприклад `repo-intel/routes.ts:69`) — source: `server/AGENTS.md` «Non-default conventions», fastify-best-practices, onion-architecture.
- **C3:** Між модулями імпортуються лише `constants.ts` (`repos`/`repo-intel` → `project-context/constants.js`; `project-context` → `repo-intel/constants.js`). Інші модулі (майбутні attachments) отримують каталог через `container.projectContext`, типізований портом `ProjectContextCatalog` з `project-context/types.ts` — source: `server/INSIGHTS.md` 2026-09-24/27, `.dependency-cruiser.cjs:82-92`.
- **C4:** `container.projectContext` мемоізований (`this._projectContext ??= …`). Той самий екземпляр використовують маршрути, job handler і майбутній resolver; single-flight `Map` живе в ньому — source: `server/INSIGHTS.md` 2026-09-23.
- **C5:** Заміна каталогу (рядок `context_catalogs` + усі `context_docs` репо) — одна `db.transaction` у repository. Методи, що можуть іти в транзакції, приймають `DbOrTx`. Repository повертає доменні типи, а не `$inferSelect` — source: `server/AGENTS.md`, onion-architecture (commandment 3).
- **C6:** Зміна схеми → `pnpm -C server db:generate` (міграцію ніколи не називати вручну). Лише адитивна зміна, одна міграція; `pnpm db:migrate` не запускати — source: root `AGENTS.md`, `server/INSIGHTS.md` 2026-09-18, drizzle-orm-patterns, postgresql-table-design (`timestamptz`, `text`, `NOT NULL` + `DEFAULT`, PK/FK з `ON DELETE CASCADE`).
- **C7:** Контракт:
  - wire-поля `snake_case`; Zod-константа і тип з одним `PascalCase` іменем; enum-значення `lower_snake_case`;
  - дві копії байт-в-байт; mcp-server не чіпати; `./scripts/check-shared-sync.sh` зелений;
  - наявні `SpecFile`/`IndexStatus` не змінюються;
  - source: root `AGENTS.md` «Naming conventions», zod (`type-export-schemas-and-types`, `object-optional-vs-nullable`).
- **C8:** Вміст документів читається лише з git-об'єктів:
  - `listTree(sha)` + `readBlob(oid)`; `readFile`/робоче дерево ніколи;
  - записи з mode `120000` і не-blob (`commit`/`tree`) не потрапляють у каталог;
  - `oid`/`sha` перевіряються regex `^[0-9a-f]{40}$|^[0-9a-f]{64}$` перед передачею в argv (масив аргументів simple-git, без shell);
  - source: spec *Untrusted inputs*, security (A01/A05), `show-file-at-guard.ts`.
- **C9:** Розмір перевіряється до читання:
  - `size` з `ls-tree` > 65 536 → `too_large`, blob не читається;
  - `readBlob(…, maxBytes)` робить `cat-file -s` перед читанням і кидає `BlobTooLargeError`;
  - source: AC-13, NFR-3, `show-file-at-guard.ts:28-41`.
- **C10:** Жодних LLM-викликів: сервіс не приймає LLM-порт. У логах ніколи немає вмісту документа чи збігу секрету; лише агрегати — source: NFR-2, NFR-7, security (A09).
- **C11:** Job handler `CONTEXT_SCAN_JOB_KIND` ніколи не кидає: помилка → `markError` + `warn`-лог, `return`. Так JobRunner не повторює скан (`platform/jobs.ts:41,65-79`) — source: патерн `modules/conventions/service.ts:177-191`.
- **C12:** `est_tokens` рахується лише через інжектований `Tokenizer` (`cl100k_base` з фолбеком `ceil(chars/4)`, `adapters/tokenizer/index.ts`). Клієнт не рахує токенів — source: AC-5, AC-6.
- **C13:** Клієнт отримує дані лише через `src/lib/hooks/*` → `src/lib/api.ts`; жодного `fetch` у компонентах — source: `client/AGENTS.md`.
- **C14:** Markdown рендериться лише через vendored `Markdown` (`client/src/vendor/ui/primitives/Markdown.tsx`) — без `rehype-raw`, без власного `urlTransform`, без `dangerouslySetInnerHTML`. Шляхи — лише як текст — source: AC-9, AC-10, spec RQ4, security (XSS).
- **C15:** Усі рядки UI — у `client/messages/en/context.json`. У повідомленнях немає `<слово>`. Відносний імпорт `messages/*` має на один `../` більше, ніж `src/lib/*` — source: `client/AGENTS.md`, `client/INSIGHTS.md` 2026-09-18, NFR-9.
- **C16:** Клієнтські тести:
  - `fireEvent` з `@testing-library/react` (не `user-event`);
  - хуки мокаються через `vi.mock("@/lib/hooks/context")`; `next/navigation` мокається (як у `PRRow.test.tsx`);
  - провайдер `NextIntlClientProvider` отримує `context`;
  - source: `client/INSIGHTS.md` 2026-09-27, react-testing-library.
- **C17:** Один компонент на файл у `_components/<Name>/<Name>.tsx` (+ `index.ts`, тест поруч). `page.tsx` тонкий. ≤200 рядків на компонент. Без render-фабрик і без `useState`+`useEffect` для похідних даних. Фільтрація — чиста функція в `helpers.ts` — source: root `AGENTS.md`, react-best-practices, frontend-architecture.
- **C18:** Стан фільтрів і вибраного документа — у search params (`q`, `cat`, `doc`) через `useSearchParams` + `router.replace`. Компонент, що читає `useSearchParams`, обгорнутий у `<Suspense>` у `page.tsx` — source: AC-22, next-best-practices (suspense-boundaries, async-patterns).
- **C19:** Жодних нових залежностей (ні tooltip-бібліотеки, ні `user-event`); lock-файли не чіпати — source: root `AGENTS.md` «Do-not-touch».
- **C20:** Кожен новий маршрут шукає репо за `(workspaceId з getContext, id)`; чужий або невідомий → `404`. Параметр `path` лише порівнюється на рівність з `context_docs.path` у БД і ніколи не склеюється з файловим шляхом — source: security (A01), spec *Contracts*, AC-12.
- **C21:** Форматтери (`relativeTime`, `formatSize`, `truncateMiddle`) колокуються в `ProjectContextView/helpers.ts`; `conventions` не імпортувати — source: `client/INSIGHTS.md` 2026-09-16, frontend-architecture (без імпортів між фічами).
- **C22:** Доступність:
  - рядок списку — `<button>` або `<a>` з accessible name = повний шлях;
  - видимий фокус; мінімум 24×24 px;
  - тег категорії — текст, а не лише колір;
  - старт/фініш сканування — `role="status"` `aria-live="polite"` без переносу фокусу;
  - source: NFR-6, react-best-practices (Accessibility).
- **C23:** Наявні ендпоінти й контракти не змінюються (`/resync`, `/refresh`, `SpecFile`, `IndexStatus`); лише нові маршрути й новий файл контракту — source: NFR-8, breaking-change, response-schema.
- **C24:** Порядок шляхів — порівняння за кодовими одиницями (`a < b`) на сервері; клієнт не пересортовує — source: AC-4, AC-24.

## Steps

### S1 — Контракт `project-context.ts` (дві копії) і експорт
- **package:** W1
- **files:**
  - create `server/src/vendor/shared/contracts/project-context.ts`:
    - `ContextCategory = z.enum(['specs','docs','insights'])`;
    - `ContextDocStatus = z.enum(['ok','empty','too_large','unreadable'])`;
    - `ContextCatalogStatus = z.enum(['ready','not_cloned','scanning','error'])`;
    - `ContextUsageRef = {id: string, name: string}`; `ContextDocUsage = {agents: ContextUsageRef[], skills: ContextUsageRef[]}`;
    - `ContextDoc = {path, category, size: int≥0, est_tokens: int≥0 | null, status, secret_warning: boolean, used_by: ContextDocUsage.nullable()}`;
    - `ContextCatalog = {repo_id, status, branch: string|null, scanned_sha: string|null, scanned_at: string|null (ISO), total_files: int≥0, truncated: boolean, error: string|null, files: ContextDoc[]}`;
    - `ContextDocContent = ContextDoc.omit({used_by}).extend({sha: string, content: string|null})`;
    - `ContextFileQuery = {path: z.string().min(1).max(4096)}`;
    - `ContextRescanAccepted = {status: z.literal('accepted'), catalog_status: ContextCatalogStatus}`;
    - кожна константа має `export type` з тим самим ім'ям;
  - create `client/src/vendor/shared/contracts/project-context.ts` — байт-у-байт копія;
  - modify `server/src/vendor/shared/index.ts` і `client/src/vendor/shared/index.ts` — `export * from './contracts/project-context.js';`;
  - create `server/test/project-context-contracts.test.ts`.
- **skills:** zod — lane 2; typescript-expert — lane 13.
- **constraints:** C7, C23
- **covers:** NFR-8; форма для AC-4, AC-5, AC-13, AC-14, EC-6.
- **reuse:** стиль і експорти `server/src/vendor/shared/contracts/platform.ts:271-287`.
- **done-when:**
  - `./scripts/check-shared-sync.sh` exit 0;
  - `pnpm -C server typecheck` і `pnpm -C client typecheck` зелені;
  - T1 проходить (`pnpm -C server exec vitest run test/project-context-contracts.test.ts`).
- **depends-on:** —

### S2 — Порт `Tokenizer` у ring 2
- **package:** W2
- **files:**
  - modify `server/src/vendor/shared/adapters.ts` — додати `export interface Tokenizer { count(text: string): number }`;
  - modify `server/src/adapters/tokenizer/index.ts`:
    - `import type { Tokenizer } from '@devdigest/shared'` + `export type { Tokenizer }`, щоб наявні імпорти `container.ts:42` і `repo-intel/types.ts` лишилися робочими;
    - клас `implements Tokenizer`;
    - оновити заголовковий коментар: канонічний оцінювач для repo-intel і project-context;
  - create `server/test/tokenizer.test.ts`.
- **skills:** onion-architecture — lane 8 (порт лежить усередині, адаптер зовні); typescript-expert — lane 13.
- **constraints:** C1, C12
- **covers:** AC-5
- **reuse:** `server/src/adapters/tokenizer/index.ts:15-40` (`approxTokens`, `TiktokenTokenizer`).
- **done-when:** `pnpm -C server typecheck` і `arch:check` зелені; T2 проходить.
- **depends-on:** —

### S3 — `GitClient.listTree` / `readBlob`
- **package:** W2
- **files:**
  - modify `server/src/vendor/shared/adapters.ts`:
    - `export interface GitTreeEntry { path: string; mode: string; type: 'blob'|'tree'|'commit'; oid: string; size: number | null }`;
    - у `GitClient`: `listTree(repo: RepoRef, sha: string): Promise<GitTreeEntry[]>` і `readBlob(repo: RepoRef, oid: string, maxBytes?: number): Promise<Uint8Array>`, з TSDoc (лише git-об'єкти; розмір перевіряється до читання);
  - modify `server/src/adapters/git/show-file-at-guard.ts` — `assertSafeOid(oid)` (40 або 64 hex) і чиста `parseLsTreeZ(raw): GitTreeEntry[]`: `<mode> <type> <oid> <size|->\t<path>\0`, де `-` → `null`;
  - modify `server/src/adapters/git/simple-git.ts`:
    - `listTree`: `assertSafeRef(sha)`, `g.raw(['ls-tree','-r','-l','-z',sha])` → `parseLsTreeZ`;
    - `readBlob`: `assertSafeOid`; якщо задано `maxBytes`, то `cat-file -s <oid>` → `BlobTooLargeError`; далі `g.showBuffer([oid])` → `Uint8Array`;
  - modify `server/src/adapters/mocks.ts` — у `MockGitOptions` додати:
    - `tree?: GitTreeEntry[]`, `treeBySha?: Record<string, GitTreeEntry[]>`;
    - `blobs?: Record<string, string | Uint8Array>`;
    - `readBlobError?: Error`, `listTreeError?: Error`, `syncError?: Error`;
  - modify `MockGitClient` — реалізувати обидва методи з тими самими guard'ами та `maxBytes`; `sync` кидає `syncError`, якщо його задано; записувати виклики `readBlobCalls: string[]`;
  - create `server/test/git-tree.test.ts` — тимчасовий репо в `os.tmpdir()` через `execFile('git', …)`, реальний `SimpleGitClient`.
- **skills:** onion-architecture — lane 8; typescript-expert — lane 13; security — lane 14 (argv, git spawn).
- **constraints:** C8, C9, C19
- **covers:** AC-11, EC-9, AC-13, AC-14 (байти), AC-8 (читання об'єкта)
- **reuse:** `server/src/adapters/git/show-file-at-guard.ts:20-75` (`assertSafeRef`, `BlobTooLargeError`, `parseBlobSize`); `simple-git.ts:134-150` (патерн size-before-read); `simple-git` 3.36.0 `showBuffer` (`simple-git.d.ts:915`).
- **done-when:**
  - `pnpm -C server typecheck`, `lint`, `arch:check` зелені;
  - T3 проходить;
  - усі наявні unit-тести зелені (mocks.ts впливає на всі).
- **depends-on:** —

### S4 — Схема `context_catalogs` / `context_docs` + міграція
- **package:** W2
- **files:**
  - create `server/src/db/schema/project-context.ts`:
    - `contextCatalogs` (`context_catalogs`):
      - `repoId uuid PK → repos.id ON DELETE CASCADE`;
      - `workspaceId uuid NOT NULL → workspaces.id CASCADE`;
      - `status text enum ['scanning','ready','error'] NOT NULL DEFAULT 'ready'`;
      - `branch text`, `scannedSha text`, `scannedAt timestamptz`, `scanStartedAt timestamptz`;
      - `totalFiles integer NOT NULL DEFAULT 0`, `truncated boolean NOT NULL DEFAULT false`;
      - `error text`, `updatedAt timestamptz NOT NULL DEFAULT now()`;
      - індекс `context_catalogs_ws_idx(workspace_id)`;
    - `contextDocs` (`context_docs`):
      - `repoId uuid NOT NULL → repos.id CASCADE`, `path text NOT NULL`;
      - `category text enum NOT NULL`, `size integer NOT NULL`, `estTokens integer` (nullable);
      - `status text enum ['ok','empty','too_large','unreadable'] NOT NULL`;
      - `secretWarning boolean NOT NULL DEFAULT false`, `blobOid text NOT NULL`;
      - `primaryKey(repoId, path)`, без surrogate id, бо ідентичність — `(repo, path)`, як в attachments AC-3;
  - modify `server/src/db/schema.ts` — `export * from './schema/project-context';`;
  - create `server/src/db/migrations/NNNN_*.sql` + `meta/*` — **лише** через `pnpm -C server db:generate`.
- **skills:** postgresql-table-design, drizzle-orm-patterns — lane 7.
- **constraints:** C5, C6
- **covers:** NFR-4 (каталог переживає рестарт), NFR-8 (нова міграція вручну)
- **reuse:** `server/src/db/schema/repos.ts:5-25` і `schema/context.ts` (стиль, `now()` з `schema/_shared`).
- **done-when:**
  - `db:generate` створив рівно одну нову міграцію з двома `CREATE TABLE` і без `DROP`/`ALTER` наявних таблиць;
  - `pnpm -C server typecheck` зелений;
  - `db:migrate` **не** запускався.
- **depends-on:** —

### S5 — Чисті правила каталогу (`constants.ts`, `helpers.ts`)
- **package:** W3
- **files:**
  - create `server/src/modules/project-context/constants.ts`:
    - `CONTEXT_SCAN_JOB_KIND = 'project-context-scan'`, `MAX_DOC_BYTES = 65_536`, `MAX_CATALOG_ENTRIES = 1_000`;
    - `MARKDOWN_EXT_RE = /\.mdx?$/i`, `EXCLUDED_SEGMENTS = ['node_modules','vendor','.git']`, `ALLOWED_DOT_SEGMENT = '.devdigest'`, `SYMLINK_MODE = '120000'`;
    - `STALE_SCAN_MS = 10 * 60_000`, `SCAN_YIELD_EVERY = 25`;
    - `SECRET_PATTERNS` (саме ці шість): `/sk_live_[0-9A-Za-z]{8,}/`, `/\bsk-[A-Za-z0-9_-]{20,}/`, `/\bAKIA[0-9A-Z]{16}\b/`, `/-----BEGIN [A-Z ]*PRIVATE KEY-----/`, `/\bghp_[A-Za-z0-9]{36}\b/`, `/service_role/`;
  - create `server/src/modules/project-context/helpers.ts`:
    - `isEligiblePath(path)` (AC-2: будь-який сегмент з `EXCLUDED_SEGMENTS` або сегмент на `.`, крім `.devdigest`, виключає файл);
    - `categorize(path)` (AC-3: перше правило, що спрацювало; `specs` — якщо починається з `.devdigest/specs/` або є директорія-сегмент `specs`; `insights` — `INSIGHTS.md` або директорія `insights`; інакше `docs`);
    - `hasSecret(text)`;
    - `decodeUtf8Strict(bytes): string | null` (`new TextDecoder('utf-8', {fatal:true})`);
    - `selectEntries(tree): {entries, totalFiles, truncated, skipped: {symlink, non_blob, excluded, over_cap}}` — фільтр blob + не-120000 + eligible, сортування `a<b`, обрізання до 1000;
    - `classifyDoc(size, bytes|null, tokenizer)` → `{status, est_tokens, secret_warning}` (EC-6: 0 байт → `empty`, 0 токенів);
  - create `server/test/project-context-helpers.test.ts`.
- **skills:** onion-architecture — lane 5; typescript-expert — lane 13.
- **constraints:** C1, C8, C9, C12, C24
- **covers:** AC-2, AC-3, AC-11, AC-13, AC-14, AC-24, AC-25, EC-6, EC-11, NFR-3
- **reuse:** `Tokenizer` з S2 (передається параметром).
- **done-when:** T4 проходить; `lint`, `typecheck`, `arch:check` зелені.
- **depends-on:** S2 (W2), S3 (W2, тип `GitTreeEntry`)

### S6 — Порти та repository
- **package:** W3
- **files:**
  - create `server/src/modules/project-context/types.ts`:
    - `ProjectContextCatalog` — read-порт для інших модулів: `getCatalog(workspaceId, repoId): Promise<ContextCatalog>`, `readDoc(workspaceId, repoId, path): Promise<ContextDocContent>`;
    - `ProjectContextStore` — repository-порт: `getRepo(workspaceId, repoId)`, `getRepoById(repoId)` → `{id, workspaceId, owner, name, defaultBranch, clonePath}`; `getCatalogState(repoId)`, `listDocs(repoId)`, `getDoc(repoId, path)` (з `blobOid`); `markScanning(repoId, workspaceId, startedAt)`; `replaceCatalog(input)`; `markError(repoId, workspaceId, reason)`;
    - `ScanLogger` (pino-сумісний `info`/`warn`);
    - доменні типи `CatalogState`, `CatalogDoc`;
  - create `server/src/modules/project-context/repository.ts` — `ProjectContextRepository implements ProjectContextStore`:
    - `replaceCatalog` в одній `db.transaction`: upsert `context_catalogs` (`status 'ready'`, `error null`), `DELETE context_docs WHERE repo_id`, batch `INSERT` ≤1000;
    - `markError` оновлює лише рядок каталогу (upsert з `status 'error'`), `context_docs` не чіпає;
    - `listDocs` з `ORDER BY path`;
    - мапінг row → доменний тип.
- **skills:** drizzle-orm-patterns, onion-architecture — lane 6; typescript-expert — lane 13.
- **constraints:** C1, C3, C5
- **covers:** NFR-4, AC-27 (записи недоторкані), AC-4 (порядок)
- **reuse:**
  - `server/src/modules/repos/repository.ts:36-42` (`getById` зі scoping на workspace) — як зразок; окремий запит у власному repository, без імпорту класу;
  - `DbOrTx`, як в `insertReviewWithFindings` (`server/AGENTS.md`).
- **done-when:** `typecheck`, `arch:check` зелені; repository покривається T9 (it).
- **depends-on:** S4 (W2), S1 (W1)

### S7 — `ProjectContextService`
- **package:** W3
- **files:**
  - create `server/src/modules/project-context/service.ts` — `ProjectContextService implements ProjectContextCatalog`. Конструктор: `(store: ProjectContextStore, git: GitClient, tokenizer: Tokenizer, jobs: JobRegistrar-подібний {register, enqueue})`. Поле `inFlight = new Map<string, Promise<void>>()`.
  - `getCatalog(workspaceId, repoId, logger?)`:
    - репо не в workspace → `NotFoundError`;
    - `clonePath == null` → `status 'not_cloned'`, `files: []`;
    - немає рядка каталогу → запустити `scan(repo, {sync:false})` без очікування і повернути `'scanning'` (Q2);
    - рядок має `'scanning'`, а `inFlight` не має repo, або `scanStartedAt` старший за `STALE_SCAN_MS` → `markError('scan_interrupted')` і повернути `'error'` (REC7);
    - інакше мапити в DTO: `scanned_at` → ISO, `used_by: null`.
  - `readDoc(workspaceId, repoId, path)`:
    - перевірка власника;
    - `store.getDoc(repoId, path)`; якщо запису немає → `NotFoundError('Document not found', {reason:'not_in_catalog', branch, sha})` **без** git-виклику;
    - `too_large`/`unreadable` → `content: null`; `empty` → `''`;
    - `ok` → `git.readBlob(ref, blobOid, MAX_DOC_BYTES)` → `decodeUtf8Strict`;
    - будь-яка git-помилка → `NotFoundError(…, {reason:'commit_unavailable', branch, sha})` (Q3).
  - `rescan(workspaceId, repoId, logger?)`:
    - перевірка власника;
    - не клоновано → `ConflictError('not_cloned')`;
    - інакше `scan(repo, {sync:true})` без очікування (single-flight: якщо промис уже є, повернути поточний стан) → `{status:'accepted', catalog_status:'scanning'}`.
  - `scan(repo, {sync, logger})` (приватний, single-flight за `repoId`):
    - `markScanning`;
    - `sync` ? `git.sync(ref, defaultBranch)` : `git.currentHead`;
    - `listTree` → `selectEntries`;
    - мапа `blobOid` → попередній запис із `listDocs`; при збігу поля перевикористовуються (REC2), інакше `readBlob` + `classifyDoc`;
    - `await setImmediate`-yield кожні `SCAN_YIELD_EVERY` документів;
    - `replaceCatalog`;
    - якщо `sync` — best-effort `jobs.enqueue(workspaceId, REFRESH_JOB_KIND, {repoId, owner, name})` у try/catch;
    - один `logger.info({repoId, sha, entries, total_files, skipped:{symlink, non_blob, excluded, over_cap, too_large, unreadable, empty}, reused, durationMs}, 'project-context: scan finished')`;
    - при помилці → `markError(reason)` + `logger.warn({repoId, reason, durationMs})`; ніколи не кидає.
  - `scanForJob(repoId, logger)` → `getRepoById`, потім `scan({sync:false})`.
  - `registerScanJobHandler(logger)` → `jobs.register(CONTEXT_SCAN_JOB_KIND, …)`, що ніколи не кидає.
  - create `server/test/project-context-service.test.ts` — fake store у пам'яті + `MockGitClient` + лічильник-tokenizer.
- **skills:** onion-architecture — lane 5; typescript-expert — lane 13; security — lane 14 (вхідний `path`, git spawn, секрети в логах).
- **constraints:** C1, C3, C4, C8, C9, C10, C11, C12, C20, C24
- **covers:** AC-1 (збірка з HEAD), AC-5, AC-8, AC-11, AC-12, AC-13, AC-14, AC-15, AC-16, AC-24, AC-25, AC-27, EC-1, EC-2, EC-3, EC-4, EC-8, EC-9, EC-10, NFR-2, NFR-4, NFR-5, NFR-7
- **reuse:**
  - `modules/intent/service.ts:152,208-222` (single-flight `Map`);
  - `modules/conventions/service.ts:167-191` (handler без throw, деградований статус);
  - `modules/repo-intel/service.ts:150-170` (`git.sync` з `defaultBranch`);
  - `REFRESH_JOB_KIND` з `modules/repo-intel/constants.ts:8`.
- **done-when:** T5 проходить; `lint`, `typecheck`, `arch:check` зелені (0 порушень `service-takes-ports-not-container` і `no-sideways-module-imports`).
- **depends-on:** S5, S6

### S8 — Маршрути, реєстрація модуля, контейнер
- **package:** W3
- **files:**
  - create `server/src/modules/project-context/routes.ts`:
    - `GET /repos/:id/context` (`params: IdParams`, `response: {200: ContextCatalog}`);
    - `GET /repos/:id/context/file` (`querystring: ContextFileQuery`, `response: {200: ContextDocContent}`);
    - `POST /repos/:id/context/rescan` (`response: {202: ContextRescanAccepted}`);
    - кожен викликає `getContext` і один метод `container.projectContext`, передає `req.log`;
    - під час реєстрації плагіна — `container.projectContext.registerScanJobHandler(app.log)`;
  - modify `server/src/modules/index.ts` — імпорт і запис `projectContext`;
  - modify `server/src/platform/container.ts`:
    - `private _projectContext?`;
    - `get projectContext(): ProjectContextService` → `this._projectContext ??= new ProjectContextService(new ProjectContextRepository(this.db), this.git, this.tokenizer, this.jobs)`;
    - тип `Tokenizer` лишається з `adapters/tokenizer/index.ts` (реекспорт).
- **skills:** fastify-best-practices, onion-architecture — lane 4; onion-architecture — lane 8 (container.ts); security — lane 14; response-schema, breaking-change — lanes 17–18 (лише адитивно).
- **constraints:** C2, C4, C20, C23
- **covers:** AC-4, AC-8, AC-12, AC-16, EC-2, EC-10, NFR-3, NFR-5, NFR-8
- **reuse:**
  - `server/src/modules/_shared/schemas.ts:11` (`IdParams`), `_shared/context.ts:14` (`getContext`);
  - обробник помилок передає `details` (`server/src/app.ts:154`);
  - патерн маршрутів — `modules/repo-intel/routes.ts:56-104`.
- **done-when:**
  - `lint`, `typecheck`, `arch:check` зелені;
  - `test/routes-smoke.test.ts` та інші unit-тести зелені;
  - маршрути покриті T9.
- **depends-on:** S7

### S9 — Тригери AC-1: clone job і resync
- **package:** W3
- **files:**
  - modify `server/src/modules/repos/service.ts` — у `runCloneJob` після `updateClonePath` і enqueue `INDEX_JOB_KIND`, окремим try/catch: `jobs.enqueue(workspaceId, CONTEXT_SCAN_JOB_KIND, {repoId})` (імпорт з `../project-context/constants.js`);
  - modify `server/src/modules/repo-intel/repository.ts` — додати `workspaceId` у `RepoBasics` і в select `getRepoBasics` (`:58`, `:136-148`);
  - modify `server/src/modules/repo-intel/service.ts` — у `resyncRepo` лише після успішного `git.sync`: best-effort `this.deps.jobs.enqueue(repo.workspaceId, CONTEXT_SCAN_JOB_KIND, {repoId})` у try/catch, потім `runIncremental`, як і раніше; тип і значення результату та відповідь маршруту не змінюються;
  - modify `server/test/repo-intel-resync.test.ts` — додати `workspaceId` у `Basics` і записувальний `jobs`;
  - create `server/test/project-context-triggers.test.ts` — `RepoService.runCloneJob` зі stub-repository і записувальним `JobRunner`.
- **skills:** onion-architecture — lane 5, lane 6 (`repo-intel/repository.ts`); drizzle-orm-patterns — lane 6; breaking-change — lane 17 (відповідь `/resync` незмінна).
- **constraints:** C3, C11, C23
- **covers:** AC-1, NFR-8
- **reuse:** `server/src/modules/repos/service.ts:66-80` (патерн best-effort enqueue); `repo-intel/constants.ts` як прецедент імпорту констант між модулями (`repos/service.ts:12-15`).
- **done-when:** T6 і T7 проходять; усі unit-тести `repo-intel-*` зелені; `arch:check` зелений.
- **depends-on:** S5 (константа), S8 (handler зареєстрований)

### S10 — Інтеграційний тест модуля
- **package:** W3
- **files:** create `server/test/project-context.it.test.ts`:
  - `startPg` + `seed` + `buildApp({overrides:{git: new MockGitClient({tree, blobs, head, syncedHead, syncError…})}})`;
  - репо, вставлені напряму в `t.repos` з `clonePath`;
  - унікальні імена репо на кожен тест (`let seq`).
- **skills:** fastify-best-practices (`inject`) — lane 4; drizzle-orm-patterns — lane 6.
- **constraints:** C20, C23
- **covers:** AC-1, AC-4, AC-8, AC-11, AC-12, AC-13, AC-16, AC-24, AC-27, EC-2, EC-4, EC-10, NFR-1, NFR-3, NFR-4, NFR-5, NFR-8
- **reuse:** `server/test/pr-history-routes.it.test.ts:1-70` (fixture), `test/helpers/pg.ts`.
- **done-when:**
  - файл закінчується на `.it.test.ts`;
  - `pnpm -C server typecheck` зелений (тест компілюється);
  - T9 написаний; **не запускається імплементером** — запускає CI `server-integration.yml`.
- **depends-on:** S8, S9

### S11 — Клієнтські хуки
- **package:** W4
- **files:**
  - create `client/src/lib/hooks/context.ts`:
    - `useContextCatalog(repoId)`: `queryKey ["context-catalog", repoId]`, `refetchInterval: (q) => q.state.data?.status === "scanning" ? 1500 : false`;
    - `useContextDoc(repoId, path, sha)`: `queryKey ["context-doc", repoId, sha, path]`, `enabled: !!path`, `retry` без повторів на `ApiError.status === 404`;
    - `useRescanContext(repoId)`: `POST /repos/:id/context/rescan`, `onSuccess` → `setQueryData` зі статусом `scanning` + `invalidateQueries(["context-catalog", repoId])`;
  - modify `client/src/lib/hooks/core.ts` — видалити `useContextFiles`/`useReindexContext` (`:122-137`) і імпорти `SpecFile`/`IndexStatus`, що більше не використовуються;
  - modify `client/src/lib/hooks/index.ts` — `export * from "./context";`;
  - modify `client/src/lib/types.ts` — реекспорт `ContextCatalog`, `ContextDoc`, `ContextDocContent`, `ContextCategory`, `ContextDocStatus`, `ContextCatalogStatus`, `ContextRescanAccepted` (`SpecFile`/`IndexStatus` лишаються).
- **skills:** frontend-architecture — lane 11; react-best-practices (Data Fetching); typescript-expert — lane 13.
- **constraints:** C12, C13, C23
- **covers:** AC-17 (опитування), AC-26 (TanStack тримає `data` при помилці рефетчу), EC-7 (ключ за `path`)
- **reuse:** `client/src/lib/hooks/repo-intel.ts:31-49` (опитування + mutation); `useRefreshRepo` (`core.ts:82-90`) для Resync у стані not-cloned.
- **done-when:** `pnpm -C client typecheck` і `lint` зелені; `git grep useContextFiles\|useReindexContext -- client/src` порожній.
- **depends-on:** S1 (W1)

### S12 — i18n і пункт сайдбару
- **package:** W4
- **files:**
  - modify `client/messages/en/context.json`:
    - видалити мертві `chunks`, `reindex`, `indexing`, `mode.*`, `editor.*`, `indexStatus`, `kb`;
    - додати ключі v1: заголовок; `filter.placeholder`; `categories.{specs,docs,insights}`; `tokens.prefix` / `tokens.tooltip` («Tokenizer estimate — can differ by 10–30 % depending on the model»); `footer` («{count} files · scanned {time} ago»); `rescan` / `rescanning`; `status.started` / `status.finished`; `notCloned.{title,body,resync}`; `empty.{title,body}` зі згадкою `.devdigest/specs/`; `noMatch.{title,clear}`; `truncated` («Showing first 1,000 of {total}»); `loadError` («Couldn't load documents»), `retry`; `rescanError` («Rescan failed: {reason}»); `secretWarning` («Possible secret»); `preview.{empty,tooLarge,unreadable,notFound,backToList,loading,selectPrompt}`; `size.*`;
    - жодних `<…>`;
  - modify `client/src/vendor/ui/nav.ts` — у групу `WORKSPACE` після `pulls`: `{ key: "context", label: "Project Context", icon: "FileText", href: "/repos/:repoId/context" }` без `gKey`;
  - create `client/src/components/app-shell/helpers.test.ts`;
  - наявні `*.test.tsx`: додавати `context` у провайдер лише якщо `pnpm -C client test` показує `MISSING_MESSAGE` для `context`.
- **skills:** frontend-architecture — lane 11; react-testing-library — lane 12.
- **constraints:** C15, C19, C22
- **covers:** AC-28, AC-29 (немає рядків для edit/upload), NFR-9
- **reuse:** `client/messages/en/shell.json:20` (`nav.context`); `client/src/components/app-shell/helpers.ts:30` (`activeKeyFor` уже повертає `context`); `resolveHref` (`nav.ts:66-69`).
- **done-when:**
  - T10 і T11 проходять;
  - `pnpm -C client test` зелений без нових `MISSING_MESSAGE` у stderr;
  - `git grep` у `client/src` не знаходить ключів, видалених з `context.json`.
- **depends-on:** —

### S13 — Чисті хелпери сторінки
- **package:** W4
- **files:**
  - create `client/src/app/repos/[repoId]/context/_components/ProjectContextView/helpers.ts`:
    - `parseViewState(search) → {q, cats: ContextCategory[], doc}` і `toSearch(state)` (AC-22);
    - `filterDocs(files, q, cats)` (AC-20: підрядок шляху без урахування регістру; AC-21: вибрані категорії, порожній набір = усі);
    - `isNoMatch(files, filtered)` (AC-23);
    - `truncateMiddle(path, 120)` (EC-5);
    - локальна копія `relativeTime(iso)`;
    - `formatSize(bytes)`, `shortSha(sha)`;
  - create `.../ProjectContextView/constants.ts` (`CATEGORIES`, `SKELETON_ROWS = 8`, `MAX_PATH_CHARS = 120`, `POLL_MS`);
  - create `.../ProjectContextView/helpers.test.ts`.
- **skills:** frontend-architecture — lane 9 (`app/**/*.ts`); react-testing-library — lane 12.
- **constraints:** C17, C18, C21
- **covers:** AC-18 (форматування), AC-20, AC-21, AC-22, AC-23, EC-5
- **reuse:** логіка `relativeTime` з `client/src/app/conventions/_components/ConventionsView/helpers.ts` (копія, не імпорт).
- **done-when:** T12 проходить; `typecheck` і `lint` зелені.
- **depends-on:** S1 (W1)

### S14 — Презентаційні компоненти
- **package:** W4
- **files:** under `client/src/app/repos/[repoId]/context/_components/ProjectContextView/_components/`:
  - `CatalogFilters/CatalogFilters.tsx` — поле фільтра з `label` + три чіпи-тумблери (`aria-pressed`);
  - `DocRow/DocRow.tsx`:
    - `<button>` з `aria-label`/`title` = повний шлях;
    - видимий текст — `truncateMiddle`;
    - тег категорії текстом; розмір; `<TokenEstimate>`;
    - бейдж «Possible secret» при `secret_warning`;
    - для `too_large`/`unreadable` — підпис статусу;
  - `TokenEstimate/TokenEstimate.tsx` (+ `TokenEstimate.test.tsx`):
    - `≈{n}` або `—` для `null`;
    - фокусований `<span tabIndex={0} aria-describedby>`;
    - власна підказка `role="tooltip"`, видима на hover і focus (CSS-стан через `onMouseEnter`/`onFocus`); без бібліотек;
  - `DocPreview/DocPreview.tsx` (+ `DocPreview.test.tsx`):
    - заголовок (шлях, категорія, `≈`, попередження про секрет);
    - вміст через `Markdown`;
    - стани: завантаження (EC-7), `empty` («Empty document»), `too_large` / `unreadable` (причина + розмір, EC-8), not-found із `details.reason` (EC-2, Q3: «Document not found in {branch}@{sha}» + Rescan + назад до списку);
  - `CatalogFooter/CatalogFooter.tsx` — «N files · scanned X ago», `branch`, short SHA, кнопка Rescan (`disabled` + «Rescanning…» при `scanning`/`pending`), live-регіон `role="status"`;
  - кожен з `index.ts`.
- **skills:** react-best-practices, frontend-architecture — lane 10; react-testing-library — lane 12; security (XSS) — C14.
- **constraints:** C12, C14, C15, C16, C17, C22
- **covers:** AC-4 (рядок), AC-6, AC-7, AC-8, AC-9, AC-10, AC-13, AC-14, AC-17, AC-18, AC-25, AC-29, EC-2, EC-5, EC-6, EC-7, EC-8, EC-11, NFR-5, NFR-6
- **reuse:** `Markdown`, `Chip`, `Badge`, `Button`, `IconBtn`, `Skeleton`, `EmptyState`, `ErrorState` з `@devdigest/ui` (`client/src/vendor/ui/primitives/*`).
- **done-when:** T13 і T14 проходять; `typecheck`, `lint` зелені; жодного `dangerouslySetInnerHTML`/`rehype-raw` у `context/**`.
- **depends-on:** S11, S12, S13

### S15 — `ProjectContextView` і маршрут
- **package:** W4
- **files:**
  - create `.../ProjectContextView/ProjectContextView.tsx` (`"use client"`), контейнер:
    - `useParams` → `repoId`; `useSearchParams` + `router.replace` для `q`/`cat`/`doc`;
    - `useContextCatalog`, `useContextDoc`, `useRescanContext`, `useRefreshRepo`; стани через ранні повернення;
    - pending без даних → skeleton-рядки, навігація лишається активною (AC-30);
    - помилка без даних → `ErrorState` «Couldn't load documents» + Retry; помилка з даними → інлайн-банер + список лишається (AC-26);
    - `not_cloned` → «Repository not cloned yet» + Resync через `useRefreshRepo`, після успіху опитування, поки статус лишається `not_cloned` (AC-15, EC-1);
    - `error` → банер з причиною + Retry над попереднім списком (AC-27, EC-4);
    - 0 записів → порожній стан з `.devdigest/specs/` + Rescan (AC-19);
    - `truncated` → «Showing first 1,000 of N» (AC-24);
    - нуль збігів → «No documents match» + Clear filters (AC-23);
    - список + прев'ю + футер (AC-4, AC-18, EC-3);
  - create `.../ProjectContextView/styles.ts`, `index.ts`, `ProjectContextView.test.tsx`;
  - create `client/src/app/repos/[repoId]/context/page.tsx` — тонкий: `<AppShell>` (як у `pulls/page.tsx`) + `<Suspense>` + `<ProjectContextView/>`; `RepoNotFound` через `useRepoNotFound`, як у pulls, якщо шаблон вимагає client-компонента.
- **skills:** next-best-practices, frontend-architecture — lane 9; react-best-practices — lane 10; react-testing-library — lane 12.
- **constraints:** C13, C15, C16, C17, C18, C22
- **covers:** AC-4, AC-15, AC-16, AC-17, AC-18, AC-19, AC-22, AC-23, AC-24, AC-26, AC-27, AC-29, AC-30, EC-1, EC-3, EC-4, EC-10, NFR-6, NFR-9
- **reuse:** `client/src/app/repos/[repoId]/pulls/page.tsx:1-60` (`AppShell`, `useActiveRepo`, `useRepoNotFound`, search params); `client/src/app/conventions/page.tsx` (тонкий маршрут).
- **done-when:** T15 проходить; `pnpm -C client lint`, `typecheck`, `test` зелені.
- **depends-on:** S14

## Test plan
Кожен T# пише імплементер у вказаному кроці.

- **T1:** NFR-8 → `server/test/project-context-contracts.test.ts` — unit.
  - Зразковий `ContextCatalog` з `used_by: null` проходить парсинг; `used_by` з агентами/скілами теж.
  - `est_tokens: -1` відхиляється.
  - `SpecFile`/`IndexStatus` парсять свої старі фікстури.
  - Написано в S1.
- **T2:** AC-5 → `server/test/tokenizer.test.ts` — unit. `count('hello world')` дорівнює кількості токенів cl100k (>0); з `vi.mock('js-tiktoken')`, де `getEncoding` кидає, повертається `ceil(len/4)`. Написано в S2.
- **T3:** AC-11, EC-9, AC-13, AC-14 → `server/test/git-tree.test.ts` — unit, реальний git у tmpdir.
  - `listTree` повертає symlink з `mode '120000'`, `type 'blob'`, `size` = довжина цілі.
  - Gitlink (`git update-index --add --cacheinfo 160000,<sha>,sub`) має `type 'commit'`, `size null`.
  - `readBlob` повертає байти не-UTF-8 файлу без змін.
  - `readBlob(oid, 10)` на 11-байтовому blob кидає `BlobTooLargeError`.
  - `readBlob('--help')` і `listTree('HEAD')` кидають `UnsafeGitShowArgsError`.
  - Написано в S3.
- **T4:** AC-2, AC-3, AC-11, AC-13, AC-14, AC-24, AC-25, EC-6, EC-11 → `server/test/project-context-helpers.test.ts` — unit.
  - Таблиці шляхів: `README.MD` / `x.mdx` / `node_modules/a.md` / `.github/a.md` / `.devdigest/specs/a.md` / `pkg/vendor/a.md`.
  - Категорії з пріоритетом `specs` над `insights` (`specs/INSIGHTS.md` → `specs`).
  - Mode 120000 відкидається з лічильником `symlink`.
  - 1 001 запис → 1 000, `truncated`, `totalFiles 1001`, порядок `a<b`.
  - 65 537 байт → `too_large`, `est_tokens null`, читання немає.
  - Невалідний UTF-8 → `unreadable`, `null`.
  - 0 байт → `empty`, 0.
  - По одному позитиву на кожен із шести патернів секретів і негатив «skip-list».
  - Написано в S5.
- **T5:** AC-1, AC-5, AC-8, AC-12, AC-15, AC-16, AC-27, EC-1, EC-2, EC-3, EC-4, EC-8, EC-10, NFR-2, NFR-4, NFR-7 → `server/test/project-context-service.test.ts` — unit (fake store + `MockGitClient`).
  - Скан будується з `currentHead` (без sync); `est_tokens` = `tokenizer.count`.
  - Шлях поза каталогом → `NotFoundError` і `readBlobCalls` порожній.
  - `readBlobError` → 404 з `reason 'commit_unavailable'`.
  - Не клоновано → `not_cloned`.
  - Rescan викликає `sync(defaultBranch)` і ставить `REFRESH_JOB_KIND`.
  - `syncError` → статус `error` з причиною, попередні записи незмінні.
  - Два одночасні `rescan` → один `sync`.
  - Незмінний `blobOid` → без `readBlob` (REC2).
  - Застряглий `scanning` → `error 'scan_interrupted'`.
  - Лазі-перший-скан повертає `scanning`.
  - Логер отримав рівно один `info` з полями `repoId`/`sha`/`entries`/`skipped`/`durationMs` і без вмісту документа.
  - Конструктор сервісу не має LLM-порту (0 LLM-викликів за побудовою).
  - Написано в S7.
- **T6:** AC-1 (resync) → `server/test/repo-intel-resync.test.ts` — unit. Успішний sync ставить `CONTEXT_SCAN_JOB_KIND` з `{repoId}`; невдалий sync не ставить; результат `IndexResult` незмінний. Написано в S9.
- **T7:** AC-1 (clone) → `server/test/project-context-triggers.test.ts` — unit. `runCloneJob` ставить `CONTEXT_SCAN_JOB_KIND` після `updateClonePath`; помилка enqueue не валить clone job. Написано в S9.
- **T8:** (зарезервовано; вміст злито в T5).
- **T9:** AC-1, AC-4, AC-8, AC-11, AC-12, AC-13, AC-16, AC-24, AC-27, EC-2, EC-4, EC-10, NFR-1, NFR-3, NFR-4, NFR-5, NFR-8 → `server/test/project-context.it.test.ts` — it.
  - Перший GET → `scanning`, далі `ready` зі списком за `path`.
  - Прев'ю `ok` віддає `content`; `too_large` → `content null`.
  - `?path=../x` і невідомий шлях → 404; порожній `path` → 422; чужий або невідомий repo → 404.
  - Symlink відсутній у списку.
  - 1 200 документів → 1 000 + `truncated`.
  - Rescan → 202, новий `scanned_sha` = `syncedHead`.
  - Rescan з `syncError` → `status 'error'`, `files` як раніше.
  - Два POST → один sync.
  - Новий `buildApp` над тією ж БД бачить каталог (рестарт).
  - p95 з 20 GET (500 документів, після warm-up) ≤ 500 мс.
  - `POST /repos/:id/resync` досі 202 зі старою формою.
  - Написано в S10, **не запускається імплементером**.
- **T10:** AC-28 → `client/src/components/app-shell/helpers.test.ts` — unit. `NAV` → `WORKSPACE` містить `{key:'context', href:'/repos/:repoId/context'}` без `gKey`; `resolveHref` підставляє id; `activeKeyFor('/repos/x/context')==='context'`. Написано в S12.
- **T11:** NFR-9 → той самий файл або `.../ProjectContextView/helpers.test.ts` — unit. Жодне значення в `messages/en/context.json` не містить `/<[A-Za-z]/`. Написано в S12.
- **T12:** AC-18, AC-20, AC-21, AC-22, AC-23, EC-5 → `.../ProjectContextView/helpers.test.ts` — unit.
  - Фільтр без регістру.
  - Чіпи; порожній набір = усі.
  - Round-trip `parseViewState`/`toSearch`.
  - `isNoMatch`.
  - `truncateMiddle` для 121 символу має `…` усередині і довжину ≤120.
  - `relativeTime`/`shortSha`.
  - Написано в S13.
- **T13:** AC-6, AC-7 → `.../TokenEstimate/TokenEstimate.test.tsx` — component. Рендерить `≈1,234`; `null` → `—`; `fireEvent.focus` / `mouseEnter` показує `role="tooltip"` з текстом про 10–30 %. Написано в S14.
- **T14:** AC-8, AC-9, AC-10, AC-25, EC-2, EC-6, EC-8 → `.../DocPreview/DocPreview.test.tsx` — component.
  - `[x](javascript:alert(1))` → `<a>` з `href=""`; `![i](data:image/png;base64,AA)` → `src=""`.
  - `<script>alert(1)</script><b>x</b>` видно як текст, у DOM немає `script`/`b`.
  - «Empty document»; причина + розмір для `too_large`/`unreadable`.
  - Попередження «Possible secret» у заголовку.
  - Not-found з `branch@sha` + Rescan + назад.
  - Написано в S14.
- **T15:** AC-4, AC-15, AC-17, AC-19, AC-23, AC-24, AC-26, AC-27, AC-29, AC-30, EC-7, AC-22 → `.../ProjectContextView/ProjectContextView.test.tsx` — component, хуки замокані.
  - Skeleton при pending.
  - Список за порядком сервера.
  - `not_cloned` + Resync викликає `useRefreshRepo.mutate`.
  - `scanning` → Rescan `disabled` + «Rescanning…».
  - Порожній стан згадує `.devdigest/specs/`.
  - «No documents match» + Clear filters.
  - «Showing first 1,000 of 1,200».
  - `isError` з даними → банер + рядки на місці; без даних → «Couldn't load documents» + Retry.
  - `error` → причина + Retry над списком.
  - Немає кнопок edit/upload/new/delete.
  - Вибір рядка викликає `router.replace` з `doc=`.
  - Зміна вибору під час завантаження показує лише останній документ.
  - Написано в S15.
- **NFR-6:** manual (див. Review handoff).
- **Commands:**
  - `./scripts/check-shared-sync.sh`;
  - `pnpm -C server lint`, `pnpm -C server typecheck`, `pnpm -C server arch:check`, `pnpm -C server exec vitest run --exclude '**/*.it.test.ts'`;
  - `pnpm -C client lint`, `pnpm -C client typecheck`, `pnpm -C client test`;
  - `*.it.test.ts` — not run by implementer.
- **Multi-agent:** імплементери запускають цільові тести + typecheck своїх пакетів. Повна таблиця запускається раз на хвилю в головній сесії.

## Risks & open questions
- **Дві незалежні точки sync.** Rescan цього модуля і repo-intel `/resync` мають окремі блокування; одночасний `fetch`/`reset --hard` на одному клоні може впасти на `index.lock` (inference). Наслідок — `error` з причиною і Retry, дані не губляться. Прийнятно для v1 — for: user.
- **Захист від застряглого `scanning` припускає один інстанс API на БД** — те саме припущення, що й у `app.ts` (reaper) (inference) — for: user.
- **CPU під час першого скану.** `js-tiktoken` синхронний; перший скан великого репо (≤1 000 × 64 КБ) може на секунди блокувати event loop. Пом'якшено yield кожні 25 документів і перевикористанням за `blob_oid` (inference) — for: user.
- **Rescan (fire-and-forget) не має таймауту JobRunner.** Завислий `git fetch` лишить `scanning` до спрацювання `STALE_SCAN_MS` (10 хв), після чого стан стане `error` (inference) — for: user.
- **Поведінку `showBuffer` підтверджено лише типами** (`simple-git.d.ts:915`); реальне побайтове читання blob перевіряє T3 — for: —.
- **Регулярка `sk-…` може давати хибні попередження** (довгі ідентифікатори з префіксом `sk-`). Спека приймає розширюваний список — for: user.

## Review handoff
- **Architecture:**
  - `modules/project-context/{service,types,repository,routes}.ts`: порти замість `Container`; жодного `drizzle` у service/helpers; імпорти лише `constants` між модулями.
  - Мемоізований `container.projectContext`.
  - `Tokenizer` у `vendor/shared/adapters.ts` + реекспорт.
  - Нові методи `GitClient` + `MockGitClient`.
  - Зміни в `repos/service.ts`, `repo-intel/service.ts`, `repo-intel/repository.ts` (`RepoBasics.workspaceId`).
  - Клієнт: розміщення `_components`, відсутність імпортів між фічами (копія `relativeTime`).
- **Security:**
  - `GET /repos/:id/context/file?path=` — лише рівність у БД, 404 до будь-якого git-виклику.
  - Git argv для `ls-tree`/`cat-file`/`show` — guard на sha/oid, масив аргументів.
  - Документи лише з git-об'єктів; symlink/gitlink відкидаються.
  - Ліміт 64 КБ до читання.
  - Безпечний Markdown (без raw HTML, фільтр URL).
  - Патерни секретів; вміст і збіги не логуються.
  - Перевірка власника на трьох нових маршрутах.
  - **Наявна прогалина (не виправляється тут):** `POST /repos/:id/resync` не перевіряє належність репо до workspace (`server/src/modules/repo-intel/routes.ts:80-104`, лише `getContext`).
- **API compatibility:**
  - Нові `GET /repos/:id/context`, `GET /repos/:id/context/file`, `POST /repos/:id/context/rescan`; новий файл контракту.
  - Відповідь `/repos/:id/resync` і `/repos/:id/refresh` незмінна.
  - `SpecFile`/`IndexStatus` незмінні.
  - Видалено клієнтські хуки без споживачів, що вели на неіснуючий `/context/reindex`.
  - Лейни 17–20: очікуваний вердикт «адитивно, без breaking».
- **Tests:**
  - e2e відкладено (spec Q19) — майбутній flow для `test-writer`: відкрити Project Context → список → прев'ю → Rescan.
  - T9 (it) виконується лише в CI.
- **Docs (для `doc-writer` після верифікації):**
  - `server/README.md` (API map: 3 нові маршрути, job `project-context-scan`);
  - `server/docs/api-contracts.md` (`ContextCatalog`, `ContextDoc`, `ContextDocContent`; 404 `details.reason`);
  - `server/docs/architecture.md` (модуль, порт `ProjectContextCatalog`, тригери після clone/resync);
  - `client/README.md` (маршрут `/repos/:repoId/context`);
  - `server/src/modules/repo-intel/README.md` (resync тепер ставить у чергу перебудову каталогу);
  - специфікація реалізованої фічі — зона `doc-writer`.
- **Manual verification:**
  - NFR-6: прохід клавіатурою (рядки, фільтр, чіпи, Rescan, прев'ю у візуальному порядку, видимий фокус) + axe-скан сторінки;
  - підказка `TokenEstimate` з'являється при фокусі з клавіатури;
  - оголошення старту/фінішу сканування скрінрідером;
  - середнє обрізання довгого шляху та tooltip з повним шляхом (EC-5);
  - кроків з вимірюванням DOM (`ref`/`getBoundingClientRect`) немає.

## Not found / gaps
- **Готова таблиця для каталогу в «повній» схемі** — шукав: `server/src/db/schema/*.ts` (`context.ts`, `knowledge.ts`), `git grep context_catalogs|ContextDoc` — нічого; потрібна нова міграція (S4).
- **Tooltip-примітив у vendored UI** — шукав: `client/src/vendor/ui/primitives/*`, `kit/*`, `git grep Tooltip` — нічого (є лише атрибути `title`); підказку робить локальний `TokenEstimate` (S14).
- **Наявний тест `app-shell/helpers.ts`** — шукав: `client/src/components/app-shell/` — нічого; створюється в S12.
- **Тести сервера з реальним git** — шукав: `git grep "git init|SimpleGitClient" -- server/test` — нічого; T3 — перший такий тест, потрібен бінарник `git` у CI (є на GitHub runners — inference).
- **Unit-тест `RepoService`** — шукав: `server/test/*repos*` — нічого; створюється `project-context-triggers.test.ts` (S9).