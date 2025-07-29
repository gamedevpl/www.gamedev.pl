import { calculateWrappedDistance, getDirectionVectorOnTorus } from '../utils/math-utils';
import { SoundOptions, SoundType } from './sound-types';
import { getAudioContext, soundBuffers, getMasterGainNode } from './sound-loader';

// Map to keep track of active sound sources that might need to be stopped.
const activeSoundSources = new Map<string, { sourceNode: AudioBufferSourceNode; gainNode: GainNode }>();

export function playSound(soundType: SoundType, options?: SoundOptions): void {
  // Sound constants
  const SOUND_MAX_DISTANCE = 600;
  const SOUND_FALLOFF = 1.5;

  const context = getAudioContext();
  const masterGainNode = getMasterGainNode();

  if (!context || !masterGainNode) {
    return;
  }

  // Do not play sounds if master volume is muted, except for the soundtrack itself which might be starting.
  if (masterGainNode.gain.value === 0 && options?.trackId === undefined) {
    return;
  }

  if (context.state === 'suspended') {
    context.resume();
  }

  const audioBuffer = soundBuffers.get(soundType);
  if (!audioBuffer) {
    console.warn(`Sound buffer not found for type: ${SoundType[soundType]}`);
    return;
  }

  // If a trackId is provided and it's already playing, don't start it again.
  if (options?.trackId && activeSoundSources.has(options.trackId)) {
    return;
  }

  const sourceNode = context.createBufferSource();
  sourceNode.buffer = audioBuffer;
  sourceNode.loop = options?.loop ?? false;

  // This gain node is for spatial audio falloff or individual track control, not master volume.
  const individualGainNode = context.createGain();
  const pannerNode = context.createStereoPanner();

  let lastNode: AudioNode = individualGainNode;

  if (options?.position && options?.listenerPosition && options?.worldDimensions) {
    const directionVector = getDirectionVectorOnTorus(
      options.listenerPosition,
      options.position,
      options.worldDimensions.width,
      options.worldDimensions.height,
    );
    const distance = calculateWrappedDistance(
      options.listenerPosition,
      options.position,
      options.worldDimensions.width,
      options.worldDimensions.height,
    );

    if (distance > SOUND_MAX_DISTANCE) {
      return; // Sound is too far to be heard
    }

    // Volume falloff is calculated independently of master volume.
    const spatialVolume = 1 - Math.pow(distance / SOUND_MAX_DISTANCE, SOUND_FALLOFF);
    individualGainNode.gain.value = Math.max(0, spatialVolume);

    // Panning
    const pan = Math.sin((directionVector.x / distance) * (Math.PI / 2));
    pannerNode.pan.value = isNaN(pan) ? 0 : pan;

    individualGainNode.connect(pannerNode);
    lastNode = pannerNode;
  } else {
    // Non-positional sound (like UI clicks or soundtrack)
    const defaultVolume = soundType === SoundType.GameOver ? 0.4 : soundType === SoundType.SoundTrack1 ? 1 : 0.2;
    individualGainNode.gain.value = defaultVolume;
  }

  // Connect the sound's node chain to the single master gain node.
  sourceNode.connect(lastNode);
  lastNode.connect(masterGainNode);
  sourceNode.start(0);

  // If a trackId is provided, store the source and its gain node for later control.
  if (options?.trackId) {
    activeSoundSources.set(options.trackId, { sourceNode, gainNode: individualGainNode });
    sourceNode.onended = () => {
      // Clean up the map when the sound finishes playing on its own
      activeSoundSources.delete(options.trackId!);
    };
  }
}

export function stopSound(trackId: string, fadeOutDurationSeconds = 1): void {
  const sound = activeSoundSources.get(trackId);
  const context = getAudioContext();

  if (sound && context) {
    const { sourceNode, gainNode } = sound;
    const currentTime = context.currentTime;

    // Fade out the sound
    gainNode.gain.setValueAtTime(gainNode.gain.value, currentTime);
    gainNode.gain.linearRampToValueAtTime(0, currentTime + fadeOutDurationSeconds);

    // Stop the source after the fade out and remove from active sources
    sourceNode.stop(currentTime + fadeOutDurationSeconds);
    sourceNode.onended = null;
    activeSoundSources.delete(trackId);
  }
}
