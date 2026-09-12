import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { mediaFilename, registerServingBrake } from './serving-brake.js';

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
