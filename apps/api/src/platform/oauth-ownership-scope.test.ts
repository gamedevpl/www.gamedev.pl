import { describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { consentHtml } from './oauth-consent.js';
import { advertisedOAuthScopes, parseOAuthScopes } from './oauth-scopes.js';
import { enableCliSurface, mintCreatorTokens, buildOAuthApp } from './oauth-cli-test-app.js';
import { InMemoryStore } from './store.js';

describe('ownership OAuth scope', () => {
  it('is advertised and opt-in', () => {
    expect(advertisedOAuthScopes({} as NodeJS.ProcessEnv)).toEqual(['mcp', 'ownership']);
    expect(advertisedOAuthScopes({ CLI_SURFACE: 'true' } as NodeJS.ProcessEnv)).toEqual([
      'mcp',
      'creator',
      'ownership',
    ]);
    expect(parseOAuthScopes(undefined)).toEqual(['mcp']);
    expect(parseOAuthScopes('mcp ownership')).toEqual(['mcp', 'ownership']);
    expect(parseOAuthScopes('ownership')).toEqual(['ownership']);
  });

  it('keeps distinct consent copy', () => {
    const mcp = consentHtml({
      lang: 'en',
      redirectUri: 'http://127.0.0.1/callback',
      clientId: 'agent',
      codeChallenge: 'abc',
      scope: 'mcp',
      consentToken: 'tok',
    });
    const both = consentHtml({
      lang: 'en',
      redirectUri: 'http://127.0.0.1/callback',
      clientId: 'agent',
      codeChallenge: 'abc',
      scope: 'mcp ownership',
      consentToken: 'tok',
    });
    expect(mcp).not.toContain('Prepare a transfer proposal');
    expect(both).toContain('Prepare a transfer proposal');
    expect(both).toContain('Choose a recipient, or accept, reject or complete a transfer');
  });

  it('does not add ownership unless the new consent names it', async () => {
    const restore = enableCliSurface();
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:boss' });
    let app: FastifyInstance | undefined;
    try {
      app = await buildOAuthApp(store);
      const first = await mintCreatorTokens(app, { uid: 'g:boss', device: 'box', scope: 'mcp' });
      expect(first.scope).toBe('mcp');
      const second = await mintCreatorTokens(app, { uid: 'g:boss', device: 'box', scope: 'mcp ownership' });
      expect(second.scope).toBe('mcp ownership');
      const dropped = await mintCreatorTokens(app, { uid: 'g:boss', device: 'box', scope: 'mcp' });
      expect(dropped.scope).toBe('mcp');
      expect((await store.listOAuthGrantsByOwner('g:boss'))[0]?.scope).toBe('mcp');
    } finally {
      restore();
      if (app) await app.close();
    }
  });
});
