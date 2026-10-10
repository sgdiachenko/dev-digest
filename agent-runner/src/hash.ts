import { createHash } from 'node:crypto';

/** Lowercase hex sha256 of the given bytes (or UTF-8 string). */
export function sha256Hex(...parts: (Buffer | string)[]): string {
  const h = createHash('sha256');
  for (const p of parts) h.update(p);
  return h.digest('hex');
}
