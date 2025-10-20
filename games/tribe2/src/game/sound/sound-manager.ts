import { UpdateContext } from '../types/world-types';
import { Vector2D } from '../types/math-types';
import { getAudioContext, getMasterGainNode, soundBuffers } from './sound-loader';
import { SoundOptions, SoundType } from './sound-types';

// Map to keep track of active sound sources that might need to be stopped (e.g., music).
const activeSoundSources = new Map<string, { sourceNode: AudioBufferSourceNode; gainNode: GainNode }>();

/**
 * Plays a sound with optional settings. This is the core sound function.
 * For now, it does not handle spatial audio (panning, distance falloff).
 * @param soundType The type of sound to play.
 * @param options Configuration for the sound.
 */
export function playSound(soundType: SoundType, options?: SoundOptions): void {
  const context = getAudioContext();
  const masterGainNode = getMasterGainNode();

  if (!context || !masterGainNode) {
    return; // Audio system not initialized or supported.
  }

  // Respect master mute, but allow tracks to be started (they will be silent).
  if (options?.isMuted && !options?.trackId) {
    return;
  }

  if (context.state === 'suspended') {
    context.resume();
  }

  const audioBuffer = soundBuffers.get(SoundType[soundType]);
  if (!audioBuffer) {
    // console.warn(`Sound buffer not found for type: ${SoundType[soundType]}`);
    return;
  }

  // If a trackId is provided and it's already playing, don't start it again.
  if (options?.trackId && activeSoundSources.has(options.trackId)) {
    return;
  }

  const sourceNode = context.createBufferSource();
  sourceNode.buffer = audioBuffer;
  sourceNode.loop = options?.loop ?? false;

  // This gain node is for individual track control (e.g., fading).
  const individualGainNode = context.createGain();
  individualGainNode.gain.value = 1.0; // Start at full volume (master gain will control overall level)

  // TODO: Implement spatial audio (panning, distance falloff) here.
  // For now, all sounds are non-positional.

  sourceNode.connect(individualGainNode);
  individualGainNode.connect(masterGainNode);
  sourceNode.start(0);

  // If a trackId is provided, store the source for later control (e.g., stopping).
  if (options?.trackId) {
    activeSoundSources.set(options.trackId, { sourceNode, gainNode: individualGainNode });
    sourceNode.onended = () => {
      activeSoundSources.delete(options!.trackId!);
    };
  }
}

/**
 * Stops a currently playing sound, with an optional fade-out.
 * @param trackId The unique ID of the sound to stop.
 * @param fadeOutDurationSeconds The duration of the fade-out in seconds.
 */
export function stopSound(trackId: string, fadeOutDurationSeconds = 1): void {
  const sound = activeSoundSources.get(trackId);
  const context = getAudioContext();

  if (sound && context) {
    const { sourceNode, gainNode } = sound;
    const currentTime = context.currentTime;

    // Fade out the sound
    gainNode.gain.setValueAtTime(gainNode.gain.value, currentTime);
    gainNode.gain.linearRampToValueAtTime(0, currentTime + fadeOutDurationSeconds);

    sourceNode.stop(currentTime + fadeOutDurationSeconds);
    sourceNode.onended = null; // Prevent deletion from map on manual stop
    activeSoundSources.delete(trackId);
  }
}


/**
 * A helper to play a sound at a specific position in the world.
 * It will eventually use the player's position as the listener.
 * @param context The game update context.
 * @param soundType The sound to play.
 * @param position The world position to emit the sound from.
 */
export function playSoundAt(context: UpdateContext, soundType: SoundType, position: Vector2D) {
  // TODO: Find player/listener entity from context.gameState to enable spatial audio.
  const listenerPosition = undefined;

  playSound(soundType, {
    position,
    listenerPosition,
    worldDimensions: context.gameState.mapDimensions,
  });
}
