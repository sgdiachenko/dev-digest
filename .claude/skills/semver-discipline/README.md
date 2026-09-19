# semver-discipline

Скіл перевіряє, чи відповідає версія пакета або API масштабу зміни публічного
контракту. Інструкції для агента містяться у [SKILL.md](SKILL.md).

## Застосування

Використовується при змінах public API, deprecation, release metadata та
підготовці релізу. Він зіставляє докази впливу з політикою і запланованою
версією або прийнятим release intent. Висновки `breaking-change` та
`response-schema` використовуються як докази, якщо доступні.

Результати: `Compliant`, `Non-compliant`, `Unverified`, `Not applicable`.
За відсутності політики скіл дає умовну рекомендацію, а не стверджує
порушення. Коректний major-бамп не означає сумісності старих клієнтів.
Скіл не змінює версій, API чи release tooling автоматично.

## Джерела

Дата перевірки всіх джерел: **2026-09-18**. Ідентифікатори S1–S7 збережені
зі [дослідження](../../../docs/semver-discipline-research.md).
Нижче — реєстр для підтримки й перевірки правил, а не копії текстів джерел.

| ID | Назва та URL | Розділи | Висновок для скіла | Межі застосування |
|---|---|---|---|---|
| S1 | [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html) | Specification 1–11; FAQ про deprecation, залежності та помилкові релізи | Основне нормативне джерело для класифікації й порівняння версій. | Застосовувати після встановлення public API та SemVer-політики; не переносити правила стабільних версій механічно на `0.x`. |
| S2 | [Google AIP-180: Backwards compatibility](https://google.aip.dev/180) | Guidance; Adding components; Removing or renaming components; Changing the type of fields; Semantic changes | Перевіряти source-, wire- та semantic compatibility; перейменування може бути видаленням плюс додаванням. | Google API, зокрема protobuf/JSON. Правила про generated code не є універсальними правилами для наших TypeScript DTO. |
| S3 | [Google AIP-185: API Versioning](https://google.aip.dev/185) | Guidance; Channel-based versioning; Interface-based versioning | Розрізняти версію інтерфейсу та реліз реалізації; враховувати перехід між підтримуваними версіями. | Політика Google, а не вимога до всіх REST API. Джерело описує також версії за датою; `/v1` не є обов'язковим наслідком SemVer. |
| S4 | [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/) | Summary; Specification; FAQ | `fix`, `feat`, `!` та `BREAKING CHANGE` передають намір релізу. Breaking change може належати будь-якому типу коміту. | Конвенція метаданих, не аналіз коду. Реальний bump залежить від налаштованого release workflow. |
| S5 | [Changesets: A Detailed Explanation](https://github.com/changesets/changesets/blob/main/docs/detailed-explanation.md) | Попередження; The solution; двоетапне versioning | Історичне джерело з початкового плану: запис наміру можна відокремити від bump. | Сторінка явно позначена застарілою та перенаправляє до S6. Залишена для простежуваності. |
| S6 | [Changesets: Why Changesets](https://changesets.dev/guide/why) | The Solution; The Result | PR може містити changeset, а окремий крок об'єднує зміни й обчислює максимальний bump для пакета. | Приклад підтримуваного процесу, не вимога встановити Changesets у dev-digest. |
| S7 | [OpenAPI Specification 3.1.1](https://spec.openapis.org/oas/v3.1.1.html#info-object) | 4.8.1 OpenAPI Object; 4.8.2 Info Object | `openapi` означає версію специфікації; `info.version` — версію OpenAPI-документа, відмінну від версії реалізації API. | OAS не встановлює нашу release-політику. Зв'язок `info.version` із версією продукту потребує окремого підтвердження. |

## Як трактувати правила

- S1 — нормативна основа для продуктів, які дотримуються SemVer. Наявність
  трьох чисел у manifest ще не доводить політики публічного HTTP API.
- S2–S3 — рекомендації та правила Google API у власному контексті; не
  запроваджують обов'язковий `/v1` або строки підтримки для dev-digest.
- S4 описує метадані комітів; реальний вплив зміни перевіряється окремо.
- S5 залишений для простежуваності початкового research; актуальний опис
  Changesets — S6. Ці джерела не вимагають встановлення інструмента.
- S7 допомагає уникати плутанини між специфікацією, документом і API.

Процедура review, формат висновків та умовна рекомендація без політики —
проєктні рішення. Дослідження містить їх обґрунтування, локальний контекст,
парні приклади й сценарії приймання. Воно залишається окремим довідковим
матеріалом; під час оновлення скіла звіряти реєстр і перевіряти актуальність
змінюваних AIP/Changesets-джерел.

## Інтеграція та перевірка

Скіл включений до [каталогу](../README.md) та lane `semver-discipline` у
[маршрутизації self-review](../pr-self-review/routing.md) після перевірок
сумісності. Він використовує їхні правила severity без нового гейта.

Під час змін перевіряти frontmatter, відносні посилання, routing coverage та
сценарії з дослідження: breaking у patch, належний major, сумісна функція,
deprecation, відкладений bump, `0.x` без політики, prerelease й версії OpenAPI.
Це критерії приймання, а не твердження про автоматизовані поведінкові тести.
