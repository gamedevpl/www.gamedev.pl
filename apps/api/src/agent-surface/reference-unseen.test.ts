import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { AGENT_CHANNEL_ROUTES } from '@gamedevpl/contract';
import { InMemoryStore } from '../platform/store.js';
import { registerAgentChannelBriefRoutes } from './agent-channel-brief.js';
import { mintReferenceImageToken, REFERENCE_IMAGE_DOWNLOAD_ROUTE } from './reference-image-url.js';
import { createReferenceLookup, referenceUnseen } from './reference-unseen.js';

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
  return { store, server, older, newer, download };
}

describe('reference_unseen', () => {
  it('warns about the newest creator image until that one is downloaded', async () => {
    const { store, older, newer, download } = await setup();
    const lookup = createReferenceLookup(store);
    expect(await lookup(7)).toBe(true);
    expect((await download(older.id)).statusCode).toBe(200);
    expect(await lookup(7)).toBe(true);
    expect((await download(newer.id)).statusCode).toBe(200);
    expect(await lookup(7)).toBe(false);
    await store.markReferenceSeen(7, older.createdAt);
    expect((await store.getSubmission(7))?.referenceSeenAt).toBe(newer.createdAt);
  });

  it('follows the stored images: a deleted one stops the warning, a failed read stays quiet', async () => {
    const { store, older, newer } = await setup();
    const lookup = createReferenceLookup(store);
    await store.deleteBuildShots(7, [older.id, newer.id]);
    expect(await lookup(7)).toBe(false);
    const broken = createReferenceLookup({
      getSubmission: async () => Promise.reject(new Error('down')),
      listBuildShots: async () => [],
    });
    expect(await broken(7)).toBe(false);
    expect(referenceUnseen('b', 'a')).toBe(true);
    expect(referenceUnseen(undefined, undefined)).toBe(false);
  });

  it('still lists the reference behind a full page of agent screenshots', async () => {
    const { store, server, newer } = await setup();
    for (let i = 0; i < 20; i += 1) {
      await store.appendBuildShot(7, {
        data: 'c2hvdA==',
        label: 'opening',
        createdAt: `2026-10-11T14:${String(i).padStart(2, '0')}:00.000Z`,
      });
    }
    const listed = await server.inject({ method: 'GET', url: `${AGENT_CHANNEL_ROUTES.REFERENCE_IMAGES}?urls=1` });
    expect((listed.json().images as Array<{ id: string }>).map((image) => image.id)).toContain(newer.id);
  });
});
