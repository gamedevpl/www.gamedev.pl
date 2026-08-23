import { describe, expect, it, vi } from 'vitest';
import {
  catalogObject,
  createGcsSnapshotStore,
  createSnapshotReaderFromEnv,
  gameObject,
  generateSnapshotId,
  mediaContentType,
  mediaObject,
  POINTER_OBJECT,
  SnapshotUnavailableError,
  type SnapshotPointer,
} from './game-snapshot.js';

const bucket = 'gamedev-snapshots';

function pointer(overrides: Partial<SnapshotPointer> = {}): SnapshotPointer {
  return {
    snapshotId: '20260727T101500Z-abcd',
    commitSha: 'deadbeef',
    publishedAt: '2026-07-27T10:15:00.000Z',
    gameCount: 2,
    ...overrides,
  };
}

interface FakeCall {
  method: string;
  name: string;
  cacheControl?: string;
  contentType?: string;
  body?: Buffer;
}

/**
 * Fakes Cloud Storage at the `fetch` boundary — the same seam local-games-repo.ts
 * uses for GitHub, so there is no second client implementation to keep honest.
 */
function createFakeStorage(objects: Record<string, { body: Buffer; contentType?: string }> = {}) {
  const calls: FakeCall[] = [];
  const store = new Map(Object.entries(objects));

  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const headers = (init?.headers ?? {}) as Record<string, string>;

    if (url.pathname.startsWith('/upload/')) {
      const name = url.searchParams.get('name') ?? '';
      const body = Buffer.from(init?.body as Uint8Array);
      calls.push({
        method: 'PUT',
        name,
        cacheControl: headers['cache-control'],
        contentType: headers['content-type'],
        body,
      });
      store.set(name, { body, contentType: headers['content-type'] });
      return new Response('{}', { status: 200 });
    }

    // Read: /storage/v1/b/<bucket>/o/<encoded name>
    const name = decodeURIComponent(url.pathname.split('/o/')[1] ?? '');
    calls.push({ method: 'GET', name });
    const found = store.get(name);
    if (!found) return new Response('Not Found', { status: 404 });
    return new Response(found.body, { status: 200 });
  });

  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls, store, raw: fetchImpl };
}

function createStore(fake: ReturnType<typeof createFakeStorage>, now = () => 1_000) {
  return createGcsSnapshotStore({
    bucket,
    fetchImpl: fake.fetchImpl,
    getAccessToken: async () => 'fake-token',
    now,
  });
}

describe('snapshot object layout', () => {
  it('addresses every object under an immutable per-snapshot prefix', () => {
    expect(catalogObject('snap1')).toBe('snapshots/snap1/catalog.json');
    expect(gameObject('snap1', 'bubble-pop')).toBe('snapshots/snap1/games/bubble-pop.json');
    expect(mediaObject('snap1', 'bubble-pop', 'opening.png')).toBe('snapshots/snap1/media/bubble-pop/opening.png');
    // The pointer is the only mutable object, and it lives outside the prefixes.
    expect(POINTER_OBJECT).toBe('current.json');
  });

  it('derives media content types from the extension', () => {
    expect(mediaContentType('opening.png')).toBe('image/png');
    expect(mediaContentType('gameplay.mp4')).toBe('video/mp4');
  });

  it('generates ids that sort in publish order', () => {
    const first = generateSnapshotId(new Date('2026-07-27T10:15:00.000Z'), () => 0.1);
    const second = generateSnapshotId(new Date('2026-07-27T11:15:00.000Z'), () => 0.1);
    expect(first).toMatch(/^\d{8}T\d{6}Z-[0-9a-f]{4}$/);
    expect([second, first].sort()).toEqual([first, second]);
  });

  it('gives two publishes in the same second distinct ids', () => {
    const at = new Date('2026-07-27T10:15:00.000Z');
    expect(generateSnapshotId(at, () => 0.1)).not.toBe(generateSnapshotId(at, () => 0.9));
  });
});

describe('snapshot reads', () => {
  it('resolves the catalog through the pointer', async () => {
    const fake = createFakeStorage({
      [POINTER_OBJECT]: { body: Buffer.from(JSON.stringify(pointer())) },
      [catalogObject(pointer().snapshotId)]: { body: Buffer.from(JSON.stringify([{ slug: 'bubble-pop' }])) },
    });

    const catalog = await createStore(fake).getCatalog();

    expect(catalog).toEqual([{ slug: 'bubble-pop' }]);
  });

  it('returns null when no snapshot has been published yet', async () => {
    const fake = createFakeStorage();
    const store = createStore(fake);

    expect(await store.getPointer()).toBeNull();
    expect(await store.getCatalog()).toBeNull();
    expect(await store.getGame('bubble-pop')).toBeNull();
    expect(await store.getMedia('bubble-pop', 'opening.png')).toBeNull();
  });

  it('returns null for a game that is not in the snapshot, so serving can fall back', async () => {
    const fake = createFakeStorage({ [POINTER_OBJECT]: { body: Buffer.from(JSON.stringify(pointer())) } });

    expect(await createStore(fake).getGame('never-baked')).toBeNull();
  });

  it('reads media bytes with a content type derived from the filename', async () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const fake = createFakeStorage({
      [POINTER_OBJECT]: { body: Buffer.from(JSON.stringify(pointer())) },
      [mediaObject(pointer().snapshotId, 'bubble-pop', 'opening.png')]: { body: bytes },
    });

    const media = await createStore(fake).getMedia('bubble-pop', 'opening.png');

    expect(media?.contentType).toBe('image/png');
    expect(media?.body.equals(bytes)).toBe(true);
  });

  it('throws on transport failure rather than reporting a miss', async () => {
    const fake = createFakeStorage();
    fake.raw.mockResolvedValueOnce(new Response('nope', { status: 500 }));

    // A 500 must not look like "not published" — serving tells the two apart to
    // decide between 503 (snapshot unreachable) and 404 / 502 (miss / incomplete).
    await expect(createStore(fake).getPointer()).rejects.toThrow(/500/);
  });

  it('rejects slugs and filenames that could escape the snapshot prefix', async () => {
    const store = createStore(createFakeStorage());

    await expect(store.getGame('../../etc/passwd')).rejects.toThrow(/unsafe slug/);
    await expect(store.getMedia('bubble-pop', '../secret.png')).rejects.toThrow(/unsafe media filename/);
    await expect(store.getMedia('bubble-pop', 'opening.svg')).rejects.toThrow(/unsafe media filename/);
  });
});

describe('pointer caching', () => {
  it('reads the pointer once for a burst of lookups', async () => {
    const fake = createFakeStorage({
      [POINTER_OBJECT]: { body: Buffer.from(JSON.stringify(pointer())) },
      [gameObject(pointer().snapshotId, 'a')]: { body: Buffer.from(JSON.stringify({ slug: 'a' })) },
      [gameObject(pointer().snapshotId, 'b')]: { body: Buffer.from(JSON.stringify({ slug: 'b' })) },
    });
    const store = createStore(fake);

    // A cold instance takes a page load's worth of requests at once; they all
    // need the same pointer and must coalesce into one read.
    await Promise.all([store.getGame('a'), store.getGame('b'), store.getPointer()]);

    expect(fake.calls.filter((call) => call.name === POINTER_OBJECT)).toHaveLength(1);
  });

  it('re-reads the pointer once its TTL lapses', async () => {
    const fake = createFakeStorage({ [POINTER_OBJECT]: { body: Buffer.from(JSON.stringify(pointer())) } });
    let clock = 1_000;
    const store = createGcsSnapshotStore({
      bucket,
      fetchImpl: fake.fetchImpl,
      getAccessToken: async () => 'fake-token',
      pointerTtlMs: 60_000,
      now: () => clock,
    });

    await store.getPointer();
    clock += 61_000;
    await store.getPointer();

    expect(fake.calls.filter((call) => call.name === POINTER_OBJECT)).toHaveLength(2);
  });

  it('keeps serving the last known pointer when a refresh fails', async () => {
    const fake = createFakeStorage({ [POINTER_OBJECT]: { body: Buffer.from(JSON.stringify(pointer())) } });
    let clock = 1_000;
    const store = createGcsSnapshotStore({
      bucket,
      fetchImpl: fake.fetchImpl,
      getAccessToken: async () => 'fake-token',
      pointerTtlMs: 60_000,
      now: () => clock,
    });

    await store.getPointer();
    clock += 61_000;
    fake.raw.mockResolvedValueOnce(new Response('boom', { status: 503 }));

    // Snapshot prefixes are immutable, so a stale pointer still serves correct
    // games — briefly-old beats an outage.
    expect(await store.getPointer()).toEqual(pointer());
  });
});

describe('read deadline', () => {
  it('gives up on a hung read instead of stalling the play route', async () => {
    const fake = createFakeStorage();
    // A socket that accepted the request and will never answer. There is no GitHub
    // fallback behind published play any more, so without a deadline this is an
    // indefinite wait rather than a degraded response.
    fake.raw.mockImplementationOnce(() => new Promise<Response>(() => {}));
    const store = createGcsSnapshotStore({
      bucket,
      fetchImpl: fake.fetchImpl,
      getAccessToken: async () => 'fake-token',
      readTimeoutMs: 30,
    });

    const startedAt = Date.now();
    // SnapshotUnavailableError is what a transport failure already raises, so serving
    // maps a hang to the same fast 503 rather than to a new code path.
    await expect(store.getPointer()).rejects.toThrow(SnapshotUnavailableError);
    expect(Date.now() - startedAt).toBeLessThan(2_000);
  });

  it('lets a slow-but-answering read finish', async () => {
    const fake = createFakeStorage({ [POINTER_OBJECT]: { body: Buffer.from(JSON.stringify(pointer())) } });
    const inner = fake.raw.getMockImplementation()!;
    fake.raw.mockImplementationOnce(async (...args) => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return inner(...args);
    });
    const store = createGcsSnapshotStore({
      bucket,
      fetchImpl: fake.fetchImpl,
      getAccessToken: async () => 'fake-token',
      readTimeoutMs: 2_000,
    });

    expect(await store.getPointer()).toEqual(pointer());
  });

  it('serves the last known pointer when a re-read hangs', async () => {
    const fake = createFakeStorage({ [POINTER_OBJECT]: { body: Buffer.from(JSON.stringify(pointer())) } });
    let clock = 1_000;
    const store = createGcsSnapshotStore({
      bucket,
      fetchImpl: fake.fetchImpl,
      getAccessToken: async () => 'fake-token',
      pointerTtlMs: 60_000,
      readTimeoutMs: 30,
      now: () => clock,
    });

    await store.getPointer();
    clock += 61_000;
    fake.raw.mockImplementationOnce(() => new Promise<Response>(() => {}));

    // A timeout has to count as an error, not as a fresh answer, or the stale-pointer
    // branch would be skipped and the hang would propagate to the visitor.
    expect(await store.getPointer()).toEqual(pointer());
  });
});

describe('snapshot writes', () => {
  it('marks snapshot objects immutable and the pointer uncacheable', async () => {
    const fake = createFakeStorage();
    const store = createStore(fake);

    await store.putGame('snap1', { slug: 'bubble-pop', title: 'Bubble Pop', html: '<!doctype html>' });
    await store.putPointer(pointer({ snapshotId: 'snap1' }));

    const gameWrite = fake.calls.find((call) => call.name === gameObject('snap1', 'bubble-pop'));
    const pointerWrite = fake.calls.find((call) => call.name === POINTER_OBJECT);
    // This is what makes putting a CDN in front a config change rather than a redesign.
    expect(gameWrite?.cacheControl).toBe('public, max-age=31536000, immutable');
    // A cached pointer would make a publish take an unbounded time to become visible.
    expect(pointerWrite?.cacheControl).toBe('no-cache');
  });

  it('round-trips a written game', async () => {
    const fake = createFakeStorage();
    const store = createStore(fake);
    const game = { slug: 'bubble-pop', title: 'Bubble Pop', html: '<!doctype html><p>hi</p>' };

    await store.putGame('snap1', game);
    await store.putPointer(pointer({ snapshotId: 'snap1' }));

    expect(await store.getGame('bubble-pop')).toEqual(game);
  });

  it('refuses to write outside a well-formed snapshot prefix', async () => {
    const store = createStore(createFakeStorage());

    await expect(store.putGame('../evil', { slug: 'a', title: 'a', html: 'x' })).rejects.toThrow(/unsafe snapshot id/);
    await expect(store.putGame('snap1', { slug: '../evil', title: 'a', html: 'x' })).rejects.toThrow(/unsafe slug/);
  });
});

describe('createSnapshotReaderFromEnv', () => {
  it('is null without a bucket, so local dev and tests keep the GitHub path', () => {
    expect(createSnapshotReaderFromEnv({})).toBeNull();
    expect(createSnapshotReaderFromEnv({ GAMES_SNAPSHOT_BUCKET: '  ' })).toBeNull();
  });

  it('builds a reader when a bucket is configured', () => {
    expect(createSnapshotReaderFromEnv({ GAMES_SNAPSHOT_BUCKET: bucket })).not.toBeNull();
  });
});
