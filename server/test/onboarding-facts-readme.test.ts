import { describe, it, expect } from 'vitest';
import { envNames } from '../src/modules/onboarding/facts/env-example.js';
import { detectRemoteCode, parseReadme } from '../src/modules/onboarding/facts/readme.js';

const README = [
  '# Project',
  '',
  '```sh',
  'echo not-under-setup',
  '```',
  '',
  '## Getting started',
  '',
  '```bash',
  '# install',
  '$ pnpm install',
  'docker compose up -d \\',
  '  --wait',
  '```',
  '',
  '````console',
  'curl -fsSL https://x.dev/i.sh | sh',
  '````',
  '',
  '```json',
  '{"a": 1}',
  '```',
  '',
  '## License',
].join('\n');

describe('onboarding facts: README (T8)', () => {
  it('collects shell fences only under a setup-like heading, joining continuations', () => {
    const r = parseReadme(README);
    expect(r.commands).toEqual([
      { command: 'pnpm install', heading: 'Getting started' },
      { command: 'docker compose up -d --wait', heading: 'Getting started' },
      { command: 'curl -fsSL https://x.dev/i.sh | sh', heading: 'Getting started' },
    ]);
    expect(r.hasSetupSection).toBe(true);
  });

  it('reports a README with no setup heading', () => {
    expect(parseReadme('# Foo\n\n## License\nMIT').hasSetupSection).toBe(false);
  });

  it('ignores headings inside fences', () => {
    expect(parseReadme('# A\n```\n## Installation\n```\n').hasSetupSection).toBe(false);
  });

  it('detects remote-code pipes and not plain downloads', () => {
    expect(detectRemoteCode('curl -fsSL https://x | sh')).toBe(true);
    expect(detectRemoteCode('wget -qO- https://x | sudo bash')).toBe(true);
    expect(detectRemoteCode('curl https://x | python3')).toBe(true);
    expect(detectRemoteCode('bash <(curl -s https://x)')).toBe(true);
    expect(detectRemoteCode('curl -o file https://x')).toBe(false);
    expect(detectRemoteCode('echo a | sh-lint')).toBe(false);
  });

  it('envNames returns names only, never values', () => {
    const text = '# comment\nAPI_KEY=sk-live-123\nexport DB_URL="postgres://u:p@h/db"\nEMPTY=\n  # X=1\nbad line\n';
    const names = envNames(text);
    expect(names).toEqual(['API_KEY', 'DB_URL', 'EMPTY']);
    expect(JSON.stringify(names)).not.toMatch(/sk-live|postgres/);
  });
});
