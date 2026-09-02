import { Writable } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { mintGameAgentKey } from './agent-game-key.js';
import { mintAgentToken } from './agent-token.js';
import { buildApp } from '../platform/app.js';
import {
  classifyMcpBearerKind,
  classifyMcpSessionKeyShape,
  mcpToolRefusalFields,
  toolErrorReason,
} from './mcp-debug-log.js';
import { mintMcpSessionKey, newMcpSessionId } from './mcp-session-key.js';
import { generateAsAccessToken } from '../platform/oauth-tokens.js';
import { MCP_ENDPOINT_PATH } from './self-build-connect.js';
import { InMemoryStore } from '../platform/store.js';

const secret = 'mcp-debug-log-secret';

describe('mcp-debug-log classifiers', () => {
  it('classifies bearer and sessionKey shapes without needing the secret', () => {
    const oat = generateAsAccessToken().token;
    expect(classifyMcpBearerKind(null)).toBe('none');
    expect(classifyMcpBearerKind(oat)).toBe('oauth');
    expect(classifyMcpBearerKind(mintGameAgentKey(secret, { slug: 'pong', creatorUid: 'g:u', keyGeneration: 1 }))).toBe(
      'game_key',
    );
    expect(classifyMcpBearerKind(mintAgentToken(1, secret, { roundGeneration: 1 }))).toBe('round_or_other');

    const sessionKey = mintMcpSessionKey(secret, {
      sessionId: newMcpSessionId(),
      jobId: 1000016,
      roundGeneration: 1,
    });
    expect(classifyMcpSessionKeyShape(undefined)).toBe('absent');
    expect(classifyMcpSessionKeyShape(sessionKey)).toBe('session');
    expect(classifyMcpSessionKeyShape('not-a-key')).toBe('other');
  });

  it('builds refusal fields with jobId and session mismatch, never the raw key', () => {
    const sessionId = newMcpSessionId();
    const sessionKey = mintMcpSessionKey(secret, {
      sessionId,
      jobId: 1000016,
      roundGeneration: 1,
    });
    const oat = generateAsAccessToken().token;
    const fields = mcpToolRefusalFields({
      tool: 'get_brief',
      reason: 'sessionKey is bound to a different Mcp-Session-Id',
      bearer: oat,
      sessionKey,
      transportSessionId: newMcpSessionId(),
      agentTokenSecret: secret,
      userAgent: 'openai-mcp/1.0.0',
    });
    expect(fields).toMatchObject({
      event: 'mcp_tool_refused',
      tool: 'get_brief',
      bearerKind: 'oauth',
      sessionKeyShape: 'session',
      jobId: 1000016,
      boundSessionId: sessionId,
      sessionIdMismatch: true,
      userAgent: 'openai-mcp/1.0.0',
    });
    expect(JSON.stringify(fields)).not.toContain(sessionKey);
    expect(JSON.stringify(fields)).not.toContain(oat);
  });

  it('reads the refusal reason from structuredContent or content text', () => {
    expect(
      toolErrorReason({
        isError: true,
        structuredContent: { error: 'OAuth access proves your identity only' },
      }),
    ).toBe('OAuth access proves your identity only');
    expect(
      toolErrorReason({
        isError: true,
        content: [{ type: 'text', text: JSON.stringify({ error: 'unknown build' }) }],
      }),
    ).toBe('unknown build');
    expect(toolErrorReason({ isError: false, structuredContent: { title: 'Pong' } })).toBeNull();
  });
});

describe('mcp tool refusal logging', () => {
  let app: FastifyInstance | undefined;
  const lines: Array<Record<string, unknown>> = [];

  afterEach(async () => {
    if (app) await app.close();
    app = undefined;
    lines.length = 0;
  });

  async function createLoggedApp(store: InMemoryStore) {
    const stream = new Writable({
      write(chunk, _enc, cb) {
        try {
          lines.push(JSON.parse(String(chunk)) as Record<string, unknown>);
        } catch {
          // ignore non-JSON
        }
        cb();
      },
    });
    return buildApp({
      store,
      logger: { level: 'info', stream },
      sessionSecret: 'dev-session-secret-change-me',
      submissionRoutes: {
        githubClient: {
          getIssueState: async () => ({ state: 'open' as const }),
          findLinkedPR: async () => null,
          createIssueComment: async () => ({ id: 1 }),
          updateIssueBody: async () => {},
          closeIssue: async () => {},
          ensureOpenPullRequest: async () => ({ number: 1 }),
          deleteBranch: async () => {},
          getGameSources: async () => null,
          getGameMedia: async () => null,
          getCatalog: async () => [],
          getProgressNotes: async () => null,
        },
        githubToken: 'gh-token',
        submissionTokenSecret: secret,
        agentChannel: {},
      },
    });
  }

  it('logs mcp_session_started and mcp_tool_refused when OAuth Bearer is present without sessionKey', async () => {
    const store = new InMemoryStore();
    await store.createSubmission(1000016, 'g:owner', 'Pong');
    await store.setSubmissionSlug(1000016, 'pong');
    await store.setRoundBuilder(1000016, 'self');
    await store.ensureRoundGeneration(1000016);
    await store.setSubmissionBrief(1000016, { spec: 'pong', qa: [] });
    await store.recordJobTransition(1000016, {
      to: 'dispatched',
      at: new Date().toISOString(),
      by: 'system',
    });

    app = await createLoggedApp(store);
    const roundKey = mintAgentToken(1000016, secret, { roundGeneration: 1 });
    // Shape-only OAuth access (prefix match) — enough to pass the HTTP challenge and
    // hit the tool-level "OAuth is identity only" refusal, which is what ChatGPT hides.
    const oauthAccess = generateAsAccessToken().token;

    const init = await app.inject({
      method: 'POST',
      url: MCP_ENDPOINT_PATH,
      headers: { 'content-type': 'application/json', 'user-agent': 'openai-mcp/1.0.0', authorization: 'Bearer h' },
      payload: {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'test', version: '0' },
        },
      },
    });
    const sessionId = String(init.headers['mcp-session-id']);

    await app.inject({
      method: 'POST',
      url: MCP_ENDPOINT_PATH,
      headers: {
        'content-type': 'application/json',
        'mcp-session-id': sessionId,
        'user-agent': 'openai-mcp/1.0.0',
      },
      payload: {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'start', arguments: { key: roundKey } },
      },
    });

    await app.inject({
      method: 'POST',
      url: MCP_ENDPOINT_PATH,
      headers: {
        'content-type': 'application/json',
        'mcp-session-id': sessionId,
        authorization: `Bearer ${oauthAccess}`,
        'user-agent': 'openai-mcp/1.0.0',
      },
      payload: {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'get_brief', arguments: {} },
      },
    });

    const started = lines.find((line) => line.event === 'mcp_session_started');
    expect(started).toMatchObject({
      event: 'mcp_session_started',
      jobId: 1000016,
      slug: 'pong',
      sessionId,
      msg: 'mcp session started',
    });

    const refused = lines.find((line) => line.event === 'mcp_tool_refused');
    expect(refused).toMatchObject({
      event: 'mcp_tool_refused',
      tool: 'get_brief',
      bearerKind: 'oauth',
      sessionKeyShape: 'absent',
      transportSessionId: sessionId,
      userAgent: 'openai-mcp/1.0.0',
      msg: 'mcp tool refused',
    });
    expect(String(refused?.reason ?? '')).toMatch(/OAuth access proves your identity only/i);
    expect(JSON.stringify(lines)).not.toContain(oauthAccess);
    expect(JSON.stringify(lines)).not.toContain(roundKey);
  });
});
