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
    // Create AudioContext
    audioContext = new (window.AudioContext ||
      (window as any).webkitAudioContext)();
    masterGainNode = audioContext.createGain();
    masterGainNode.connect(audioContext.destination);
  } catch (e) {
    console.error("Web Audio API is not supported in this browser");
  }
}
