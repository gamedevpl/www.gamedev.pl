import { describe, expect, it } from 'vitest';
import { mergeMusicTrackMaps, parseGameMusicTracks, parseMusicCatalogTracks } from './music-tracks.js';

const validTrack = {
  bpm: 120,
  steps: 8,
  gain: 0.2,
  channels: [
    {
      wave: 'square' as const,
      gain: 0.5,
      pattern: ['C4', null, 'E4', null, 'G4', null, 'E4', null],
    },
  ],
};

describe('music-tracks', () => {
  it('parses a shared catalog tracks map', () => {
    const tracks = parseMusicCatalogTracks(JSON.stringify({ tracks: { 'soft-puzzle': { loop: true } } }));
    expect(Object.hasOwn(tracks, 'soft-puzzle')).toBe(true);
  });

  it('strictly validates a per-game music.json', () => {
    const tracks = parseGameMusicTracks(JSON.stringify({ version: 1, tracks: { 'raid-theme': validTrack } }));
    expect(tracks['raid-theme']).toEqual(validTrack);
  });

  it('rejects a per-game catalog with version other than 1', () => {
    expect(() => parseGameMusicTracks(JSON.stringify({ version: 2, tracks: { a: validTrack } }))).toThrow(
      /version must be 1/,
    );
  });

  it('merges game tracks onto the shared catalog', () => {
    const merged = mergeMusicTrackMaps({ 'soft-puzzle': { loop: true } }, { 'raid-theme': validTrack });
    expect(Object.hasOwn(merged, 'soft-puzzle')).toBe(true);
    expect(Object.hasOwn(merged, 'raid-theme')).toBe(true);
  });

  it('refuses a game track that collides with the shared catalog', () => {
    expect(() => mergeMusicTrackMaps({ 'soft-puzzle': { loop: true } }, { 'soft-puzzle': validTrack })).toThrow(
      /redefines shared catalog track/,
    );
  });
});
