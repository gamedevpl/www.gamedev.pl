import { describe, expect, it } from 'vitest';
import { parseGameBridgeMessage, parseServerFrame, socketUrlFrom, PROTOCOL_VERSION } from './protocol.js';
import { parsePathRoute } from '../core/router.js';

describe('parseServerFrame', () => {
  it('accepts a well-formed roster', () => {
    const frame = parseServerFrame({
      v: PROTOCOL_VERSION,
      t: 'roster',
      slots: [{ slot: 1, color: '#00e4ac', nick: 'Ada', connected: true }],
    });
    expect(frame).toEqual({
      t: 'roster',
      slots: [{ slot: 1, color: '#00e4ac', nick: 'Ada', connected: true }],
    });
  });

  it('carries both key press and key RELEASE', () => {
    // Regression: the key state used to live in `v`, which every frame also uses
    // for the protocol version — a release (0) overwrote the version and was
    // dropped, so a player would keep running forever.
    const press = parseServerFrame({ v: PROTOCOL_VERSION, t: 'input', slot: 2, k: 'left', d: 1 });
    const release = parseServerFrame({ v: PROTOCOL_VERSION, t: 'input', slot: 2, k: 'left', d: 0 });
    expect(press).toEqual({ t: 'input', slot: 2, k: 'left', d: 1 });
    expect(release).toEqual({ t: 'input', slot: 2, k: 'left', d: 0 });
  });

  it('rejects frames from another protocol version', () => {
    expect(parseServerFrame({ v: 99, t: 'phase', phase: 'playing' })).toBeNull();
  });

  it('rejects unknown types, bad keys, and malformed rosters', () => {
    expect(parseServerFrame({ v: PROTOCOL_VERSION, t: 'exec', cmd: 'rm -rf /' })).toBeNull();
    expect(parseServerFrame({ v: PROTOCOL_VERSION, t: 'input', slot: 1, k: 'launch', d: 1 })).toBeNull();
    expect(parseServerFrame({ v: PROTOCOL_VERSION, t: 'roster', slots: 'everyone' })).toBeNull();
    expect(parseServerFrame(null)).toBeNull();
    expect(parseServerFrame('roster')).toBeNull();
  });

  it('defaults a missing close reason rather than failing', () => {
    expect(parseServerFrame({ v: PROTOCOL_VERSION, t: 'closed' })).toEqual({ t: 'closed', reason: 'closed' });
  });
});

describe('parseGameBridgeMessage', () => {
  it('accepts a namespaced hello and clamps a silly slot count', () => {
    expect(parseGameBridgeMessage({ ns: 'gdp', v: PROTOCOL_VERSION, t: 'hello', slots: 4 })).toEqual({
      t: 'hello',
      slots: 4,
    });
    expect(parseGameBridgeMessage({ ns: 'gdp', v: PROTOCOL_VERSION, t: 'hello', slots: 9999 })).toEqual({
      t: 'hello',
      slots: 1,
    });
  });

  it('ignores messages a game sends outside our namespace', () => {
    // Game code is untrusted: its own postMessage traffic must never be mistaken
    // for a bridge instruction.
    expect(parseGameBridgeMessage({ t: 'hello', slots: 2 })).toBeNull();
    expect(parseGameBridgeMessage({ ns: 'other', v: PROTOCOL_VERSION, t: 'hello', slots: 2 })).toBeNull();
    expect(parseGameBridgeMessage({ ns: 'gdp', v: 2, t: 'hello', slots: 2 })).toBeNull();
    expect(parseGameBridgeMessage({ ns: 'gdp', v: PROTOCOL_VERSION, t: 'kick', slot: 1 })).toBeNull();
  });
});

describe('join route', () => {
  it('parses a scanned lobby link (code in path, token in fragment)', () => {
    expect(parsePathRoute('/join/K7M3QP', '#abc-DEF_123')).toEqual({
      view: 'join',
      code: 'K7M3QP',
      token: 'abc-DEF_123',
    });
  });

  it('maps malformed join links to notFound', () => {
    expect(parsePathRoute('/join/lower1', '#token')).toEqual({ view: 'notFound' });
    expect(parsePathRoute('/join/TOOLONG9', '#token')).toEqual({ view: 'notFound' });
    expect(parsePathRoute('/join/K7M3QP')).toEqual({ view: 'notFound' });
    expect(parsePathRoute('/join/K7M3QP/tok/en')).toEqual({ view: 'notFound' });
  });

  it('still parses the existing routes', () => {
    expect(parsePathRoute('/')).toEqual({ view: 'home' });
    expect(parsePathRoute('/status/abc')).toEqual({ view: 'studio', game: 'abc' });
  });
});

describe('socketUrlFrom', () => {
  it('falls back to the page origin when nothing is configured', () => {
    expect(socketUrlFrom(undefined, undefined, 'https://www.gamedev.pl')).toBe('wss://www.gamedev.pl/api/mp/ws');
  });

  it('uses the dev API base when there is no relay', () => {
    expect(socketUrlFrom(undefined, 'http://localhost:8787', 'http://localhost:5173')).toBe(
      'ws://localhost:8787/api/mp/ws',
    );
  });

  it('prefers the relay over the API base', () => {
    // Once the relay is split out the app origin stops serving /api/mp/ws entirely, so a
    // configured relay must win — otherwise party mode dials a route that is not there.
    expect(socketUrlFrom('https://mp.gamedev.pl', 'http://localhost:8787', 'http://localhost:5173')).toBe(
      'wss://mp.gamedev.pl/api/mp/ws',
    );
  });

  it('ignores empty strings, which is what an unset Vite var inlines to', () => {
    expect(socketUrlFrom('', '', 'https://www.gamedev.pl')).toBe('wss://www.gamedev.pl/api/mp/ws');
  });

  it('tolerates a trailing slash', () => {
    expect(socketUrlFrom('https://mp.gamedev.pl/', undefined, 'x')).toBe('wss://mp.gamedev.pl/api/mp/ws');
  });
});
