# Research: Frontend / React / Next.js Architecture

Дослідження, з якого зібрано скіл `frontend-architecture` (структура коду,
межі модулів, розміщення логіки). **Не про продуктивність** — про архітектуру.

Статус: скіл написаний. Цей файл — джерельна база й обґрунтування рішень.
Дата збору джерел: **2026-09-17**. Усі посилання перевірені (HTTP 200), окрім
позначених ⚠️.

## Склад скіла

| Файл | Що містить | Звідки взято |
|---|---|---|
| `SKILL.md` | The One Rule (напрям залежностей), delete test, Rule of Two, базова структура, таблиця «де що лежить», 4 шари логіки, антипатерни, чеклист | розділи 1, 3, 6, 7 |
| `placement.md` | дерева рішень: компоненти, бізнес-логіка, константи, config/env, типи і Zod, utils/lib/services, стан, тести, стилі | розділи 2, 5–10 |
| `boundaries.md` | напрям залежностей, coupling/cohesion, public API, barrel-компроміс, готові конфіги ESLint + dependency-cruiser | розділи 3, 4, 13 |
| `nextjs.md` | `app/` = роутинг, `_folder`/`(group)`, межа server/client, Data Access Layer, чеклист | розділ 11 |

Сусідні скіли, щоб не дублювати:
- `.claude/skills/react-best-practices/` — правила рівня компонента/хука
  (derive-don't-store, чистота, hooks misuse). Архітектури папок майже немає.
- `.claude/skills/next-best-practices/` — file conventions, RSC boundaries,
  data patterns. Це наш «сусід знизу» для Next-специфіки.

Новий скіл має відповідати на **де що лежить і хто на кого може посилатись**,
а не «як написати компонент».

---

## Питання, на які скіл має відповідати

1. Де лежать компоненти і як їх різати (shared UI vs feature UI vs route UI).
2. Як групувати код: за типом файлу чи за фічею/доменом.
3. Де лежать константи, конфіг, env.
4. Що виносити в `utils` / `helpers` / `lib` / `services` — і чому ці папки
   часто антипатерн.
5. Де живе бізнес-логіка (компонент / хук / чиста функція / DAL).
6. Де живуть типи та Zod-схеми.
7. Де живе стан (server state vs client state) і межі контексту.
8. Правила імпортів між шарами + чим їх примусово enforce-ити.
9. Публічний API модуля, barrel files — коли так, коли ні.
10. Next.js App Router: що лежить в `app/`, а що поза ним; де межа
    server/client; де Data Access Layer.
11. Іменування файлів і папок.

Нижче — по кожному питанню: що каже консенсус, де є розбіжності, і джерела.

---

## 1. Групування коду: за типом vs за фічею

**Консенсус:** плоскі технічні папки (`components/`, `hooks/`, `utils/`)
працюють до ~50 файлів; далі переходять на групування за фічею/доменом.
Ключовий тест — **«delete test»**: видалення папки фічі має ламати тільки ті
сторінки, що її композували, і нічого більше.

Робін Віруч описує це як еволюцію з 7 стадій (один файл → файли → папка на
компонент → технічні папки → feature-папки → domain-папки → пакети/монорепо),
і головна теза — структура **росте природно, її не нав'язують наперед**.

Три «іменовані» методології:
- **Bulletproof React** — `src/{app,components,config,features,hooks,lib,stores,types,utils}`,
  плюс `src/features/<feature>/{api,assets,components,hooks,stores,types,utils}`.
  Правило: «Only include the ones that are necessary for the feature».
- **Feature-Sliced Design (FSD)** — 3 рівні: layers → slices → segments.
  Шари: `app`, `pages`, `widgets`, `features`, `entities`, `shared`
  (`processes` — deprecated). Сегменти: `ui`, `model`, `api`, `lib`, `config`.
- **Screaming Architecture / vertical slice** — структура папок має «кричати»
  предметну область, а не фреймворк.

**Розбіжність:** FSD дуже формальна (7 шарів + заборона імпортів усередині
шару) — для середнього застосунку часто overkill. Bulletproof — легша
2-рівнева модель. Для курсового проєкту я б брав Bulletproof як базу і з FSD
запозичив тільки поняття *public API слайсу* та *сегментів*.

Джерела:
- [bulletproof-react — project-structure.md](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) — **головне джерело**, дерево папок + ESLint-правила
- [bulletproof-react — project-standards.md](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-standards.md)
- [Feature-Sliced Design — Overview](https://feature-sliced.design/docs/get-started/overview)
- [FSD — Layers reference](https://feature-sliced.design/docs/reference/layers)
- [Robin Wieruch — React Folder Structure Best Practices](https://www.robinwieruch.de/react-folder-structure/) — еволюція структури по стадіях
- [Sandro Roth — How to structure your React projects](https://sandroroth.com/blog/project-structure/)
- [React Handbook — Project Standards](https://reacthandbook.dev/project-standards)
- [Frontend at Scale #45 — May I Interest You In a Modular Monolith?](https://frontendatscale.com/issues/45/)
- ⚠️ [profy.dev — Popular React Folder Structures and Screaming Architecture](https://profy.dev/article/react-folder-structure) — домен не резолвився на момент перевірки; брати з web.archive.org

## 2. Колокація: «код, що змінюється разом, лежить разом»

Базовий принцип під усім іншим. Формулювання Kent C. Dodds: *«Place code as
close to where it's relevant as possible»*; версія Дена Абрамова: *«Things that
change together should be located as close as reasonable»*.

Аргументи: maintainability (файли легше тримати в синхроні), applicability
(видно, що ще треба оновити), ease of use (менше стрибків по дереву).

**Коли колокацію свідомо ламають:** інтеграційна документація (README на групу
модулів), інтеграційні тести через кілька компонентів, e2e-тести — вони живуть
у корені, бо не мають залежати від внутрішньої структури `src/`.

Практичне правило з обговорень: **«Colocate everything until it hurts. Then
abstract»** — піднімати в `shared` тільки коли з'явився другий споживач.

Джерела:
- [Kent C. Dodds — Colocation](https://kentcdodds.com/blog/colocation)
- [Kent C. Dodds — State Colocation will make your React app faster](https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster)
- [Matias Kinnunen — Locality of Behavior / Co-location](https://mtsknn.fi/blog/locality-of-behavior-and-co-location/)

## 3. Правила імпортів між шарами (це найцінніше в скілі)

**Unidirectional codebase** (Bulletproof): `shared → features → app`.
Shared може використовувати будь-хто; фіча імпортує тільки shared; app імпортує
фічі й shared. Назад — ніколи.

**Заборона cross-feature імпортів:** фічі не імпортують одна одну — вони
композуються на рівні `app`/сторінки. Якщо двом фічам треба спільне — воно
піднімається в shared.

**FSD-правило жорсткіше:** модуль не може використовувати модулі того ж шару
**і шарів вище** — тільки нижче.

**Enforcement** (без цього правила деградують за пару спринтів):
- `import/no-restricted-paths` з ESLint-зонами — точні конфіги є в
  bulletproof-react (є і для cross-feature, і для однонаправленості);
- `eslint-plugin-boundaries` — класифікує файли по «елементах» і описує
  дозволені зв'язки декларативно;
- `dependency-cruiser` — граф залежностей + цикли, добре для CI;
  ESLint виграє в редакторському UX, dependency-cruiser — у візуалізації.
  Рекомендація Xebia: використовувати обидва.

Джерела:
- [bulletproof-react — project-structure.md (розділ Unidirectional Codebase Architecture)](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
- [eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries)
- [dependency-cruiser](https://github.com/sverweij/dependency-cruiser)
- [Xebia — Taking Frontend Architecture Serious With Dependency-cruiser](https://xebia.com/blog/taking-frontend-architecture-serious-with-dependency-cruiser/)
- [Steve Kinney — Architectural Linting (Enterprise UI)](https://stevekinney.com/courses/enterprise-ui/architectural-linting-exercise)
- [Frontend at Scale #36 — The Beyoncé Rule](https://frontendatscale.com/issues/36/) — «якщо правило важливе, на нього має бути тест»

## 4. Публічний API модуля та barrel files (`index.ts`)

Дві протилежні поради — і скіл має чесно показати конфлікт.

**За barrel:** модуль експонує стабільну поверхню через `index.ts`, все
всередині можна вільно рефакторити; ESLint-правило entry-point забороняє
глибокі імпорти. Це фундамент FSD і модульного моноліту.

**Проти barrel:** гірший tree-shaking (особливо `export *`), роздуті dev-чанки,
повільніші `tsc`/vitest/eslint, і головне — циклічні залежності
(`Cannot access 'X' before initialization`), коли внутрішні файли імпортують
через власний barrel. Vite прямо радить «Avoid Barrel Files»;
bulletproof-react теж радить не робити barrel-експорт з фіч.

**Синтез для скіла:** barrel — тільки як *межа модуля назовні* (один рівень,
іменовані реекспорти, ніколи `export *`), а всередині модуля — прямі імпорти.
Або взагалі без barrel + ESLint-правило на дозволені шляхи імпорту.

Джерела:
- [FSD — Public API](https://feature-sliced.design/docs/reference/public-api)
- [Vite — Performance guide («Avoid barrel files»)](https://vite.dev/guide/performance)
- [bulletproof-react — розділ про barrel files](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
- [ReactUse — Barrel Files: Why index.ts Re-Exports Hurt Tree Shaking, Next.js Dev Memory, and tsc (2026)](https://reactuse.com/blog/barrel-files-tree-shaking/)
- [Steven Lemon — Are TypeScript Barrel Files an Anti-pattern?](https://steven-lemon182.medium.com/are-typescript-barrel-files-an-anti-pattern-72a713004250)

## 5. Де лежать компоненти і як їх різати

**Три рівні розміщення:**
1. `shared/ui` (або `components/ui`) — дизайн-система, нічого не знає про домен;
2. `features/<feature>/components` — доменні компоненти;
3. поруч із роутом (`app/blog/_components/…`) — одноразова верстка сторінки.

**Правило залежностей:** shared UI **ніколи** не імпортує feature-логіку;
навпаки — можна.

**Як різати:** композиція замість пропсів наскрізь — `children`, slots,
compound components; «lift content up» / «push state down». Кількісні
евристики (з наявного скіла `react-best-practices`, не з вебу): ≤200 рядків,
≤5–7 пропсів, один компонент на файл.

**Container/Presentational у 2025–26:** сам патерн у явному вигляді хуками
витіснений (Dan Abramov сам додав апдейт до своєї статті 2015 року), але ідея
«окремо *як виглядає*, окремо *як працює*» лишається. Цікавий поворот: RSC
фактично повернули цей розподіл на рівні рантайму — server component = контейнер,
client component = презентація.

**Atomic Design:** у 2025–26 його рідко застосовують до всього застосунку;
гібрид — atomic тільки всередині `shared/ui`, feature-based зовні.

Джерела:
- [Dan Abramov — Presentational and Container Components](https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0) (читати разом із його ж апдейтом угорі)
- [patterns.dev — Container/Presentational Pattern](https://www.patterns.dev/react/presentational-container-pattern/)
- [patterns.dev — Compound Pattern](https://www.patterns.dev/react/compound-pattern/)
- [Smashing Magazine — Compound Components In React](https://www.smashingmagazine.com/2021/08/compound-components-react/)
- [freeCodeCamp — Compound Components Pattern: Prop Soup to Flexible UIs](https://www.freecodecamp.org/news/compound-components-pattern-in-react/)
- [react.dev — Thinking in React](https://react.dev/learn/thinking-in-react) — офіційний критерій розбиття (single responsibility)
- [Sam Dawson — Goodbye presentational and container components?](https://www.samdawson.dev/article/container-components/)
- [DEV — RSC and the echo of Presentational and Container Components](https://dev.to/fibonacid/rsc-and-the-echo-of-presentational-and-container-components-33i)

## 6. Де живе бізнес-логіка

Ієрархія, яку дає більшість джерел:

1. **Чисті функції** — обчислення, валідація, трансформації, форматування.
   Без React. Найлегше тестувати. Лежать у `features/<f>/lib` (FSD: сегмент
   `model`/`lib`).
2. **Кастомні хуки** — *application logic*: зв'язування стану, ефектів,
   зовнішніх систем. Офіційна рекомендація React: якщо часто пишеш `useEffect`
   вручну — це сигнал витягти кастомний хук, щоб «код компонента виражав намір,
   а не реалізацію».
3. **Компонент** — тільки композиція + рендер. Ніяких обчислень домену в тілі.
4. **Server / DAL** — усе, що торкається БД, секретів, авторизації.

Корисне розрізнення з джерел: **business logic** (умови, розрахунки,
валідація — чисті функції) vs **application logic** (оркестрація, стан,
I/O — хуки). Плюс хук як точка dependency injection, щоб бізнес-логіку
тестувати юніт-тестами, а не інтеграційними.

Джерела:
- [react.dev — Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks)
- [react.dev — You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)
- [Felix Gerschau — Separation of concerns with React hooks](https://felixgerschau.com/react-hooks-separation-of-concerns/)
- [Antony Leme — Business vs application logic: how to separate and test your React code](https://antonyleme.medium.com/business-vs-application-logic-how-to-separate-and-test-your-reactjs-code-4291d0c983b1)
- ⚠️ [profy.dev — Path To A Clean(er) React Architecture: Business Logic & DI](https://profy.dev/article/react-architecture-business-logic-and-dependency-injection) — домен не резолвився; web.archive.org

## 7. `utils` / `helpers` / `lib` / `services` — і чому це часто антипатерн

Сильний і добре аргументований консенсус: `utils.ts` / `helpers.ts` —
**junk drawer**. Щойно папка створена, вся команда отримує дозвіл зливати туди
все підряд; вона росте необмежено, ніхто не знає, що там уже є, і функції
дублюються.

**Правила, які варто винести в скіл:**
- Називай модуль за тим, **що він надає**, а не за тим, що в ньому лежить
  (`formatCurrency.ts`, `date.ts`, `csv.ts` — не `utils.ts`).
- Функція використовується однією фічею → лежить у цій фічі. У глобальний
  shared піднімається тільки з появою **другого** споживача.
- Розділення, яке реально має сенс:
  `lib/` — обгортки/конфігурація сторонніх бібліотек (axios, date-fns, i18n);
  `services|api/` — інтеграції з зовнішнім світом (HTTP, auth);
  `utils/` — тільки чисті, доменно-нейтральні функції, згруповані по темі.

Джерела:
- [Yang Lin Zhao — The utility module antipattern](https://www.yanglinzhao.com/posts/utils-antipattern/)
- [DEV — Utils files are not so useful and helper classes are not so helpful!](https://dev.to/dvddpl/utils-files-are-not-so-useful-and-helper-classes-are-not-so-helpful-1kfn)
- [Matti Lehtinen — Dunghill Anti-Pattern: why utility classes and modules smell](https://mattilehtinen.com/articles/dunghill-anti-pattern-why-utility-classes-and-modules-smell/)
- [Ralin Chimev — OOP Anti-Patterns: Utility or Helper Classes](http://ralin.io/blog/oop-anti-patterns-utility-or-helper-classes.html)
- [Ali Bey — Libs vs Utils vs Services Folders](https://medium.com/@a.m.housen/libs-vs-utils-vs-services-folders-simple-explanation-for-developers-0ae961539a0f)

## 8. Константи та конфіг

Розшарування, яке випливає з джерел (окремі речі, які часто плутають):

- **Локальна константа** — використовується в одному файлі → оголошується
  там же, поза тілом компонента. Не виносити.
- **Константи фічі** → `features/<f>/constants.ts` (FSD: сегмент `config`).
- **Глобальні константи** → `src/config/` (Bulletproof) — тематичні файли,
  а не один розбухлий `constants/index.ts`.
- **Env** → окремий валідований модуль (`config/env.ts`), і **тільки він**
  читає `process.env`. У Next.js це критично: до `process.env` має ходити
  лише DAL/сервер.
- Іменування: `UPPER_SNAKE_CASE`; для набору станів — не рядкові літерали, а
  enum / `z.enum` (у нашому проєкті вже так — див. `CLAUDE.md`).
- Контраргумент, який теж варто згадати: не кожне число «магічне» —
  `constants.ts` із `const ONE = 1` гірший за літерал.

Джерела:
- [Semaphore — How To Organize Constants in a Dedicated Layer in JavaScript](https://semaphore.io/blog/constants-layer-javascript)
- [Medium/Codex — When magic numbers are not magic («Stop creating constants»)](https://medium.com/codex/when-magic-numbers-are-not-magic-fcdf034295a5) — контраргумент
- [Next.js — Data Security (тільки DAL читає `process.env`)](https://nextjs.org/docs/app/guides/data-security)
- [bulletproof-react — `src/config` у структурі](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)

## 9. Типи і Zod-схеми

Готове дерево рішень (гарно лягає в скіл майже дослівно):
- тип використовується в одному файлі → оголосити там, **не експортувати**;
- тип спільний у межах фічі → експортувати з основного файлу, або завести
  `*-contract.ts`, якщо споживачів ≥3;
- тип спільний між фічами → це має бути рідко; класти в **найвужчу** спільну
  директорію.

Для Zod: схема — джерело правди, тип виводиться (`z.infer`). Якщо схему
споживають і клієнт, і сервер — вона живе у спільному контрактному модулі.
(У нас це вже реалізовано як `@devdigest/shared`, скопійований у
`server/src/vendor/shared` і `client/src/vendor/shared`.)

Джерела:
- [Serghei — Where Your Types Live Matters More Than You Think](https://blog.serghei.pl/posts/where-your-types-live-matters/)
- [Zod — README / docs](https://github.com/colinhacks/zod)
- [Jussi Nevavuori — End-to-end typesafe APIs with shared Zod schemas](https://dev.to/jussinevavuori/end-to-end-typesafe-apis-with-typescript-and-shared-zod-schemas-4jmo)
- [Leapcell — Sharing Types and Validations with Zod Across a Monorepo](https://leapcell.io/blog/sharing-types-and-validations-with-zod-across-a-monorepo)

## 10. Де живе стан

Головна архітектурна межа: **хто володіє даними**.
- Дані належать серверу → server-state бібліотека (TanStack Query / RSC + cache).
  Кеш, інвалідація, дедуплікація, background refetch — не самописний `useEffect`.
- Дані належать клієнту (відкритий сайдбар, тема, крок візарда, драфт форми)
  → локальний стан, а якщо справді спільний — Zustand/Context.

Офіційна позиція TanStack Query: вона **не** замінює client-state менеджер;
вони вирішують різні задачі й спокійно живуть разом. Практичний наслідок:
коли server state винесений, «справді глобального» клієнтського стану
лишається дуже мало.

Context — це **dependency injection** (auth, theme, i18n), а не глобальний
стор; контексти розділяти за відповідальністю.

Джерела:
- [TanStack Query — Does this replace client state managers?](https://tanstack.com/query/v5/docs/framework/react/guides/does-this-replace-client-state)
- [Kent C. Dodds — State Colocation](https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster)
- [Frontend at Scale #27 — We Need to Talk About Coupling](https://frontendatscale.com/issues/27/) — чому глобальний стор = implicit coupling

## 11. Next.js App Router: специфіка

**`app/` — це роутинг, а не місце для коду.** Офіційна документація
підкреслює: Next.js неопінійований, але дає 3 стратегії — тримати код поза
`app/`, тримати його в top-level папках усередині `app/`, або різати по
фічі/роуту. Головне — вибрати одну і бути послідовним.

Інструменти організації:
- **Колокація безпечна за замовчуванням** — роут стає публічним лише коли
  з'являється `page.js`/`route.js`; решта файлів у сегменті не роутяться.
- **Private folders `_folder`** — явно виключають папку з роутингу
  (`app/blog/_components/`, `app/blog/_lib/`).
- **Route groups `(group)`** — групування без впливу на URL; кілька root
  layouts; вибіркове застосування `loading.tsx`/layout до підмножини роутів.
- **`src/`** — відділяє код застосунку від конфігів у корені.

**Межа server/client:** за замовчуванням — server component; `'use client'`
ставити якомога ближче до листків. `'use client'` маркує **весь модуль і все,
що він імпортує**, тому один товстий клієнтський файл затягує в бандл усе
дерево. Server components не можна імпортувати в client component, але можна
передавати їх як `children`/props. Через межу проходить лише серіалізовне.

**Data Access Layer (офіційна рекомендація для нових проєктів):** окремий
`server-only` модуль, який (1) виконує перевірки авторизації, (2) повертає
мінімальні DTO, (3) єдиний має доступ до `process.env` і БД.
`"use server"` екшени лишаються тонкими й делегують у DAL. Перевірка на
сторінці **не** поширюється на Server Action — авторизацію треба
перевіряти всередині екшена окремо.

**FSD + App Router:** `app/` — тільки роутинг і композиція; продуктова
архітектура — у `src/` (FSD-шари). Файли роутів тонкі: імпортують сторінку з
`src/pages/`.

Джерела:
- [Next.js — Project structure and organization](https://nextjs.org/docs/app/getting-started/project-structure) — **офіційне, головне**
- [Next.js — Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
- [Next.js — Data Security (DAL, DTO, `server-only`, taint)](https://nextjs.org/docs/app/guides/data-security)
- [Next.js blog — How to Think About Security in Next.js](https://nextjs.org/blog/security-nextjs-server-components-actions)
- [react.dev — Server Components reference](https://react.dev/reference/rsc/server-components)
- [FSD — The Ultimate Next.js App Router Architecture](https://feature-sliced.design/blog/nextjs-app-router-guide)
- [freeCodeCamp — How to Build Reusable Architecture for Large Next.js Applications](https://www.freecodecamp.org/news/reusable-architecture-for-large-nextjs-applications/)
- [OWASP — Next.js Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Nextjs_Security_Cheat_Sheet.html)
- [npm — `server-only`](https://www.npmjs.com/package/server-only)

## 12. Іменування файлів і папок

Два життєздатні варіанти, головне — один на проєкт:
- **kebab-case скрізь** (папки + файли) — так робить bulletproof-react, ESLint
  це enforce-ить; уникає проблем case-insensitive ФС (macOS/Windows) і
  конфліктів у git.
- **kebab-case папки + PascalCase файли компонентів** — популярний компроміс:
  шлях читабельний, а ім'я файлу збігається з іменем компонента.

⚠️ У нашому проєкті вже зафіксовано в `CLAUDE.md`:
`_components/<Name>/<Name>.tsx` (PascalCase) + lowercase route-сегменти.
Скіл має це поважати, а не переписувати.

Джерела:
- [bulletproof-react — project-standards.md (kebab-case enforcement)](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-standards.md)
- [Sufle — Naming Conventions in React](https://www.sufle.io/blog/naming-conventions-in-react)
- [Ísland.is Handbook — ADR 0009: Unified Naming Strategy for Files and Directories](https://docs.devland.is/technical-overview/adr/0009-naming-files-and-directories)

## 13. Теоретична база (для розділу «чому» в скілі)

Ці джерела дають словник, яким можна обґрунтовувати правила, а не просто
перелічувати їх:
- **Coupling / cohesion**: «Constantine's Equivalence» — вартість софту ≈
  вартість змін ≈ ступінь зв'язності. Типи coupling: data → control →
  implicit (глобалки). Стратегія: розчіплювати насамперед там, де часто
  змінюється.
- **Modularity = organization + encapsulation**: організації (папок) мало —
  потрібні guardrails (information hiding + ESLint/dependency-cruiser).
- **Screaming architecture / vertical slice**: модулі задають макро-межі,
  вертикальні зрізи організують код усередині них.

Джерела:
- [Frontend at Scale #27 — We Need to Talk About Coupling](https://frontendatscale.com/issues/27/)
- [Frontend at Scale #45 — May I Interest You In a Modular Monolith?](https://frontendatscale.com/issues/45/)
- [Frontend at Scale #1 — It's All About Complexity](https://frontendatscale.com/issues/1/)
- [Fundamentals of Frontend Architecture (Maxi Ferreira, курс)](https://frontendatscale.com/courses/frontend-architecture/foundations/introduction/)
- [Frontend Masters — Frontend Architecture: Monoliths to Microfrontends](https://frontendmasters.com/courses/frontend-architecture/)
- [Milan Jovanović — Screaming Architecture](https://milanjovanovic.tech/blog/screaming-architecture) (бекенд, але поняття те саме)

---

## Джерела за пріоритетом

### Tier 1 — офіційна документація (найвища довіра)
| Джерело | Покриває |
|---|---|
| [Next.js — Project structure](https://nextjs.org/docs/app/getting-started/project-structure) | колокація, `_folder`, `(group)`, `src/`, 3 стратегії організації |
| [Next.js — Data Security](https://nextjs.org/docs/app/guides/data-security) | DAL, DTO, `server-only`, taint, аудит |
| [Next.js — Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components) | межа server/client, environment poisoning |
| [Next.js blog — Security in Server Components & Actions](https://nextjs.org/blog/security-nextjs-server-components-actions) | модель загроз RSC |
| [react.dev — Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks) | коли витягати хук |
| [react.dev — You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect) | що НЕ є логікою для ефекту |
| [react.dev — Thinking in React](https://react.dev/learn/thinking-in-react) | критерій розбиття на компоненти |
| [react.dev — Server Components](https://react.dev/reference/rsc/server-components) | модель RSC |
| [TanStack Query — Does this replace client state?](https://tanstack.com/query/v5/docs/framework/react/guides/does-this-replace-client-state) | server vs client state |
| [Vite — Performance guide](https://vite.dev/guide/performance) | «Avoid barrel files» |

### Tier 2 — канонічні методології
| Джерело | Покриває |
|---|---|
| [bulletproof-react / docs](https://github.com/alan2207/bulletproof-react/tree/master/docs) | дерево папок, unidirectional architecture, ESLint-зони, стандарти |
| [Feature-Sliced Design](https://feature-sliced.design/) | layers / slices / segments, import rule, public API |
| [FSD — Next.js App Router guide](https://feature-sliced.design/blog/nextjs-app-router-guide) | FSD × App Router |
| [patterns.dev — React patterns](https://www.patterns.dev/react/) | compound, container/presentational, RSC |
| [React Handbook](https://reacthandbook.dev/project-standards) | стандарти проєкту |

### Tier 3 — авторитетні автори / блоги
| Джерело | Покриває |
|---|---|
| [Kent C. Dodds — Colocation](https://kentcdodds.com/blog/colocation) | принцип колокації |
| [Kent C. Dodds — State Colocation](https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster) | розміщення стану |
| [Robin Wieruch — React Folder Structure](https://www.robinwieruch.de/react-folder-structure/) | 7 стадій еволюції структури |
| [Frontend at Scale (Maxi Ferreira)](https://frontendatscale.com/issues/) | coupling, cohesion, modular monolith, fitness functions |
| [Dan Abramov — Presentational and Container Components](https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0) | історія патерна + авторський апдейт |
| [Felix Gerschau — Separation of concerns with React hooks](https://felixgerschau.com/react-hooks-separation-of-concerns/) | шари логіки |
| [Sandro Roth — How to structure your React projects](https://sandroroth.com/blog/project-structure/) | порівняння структур |
| [Serghei — Where Your Types Live Matters](https://blog.serghei.pl/posts/where-your-types-live-matters/) | дерево рішень для типів |
| [Yang Lin Zhao — The utility module antipattern](https://www.yanglinzhao.com/posts/utils-antipattern/) | чому `utils` — антипатерн |
| [Matti Lehtinen — Dunghill Anti-Pattern](https://mattilehtinen.com/articles/dunghill-anti-pattern-why-utility-classes-and-modules-smell/) | те саме, розгорнуто |
| [Semaphore — Constants layer in JavaScript](https://semaphore.io/blog/constants-layer-javascript) | шар констант |
| [ReactUse — Barrel files & tree shaking (2026)](https://reactuse.com/blog/barrel-files-tree-shaking/) | вимірювані наслідки barrel |
| [Smashing Magazine — Compound Components](https://www.smashingmagazine.com/2021/08/compound-components-react/) | композиція замість prop drilling |

### Tier 4 — інструменти enforcement
| Джерело | Покриває |
|---|---|
| [eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries) | декларативні межі шарів |
| [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) | граф залежностей, цикли, CI |
| [Xebia — Frontend architecture with dependency-cruiser](https://xebia.com/blog/taking-frontend-architecture-serious-with-dependency-cruiser/) | практика + порівняння з ESLint |
| [Steve Kinney — Architectural Linting](https://stevekinney.com/courses/enterprise-ui/architectural-linting-exercise) | вправа/рецепт |
| [OWASP — Next.js Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Nextjs_Security_Cheat_Sheet.html) | межі як питання безпеки |

### ⚠️ Недоступні на момент перевірки (2026-09-17)
Домен `profy.dev` не резолвився; матеріал цінний, брати через
[web.archive.org](https://web.archive.org/):
- `https://profy.dev/article/react-folder-structure` — порівняння структур + screaming architecture
- `https://profy.dev/article/react-architecture-business-logic-and-dependency-injection` — бізнес-логіка та DI

---

## Рішення, ухвалені при написанні скіла

1. **Скоуп — загальний**, як у сусідніх `react-best-practices` /
   `next-best-practices`. Скіл не прив'язаний до `client/`. Замість цього в
   `SKILL.md` і `nextjs.md` є явний пункт: `AGENTS.md`/`CLAUDE.md` проєкту
   перекриває будь-який дефолт зі скіла.
2. **База — Bulletproof React**, з FSD запозичено тільки public API слайсу та
   іменування сегментів (`ui`/`model`/`api`/`lib`). Повний FSD (7 шарів,
   `entities`/`widgets`) свідомо відхилений як overkill — це прямо написано
   в `SKILL.md`, щоб агент не «покращував» структуру до FSD без потреби.
3. **Межа з `react-best-practices`** — зафіксована в першому абзаці `SKILL.md`:
   цей скіл відповідає лише на «де лежить файл» і «чи дозволений цей імпорт».
   Усе про внутрішній устрій компонента лишається в сусідньому скілі.
4. **Enforcement увімкнено** — `boundaries.md` містить готові до вставки
   конфіги `import/no-restricted-paths` (і для cross-feature, і для напряму
   залежностей), бо без них правила деградують за пару спринтів.

Свідомі компроміси, які варто перевірити на практиці:

- **Barrel files** — обрано «barrel лише на межі модуля, іменовані реекспорти,
  ніколи `export *`, ніколи зсередини модуля». Джерела тут прямо суперечать
  одне одному; якщо тулчейн почне гальмувати — в `boundaries.md` описана
  альтернатива без barrel взагалі.
- **Атомарні евристики** (≤200 рядків, ≤5–7 пропсів) навмисно НЕ дублюються —
  вони вже є в `react-best-practices`.
