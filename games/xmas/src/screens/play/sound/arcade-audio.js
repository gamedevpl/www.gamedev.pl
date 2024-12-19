import { jsfxr } from './jsfxr';

const isBrowser = typeof window !== 'undefined';
export class ArcadeAudio {
  constructor() {
    this.enabled = true;
    this.sounds = {};
    if (isBrowser) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      // Create master gain node and connect it to destination
      this.masterGainNode = this.audioContext.createGain();
      this.masterGainNode.connect(this.audioContext.destination);
      // Set initial volume to 1 (100%)
      this.masterGainNode.gain.value = 1;
    }
  }

  async add(key, count, settings) {
    if (!isBrowser) {
      return;
    }

    this.sounds[key] = [];
    for (let settingIndex = 0; settingIndex < settings.length; settingIndex++) {
      const soundData = {
        tick: 0,
        count: count,
        buffers: [],
      };

      for (let i = 0; i < count; i++) {
        const audioData = jsfxr(settings[settingIndex]);
        const arrayBuffer = await this.base64ToArrayBuffer(audioData);
        const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
        soundData.buffers.push(audioBuffer);
      }

      this.sounds[key].push(soundData);
    }
  }

  play(key) {
    if (!isBrowser || !this.enabled) {
      return;
    }

    const sound = this.sounds[key];
    const soundData = sound.length > 1 ? sound[Math.floor(Math.random() * sound.length)] : sound[0];

    const source = this.audioContext.createBufferSource();
    source.buffer = soundData.buffers[soundData.tick];

    // Create individual gain node for this sound
    const gainNode = this.audioContext.createGain();
    source.connect(gainNode);
    // Connect to master gain instead of destination
    gainNode.connect(this.masterGainNode);

    source.start(0);

    if (soundData.tick < soundData.count - 1) {
      soundData.tick++;
    } else {
      soundData.tick = 0;
    }
  }

  async base64ToArrayBuffer(base64) {
    const base64Data = base64.split(',')[1];
    const binaryString = atob(base64Data);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
  }

  // Set master volume (0 to 1)
  setMasterVolume(volume) {
    if (!isBrowser) {
      return;
    }
    // Clamp volume between 0 and 1
    const clampedVolume = Math.max(0, Math.min(1, volume));
    if (this.masterGainNode) {
      this.masterGainNode.gain.value = clampedVolume;
    }
  }

  // Get current master volume
  getMasterVolume() {
    if (!isBrowser || !this.masterGainNode) {
      return 0;
    }
    return this.masterGainNode.gain.value;
  }
}

export const aa = new ArcadeAudio();