import type { GameGenerator, GameProject } from '@gamedevpl/game-generator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
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
    expect(res.json()).toMatchObject({ name: 'gamedev-pl', version: '0.0.0' });
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

  describe('async jobs', () => {
    it('accepts a submission with 202 and reports it back', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/jobs', payload: { prompt: 'dodge rocks' } });
      expect(res.statusCode).toBe(202);
      const { id, state } = res.json();
      expect(id).toBeTruthy();
      expect(['queued', 'provisioning', 'running']).toContain(state);

      const status = await app.inject({ method: 'GET', url: `/api/jobs/${id}` });
      expect(status.statusCode).toBe(200);
      expect(status.json().id).toBe(id);
    });

    it('delivers the assembled game once the job succeeds', async () => {
      const submitted = await app.inject({ method: 'POST', url: '/api/jobs', payload: { prompt: 'collect coins' } });
      const { id } = submitted.json();

      // Poll rather than reach into orchestrator internals, the way a client does.
      let body: Record<string, unknown> = {};
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const res = await app.inject({ method: 'GET', url: `/api/jobs/${id}` });
        body = res.json();
        if (body.state === 'succeeded' || body.state === 'failed') break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      expect(body.state).toBe('succeeded');
      expect(body.html).toContain('<!doctype html>');
      expect(body.html).not.toContain('__TITLE__');
    });

    it('rejects an empty prompt with 400', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/jobs', payload: { prompt: '  ' } });
      expect(res.statusCode).toBe(400);
    });

    it('returns 404 for an unknown job', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/jobs/does-not-exist' });
      expect(res.statusCode).toBe(404);
    });

    it('GET /api/jobs returns an array of recent jobs', async () => {
      const submitted = await app.inject({ method: 'POST', url: '/api/jobs', payload: { prompt: 'recent test game' } });
      const { id } = submitted.json();

      const list = await app.inject({ method: 'GET', url: '/api/jobs' });
      expect(list.statusCode).toBe(200);
      const body = list.json() as Array<{ id: string; state: string; createdAt: string; title?: string }>;
      expect(Array.isArray(body)).toBe(true);
      const entry = body.find((j) => j.id === id);
      expect(entry).toBeDefined();
      expect(entry?.createdAt).toBeTruthy();
    });

    it('GET /api/jobs respects the limit query param', async () => {
      const list = await app.inject({ method: 'GET', url: '/api/jobs?limit=1' });
      expect(list.statusCode).toBe(200);
      const body = list.json() as unknown[];
      expect(body.length).toBeLessThanOrEqual(1);
    });

    it('GET /api/jobs includes title only for succeeded jobs', async () => {
      const isolated = await buildApp();
      const submitted = await isolated.inject({ method: 'POST', url: '/api/jobs', payload: { prompt: 'title check' } });
      const { id } = submitted.json();

      // Wait for the job to succeed.
      let body: Record<string, unknown>[] = [];
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const res = await isolated.inject({ method: 'GET', url: '/api/jobs' });
        body = res.json() as Record<string, unknown>[];
        const entry = body.find((j) => j.id === id);
        if (entry?.state === 'succeeded' || entry?.state === 'failed') break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      const entry = body.find((j) => j.id === id);
      expect(entry?.state).toBe('succeeded');
      expect(typeof entry?.title).toBe('string');
      await isolated.close();
    });

    it('surfaces a failed generation as a failed job', async () => {
      const failing = await buildApp({
        generator: {
          name: 'failing',
          generate: async () => {
            throw new Error('agent exploded');
          },
        },
      });
      const submitted = await failing.inject({ method: 'POST', url: '/api/jobs', payload: { prompt: 'boom' } });
      const { id } = submitted.json();

      let body: Record<string, unknown> = {};
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const res = await failing.inject({ method: 'GET', url: `/api/jobs/${id}` });
        body = res.json();
        if (body.state === 'succeeded' || body.state === 'failed') break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      expect(body.state).toBe('failed');
      expect(body.error).toBe('agent exploded');
      await failing.close();
    });
  });
});
