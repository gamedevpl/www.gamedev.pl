import { describe, expect, it, vi } from 'vitest';
import { prependAudio } from './audio-bank.js';

const mp3 = Uint8Array.from([0x49, 0x44, 0x33, 1]);
const b64 = Buffer.from(mp3).toString('base64');

describe('prependAudio', () => {
  it('embeds bank clips read from the repo', async () => {
    const chunks: string[] = [];
    const read = vi.fn(async () => mp3);
    expect(await prependAudio(chunks, {}, { gun: 'audio/gun.mp3' }, { read })).toBe(true);
    expect(read).toHaveBeenCalledWith('audio/gun.mp3');
    expect(chunks[0]).toContain(`"gun":"data:audio/mpeg;base64,${b64}"`);
  });

  it('prefers candidate overrides and never reads the repo with noRefFallback', async () => {
    const chunks: string[] = [];
    const read = vi.fn(async () => null);
    const src = { overrides: { 'audio/gun.mp3': b64 }, noRefFallback: true, read };
    expect(await prependAudio(chunks, {}, { gun: 'audio/gun.mp3' }, src)).toBe(true);
    expect(read).not.toHaveBeenCalled();
    expect(chunks[0]).toContain(b64);
  });

  it('fails when a clip is missing and the repo is off limits', async () => {
    const read = vi.fn(async () => mp3);
    expect(await prependAudio([], {}, { gun: 'audio/gun.mp3' }, { noRefFallback: true, read })).toBe(false);
    expect(read).not.toHaveBeenCalled();
  });

  it('keeps catalog sounds ahead of the scripts and skips an empty bank', async () => {
    const chunks = ['boot'];
    expect(await prependAudio(chunks, { hit: 'data:x' }, {}, { read: async () => null })).toBe(true);
    expect(chunks[0]).toContain('__GAME_AUDIO_ASSETS__');
    expect(chunks).toHaveLength(2);
  });
});
