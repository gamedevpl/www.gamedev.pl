import { afterEach, expect, it, vi } from 'vitest';
import { unsubscribeSecretFromEnv } from './unsubscribe-token.js';

afterEach(() => vi.unstubAllEnvs());

it('prefers the dedicated unsubscribe key and retains the session-key fallback', () => {
  vi.stubEnv('SESSION_SECRET', 'session-key');
  vi.stubEnv('UNSUBSCRIBE_SECRET', undefined);
  expect(unsubscribeSecretFromEnv()).toBe('session-key');
  vi.stubEnv('UNSUBSCRIBE_SECRET', 'unsubscribe-key');
  expect(unsubscribeSecretFromEnv()).toBe('unsubscribe-key');
});
