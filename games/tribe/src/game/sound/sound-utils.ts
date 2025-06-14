import { SoundType } from "./sound-types";

// Create a single AudioContext to be reused
let audioContext: AudioContext;

function getAudioContext(): AudioContext | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioContext;
}

export function playSound(soundType: SoundType): void {
  const context = getAudioContext();
  if (!context) {
    // console.warn("Web Audio API is not supported in this browser or context.");
    return;
  }

  // Resume context if it's in a suspended state (required by modern browsers)
  if (context.state === "suspended") {
    context.resume();
  }

  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.connect(gain);
  gain.connect(context.destination);

  const now = context.currentTime;

  switch (soundType) {
    case SoundType.Attack:
      oscillator.type = "sawtooth";
      oscillator.frequency.setValueAtTime(200, now);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      oscillator.start(now);
      oscillator.stop(now + 0.2);
      break;

    case SoundType.Gather:
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(440, now);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      oscillator.start(now);
      oscillator.stop(now + 0.1);
      break;

    case SoundType.Eat:
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(660, now);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      oscillator.start(now);
      oscillator.stop(now + 0.15);
      break;

    case SoundType.Procreate:
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(523.25, now); // C5
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.linearRampToValueAtTime(0.5, now + 0.3);
      oscillator.frequency.linearRampToValueAtTime(659.25, now + 0.3); // E5
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      oscillator.start(now);
      oscillator.stop(now + 0.5);
      break;

    case SoundType.Birth:
      gain.gain.setValueAtTime(0.3, now);
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(523.25, now); // C5
      oscillator.frequency.setValueAtTime(659.25, now + 0.1); // E5
      oscillator.frequency.setValueAtTime(783.99, now + 0.2); // G5
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      oscillator.start(now);
      oscillator.stop(now + 0.4);
      break;

    case SoundType.ChildFed:
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, now);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      oscillator.start(now);
      oscillator.stop(now + 0.15);
      break;

    case SoundType.HumanDeath:
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(200, now);
      gain.gain.setValueAtTime(0.4, now);
      oscillator.frequency.exponentialRampToValueAtTime(50, now + 1.0);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
      oscillator.start(now);
      oscillator.stop(now + 1.0);
      break;

    case SoundType.GameOver:
      gain.gain.setValueAtTime(0.4, now);
      oscillator.type = "sawtooth";
      oscillator.frequency.setValueAtTime(440, now); // A4
      oscillator.frequency.linearRampToValueAtTime(349.23, now + 0.3); // F4
      oscillator.frequency.linearRampToValueAtTime(261.63, now + 0.6); // C4
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
      oscillator.start(now);
      oscillator.stop(now + 1.5);
      break;

    case SoundType.ButtonClick:
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(1000, now);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      oscillator.start(now);
      oscillator.stop(now + 0.05);
      break;

    default:
      break;
  }
}
