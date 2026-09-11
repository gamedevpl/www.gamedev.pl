import { describe, expect, it } from 'vitest';
import {
  createMediaUrlSigner,
  createMediaUrlSignerFromEnv,
  createStoreMediaUrlSignerFromEnv,
  MEDIA_URL_TTL_SECONDS,
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
