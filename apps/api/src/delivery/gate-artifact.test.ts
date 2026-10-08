import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GATE_ARTIFACT_URL_PATH, gateArtifactContentType, registerGateArtifactRoutes } from './gate-artifact-routes.js';
import { withRemoteVerdicts } from './gate-verdict-client.js';
import { mintGateVerdictToken } from './gate-verdict-token.js';
import type { GamesStore, VersionManifest } from './games-store.js';
import type { GcsObjectStore } from './gcs-sign.js';

const secret = 'gate-artifact-test-secret';

describe('gateArtifactContentType', () => {
  it('lets the acceptance lane write the bundle, a preview, the derived golden and media', () => {
    expect(gateArtifactContentType('gate', 'bundle.html')).toBe('text/html; charset=utf-8');
    expect(gateArtifactContentType('gate', 'preview.html')).toBe('text/html; charset=utf-8');
    expect(gateArtifactContentType('gate', 'source/TRACE.json')).toBe('text/plain; charset=utf-8');
    expect(gateArtifactContentType('gate', 'media/shot-01.png')).toBe('image/png');
    expect(gateArtifactContentType('gate', 'media/run.mp4')).toBe('video/mp4');
    expect(gateArtifactContentType('gate', 'media/metadata.json')).toBe('application/json');
  });

  it('never lets the preview lane write the publish seal or the golden', () => {
    expect(gateArtifactContentType('preview', 'preview.html')).not.toBeNull();
    expect(gateArtifactContentType('preview', 'media/shot.png')).not.toBeNull();
    expect(gateArtifactContentType('preview', 'bundle.html')).toBeNull();
    expect(gateArtifactContentType('preview', 'source/TRACE.json')).toBeNull();
  });

  it('gives the health lane nothing', () => {
    expect(gateArtifactContentType('health', 'preview.html')).toBeNull();
    expect(gateArtifactContentType('health', 'media/shot.png')).toBeNull();
  });

  it('refuses names outside the artifact set', () => {
    for (const name of [
      'manifest.json',
      'source/game.ts',
      'media/../manifest.json',
      'media/sub/shot.png',
      'media/.hidden.png',
      'media/shot.html',
      '../other/bundle.html',
    ]) {
      expect(gateArtifactContentType('gate', name), name).toBeNull();
    }
  });
});

describe(`POST ${GATE_ARTIFACT_URL_PATH}`, () => {
  const apps: FastifyInstance[] = [];
  afterEach(async () => {
    while (apps.length) await apps.pop()!.close();
  });

  async function serve(manifest: Partial<VersionManifest> | null = {}) {
    const signUploadUrl = vi.fn(
      async (name: string, contentType: string) => `https://storage.example/${name}?ct=${contentType}`,
    );
    const app = Fastify();
    registerGateArtifactRoutes(app, {
      objectStore: { signUploadUrl } as unknown as GcsObjectStore,
      store: { getManifest: async () => manifest as VersionManifest | null },
      secret,
    });
    await app.ready();
    apps.push(app);
    return { app, signUploadUrl };
  }

  it('signs one object under the version the capability names', async () => {
    const { app, signUploadUrl } = await serve();
    const res = await app.inject({
      method: 'POST',
      url: GATE_ARTIFACT_URL_PATH,
      headers: { authorization: `Bearer ${mintGateVerdictToken('comet-courier', 'v1', secret)}` },
      payload: { slug: 'comet-courier', version: 'v1', name: 'bundle.html' },
    });
    expect(res.statusCode).toBe(200);
    expect(signUploadUrl).toHaveBeenCalledWith(
      'games/comet-courier/versions/v1/bundle.html',
      'text/html; charset=utf-8',
      expect.any(Number),
    );
    expect(res.json().headers).toEqual({
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=31536000, immutable',
    });
  });

  it("refuses another game's version", async () => {
    const { app, signUploadUrl } = await serve();
    const res = await app.inject({
      method: 'POST',
      url: GATE_ARTIFACT_URL_PATH,
      headers: { authorization: `Bearer ${mintGateVerdictToken('comet-courier', 'v1', secret)}` },
      payload: { slug: 'someone-else', version: 'v1', name: 'bundle.html' },
    });
    expect(res.statusCode).toBe(403);
    expect(signUploadUrl).not.toHaveBeenCalled();
  });

  it('refuses once this run has recorded its verdict', async () => {
    const token = mintGateVerdictToken('comet-courier', 'v1', secret);
    const { app, signUploadUrl } = await serve({
      gate: { green: true, ranAt: new Date(Date.now() + 1000).toISOString() },
    });
    const res = await app.inject({
      method: 'POST',
      url: GATE_ARTIFACT_URL_PATH,
      headers: { authorization: `Bearer ${token}` },
      payload: { slug: 'comet-courier', version: 'v1', name: 'bundle.html' },
    });
    expect(res.statusCode).toBe(409);
    expect(signUploadUrl).not.toHaveBeenCalled();
  });

  it('still signs for a re-gate minted after the previous verdict', async () => {
    const { app } = await serve({ gate: { green: true, ranAt: '2026-01-01T00:00:00.000Z' } });
    const res = await app.inject({
      method: 'POST',
      url: GATE_ARTIFACT_URL_PATH,
      headers: { authorization: `Bearer ${mintGateVerdictToken('comet-courier', 'v1', secret)}` },
      payload: { slug: 'comet-courier', version: 'v1', name: 'bundle.html' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('refuses a version that does not exist', async () => {
    const { app } = await serve(null);
    const res = await app.inject({
      method: 'POST',
      url: GATE_ARTIFACT_URL_PATH,
      headers: { authorization: `Bearer ${mintGateVerdictToken('comet-courier', 'v1', secret)}` },
      payload: { slug: 'comet-courier', version: 'v1', name: 'bundle.html' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('refuses a name the lane may not write', async () => {
    const { app } = await serve();
    const res = await app.inject({
      method: 'POST',
      url: GATE_ARTIFACT_URL_PATH,
      headers: { authorization: `Bearer ${mintGateVerdictToken('comet-courier', 'v1', secret, 'preview')}` },
      payload: { slug: 'comet-courier', version: 'v1', name: 'bundle.html' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('refuses without a valid capability', async () => {
    const { app } = await serve();
    const missing = await app.inject({
      method: 'POST',
      url: GATE_ARTIFACT_URL_PATH,
      payload: { slug: 'comet-courier', version: 'v1', name: 'bundle.html' },
    });
    expect(missing.statusCode).toBe(401);
    const forged = await app.inject({
      method: 'POST',
      url: GATE_ARTIFACT_URL_PATH,
      headers: { authorization: `Bearer ${mintGateVerdictToken('comet-courier', 'v1', 'not-the-secret')}` },
      payload: { slug: 'comet-courier', version: 'v1', name: 'bundle.html' },
    });
    expect(forged.statusCode).toBe(401);
  });
});

describe('gate-side artifact writes', () => {
  it('mints a URL, then PUTs the body with exactly the headers it was signed for', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith(GATE_ARTIFACT_URL_PATH)) {
        return Response.json({ url: 'https://storage.example/signed', headers: { 'content-type': 'image/png' } });
      }
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;
    const putDerivedArtifact = vi.fn(async () => {});
    const store = withRemoteVerdicts({ putDerivedArtifact } as unknown as GamesStore, {
      endpoint: 'https://api.example/api/internal/gate-verdict',
      token: 'cap',
      fetchImpl,
    });

    await store.putDerivedArtifact('comet-courier', 'v1', 'media/a.png', Buffer.from('png'), 'image/png');

    expect(calls[0].url).toBe(`https://api.example${GATE_ARTIFACT_URL_PATH}`);
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      slug: 'comet-courier',
      version: 'v1',
      name: 'media/a.png',
    });
    expect((calls[0].init?.headers as Record<string, string>).authorization).toBe('Bearer cap');
    expect(calls[1]).toMatchObject({ url: 'https://storage.example/signed', init: { method: 'PUT' } });
    expect(calls[1].init?.headers).toEqual({ 'content-type': 'image/png' });
    expect(putDerivedArtifact).not.toHaveBeenCalled();
  });

  it('throws when the API refuses to sign', async () => {
    const fetchImpl = vi.fn(async () => new Response('no', { status: 403 })) as unknown as typeof fetch;
    const store = withRemoteVerdicts({} as GamesStore, { endpoint: 'https://api.example/x', token: 't', fetchImpl });
    await expect(store.putDerivedArtifact('a', 'b', 'bundle.html', Buffer.alloc(0), 'text/html')).rejects.toThrow(
      /403/,
    );
  });

  it('falls back to the direct write against an API that predates signed uploads', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 404 })) as unknown as typeof fetch;
    const putDerivedArtifact = vi.fn(async () => {});
    const store = withRemoteVerdicts({ putDerivedArtifact } as unknown as GamesStore, {
      endpoint: 'https://api.example/x',
      token: 't',
      fetchImpl,
    });
    await store.putDerivedArtifact('a', 'b', 'bundle.html', Buffer.alloc(0), 'text/html');
    await store.putDerivedArtifact('a', 'b', 'preview.html', Buffer.alloc(0), 'text/html');
    expect(putDerivedArtifact).toHaveBeenCalledTimes(2);
    // Asked once, then remembered.
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
