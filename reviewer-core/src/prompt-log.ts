/**
 * Safe, structured prompt-assembly telemetry.
 *
 * Describes WHAT went into a prompt — section name, where it came from,
 * trusted vs untrusted, size in chars and estimated tokens — never the
 * content itself. The diff, PR body, spec docs, skills and secrets can all
 * sit inside a prompt; none of them may reach a log line. Callers only ever
 * log the `PromptSectionStat[]` this module produces.
 *
 * Levels:
 *  - `off`     — nothing is emitted.
 *  - `summary` — one stat per section (the default).
 *  - `verbose` — additionally per-item sizes (each skill / spec chunk) and a
 *                short non-cryptographic content fingerprint per section, so
 *                two runs can be compared ("did the skills section change?")
 *                without seeing the text. The host decides when verbose is
 *                allowed (the server only honours it outside production).
 */

export type PromptLogLevel = 'off' | 'summary' | 'verbose';

export interface PromptSectionStat {
  /** Section name as it appears in the prompt, e.g. `diff`, `skills`. */
  section: string;
  /** Where the content came from, e.g. `pr-author`, `repo-intel`, `agent`. */
  source: string;
  /** Untrusted = delimiter-wrapped data the model must not obey. */
  trust: 'trusted' | 'untrusted';
  chars: number;
  est_tokens: number;
  /** Number of items joined into the section (skills, spec chunks, files). */
  items?: number;
  /** verbose only: per-item char counts, in prompt order. */
  item_chars?: number[];
  /** verbose only: 8-hex FNV-1a fingerprint of the section content. */
  fingerprint?: string;
}

export interface PromptLogSummary {
  sections: PromptSectionStat[];
  total_chars: number;
  est_tokens: number;
}

/**
 * Rough token estimate (~4 chars/token for English + code). Deliberately
 * provider-agnostic: it is for budgeting and trend-spotting in logs, not
 * billing — billed tokens come back from the provider on every call.
 */
export function estimateTokens(chars: number): number {
  return Math.ceil(chars / 4);
}

/** 32-bit FNV-1a, hex. Not a security primitive — change detection only. */
export function contentFingerprint(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export interface SectionInput {
  section: string;
  source: string;
  trust: 'trusted' | 'untrusted';
  /** The exact text placed in the prompt (measured, never emitted). */
  content: string;
  /** Individual items the section was joined from, when it has several. */
  items?: string[];
}

/** Measure sections at `level`; returns `undefined` for `off`. */
export function summarizePrompt(
  inputs: SectionInput[],
  level: PromptLogLevel,
): PromptLogSummary | undefined {
  if (level === 'off') return undefined;
  const sections = inputs.map((s): PromptSectionStat => {
    const stat: PromptSectionStat = {
      section: s.section,
      source: s.source,
      trust: s.trust,
      chars: s.content.length,
      est_tokens: estimateTokens(s.content.length),
      ...(s.items ? { items: s.items.length } : {}),
    };
    if (level === 'verbose') {
      if (s.items) stat.item_chars = s.items.map((i) => i.length);
      stat.fingerprint = contentFingerprint(s.content);
    }
    return stat;
  });
  const total = sections.reduce((n, s) => n + s.chars, 0);
  return { sections, total_chars: total, est_tokens: estimateTokens(total) };
}
