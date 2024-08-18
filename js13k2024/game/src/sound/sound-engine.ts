// Sound Engine for synthesizing and playing game sounds

class SoundEngine {
  private audioContext: AudioContext;
  private masterVolume: number = 0.025; // Default low volume

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }

  private createOscillator(frequency: number, type: OscillatorType, duration: number): OscillatorNode {
    const oscillator = this.audioContext.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
    oscillator.start();
    oscillator.stop(this.audioContext.currentTime + duration);
    return oscillator;
  }

  private createGain(attackTime: number, releaseTime: number, peakValue: number = 1): GainNode {
    const gain = this.audioContext.createGain();
    const adjustedPeakValue = peakValue * this.masterVolume;
    gain.gain.setValueAtTime(0, this.audioContext.currentTime);
    gain.gain.linearRampToValueAtTime(adjustedPeakValue, this.audioContext.currentTime + attackTime);
    gain.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + attackTime + releaseTime);
    return gain;
  }

  playStep() {
    const oscillator = this.createOscillator(200, 'square', 0.1);
    const gain = this.createGain(0.01, 0.09);
    oscillator.connect(gain).connect(this.audioContext.destination);
  }

  playElectricalDischarge() {
    const oscillator = this.createOscillator(800, 'sawtooth', 0.2);
    const gain = this.createGain(0.01, 0.19);
    oscillator.frequency.linearRampToValueAtTime(200, this.audioContext.currentTime + 0.2);
    oscillator.connect(gain).connect(this.audioContext.destination);
  }

  playBonusCollected() {
    const oscillator = this.createOscillator(600, 'sine', 0.15);
    const gain = this.createGain(0.01, 0.14);
    oscillator.frequency.linearRampToValueAtTime(800, this.audioContext.currentTime + 0.15);
    oscillator.connect(gain).connect(this.audioContext.destination);
  }

  playExplosion() {
    const noise = this.audioContext.createBufferSource();
    const bufferSize = this.audioContext.sampleRate * 0.5;
    const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
    const output = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    noise.buffer = buffer;
    const gain = this.createGain(0.01, 0.49, 0.5);
    noise.connect(gain).connect(this.audioContext.destination);
    noise.start();
  }

  playStateTransition() {
    const oscillator = this.createOscillator(300, 'triangle', 0.3);
    const gain = this.createGain(0.05, 0.25);
    oscillator.frequency.linearRampToValueAtTime(600, this.audioContext.currentTime + 0.3);
    oscillator.connect(gain).connect(this.audioContext.destination);
  }

  playGameOver() {
    const oscillator = this.createOscillator(440, 'sine', 1);
    const gain = this.createGain(0.01, 0.99);
    oscillator.frequency.linearRampToValueAtTime(220, this.audioContext.currentTime + 1);
    oscillator.connect(gain).connect(this.audioContext.destination);
  }

  playLevelComplete() {
    const oscillator1 = this.createOscillator(440, 'sine', 0.5);
    const oscillator2 = this.createOscillator(550, 'sine', 0.5);
    const gain1 = this.createGain(0.01, 0.49);
    const gain2 = this.createGain(0.01, 0.49);
    oscillator1.connect(gain1).connect(this.audioContext.destination);
    oscillator2.connect(gain2).connect(this.audioContext.destination);
    setTimeout(() => {
      const oscillator3 = this.createOscillator(660, 'sine', 0.5);
      const gain3 = this.createGain(0.01, 0.49);
      oscillator3.connect(gain3).connect(this.audioContext.destination);
    }, 250);
  }

  playMonsterSpawn() {
    const oscillator = this.createOscillator(100, 'sawtooth', 0.3);
    const gain = this.createGain(0.01, 0.29);
    oscillator.frequency.exponentialRampToValueAtTime(300, this.audioContext.currentTime + 0.3);
    oscillator.connect(gain).connect(this.audioContext.destination);
  }
}

export const soundEngine = new SoundEngine();
