import { describe, it, expect } from 'vitest';
import { buildServer } from './index.js';

describe('GET /api/version', () => {
  it('returns name and version', async () => {
    const fastify = buildServer();

    const response = await fastify.inject({
      method: 'GET',
      url: '/api/version',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ name: 'gamedev-pl', version: '0.0.0' });

    await fastify.close();
  });
});
