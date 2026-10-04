import { expect, it, vi } from 'vitest';
import { buildApp } from '../platform/app.js';
import { InMemoryStore } from '../store/in-memory.js';
import { mintCreatorAgentKey } from './agent-creator-key.js';
import type { GitHubClient } from '../github.js';
import type { LinkedPullRequest } from '../pr-monitor.js';
import type { CatalogGameEntry, GameSources } from '../catalog/catalog-types.js';
import { enableCliSurface, mintCreatorTokens, sessionCookie, SESSION_SECRET } from '../platform/oauth-cli-test-app.js';
function stubGitHub(): GitHubClient {
  return {
    getIssueState: async () => ({ state: 'open' as const }),
    findLinkedPR: async (): Promise<LinkedPullRequest | null> => null,
    createIssueComment: async () => ({ id: 1 }),
    updateIssueBody: async () => {},
    closeIssue: async () => {},
    ensureOpenPullRequest: async () => ({ number: 1 }),
    deleteBranch: async () => {},
    getGameSources: async (): Promise<GameSources | null> => null,
    getGameMedia: async () => null,
    getCatalog: async (): Promise<CatalogGameEntry[]> => [],
    getProgressNotes: async () => null,
  };
}

const secret = 'test-token-secret-must-be-32-chars-long';
it('advertises and reads production aggregates with creator/OAuth credentials without a build round', async () => {
  const store = new InMemoryStore();
  await store.upsertUser({ uid: 'g:owner', betaStatus: 'approved' });
  await store.upsertUser({ uid: 'g:other', betaStatus: 'approved' });
  await store.ensureCreatorAgentKey('g:owner', new Date().toISOString());
  await store.ensureCreatorAgentKey('g:other', new Date().toISOString());
  await store.createSubmission(1, 'g:owner', 'Published');
  await store.setSubmissionSlug(1, 'space-hop');
  await store.setSubmissionPublishedAt(1, new Date().toISOString());
  const app = await buildApp({
    store,
    sessionSecret: SESSION_SECRET,
    submissionRoutes: {
      submissionTokenSecret: secret,
      githubClient: stubGitHub(),
      githubToken: 'gh',
      managedAvailabilityGate: null,
    },
  });
  const key = mintCreatorAgentKey(secret, { creatorUid: 'g:owner', keyGeneration: 1, now: Date.now() });
  const call = async (bearer: string, days = 7) => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/mcp',
      headers: { authorization: `Bearer ${bearer}`, accept: 'application/json, text/event-stream' },
      payload: {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'get_game_performance', arguments: { slug: 'space-hop', days } },
      },
    });
    expect(res.statusCode).toBe(200);
    return res.json().result;
  };
  const scan = vi.spyOn(store, 'listTelemetryEvents');
  const restoreCli = enableCliSurface();
  try {
    const listed = await app.inject({
      method: 'POST',
      url: '/api/mcp',
      headers: { accept: 'application/json, text/event-stream' },
      payload: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    });
    expect(
      listed.json().result.tools.find((tool: { name: string }) => tool.name === 'get_game_performance').annotations
        .readOnlyHint,
    ).toBe(true);
    const result = await call(key);
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent.status).toBe('no_traffic');
    expect((await call(key, 31)).isError).toBe(true);
    expect((await call('fake')).isError).toBe(true);
    const other = mintCreatorAgentKey(secret, { creatorUid: 'g:other', keyGeneration: 1, now: Date.now() });
    expect((await call(other)).structuredContent.code).toBe('not_owner');
    expect(scan).toHaveBeenCalledTimes(7);
    const token = await mintCreatorTokens(app, { uid: 'g:owner', scope: 'mcp', device: 'performance-test' });
    expect((await call(token.access_token)).structuredContent.status).toBe('no_traffic');
    const noScope = await mintCreatorTokens(app, { uid: 'g:owner', scope: 'creator', device: 'no-mcp-test' });
    expect((await call(noScope.access_token)).structuredContent.code).toBe('opener_required');
    const grants = await app.inject({ url: '/api/me/oauth-grants', headers: { cookie: sessionCookie('g:owner') } });
    for (const grant of grants.json() as Array<{ grantId: string }>) {
      expect(
        (
          await app.inject({
            method: 'DELETE',
            url: `/api/me/oauth-grants/${grant.grantId}`,
            headers: { cookie: sessionCookie('g:owner') },
          })
        ).statusCode,
      ).toBe(204);
    }
    expect((await call(token.access_token)).structuredContent.code).toBe('opener_required');
    expect(scan).toHaveBeenCalledTimes(7);
    await store.rotateCreatorAgentKey('g:owner', new Date().toISOString());
    expect((await call(key)).isError).toBe(true);
  } finally {
    restoreCli();
    await app.close();
  }
});
