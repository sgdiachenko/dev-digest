# Джерела для deprecation-policy

Дата перевірки всіх джерел: **2026-09-18**. Це розширений реєстр для
[README скіла](../../.claude/skills/deprecation-policy/README.md); висновки та
приклади — у [research.md](research.md). Наведено власний
стислий виклад, а не копії документів. Ідентифікатори S1–S9 залишати стабільними
при перенесенні до README, щоб зберегти зв'язок правил із джерелами.

## Специфікації та документація інструментів

| ID | Джерело та конкретні розділи | Підтримуване правило | Межі застосування |
|---|---|---|---|
| S1 | [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html): §1, §4, §7–8; FAQ «How should I handle deprecating functionality?» | Для стабільного SemVer-контракту deprecation належить до minor-релізу, несумісна зміна — до major. FAQ рекомендує випустити щонайменше один minor із попередженням перед видаленням у major. | Специфікація для систем, які використовують SemVer. Не задає строку в днях. Для `0.x` стабільність не гарантована; номер приватного npm-пакета не визначає життєвий цикл HTTP API. |
| S2 | [RFC 9745 — The Deprecation HTTP Response Header Field](https://www.rfc-editor.org/rfc/rfc9745.html): §2.1 Syntax, §2.2 Scope, §3–3.1 Link/Documentation, §4 Sunset, §5 Resource Behavior | `Deprecation` містить structured date, `Link` із `rel="deprecation"` веде до пояснення; оголошення не змінює поведінки ресурсу. За наявності обох заголовків Sunset не може передувати даті Deprecation. | IETF Standards Track, березень 2025. Визначає механізм HTTP-сигналізації, а не обов'язок додавати заголовок до кожного deprecated символу або універсальний строк підтримки. Область дії повідомлення має бути зрозумілою. |
| S3 | [RFC 8594 — The Sunset HTTP Header Field](https://www.rfc-editor.org/rfc/rfc8594.html): §1.4 Deprecation, §3 Header Field, §5 Scope, §6 Link Relation | `Sunset` повідомляє очікуваний момент припинення роботи URI; значення — HTTP-date. Він відрізняється від повідомлення, що API лише більше не рекомендується. | IETF Informational, травень 2019, не Standards Track. Timestamp — підказка, а не гарантія доступності чи конкретного статусу після вимкнення. Не замінює підтримку старого API або migration guide. |
| S4 | [OpenAPI Specification 3.1.1](https://spec.openapis.org/oas/v3.1.1.html): §4.8.10.1 Operation Object, §4.8.12.2 Parameter Object, §4.8.21.1 Header Object | `deprecated: true` позначає операцію, параметр або заголовок для consumers специфікації. | Перевірено саме версію 3.1.1, без твердження, що вона найновіша. Метадані не реалізують сумісність; не слід механічно переносити поле на будь-який OpenAPI object. Не вимагає впроваджувати OpenAPI там, де його немає. |
| S5 | [TSDoc — @deprecated](https://tsdoc.org/pages/tags/deprecated/): Usage, Example | Блок `@deprecated` пояснює рекомендовану альтернативу; позначення контейнера поширюється на його members. | Документація тегу для програмних API. Тег не зберігає runtime-поведінку, не встановлює removal date і не гарантує, що опубліковані declaration-файли зберегли коментар. |

## Політики інших проєктів: приклади, не автоматичні вимоги dev-digest

| ID | Джерело та конкретні розділи | Підтримуване правило | Межі застосування |
|---|---|---|---|
| S6 | [Google AIP-180 — Backwards compatibility](https://google.aip.dev/180): Guidance, Removing components, Changing semantics | Оцінювати source-, wire- та semantic-сумісність; незмінна сигнатура не доводить незмінної поведінки. | Рекомендації Google, переважно для protobuf/JSON і незалежних consumers. Для локально контрольованих consumers потрібно встановлювати фактичні гарантії; не переносити всі правила форматів буквально. |
| S7 | [Google AIP-181 — Stability levels](https://google.aip.dev/181): Alpha, Beta, Stable → Major versions, Emergency changes | Рівень стабільності впливає на очікування; для стабільного API потрібен визначений процес припинення підтримки. Передбачені надзвичайні зміни. | Політика Google, не універсальний SLA. Згадані 90 днів у Beta стосуються орієнтиру для переходу до stable, а не загального deprecation window. |
| S8 | [Google AIP-192 — Documentation](https://google.aip.dev/192#deprecations): Deprecations | Позначення має супроводжуватися альтернативою; якщо її немає — причиною. | Конкретні `deprecated` option і префікс коментаря належать до описуваної Google API-документації. Для TypeScript застосовується відповідний TSDoc-механізм, а не буквальна вимога до protobuf options. |
| S9 | [Kubernetes Deprecation Policy](https://kubernetes.io/docs/reference/deprecation-policy/): Deprecating parts of the API → Rules #3, #4a, #4b; Deprecating a feature or behavior → Rules #7–8 | Приклад політики з вимірюваним строком, стабільністю заміни та періодом співіснування версій; враховується можливість rollback і читання збережених даних. | Правила Kubernetes залежать від виду API та stability track. Вікна для REST, CLI, metrics і поведінки різні. Їхні числа не є типовими строками dev-digest. |

## Локальні джерела та власні пропозиції

- [AGENTS.md](../../AGENTS.md): контракти копіюються в server/client; wire-поля — `snake_case`; пакети не публікуються як спільний workspace.
- [server/package.json](../../server/package.json) та [reviewer-core/package.json](../../reviewer-core/package.json): на дату перевірки `version: "0.0.0"`, `private: true`.
- [breaking-change](../../.claude/skills/breaking-change/SKILL.md): перевірка старого consumer проти нового контракту; відсутність локального caller не доводить відсутності зовнішніх.
- [PR self-review routing](../../.claude/skills/pr-self-review/routing.md): правила майбутнього підключення скіла та уникнення дублювання перевірок.

Чекліст із п'яти пунктів, формат висновку, вимоги до доказів, шаблон lifecycle
та сценарії оцінювання в research — **запропонована локальна політика** на
основі завдання. Вони не є затвердженим SLA або новим автоматичним PR gate.
README зберігає стислий реєстр із межами застосування, а не лише список URL;
при оновленні джерела треба перевірити відповідні правила research і скіла.
