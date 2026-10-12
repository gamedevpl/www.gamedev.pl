import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { InMemoryStore } from '../platform/store.js';
import { registerAgentChannelBriefRoutes } from './agent-channel-brief.js';
import { mintReferenceImageToken, REFERENCE_IMAGE_DOWNLOAD_ROUTE } from './reference-image-url.js';
import { referenceUnseen } from './reference-unseen.js';

const SECRET = 'test-secret';
const NOW = Date.parse('2026-10-11T23:00:00.000Z');

async function setup() {
  const store = new InMemoryStore();
  const created = await store.createSubmission(7, 'g:owner', 'Fog');
  const older = await store.appendBuildShot(7, {
    data: 'b2xk',
    label: 'creator-reference',
    createdAt: '2026-10-11T10:00:00.000Z',
  });
  const newer = await store.appendBuildShot(7, {
    data: 'bmV3',
    label: 'creator-reference',
    createdAt: '2026-10-11T11:00:00.000Z',
  });
  await store.appendBuildShot(7, { data: 'Z2F0ZQ==', label: 'opening', createdAt: '2026-10-11T12:00:00.000Z' });
  const server = Fastify();
  registerAgentChannelBriefRoutes(server, {
    resolveBuild: async () => ({ jobId: 7, record: created, access: {} as never }),
    store,
    agentTokenSecret: SECRET,
    now: () => NOW,
  });
  const download = (shotId: string) =>
    server.inject({
      method: 'GET',
      url: `${REFERENCE_IMAGE_DOWNLOAD_ROUTE}?t=${mintReferenceImageToken(SECRET, { jobId: 7, shotId, nowMs: NOW }).token}`,
    });
  return { store, older, newer, download };
}

describe('reference_unseen', () => {
  it('tracks the newest creator image and clears only when that one is downloaded', async () => {
    const { store, older, newer, download } = await setup();
    expect(await store.getSubmission(7)).toMatchObject({ referenceLatestAt: newer.createdAt });
    expect(referenceUnseen(await store.getSubmission(7))).toBe(true);
    expect((await download(older.id)).statusCode).toBe(200);
    expect(referenceUnseen(await store.getSubmission(7))).toBe(true);
    expect((await download(newer.id)).statusCode).toBe(200);
    expect(referenceUnseen(await store.getSubmission(7))).toBe(false);
    await store.markReferenceSeen(7, older.createdAt);
    expect((await store.getSubmission(7))?.referenceSeenAt).toBe(newer.createdAt);
  });

  it('stays quiet without creator images', () => {
    expect(referenceUnseen(null)).toBe(false);
    expect(referenceUnseen({})).toBe(false);
    expect(referenceUnseen({ referenceLatestAt: 'b', referenceSeenAt: 'a' })).toBe(true);
  });
});
