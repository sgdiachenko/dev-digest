/**
 * Exact-value secret redaction (AC-65). Every log line, error message and
 * artifact field the runner writes goes through the redactor built from the
 * run's `OPENROUTER_API_KEY` and `GITHUB_TOKEN`.
 */
export type Redactor = (text: string) => string;

export function makeRedactor(secrets: ReadonlyArray<string | undefined>): Redactor {
  const values = secrets.filter((s): s is string => typeof s === 'string' && s.length > 0);
  return (text) => values.reduce((acc, v) => acc.split(v).join('***'), text);
}

/** Redact every string inside a JSON-like value (keys untouched). */
export function redactDeep<T>(value: T, redact: Redactor): T {
  if (typeof value === 'string') return redact(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, redact)) as unknown as T;
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = redactDeep(v, redact);
    return out as T;
  }
  return value;
}
