import { afterEach, describe, expect, it, vi } from 'vitest';
import { micName, nextMic, shortMic } from './micInput.js';

const input = (deviceId: string, groupId: string) => ({ kind: 'audioinput', deviceId, groupId, label: deviceId });
const listening = (settings: MediaTrackSettings) =>
  ({ getAudioTracks: () => [{ getSettings: () => settings }] }) as unknown as MediaStream;

afterEach(() => vi.unstubAllGlobals());

describe('mic names', () => {
  it('drops Chrome default prefix and USB id, and shortens for the bar', () => {
    expect(micName('Default - MacBook Pro Microphone (Built-in)')).toBe('MacBook Pro Microphone (Built-in)');
    expect(micName('USB Audio Device (046d:0825)')).toBe('USB Audio Device');
    expect(shortMic('Grzegorz’s iPhone Microphone')).toBe('Grzegorz’s iP…');
    expect(shortMic('iPhone')).toBe('iPhone');
  });
});

describe('nextMic', () => {
  it('moves past the real device behind the "default" alias', async () => {
    const devices = [input('default', 'g-phone'), input('mac', 'g-mac'), input('phone', 'g-phone')];
    vi.stubGlobal('navigator', { mediaDevices: { enumerateDevices: async () => devices } });
    expect(await nextMic(listening({ deviceId: 'default', groupId: 'g-phone' }))).toBe('mac');
    expect(await nextMic(listening({ deviceId: 'mac', groupId: 'g-mac' }))).toBe('phone');
  });

  it('has nothing to switch to with one mic', async () => {
    vi.stubGlobal('navigator', { mediaDevices: { enumerateDevices: async () => [input('mac', 'g-mac')] } });
    expect(await nextMic(listening({ deviceId: 'mac' }))).toBeNull();
  });
});
