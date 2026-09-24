# План: агент `brainstorm`, який порівнює 2–3 варіанти реалізації перед `planner`

> Після затвердження цей план скопійовано в `docs/plans/brainstorm-agent.md`;
> дослідницький контекст `docs/plans/brainstorm-agent.context.md` влито сюди
> і видалено.

## Контекст

Жоден наявний агент не порівнює варіанти реалізації одне з одним — `planner`
одразу видає єдиний Development Plan. Два незалежні дослідницькі проходи (у
`docs/plans/brainstorm-agent.context.md`) підтвердили спільний мінімальний
каркас у чотирьох незалежних практиках порівняння варіантів (MADR, Rust RFC,
Pugh-матриця, Google design docs): критерії рішення формулюються *до*
переліку варіантів, кожен варіант (включно з базовим «нічого не робити»)
оцінюється проти тих самих критеріїв, і відхилення кожного невибраного
варіанта пояснюється явно. Другий прохід (LLM/агентні техніки) додав
операційні деталі: примусова, а не прохана різноманітність (кожному варіанту
заздалегідь призначена вісь), розділення генерації й оцінки (Evaluator-
Optimizer), короткі Tree-of-Thoughts-думки перед деталізацією, N ≤ 2–3
(diversity collapse), і критика під різними кутами зору замість однорідного
debate.

Прецедент такої ж мета-задачі (новий агент, без коду в `server/client/
reviewer-core/e2e`) — `docs/plans/security-reviewer.md`, звідки взято форму
плану і стиль розділів.

## Ухвалені рішення

| # | Рішення | Обґрунтування |
|---|---|---|
| D1 | Місце у флоу: між `researcher` і `planner`, крок **опційний**. `researcher (коли потрібні докази) ─► brainstorm (опційно: ≥2 правдоподібні підходи) ─► користувач обирає Oₙ ─► planner (план лише для Oₙ)`. Запускається, коли користувач питає «який підхід», задача зачіпає ≥2 пакети чи шари, або researcher показав кілька прецедентів; пропускається для багфіксів, дрібних правок і задач з одним очевидним підходом. | Anthropic: агенти коштують ~4x токенів чат-виклику, мультиагентні системи ~15x. Той самий принцип, що робить `test-writer` і `doc-writer` опційними. |
| D2 | Інструменти: `Read, Grep, Glob, Bash`; `disallowedTools: Write, Edit, NotebookEdit, Agent, Skill, WebFetch, WebSearch`; `permissionMode: plan` — точна копія `planner`. Без Web: зовнішній прецедент формулюється як питання для `researcher` у *Risks & open questions*. Вхід — опційно з `docs/plans/<feature>.context.md`. | `researcher` уже володіє Web і форматом `context.md`; другий шукач дублював би роботу. Зовнішні докази варто зібрати ДО генерації варіантів. `plan` mode доречний — агенту не треба запускати check-команди. |
| D3 | `model: opus`. | Генерація по-справжньому різних варіантів і зважування компромісів — «справжнє судження»; репо вже віддає таку роботу сильній моделі (`planner`, `architecture-reviewer`). |
| D4 | Role-scoped skills: `engineering-insights`, `onion-architecture`, `frontend-architecture`. Решту агент читає на вимогу як `.claude/skills/<name>/SKILL.md` за lane з `routing.md`, як `plan-verifier`. | Варіанти найчастіше відрізняються кільцем, розміщенням файлів чи напрямом залежностей. Повний набір 16 skills лишається за `planner`; `brainstorm` НЕ входить у правило `planner = implementer`. |
| D5 | Без окремого агента-критика. Критика — в одному виклику, у два проходи: A (генерація — осі, короткі ToT-думки, без ранжування) і B (оцінка — кожен варіант проти drivers + найсильніше заперечення під призначеним кутом зору: O1 — вартість супроводу, O2 — коректність і крайні випадки, O3 — blast radius і зворотність). | Evaluator-Optimizer і різні кути зору без 15x мультиагентної ціни; однорідний debate критикують у джерелах; для типового розміру задач тут окремий раунд критики себе не окупить. |
| D6 | N = 2–3 плюс базовий варіант «нічого не робити». Якщо життєздатний лише один варіант — `single viable option`, з поясненням чому інших осей немає. Варіанти «для кількості» заборонені. | MADR/Rust RFC/Google design docs узгоджено вимагають базовий варіант і явне обґрунтування. |
| D7 | Handoff: `brainstorm` read-only, тому головна сесія зберігає звіт у `docs/plans/<feature>.options.md`; `planner` отримує шлях і обраний `O#`, планує ЛИШЕ його, не переоцінює вибір, а відхилені варіанти зводить до одного рядка в *Context*. | Той самий механізм context pack, що вже є для `researcher → planner`. |

## Кроки

### S1 — `.claude/agents/brainstorm.md`
Створено новий read-only субагент: frontmatter рівно з 7 полів
(`name, description, model, permissionMode, tools, disallowedTools,
skills`), `model: opus`, `permissionMode: plan`, `tools: Read, Grep, Glob,
Bash`, `disallowedTools` містить `Agent` і `WebSearch`. Промпт має Hard
limits, Step 0 (*Clarifying questions* + допустимий короткий вихід `single
viable option`), Workflow (Orient → Locate → Decision drivers → Pass A
generate → Pass B evaluate → Recommendation → skills on demand), Output
format «Options Comparison» і Quality rules. Усі три преднавантажені skills
(`engineering-insights`, `onion-architecture`, `frontend-architecture`)
існують як `.claude/skills/<name>/SKILL.md`.

### S2 — `.claude/agents/README.md`
Flow-діаграма отримала рядок `brainstorm (optional: ≥2 plausible
approaches)` між `researcher` і `planner`, з реченням чому крок опційний.
Orchestration practices отримали пункт про збереження звіту в
`docs/plans/<feature>.options.md`. Catalog отримав рядок `brainstorm` у
тому самому форматі колонок. Role-scoped skills отримав 3 рядки
обґрунтування (по одному на преднавантажений skill) і заголовок секції
розширено на `brainstorm`. Додано речення після абзацу `plan-verifier` про
skill-loading, що `brainstorm` так само читає скіли на вимогу. Додано
підрозділ `### brainstorm` у «Sources the rules are based on» з таблицею
нижче. `Maintaining the set` тепер згадує `brainstorm` у переліку
role-scoped агентів. Секція «Preloaded skills (planner = implementer)» не
чіпалась.

### S3 — кореневий `AGENTS.md`
`brainstorm` додано в перелік `.claude/agents/` («read-only comparison of
2–3 implementation options, optional») і в рядок Flow як опційний крок у
дужках: `researcher → [brainstorm → user picks option] → planner → …`.
Додано в перелік агентів з role-scoped `skills:` у «Non-default
conventions». `CLAUDE.md` не редагувався (symlink `120000` цілий).

### S4 — правка прози в `.claude/agents/planner.md`
У Workflow → Orient додано речення: якщо промпт вказує на
`docs/plans/<feature>.options.md` і обраний `O#`, `planner` читає файл,
планує ЛИШЕ цей варіант, не переоцінює вибір, і зводить відхилені варіанти
до одного рядка в *Context*. Блок `skills:` у frontmatter не зачеплено —
`diff` списків `planner.md`/`implementer.md` лишився порожнім.

## Поза межами

- Будь-який код у `server/`, `client/`, `reviewer-core/`, `e2e/`.
- `routing.md` — новий агент не є новим skill.
- `skills:` у `planner.md` та `implementer.md`.
- Окремий агент-критик.
- Історичні згадки флоу в `docs/plans/intent-layer.md:310` і
  `docs/plans/agent-token-optimization.md:14` — архівні плани, не
  переписуються.

## Перевірка

1. Frontmatter `.claude/agents/brainstorm.md` — рівно поля `name,
   description, model, permissionMode, tools, disallowedTools, skills`;
   `disallowedTools` містить `Agent` і `WebSearch`. **Пройдено.**
2. Для кожного з `[engineering-insights, onion-architecture,
   frontend-architecture]` існує `.claude/skills/<n>/SKILL.md`.
   **Пройдено.**
3. `diff <(sed -n '/^skills:/,/^---/p' .claude/agents/planner.md) <(sed -n
   '/^skills:/,/^---/p' .claude/agents/implementer.md)` — порожній вивід.
   **Пройдено.**
4. `git ls-files -s CLAUDE.md` — починається з `120000`. **Пройдено.**
5. `grep -c '^| brainstorm |' .claude/agents/README.md` → `3` (три рядки
   таблиці «Role-scoped skills»; рядок каталогу починається з `| [brainstorm]`
   і тому не збігається з цим патерном). `grep -n brainstorm
   .claude/agents/README.md` знаходить Flow, Catalog, Role-scoped, Sources,
   Maintaining. **Пройдено.**
6. `git grep -n brainstorm AGENTS.md` — 3 рядки (≥2). **Пройдено.**
7. Відносні лінки у змінених файлах резолвляться, включно з посиланням на
   цей файл із `brainstorm.md`. **Пройдено.**
8. `.claude/skills/pr-self-review/routing.md` — diff порожній (не
   чіпали). **Пройдено.**
9. Жодних пакетних CI-команд не запускалось — у diff немає коду в
   `server/`, `client/`, `reviewer-core/`, `e2e/`.

## Джерела

| Rule | Source |
|---|---|
| Decision drivers формулюються до варіантів; «Considered Options» + «Pros and Cons of the Options» | [MADR](https://adr.github.io/madr/), [ADR templates](https://adr.github.io/adr-templates/) |
| Чому відхилено альтернативи + вплив «нічого не робити» | [Rust RFC template](https://github.com/rust-lang/rfcs/blob/master/0000-template.md), [RFC process](https://rust-lang.github.io/rfcs/0002-rfc-process.html) |
| Альтернативи оцінюються проти тих самих цілей; обов'язковий базовий варіант «нічого не робити» | [Design docs at Google](https://www.industrialempathy.com/posts/design-docs-at-google/) (Malte Ubl, не офіційна сторінка google.com) |
| Без ваг і балів: оцінки met / partial / unmet | [Decision-matrix method](https://en.wikipedia.org/wiki/Decision-matrix_method) (задокументована слабкість Pugh) |
| Кожному варіанту заздалегідь призначено вісь; N ≤ 3 (diversity collapse) | [arXiv 2604.18005](https://arxiv.org/html/2604.18005v2), [arXiv 2602.20408](https://arxiv.org/html/2602.20408); [Anthropic multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) (розмиті інструкції дають дублікати) |
| Короткі думки на варіант перед деталізацією; Self-Consistency не використовуємо | [Tree of Thoughts](https://arxiv.org/abs/2305.10601); [Self-Consistency](https://arxiv.org/abs/2203.11171) (зводить усе до однієї відповіді) |
| Генерація відокремлена від оцінки; критика в одному виклику | [Building Effective AI Agents](https://www.anthropic.com/engineering/building-effective-agents) (Evaluator-Optimizer) |
| Критика під різними кутами зору, без однорідного debate | [Du et al., ICML 2024](https://arxiv.org/abs/2305.14325), [arXiv 2502.08788](https://arxiv.org/pdf/2502.08788) |
| Крок опційний і ціною ~4x/15x токенів | [Anthropic multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system); in-repo: `docs/plans/agent-token-optimization.md` §2.5 |
| `model: opus`, бо генерація різних варіантів вимагає справжнього судження | in-repo: `docs/plans/agent-token-optimization.md` §2.2 |
| Read-only, без Web; `permissionMode: plan`; *Clarifying questions* замість `AskUserQuestion` | [Create custom subagents](https://code.claude.com/docs/en/sub-agents); pattern з `planner.md`, `researcher.md` |
| Звіт передається planner через `docs/plans/<feature>.options.md` | in-repo: Orchestration practices у README (патерн context pack) |
| Скіли поза preload читаються на вимогу | in-repo: `plan-verifier.md` «Skill loading rule» |

## Результат реалізації

Реалізовано `implementer`-агентом без відхилень від плану. Змінені файли:
`.claude/agents/brainstorm.md` (новий), `.claude/agents/README.md`,
`AGENTS.md`, `.claude/agents/planner.md`, `docs/plans/brainstorm-agent.md`
(новий, цей файл). `docs/plans/brainstorm-agent.context.md` видалено — його
зміст влито в розділ «Контекст» вище. Усі перевірки з розділу «Перевірка»
пройдено (див. позначки вище); статичні перевірки й лінки виконано без
запуску пакетних CI-команд, оскільки код у `server/`, `client/`,
`reviewer-core/`, `e2e/` не змінювався.
