import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { MCP_ENDPOINT_PATH } from './agent-surface/self-build-connect.js';
import { InMemoryStore } from './store.js';

const secret = 'oauth-handshake-secret';
const ISSUE = 42;

function initializePayload() {
  return {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '0' } },
  };
}

async function buildMcpApp(store: InMemoryStore) {
  return buildApp({
    store,
    sessionSecret: 'dev-session-secret-change-me',
    submissionRoutes: {
      githubClient: {
        createIssue: async () => ({ number: ISSUE }),
        getIssueState: async () => ({ state: 'open' as const }),
        findLinkedPR: async () => null,
        createIssueComment: async () => ({ id: 1 }),
        updateIssueBody: async () => {},
        closeIssue: async () => {},
        closePullRequest: async () => {},
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

async function seedJob(store: InMemoryStore) {
  await store.createSubmission(ISSUE, 'g:owner', 'Comet Courier');
  await store.setSubmissionSlug(ISSUE, 'comet-courier');
  await store.setRoundBuilder(ISSUE, 'self');
  await store.setSubmissionBrief(ISSUE, { spec: 'Build it.', qa: [] });
  await store.recordJobTransition(ISSUE, { to: 'dispatched', at: new Date().toISOString(), by: 'system' });
}

describe('MCP handshake OAuth challenge', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    delete process.env.CANONICAL_HOST;
    if (app) await app.close();
    app = undefined;
  });

  // A 200 here leaves a client no sign-in link to offer.
  it('challenges initialize without credentials so OAuth discovery starts', async () => {
    process.env.CANONICAL_HOST = 'www.gamedev.pl';
    const store = new InMemoryStore();
    await seedJob(store);
    app = await buildMcpApp(store);
    const res = await app.inject({
      method: 'POST',
      url: MCP_ENDPOINT_PATH,
      headers: { 'content-type': 'application/json' },
      payload: initializePayload(),
    });
    expect(res.statusCode).toBe(401);
    expect(res.headers['www-authenticate']).toContain('resource_metadata="https://www.gamedev.pl');
  });

  // The configured-header lane must be untouched by that.
  it('allows initialize when the client presents a Bearer credential', async () => {
    const store = new InMemoryStore();
    await seedJob(store);
    app = await buildMcpApp(store);
    const res = await app.inject({
      method: 'POST',
      url: MCP_ENDPOINT_PATH,
      headers: { 'content-type': 'application/json', authorization: 'Bearer some-creator-key' },
      payload: initializePayload(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['www-authenticate']).toBeUndefined();
  });

  // Reading the surface stays open — the directory case.
  it('still lists tools without credentials', async () => {
    const store = new InMemoryStore();
    await seedJob(store);
    app = await buildMcpApp(store);
    const res = await app.inject({
      method: 'POST',
      url: MCP_ENDPOINT_PATH,
      headers: { 'content-type': 'application/json' },
      payload: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    });
    expect(res.statusCode).toBe(200);
  });
});
