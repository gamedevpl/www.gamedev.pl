import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import type { GitHubClient } from '../catalog/github-client.js';
import { buildApp } from '../platform/app.js';
import { InMemoryStore } from '../platform/store.js';

// Server text describes data; it never hands out shell commands.
const SHELL_COMMAND =
  /\b(curl|wget)\s|--upload-file|--use-gl|chromium\.launch|\btar -x|\| *(ba)?sh\b|\bnpm run\b|\bnpx\s/i;

function post(app: FastifyInstance, method: string, params: unknown, headers: Record<string, string> = {}) {
  return app.inject({
    method: 'POST',
    url: '/api/mcp',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers },
    payload: { jsonrpc: '2.0', id: 1, method, params },
  });
}

// Every description string in a schema, keyed by its path.
function schemaDescriptions(node: unknown, path: string, out: Array<[string, string]>) {
  if (Array.isArray(node)) node.forEach((item) => schemaDescriptions(item, path, out));
  if (!node || typeof node !== 'object') return;
  for (const [key, value] of Object.entries(node)) {
    if (key === 'description' && typeof value === 'string') out.push([path, value]);
    else schemaDescriptions(value, `${path}.${key}`, out);
  }
}

describe('MCP tool text', () => {
  let app: FastifyInstance;
  afterEach(async () => {
    await app?.close();
  });

  it('carries no shell commands in tool descriptions or live schema fields', async () => {
    app = await buildApp({
      store: new InMemoryStore(),
      sessionSecret: 'dev-session-secret-change-me',
      submissionRoutes: {
        githubClient: {} as GitHubClient,
        githubToken: 'gh-token',
        submissionTokenSecret: 'test-secret',
        agentChannel: {},
      },
    });
    const init = await post(
      app,
      'initialize',
      { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '0' } },
      { authorization: 'Bearer handshake' },
    );
    expect(init.statusCode).toBe(200);
    const sessionId = String(init.headers['mcp-session-id']);
    const listed = await post(app, 'tools/list', {}, { 'mcp-session-id': sessionId });
    const tools = listed.json().result.tools as Array<{ name: string; description?: string } & Record<string, unknown>>;
    expect(tools.length).toBeGreaterThan(20);

    // Instructions still name kit scripts; checked once reworded.
    const texts: Array<[string, string]> = [];
    for (const tool of tools) {
      texts.push([tool.name, tool.description ?? '']);
      schemaDescriptions(tool.inputSchema, `${tool.name}.in`, texts);
      schemaDescriptions(tool.outputSchema, `${tool.name}.out`, texts);
    }
    // Deprecated fields name the form they replace until removed.
    const offenders = texts.filter(([, text]) => SHELL_COMMAND.test(text) && !text.startsWith('Deprecated:'));
    expect(offenders.map(([where, text]) => `${where}: ${text.match(SHELL_COMMAND)?.[0]}`)).toEqual([]);
  });
});
