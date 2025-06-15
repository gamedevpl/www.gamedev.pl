import { calculateWrappedDistance, getDirectionVectorOnTorus } from '../utils/math-utils';
import { SOUND_FALLOFF, SOUND_MAX_DISTANCE } from '../world-consts';
import { SoundOptions, SoundType } from './sound-types';

// Create a single AudioContext to be reused
let audioContext: AudioContext;

function getAudioContext(): AudioContext | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }
  if (!audioContext && typeof window.AudioContext === 'function') {
    audioContext = new window.AudioContext();
  }
  return audioContext;
}

export function playSound(soundType: SoundType, options?: SoundOptions): void {
  if (options?.isMuted) {
    return;
  }

  const context = getAudioContext();
  if (!context) {
    return;
  }

  if (context.state === 'suspended') {
    context.resume();
  }

  const oscillator = context.createOscillator();
  const gainNode = context.createGain();
  const pannerNode = context.createStereoPanner();

  const masterVolume = options?.masterVolume ?? 1;
  let lastNode: AudioNode = gainNode;

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

    // Volume falloff
    const spatialVolume = 1 - Math.pow(distance / SOUND_MAX_DISTANCE, SOUND_FALLOFF);
    gainNode.gain.value = Math.max(0, spatialVolume * masterVolume);

    // Panning
    const pan = Math.sin((directionVector.x / distance) * (Math.PI / 2));
    pannerNode.pan.value = isNaN(pan) ? 0 : pan;

    gainNode.connect(pannerNode);
    lastNode = pannerNode;
  } else {
    gainNode.gain.value = 0.1 * masterVolume; // Default volume for non-positional sounds
  }

  oscillator.connect(lastNode);
  lastNode.connect(context.destination);

  const now = context.currentTime;

  switch (soundType) {
    case SoundType.Attack:
      oscillator.type = 'sawtooth';
      oscillator.frequency.setValueAtTime(200, now);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      oscillator.start(now);
      oscillator.stop(now + 0.2);
      break;

    case SoundType.Gather:
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(440, now);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      oscillator.start(now);
      oscillator.stop(now + 0.1);
      break;

    case SoundType.Eat:
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(660, now);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      oscillator.start(now);
      oscillator.stop(now + 0.15);
      break;

    case SoundType.Procreate:
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(523.25, now); // C5
      gainNode.gain.linearRampToValueAtTime(gainNode.gain.value * 1.2, now + 0.3);
      oscillator.frequency.linearRampToValueAtTime(659.25, now + 0.3); // E5
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      oscillator.start(now);
      oscillator.stop(now + 0.5);
      break;

    case SoundType.Birth:
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(523.25, now); // C5
      oscillator.frequency.setValueAtTime(659.25, now + 0.1); // E5
      oscillator.frequency.setValueAtTime(783.99, now + 0.2); // G5
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      oscillator.start(now);
      oscillator.stop(now + 0.4);
      break;

    case SoundType.ChildFed:
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, now);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      oscillator.start(now);
      oscillator.stop(now + 0.15);
      break;

    case SoundType.HumanDeath:
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(200, now);
      oscillator.frequency.exponentialRampToValueAtTime(50, now + 1.0);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
      oscillator.start(now);
      oscillator.stop(now + 1.0);
      break;

    case SoundType.GameOver:
      gainNode.gain.value = 0.4 * masterVolume; // Ensure UI sounds are audible
      oscillator.type = 'sawtooth';
      oscillator.frequency.setValueAtTime(440, now); // A4
      oscillator.frequency.linearRampToValueAtTime(349.23, now + 0.3); // F4
      oscillator.frequency.linearRampToValueAtTime(261.63, now + 0.6); // C4
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
      oscillator.start(now);
      oscillator.stop(now + 1.5);
      break;

    case SoundType.ButtonClick:
      gainNode.gain.value = 0.1 * masterVolume;
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(1000, now);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      oscillator.start(now);
      oscillator.stop(now + 0.05);
      break;

    default:
      break;
  }
}
