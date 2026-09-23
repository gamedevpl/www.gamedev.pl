import { afterEach, expect, it, vi } from 'vitest';
import { buildWorldApp, type WorldAppOptions } from './app.js';

afterEach(() => vi.unstubAllEnvs());

it('requires a zone ticket key even when a session key is present', async () => {
  vi.stubEnv('ZONE_TICKET_SECRET', undefined);
  vi.stubEnv('SESSION_SECRET', 'session-key');
  await expect(buildWorldApp({} as WorldAppOptions)).rejects.toThrow('ZONE_TICKET_SECRET is required');
});
