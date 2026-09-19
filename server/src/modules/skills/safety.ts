/** Conservative, deterministic prompt-injection screen. It is not a proof of
 * safety; suspicious instructions are quarantined until the body is edited. */
export interface SkillSafety {
  safe: boolean;
  reasons: string[];
}

const SIGNALS: Array<[RegExp, string]> = [
  [/ignore\s+(?:all\s+)?(?:previous|prior|above)\s+instructions?/i, 'Attempts to override earlier instructions'],
  [/(?:reveal|print|output|send|exfiltrat\w*)\s+(?:all\s+)?(?:system\s+prompts?|hidden\s+instructions?|agent\s+configurations?|secrets?|api\s+keys?)/i, 'Requests disclosure of private instructions or secrets'],
  [/(?:override|disable|bypass)\s+(?:all\s+)?(?:safety|security|guardrails?|polic(?:y|ies))/i, 'Attempts to bypass safety rules'],
  [/(?:always\s+approve|approve\s+all|never\s+flag\s+security|always\s+return\s+score\s*100)/i, 'Attempts to force review outcomes'],
  [/\bSYSTEM\s*:\s*(?:override|ignore|disable|you\s+are\s+now)/i, 'Spoofs a higher-priority system instruction'],
];

export function assessSkillSafety(body: string): SkillSafety {
  const reasons = SIGNALS.filter(([pattern]) => pattern.test(body)).map(([, reason]) => reason);
  return { safe: reasons.length === 0, reasons };
}
