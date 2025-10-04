/**
 * Sound Manager - Handle game sounds using Web Audio API
 */

let audioContext: AudioContext | null = null;
let masterGainNode: GainNode | null = null;

/**
 * Initialize the audio context
 * Should be called after user interaction (browser requirement)
 */
export function initSoundSystem(): void {
  if (!audioContext) {
    audioContext = new AudioContext();
    masterGainNode = audioContext.createGain();
    masterGainNode.connect(audioContext.destination);
    console.log('Sound system initialized');
  }
}

/**
 * Get the audio context
 */
export function getAudioContext(): AudioContext | null {
  return audioContext;
}

/**
 * Get the master gain node for volume control
 */
export function getMasterGainNode(): GainNode | null {
  return masterGainNode;
}

/**
 * Set master volume (0.0 to 1.0)
 */
export function setMasterVolume(volume: number): void {
  if (masterGainNode) {
    masterGainNode.gain.value = Math.max(0, Math.min(1, volume));
  }
}

/**
 * Play a simple beep sound
 * This is a placeholder - in a real game, you'd load and play audio files
 */
export function playBeep(frequency: number = 440, duration: number = 0.1): void {
  if (!audioContext || !masterGainNode) {
    return;
  }

  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }

  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(masterGainNode);

  oscillator.frequency.value = frequency;
  oscillator.type = 'sine';

  gainNode.gain.value = 0.1;
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);

  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + duration);
}

/**
 * Play a click sound
 */
export function playClickSound(): void {
  playBeep(800, 0.05);
}

/**
 * Play a pause sound
 */
export function playPauseSound(): void {
  playBeep(600, 0.1);
}
