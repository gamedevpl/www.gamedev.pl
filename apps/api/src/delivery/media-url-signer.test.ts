import { describe, expect, it } from 'vitest';
import {
  createMediaUrlSigner,
  createMediaUrlSignerFromEnv,
  createStoreMediaUrlSignerFromEnv,
  MEDIA_URL_ANCHOR_SECONDS,
  MEDIA_URL_TTL_SECONDS,
  MEDIA_VIDEO_URL_TTL_SECONDS,
  mediaRedirectMaxAgeSeconds,
  mediaRedirectPlan,
  mediaUrlPolicy,
  anchorStart,
} from './media-url-signer.js';

// Fixed, not the constant: these cases test the reuse window.
const TTL_SECONDS = 15 * 60;

const NOW = Date.parse('2026-09-11T08:30:00.000Z');

function signerWithCounter(now: () => number) {
  let signatures = 0;
  const signer = createMediaUrlSigner({
    now,
    ttlSeconds: TTL_SECONDS,
    store: {
      objectExists: async () => true,
      signReadUrl: async (name: string) => {
        signatures++;
        return `https://storage.googleapis.com/b/${name}?sig=${signatures}`;
      },
    },
  });
  return { signer, signatures: () => signatures };
}

describe('media URL signer', () => {
  it('reuses a URL while it still has half its life left', async () => {
    let clock = NOW;
    const { signer, signatures } = signerWithCounter(() => clock);
    const first = await signer.urlFor('snapshots/s1/media/airtime/gameplay.mp4');
    clock += 7 * 60_000;

    expect(await signer.urlFor('snapshots/s1/media/airtime/gameplay.mp4')).toBe(first);
    expect(signatures()).toBe(1);
  });

  // Past halfway a handed-out URL could expire mid-download.
  it('re-signs once the reuse window passes', async () => {
    let clock = NOW;
    const { signer, signatures } = signerWithCounter(() => clock);
    const first = await signer.urlFor('a.png');
    clock += 8 * 60_000;

    expect(await signer.urlFor('a.png')).not.toBe(first);
    expect(signatures()).toBe(2);
  });

  it('never hands one object the URL of another', async () => {
    const { signer } = signerWithCounter(() => NOW);

    expect(await signer.urlFor('a.png')).not.toBe(await signer.urlFor('b.png'));
  });

  it('evicts rather than growing without bound', async () => {
    let clock = NOW;
    const signer = createMediaUrlSigner({
      now: () => clock,
      maxCached: 2,
      store: { objectExists: async () => true, signReadUrl: async (name: string) => `url:${name}:${clock}` },
    });
    await signer.urlFor('a');
    await signer.urlFor('b');
    await signer.urlFor('c');
    clock += 1;

    // 'a' was evicted by 'c', so it re-signs.
    expect(await signer.urlFor('a')).toBe(`url:a:${clock}`);
    expect(await signer.urlFor('c')).toBe(`url:c:${NOW}`);
  });
});

describe('the shipped TTL', () => {
  it('is long enough that repeat views reuse one URL rather than re-downloading', () => {
    expect(MEDIA_URL_TTL_SECONDS).toBeGreaterThanOrEqual(60 * 60);
  });
});

// A redirect cannot fall through; an inline read can.
describe('objects that are not there', () => {
  it('returns null instead of signing a URL that would 404', async () => {
    const signer = createMediaUrlSigner({
      store: {
        objectExists: async () => false,
        signReadUrl: async () => {
          throw new Error('must not sign a missing object');
        },
      },
    });

    expect(await signer.urlFor('missing.png')).toBeNull();
  });

  it('probes only when minting; a cached URL is its own proof', async () => {
    let probes = 0;
    let clock = NOW;
    const signer = createMediaUrlSigner({
      now: () => clock,
      ttlSeconds: TTL_SECONDS,
      store: {
        objectExists: async () => {
          probes++;
          return true;
        },
        signReadUrl: async (name: string) => `url:${name}`,
      },
    });

    await signer.urlFor('a.png');
    clock += 60_000;
    await signer.urlFor('a.png');

    expect(probes).toBe(1);
  });
});

describe('environment wiring', () => {
  it('signs wherever snapshots are configured', () => {
    expect(createMediaUrlSignerFromEnv({ GAMES_SNAPSHOT_BUCKET: 'gamedevpl-games-snapshots' })).not.toBeNull();
  });

  it('has nothing to sign without a snapshot bucket', () => {
    expect(createMediaUrlSignerFromEnv({})).toBeNull();
    expect(createMediaUrlSignerFromEnv({ GAMES_SNAPSHOT_BUCKET: '  ' })).toBeNull();
  });

  // Platform-made games live in the store bucket.
  it('signs store media against the store bucket', () => {
    expect(createStoreMediaUrlSignerFromEnv({ GAMES_STORE_BUCKET: 'gamedevpl-games-store' })).not.toBeNull();
    expect(createStoreMediaUrlSignerFromEnv({})).toBeNull();
  });
});

// The point of anchoring: two instances, two visitors, one cache entry.
describe('anchored image URLs', () => {
  function instanceAt(clock: () => number) {
    return createMediaUrlSigner({
      now: clock,
      store: {
        objectExists: async () => true,
        // Mirrors the real signer: the instant is the whole signature.
        signReadUrl: async (name: string, ttl?: number, signedAtMs?: number) => `url:${name}:${ttl}:${signedAtMs}`,
      },
    });
  }

  const windowStart = anchorStart(NOW, MEDIA_URL_ANCHOR_SECONDS);
  const planAt = (atMs: number) => mediaRedirectPlan('opening.png', atMs);
  const mintAt = (atMs: number) => {
    const plan = planAt(atMs);
    return instanceAt(() => atMs).urlFor('m/opening.png', plan.ttlSeconds, plan.signedAtMs);
  };

  it('hands the same URL to a visitor 9 hours later on a different instance', async () => {
    expect(await mintAt(windowStart + 9 * 3_600_000)).toBe(await mintAt(windowStart + 60_000));
  });

  it('hands a different URL once the window rolls', async () => {
    const rolled = windowStart + MEDIA_URL_ANCHOR_SECONDS * 1000 + 1_000;

    expect(await mintAt(rolled)).not.toBe(await mintAt(windowStart + 1_000));
  });

  // Stale redirects still point at the previous window's URL.
  it('signs for longer than one window, so a roll never strands a cached redirect', () => {
    const policy = mediaUrlPolicy('opening.png');

    expect(policy.ttlSeconds).toBeGreaterThanOrEqual(2 * policy.anchorSeconds);
  });

  it('re-signs across a roll even on one long-lived instance', async () => {
    let clock = windowStart + 1_000;
    const signer = instanceAt(() => clock);
    const before = await signer.urlFor('m/opening.png', planAt(clock).ttlSeconds, planAt(clock).signedAtMs);
    clock += MEDIA_URL_ANCHOR_SECONDS * 1000;

    expect(await signer.urlFor('m/opening.png', planAt(clock).ttlSeconds, planAt(clock).signedAtMs)).not.toBe(before);
  });
});

// A roll between two reads would cache a private URL.
describe('the redirect plan', () => {
  it('derives the URL and its max-age from one instant', () => {
    const lastSecond = anchorStart(NOW, MEDIA_URL_ANCHOR_SECONDS) + MEDIA_URL_ANCHOR_SECONDS * 1000 - 1_000;
    const plan = mediaRedirectPlan('opening.png', lastSecond);

    expect(plan.signedAtMs).toBe(anchorStart(lastSecond, MEDIA_URL_ANCHOR_SECONDS));
    expect(plan.maxAgeSeconds).toBe(1);
  });

  it('leaves video unpinned, so it keeps minting fresh URLs', () => {
    const plan = mediaRedirectPlan('gameplay.mp4', NOW);

    expect(plan.signedAtMs).toBeUndefined();
    expect(plan.maxAgeSeconds).toBe(MEDIA_VIDEO_URL_TTL_SECONDS / 2);
  });
});

// Video is the largest object we hand out.
describe('video URLs', () => {
  it('are left unanchored, so they stay short-lived and unshareable', () => {
    const policy = mediaUrlPolicy('gameplay.mp4');

    expect(policy.anchorSeconds).toBe(0);
    expect(policy.ttlSeconds).toBe(MEDIA_VIDEO_URL_TTL_SECONDS);
  });

  it('mint a fresh URL for each viewer', async () => {
    let clock = NOW;
    const signer = createMediaUrlSigner({
      now: () => clock,
      store: {
        objectExists: async () => true,
        signReadUrl: async (name: string, ttl?: number, signedAtMs?: number) => `url:${name}:${signedAtMs ?? clock}`,
      },
    });
    const plan = mediaRedirectPlan('gameplay.mp4', clock);
    const first = await signer.urlFor('m/gameplay.mp4', plan.ttlSeconds, plan.signedAtMs);
    clock += (plan.ttlSeconds * 1000) / 2 + 1_000;

    expect(await signer.urlFor('m/gameplay.mp4', plan.ttlSeconds, plan.signedAtMs)).not.toBe(first);
  });
});

describe('how long the redirect may be cached', () => {
  it('expires exactly when the anchor rolls, not a second later', () => {
    const anchor = MEDIA_URL_ANCHOR_SECONDS;
    const start = anchorStart(NOW, anchor);

    expect(mediaRedirectMaxAgeSeconds('opening.png', start)).toBe(anchor);
    expect(mediaRedirectMaxAgeSeconds('opening.png', start + (anchor - 30) * 1000)).toBe(30);
  });

  // A cached redirect outliving its URL would 403 for everyone holding it.
  it('never outlives the URL it carries', () => {
    for (const filename of ['opening.png', 'gameplay.mp4']) {
      const policy = mediaUrlPolicy(filename);
      expect(mediaRedirectMaxAgeSeconds(filename, NOW)).toBeLessThanOrEqual(policy.ttlSeconds);
    }
  });

  it('keeps video on its half-life, which anchoring does not touch', () => {
    expect(mediaRedirectMaxAgeSeconds('gameplay.mp4', NOW)).toBe(MEDIA_VIDEO_URL_TTL_SECONDS / 2);
  });
});
