import { describe, it, expect } from 'vitest';
import { buildProbePattern, confidenceFromSupport, escapeRegexLiteral } from '../src/modules/conventions/frequency.js';
import { MAX_PROBE_CHARS } from '../src/modules/conventions/constants.js';

describe('escapeRegexLiteral', () => {
  it('escapes every regex metacharacter', () => {
    const escaped = escapeRegexLiteral('a.b*c(d)[e]{f}+g?h^i$j|k\\l');
    // The escaped string used as a pattern must match itself literally, not the metacharacters' regex meaning.
    expect(new RegExp(escaped).test('a.b*c(d)[e]{f}+g?h^i$j|k\\l')).toBe(true);
    expect(new RegExp(escaped).test('aXbXXXc')).toBe(false);
  });
});

describe('buildProbePattern — the ReDoS guard', () => {
  it('uses the model probe when it is short and non-empty', () => {
    const pattern = buildProbePattern('db.users.find', 'const user = await db.users.find(id);');
    expect(new RegExp(pattern).test('await db.users.find(id)')).toBe(true);
  });

  it('escapes the probe so regex metacharacters cannot change matching semantics', () => {
    const pattern = buildProbePattern('db.users.find', 'irrelevant snippet');
    // A literal-escaped ".": only matches an actual dot, not "any character".
    expect(new RegExp(pattern).test('dbXusersXfind')).toBe(false);
    expect(new RegExp(pattern).test('db.users.find')).toBe(true);
  });

  it('falls back to the snippet\'s longest line when the probe is empty', () => {
    const pattern = buildProbePattern('', 'short\nconst reallyDistinctiveHelperName = 1;\nx');
    expect(new RegExp(pattern).test('const reallyDistinctiveHelperName = 1;')).toBe(true);
  });

  it('falls back to the snippet when the probe is absurdly long', () => {
    const overlong = 'x'.repeat(MAX_PROBE_CHARS + 1);
    const pattern = buildProbePattern(overlong, 'const distinctiveMarker = 1;');
    expect(new RegExp(pattern).test('const distinctiveMarker = 1;')).toBe(true);
  });

  it('never produces a pattern vulnerable to catastrophic backtracking, even given an adversarial probe', () => {
    // Classic ReDoS shape: nested quantifiers. If this were used unescaped as
    // a regex against a long non-matching string, a backtracking engine would
    // hang. Because it is escaped to a literal, matching stays linear.
    const evil = '(a+)+$';
    const pattern = buildProbePattern(evil, 'irrelevant');
    const start = Date.now();
    new RegExp(pattern).test('a'.repeat(40) + '!');
    expect(Date.now() - start).toBeLessThan(50);
  });
});

describe('confidenceFromSupport', () => {
  it('drops (returns null) below the minimum support threshold', () => {
    expect(confidenceFromSupport(0)).toBeNull();
    expect(confidenceFromSupport(1)).toBeNull();
  });

  it('bands confidence by distinct file count', () => {
    expect(confidenceFromSupport(2)).toBe(0.55);
    expect(confidenceFromSupport(3)).toBe(0.7);
    expect(confidenceFromSupport(5)).toBe(0.85);
    expect(confidenceFromSupport(10)).toBe(0.95);
    expect(confidenceFromSupport(500)).toBe(0.95);
  });
});
