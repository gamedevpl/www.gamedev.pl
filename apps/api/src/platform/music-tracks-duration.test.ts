import { describe, expect, it } from 'vitest';
import { parseGameMusicTracks } from './music-tracks.js';

const track = (duration: number) => ({
  version: 1,
  tracks: {
    sustained: {
      bpm: 120,
      steps: 8,
      channels: [{ wave: 'saw', duration, pattern: ['C4', null, 'E4', null, 'G4', null, 'E4', null] }],
    },
  },
});

describe('music track duration', () => {
  it('accepts sustained notes up to the games-repo tracker limit', () => {
    expect(parseGameMusicTracks(JSON.stringify(track(2.2)))).toHaveProperty('sustained');
    expect(parseGameMusicTracks(JSON.stringify(track(4)))).toHaveProperty('sustained');
    expect(() => parseGameMusicTracks(JSON.stringify(track(4.1)))).toThrow(/duration must be between 0 and 4/);
  });
});
