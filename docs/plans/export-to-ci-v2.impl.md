# impl: Export to CI v2
Plan: docs/plans/export-to-ci-v2.md (multi-agent, waves 1✔ 2✔)   Spec: 2026-10-09-export-to-ci-v2 (approved)
Phase: PR gate (docs and /pr-self-review not run yet)   Verify round: 2/2   Review round: 1/3
Extra instructions: none
Live checks: not configured (OpenRouter key and test GitHub repo) — user chose to skip; manual rows stay with the user.

## Waived / manual-only
- waived by user: setup-PR runner files: third file dist/package.json added to the PR (AC-146, AC-184 text still say two files — spec needs a superseding revision)
- waived by user: none else
- manual-only rows: Q-31 (head_sha meaning, spec flow step 4); AC-110 / Q-19 (GitHub 403 with classic PAT and fine-grained PAT, spec flow step 8); NFR-2 (Refresh ≤ 30 s over 5 installations); NFR-7 (keyboard walk-through)
- not run: *.it.test.ts (ci-repository) — migration pending until worktree A merges (S1.5 stop rule)

## Log
- Phase 0: plan sanity-checked; migration stop rule applies. Live checks skipped by user.
- Phase 1: W1 (contracts, schema, H07 import) partial by stop rule; W2 server, W3 agent-runner, W4 client done in parallel. Typecheck fix: reviewer-core deps installed from its lockfile (environment only).
- Phase 1 fix round (implementer 5 of 5): third runner file; server diff parser trailing-newline parity; tests for AC-168, AC-112/141, NFR-8.
- Phase 2: plan-verifier verified with gaps (no unmet). Re-check after the fix round: met except manual rows and the integration test.
- Phase 3: architecture-reviewer approve, no findings; security-reviewer approve, no findings ≥ MEDIUM (two LOW suggestions: override content lint, https href guard); /code-review medium: 8 findings, triaged below.
- Phase 3 fixes made in the main session (no implementer, limit of 5 reached): edits in agent-runner, server ci module and client download helper, with tests.

## Review ledger
| F# | Source | Sev | file:line | Summary | Status | Round |
|---|---|---|---|---|---|---|
| F1 | code-review | CRITICAL | agent-runner/src/diff.ts:95, server/src/adapters/git/diff-parser.ts:42 | "+++ x" / "--- x" inside a hunk read as file headers and dropped from counts | fixed (both parsers; regression test in agent-runner/src/diff.test.ts) | 1 |
| F2 | code-review | WARNING | agent-runner/src/run.ts:127 | 2 MB cap applied before stripping .devdigest/** and workflow | fixed: cap applied after stripping (user decision); raw fetch bounded by a hard 8 MB ceiling | 1 |
| F3 | code-review | WARNING | server/src/adapters/github/octokit.ts:249,266,332 | withRetry removed from openPullRequest/commitFiles/findOpenPr | dismissed: no callers at HEAD; only the CI write path uses them and NFR-5 forbids retries there | 1 |
| F4 | code-review | WARNING | agent-runner/src/run.ts:108,251 | no GITHUB_TOKEN check; posted reported even when posting failed | fixed: missing token stops before the LLM call (post_failed, exit 1); posted is null when posting fails | 1 |
| F5 | code-review | WARNING | server/src/modules/ci/service.ts:173 | renamed agent leaves its old manifest and skills on the branch | fixed: re-export deletes files of the previous export that the new bundle no longer has; skills used by another agent are kept (user decision) | 1 |
| F6 | code-review | WARNING | agent-runner/src/github.ts:59 | diff body read has no timeout | fixed: request timeout 60 s; body read errors become diff_unavailable | 1 |
| F7 | code-review | SUGGESTION | client/.../ExportCiWizard/download.ts:10 | blob URL revoked synchronously after click | fixed: revoke after 1 s | 1 |
| F8 | code-review | WARNING | server/src/modules/ci/service.ts:148 | two concurrent exports to one repo overwrite each other's commit | fixed: one export per repository at a time, the second gets 409 export_in_progress (user decision; in-process, single server) | 1 |

Open after this round: none blocking.

## Відхилення від затвердженої спеки v2 (`2026-10-09-export-to-ci-v2`)
Спека v2 залишається затвердженою без змін. Нижче — що зроблено інакше, за рішенням користувача (2026-10-09). doc-writer має винести це в документацію поруч зі статусом `implemented`.
- **Runner: три файли**, а не два: `index.js`, `300.index.js`, `package.json` (`{"type":"module"}`). Причина: цільовий репо з `"type":"commonjs"` інакше завантажив би runner як CommonJS. Стосується AC-146, AC-147, AC-149, AC-150, AC-183, AC-184.
- **Ліміт 2 МБ** рахується після видалення `.devdigest/**` і workflow (AC-157). Сира відповідь обмежена стелею 8 МБ (`RAW_DIFF_CEILING_BYTES`). Причина: setup-PR сам несе ~1.8 МБ runner.
- **Ре-експорт видаляє старі файли** агента, якщо новий bundle їх не містить (перейменування агента, прибраний skill). Skill, який ще експортує інший агент у репо, не видаляється. Стосується поведінки install (AC-23–AC-26).
- **Один експорт на репозиторій одночасно**: другий запит отримує `409 export_in_progress`. Блокування в пам'яті процесу. Стосується EC-9.
- **Runner без `GITHUB_TOKEN`** при публікації зупиняється до виклику LLM: `failed`, `post_failed`, exit 1. `posted` — `null`, якщо публікація не вдалась.
- **Таймаут diff-запиту 60 с**; помилка читання тіла → `diff_unavailable`.
- **Парсер diff**: рядки `+++ `/`--- ` всередині hunk — це вміст, а не заголовки файлів. Виправлено в обох парсерах (runner і сервер). Серверний парсер змінює поведінку студійного grounding на один рядок в останньому hunk. Стосується AC-109 і NFR-13.
- **Zip-завантаження** звільняє object URL через 1 с, а не одразу.
- **Retry**: `openPullRequest`, `commitFiles`, `findOpenPr` без автоматичних повторів (NFR-5). Студійні GitHub-виклики зберігають свої повтори.
- **Коди помилок, яких немає в спеці**: `provider_not_supported` (422), `github_token_invalid` (400), `github_error` (502), `sync_failed`. Є в коді, але не описані в спеці.
- **Непокрито спекою**: порожній список manifest (exit 1, без артефакту), невалідний event payload (`event_invalid`), неможливість записати результат (exit 1).
