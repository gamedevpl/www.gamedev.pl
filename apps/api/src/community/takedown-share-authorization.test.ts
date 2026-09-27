import type { FastifyInstance } from 'fastify';
import { afterEach, expect, it } from 'vitest';
import { InMemoryStore } from '../platform/store.js';
import { mintToken } from '../platform/submission-token.js';
import { refuseShareOf, sharedDraftVersion } from '../delivery/draft-share-gate.js';
import type { GamesStore } from '../delivery/games-store.js';
import { createShareDraftTools } from '../agent-surface/mcp-share-draft-tools.js';
import type { ToolContext } from '../agent-surface/mcp-tool-support.js';
import { takeDownSlug } from './moderation-flags.js';
import { SECRET, SENDER, createTransferApp, gameWithHistory, session } from '../game-transfer-fixtures.js';

const apps: FastifyInstance[] = [];
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
});

it.each(['http', 'mcp'] as const)('refuses an unblocked successor share after slug takedown (%s)', async (seam) => {
  const store = new InMemoryStore();
  const { at } = await gameWithHistory(store);
  await takeDownSlug({
    store,
    slug: 'comet-courier',
    reason: 'Fixture takedown',
    at,
    invalidatePublishedGameCaches: () => {},
  });
  const jobId = await store.allocateJobId();
  await store.createSubmission(jobId, SENDER, 'Successor');
  await store.setSubmissionSlug(jobId, 'comet-courier');
  await store.setSubmissionDeliveredVersion(jobId, 'v2');
  const record = (await store.getSubmission(jobId))!;
  expect(record.moderationBlockedAt).toBeUndefined();
  const gamesStore = { getManifest: async () => ({ gate: { green: true } }) } as unknown as GamesStore;
  if (seam === 'http') {
    const app = await createTransferApp(store, apps, undefined, gamesStore);
    const response = await app.inject({
      method: 'POST',
      url: `/api/submissions/${mintToken(jobId, SECRET)}/share`,
      headers: session(SENDER),
      payload: { shared: true },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe('moderation_blocked');
  } else {
    const tools = createShareDraftTools({
      store,
      now: Date.now,
      resolveAuth: async () => ({ jobId, record, actorUid: SENDER }),
      refuseShare: (current) =>
        refuseShareOf({
          store,
          gamesStore,
          slug: current.slug,
          version: sharedDraftVersion(current),
          moderationBlockedAt: current.moderationBlockedAt,
        }),
    });
    const response = await tools.share_draft.handler({ shared: true }, {} as ToolContext);
    expect(response.isError).toBe(true);
    expect(response.structuredContent).toMatchObject({ reason: 'moderation_blocked' });
  }
  expect((await store.getSubmission(jobId))?.draftSharedAt).toBeUndefined();
});
