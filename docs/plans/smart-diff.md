# План: Smart Diff на вкладці «Files changed»

> Після затвердження цей план копіюється в `docs/plans/smart-diff.md`.

## Контекст

Зараз вкладка Files changed показує файли в порядку GitHub: lock-файл стоїть поруч із бізнес-логікою. Знахідки агента живуть окремо, на вкладці Agent runs.

Smart Diff робить дві речі:

1. **Групує файли за роллю** (core → tests → wiring → docs → boilerplate) детермінованим класифікатором шляхів, без виклику LLM.
2. **Показує результат рев'ю прямо в diff:**
   - лічильник файлів зі знахідками на заголовку групи;
   - крапку на картці файла;
   - кольорову смужку з підписом на рядку;
   - картку знахідки під рядком.

Роботу гілки H03 (Intent Layer, незакомічена) не чіпаємо: у спільних файлах зміни тільки дописуються.

## Ухвалені рішення

| # | Рішення |
|---|---|
| D1 | Класифікатор живе в `server/src/modules/smart-diff/` як чиста функція `classifyFile(path)`. Правила й порядок ролей зібрані в `constants.ts`. Файл не залежить від HTTP чи БД, тож його можна імпортувати без роута (L08). |
| D2 | Новий модуль `server/src/modules/smart-diff/` (`routes.ts`, `service.ts`, `helpers.ts`, `classify.ts`, `constants.ts`). Власного репозиторію немає: порт `SmartDiffStore` оголошує сам сервіс. Цей порт структурно задовольняє наявний `PullsRepository`, який у контейнері стає мемоізованим `pullsRepo`. |
| D3 | Знахідки беруться з останнього **раунду** рев'ю через наявний `reviewIdsForFindings` (`server/src/modules/pulls/helpers.ts:52`). Dismissed не рахуються, accepted лишаються. `finding_lines` — унікальні `start_line` за зростанням. |
| D4 | У контракт додається `SmartDiffFile.finding_ids: string[]`, в обидві копії `brief.ts`. Клієнт бере з `usePrReviews` саме ці знахідки, тому лічильники й картки завжди збігаються. |
| D5 | `FindingCard` переноситься (`git mv`) у `client/src/components/finding-card/FindingCard/`, бо `components/` не може імпортувати з `app/`. У `FindingsPanel` змінюється один імпорт. |
| D6 | Групи йдуть у фіксованому порядку, порожні не віддаються. Усередині групи клієнт сортує файли за індексом у `pr.files`, тобто в порядку GitHub. |
| D7 | Перемикач Smart / Original order — локальний state у `DiffTab`, за замовчуванням Smart. |
| D8 | **Один перемикач** для GitHub-коментарів і карток знахідок. Коли знахідки є, він **за замовчуванням увімкнений**. Смужка з підписом, крапки й лічильники видно завжди. |
| D9 | Glob-и діють **на будь-якій глибині**: `**/dist/**`, `**/build/**`, `**/docs/**`, `**/e2e/**`. Тести — `*.test.*` і `*.spec.*` для ts, tsx, js, jsx. Базові імена (`README*`, `CHANGELOG*`, `LICENSE`, `*.md`) порівнюються без урахування регістру. |
| D10 | Поки smart-diff вантажиться або повернув помилку, показується Original order, а перемикач вимкнений. Шлях, якого немає у відповіді, потрапляє в кінець групи core. |
| D11 | Поки жодного рев'ю немає, показується empty state «Review not run yet», але групування працює. |

## Кроки

### S0. Зберегти план у репо
- Скопіювати цей файл у `docs/plans/smart-diff.md` перед початком реалізації.

### S1. Контракт, обидві копії
- Файли: `server/src/vendor/shared/contracts/brief.ts` і `client/src/vendor/shared/contracts/brief.ts`.
- `SmartDiffRole = z.enum(['core','tests','wiring','docs','boilerplate'])`.
- До `SmartDiffFile` додається `finding_ids: z.array(z.string())`.
- `server/test/contracts.test.ts` отримує оновлену фікстуру й кейси на `tests`/`docs`.
- Перевірка: `./scripts/check-shared-sync.sh`.

### S2. Таблиця тестів класифікатора (спершу червона)
- Файл: `server/test/smart-diff-classify.test.ts`.
- Таблиця `it.each` «шлях → роль»: на кожне правило позитивний рядок і рядок-«майже збіг».
- Окремий `describe` зі спірними кейсами й поясненням пріоритету:

  | Шлях | Роль | Чому |
  |---|---|---|
  | `__tests__/__snapshots__/x.snap` | boilerplate | правило снапшотів стоїть вище за tests |
  | `.claude/skills/security/SKILL.md` | wiring | `.claude/**` стоїть вище за docs |
  | `e2e/README.md` | tests | свідоме рішення: e2e вище за docs |

- Ще один тест: `SMART_DIFF_ROLE_ORDER` дорівнює `['core','tests','wiring','docs','boilerplate']`.

### S3. Класифікатор
- `server/src/modules/smart-diff/constants.ts`:
  - `SMART_DIFF_ROLE_ORDER` — порядок показу;
  - `CLASSIFY_RULES` — предикати за пріоритетом boilerplate → tests → wiring → docs; усе інше — core;
  - `SPLIT_SUGGESTION_DEFAULT`.
- `server/src/modules/smart-diff/classify.ts` — `classifyFile(path)`:
  - нормалізує `\` → `/` і прибирає `./` на початку;
  - виграє перше правило, що збіглося;
  - предикати написані вручну, без нових залежностей.

### S4. Чиста функція групування
- `server/src/modules/smart-diff/helpers.ts` — `buildSmartDiff(files, findings): SmartDiff`:
  - класифікує файли й будує групи в порядку ролей, порожні пропускає;
  - відкидає dismissed знахідки;
  - заповнює `finding_ids` (відсортовані за `startLine`) і `finding_lines`;
  - рахує `total_lines = Σ(additions + deletions)`; `too_big: false`, `proposed_splits: []`.
- Тест: `server/test/smart-diff-helpers.test.ts`.

### S5. Сервіс і порт
- `server/src/modules/smart-diff/service.ts`:
  - інтерфейс `SmartDiffStore` — підмножина `PullsRepository`: `findPull`, `listFiles`, `listReviewsForPulls`, `listRunsForPulls`, `listFindingsForReviews`;
  - `SmartDiffService.getSmartDiff(workspaceId, prId)`:
    1. якщо PR не знайдено — `NotFoundError`;
    2. файли, рев'ю і прогони вантажаться через `Promise.all`;
    3. ідентифікатори рев'ю беруться з `reviewIdsForFindings`;
    4. знахідки вантажаться, лише якщо ідентифікатори є;
    5. результат будує `buildSmartDiff`.
- Тест `server/test/smart-diff-service.test.ts` на фейковому store:
  - 404;
  - рев'ю ще немає — групи є, зайвих викликів немає;
  - береться тільки останній раунд;
  - fallback без прогонів.

### S6. Wiring
- `server/src/platform/container.ts`: мемоізовані `pullsRepo` і `smartDiffService()`, лише дописуємо.
- `server/src/modules/smart-diff/routes.ts` — роут `GET /pulls/:id/smart-diff`:
  - `schema: { params: IdParams, response: { 200: SmartDiffResponse } }`;
  - хендлер тонкий: `getContext`, потім сервіс;
  - за шаблоном `server/src/modules/intent/routes.ts`.
- Реєстрація в `server/src/modules/index.ts`.
- `server/test/smart-diff-routes.test.ts`: `app.inject` з невалідним id повертає 422.
- `server/test/smart-diff.it.test.ts` з testcontainers:
  - PR без рев'ю;
  - два раунди;
  - dismissed знахідка;
  - чужий workspace → 404;
  - тіло відповіді проходить `SmartDiff.parse`.

### S7. Клієнтський хук та інвалідація
- `client/src/lib/hooks/smart-diff.ts`:
  - `usePrSmartDiff(prId)` з ключем запиту `["smart-diff", prId]`;
  - за шаблоном `client/src/lib/hooks/intent.ts`;
  - експорт додається в `hooks/index.ts`.
- `client/src/lib/hooks/reviews.ts`: `["smart-diff", prId]` також інвалідується в `useFindingAction`, `useRunReview`, `useDeleteRun` і `useDeleteReview`.
- `client/src/app/repos/[repoId]/pulls/[number]/page.tsx`:
  - в `onRunDone` додається інвалідація smart-diff;
  - у `DiffTab` передаються `repoFullName` і `headSha`.

### S8. Перенесення FindingCard
- `git mv` теки `_components/FindingCard/` → `client/src/components/finding-card/FindingCard/`.
- Виправити імпорти: `githubBlobUrl`, глибину шляху до messages у тесті, `FindingsPanel.tsx`.

### S9. Тексти (i18n)
- `client/messages/en/prReview.json`, ключ `smartDiff`, нові ключі:
  - назви ролей: `testsLabel`, `docsLabel`;
  - описи ролей: `*Description`, наприклад «The substance of the change — review closely»;
  - шапка й перемикач: `heading` («Reviewer-ordered diff»), `totals`, `smartOrder`, `originalOrder`, `orderGroupLabel`;
  - aria-підписи: `filesWithFindings`, `fileHasFindings`;
  - підписи на рядку: `lineLabel.CRITICAL` = blocker, `lineLabel.WARNING` = warning, `lineLabel.SUGGESTION` = suggestion;
  - інші стани: `outsideDiffTitle`, `noReviewYet`, `unavailable`, `showAnnotations`, `hideAnnotations`, `filesChanged`.
- Хардкод-рядки з `DiffTab.tsx` переїжджають сюди.
- `<…>` усередині повідомлень не використовуємо.

### S10. diff-viewer: знахідки
- `client/src/components/diff-viewer/findings.ts`:
  - тип `DiffFindingApi` — `findings`, `showFindings`, `pending`, `onAction`, `repoFullName`, `headSha`;
  - `findingKey(f) = lineKey("RIGHT", f.start_line)`;
  - `partitionFindings` за зразком `partitionThreads` (`comments.ts:89`);
  - `topSeverity`.
  - Юніт-тест поруч.
- `CodeLine.tsx`:
  - ліва смужка через inset box-shadow кольору `SEV[top].c`;
  - підпис праворуч;
  - під рядком `FindingCard` для кожної знахідки, коли `showFindings`.
- `FileCard.tsx`:
  - фільтрує знахідки за `file.path` і розбиває їх за `renderedKeys`;
  - крапка біля шляху з aria-label, без числа, окремо від лічильника `MessageSquare`;
  - блок `OutsideDiffFindings` у кінці файла.
- `OutsideDiffFindings/` — новий компонент за зразком `OutdatedComments`.
- `DiffViewer.tsx`:
  - проп `findings` передається далі;
  - `key={f.path}` замість індексу.
- `styles.ts` і `index.ts` — відповідні доповнення.

### S11. DiffTab: групи, перемикач, шапка, empty state
- `DiffTab/constants.ts`:
  - `ROLE_META`: ключі підпису й опису, колір — core `--accent`, tests `--ok`, wiring `--warn`, docs `--info`, boilerplate `--text-muted`;
  - `COLLAPSED_BY_DEFAULT = {docs, boilerplate}`.
- `DiffTab/helpers.ts`:
  - `orderFilesByRole`;
  - `findingsForSmartDiff` — збіг за `finding_ids`;
  - `diffTotals`.
  - Тест поруч.
- `_components/DiffOrderToggle/`: `role="group"`, дві кнопки `Button` з `aria-pressed`.
- `_components/RoleGroup/`: sticky-заголовок `<button aria-expanded>`, у ньому:
  - шеврон, кольоровий квадрат, назва й опис;
  - праворуч `● N` (лише коли N > 0) перед «N files»;
  - тіло — `<DiffViewer>`.
- `_components/SmartDiffHeader/`, якщо `DiffTab` перевалить за 200 рядків.
- `DiffTab.tsx`:
  - дані з `usePrSmartDiff`, `usePrReviews`, `useFindingAction`;
  - `order` state;
  - `showAnnotations` вмикається за замовчуванням, коли знахідки є (D8);
  - шапка «9 files · +A −D» разом із перемикачем.
- Sticky-заголовок має враховувати висоту sticky `PrDetailHeader`: відступ через CSS-змінну або виміряну висоту.

### S12. RTL-тести
- `DiffTab/DiffTab.test.tsx` (з моками хуків за шаблоном `FindingsPanel.test.tsx`):
  1. Групи в правильному порядку з лічильниками; docs і boilerplate згорнуті.
  2. Перемикач Original / Smart.
  3. Індикатори:
     - `● N` рахує файли, а не знахідки;
     - крапка стоїть тільки на потрібній картці;
     - на рядку підпис «blocker»;
     - картка під рядком;
     - Accept викликає `mutate`;
     - знахідка поза патчем потрапляє в окремий блок.
  4. Empty state і fallback при помилці.
- `diff-viewer/DiffViewer/DiffViewer.test.tsx`.
- Використовуємо `fireEvent`, бо `user-event` не встановлено.

### S13. (опційно) e2e-flow
- `e2e/specs/10-smart-diff.flow.json`.

## Конвеєр
planner (цей план) → implementer (S1–S13) → test-writer, якщо лишилися прогалини → plan-verifier ∥ architecture-reviewer + security review → doc-writer (`server/specs/review-flow.md`, `client/specs/pages.md`, `INSIGHTS.md`) → `/pr-self-review`.

## Перевірка

| Пакет | Команди |
|---|---|
| server | `pnpm -C server lint`, `pnpm -C server typecheck`, `pnpm -C server arch:check`, `pnpm -C server exec vitest run --exclude '**/*.it.test.ts'`; `*.it.test.ts` за наявності Docker |
| client | `pnpm -C client lint`, `pnpm -C client typecheck`, `pnpm -C client test` |
| спільні контракти | `./scripts/check-shared-sync.sh` |

Ручна перевірка через `./scripts/dev.sh`, за сценарієм відео:
1. PR → Files changed: п'ять груп із підписами й лічильниками; docs і boilerplate згорнуті; lock-файл у boilerplate.
2. Run review → на заголовку групи `● N`, на картці крапка, під рядком картка зі смужкою та підписом; Accept/Dismiss змінюють стан.
3. Original order → Smart order.
4. У логах сервера за запит smart-diff немає виклику LLM.

## Мапа критеріїв
- P1: S1, S3–S6, S10, S11.
- P2:
  - таблиця тестів класифікатора — S2;
  - валідація контрактом — S6;
  - Accept/Dismiss і блок поза патчем — S10;
  - один перемикач — S11.
- P3:
  - sticky-заголовок і empty state — S11;
  - оновлення без перезавантаження — S7;
  - i18n — S9;
  - картку можна згорнути — наявний хедер `FindingCard`.
