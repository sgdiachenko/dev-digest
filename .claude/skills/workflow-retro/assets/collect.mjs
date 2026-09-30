#!/usr/bin/env node
// Deterministic metrics for /workflow-retro: reads one Claude Code session
// transcript (+ its subagents/) and prints markdown tables (or --json).
// No dependencies. Read-only. Never prints transcript bodies beyond short
// snippets — the qualitative pass is the model's job, not this script's.
//
//   node collect.mjs                    latest session of this repo
//   node collect.mjs --session <id>     a specific session id (or .jsonl path)
//   node collect.mjs --json             machine-readable
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };

const IDLE_GAP_MS = 5 * 60 * 1000; // gaps longer than this = user away, not agent work
const projectDir = path.join(
  os.homedir(), '.claude', 'projects', process.cwd().replace(/[/.]/g, '-'),
);

function resolveSession() {
  const s = opt('--session');
  if (s && fs.existsSync(s)) return s;
  if (s) return path.join(projectDir, s.replace(/\.jsonl$/, '') + '.jsonl');
  const files = fs.readdirSync(projectDir).filter((f) => f.endsWith('.jsonl'))
    .map((f) => ({ f, t: fs.statSync(path.join(projectDir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  if (!files.length) throw new Error(`no transcripts in ${projectDir}`);
  return path.join(projectDir, files[0].f);
}

const readJsonl = (file) => fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)
  .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

const blocks = (m) => (Array.isArray(m?.content) ? m.content : []);
const ts = (d) => (d.timestamp ? Date.parse(d.timestamp) : NaN);

/** Assistant lines repeat per content block; keep one entry per message.id
 *  (last wins = final usage), and remember every block. */
function assistantMessages(lines) {
  const byId = new Map();
  for (const d of lines) {
    if (d.type !== 'assistant' || !d.message) continue;
    const id = d.message.id || d.uuid;
    const prev = byId.get(id);
    const e = prev || { id, first: ts(d), blocks: [], usage: null, model: null };
    e.last = ts(d);
    e.usage = d.message.usage || e.usage;
    e.model = d.message.model || e.model;
    for (const b of blocks(d.message)) e.blocks.push(b);
    byId.set(id, e);
  }
  return [...byId.values()];
}

function sumUsage(msgs) {
  const u = { input: 0, output: 0, cache_read: 0, cache_write: 0, thinking: 0 };
  for (const m of msgs) {
    const x = m.usage || {};
    u.input += x.input_tokens || 0;
    u.output += x.output_tokens || 0;
    u.cache_read += x.cache_read_input_tokens || 0;
    u.cache_write += x.cache_creation_input_tokens || 0;
    u.thinking += x.output_tokens_details?.thinking_tokens || 0;
  }
  return u;
}

const cacheHit = (u) => {
  const t = u.input + u.cache_read + u.cache_write;
  return t ? Math.round((100 * u.cache_read) / t) : 0;
};

/** Active time: sum of inter-event gaps below IDLE_GAP_MS. */
function activeMs(lines) {
  const t = lines.map(ts).filter((x) => !Number.isNaN(x)).sort((a, b) => a - b);
  let sum = 0;
  for (let i = 1; i < t.length; i++) if (t[i] - t[i - 1] < IDLE_GAP_MS) sum += t[i] - t[i - 1];
  return { active: sum, wall: t.length ? t[t.length - 1] - t[0] : 0, start: t[0], end: t[t.length - 1] };
}

const PATH_RE = /[\w@./-]+\.(?:ts|tsx|mts|md|mdx|json|sh|sql|yml|yaml|mjs)\b/g;
function filesTouched(msgs) {
  const files = new Set();
  for (const m of msgs) {
    for (const b of m.blocks) {
      if (b.type !== 'tool_use') continue;
      if (b.name === 'Read' && b.input?.file_path) files.add(b.input.file_path.replace(process.cwd() + '/', ''));
      else if (b.name === 'Bash' && b.input?.command) {
        for (const p of b.input.command.match(PATH_RE) || []) files.add(p.replace(process.cwd() + '/', ''));
      }
    }
  }
  return files;
}

function toolCounts(msgs) {
  const c = {};
  for (const m of msgs) for (const b of m.blocks) if (b.type === 'tool_use') c[b.name] = (c[b.name] || 0) + 1;
  return c;
}

function errorResults(lines) {
  const out = [];
  for (const d of lines) {
    if (d.type !== 'user') continue;
    for (const b of blocks(d.message)) {
      if (b.type === 'tool_result' && b.is_error) {
        const t = typeof b.content === 'string' ? b.content : JSON.stringify(b.content);
        out.push({ tool_use_id: b.tool_use_id, text: t.replace(/\s+/g, ' ').slice(0, 140) });
      }
    }
  }
  return out;
}

const GAP_HEAD = /(not found|не знайдено|прогалин|gaps?\b|not analy[sz]ed|не аналізува|open questions|відкриті питання|caveats?|застереження|конфлікти)/i;
/** Sections of a handback the agent itself flagged as gaps / open items. */
function selfReportedGaps(msgs) {
  const out = [];
  for (const m of msgs) for (const b of m.blocks) {
    if (b.type !== 'tool_use' || b.name !== 'SubagentHandback') continue;
    const text = JSON.stringify(b.input);
    const raw = Object.values(b.input || {}).filter((v) => typeof v === 'string').join('\n') || text;
    const lines = raw.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (/^#{1,4}\s/.test(lines[i]) && GAP_HEAD.test(lines[i])) {
        const body = [];
        for (let j = i + 1; j < lines.length && !/^#{1,3}\s/.test(lines[j]); j++) if (lines[j].trim()) body.push(lines[j].trim());
        out.push({ heading: lines[i].replace(/^#+\s*/, ''), items: body.slice(0, 5).map((x) => x.replace(/^[-*]\s+/, '').slice(0, 170)) });
      }
    }
  }
  return out;
}

// Optional cost: only for models with all four rates filled in prices.json.
const priceTable = (() => {
  try { return JSON.parse(fs.readFileSync(new URL('./prices.json', import.meta.url), 'utf8')).rates || []; } catch { return []; }
})();
const costOf = (model, u) => {
  const r = priceTable.find((x) => model && model.includes(x.match));
  if (!r || ['input', 'cache_write', 'cache_read', 'output'].some((f) => typeof r[f] !== 'number')) return null;
  return (u.input * r.input + u.cache_write * r.cache_write + u.cache_read * r.cache_read + u.output * r.output) / 1e6;
};
const usd = (n) => (n == null ? '—' : `$${n.toFixed(2)}`);

const shortDur = (ms) => {
  const s = Math.round(ms / 1000);
  if (s < 90) return `${s}s`;
  if (s < 5400) return `${Math.round(s / 60)}m`;
  return `${(s / 3600).toFixed(1)}h`;
};
const k = (n) => (n >= 10000 ? `${(n / 1000).toFixed(0)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

// ---------------------------------------------------------------- main
const sessionFile = resolveSession();
const sessionId = path.basename(sessionFile, '.jsonl');

// --handback <agentId|prefix>: print that agent's final report(s), nothing else.
if (opt('--handback')) {
  const dir = path.join(path.dirname(sessionFile), sessionId, 'subagents');
  const want = opt('--handback');
  const f = fs.readdirSync(dir).find((x) => x.startsWith(`agent-${want}`) && x.endsWith('.jsonl'));
  if (!f) { console.error(`no agent starting with ${want}`); process.exit(1); }
  const reports = [];
  for (const m of assistantMessages(readJsonl(path.join(dir, f)))) for (const b of m.blocks) {
    if (b.type === 'tool_use' && b.name === 'SubagentHandback') reports.push(Object.values(b.input || {}).filter((v) => typeof v === 'string').join('\n'));
  }
  console.log(reports.join('\n\n----- next hand-back -----\n\n') || '(no hand-back found)');
  process.exit(0);
}
const mainLines = readJsonl(sessionFile);
const mainMsgs = assistantMessages(mainLines);
const mainUsage = sumUsage(mainMsgs);
const mainTime = activeMs(mainLines);

// launches (Agent tool_use) in message order, grouped by message id = one parallel batch
const launches = [];
const results = new Map(); // tool_use_id -> { agentId } | { error }
for (const d of mainLines) {
  if (d.type !== 'user') continue;
  for (const b of blocks(d.message)) {
    if (b.type !== 'tool_result') continue;
    const r = d.toolUseResult;
    if (r?.agentId) results.set(b.tool_use_id, { agentId: r.agentId, model: r.resolvedModel });
    else if (b.is_error) results.set(b.tool_use_id, { error: (typeof b.content === 'string' ? b.content : JSON.stringify(b.content)).replace(/\s+/g, ' ').slice(0, 120) });
  }
}
let batch = 0;
for (const m of mainMsgs) {
  const agents = m.blocks.filter((b) => b.type === 'tool_use' && b.name === 'Agent');
  if (!agents.length) continue;
  batch++;
  for (const b of agents) {
    const r = results.get(b.id) || {};
    launches.push({
      batch, at: m.first, tool_use_id: b.id,
      type: b.input?.subagent_type || 'general-purpose',
      description: b.input?.description || '',
      prompt_chars: (b.input?.prompt || '').length,
      prompt: b.input?.prompt || '',
      agentId: r.agentId, error: r.error, model: r.model,
    });
  }
}
// prompt boilerplate shared inside one batch (duplicated instructions)
for (const bt of new Set(launches.map((l) => l.batch))) {
  const group = launches.filter((l) => l.batch === bt && !l.error);
  if (group.length < 2) continue;
  const count = new Map();
  for (const l of group) for (const ln of new Set(l.prompt.split('\n').map((x) => x.trim()).filter((x) => x.length > 25))) count.set(ln, (count.get(ln) || 0) + 1);
  for (const l of group) {
    const lines = l.prompt.split('\n').map((x) => x.trim()).filter((x) => x.length > 25);
    const shared = lines.filter((x) => count.get(x) > 1).length;
    l.shared_prompt_pct = lines.length ? Math.round((100 * shared) / lines.length) : 0;
  }
}
const sends = {};
for (const m of mainMsgs) for (const b of m.blocks) if (b.type === 'tool_use' && b.name === 'SendMessage' && b.input?.to) sends[b.input.to] = (sends[b.input.to] || 0) + 1;

// subagents
const subDir = path.join(path.dirname(sessionFile), sessionId, 'subagents');
const agents = [];
const fileReaders = new Map(); // file -> Set(agent label)
if (fs.existsSync(subDir)) {
  for (const f of fs.readdirSync(subDir).filter((x) => x.endsWith('.jsonl'))) {
    const id = f.replace(/^agent-/, '').replace(/\.jsonl$/, '');
    const metaPath = path.join(subDir, f.replace(/\.jsonl$/, '.meta.json'));
    const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : {};
    const lines = readJsonl(path.join(subDir, f));
    const msgs = assistantMessages(lines);
    const u = sumUsage(msgs);
    const t = activeMs(lines);
    const tools = toolCounts(msgs);
    const toolUses = Object.entries(tools).filter(([n]) => n !== 'SubagentHandback').reduce((a, [, c]) => a + c, 0);
    const files = filesTouched(msgs);
    const label = `${meta.agentType || '?'}:${id.slice(0, 6)}`;
    for (const p of files) { if (!fileReaders.has(p)) fileReaders.set(p, new Set()); fileReaders.get(p).add(label); }
    const launch = launches.find((l) => l.agentId === id);
    agents.push({
      id, label, type: meta.agentType || launch?.type || '?', description: meta.description || launch?.description || '',
      batch: launch?.batch, model: launch?.model || msgs.find((m) => m.model)?.model,
      start: t.start, end: t.end, wall_ms: t.wall, active_ms: t.active,
      tokens: u, cache_hit_pct: cacheHit(u), cost_usd: costOf(launch?.model || msgs.find((m) => m.model)?.model, u), tool_uses: toolUses, tools,
      errors: errorResults(lines).length, files: files.size,
      resumed: sends[id] || 0, handbacks: tools.SubagentHandback || 0,
      self_reported_gaps: selfReportedGaps(msgs),
    });
  }
}
agents.sort((a, b) => (a.start || 0) - (b.start || 0));

// Agents cite the same file as `server/src/x.ts`, `modules/x.ts` or `/abs/x.ts`.
// Fold every path into the longest known path it is a suffix of.
{
  const known = [...fileReaders.keys()].sort((a, b) => b.length - a.length);
  const folded = new Map();
  for (const [p, who] of fileReaders) {
    const bare = p.replace(/^\/+/, '');
    const full = known.find((q) => q !== p && q.replace(/^\/+/, '').endsWith('/' + bare)) ?? p;
    if (!folded.has(full)) folded.set(full, new Set());
    for (const w of who) folded.get(full).add(w);
  }
  fileReaders.clear();
  for (const [p, who] of folded) fileReaders.set(p, who);
}
const overlap = [...fileReaders.entries()].filter(([, s]) => s.size > 1)
  .sort((a, b) => b[1].size - a[1].size).slice(0, 15)
  .map(([file, s]) => ({ file, agents: [...s] }));

const total = { ...mainUsage };
for (const a of agents) for (const key of Object.keys(total)) total[key] += a.tokens[key];
const subTotal = agents.reduce((acc, a) => { for (const key of Object.keys(a.tokens)) acc[key] = (acc[key] || 0) + a.tokens[key]; return acc; }, {});

const report = {
  session: sessionId,
  main: { tokens: mainUsage, cache_hit_pct: cacheHit(mainUsage), assistant_messages: mainMsgs.length, active_ms: mainTime.active, wall_ms: mainTime.wall, errors: errorResults(mainLines) },
  totals: { all: total, subagents: subTotal, agents_launched: launches.length, agents_started: agents.length, launch_failures: launches.filter((l) => l.error).length, batches: batch },
  launches: launches.map(({ prompt, ...l }) => l),
  agents, overlap,
  idle_gap_ms: IDLE_GAP_MS,
};

if (flag('--json')) { console.log(JSON.stringify(report, null, 2)); process.exit(0); }

// ---------------------------------------------------------------- markdown
const T = (u) => `${k(u.input + u.cache_write)} in-new · ${k(u.cache_read)} cache-read · ${k(u.output)} out`;
const o = [];
o.push(`# Workflow metrics — session ${sessionId.slice(0, 8)}`);
o.push('');
o.push('## Totals');
o.push(`- Main session: ${T(mainUsage)} (cache hit ${cacheHit(mainUsage)}%), ${mainMsgs.length} assistant turns, active ${shortDur(mainTime.active)} / wall ${shortDur(mainTime.wall)}`);
o.push(`- Subagents: ${T({ input: subTotal.input || 0, cache_write: subTotal.cache_write || 0, cache_read: subTotal.cache_read || 0, output: subTotal.output || 0 })}`);
o.push(`- **All: ${T(total)}**  (thinking inside output: ${k(total.thinking)})`);
o.push(`- Agent launches: ${launches.length} in ${batch} batch(es); started ${agents.length}; **launch failures ${launches.filter((l) => l.error).length}**`);
const mainCost = costOf(mainMsgs.find((m) => m.model)?.model, mainUsage);
const costKnown = agents.filter((a) => a.cost_usd != null);
if (mainCost != null || costKnown.length) {
  const sum = (mainCost || 0) + costKnown.reduce((s, a) => s + a.cost_usd, 0);
  const partial = agents.length - costKnown.length + (mainCost == null ? 1 : 0);
  o.push(`- **Cost: ${usd(sum)}**${partial ? ` (partial — ${partial} model(s) have no rate in prices.json)` : ''}; main ${usd(mainCost)}`);
}
o.push('- "in-new" = fresh input + cache writes; cache-read is re-read context, billed far cheaper. Cost appears only for models with rates in assets/prices.json.');
o.push('');
o.push('## Launch order');
o.push('| # | batch | agent | task | model | prompt | shared prompt lines | result |');
o.push('|---|---|---|---|---|---|---|---|');
launches.forEach((l, i) => o.push(`| ${i + 1} | ${l.batch} | ${l.type} | ${l.description} | ${(l.model || '').replace('claude-', '') || '—'} | ${k(l.prompt_chars)} chars | ${l.shared_prompt_pct ?? '—'}${l.shared_prompt_pct != null ? '%' : ''} | ${l.error ? '❌ ' + l.error.slice(0, 60) : '✔ started'} |`));
o.push('');
o.push('## Per agent');
o.push('| agent | task | active | wall | tool uses | errors | resumed | tokens | cache hit | cost |');
o.push('|---|---|---|---|---|---|---|---|---|---|');
for (const a of agents) o.push(`| ${a.label} | ${a.description} | ${shortDur(a.active_ms)} | ${shortDur(a.wall_ms)} | ${a.tool_uses} | ${a.errors} | ${a.resumed}× | ${T(a.tokens)} | ${a.cache_hit_pct}% | ${usd(a.cost_usd)} |`);
o.push('');
o.push('## Files touched by more than one agent (duplicated reading, heuristic)');
if (!overlap.length) o.push('none');
for (const x of overlap) o.push(`- \`${x.file}\` — ${x.agents.join(', ')}`);
o.push('');
o.push('## Errors in the main session');
if (!report.main.errors.length) o.push('none');
for (const e of report.main.errors) o.push(`- ${e.text}`);
o.push('');
o.push('## Gaps the agents reported themselves');
let anyGap = false;
for (const a of agents) for (const g of a.self_reported_gaps) { anyGap = true; o.push(`- **${a.label} — ${g.heading}**`); for (const it of g.items) o.push(`  - ${it}`); }
if (!anyGap) o.push('none found');
console.log(o.join('\n'));
