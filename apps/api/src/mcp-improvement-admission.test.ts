import { expect, it, vi } from 'vitest';
import { buildApp } from './platform/app.js';
import { InMemoryStore } from './platform/store.js';
import { mintCreatorAgentKey } from './agent-surface/agent-creator-key.js';
import type { GitHubClient } from './catalog/github-client.js';

it.each(['admission', 'claim'])(
  'does not spend MCP improvement quota when %s prevents opening the round',
  async (mode) => {
    const store = new InMemoryStore();
    const uid = 'g:owner';
    const secret = 'mcp-admission-test';
    await store.createSubmission(10, uid, 'Sky');
    await store.setSubmissionSlug(10, 'sky');
    await store.setSubmissionPublishedAt(10, new Date().toISOString());
    await store.recordJobTransition(10, { to: 'published', at: new Date().toISOString(), by: 'operator' });
    await store.ensureCreatorAgentKey(uid, new Date().toISOString());
    if (mode === 'admission') expect(await store.beginCheckoutRecovery('sky', 'recovery', Date.now())).toBe(true);
    const admission = vi.spyOn(store, 'beginCheckoutRecovery');
    const claim = vi.spyOn(store, 'claimManualRoundSlug');
    if (mode === 'claim') claim.mockResolvedValueOnce(false);
    const quota = vi.spyOn(store, 'checkAndIncrementQuota');
    const app = await buildApp({
      store,
      sessionSecret: 'session-test',
      submissionRoutes: {
        githubClient: { getCatalog: async () => [] } as unknown as GitHubClient,
        githubToken: 'test',
        submissionTokenSecret: secret,
      },
    });
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/mcp',
        headers: {
          accept: 'application/json, text/event-stream',
          authorization: `Bearer ${mintCreatorAgentKey(secret, { creatorUid: uid, keyGeneration: 1, now: Date.now() })}`,
        },
        payload: {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'open_round', arguments: { slug: 'sky', feedback: 'Make the sky brighter.' } },
        },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().result.isError).toBe(true);
      expect(admission).toHaveBeenCalledWith('sky', expect.any(String), expect.any(Number));
      if (mode === 'claim') expect(claim).toHaveBeenCalledOnce();
      expect(quota.mock.calls.filter((args) => args[3] === 'improvements')).toHaveLength(0);
      expect((await store.getSubmissionBySlug('sky'))?.jobId).toBe(10);
    } finally {
      await app.close();
    }
  },
);
