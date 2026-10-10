# Retro: Export to CI (v1 → v2 → v3, реалізація) — 2026-10-09
Session: 6f9d9ca2 · Workflow: spec-creator (analyze → write → revise → approve) ×3 версії → implementation-planner ×2 → 4 implementer + 1 fix → plan-verifier ×2 → architecture ∥ security ∥ /code-review → doc-writer → /pr-self-review

## Підсумок
Tokens: 4 285k in-new / 135 550k cache-read / 483k out · Agents: 37 стартувало / 36 запусків, 0 невдалих · Main active 2,1 год, wall 4,8 год · Cost: — (no rates) · Найбільші витрати: implementer W2 (274k in-new, 11,1M cache-read) і spec-creator write v3 (367k in-new) · Головний урок: аналіз передавали текстом, і агенти писання його втрачали — спеку переписували двічі з нуля.

## Метрики
- Main session: 759k in-new · 81 426k cache-read · 232k out (cache hit 99%), 205 assistant turns, active 2,1 год / wall 4,8 год.
- Subagents: 3 526k in-new · 54 124k cache-read · 251k out.
- All: 4 285k in-new · 135 550k cache-read · 483k out (thinking всередині output: 79k).
- Launches: 36 у 25 batch; launch failures 0.

Таблиця по агентах (тільки найважчі; повна таблиця — вивід collect.mjs):

| agent | задача | tool uses | errors | tokens in-new / out | cache hit |
|---|---|---|---|---|---|
| implementer:aef505 | W2 server ci module | 65 | 1 | 274k / 1,4k | 98% |
| implementer:a8ee19 | W4 client | 47 | 0 | 220k / 0,9k | 97% |
| general-purpose:addae6 | /code-review medium | 40 | 0 | 200k / 2,5k | 96% |
| implementation-planner:aedd6e | plan pass 1 | 27 | 0 | 176k / 0,5k | 96% |
| implementer:ad6974 | W3 agent-runner | 41 | 3 | 161k / 3,2k | 96% |
| spec-creator:abec0d | write v3 | 19 | 1 | 367k / 59k | 85% |
| spec-creator:aba44e | write v2 | 28 | 0 | 126k / 44k | 95% |
| spec-creator:aa630d | write v1 | 48 | 0 | 148k / 32k | 95% |
| plan-verifier:a07d9d | verify | 32 | 2 | 129k / 8,5k | 91% |

Головна сесія = 81 426k cache-read (60 % усього cache-read), output 232k.

## Порядок запуску
```mermaid
flowchart LR
  A[spec v1 analyze] --> B[spec v1 write] --> C[5× researcher] --> D[spec v1 revise] --> E[approve ×2, fail + retry]
  E --> F[planner pass 1] --> G[planner pass 2] --> H[W1] --> I[W2 ∥ W3 ∥ W4] --> J[fix round]
  J --> K[verify ×2] --> L[review ∥ ×3] --> M[v3 analyze + write] --> N[docs, pr-self-review]
```
Critical path: spec v1 → approve (два проходи) → planner → W1 → W2 (найдовша хвилина, 15 хв).

## Що було складно
- **R1 · Аналіз губився між агентами.** Агент write v2 написав: «мій контекст не містив аналізу, який ви посилаєтесь; відтворив його з трьох джерел». Агент write v3 повторив те саме. Наслідок: 126k і 367k in-new на переписування, а розбіжності в ID між аналізом і спекою. Докази: звіт aba44e і abec0d; промпти передавали аналіз текстом або переказом.
- **R2 · Approve провалювався на самоперевірці.** v1: approve провалено (багатовідповідні AC, перенесені з попередньої версії), потім повтор після revise. v2: approve провалено двічі (~30 рядків з кількома відповідями, перенесених з v1), спеку довелось затверджувати з письмовим виключенням. Агент write не застосовував правило розбиття до рядків, які копіював.
- **R3 · Планувальник pass 2 не отримав звіт pass 1.** Агент написав: «pass-1 report was not included in this prompt; REC1–REC7 restated from code». Тобто REC могли розійтися з тим, що прийняв користувач.
- **R4 · Помилки на перевірці інструментів.** plan-verifier: 2 tool errors; W3: 3 errors; код-ревʼю не був повністю покритий (лінійки скілів).
- **R5 · Головна сесія виконувала імплементаційні правки.** Ліміт 5 імплементерів вичерпався на fix-раунді; ще 7 знахідок код-ревʼю виправляли в головній сесії (вище порогу правила ≤3 файлів).

## Що далося легко
- Вузькі задачі з явними шляхами і кінцевим форматом: researcher RQ1–RQ5 (4–14 tool uses, 0 помилок, 0 resume, відповіді використано як є).
- Механічні перевірки (`check-shared-sync`, lint, typecheck, arch:check) — без помилок і без повторів.
- Прийнятий формат звіту "Implementation Report" з кроками, done-when і Deviations: W1–W4 прийняті без уточнень.

## Дублювання
- **R6 · Однакові шляхи в промптах.** Шлях до v2-спеки в 5 промптах, шлях до plan — у 5. Одна бриф-файл-посилання замість шляхів у кожному промпті.
- **R7 · Один контракт читали 10+ агентів** (`server/src/vendor/shared/contracts/eval-ci.ts`), і `server/INSIGHTS.md`, `agent-runner/insights/INSIGHTS.md`, `client/INSIGHTS.md` — у 7–9 агентах кожний. Один короткий опис контракту з путівником по файлу зменшив би читання.
- **R8 · Повторні рев'ю всього diff.** Архітектура і безпека запускались двічі (повний і дельта), plan-verifier — двічі. Дельта-режим уже використовувався; проблема лише в тому, що перший прохід не покрив пізніші правки.

## Що пропустили — gap-closure
| Прогалина | Хто закрив | Статус |
|---|---|---|
| Q-1 / Q-2 (scope токена, артефакти) | researcher RQ1, RQ2 | closed |
| Q-22 (h): стан вкладки CI при завантаженні списку | користувач: прийнято як не блокуюче | open-deferred |
| Третій файл runner (AC-146/184 казали два) | користувач: додати третій; v2 описує два | closed-by-deviation (doc-writer, розділ «Відхилення») |
| AC-109 парність парсерів | виправлено серверний парсер | closed |
| Міграція та `ci-repository.it.test.ts` | — (чекає мерджу worktree A) | open-blocking для інтеграційних тестів |
| Q-31 (що означає head_sha), AC-110 (403 без scope) | — (ручні кроки після мерджу) | open-deferred |
| CLAUDE.md у agent-runner (поза правилом symlink) | користувач: видалити, AGENTS.md достатньо | closed |

## Порівняння з попередніми запусками
Попередні рядки журналу — 3 прогони (Project Context, Onboarding Tour, PR Brief). Порівняно з ними: in-new 4 285k — це в межах діапазону (2 946k–6 118k); cache-read 135M — менше, ніж у Project Context (241M); вихід 483k — як у Project Context (449k). Launch failures 0 (у Project Context було 6). Найбільша відмінність цього прогону — три версії спеки з переписуванням аналізу (R1, R2); це і є головна причина вищих витрат на спеку, а не розмір реалізації.

## Рекомендації
| R# | Зміна | Де | Очікуваний ефект | Вартість | Впевненість |
|---|---|---|---|---|---|
| R1 | Аналіз пишеться у файл (`docs/specs/<slug>.analysis.md`), наступний агент отримує шлях, а не текст | .claude/agents/spec-creator.md, flow у CLAUDE.md | немає переписування аналізу: ~100–370k in-new на кожну версію | низька | висока (два прямі докази) |
| R2 | Режим `write` застосовує правило одна відповідь до рядків, що копіюються з попередньої версії; перед `approve` — самоперевірка до запуску | .claude/agents/spec-creator.md | менше провалених approve і revise-циклів | низька | висока |
| R3 | Pass 2 планувальника приймає шлях до звіту pass 1 (не переказ) | flow implementation-planner | REC відповідають тому, що прийняв користувач | низька | середня |
| R4 | Спільний бриф з шляхами (спека, план, журнал) — один файл замість повторів у промптах | /run-plan і промпти | менше повторів ~5–10 рядків на промпт | низька | середня |
| R5 | Короткий опис контракту `eval-ci.ts` з путівником по файлу для агентів, що його читають | docs/plans/… | менше читання контракту 10+ агентами | середня | середня |
| R6 | Правила ліміту: коли вичерпано 5 імплементерів, зафіксувати правило для головної сесії (≤3 файли або явний дозвіл) | /run-plan | прозорий процес правок | низька | середня |

## Не перевірено
- Вартість у доларах: `assets/prices.json` без ставок — показано «—».
- «Active time» не враховує паузи більше 5 хв (паузи користувача); «wall» включає їх.
- Перетин файлів — евристика за шляхами; prompt sharing — за реченнями >40 символів, переформульовані правила не враховані.
- Агенти рахуються 37 стартів проти 36 запусків за скриптом; розбіжність не розібрано.
