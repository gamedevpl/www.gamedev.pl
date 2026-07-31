import { describe, expect, it } from 'vitest';
import { mapTranscriptToKey } from './voicePhrases.js';

describe('mapTranscriptToKey', () => {
  it('maps English and Polish party phrases', () => {
    expect(mapTranscriptToKey('left')).toBe('left');
    expect(mapTranscriptToKey('Lewo')).toBe('left');
    expect(mapTranscriptToKey('go')).toBe('a');
    expect(mapTranscriptToKey('strzał')).toBe('a');
    expect(mapTranscriptToKey('góra')).toBe('up');
    expect(mapTranscriptToKey('please go now')).toBe('a');
  });

  it('returns null for unknown speech', () => {
    expect(mapTranscriptToKey('')).toBeNull();
    expect(mapTranscriptToKey('banana')).toBeNull();
    expect(mapTranscriptToKey('attack')).toBeNull();
  });
});
