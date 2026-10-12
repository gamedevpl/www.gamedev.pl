import { describe, expect, it, vi } from 'vitest';
import { buildSpec } from './gate-build-spec.js';
import { createCloudBuildOutcomeReader } from './gate-build-outcome.js';
import { createGateCrashProbe } from './gate-crash.js';
import { identityFromBuild } from './gate-build-identity.js';
import type { SubmissionRecord } from '../platform/store.js';

const AT = '2026-10-12T10:00:00.000Z';
const options = {
  project: 'p',
  bucket: 'b',
  platformRepo: 'https://github.com/example/platform.git',
  platformRef: 'master',
  gamesRepo: 'example/games',
  runnerImage: 'image',
  gamesTokenSecret: 'token',
  serviceAccountEmail: 'gate@p',
};
const body = (version: string, status = 'TIMEOUT', mode?: 'health') => ({
  ...buildSpec(options, { slug: 'retry-game', version, mode }),
  status,
});

it.each(['image', ''])('reads candidate identity from the real build specification (%s)', (runnerImage) => {
  expect(identityFromBuild(buildSpec({ ...options, runnerImage }, { slug: 'retry-game', version: 'v2' }))).toEqual({
    slug: 'retry-game',
    version: 'v2',
    health: false,
  });
});

describe('overlapping gate response order', () => {
  it.each([true, false])('does not attach v1 failure to v2 (versioned costs: %s)', async (versioned) => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(Date.parse(AT) + 60 * 60_000);
      let currentStatus = 'WORKING';
      const fetchImpl = vi.fn(async (url: string | URL | Request) => {
        const id = String(url).split('/').at(-1);
        return new Response(JSON.stringify(id === 'build-1' ? body('v1') : body('v2', currentStatus)));
      });
      const read = createCloudBuildOutcomeReader({ project: 'p', fetchImpl, getAccessToken: async () => 't' });
      const record = {
        jobId: 7,
        slug: 'retry-game',
        state: 'building',
        roundGeneration: 1,
        previewVersion: 'v2',
        createdAt: AT,
        costs: [
          {
            kind: 'gate_run',
            at: '2026-10-12T10:00:01.000Z',
            by: 'cloud-build',
            ref: 'build-2',
            ...(versioned ? { version: 'v2' } : {}),
          },
          {
            kind: 'gate_run',
            at: '2026-10-12T10:00:02.000Z',
            by: 'cloud-build',
            ref: 'build-1',
            ...(versioned ? { version: 'v1' } : {}),
          },
        ],
      } as SubmissionRecord;
      const putGateCrash = vi.fn(async () => true);
      const transition = vi.fn(async () => true);
      const probe = createGateCrashProbe({
        recordJobTransition: transition,
        putGateCrash,
        readBuildOutcome: read,
        getManifest: async () => ({ jobId: 7, roundGeneration: 1, createdAt: AT }),
        log: { info: vi.fn() },
        now: () => Date.now(),
        thresholdMs: 10 * 60_000,
      });
      expect(await probe(record)).toBeNull();
      expect(putGateCrash).not.toHaveBeenCalled();
      expect(transition).not.toHaveBeenCalled();
      if (versioned) expect(fetchImpl).toHaveBeenCalledTimes(1);
      currentStatus = 'TIMEOUT';
      vi.advanceTimersByTime(30_000);
      expect(await probe(record)).toMatchObject({ reason: 'gate_crashed' });
      expect(putGateCrash).toHaveBeenCalledWith(
        'retry-game',
        'v2',
        expect.objectContaining({ buildId: 'build-2', status: 'timed_out' }),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

it('verifies identity separately for each caller while sharing the Cloud Build read', async () => {
  const fetchImpl = vi.fn(async () => new Response(JSON.stringify(body('v1'))));
  const read = createCloudBuildOutcomeReader({ project: 'p', fetchImpl, getAccessToken: async () => 't' });
  expect(await read('build-1', { slug: 'retry-game', version: 'v2' })).toBe('unrelated');
  expect(await read('build-1', { slug: 'retry-game', version: 'v1' })).toBe('timed_out');
  expect(fetchImpl).toHaveBeenCalledOnce();
});

it('refuses to attribute an outcome without candidate identity', async () => {
  const read = createCloudBuildOutcomeReader({
    project: 'p',
    fetchImpl: async () => new Response(JSON.stringify({ status: 'TIMEOUT' })),
    getAccessToken: async () => 't',
  });
  expect(await read('unscoped', { slug: 'retry-game', version: 'v2' })).toBe('unknown');
});

it('does not treat a health recheck as this candidate gate', async () => {
  const read = createCloudBuildOutcomeReader({
    project: 'p',
    fetchImpl: async () => new Response(JSON.stringify(body('v2', 'TIMEOUT', 'health'))),
    getAccessToken: async () => 't',
  });
  expect(await read('health-build', { slug: 'retry-game', version: 'v2' })).toBe('unrelated');
});
