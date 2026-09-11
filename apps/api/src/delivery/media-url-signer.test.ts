import { describe, expect, it } from 'vitest';
import { createMediaUrlSigner, createMediaUrlSignerFromEnv, MEDIA_URL_TTL_SECONDS } from './media-url-signer.js';

const NOW = Date.parse('2026-09-11T08:30:00.000Z');

function signerWithCounter(now: () => number) {
  let signatures = 0;
  const signer = createMediaUrlSigner({
    now,
    ttlSeconds: MEDIA_URL_TTL_SECONDS,
    store: {
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

  // Past halfway a handed-out URL could expire mid-download, so the next caller gets a
  // fresh one rather than the tail of an old one.
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
      store: { signReadUrl: async (name: string) => `url:${name}:${clock}` },
    });
    await signer.urlFor('a');
    await signer.urlFor('b');
    await signer.urlFor('c');
    clock += 1;

    // 'a' was evicted when 'c' arrived, so it is signed again at the new clock.
    expect(await signer.urlFor('a')).toBe(`url:a:${clock}`);
    expect(await signer.urlFor('c')).toBe(`url:c:${NOW}`);
  });
});

describe('environment wiring', () => {
  const full = { SERVE_MEDIA_FROM_GCS: 'true', GAMES_SNAPSHOT_BUCKET: 'gamedevpl-games-snapshots' };

  it('builds a signer only when asked and configured', () => {
    expect(createMediaUrlSignerFromEnv(full)).not.toBeNull();
  });

  it('stays off by default and for every half-configuration', () => {
    expect(createMediaUrlSignerFromEnv({})).toBeNull();
    expect(createMediaUrlSignerFromEnv({ ...full, SERVE_MEDIA_FROM_GCS: undefined })).toBeNull();
    expect(createMediaUrlSignerFromEnv({ ...full, SERVE_MEDIA_FROM_GCS: 'false' })).toBeNull();
    expect(createMediaUrlSignerFromEnv({ ...full, SERVE_MEDIA_FROM_GCS: 'TRUE' })).toBeNull();
    expect(createMediaUrlSignerFromEnv({ ...full, GAMES_SNAPSHOT_BUCKET: '  ' })).toBeNull();
  });
});
