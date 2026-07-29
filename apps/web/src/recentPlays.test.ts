import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRecentPlays, rememberRecentPlay } from './recentPlays.js';

describe('recentPlays', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('remembers newest first and caps the list', () => {
    for (let i = 0; i < 12; i += 1) rememberRecentPlay(`game-${i}`);
    const recent = getRecentPlays();
    expect(recent[0]).toBe('game-11');
    expect(recent).toHaveLength(8);
    expect(recent).not.toContain('game-0');
  });

  it('moves a replayed game to the front', () => {
    rememberRecentPlay('a');
    rememberRecentPlay('b');
    rememberRecentPlay('a');
    expect(getRecentPlays()).toEqual(['a', 'b']);
  });

  it('ignores invalid slugs', () => {
    rememberRecentPlay('../etc');
    rememberRecentPlay('OK-GAME');
    expect(getRecentPlays()).toEqual([]);
  });

  it('survives corrupt storage', () => {
    localStorage.setItem('gdpl.recentPlays', '{not-json');
    expect(getRecentPlays()).toEqual([]);
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    rememberRecentPlay('safe-game');
    spy.mockRestore();
  });
});
