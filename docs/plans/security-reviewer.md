# План: агент `security-reviewer`

> Після затвердження цей план копіюється в `docs/plans/security-reviewer.md`.

## Контекст

`.claude/agents/README.md` вже документував потік рев'ю як `researcher →
planner → implementer → test-writer → plan-verifier → architecture-reviewer +
security review (not yet an agent) → doc-writer → /pr-self-review` — рядок 19
явно позначав security review як відому, незакриту прогалину. `planner.md`,
`implementer.md` і сам `README.md` (рядки 68/102/129) незалежно один від
одного відмовлялись від рев'ю архітектури/безпеки і зазначали, що цей крок
відсутній. Користувач надав мінімальний чернетковий варіант
(`name/description/tools/model/maxTurns` + два речення промпту) як стартову
точку для повноцінного агента, що закриває цю прогалину за зразком сусіднього
read-only рев'юера `architecture-reviewer.md`.

Дослідження (репо + зовнішні джерела) підтвердило: форму frontmatter варто
копіювати з `architecture-reviewer.md` (`disallowedTools`, Bash allow-list як
prompt rule, без `permissionMode`); у репо вже є повноцінний skill `security`
(OWASP Top 10:2025 + confidence-gated HIGH/MEDIUM/LOW рев'ю), який зовнішні
джерела підтверджують як обґрунтовану практику, — тож завдання нового агента
застосувати цей skill до diff'а, а не переосмислювати його; `maxTurns` —
реальне, задокументоване поле Claude Code (≥2.1.246), просто досі не
використовувалось у цьому репо.

## Ухвалені рішення

| # | Рішення |
|---|---|
| D1 | `model: sonnet` — узгоджено з власним рішенням репо щодо оптимізації токенів (`docs/plans/agent-token-optimization.md`): перший security-прохід іде на sonnet, бо CRITICAL/WARNING-знахідки все одно проходять через окремий phase-2 фільтр хибних спрацювань у головній сесії перед `/pr-self-review`. |
| D2 | Без мережевої команди аудиту залежностей (лишається герметичним, як `architecture-reviewer`); A06 (вразливі/застарілі залежності) звітується як gap («CVE-статус не перевірено — немає мережі»), а не механічною перевіркою. |
| D3 | Преднавантажені skills: `security` + `fastify-best-practices` + `engineering-insights`. Приклади в `security` написані під Express/Mongo/JWT; `fastify-best-practices` дає правильні для цього стеку правила routes/CORS/схем. |
| D4 | `maxTurns: 48` — поле лишається, але піднято з чернеткових 12: найближча виміряна порівнянна фаза зайняла 46 tool calls (`agent-token-optimization.md`), тож 12 обрізало б звичайний прогін. 48 лишає запас понад цей вимір, зберігаючи страхувальний ліміт. |
| D5 | Нова *агент*-конфігурація, не новий *skill* — тому `skills:` списки `planner.md`/`implementer.md` не чіпаються, `routing.md` не змінюється (lane 14 `security` вже існує і керує лише вибором skills у `/pr-self-review`, а не цим окремим, незалежно запущеним агентом). |

## Кроки

### S0. Зберегти план у репо
- Скопіювати цей файл у `docs/plans/security-reviewer.md` перед початком реалізації.

### S1. Створити `.claude/agents/security-reviewer.md`
- Дзеркалить структуру `architecture-reviewer.md`: Hard limits → Step 0 (ворота обсягу) → нумерований Workflow → фіксований Output format → Quality rules → таблиця Sources.
- Frontmatter: `name`, `description` (з trigger terms і позицією в потоці), `model: sonnet`, `tools: Read, Grep, Glob, Bash`, `disallowedTools: Write, Edit, NotebookEdit, Agent, Skill, WebFetch, WebSearch`, `maxTurns: 48`, `skills: security, fastify-best-practices, engineering-insights`.
- Hard limits: read-only; Bash allow-list як у `architecture-reviewer.md` плюс один дозволений pipe — секрет-скан регекс з `severity.md` (єдиний виняток із «ніколи не пайпити»); заборонено `--fix`, інсталяції, тестові сюїти, `docker`, мережеві команди (зокрема `audit`), будь-яку `gate.sh` підкоманду крім `base`, запис під `.claude/pr-self-review/`, читання значень з `~/.devdigest/secrets.json` чи `.env*`; diff-scoped; ніколи не друкувати значення секрету.
- Step 0: та сама ворота обсягу, що й у `architecture-reviewer.md` (явний base ref або «всі відкриті зміни»; опційно *Review handoff → Security* із плану + Implementation Report; інакше — лише блок *Clarifying questions*).
- Workflow (8 кроків): орієнтація по `AGENTS.md`/`INSIGHTS.md`; список змінених файлів з позначкою lane 14; механічні перевірки першими (секрет-скан, перевірка lock-файлу для A06); **таблиця трансляції стеку** (Drizzle `sql.raw` замість Mongo-операторів; `child_process.spawn` з масивом аргументів проти `shell: true`; Fastify-хуки + Zod-схеми замість Express-middleware — не флагувати «маршрут без auth» саме по собі, бо no-login — свідомий MVP-стан цього проєкту, але флагувати відсутність фільтра `workspace_id`; секрети лише в `platform/config.ts` + `adapters/secrets/local.ts`; `dangerouslySetInnerHTML` у клієнті; необмежена декомпресія `fflate unzipSync`, задокументована в `server/INSIGHTS.md`; правило класифікації «lethal trifecta», перенесене з `docs/agent-prompts/security-reviewer.md`); ручний прохід по змінених рядках; знахідки з `confidence`-полем і мапінгом на severity за `severity.md`; вердикт як чиста функція знахідок; список *Needs false-positive filter (phase 2)* для головної сесії.
- Output format і Quality rules — той самий каркас, що в `architecture-reviewer.md`, плюс секція `## Checked, nothing found`.
- Таблиця Sources із зовнішніми (Anthropic sub-agents docs, QASecClaw, Crash Override) і внутрішніми (severity.md, report.md, docs/agent-prompts/security-reviewer.md, security/SKILL.md, onion-architecture) джерелами.

### S2. Оновити `.claude/agents/README.md`
- Діаграма потоку (рядок 19): замінити на `architecture-reviewer ─► findings ∥ security-reviewer ─► findings`, плюс речення про паралельність і про те, що phase-2 фільтр запускається лише коли `security-reviewer` повертає знахідки.
- Рядки 68-69: «architecture-reviewer and security review are all static» → «architecture-reviewer and security-reviewer are all static».
- Рядок каталогу після `architecture-reviewer` — новий рядок `security-reviewer` у тому ж форматі.
- Таблиця «Role-scoped skills» — новий агент і по одному рядку обґрунтування на кожен преднавантажений skill.
- «Permission notes» — додати `security-reviewer` до переліку агентів без `permissionMode`.
- «Sources the rules are based on» — підрозділ `### security-reviewer` з таблицею джерел.
- «Maintaining the set» — додати `security-reviewer` до списку role-scoped агентів.
- Не чіпати: секцію «Preloaded skills (planner = implementer)» і її 16 skills — це новий *агент*, не новий *skill*.

### S3. Оновити кореневий `AGENTS.md` (не `CLAUDE.md` — це закомічений symlink)
- Пункт `.claude/agents/` у «Where things live»: додати `security-reviewer` до переліку агентів і оновити опис потоку.
- «Non-default conventions»: додати `security-reviewer` до переліку агентів з role-scoped `skills:`.

### S4. Правка формулювання в `.claude/agents/planner.md`
- Рядок ≈112: «architecture-reviewer and security review are all static» → назвати `security-reviewer`. Лише проза — `skills:` frontmatter-блок не чіпається (лишається побайтово ідентичним `implementer.md`).

## Поза межами

- `routing.md` — lane 14 (`security`) уже існує й керує вибором skills для `/pr-self-review`; новий агент не змінює це маршрутизування.
- `skills:` frontmatter `planner.md`/`implementer.md` — без змін.
- Власний, БД-орієнтований агент застосунку «Security Reviewer» (`docs/agent-prompts/security-reviewer.md`, `server/src/db/seed.ts`) — інша, вже наявна річ; його промпт лише слугує натхненням, файл не редагується.
- Жодних змін коду в `server/`, `client/`, `reviewer-core/`, `e2e/` — лише Markdown у `.claude/agents/` і кореневому `AGENTS.md`.

## Перевірка

1. Frontmatter `.claude/agents/security-reviewer.md` — валідний YAML, точно поля `name, description, model, tools, disallowedTools, maxTurns, skills`.
2. `git grep -n "not yet an agent"` по репо не повертає нічого.
3. `diff` `skills:`-блоків `planner.md`/`implementer.md` — і далі порожній (списки лишились ідентичними).
4. `git ls-files -s CLAUDE.md` і далі починається з `120000` (symlink цілий).
5. Кожен skill у `skills:` нового агента має рядок обґрунтування в таблиці «Role-scoped skills» в README.
6. Усі відносні Markdown-посилання в чотирьох змінених файлах резолвляться.
7. Живий smoke-тест: викликати `security-reviewer` на diff'і цієї ж гілки, очікується `approve` з нульовими знахідками.

## Результат реалізації

Реалізовано `implementer`-агентом без відхилень від плану. Змінені файли:
`.claude/agents/security-reviewer.md` (новий), `.claude/agents/README.md`,
`AGENTS.md`, `.claude/agents/planner.md`. Усі 6 механічних перевірок і smoke-
тест (крок 7) пройшли: `security-reviewer`, запущений на власному diff'і
гілки, повернув `approve` з порожнім списком знахідок, коректно визначивши
lane (жоден файл не потрапляє під lane 14) і пройшовши секрет-скан без
збігів.
