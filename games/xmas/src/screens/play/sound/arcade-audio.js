import { jsfxr } from './jsfxr';

const isBrowser = typeof window !== 'undefined';
export class ArcadeAudio {
  constructor() {
    this.enabled = true;
    this.sounds = {};
    if (isBrowser) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
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

    const gainNode = this.audioContext.createGain();
    source.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

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
}

export const aa = new ArcadeAudio();
