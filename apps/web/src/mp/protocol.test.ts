import { describe, expect, it } from 'vitest';
import { parseGameBridgeMessage, parseServerFrame, PROTOCOL_VERSION } from './protocol';
import { parsePathRoute } from '../router';

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

  it('falls back home for malformed join links', () => {
    expect(parsePathRoute('/join/lower1', '#token')).toEqual({ view: 'home' });
    expect(parsePathRoute('/join/TOOLONG9', '#token')).toEqual({ view: 'home' });
    expect(parsePathRoute('/join/K7M3QP')).toEqual({ view: 'home' });
    expect(parsePathRoute('/join/K7M3QP/tok/en')).toEqual({ view: 'home' });
  });

  it('still parses the existing routes', () => {
    expect(parsePathRoute('/')).toEqual({ view: 'home' });
    expect(parsePathRoute('/status/abc')).toEqual({ view: 'status', token: 'abc' });
  });
});
