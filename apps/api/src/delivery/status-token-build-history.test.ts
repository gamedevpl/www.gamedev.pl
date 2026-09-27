import type { FastifyInstance } from 'fastify';
import { afterEach, expect, it } from 'vitest';
import { InMemoryStore } from '../platform/store.js';
import { mintToken } from '../platform/submission-token.js';
import {
  createTransferApp,
  gameWithHistory,
  handOver,
  session,
  stubGamesStore,
  SENDER,
  RECIPIENT,
  SECRET,
} from '../game-transfer-fixtures.js';
import type { GamesStore } from './games-store.js';

const apps: FastifyInstance[] = [];
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
});
it.each(['anonymous', 'former-owner'])('limits an old token to its own job receipt: %s', async (viewer) => {
  const store = new InMemoryStore();
  const { jobId, at } = await gameWithHistory(store);
  const base = stubGamesStore();
  const manifest = (await base.listVersions!('comet-courier', { limit: 8 }))[0]!;
  const versions = [
    { ...manifest, jobId },
    { ...manifest, version: 'v0', jobId: jobId - 1 },
    { ...manifest, version: 'v2', jobId: jobId + 1 },
    { ...manifest, version: 'legacy-unrelated' },
  ];
  const app = await createTransferApp(store, apps, undefined, {
    ...base,
    listVersions: async () => versions,
    countVersions: async () => 999,
  } as GamesStore);
  await handOver(app, store, SENDER, RECIPIENT, at);
  const url = `/api/submissions/${mintToken(jobId, SECRET)}`;
  const response = await app.inject({
    method: 'GET',
    url,
    ...(viewer === 'former-owner' ? { headers: session(SENDER) } : {}),
  });
  expect(response.statusCode).toBe(200);
  expect(response.json().recentBuilds.map((build: { version: string }) => build.version)).toEqual(['v1']);
  expect(response.json().recentBuilds[0].summary).toBeUndefined();
  expect(response.json().totalBuildsCount).toBeUndefined();
  const member = await app.inject({ method: 'GET', url, headers: session(RECIPIENT) });
  expect(member.json().recentBuilds).toHaveLength(4);
  expect(member.json().totalBuildsCount).toBe(999);
});

it.each(['anonymous', 'former-owner'].flatMap((viewer) => [false, true].map((pending) => [viewer, pending] as const)))(
  'hides inherited legacy preview bases from a new receipt: %s (pending: %s)',
  async (viewer, pending) => {
    const store = new InMemoryStore();
    const { at } = await gameWithHistory(store);
    const nextJobId = await store.allocateJobId();
    await store.createSubmission(nextJobId, SENDER, 'Comet Courier');
    await store.setSubmissionSlug(nextJobId, 'comet-courier');
    await store.setSubmissionPreviewVersion(nextJobId, 'v1');
    const base = stubGamesStore();
    const baseManifest = (await base.listVersions!('comet-courier', { limit: 8 }))[0]!;
    const gateProgress = { lane: 'preview' as const, stage: 'capture' as const, index: 7, total: 12, at };
    const manifest = { ...baseManifest, ...(pending ? { previewGate: undefined, gateProgress } : {}) };
    const app = await createTransferApp(store, apps, undefined, {
      ...base,
      getManifest: async () => manifest,
      listVersions: async () => [manifest],
      countVersions: async () => 1,
    } as GamesStore);
    await handOver(app, store, SENDER, RECIPIENT, at);
    const url = `/api/submissions/${mintToken(nextJobId, SECRET)}`;
    const response = await app.inject({
      method: 'GET',
      url,
      ...(viewer === 'former-owner' ? { headers: session(SENDER) } : {}),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().recentBuilds).toEqual([]);
    expect(response.json().progress?.headSha).toBe('');
    expect(response.json().previewGate).toBeUndefined();
    expect(response.json().gateProgress).toBeUndefined();
    expect(response.json().canSeal).toBeUndefined();
    expect(response.json().preview).toBeUndefined();
    const member = await app.inject({ method: 'GET', url, headers: session(RECIPIENT) });
    expect(member.json().recentBuilds).toHaveLength(1);
    expect(member.json().progress.headSha).toBe('v1');
    if (pending) expect(member.json().gateProgress).toEqual(gateProgress);
    else expect(member.json().previewGate).toMatchObject({ green: false, ranAt: baseManifest.previewGate.ranAt });
  },
);

it.each(['anonymous', 'former-owner'].flatMap((viewer) => [false, true].map((pending) => [viewer, pending] as const)))(
  'keeps exact-job preview metadata outside the recent history page: %s (pending: %s)',
  async (viewer, pending) => {
    const store = new InMemoryStore();
    const { at } = await gameWithHistory(store);
    const jobId = await store.allocateJobId();
    await store.createSubmission(jobId, SENDER, 'Comet Courier');
    await store.setSubmissionSlug(jobId, 'comet-courier');
    await store.setSubmissionPreviewVersion(jobId, 'own-preview');
    const base = stubGamesStore();
    const original = (await base.listVersions!('comet-courier', { limit: 8 }))[0]!;
    const gateProgress = { lane: 'preview' as const, stage: 'capture' as const, index: 7, total: 12, at };
    const manifest = {
      ...original,
      version: 'own-preview',
      jobId,
      ...(pending ? { previewGate: undefined, gateProgress } : {}),
    };
    const app = await createTransferApp(store, apps, undefined, {
      ...base,
      getManifest: async () => manifest,
      listVersions: async () =>
        Array.from({ length: 8 }, (_, i) => ({ ...original, version: `proposal-${i}`, jobId: jobId + i + 1 })),
    } as GamesStore);
    await handOver(app, store, SENDER, RECIPIENT, at);
    const response = await app.inject({
      method: 'GET',
      url: `/api/submissions/${mintToken(jobId, SECRET)}`,
      ...(viewer === 'former-owner' ? { headers: session(SENDER) } : {}),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().recentBuilds).toEqual([]);
    expect(response.json().progress.headSha).toBe('own-preview');
    expect(response.json().preview).toEqual({ slug: 'comet-courier' });
    if (pending) expect(response.json().gateProgress).toEqual(gateProgress);
    else expect(response.json().previewGate).toMatchObject({ green: false, ranAt: original.previewGate.ranAt });
    expect(response.json().previewGate?.report).toBeUndefined();
  },
);
