import { describe, expect, it } from 'vitest';
import { applyLocalDevOrigin, LOCAL_DEV_ORIGIN } from './dev-origin.js';

describe('applyLocalDevOrigin', () => {
  it('points an unconfigured dev server at the local origin', () => {
    const env: NodeJS.ProcessEnv = { NODE_ENV: 'development' };
    applyLocalDevOrigin(env);
    expect(env.APP_BASE_URL).toBe(LOCAL_DEV_ORIGIN);
  });

  it('leaves production and any configured origin alone', () => {
    const production: NodeJS.ProcessEnv = { NODE_ENV: 'production' };
    const canonical: NodeJS.ProcessEnv = { CANONICAL_HOST: 'www.gamedev.pl' };
    const appBase: NodeJS.ProcessEnv = { APP_BASE_URL: 'http://localhost:4000' };
    for (const env of [production, canonical, appBase]) applyLocalDevOrigin(env);
    expect(production.APP_BASE_URL).toBeUndefined();
    expect(canonical.APP_BASE_URL).toBeUndefined();
    expect(appBase.APP_BASE_URL).toBe('http://localhost:4000');
  });
});
