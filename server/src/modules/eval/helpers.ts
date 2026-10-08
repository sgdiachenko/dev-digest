/**
 * Pure helpers of the eval module (side-effect free: no DB, no network, no
 * LLM): draft building blocks, case scoring, run aggregation and comparison.
 */
import type {
  EvalCaseOutcome,
  EvalCaseType,
  EvalErrorReason,
  EvalExpectation,
  EvalRunComparison,
  EvalSuiteRun,
  EvalSuiteRunStatus,
  Finding,
  RunTrace,
  UnifiedDiff,
} from '@devdigest/shared';
import { isFullFileKind, unwrapUntrusted } from '@devdigest/reviewer-core';
import { MAX_NAME } from './constants.js';
import type { CaseOutcome, CaseScore, RunAggregate } from './types.js';

// ---------------------------------------------------------------------------
// Draft building blocks
// ---------------------------------------------------------------------------

/** Lowercase kebab-case slug; non-alphanumerics collapse to single hyphens. */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** `must-find-<slug>` / `no-<slug>`, capped at 120 characters (AC-8). */
export function draftName(type: EvalCaseType, title: string): string {
  const prefix = type === 'must_find' ? 'must-find-' : 'no-';
  const slug = slugify(title) || 'finding';
  return (prefix + slug).slice(0, MAX_NAME).replace(/-+$/g, '');
}

/** The expectation a finding turns into: file + inclusive range + informational fields (AC-7). */
export function expectationFromFinding(
  f: Pick<Finding, 'file' | 'start_line' | 'end_line' | 'severity' | 'category' | 'title'>,
): EvalExpectation {
  const start = Math.max(1, f.start_line);
  return {
    file: f.file,
    start_line: start,
    end_line: Math.max(start, f.end_line),
    severity: f.severity,
    category: f.category,
    title: f.title,
  };
}

/** accepted -> must_find, dismissed -> must_not_flag, untriaged -> null (AC-6, EC-2). */
export function caseTypeFor(f: {
  accepted_at?: string | null;
  dismissed_at?: string | null;
}): EvalCaseType | null {
  if (f.accepted_at) return 'must_find';
  if (f.dismissed_at) return 'must_not_flag';
  return null;
}

/** The diff the run actually saw, recovered from the stored prompt (AC-11, AC-12). */
export function diffFromTrace(
  trace: { prompt_assembly?: Pick<RunTrace['prompt_assembly'], 'user'> | null } | null | undefined,
): string | null {
  const user = trace?.prompt_assembly?.user;
  if (typeof user !== 'string' || user.length === 0) return null;
  const diff = unwrapUntrusted('diff', user);
  return diff && diff.trim().length > 0 ? diff : null;
}

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

interface RawFileBlock {
  path: string;
  header: string[];
  hunks: Array<{ lines: string[]; from: number; to: number }>;
}

function blockPath(lines: string[]): string {
  let fromMinus = '';
  let fromGit = '';
  for (const line of lines) {
    if (line.startsWith('@@')) break;
    if (line.startsWith('+++ ')) {
      const p = line.slice(4).trim().replace(/^b\//, '');
      if (p !== '/dev/null') return p;
    } else if (line.startsWith('--- ')) {
      const p = line.slice(4).trim().replace(/^a\//, '');
      if (p !== '/dev/null') fromMinus = p;
    } else if (line.startsWith('diff --git ')) {
      const m = line.match(/ b\/(.+)$/);
      if (m?.[1]) fromGit = m[1];
    }
  }
  return fromMinus || fromGit;
}

/** Split a raw unified diff into per-file blocks with their hunks' new-side ranges. */
function splitBlocks(raw: string): RawFileBlock[] {
  const lines = raw.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  const blocks: RawFileBlock[] = [];
  let cur: string[] | null = null;
  const flush = () => {
    if (!cur) return;
    const firstHunk = cur.findIndex((l) => l.startsWith('@@'));
    const header = firstHunk === -1 ? cur : cur.slice(0, firstHunk);
    const block: RawFileBlock = { path: blockPath(cur), header, hunks: [] };
    if (firstHunk !== -1) {
      let h: string[] | null = null;
      const pushHunk = () => {
        if (!h) return;
        const m = (h[0] ?? '').match(HUNK_HEADER);
        const from = m ? Number(m[1]) : 0;
        const count = m?.[2] !== undefined ? Number(m[2]) : 1;
        block.hunks.push({ lines: h, from, to: from + Math.max(count, 1) - 1 });
      };
      for (const l of cur.slice(firstHunk)) {
        if (l.startsWith('@@')) {
          pushHunk();
          h = [l];
        } else h?.push(l);
      }
      pushHunk();
    }
    blocks.push(block);
    cur = null;
  };
  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      flush();
      cur = [line];
    } else cur?.push(line);
  }
  flush();
  return blocks;
}

/**
 * Cut the part of `diff` that a finding at `file:start-end` refers to: the
 * file's header plus only the hunks intersecting the range (all of the file's
 * hunks for a full-file kind). `null` when nothing intersects (AC-9, AC-10, AC-14).
 */
export function cutFragment(
  diff: UnifiedDiff,
  file: string,
  start: number,
  end: number,
  kind?: string | null,
): string | null {
  const fullFile = isFullFileKind(kind);
  const out: string[] = [];
  for (const block of splitBlocks(diff.raw)) {
    if (block.path !== file) continue;
    const picked = block.hunks.filter((h) => fullFile || (h.from <= end && h.to >= start));
    if (picked.length === 0) continue;
    out.push(...block.header);
    for (const h of picked) out.push(...h.lines);
  }
  return out.length > 0 ? out.join('\n') : null;
}

// ---------------------------------------------------------------------------
// Scoring (no LLM)
// ---------------------------------------------------------------------------

/** A kept finding matches an expectation on file + intersecting inclusive range; full-file kinds on file alone. */
export function matches(
  finding: Pick<Finding, 'file' | 'start_line' | 'end_line' | 'kind'>,
  exp: Pick<EvalExpectation, 'file' | 'start_line' | 'end_line'>,
): boolean {
  if (finding.file !== exp.file) return false;
  if (isFullFileKind(finding.kind)) return true;
  return finding.start_line <= exp.end_line && finding.end_line >= exp.start_line;
}

/**
 * Score ONE case. `error` (a reason code) makes the case `error` — never
 * `pass` (AC-171). `kept` / `dropped` are the grounding gate's output.
 */
export function scoreCase(
  type: EvalCaseType,
  expectations: EvalExpectation[],
  kept: Finding[],
  dropped: unknown[],
  error?: EvalErrorReason | null,
): CaseScore {
  const base = {
    expected_count: expectations.length,
    actual_count: kept.length,
    dropped_count: dropped.length,
  };
  if (error) {
    return {
      ...base,
      status: 'error',
      matched: 0,
      matches: kept.map(() => 'unmatched' as const),
      error_reason: error,
    };
  }
  const hit = kept.map((f) => expectations.some((e) => matches(f, e)));
  const matched = expectations.filter((e) => kept.some((f) => matches(f, e))).length;
  if (type === 'must_find') {
    return {
      ...base,
      status: expectations.length > 0 && matched === expectations.length ? 'pass' : 'fail',
      matched,
      matches: hit.map((h) => (h ? ('matched' as const) : ('unmatched' as const))),
      error_reason: null,
    };
  }
  return {
    ...base,
    status: hit.some(Boolean) ? 'fail' : 'pass',
    matched,
    matches: hit.map((h) => (h ? ('forbidden_hit' as const) : ('unmatched' as const))),
    error_reason: null,
  };
}

function ratio(num: number, den: number): number | null {
  return den > 0 ? num / den : null;
}

function sumOrNull(values: Array<number | null>): number | null {
  const known = values.filter((v): v is number => v !== null);
  return known.length > 0 ? known.reduce((a, b) => a + b, 0) : null;
}

/**
 * Roll case outcomes up into run metrics. Errored cases count only in
 * `cases_errored` and are excluded from every metric (AC-172). A zero
 * denominator yields `null` (AC-33); unknown cost stays `null` (AC-90).
 */
export function aggregate(outcomes: CaseOutcome[]): RunAggregate {
  const ok = outcomes.filter((o) => o.status !== 'error');
  const errored = outcomes.length - ok.length;
  const cost_usd = sumOrNull(outcomes.map((o) => o.cost_usd));
  const duration_ms = sumOrNull(outcomes.map((o) => o.duration_ms));

  if (ok.length === 0) {
    return {
      status: 'failed',
      cases_total: outcomes.length,
      cases_completed: 0,
      cases_errored: errored,
      cases_passed: null,
      recall: null,
      precision: null,
      citation_accuracy: null,
      cost_usd,
      duration_ms,
    };
  }

  const mustFind = ok.filter((o) => o.type === 'must_find');
  const kept = ok.reduce((n, o) => n + o.actual_count, 0);
  const dropped = ok.reduce((n, o) => n + o.dropped_count, 0);
  const matchedFindings = mustFind.reduce(
    (n, o) => n + o.matches.filter((m) => m === 'matched').length,
    0,
  );

  return {
    status: errored > 0 ? 'partial' : 'completed',
    cases_total: outcomes.length,
    cases_completed: ok.length,
    cases_errored: errored,
    cases_passed: ok.filter((o) => o.status === 'pass').length,
    recall: ratio(
      mustFind.reduce((n, o) => n + o.matched, 0),
      mustFind.reduce((n, o) => n + o.expected_count, 0),
    ),
    precision: ratio(matchedFindings, kept),
    citation_accuracy: ratio(kept, kept + dropped),
    cost_usd,
    duration_ms,
  };
}

// ---------------------------------------------------------------------------
// Run comparison
// ---------------------------------------------------------------------------

type ComparableRun = Pick<EvalSuiteRun, 'started_at' | 'case_ids' | 'config' | 'per_case'>;

/** `[older, newer]` by `started_at`; ties keep the argument order. */
export function orderRuns<T extends Pick<EvalSuiteRun, 'started_at'>>(a: T, b: T): [T, T] {
  return Date.parse(b.started_at) < Date.parse(a.started_at) ? [b, a] : [a, b];
}

/** Only runs that finished scoring have metrics. */
export function hasMetrics(status: EvalSuiteRunStatus): boolean {
  return status === 'completed' || status === 'partial';
}

function configKey(run: ComparableRun): string {
  const c = run.config;
  const skills = [...c.skills].sort((x, y) => x.id.localeCompare(y.id)).map((s) => [s.id, s.version]);
  return JSON.stringify([c.provider, c.model, c.strategy, c.system_prompt ?? null, c.temperature, skills]);
}

/** Compare an older run `a` with a newer run `b` (AC-125, AC-127, AC-165). */
export function compareRuns(
  a: ComparableRun,
  b: ComparableRun,
): Pick<EvalRunComparison, 'case_set' | 'flips' | 'identical_config'> {
  const inA = new Set(a.case_ids);
  const inB = new Set(b.case_ids);
  const byCase = (run: ComparableRun) => new Map(run.per_case.map((r) => [r.case_id ?? '', r]));
  const resA = byCase(a);
  const resB = byCase(b);

  const outcome = (set: Set<string>, res: ReturnType<typeof byCase>, id: string): EvalCaseOutcome =>
    set.has(id) ? (res.get(id)?.status ?? 'absent') : 'absent';

  const ids = [...a.case_ids, ...b.case_ids.filter((id) => !inA.has(id))];
  const flips = ids.map((id) => {
    const oa = outcome(inA, resA, id);
    const ob = outcome(inB, resB, id);
    return {
      case_id: id,
      case_name: resB.get(id)?.case_name ?? resA.get(id)?.case_name ?? id,
      a: oa,
      b: ob,
      flip:
        oa === 'pass' && ob === 'fail'
          ? ('pass_to_fail' as const)
          : oa === 'fail' && ob === 'pass'
            ? ('fail_to_pass' as const)
            : ('none' as const),
    };
  });

  return {
    case_set: {
      added: b.case_ids.filter((id) => !inA.has(id)),
      removed: a.case_ids.filter((id) => !inB.has(id)),
    },
    flips,
    identical_config: configKey(a) === configKey(b),
  };
}
