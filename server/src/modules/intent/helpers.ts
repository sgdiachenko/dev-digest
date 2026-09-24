/**
 * Pure helpers for the Intent Layer — no DB, no network, no `this`. Everything
 * here is a plain function over its arguments so the extraction rules
 * (reference parsing, deterministic confidence, the clamp/dedupe gate, the
 * cache-key hash) are unit-testable without a fixture LLM or a database.
 *
 * I/O (reading a spec doc via GitClient, resolving a linked issue via
 * GitHubClient, calling the model) lives in `service.ts` — this file only
 * decides WHAT to read and HOW to score/clamp what came back.
 */
import { createHash } from 'node:crypto';
import type { IntentConfidence, IntentSourceKind } from '@devdigest/shared';
import {
  ALLOWED_SPEC_EXTENSIONS,
  MAX_EXTERNAL_REFS,
  MAX_INTENT_SENTENCE_CHARS,
  MAX_LINKED_ISSUES,
  MAX_LINKED_SPEC_DOCS,
  MAX_SCOPE_ITEM_CHARS,
  MAX_SCOPE_ITEMS,
  MIN_HIGH_CONFIDENCE_SOURCE_CHARS,
  PROMPT_VERSION,
} from './constants.js';

// ============================================================ Reference extraction

export interface ExtractedReferences {
  /** Same-repo issue/PR numbers explicitly referenced ("#123", "closes #123",
   *  or a same-repo github.com/…/issues|pull/N URL). First-appearance order,
   *  deduped, capped at MAX_LINKED_ISSUES. */
  linkedIssueNumbers: number[];
  /** Numeric ticket parsed off the branch name — ONLY set when the body has
   *  no "#N" reference at all (D9). */
  branchTicket: string | null;
  /** Repo-relative doc paths explicitly linked in the body (a markdown link or
   *  a same-repo github.com/…/blob/… URL), capped at MAX_LINKED_SPEC_DOCS. */
  linkedSpecPaths: string[];
  /** Non-GitHub URLs found in the body (Jira/Linear/other hosts) — recorded,
   *  never fetched (Q1). Capped at MAX_EXTERNAL_REFS. */
  externalRefs: string[];
}

/**
 * Same-repo/cross-repo issue shorthand: a bare `#123`, or GitHub's
 * `owner/repo#123` cross-repo form (no space before `#`). The owner/repo
 * group is optional so a bare `#123` still matches with both captures
 * `undefined`.
 */
const SHORTHAND_ISSUE_RE = /(?:([\w.-]+)\/([\w.-]+))?#(\d+)/g;
const GH_ISSUE_URL_RE = /https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/(?:issues|pull)\/(\d+)/gi;
const GH_BLOB_URL_RE = /https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/blob\/[^/\s)]+\/([^\s)]+)/gi;
const MD_LINK_RE = /]\(([^)\s]+)\)/g;
const URL_RE = /https?:\/\/[^\s)]+/gi;
/** D9: only a bare `<digits>-<slug>` last branch segment counts. */
const BRANCH_TICKET_RE = /^(\d+)-[a-z0-9-]+$/i;

/**
 * Jira/Linear-style bare ticket key (e.g. `ABC-12`) — at least 2 uppercase
 * letters/digits, a dash, then digits. Deliberately excludes a small
 * denylist of dashed tokens that match the same shape but aren't tickets
 * (`UTF-8`, `SHA-256`, …) — see `JIRA_KEY_DENYLIST`.
 */
const JIRA_KEY_RE = /\b([A-Z][A-Z0-9]+)-(\d+)\b/g;
const JIRA_KEY_DENYLIST = new Set(['UTF', 'SHA', 'ISO', 'RFC', 'GPT', 'TLS', 'SSL', 'IPV', 'ES', 'MD']);

/** Whether `path` is a doc type the Intent Layer will read as a spec (D8/data
 *  sources table). Also rejects a handful of characters that have no business
 *  in a real repo path and would otherwise reach the prompt as part of a
 *  `spec:<path>` label — defense in depth alongside `wrapUntrusted`'s own
 *  label sanitizer. */
export function isAllowedSpecPath(path: string): boolean {
  // eslint-disable-next-line no-control-regex -- deliberately matching C0/DEL
  if (/["<>\u0000-\u001f\u007f]/.test(path)) return false;
  const lower = path.toLowerCase();
  return ALLOWED_SPEC_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * A `SHORTHAND_ISSUE_RE`/`JIRA_KEY_RE` match immediately preceded by `/` is
 * almost always a URL path fragment (e.g. `…atlassian.net/browse/ABC-12`, or
 * `github.com/owner/repo#123`'s trailing digits inside a longer URL already
 * captured by `GH_ISSUE_URL_RE`/`URL_RE`), not a standalone reference —
 * skip it so it isn't double-counted under a different kind.
 */
function precededBySlash(text: string, index: number | undefined): boolean {
  return index != null && index > 0 && text[index - 1] === '/';
}

/**
 * `#N`/`owner/repo#N` shorthand refs found in `text`, split into same-repo
 * issue numbers and cross-repo `"owner/repo#N"` strings. Shared by
 * `extractReferences` (for the real extraction) and `hasIssueShorthand` (for
 * the D9 "no #N in the body" gate) so the two never drift apart.
 */
function findShorthandIssueRefs(
  text: string,
  repoOwner: string,
  repoName: string,
): { sameRepo: number[]; crossRepo: string[] } {
  const sameRepoNums: number[] = [];
  const crossRepoRefs: string[] = [];
  for (const m of text.matchAll(SHORTHAND_ISSUE_RE)) {
    if (precededBySlash(text, m.index)) continue; // URL path fragment, not a real shorthand ref
    const [, owner, repo, numStr] = m;
    const n = Number(numStr);
    if (owner && repo) {
      if (sameRepo(owner, repo, repoOwner, repoName)) {
        if (!sameRepoNums.includes(n)) sameRepoNums.push(n);
      } else {
        const ref = `${owner}/${repo}#${n}`;
        if (!crossRepoRefs.includes(ref)) crossRepoRefs.push(ref);
      }
    } else if (!sameRepoNums.includes(n)) {
      sameRepoNums.push(n);
    }
  }
  return { sameRepo: sameRepoNums, crossRepo: crossRepoRefs };
}

/** D9's gate: "no #N reference in the body" — same shorthand pattern (and the
 *  same URL-fragment guard) `findShorthandIssueRefs` uses, so a `#N` embedded
 *  in an unrelated URL never wrongly suppresses the branch-ticket heuristic,
 *  while a genuine bare or cross-repo shorthand ref always does. */
function hasIssueShorthand(body: string): boolean {
  const { sameRepo: same, crossRepo: cross } = findShorthandIssueRefs(body, '', '');
  return same.length > 0 || cross.length > 0;
}

/** Bare Jira/Linear-style keys (`ABC-12`) in `text`, denylist-filtered,
 *  excluding matches that look like they're embedded in a URL path (already
 *  captured as a full external URL elsewhere). */
function findJiraKeys(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(JIRA_KEY_RE)) {
    if (precededBySlash(text, m.index)) continue;
    const [, prefix, num] = m;
    if (!prefix || JIRA_KEY_DENYLIST.has(prefix)) continue;
    const key = `${prefix}-${num}`;
    if (!out.includes(key)) out.push(key);
  }
  return out;
}

export function extractReferences(opts: {
  title: string;
  body: string | null;
  branch: string;
  repoOwner: string;
  repoName: string;
}): ExtractedReferences {
  const body = opts.body ?? '';
  const combined = `${opts.title}\n${body}`;

  // ---- same-repo linked issues (bare #N or owner/repo#N matching THIS repo) ----
  const { sameRepo: sameRepoNums, crossRepo: crossRepoShorthand } = findShorthandIssueRefs(
    combined,
    opts.repoOwner,
    opts.repoName,
  );
  const linkedIssueNumbers = sameRepoNums.slice(0, MAX_LINKED_ISSUES);

  // ---- external refs: cross-repo GitHub shorthand, non-GitHub URLs, bare Jira/Linear keys ----
  const external: string[] = [...crossRepoShorthand];
  for (const m of body.matchAll(URL_RE)) {
    const url = m[0];
    if (/github\.com/i.test(url)) continue;
    if (!external.includes(url)) external.push(url);
  }
  for (const key of findJiraKeys(combined)) {
    const ref = `jira: ${key}`;
    if (!external.includes(ref)) external.push(ref);
  }
  // A Jira-style key can also live in the branch name (`feature/ABC-123-x`),
  // independent of the numeric-only D9 rule below.
  for (const key of findJiraKeys(opts.branch)) {
    const ref = `jira: ${key}`;
    if (!external.includes(ref)) external.push(ref);
  }

  for (const m of body.matchAll(GH_ISSUE_URL_RE)) {
    const [, owner, repo, num] = m;
    if (sameRepo(owner, repo, opts.repoOwner, opts.repoName) && num) {
      const n = Number(num);
      if (!linkedIssueNumbers.includes(n) && linkedIssueNumbers.length < MAX_LINKED_ISSUES) {
        linkedIssueNumbers.push(n);
      }
    }
    // A cross-repo GitHub issue/PR URL is out of scope (plan: "cross-repo
    // issues") — intentionally not recorded as linked_issue or external_ref
    // (unlike the `owner/repo#N` shorthand form above, which the reviewer
    // explicitly asked to record).
  }

  // ---- branch ticket (D9): only when the body has NO #N-shaped reference ----
  let branchTicket: string | null = null;
  if (!hasIssueShorthand(body)) {
    const seg = opts.branch.split('/').pop() ?? opts.branch;
    const m = BRANCH_TICKET_RE.exec(seg);
    if (m) branchTicket = m[1]!;
  }

  // ---- linked spec docs: markdown links + same-repo blob URLs ----
  const specPaths: string[] = [];
  const addSpec = (raw: string) => {
    const clean = raw.replace(/^\.\//, '');
    if (isAllowedSpecPath(clean) && !specPaths.includes(clean)) specPaths.push(clean);
  };
  for (const m of body.matchAll(MD_LINK_RE)) {
    const target = m[1]!;
    if (/^https?:\/\//i.test(target)) continue; // http(s) targets are handled by the blob-url pass below
    addSpec(target);
  }
  for (const m of body.matchAll(GH_BLOB_URL_RE)) {
    const [, owner, repo, path] = m;
    if (sameRepo(owner, repo, opts.repoOwner, opts.repoName) && path) {
      try {
        addSpec(decodeURIComponent(path));
      } catch {
        addSpec(path);
      }
    }
  }
  const linkedSpecPaths = specPaths.slice(0, MAX_LINKED_SPEC_DOCS);

  return {
    linkedIssueNumbers,
    branchTicket,
    linkedSpecPaths,
    externalRefs: external.slice(0, MAX_EXTERNAL_REFS),
  };
}

function sameRepo(owner: string | undefined, repo: string | undefined, wantOwner: string, wantName: string): boolean {
  return (owner ?? '').toLowerCase() === wantOwner.toLowerCase() && (repo ?? '').toLowerCase() === wantName.toLowerCase();
}

/** D8: changed `.md/.mdx/.txt/.rst/.adoc` files not already an explicit link. */
export function selectChangedSpecDocs(changedPaths: string[], alreadyLinked: string[], limit: number): string[] {
  const linkedSet = new Set(alreadyLinked);
  const out: string[] = [];
  for (const path of changedPaths) {
    if (out.length >= limit) break;
    if (linkedSet.has(path)) continue;
    if (isAllowedSpecPath(path)) out.push(path);
  }
  return out;
}

// ============================================================ Description substance

const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g;
const CHECKBOX_LINE_RE = /^[ \t]*[-*][ \t]*\[[ xX]\][ \t]*.*$/gm;
/** Bare ATX heading lines (`# Summary`, `## What changed`, …) — PR-template
 *  section labels, not PR-specific content; stripped like checkbox lines. */
const HEADING_LINE_RE = /^[ \t]*#{1,6}[ \t]+.*$/gm;

/** Strip HTML comments, PR-template checkbox lines, and heading lines before
 *  judging substance. */
export function stripDescriptionNoise(body: string): string {
  return body.replace(HTML_COMMENT_RE, ' ').replace(CHECKBOX_LINE_RE, ' ').replace(HEADING_LINE_RE, ' ');
}

export function countSubstantiveWords(body: string): number {
  const stripped = stripDescriptionNoise(body);
  return stripped
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0 && /[a-z0-9]/i.test(w)).length;
}

// ============================================================ Confidence (deterministic)

export interface SourceSignal {
  kind: IntentSourceKind;
  linked: boolean;
  resolved: boolean;
  /** Length of the content actually fed into the prompt (0 when unresolved). */
  contentChars: number;
}

/**
 * The BASE confidence from what sources were actually read — never from the
 * model. See plan "Впевненість (детермінована, не від моделі)".
 */
export function computeBaseConfidence(signals: SourceSignal[]): IntentConfidence {
  const high = signals.some(
    (s) =>
      s.linked &&
      s.resolved &&
      (s.kind === 'spec_doc' || s.kind === 'linked_issue') &&
      s.contentChars >= MIN_HIGH_CONFIDENCE_SOURCE_CHARS,
  );
  if (high) return 'high';

  const medium = signals.some((s) => {
    if (s.kind === 'description') return s.resolved; // caller marks resolved only when substantive
    if (s.kind === 'linked_issue') return s.resolved; // a shorter resolved issue
    if (s.kind === 'spec_doc' && !s.linked) return s.resolved; // a changed doc, no link
    return false;
  });
  return medium ? 'medium' : 'low';
}

const CONFIDENCE_ORDER: IntentConfidence[] = ['high', 'medium', 'low'];

/** The model may only LOWER confidence, never raise it (plan: "Модель може лише знижувати"). */
export function downgradeConfidence(level: IntentConfidence, steps: number): IntentConfidence {
  const idx = Math.min(CONFIDENCE_ORDER.length - 1, CONFIDENCE_ORDER.indexOf(level) + Math.max(0, steps));
  return CONFIDENCE_ORDER[idx]!;
}

/** Q3: force `out_of_scope = []` once the FINAL confidence is `low`. */
export function applyLowConfidenceScopeGuard(confidence: IntentConfidence, outOfScope: string[]): string[] {
  return confidence === 'low' ? [] : outOfScope;
}

// ============================================================ Cache key

/** Cache key: (model, title, body, headSha, per-source digests, PROMPT_VERSION). */
export function computeInputHash(parts: {
  model: string;
  title: string;
  body: string | null;
  headSha: string;
  sourceDigests: string[];
}): string {
  const h = createHash('sha256');
  const SEP = '\u0000';
  h.update(PROMPT_VERSION + SEP);
  h.update(parts.model + SEP);
  h.update(parts.title + SEP);
  h.update((parts.body ?? '') + SEP);
  h.update(parts.headSha + SEP);
  h.update(parts.sourceDigests.join('\u0001'));
  return h.digest('hex');
}

// ============================================================ Model-output clamp

export class EmptyIntentError extends Error {
  constructor() {
    super('Model returned an empty intent');
    this.name = 'EmptyIntentError';
  }
}

export interface ClampedExtraction {
  intent: string;
  inScope: string[];
  outOfScope: string[];
  evidenceSufficient: boolean;
}

function dedupeCap(items: string[], maxItems: number, maxChars: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    const trimmed = raw.trim().slice(0, maxChars);
    if (trimmed.length === 0) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
    if (out.length >= maxItems) break;
  }
  return out;
}

/** Clamp the cheap model's raw extraction: trim/cap lengths, dedupe scope
 *  bullets, cap list sizes. An empty `intent` after trimming is an error —
 *  the caller treats it as a failed derivation, not an empty-scope success. */
export function clampExtraction(raw: {
  intent: string;
  in_scope: string[];
  out_of_scope: string[];
  evidence_sufficient: boolean;
}): ClampedExtraction {
  const intent = raw.intent.trim().slice(0, MAX_INTENT_SENTENCE_CHARS);
  if (intent.length === 0) throw new EmptyIntentError();
  return {
    intent,
    inScope: dedupeCap(raw.in_scope, MAX_SCOPE_ITEMS, MAX_SCOPE_ITEM_CHARS),
    outOfScope: dedupeCap(raw.out_of_scope, MAX_SCOPE_ITEMS, MAX_SCOPE_ITEM_CHARS),
    evidenceSufficient: raw.evidence_sufficient,
  };
}

// ============================================================ Prompt budget

export interface PromptSourceEntry {
  label: string;
  content: string;
}

/**
 * `wrapUntrusted(label, content)` renders as
 * `<untrusted source="LABEL">\nCONTENT\n</untrusted>` — 19 + label.length + 3
 * (`">\n`) + content.length + 14 (`\n</untrusted>`) chars. The budget must
 * bound what actually reaches the model, not just the raw source text, or a
 * PR with many sources can slip past MAX_USER_MESSAGE_CHARS via wrapper
 * overhead alone.
 */
const WRAP_OVERHEAD_CHARS = 36; // 19 + 3 + 14, label.length added separately

function wrappedLength(s: PromptSourceEntry): number {
  return s.label.length + s.content.length + WRAP_OVERHEAD_CHARS;
}

/**
 * Fit the ordered (priority-first) source list under `maxChars` total
 * (including each entry's `<untrusted>` wrapper overhead), by
 * truncating/dropping from the END (lowest priority) first — never reorders,
 * never touches a higher-priority entry while a lower one can still absorb
 * the cut. Pure: does not mutate the input array or its entries.
 */
export function fitSourcesToBudget(sources: PromptSourceEntry[], maxChars: number): PromptSourceEntry[] {
  let total = sources.reduce((n, s) => n + wrappedLength(s), 0);
  if (total <= maxChars) return sources;
  const out = [...sources];
  for (let i = out.length - 1; i >= 0 && total > maxChars; i--) {
    const entry = out[i]!;
    const over = total - maxChars;
    if (entry.content.length <= over) {
      total -= wrappedLength(entry);
      out.splice(i, 1);
    } else {
      out[i] = { ...entry, content: entry.content.slice(0, entry.content.length - over) };
      total -= over;
    }
  }
  return out;
}

// ============================================================ Byte/char caps

/** Cap a `showFileAt` read to `maxBytes` (UTF-8) before any char-level cap. */
export function capBytes(text: string, maxBytes: number): string {
  const buf = Buffer.from(text, 'utf8');
  if (buf.byteLength <= maxBytes) return text;
  return buf.subarray(0, maxBytes).toString('utf8');
}
