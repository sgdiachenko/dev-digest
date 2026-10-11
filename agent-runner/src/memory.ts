import { readFileSync } from 'node:fs';
import path from 'node:path';
import { MemoryItem } from '@devdigest/shared';
import { sha256Hex } from './hash.js';

/**
 * `.devdigest/memory.jsonl`: one `MemoryItem` JSON object per line (AC-40). A
 * missing file or any line that is not a valid `MemoryItem` is `memory_invalid`
 * (AC-159). The sha256 is set whenever the bytes were read (AC-172).
 */
export type MemoryResult =
  | { ok: true; sha256: string; items: string[] }
  | { ok: false; sha256: string | null; message: string };

export function readMemory(devdigestDir: string): MemoryResult {
  let bytes: Buffer;
  try {
    bytes = readFileSync(path.join(devdigestDir, 'memory.jsonl'));
  } catch (err) {
    return { ok: false, sha256: null, message: `cannot read memory.jsonl: ${(err as Error).message}` };
  }
  const sha256 = sha256Hex(bytes);
  const items: string[] = [];
  const lines = bytes.toString('utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line === '') continue;
    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch {
      return { ok: false, sha256, message: `memory.jsonl line ${i + 1} is not valid JSON` };
    }
    const item = MemoryItem.safeParse(json);
    if (!item.success) return { ok: false, sha256, message: `memory.jsonl line ${i + 1} is not a MemoryItem` };
    items.push(item.data.content);
  }
  return { ok: true, sha256, items };
}
