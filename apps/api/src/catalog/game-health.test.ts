import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app.js';
import { parseBatchSize, runHealthSweep, startHealthCheck, type HealthGateTrigger } from './game-health.js';
import type { GamesStore, VersionManifest } from '../delivery/games-store.js';
import type { InternalAuthVerifier } from '../internal-auth.js';
import { InMemoryStore } from '../store.js';

/**
 * The sweep's whole job is deciding *which* games to re-check, and the cost of getting
 * that wrong is asymmetric: too eager and every engine push bills a Cloud Build run per
 * published game, too shy and a broken game sits unnoticed until a creator hits it. These
 * tests are about that decision — not about the gate, which runs elsewhere.
 */

const HEAD = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const OLD = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const NOW = Date.parse('2026-07-30T12:00:00.000Z');

let store: InMemoryStore;
let manifests: Map<string, VersionManifest>;
let gateTrigger: ReturnType<typeof vi.fn>;

const key = (slug: string, version: string) => `${slug}@${version}`;

const gamesStore = {
  async getManifest(slug: string, version: string) {
    return manifests.get(key(slug, version)) ?? null;
  },
} as unknown as GamesStore;

const githubClient = { getRefSha: async () => HEAD as string | null };

let issue = 100;

/** A published game, its manifest, and the engine commit it was last checked against. */
async function publish(
  slug: string,
  options: {
    /** The commit the last *health* run checked against; absent means none has run. */
    healthRef?: string;
    healthRanAt?: string;
    healthGreen?: boolean;
    /** The commit the acceptance gate checked against. */
    engineRef?: string;
    createdAt?: string;
  } = {},
): Promise<number> {
  const issueNumber = issue++;
  const version = 'v1';
  await store.createSubmission(issueNumber, 'creator-1', slug);
  await store.setPublication({
    slug,
    state: 'published',
    currentVersion: version,
    publishedAt: '2026-07-01T00:00:00.000Z',
  });
  manifests.set(key(slug, version), {
    slug,
    version,
    issueNumber,
    createdAt: options.createdAt ?? '2026-07-01T00:00:00.000Z',
    sourceFiles: [],
    ...(options.engineRef ? { engineRef: options.engineRef } : {}),
    ...(options.healthRef || options.healthRanAt
      ? {
          health: {
            green: options.healthGreen ?? true,
            ranAt: options.healthRanAt ?? '2026-07-10T00:00:00.000Z',
            ...(options.healthRef ? { engineRef: options.healthRef } : {}),
          },
        }
      : {}),
  });
  return issueNumber;
}

const sweep = (overrides: Partial<Parameters<typeof runHealthSweep>[0]> = {}) =>
  runHealthSweep({
    store,
    gamesStore,
    gateTrigger: gateTrigger as unknown as HealthGateTrigger,
    githubClient,
    now: () => NOW,
    ...overrides,
  });

beforeEach(() => {
  store = new InMemoryStore();
  manifests = new Map();
  issue = 100;
  gateTrigger = vi.fn(async () => ({ buildId: 'b-1' }));
});

describe('startHealthCheck', () => {
  it('records the request and books the build before any verdict exists', async () => {
    const issueNumber = await publish('comet-courier');

    const result = await startHealthCheck(
      { store, gamesStore, gateTrigger: gateTrigger as unknown as HealthGateTrigger, now: () => NOW },
      { slug: 'comet-courier', currentVersion: 'v1' },
    );

    expect(result).toEqual({ started: true, version: 'v1', buildId: 'b-1' });
    expect(gateTrigger).toHaveBeenCalledWith({ issueNumber, slug: 'comet-courier', version: 'v1', mode: 'health' });
    // The request is durable before the gate answers, which is what lets the notify
    // sweep tell "waiting" apart from "never asked".
    const publication = await store.getPublication('comet-courier');
    expect(publication?.healthCheck).toEqual({
      version: 'v1',
      requestedAt: '2026-07-30T12:00:00.000Z',
      buildId: 'b-1',
    });
    // Booked to the job that built the game — a health run is a gate run on the bill.
    const submission = await store.getSubmission(issueNumber);
    expect(submission?.costs).toEqual([
      { kind: 'gate_run', at: '2026-07-30T12:00:00.000Z', by: 'cloud-build', ref: 'b-1' },
    ]);
  });

  it('refuses when the published version has no manifest to check', async () => {
    await store.setPublication({
      slug: 'ghost',
      state: 'published',
      currentVersion: 'v9',
      publishedAt: '2026-07-01T00:00:00.000Z',
    });

    const result = await startHealthCheck(
      { store, gamesStore, gateTrigger: gateTrigger as unknown as HealthGateTrigger, now: () => NOW },
      { slug: 'ghost', currentVersion: 'v9' },
    );

    expect(result).toEqual({ started: false, reason: 'version_missing' });
    expect(gateTrigger).not.toHaveBeenCalled();
  });
});

describe('runHealthSweep — what counts as stale', () => {
  it('leaves a game alone when the engine has not moved since it was checked', async () => {
    await publish('fresh-health', { healthRef: HEAD });
    // Never health-checked, but *accepted* against the current engine: the acceptance
    // gate already ran this exact check against this exact commit.
    await publish('fresh-accept', { engineRef: HEAD });

    const result = await sweep();

    expect(result).toMatchObject({ head: HEAD, published: 2, fresh: 2, started: [] });
    expect(gateTrigger).not.toHaveBeenCalled();
  });

  it('re-checks a game whose last check predates the current engine', async () => {
    await publish('drifted', { healthRef: OLD });

    const result = await sweep();

    expect(result.started).toEqual(['drifted']);
    expect(gateTrigger).toHaveBeenCalledWith(expect.objectContaining({ slug: 'drifted', mode: 'health' }));
  });

  it('starts nothing at all when the engine head does not resolve', async () => {
    // The failure mode this guards: an API hiccup makes every game look stale, and the
    // sweep bills a Cloud Build run for the whole shelf on the strength of it.
    await publish('drifted', { healthRef: OLD });

    const result = await sweep({ githubClient: { getRefSha: async () => null } });

    expect(result.head).toBeUndefined();
    expect(result.started).toEqual([]);
    expect(gateTrigger).not.toHaveBeenCalled();
  });

  it('does not stack a second run on a check still waiting for its verdict', async () => {
    await publish('running', { healthRef: OLD });
    await store.setPublicationHealthCheck('running', { version: 'v1', requestedAt: '2026-07-30T11:30:00.000Z' });

    const result = await sweep();

    expect(result).toMatchObject({ inFlight: 1, started: [] });
  });

  it('picks up a check whose build never wrote a verdict', async () => {
    // Past the in-flight window: the build died, was cancelled, or never started. Without
    // this the first lost build parks a game as permanently "in flight".
    await publish('lost', { healthRef: OLD });
    await store.setPublicationHealthCheck('lost', { version: 'v1', requestedAt: '2026-07-29T12:00:00.000Z' });

    const result = await sweep();

    expect(result.started).toEqual(['lost']);
  });

  it('leaves a known-broken game alone inside the recheck cooldown', async () => {
    // Already red, already nudged. Re-gating it every time the engine moves buys a build
    // and a second identical nudge for no new information.
    await publish('broken', { healthRef: OLD, healthGreen: false });
    await store.setPublicationHealthCheck('broken', {
      version: 'v1',
      requestedAt: '2026-07-28T12:00:00.000Z',
      green: false,
      verdictAt: '2026-07-28T12:20:00.000Z',
      notifiedAt: '2026-07-28T12:25:00.000Z',
    });

    const result = await sweep();

    expect(result).toMatchObject({ cooling: 1, started: [] });
  });

  it('re-checks a long-broken game once the cooldown expires', async () => {
    // The engine may have been fixed upstream; two weeks on, that is worth one build.
    await publish('broken', { healthRef: OLD, healthGreen: false });
    await store.setPublicationHealthCheck('broken', {
      version: 'v1',
      requestedAt: '2026-07-01T12:00:00.000Z',
      green: false,
      verdictAt: '2026-07-01T12:20:00.000Z',
      notifiedAt: '2026-07-01T12:25:00.000Z',
    });

    const result = await sweep();

    expect(result.started).toEqual(['broken']);
  });

  it('ignores games that are no longer live', async () => {
    await publish('pulled', { healthRef: OLD });
    await store.takedownPublication('pulled', 'dsa', '2026-07-20T00:00:00.000Z');

    const result = await sweep();

    expect(result).toMatchObject({ published: 0, started: [] });
  });
});

describe('parseBatchSize', () => {
  it('keeps an explicit zero, because zero is the pause switch', async () => {
    // Setting the batch to 0 must stop the spending without stopping the sweep — the run
    // still reports what it *would* have started, which is what makes it inspectable
    // rather than just off.
    expect(parseBatchSize('0')).toBe(0);

    await publish('drifted', { healthRef: OLD });
    const result = await sweep({ batch: parseBatchSize('0') });

    expect(result).toMatchObject({ head: HEAD, started: [], deferred: 1 });
    expect(gateTrigger).not.toHaveBeenCalled();
  });

  it('falls back to the default for anything that is not a whole count', async () => {
    // Failing to the default rather than to zero on a misconfiguration: a sweep running
    // at a bounded rate is a visible cost, a sweep silently switched off is not.
    expect(parseBatchSize('5')).toBe(5);
    expect(parseBatchSize(undefined)).toBeUndefined();
    expect(parseBatchSize('  ')).toBeUndefined();
    expect(parseBatchSize('two')).toBeUndefined();
    expect(parseBatchSize('2.5')).toBeUndefined();
    expect(parseBatchSize('-1')).toBeUndefined();
  });
});

describe('runHealthSweep — what one run may cost', () => {
  it('starts at most a batch per run, oldest check first, and reports the rest', async () => {
    // The bound is the point: an engine push invalidates the whole shelf at once, and one
    // Cloud Build run per published game is a bill, not a policy.
    await publish('checked-recently', { healthRef: OLD, healthRanAt: '2026-07-28T00:00:00.000Z' });
    await publish('checked-a-while-ago', { healthRef: OLD, healthRanAt: '2026-07-05T00:00:00.000Z' });
    await publish('never-checked', { engineRef: OLD, createdAt: '2026-06-01T00:00:00.000Z' });

    const result = await sweep({ batch: 2 });

    expect(result.started).toEqual(['never-checked', 'checked-a-while-ago']);
    // Named rather than silent: a bounded batch that never catches up has to be a number
    // somebody can read, not an absence.
    expect(result.deferred).toBe(1);
  });

  it('finishes the batch when one game cannot be started', async () => {
    await publish('drifted-a', { healthRef: OLD, healthRanAt: '2026-07-05T00:00:00.000Z' });
    await publish('drifted-b', { healthRef: OLD, healthRanAt: '2026-07-06T00:00:00.000Z' });
    gateTrigger.mockRejectedValueOnce(new Error('cloud build refused'));
    const onError = vi.fn();

    const result = await sweep({ onError });

    expect(result.started).toEqual(['drifted-b']);
    expect(onError).toHaveBeenCalledWith('drifted-a', expect.any(Error));
  });
});

describe('POST /api/internal/health-sweep', () => {
  const allowAll: InternalAuthVerifier = { verify: async () => true };
  const denyAll: InternalAuthVerifier = { verify: async () => false };

  it('rejects a caller without a valid scheduler token', async () => {
    const app = await buildApp({ store, healthSweepRoutes: { internalAuthVerifier: denyAll } });
    const res = await app.inject({ method: 'POST', url: '/api/internal/health-sweep' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('is closed by default, so an unconfigured deploy cannot be swept by anyone', async () => {
    const app = await buildApp({ store });
    const res = await app.inject({ method: 'POST', url: '/api/internal/health-sweep' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('answers 503 rather than 200-with-nothing when the gate is not wired', async () => {
    // Local development has no bucket and no gate. Saying "swept, found nothing" there
    // would be a lie of exactly the shape this sweep exists to prevent.
    const app = await buildApp({
      store,
      healthSweepRoutes: { internalAuthVerifier: allowAll, gamesStore: undefined, gateTrigger: undefined },
    });
    const res = await app.inject({ method: 'POST', url: '/api/internal/health-sweep' });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('sweeps for an authenticated scheduler call', async () => {
    await publish('drifted', { healthRef: OLD });
    const app = await buildApp({
      store,
      healthSweepRoutes: {
        internalAuthVerifier: allowAll,
        gamesStore,
        gateTrigger: gateTrigger as unknown as HealthGateTrigger,
        githubClient,
        now: () => NOW,
      },
    });

    const res = await app.inject({ method: 'POST', url: '/api/internal/health-sweep' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ head: HEAD, published: 1, started: ['drifted'] });
    await app.close();
  });
});
