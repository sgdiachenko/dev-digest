# План: `planner` → `implementation-planner`

Дата: 2026-09-29. Гілка: `H05`.

## Мета

Перетворити агента `planner` на `implementation-planner`, який:

- складає **лише implementation-плани** і нічого не робить зі специфікаціями;
- перевіряє вимоги, ставить уточнювальні питання (`Q#`) і дає рекомендації,
  як зробити краще (`REC#`);
- **завжди** питає режим виконання: multi-agent чи single-agent.

## Рішення користувача

| Питання | Рішення |
|---|---|
| Хто питає про режим | Завжди сам `implementation-planner`, перед написанням плану (Step 2) |
| Назва артефакту | «Development Plan» → «Implementation Plan» |
| Межі заборони специфікацій | Жодних кроків із шляхом `specs/`, включно з `e2e/specs/*.flow.json` (flow-файли — `test-writer`, специфікації — `doc-writer`) |
| Multi-agent | Кілька `implementer` паралельно; план максимізує паралелізм, `owns:` пакетів робіт `W#` не перетинаються, DAG, контракти першими |
| Single-agent | Лінійна послідовність `S1..Sn` під один контекст; неперетин owned paths не критичний, оптимізація під ясність і порядок |
| Дефолт | multi-agent для нетривіального, single-agent для дрібного / щільно пов'язаного; вибір записується в поле *Execution mode* плану |

## Механіка

Субагент не може питати користувача сам, тому два проходи:

1. **Прохід 1** — Requirements review, `Q#`, `REC#`, питання про режим
   (з рекомендованим дефолтом). Плану немає.
2. Основна сесія питає користувача (`AskUserQuestion`).
3. **Прохід 2** — лише коли в промпті є `Mode:`, `Answers:` на всі `Q#` і
   рішення по кожному `REC#`. Результат — Implementation Plan з новими
   секціями *Requirements decisions*, *Execution mode* і (для multi-agent)
   *Work packages* (`W#`, `owns:`, `depends-on`, `wave`).

## Змінені файли

- `.claude/agents/planner.md` → `.claude/agents/implementation-planner.md`
  (перейменування + новий промпт; `skills:` без змін).
- `.claude/agents/implementer.md` — нова назва; у multi-agent виконує лише свій
  `W#` і редагує лише шляхи з його `owns:`.
- `.claude/agents/plan-verifier.md` — «Implementation Plan», по звіту на `W#`.
- `.claude/agents/brainstorm.md` — нова назва.
- `.claude/agents/README.md` — flow, опис двох проходів і режимів, каталог,
  інваріант skills, таблиця джерел.
- `AGENTS.md` — опис агента, flow, посилання в правилі про `skills:`.

Старі плани в `docs/plans/*.md` навмисно не переписувалися.

## Перевірки

- `diff` списків `skills:` `implementation-planner.md` ↔ `implementer.md` — порожній.
- `git grep -w planner` / `planner.md` / «Development Plan» поза `docs/plans` —
  лише `implementation-planner`.
- `CLAUDE.md` лишається symlink (`120000`).
- Новий тип агента з'явиться після перезапуску сесії Claude Code.
