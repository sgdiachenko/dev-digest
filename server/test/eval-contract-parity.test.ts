import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../..');
const rel = 'src/vendor/shared/contracts';
const read = (pkg: string, file: string) =>
  readFileSync(path.join(root, pkg, rel, file), 'utf8');

describe('eval contract parity (AC-134, NFR-15)', () => {
  it('eval-ci.ts is byte-identical in server and client', () => {
    expect(read('client', 'eval-ci.ts')).toBe(read('server', 'eval-ci.ts'));
  });

  it('knowledge.ts is byte-identical in server, client and mcp-server', () => {
    const server = read('server', 'knowledge.ts');
    expect(read('client', 'knowledge.ts')).toBe(server);
    expect(read('mcp-server', 'knowledge.ts')).toBe(server);
  });
});
