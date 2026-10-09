# ДЗ L06 — Eval Pipeline для DevDigest (простими словами)

Дедлайн: 23:45, 11 жовтня. Core ≈ 5 год (найбільше ДЗ курсу).

## Навіщо

Змінили промпт, модель чи скіл рев'ю-агента — як зрозуміти, що він покращав, а не зламався? Потрібен автотест, що дає цифри. На лабораторній був готовий eval-модуль для harness'а; тепер будуємо такий самий для самого продукту. Датасет — ваші accept/dismiss-рішення з L01–L05, нічого вигадувати не треба.

## Ідея

1. **Accepted** знахідка → кейс `must_find` («агент МАВ це знайти у file:line»).
2. **Dismissed** знахідка → кейс `must_not_flag` («агент НЕ МАВ це коментувати»).
3. Прогін агента на всіх кейсах → метрики (рахує код, без LLM) → змінили промпт → прогін → порівняння.

## Метрики

| Метрика | Що означає |
|---|---|
| recall | частка очікуваного, що агент знайшов |
| precision | частка знахідок, що не шум (тут працюють dismissed-кейси) |
| citation_accuracy | частка знахідок, що пережили grounding gate |

Збіг = той самий файл **і** рядки перетинаються.

## Що зробити

1. Таблиці `eval_cases` і `eval_runs` (схему та Zod-контракти дають готовими).
2. Кнопка **«Turn into eval case»** на `FindingCard`: активна лише для accepted/dismissed. Клік **не зберігає** кейс, а відкриває модалку `EvalCaseModal` (diff, метадані PR, назва, expected output підставлені). У модалці: правка → **Run case** → фактичний результат і pass/fail → повтор → **Save** або **Cancel**.
3. Роут `POST /agents/:id/eval-runs` — прогін на всіх кейсах набору, входи зафіксовані (порівнянність версій).
4. Скоринг повністю кодом: recall, precision, citation_accuracy.
5. UI: вкладка **Evals** в AgentEditor — секція Eval cases + історія прогонів.
6. Окрема сторінка **Eval Dashboard** у лівому сайдбарі — останні прогони, порівняння двох прогонів.
7. Експеримент: старий vs новий system prompt → метрики рухаються; навмисно зіпсований промпт → precision падає.

Процес: SDD (L05) — `specs/eval-pipeline.md` → план → код. У репо: `spec-creator` → `researcher` → `implementation-planner` → `/run-plan`.

## Критерії приймання

- ≥ 8 кейсів у наборі
- кейс зі знахідки, обидва типи (`must_find` / `must_not_flag`) працюють
- зміна system prompt видимо рухає recall/precision
- скоринг без жодного LLM-виклику
- `pnpm verify:l06` зелений

## Чек-лист здачі

- [ ] `specs/eval-pipeline.md` у специфікаціях
- [ ] зелений `pnpm verify:l06`
- [ ] скріншот порівняння двох прогонів з різними промптами
- [ ] відео (обов'язково): кейс зі знахідки → прогін → метрики → другий прогін зі зміненим промптом → порівняння, з поясненнями

## Зауваження викладача

1. Кнопка спершу відкриває модалку, а не пише в БД: поганий кейс гірший за відсутність (завжди червоний/зелений — нічого не міряє).
2. Evals для скілів у Skill Editor — опціонально.
3. Лабораторна частина (код + CLI + CI) має бути закомічена: папка `evals/` (`git merge upstream/l06-evals`), мінімум по одному eval для скіла, агента та workflow-кейс (`pnpm eval:scaffold`), eval-команди й правило «зміна → прогін» у `CLAUDE.md`, три workflow: `eval-skills.yml`, `eval-agents.yml`, `eval-workflow.yml`.

## Stretch (без дедлайну)

- Eval власного скіла з L02 (`evals/skills/<скіл>/<скіл>.eval.ts`, 3–4 кейси; зламати → червоний → відкат → зелений)
- Case Editor — ручне створення/редагування кейсів (diff, тип, файл, діапазон рядків)
- Тренд-графіки recall/precision/citation_accuracy (точка = прогін, тултіп = версія промпта і вартість)
- PreToolUse hook у `.claude/settings.json` — тест-гейт перед комітом
- Mutation testing на одному модулі

## Дизайн

- Макети (standalone): `~/Downloads/DevDigest Design (standalone).html`
- Вихідні компоненти (React/JSX-прототип): `~/Downloads/Dev Digest (1) 2/`

Мапа «екран → файл прототипу»:

| Що | Файл |
|---|---|
| Вкладка Evals в AgentEditor (метрики, Eval cases, Run all evals, New eval case) | `screen_agents.jsx` (`EvalMetricStrip`, `EvalsTab`) |
| Рядок кейса | `components2.jsx` (`EvalCaseRow`) |
| Кнопка «Turn into eval case» (іконка `FlaskConical`) і seed зі знахідки | `findings.jsx` (`ActionRow`, `onEval`) |
| Модалка кейса (`EvalCaseEditor`) | `screen_cizruns.jsx` / `screen_skills.jsx` |
| Eval Dashboard (метрики-плитки, тренд, таблиця прогонів, порівняння) | `screen_cizruns.jsx`, `app_shell.jsx` (`ScreenEval`) |
| Пункт сайдбара «Eval Dashboard» (іконка `Gauge`) | `chrome.jsx` |
| Скріншоти | `screenshots/focus-eval.png`, `pr-detail-*.png`, `overview.png` |

Це лише прототип: у продукті реалізуємо на Next.js за конвенціями `client/AGENTS.md`
(`_components/<Name>/<Name>.tsx`), не копіюючи `window.*`-глобали.
