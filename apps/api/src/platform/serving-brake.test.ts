import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { isLeanEnough, mediaFilename, registerServingBrake } from './serving-brake.js';

// Echoes the width, so a rewrite is observable.
async function appWith(rungs: { video?: boolean; lean?: boolean }): Promise<FastifyInstance> {
  const app = Fastify();
  registerServingBrake(app, {
    controls: {
      async refusesVideo() {
        return rungs.video === true;
      },
      async servesLeanMedia() {
        return rungs.lean === true;
      },
    },
  });
  app.get('/api/games/:slug/media/:filename', async (request) => ({
    width: (request.query as { w?: string }).w ?? null,
  }));
  app.get('/api/catalog', async () => ({ ok: true }));
  // Snapshot lane: the object names its baked width.
  app.get('/api/redirects/:slug/media/:filename', async (_request, reply) =>
    reply.redirect('https://storage.googleapis.com/bucket/media/a/w96/shot.png', 302),
  );
  // Store lane: no variant directory at all.
  app.get('/api/games/store/media/big.png', async (_request, reply) =>
    reply.redirect('https://storage.googleapis.com/bucket/store/a/1/media/big.png', 302),
  );
  app.get('/api/games/inline/media/big.png', async (_request, reply) =>
    // Mirrors sendMedia, which sets these for the bytes it meant to send.
    reply
      .type('image/png')
      .header('content-length', String(120 * 1024))
      .header('etag', '"abc"')
      .send(Buffer.alloc(120 * 1024, 3)),
  );
  app.get('/api/games/inline/media/small.png', async (_request, reply) =>
    reply.type('image/png').send(Buffer.alloc(6 * 1024, 3)),
  );
  await app.ready();
  return app;
}

describe('mediaFilename', () => {
  it('names the file a media request is for', () => {
    expect(mediaFilename('/api/games/apex-sprint/media/launch.png?w=320')).toBe('launch.png');
    expect(mediaFilename('/api/games/apex-sprint/media/gameplay.mp4')).toBe('gameplay.mp4');
  });

  it('is null for everything else', () => {
    expect(mediaFilename('/api/catalog')).toBeNull();
    expect(mediaFilename('/api/games/apex-sprint')).toBeNull();
    // The prefix alone must not match.
    expect(mediaFilename('/api/games/apex-sprint/media/')).toBeNull();
  });
});

describe('serving brake', () => {
  it('changes nothing while no rung is pulled', async () => {
    const app = await appWith({});
    const png = await app.inject({ method: 'GET', url: '/api/games/a/media/launch.png?w=320' });
    expect(png.statusCode).toBe(200);
    expect(png.json()).toEqual({ width: '320' });

    const mp4 = await app.inject({ method: 'GET', url: '/api/games/a/media/gameplay.mp4' });
    expect(mp4.statusCode).toBe(200);
    await app.close();
  });

  it('refuses video with a 503 that says why', async () => {
    const app = await appWith({ video: true });
    const response = await app.inject({ method: 'GET', url: '/api/games/a/media/gameplay.mp4' });
    expect(response.statusCode).toBe(503);
    expect(response.json().error).toBe('video_paused');
    // Cached, the rung would outlive the incident that pulled it.
    expect(response.headers['cache-control']).toBe('no-store');
    await app.close();
  });

  it('leaves images alone when only video is paused', async () => {
    const app = await appWith({ video: true });
    const response = await app.inject({ method: 'GET', url: '/api/games/a/media/launch.png?w=320' });
    expect(response.json()).toEqual({ width: '320' });
    await app.close();
  });

  it('narrows every image to the width every game has baked', async () => {
    const app = await appWith({ lean: true });
    const asked = await app.inject({ method: 'GET', url: '/api/games/a/media/launch.png?w=1280' });
    expect(asked.json()).toEqual({ width: '96' });

    // A caller that asked for none gets it too.
    const unasked = await app.inject({ method: 'GET', url: '/api/games/a/media/launch.png' });
    expect(unasked.json()).toEqual({ width: '96' });
    await app.close();
  });

  it('serves video normally while only images are lean', async () => {
    const app = await appWith({ lean: true });
    const response = await app.inject({ method: 'GET', url: '/api/games/a/media/gameplay.mp4' });
    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it('does not touch routes that are not media', async () => {
    const app = await appWith({ video: true, lean: true });
    const response = await app.inject({ method: 'GET', url: '/api/catalog' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    await app.close();
  });
});

describe('isLeanEnough', () => {
  it('trusts a redirect only when the object names the lean width', () => {
    expect(isLeanEnough('https://x/media/a/w96/shot.png', 0)).toBe(true);
    expect(isLeanEnough('https://x/media/a/shot.png', 0)).toBe(false);
    expect(isLeanEnough('https://x/store/a/1/media/shot.png', 0)).toBe(false);
  });

  it('judges bytes by their size when there is no redirect', () => {
    expect(isLeanEnough(undefined, 6 * 1024)).toBe(true);
    expect(isLeanEnough(undefined, 120 * 1024)).toBe(false);
  });
});

describe('lean media reaches every lane', () => {
  it('lets through a redirect to the baked variant', async () => {
    const app = await appWith({ lean: true });
    const res = await app.inject({ method: 'GET', url: '/api/games/a/media/shot.png' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('refuses a store-lane redirect, which ignores the width entirely', async () => {
    const app = await appWith({ lean: true });
    const res = await app.inject({ method: 'GET', url: '/api/games/store/media/big.png' });
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe('media_lean');
    expect(res.headers['location']).toBeUndefined();
    await app.close();
  });

  it('refuses full-size bytes served inline', async () => {
    const app = await appWith({ lean: true });
    const res = await app.inject({ method: 'GET', url: '/api/games/inline/media/big.png' });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('serves small bytes inline without complaint', async () => {
    const app = await appWith({ lean: true });
    const res = await app.inject({ method: 'GET', url: '/api/games/inline/media/small.png' });
    expect(res.statusCode).toBe(200);
    expect(res.rawPayload.length).toBe(6 * 1024);
    await app.close();
  });

  it('touches none of it while the rung is clear', async () => {
    const app = await appWith({});
    expect((await app.inject({ method: 'GET', url: '/api/games/store/media/big.png' })).statusCode).toBe(302);
    expect((await app.inject({ method: 'GET', url: '/api/games/inline/media/big.png' })).statusCode).toBe(200);
    await app.close();
  });

  it('describes the body it actually sends, not the one it replaced', async () => {
    const app = await appWith({ lean: true });
    const res = await app.inject({ method: 'GET', url: '/api/games/inline/media/big.png' });
    expect(Number(res.headers['content-length'])).toBe(res.rawPayload.length);
    expect(res.headers['etag']).toBeUndefined();
    await app.close();
  });
});
