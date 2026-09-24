import { describe, expect, it } from 'vitest';
import { buildApp } from '../platform/app.js';
import type { ZoneSchema } from '@gamedevpl/zone-core';

const schema: ZoneSchema = {
  tickHz: 10,
  maxPlayers: 4,
  inputs: [{ k: 'fire', type: 'none' }],
};

describe('paused Biplane zone', () => {
  it('refuses Biplane admission and keeps other zones available', async () => {
    const app = await buildApp({
      zoneRoutes: {
        zones: { getSchema: async () => schema },
        hostUrl: 'https://gamedev-world.example.run.app',
      },
    });

    const biplane = await app.inject({ method: 'POST', url: '/api/games/biplane-skirmish/zone/ticket' });
    expect(biplane.statusCode).toBe(404);
    const other = await app.inject({ method: 'POST', url: '/api/games/ember-watch/zone/ticket' });
    expect(other.statusCode).toBe(200);
    await app.close();
  });
});
