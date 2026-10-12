import { describe, expect, it, vi } from 'vitest';
import { createGcsGamesStore, type VersionManifest } from './games-store.js';
import { toRecentBuild } from './recent-builds.js';

const AT = '2026-10-12T22:30:00.000Z';
const crash = { buildId: 'build-1', ranAt: AT, status: 'timed_out' as const };

function setup(verdictRace = false) {
  let manifest: VersionManifest = {
    slug: 'test-game',
    version: 'v1',
    jobId: 7,
    roundGeneration: 2,
    createdAt: '2026-10-12T22:00:00.000Z',
    sourceFiles: [],
    deliveryMode: 'publish',
    gateProgress: { lane: 'publish', stage: 'agent-play', index: 8, total: 12, at: AT },
  };
  let generation = 1;
  const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    if (init?.method === 'POST') {
      if (verdictRace) {
        verdictRace = false;
        manifest = { ...manifest, gate: { green: true, ranAt: AT } };
        generation++;
        return new Response('', { status: 412 });
      }
      expect(new URL(String(_url)).searchParams.get('ifGenerationMatch')).toBe(String(generation));
      manifest = JSON.parse(Buffer.from(init.body as Uint8Array).toString('utf8')) as VersionManifest;
      generation++;
      return new Response('{}');
    }
    return new Response(JSON.stringify(manifest), { headers: { 'x-goog-generation': String(generation) } });
  });
  const store = createGcsGamesStore({ bucket: 'b', fetchImpl, getAccessToken: async () => 't' });
  return { store, fetchImpl, manifest: () => manifest };
}

describe('persisted gate crashes', () => {
  it('clears running progress and retains the timeout and failed stage in history', async () => {
    const { store, manifest } = setup();
    expect(await store.putGateCrash!('test-game', 'v1', crash)).toBe(true);
    expect(manifest().gateProgress).toBeUndefined();
    expect(toRecentBuild(manifest())).toMatchObject({ verdict: 'red', status: 'timed_out', failedStage: 'agent-play' });
    await store.putGateProgress('test-game', 'v1', { lane: 'publish', stage: 'validate', index: 6, total: 12, at: AT });
    expect(manifest().gateProgress).toBeUndefined();
  });

  it('never overwrites a real verdict written concurrently', async () => {
    const { store, manifest } = setup(true);
    expect(await store.putGateCrash!('test-game', 'v1', crash)).toBe(false);
    expect(manifest().gate?.green).toBe(true);
    expect(manifest().gateCrash).toBeUndefined();
  });
});
