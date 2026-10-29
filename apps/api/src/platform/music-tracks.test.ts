import { describe, expect, it } from 'vitest';
import { mergeMusicTrackMaps, parseGameMusicTracks, parseMusicCatalogTracks } from './music-tracks.js';

const validTrack = {
  bpm: 120,
  steps: 8,
  gain: 0.2,
  channels: [{ wave: 'square' as const, gain: 0.5, pattern: ['C4', null, 'E4', null, 'G4', null, 'E4', null] }],
};
const nCh = (n: number) => ({ ...validTrack, channels: Array(n).fill(validTrack.channels[0]) });

describe('music-tracks', () => {
  it('parses a shared catalog tracks map', () => {
    const tracks = parseMusicCatalogTracks(JSON.stringify({ tracks: { 'soft-puzzle': { loop: true } } }));
    expect(Object.hasOwn(tracks, 'soft-puzzle')).toBe(true);
  });

  it('strictly validates a per-game music.json and permits up to 8 channels', () => {
    expect(
      parseGameMusicTracks(JSON.stringify({ version: 1, tracks: { 'raid-theme': validTrack } }))['raid-theme'],
    ).toEqual(validTrack);
    expect(
      parseGameMusicTracks(JSON.stringify({ version: 1, tracks: { 'multi-voice': nCh(8) } }))['multi-voice'],
    ).toEqual(nCh(8));
  });

  it('rejects version other than 1 and channels > 8', () => {
    expect(() => parseGameMusicTracks(JSON.stringify({ version: 2, tracks: { a: validTrack } }))).toThrow(
      /version must be 1/,
    );
    expect(() => parseGameMusicTracks(JSON.stringify({ version: 1, tracks: { 'too-many': nCh(9) } }))).toThrow(
      /too-many needs 1–8 channels/,
    );
  });

  it('accepts kick and hat percussion channels and drumKit definitions', () => {
    const trackerWithDrums = {
      bpm: 116,
      steps: 8,
      gain: 1,
      drumKit: { kick: 'deep-kick', hat: 'soft-hat' },
      channels: [
        {
          wave: 'kick' as const,
          name: 'kick',
          gain: 0.2,
          sweepFrom: 120,
          sweepTo: 40,
          duration: 0.16,
          pattern: ['K', null, 'K', null, 'K', null, 'K', null],
        },
        {
          wave: 'hat' as const,
          name: 'hat',
          gain: 0.1,
          frequency: 8000,
          pattern: [null, 'H', null, 'H', null, 'H', null, 'H'],
        },
      ],
    };
    expect(
      parseGameMusicTracks(JSON.stringify({ version: 1, tracks: { 'rainbow-run': trackerWithDrums } }))['rainbow-run'],
    ).toEqual(trackerWithDrums);
  });

  it('merges game tracks onto shared catalog and refuses collision', () => {
    const merged = mergeMusicTrackMaps({ 'soft-puzzle': { loop: true } }, { 'raid-theme': validTrack });
    expect(Object.hasOwn(merged, 'soft-puzzle')).toBe(true);
    expect(Object.hasOwn(merged, 'raid-theme')).toBe(true);
    expect(() => mergeMusicTrackMaps({ 'soft-puzzle': { loop: true } }, { 'soft-puzzle': validTrack })).toThrow(
      /redefines shared catalog track/,
    );
  });
});
