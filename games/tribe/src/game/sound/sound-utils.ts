import { calculateWrappedDistance, getDirectionVectorOnTorus } from '../utils/math-utils';
import { SOUND_FALLOFF, SOUND_MAX_DISTANCE } from '../world-consts';
import { SoundOptions, SoundType } from './sound-types';
import { getAudioContext, soundBuffers, getMasterGainNode } from './sound-loader';

export function updateMasterVolume(masterVolume: number, isMuted: boolean): void {
  const masterGainNode = getMasterGainNode();
  const context = getAudioContext();
  if (masterGainNode && context) {
    const newVolume = isMuted ? 0 : masterVolume;
    masterGainNode.gain.value = newVolume / 10;
  }
}

export function playSound(soundType: SoundType, options?: SoundOptions): void {
  const context = getAudioContext();
  const masterGainNode = getMasterGainNode();

  // Exit if audio context is not ready or if sound is globally muted (master gain is 0)
  if (!context || !masterGainNode || masterGainNode.gain.value === 0) {
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

  const sourceNode = context.createBufferSource();
  sourceNode.buffer = audioBuffer;

  // This gain node is for spatial audio falloff, not master volume.
  const spatialGainNode = context.createGain();
  const pannerNode = context.createStereoPanner();

  let lastNode: AudioNode = spatialGainNode;

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
    spatialGainNode.gain.value = Math.max(0, spatialVolume);

    // Panning
    const pan = Math.sin((directionVector.x / distance) * (Math.PI / 2));
    pannerNode.pan.value = isNaN(pan) ? 0 : pan;

    spatialGainNode.connect(pannerNode);
    lastNode = pannerNode;
  } else {
    // Apply a default volume for non-positional sounds, independent of master volume.
    const defaultVolume = soundType === SoundType.GameOver ? 0.4 : 0.2;
    spatialGainNode.gain.value = defaultVolume;
  }

  // Connect the sound's node chain to the single master gain node.
  sourceNode.connect(lastNode);
  lastNode.connect(masterGainNode);
  sourceNode.start(0);
}
