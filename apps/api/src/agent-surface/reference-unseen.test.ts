import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
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
  await store.appendCreatorMessage(7, `Add floes.\n\nreferenceImageShotIds: ${older.id},${newer.id}`);
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
  });

  it('still warns about an older named image after a newer one is downloaded', async () => {
    const { store, older, newer, download } = await setup();
    await store.setSubmissionPreviewVersion(7, 'v1');
    const lookup = createReferenceLookup(store);
    expect((await download(newer.id)).statusCode).toBe(200);
    expect(await lookup(7)).toBe(true);
    expect((await download(older.id)).statusCode).toBe(200);
    expect(await lookup(7)).toBe(false);
  });

  it('clears once every one of many named images is downloaded', async () => {
    const { store, download } = await setup();
    await store.setSubmissionPreviewVersion(7, 'v1');
    const ids: string[] = [];
    for (let i = 0; i < 70; i += 1) {
      ids.push((await store.appendBuildShot(7, { data: 'cmVm', label: 'creator-reference' })).id);
    }
    await store.markCreatorMessagesDelivered(
      7,
      (await store.listPendingCreatorMessages(7)).map((m) => m.id),
    );
    await store.appendCreatorMessage(7, `Many.\n\nreferenceImageShotIds: ${ids.join(',')}`);
    for (const id of ids) expect((await download(id)).statusCode).toBe(200);
    expect(await createReferenceLookup(store)(7)).toBe(false);
  });

  it('keeps a legacy time mark for images downloaded before per-shot marks', async () => {
    const { store, older, newer, download } = await setup();
    const record = { ...(await store.getSubmission(7))!, referenceSeenAt: older.createdAt, previewVersion: 'v1' };
    const lookup = createReferenceLookup({
      getSubmission: async () => record,
      listPendingCreatorMessages: (jobId) => store.listPendingCreatorMessages(jobId),
      listBuildShots: (jobId, opts) => store.listBuildShots(jobId, opts),
    });
    expect(await lookup(7)).toBe(true);
    expect((await download(newer.id)).statusCode).toBe(200);
    expect(await lookup(7)).toBe(false);
  });

  it('ignores an image no pending note names once the game has a delivery', async () => {
    const { store } = await setup();
    const lookup = createReferenceLookup(store);
    await store.setSubmissionPreviewVersion(7, 'v1');
    const pending = await store.listPendingCreatorMessages(7);
    await store.markCreatorMessagesDelivered(
      7,
      pending.map((message) => message.id),
    );
    await store.appendCreatorMessage(7, 'Darker floor, please.');
    expect(await lookup(7)).toBe(false);
  });

  it('follows the stored images: a deleted one stops the warning, a failed read stays quiet', async () => {
    const { store, older, newer } = await setup();
    const lookup = createReferenceLookup(store);
    await store.deleteBuildShots(7, [older.id, newer.id]);
    expect(await lookup(7)).toBe(false);
    const broken = createReferenceLookup({
      getSubmission: async () => Promise.reject(new Error('down')),
      listBuildShots: async () => [],
      listPendingCreatorMessages: async () => [],
    });
    expect(await broken(7)).toBe(false);
    expect(referenceUnseen('b', 'a')).toBe(true);
    expect(referenceUnseen(undefined, undefined)).toBe(false);
  });

  it('finds a named image behind more than twenty newer unnamed ones', async () => {
    const { store } = await setup();
    await store.setSubmissionPreviewVersion(7, 'v1');
    for (let i = 0; i < 21; i += 1) {
      await store.appendBuildShot(7, {
        data: 'cmVm',
        label: 'creator-reference',
        createdAt: `2026-10-11T15:${String(i).padStart(2, '0')}:00.000Z`,
      });
    }
    expect(await createReferenceLookup(store)(7)).toBe(true);
  });

  it('finds an image named by the eleventh pending note', async () => {
    const store = new InMemoryStore();
    await store.createSubmission(8, 'g:owner', 'Fog');
    await store.setSubmissionPreviewVersion(8, 'v1');
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      for (let i = 0; i < 10; i += 1) {
        vi.setSystemTime(Date.parse('2026-10-11T10:00:00.000Z') + i * 1000);
        await store.appendCreatorMessage(8, `Note ${i}.`);
      }
      vi.setSystemTime(Date.parse('2026-10-11T11:00:00.000Z'));
      const shot = await store.appendBuildShot(8, { data: 'cmVm', label: 'creator-reference' });
      await store.appendCreatorMessage(8, `Like this.\n\nreferenceImageShotIds: ${shot.id}`);
    } finally {
      vi.useRealTimers();
    }
    expect(await createReferenceLookup(store)(8)).toBe(true);
  });

  it('lists an image a pending note names behind more than 24 newer references', async () => {
    const { store, server, older } = await setup();
    for (let i = 0; i < 25; i += 1) {
      await store.appendBuildShot(7, {
        data: 'cmVm',
        label: 'creator-reference',
        createdAt: `2026-10-11T15:${String(i).padStart(2, '0')}:00.000Z`,
      });
    }
    const listed = await server.inject({ method: 'GET', url: `${AGENT_CHANNEL_ROUTES.REFERENCE_IMAGES}?urls=1` });
    const ids = (listed.json().images as Array<{ id: string }>).map((image) => image.id);
    expect(ids).toContain(older.id);
    expect(ids).toHaveLength(26);
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
