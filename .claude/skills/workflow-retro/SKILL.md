---
name: workflow-retro
description: "Post-mortem of a multi-agent workflow session: collects hard numbers (tokens per agent and in total, agents launched vs actually started, launch order and parallel batches, active vs wall time, tool uses, errors, resumes, files several agents re-read) with a script, then judges what was hard, what was easy, what was duplicated and what was missed, and proposes concrete edits to the agents' prompts and to the flow. Writes docs/retros/<date>-<slug>.md; applies nothing without the user's yes. Use after /impl, after the spec-creator → researcher → planner chain, or any run that spawned subagents. Trigger terms: retro, retrospective, workflow retro, post-mortem, how did the agents do, token usage of the session, agent insights."
argument-hint: "[session id | latest] [--focus tokens|order|quality] [extra notes]"
disable-model-invocation: true
---

# /workflow-retro — how did the multi-agent run go?

You (the **main session**) run this after a workflow, not during one. It is
read-only on the code: the only file it writes is the retro report, and it
changes no agent, skill or flow file until the user says yes.

Arguments: `$ARGUMENTS`

## Principles

1. **Numbers come from the script, judgement from you.** Never estimate
   tokens or durations by eye — `assets/collect.mjs` reads the transcripts.
   Every claim in the report cites a number, a file:line or an agent's own
   words; a claim you can't source is marked `hypothesis`.
2. **List every agent.** One row per agent in every table — no "the
   researchers were similar" summaries.
3. **No blame, no praise padding.** The unit of analysis is the *prompt,
   the hand-off and the order*, not the agent's "effort".
4. **Proposals, not edits.** Changes to `.claude/agents/*.md`, skills or
   `/impl` go into the report as diffs-in-words; apply only after an
   `AskUserQuestion`.
5. **Small context.** Don't read whole transcripts. Read the script output,
   then at most each agent's final hand-back
   (`node assets/collect.mjs --handback <agentId>`), then only the
   files a finding needs.

## Phase 1 — Collect

```sh
node .claude/skills/workflow-retro/assets/collect.mjs [--session <id>]      # markdown
node .claude/skills/workflow-retro/assets/collect.mjs --json [--session <id>]
```

No session argument → the latest transcript of this repo (i.e. this chat).
It reports: totals (main / subagents / all; *in-new* = fresh input + cache
writes, *cache-read* = re-read context, output, thinking), launch table in
order with batch numbers and launch failures, per-agent active vs wall time,
tool uses, tool errors, resumes, token split and cache-hit %, files read by
more than one agent, main-session errors, and the "gaps" sections the agents
wrote themselves. If the script fails, report that and stop — don't
reconstruct the numbers from memory.

Known limits (say them in the report, don't hide them): *active time* drops
gaps over 5 min, so a user pause doesn't count; the overlap list is a
path-string heuristic, including files named only in a Bash command; no prices
are applied unless `assets/prices.json` has all four rates (input,
cache_write, cache_read, output — USD per 1M tokens) for a model; the file
ships unset on purpose, so a cost of `—` means "no rate", not "free". Never
guess a rate: if cost matters and the file is empty, ask the user for the
rate card and offer to fill `prices.json`.

## Phase 2 — Judge

Answer each question below with evidence. Skip a question only by writing
"nothing found" — silence is not a finding.

**A. Order and parallelism**
- Draw the run as `batch → agents` (a Mermaid `flowchart`, see
  [mermaid-diagram](../mermaid-diagram/SKILL.md)); mark the critical path.
- Was anything sequential that had no dependency? Anything parallel that
  later needed the other's output?
- Time the *user* spent waiting (wall − active on the main session) vs time
  agents actually worked: is the wait the user's pauses or a slow step?

**B. What was hard** — signals: launch failures and retries, tool errors,
`tool uses` far above the median of the same agent type, an agent resumed
more than once, an agent whose hand-back says "не знайдено / not found /
blocked", a question the agent asked the user that a prior file already
answered.

**C. What was easy** — signals: few tool uses, no errors, hand-back used
as-is with no follow-up, findings the user accepted without changes. Say what
made it easy (a narrow question, a named file, a fixed output shape) — that
is the pattern to copy.

**D. Duplication**
- Files read by ≥2 agents (script list) — was that necessary, or should one
  agent's output have been passed by path?
- Shared lines across prompts of one batch (`shared prompt lines`) — boilerplate
  that belongs in the agent file, not in every launch.
- The same finding restated across reports, and again by you to the user.
- Context re-read: a resumed agent with a very high cache-read total
  (compare with a fresh agent of the same type) — the cost of resuming a
  big context, which `/impl` principle 3 warns about.

**E. What was missed**
- Build a **gap-closure table** from the script's "gaps the agents reported
  themselves" — one row per gap: `agent · gap · closed by (agent / user
  answer / nobody) · status (closed | open-blocking | open-deferred)`. An
  `open` row with no owner in the next phase is a finding by itself.
- Each agent's self-reported gaps: closed later (by whom), or still open?
- Things a *later* phase found that an *earlier* one should have (planner
  finds a spec hole, reviewer finds an unmet AC, the user's own correction).
- Requirements in the user's request with no owner in any agent's output.
- Prompts that omitted a fact the agent then had to rediscover (a path, a
  decision, a constraint from `CLAUDE.md`/`INSIGHTS.md`).
- The designs/screenshots: did every agent that needed them get them, or
  only a text description?

**F. Cost hot spots** — the top three agents by *in-new* tokens and by
output tokens (and by USD when rates are set); is the size justified by the
result? Main-session share of the total; `thinking` share of output; model
choice per agent (a cheaper model that would have done the same job, or a
job that clearly needed a bigger one).

**G. Against the previous runs** — read `docs/retros/README.md` (if it
exists) and compare with the last 3 rows of the same workflow type: tokens,
agents started/launched, launch failures, active time. Say plainly whether
this run was cheaper, the same or costlier, and which single change explains
most of the difference. No earlier row → write "first retro, no baseline" and
let this row become one.

## Phase 3 — Report

Write `docs/retros/<YYYY-MM-DD>-<slug>.md` (slug = the workflow's feature;
Ukrainian, matching `docs/plans/`):

```markdown
# Retro: <workflow / feature> — <date>
Session: <id8> · Workflow: <e.g. spec-creator → 6× researcher → spec-creator>

## Підсумок (5 рядків максимум)
Tokens: <all> (in-new / cache-read / out) · Agents: <started>/<launched> ·
Wall/active: <..> · Biggest cost: <agent> · Biggest lesson: <one line>

## Метрики  — the script's tables, verbatim
## Порядок запуску  — Mermaid + one line per batch
## Що було складно / що далося легко / Дублювання / Що пропустили
  (per finding: `R#` id · evidence · impact · agent) + the gap-closure table
## Порівняння з попередніми запусками  — from the history index, or "first retro"
## Рекомендації  — table: R# · change · where (file) · expected effect · cost · confidence
## Не перевірено  — limits of this retro
```

**History index.** Append one row to `docs/retros/README.md` (create it with
the header if missing; never rewrite old rows):

```markdown
| Date | Workflow | Session | Tokens (in-new / cache-read / out) | Cost | Agents started/launched | Active / wall | Top lesson | Report |
|---|---|---|---|---|---|---|---|---|
```

Then `AskUserQuestion` (multiSelect) over the `R#` list: which to apply now,
which to save as a note. Apply only the chosen ones, in the smallest edit
that works; agent/skill/flow files change only through that yes. Anything
non-obvious and durable (a gotcha about an agent or the platform) goes to the
matching `INSIGHTS.md` via [engineering-insights](../engineering-insights/SKILL.md),
again only if chosen.

## Recommendation checklist (what to look for; add your own)

| Pattern seen | Typical fix |
|---|---|
| Launch failures / retries of the same batch | Launch fewer at once or stagger; note the failure mode in the flow doc |
| Same boilerplate in many prompts of a batch | Move it into the agent file; prompt = only the question + paths |
| Several agents read the same 5 files | One scout step writes a short shared brief; others get its path |
| Resumed agent, huge cache-read | Fresh agent + report path, or split the job so no resume is needed |
| Agent asked the user something already in a file | Add that file to its "read first" list |
| Agent hand-back has no "not found / gaps" section | Make the section mandatory in its output format |
| Analyze pass repeated because research raised new items | Ask for the RQs to be answerable from the repo *before* the first analyze ends |
| Large model doing lookup work | Route lookups to a smaller model; keep the big one for synthesis |
| A parallel batch of ≥5 agents fails to launch (classifier / rate limit) | Retry only the failed launches, in smaller groups; record the failure in the report |
| Agent was given a text description of a screenshot/mock-up | Pass the image file path; list what the agent could not check (contrast, target size, states) |
| Same agent type is cheaper as a fresh run than as a resume | Make "fresh agent + report path" the default hand-off for that type |
| The same open question travels through several reports | Give it one owner (agent or user) and one place (spec Open questions) at first mention |
| Retro shows the same lesson as an earlier row in the index | Promote it: edit the agent file or flow doc instead of noting it again |
| Long human wait between phases | Batch the user's questions into one `AskUserQuestion`; offer defaults |
| Output much longer than the next phase used | Cap sections in the output format, or ask for a summary + detail file |

## Summary (at the end)

```
## workflow-retro — <workflow>  (docs/retros/<file>.md)
Tokens: <all> · Agents: <started>/<launched> · Active: <..> (wall <..>)
Vs previous: <cheaper | same | costlier — why> · Cost: <$ | no rates set>
Top findings: <R1>, <R2>, <R3>
Proposed: <n> changes — applied <n>, saved as notes <n>, skipped <n>
Not checked: <limits>
```
