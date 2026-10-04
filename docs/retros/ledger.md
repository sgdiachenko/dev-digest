# Retro ledger

One row per `/workflow-retro` run, newest last — read it top to bottom to see the trend across runs; never rewrite old rows. Per-run reports: the `<YYYY-MM-DD>-<slug>.md` files beside it.

| Date | Workflow | Session | Tokens (in-new / cache-read / out) | Cost | Agents started/launched | Active / wall | Top lesson | Report |
|---|---|---|---|---|---|---|---|---|
| 2026-09-30 | spec → planner → /impl ×2 (Project Context каталог + прикріплення) | 39ee7e48 | 6 118k / 241 333k / 449k | — (no rates) | 39 транскриптів / 41 запуск (6 невдалих) | main 171 хв + субагенти 112 хв / wall 28.7 год | головна сесія = 82 % cache-read; помилки верифікації — з прогалин плану | [retro](2026-09-30-project-context.md) |
| 2026-10-02 | /run-plan Onboarding Tour (факти A + наратив B): 17 W# у 5 хвилях → verify ×2 → review ×2 → ручна перевірка → docs → рестайл | 5db7d14b | 2 946k / 62 272k / 136k | — (no rates) | 29 стартувало / 27 запусків (0 невдалих) | main 60 хв + агенти ≈72 хв / wall 12,4 год | макет не дійшов до виконавців як зображення → F13 після PASS; main = 56 % cache-read, 83 % output | [retro](2026-10-02-onboarding-tour.md) |
| 2026-10-03 | /run-plan PR Brief (Why + Risk brief на Overview): 6 implementer у 3 хвилях → verifier ×6 → fix ×2 → architecture ∥ security ∥ /code-review → ручна перевірка → фікс тестів | 33902f1d | 3 124k / 64 594k / 204k | — (no rates) | 17 стартувало / 16 запусків (0 невдалих) | main 96 хв + агенти ≈50 хв / wall 16,8 год | макет і критерії тестів не дійшли до виконавців; повторні повні верифікації ≈ 22 % in-new | [retro](2026-10-03-pr-brief.md) |
