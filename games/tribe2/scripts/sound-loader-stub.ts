/**
 * Headless stub for sound-loader
 * This module provides no-op implementations for headless/server-side execution
 */

import { SoundType } from '../src/game/sound/sound-types';

export const soundBuffers = new Map<SoundType, AudioBuffer>();

export function getAudioContext(): AudioContext | null {
  return null;
}

export function getMasterGainNode(): GainNode | null {
  return null;
}

export function loadAllSounds(): Promise<void> {
  return Promise.resolve();
}

export function setMasterVolume(volume: number): void {
  // No-op
}
