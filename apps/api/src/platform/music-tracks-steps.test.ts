import { describe, expect, it } from 'vitest';
import { parseGameMusicTracks } from './music-tracks.js';

const track = (steps: number) => ({
  version: 1,
  tracks: {
    radio: { bpm: 112, steps, channels: [{ wave: 'square', pattern: Array(steps).fill(null) }] },
  },
});

describe('music-tracks steps', () => {
  it('accepts long-form tracks up to 256 steps, as GameKit plays them', () => {
    expect(parseGameMusicTracks(JSON.stringify(track(256))).radio.steps).toBe(256);
    expect(() => parseGameMusicTracks(JSON.stringify(track(512)))).toThrow(
      /radio\.steps must be an integer from 8 to 256/,
    );
  });
});
