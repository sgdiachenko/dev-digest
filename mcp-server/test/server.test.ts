import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer, createToolDefinitions } from '../src/server.js';
import { RunCache } from '../src/run-cache.js';
import { makeMockApi } from './fixtures.js';

const deps = {
  api: makeMockApi(),
  cache: new RunCache(),
  config: { apiUrl: 'http://localhost:3001', pollIntervalMs: 2000, runTimeoutMs: 300_000 },
};

describe('tool definitions', () => {
  const tools = createToolDefinitions(deps);

  it('registers exactly the 5 tools from the plan', () => {
    expect(tools.map((t) => t.name).sort()).toEqual(
      [
        'get_blast_radius',
        'get_conventions',
        'get_findings',
        'list_agents',
        'run_agent_on_pull_request',
      ].sort(),
    );
  });

  it('every tool has a flat inputSchema (course principle 2 — no nested object args)', () => {
    for (const tool of tools) {
      for (const [key, schema] of Object.entries(tool.inputSchema)) {
        expect(schema).toBeInstanceOf(z.ZodType);
        expect(schema, `${tool.name}.${key} must not be a nested object`).not.toBeInstanceOf(
          z.ZodObject,
        );
      }
    }
  });

  it('every tool declares an outputSchema and annotations', () => {
    for (const tool of tools) {
      expect(Object.keys(tool.outputSchema).length).toBeGreaterThan(0);
      expect(tool.annotations).toMatchObject({ readOnlyHint: expect.any(Boolean) });
    }
  });

  it('every description is verbatim-stable and well under the ~2048 char ceiling', () => {
    for (const tool of tools) {
      expect(tool.description.length).toBeGreaterThan(0);
      expect(tool.description.length).toBeLessThanOrEqual(2048);
    }
  });

  it('run_agent_on_pull_request is the only mutating (non-read-only) tool', () => {
    const mutating = tools.filter((t) => t.annotations.readOnlyHint === false);
    expect(mutating.map((t) => t.name)).toEqual(['run_agent_on_pull_request']);
  });
});

describe('createServer', () => {
  it('builds a connectable McpServer without throwing', () => {
    const server = createServer(deps);
    expect(server).toBeInstanceOf(McpServer);
  });

  it('a real MCP client sees exactly 5 tools via tools/list, over an in-memory transport', async () => {
    const server = createServer(deps);
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    try {
      const { tools } = await client.listTools();
      expect(tools).toHaveLength(5);
      expect(tools.map((t) => t.name).sort()).toEqual(
        [
          'get_blast_radius',
          'get_conventions',
          'get_findings',
          'list_agents',
          'run_agent_on_pull_request',
        ].sort(),
      );
      for (const tool of tools) {
        expect(tool.description?.length ?? 0).toBeGreaterThan(0);
        expect(tool.description?.length ?? 0).toBeLessThanOrEqual(2048);
        expect(tool.outputSchema).toBeDefined();
        expect(tool.annotations).toBeDefined();
      }
    } finally {
      await client.close();
      await server.close();
    }
  });
});
