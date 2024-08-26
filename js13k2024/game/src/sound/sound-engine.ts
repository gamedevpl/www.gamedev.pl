// Sound Engine for synthesizing and playing game sounds

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
const masterVolume = 0.025; // Default low volume

export enum SoundEffect {
  Step,
  ElectricalDischarge,
  BonusCollected,
  Explosion,
  StateTransition,
  GameOver,
  LevelComplete,
  MonsterSpawn,
  Teleport,
  BlasterSound,
}

function createOscillator(frequency: number, type: OscillatorType, duration: number): OscillatorNode {
  const oscillator = audioContext.createOscillator();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + duration);
  return oscillator;
}

function createGain(attackTime: number, releaseTime: number, peakValue: number = 1): GainNode {
  const gain = audioContext.createGain();
  const adjustedPeakValue = peakValue * masterVolume;
  gain.gain.setValueAtTime(0, audioContext.currentTime);
  gain.gain.linearRampToValueAtTime(adjustedPeakValue, audioContext.currentTime + attackTime);
  gain.gain.linearRampToValueAtTime(0, audioContext.currentTime + attackTime + releaseTime);
  return gain;
}

function playSimpleSound(
  frequency: number,
  type: OscillatorType,
  duration: number,
  attackTime: number,
  releaseTime: number,
  frequencyEnd?: number,
) {
  const oscillator = createOscillator(frequency, type, duration);
  const gain = createGain(attackTime, releaseTime);
  if (frequencyEnd) {
    oscillator.frequency.linearRampToValueAtTime(frequencyEnd, audioContext.currentTime + duration);
  }
  oscillator.connect(gain).connect(audioContext.destination);
}

function playNoise(duration: number, attackTime: number, releaseTime: number) {
  const bufferSize = audioContext.sampleRate * duration;
  const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
  const output = buffer.getChannelData(0);

  for (let i = 0; i < bufferSize; i++) {
    output[i] = Math.random() * 2 - 1;
  }

  const noise = audioContext.createBufferSource();
  noise.buffer = buffer;
  const gain = createGain(attackTime, releaseTime, 0.5);
  noise.connect(gain).connect(audioContext.destination);
  noise.start();
}

export function playEffect(effect: SoundEffect): void {
  switch (effect) {
    case SoundEffect.Step:
      playSimpleSound(200, 'square', 0.1, 0.01, 0.09);
      break;
    case SoundEffect.ElectricalDischarge:
      playSimpleSound(800, 'sawtooth', 0.2, 0.01, 0.19, 200);
      break;
    case SoundEffect.BonusCollected:
      playSimpleSound(600, 'sine', 0.15, 0.01, 0.14, 800);
      break;
    case SoundEffect.Explosion:
      playNoise(0.5, 0.01, 0.49);
      break;
    case SoundEffect.StateTransition:
      playSimpleSound(300, 'triangle', 0.3, 0.05, 0.25, 600);
      break;
    case SoundEffect.GameOver:
      playSimpleSound(440, 'sine', 1, 0.01, 0.99, 220);
      break;
    case SoundEffect.LevelComplete:
      playSimpleSound(440, 'sine', 0.5, 0.01, 0.49);
      setTimeout(() => playSimpleSound(550, 'sine', 0.5, 0.01, 0.49), 0);
      setTimeout(() => playSimpleSound(660, 'sine', 0.5, 0.01, 0.49), 250);
      break;
    case SoundEffect.MonsterSpawn:
      playSimpleSound(100, 'sawtooth', 0.3, 0.01, 0.29, 300);
      break;
    case SoundEffect.Teleport:
      playSimpleSound(100, 'sine', 0.5, 0.01, 0.49, 1000);
      setTimeout(() => playSimpleSound(200, 'sine', 0.5, 0.01, 0.49, 2000), 0);
      setTimeout(() => playSimpleSound(2000, 'sine', 0.2, 0.01, 0.19, 4000), 100);
      break;
    case SoundEffect.BlasterSound:
      const duration = 0.15;
      const oscillator = createOscillator(1000, 'sawtooth', duration);
      oscillator.frequency.exponentialRampToValueAtTime(500, audioContext.currentTime + duration);
      const gain = audioContext.createGain();
      gain.gain.setValueAtTime(0, audioContext.currentTime);
      gain.gain.linearRampToValueAtTime(masterVolume, audioContext.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
      oscillator.connect(gain).connect(audioContext.destination);

      const noiseBuffer = audioContext.createBuffer(1, audioContext.sampleRate * duration, audioContext.sampleRate);
      const noiseData = noiseBuffer.getChannelData(0);
      for (let i = 0; i < noiseBuffer.length; i++) {
        noiseData[i] = Math.random() * 2 - 1;
      }
      const noiseSource = audioContext.createBufferSource();
      noiseSource.buffer = noiseBuffer;
      const noiseGain = audioContext.createGain();
      noiseGain.gain.setValueAtTime(masterVolume * 0.2, audioContext.currentTime);
      noiseGain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
      noiseSource.connect(noiseGain).connect(audioContext.destination);
      noiseSource.start();
      noiseSource.stop(audioContext.currentTime + duration);
      break;
  }
}
