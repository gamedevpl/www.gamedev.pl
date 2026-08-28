import { describe, expect, it } from 'vitest';
import { completeSlash, parseArgv } from './argv.js';
import { authorizeUrl, GAMEDEV_CLI_CLIENT_ID } from './oauth.js';

describe('argv and slash completion', () => {
  it('parses verbs, flags, and json mode', () => {
    expect(parseArgv(['node', 'gamedev', 'status', 'ghost-roads', '--json', '--watch'])).toEqual({
      verb: 'status',
      args: ['ghost-roads'],
      flags: { json: true, watch: true },
    });
    expect(parseArgv(['node', 'gamedev'])).toMatchObject({ verb: 'repl' });
    expect(completeSlash('/sta')).toEqual(['status']);
    expect(completeSlash('/')).toContain('games');
  });
});

describe('oauth authorize url', () => {
  it('requests creator scope on the first-party client', () => {
    const url = authorizeUrl({
      origin: 'https://www.gamedev.pl',
      redirectUri: 'http://127.0.0.1:43721/callback',
      challenge: 'abc',
      state: 'xyz',
      device: 'studio-mac',
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get('client_id')).toBe(GAMEDEV_CLI_CLIENT_ID);
    expect(parsed.searchParams.get('scope')).toBe('creator');
    expect(parsed.searchParams.get('code_challenge_method')).toBe('S256');
  });
});
