let audioContext: AudioContext | null = null;
let masterGainNode: GainNode | null = null;
export const soundBuffers = new Map<string, AudioBuffer>();

export function getAudioContext(): AudioContext | null {
  return audioContext;
}

export function getMasterGainNode(): GainNode | null {
  return masterGainNode;
}

export async function initSoundLoader(): Promise<void> {
  if (audioContext) {
    return;
  }

  try {
    // Create AudioContext, handling vendor prefix for older browsers.
    // The global.d.ts file provides the type definition for webkitAudioContext.
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) {
      console.error("Web Audio API is not supported in this browser");
      return;
    }
    audioContext = new AudioContextClass();
    masterGainNode = audioContext.createGain();
    masterGainNode.connect(audioContext.destination);
  } catch {
    console.error("An error occurred while initializing the Web Audio API.");
  }
}
