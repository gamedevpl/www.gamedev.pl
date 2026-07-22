import type { GameGenerator, GameProject } from '@gamedevpl/game-generator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import packageJson from '../../../package.json';
import { buildApp } from './app.js';
import { MAX_PROJECT_BYTES } from './assemble.js';

function stubGenerator(project: Partial<GameProject>): GameGenerator {
  return {
    name: 'stub',
    generate: async () => ({
      title: 'Stub',
      description: '',
      html: '<canvas></canvas>',
      js: 'const x = 1;',
      css: 'body{}',
      ...project,
    }),
  };
}

describe('api', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns version info', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/version' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ name: packageJson.name, version: packageJson.version });
  });

  it('reports health with the active provider', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok', provider: 'mock' });
  });

  it('returns a self-contained playable HTML document for a prompt', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/generate-game',
      payload: { prompt: 'collect coins in space' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.title).toBeTruthy();
    expect(body.html).toContain('<!doctype html>');
    expect(body.html).toContain('<script>');
    expect(body.html).toContain('<style>');
    expect(body.html).not.toContain('__TITLE__');
  });

  it('rejects an empty prompt with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/generate-game',
      payload: { prompt: '   ' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 502 when the generated project exceeds the size cap', async () => {
    const oversized = await buildApp({ generator: stubGenerator({ js: 'x'.repeat(MAX_PROJECT_BYTES + 1) }) });
    const res = await oversized.inject({
      method: 'POST',
      url: '/api/generate-game',
      payload: { prompt: 'huge game' },
    });
    expect(res.statusCode).toBe(502);
    await oversized.close();
  });

  it('returns 502 when the generated project is empty', async () => {
    const empty = await buildApp({ generator: stubGenerator({ html: '', js: '' }) });
    const res = await empty.inject({
      method: 'POST',
      url: '/api/generate-game',
      payload: { prompt: 'empty game' },
    });
    expect(res.statusCode).toBe(502);
    await empty.close();
  });

  it('returns non-2xx and redacts response details when generated code contains credential-like strings', async () => {
    const fakeKey = `sk-ant-${'A'.repeat(40)}`;
    const leaky = await buildApp({ generator: stubGenerator({ js: `const apiKey = "${fakeKey}";` }) });
    const res = await leaky.inject({
      method: 'POST',
      url: '/api/generate-game',
      payload: { prompt: 'leaky game' },
    });
    expect(res.statusCode).toBe(502);
    expect(res.body).not.toContain(fakeKey);
    await leaky.close();
  });
});
