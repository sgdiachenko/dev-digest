import { describe, it, expect, afterEach } from 'vitest';
import { AgentManifest } from '@devdigest/shared';
import { listManifests, loadManifest } from './manifest.js';
import { sha256Hex } from './hash.js';
import { Workspace, manifestYaml } from './test-helpers.js';
import path from 'node:path';
import { readFileSync } from 'node:fs';

/** T6 — manifest loading (AC-52, 53, 118, 151, 152, 173). */
describe('manifest loading', () => {
  let ws: Workspace;
  afterEach(() => ws.cleanup());

  it('AC-118: lists every .devdigest/agents/*.yaml, sorted, ignoring other files', () => {
    ws = new Workspace().agent('b-agent').agent('a-agent');
    ws.skill('x', 'not a manifest');
    const slugs = listManifests(ws.devdigestDir).map((m) => m.slug);
    expect(slugs).toEqual(['a-agent', 'b-agent']);
  });

  it('AC-52 + AC-173: a valid manifest parses with AgentManifest and carries the sha256 of its bytes', () => {
    ws = new Workspace().agent('sec');
    const file = path.join(ws.devdigestDir, 'agents', 'sec.yaml');
    const loaded = loadManifest(file);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(AgentManifest.safeParse(loaded.manifest).success).toBe(true);
    expect(loaded.manifest.post_as).toBe('github_review');
    expect(loaded.manifest.agent_version).toBe(3);
    expect(loaded.sha256).toBe(sha256Hex(readFileSync(file)));
  });

  it('AC-151: a manifest without post_as is invalid', () => {
    ws = new Workspace().agent('sec', manifestYaml({ post_as: null }));
    const loaded = loadManifest(path.join(ws.devdigestDir, 'agents', 'sec.yaml'));
    expect(loaded.ok).toBe(false);
    if (!loaded.ok) expect(loaded.message).toContain('post_as');
  });

  it('AC-151: a post_as outside the three modes is invalid', () => {
    ws = new Workspace().agent('sec', manifestYaml({ post_as: '"email"' }));
    expect(loadManifest(path.join(ws.devdigestDir, 'agents', 'sec.yaml')).ok).toBe(false);
  });

  it('AC-53: unparseable YAML and a missing file are invalid, with no hash', () => {
    ws = new Workspace().agent('sec', 'name: [unclosed');
    expect(loadManifest(path.join(ws.devdigestDir, 'agents', 'sec.yaml')).ok).toBe(false);
    expect(loadManifest(path.join(ws.devdigestDir, 'agents', 'nope.yaml')).ok).toBe(false);
  });

  it('a missing agents directory throws', () => {
    ws = new Workspace();
    expect(() => listManifests(path.join(ws.root, 'nowhere'))).toThrow(/not found/);
  });
});
