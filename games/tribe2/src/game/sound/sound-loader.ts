import { SOUND_FILE_MAP, SoundType } from './sound-types';

// Create a single AudioContext to be reused
let audioContext: AudioContext;
let masterGainNode: GainNode;

export function getMasterGainNode(): GainNode | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }
  return masterGainNode;
}

export function getAudioContext(): AudioContext | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }
  if (!audioContext && typeof window.AudioContext === 'function') {
    audioContext = new window.AudioContext();
    masterGainNode = audioContext.createGain();
    masterGainNode.connect(audioContext.destination);
    setMasterVolume(0.1, false);
  }
  return audioContext;
}

export function setMasterVolume(volume: number, isMuted: boolean): void {
  if (masterGainNode) {
    // Use setTargetAtTime for smoother volume changes
    masterGainNode.gain.value = isMuted ? 0 : volume / 10;
  }
}

export const soundBuffers = new Map<SoundType, AudioBuffer>();

let isLoading = false;
let hasLoaded = false;

export async function initSoundLoader(): Promise<void> {
  if (hasLoaded || isLoading) {
    return;
  }

  const context = getAudioContext();
  if (!context) {
    console.error('AudioContext not supported. Cannot load sounds.');
    return;
  }

  // It's good practice to resume the context on a user gesture, but we'll do it here for simplicity.
  if (context.state === 'suspended') {
    context.resume();
  }

  isLoading = true;
  console.log('Starting sound loading...');

  const soundPromises: Promise<void>[] = [];

  SOUND_FILE_MAP.forEach((filePath, soundType) => {
    const promise = fetch(filePath)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to fetch sound: ${filePath}`);
        }
        return response.arrayBuffer();
      })
      .then((arrayBuffer) => context.decodeAudioData(arrayBuffer))
      .then((audioBuffer) => {
        soundBuffers.set(soundType, audioBuffer);
      })
      .catch((error) => {
        console.error(`Error loading sound ${SoundType[soundType]} from ${filePath}:`, error);
      });
    soundPromises.push(promise);
  });

  try {
    await Promise.all(soundPromises);
    hasLoaded = true;
    isLoading = false;
    console.log('All sounds loaded successfully.');
  } catch (error) {
    isLoading = false;
    console.error('An error occurred while loading sounds:', error);
  }
}
