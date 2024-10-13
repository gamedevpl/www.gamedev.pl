import { jsfxr } from '../lib/jsfxr';

const isBrowser = typeof window !== 'undefined';
export class ArcadeAudio {
  constructor() {
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
    if (!isBrowser) {
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
}

export const aa = new ArcadeAudio();

aa.add('arrow', 10, [
  // eslint-disable-next-line no-sparse-arrays
  [0, 0.13, 0.12, 0.21, 0.28, 0.7097, 0.11, 0.4399, , , , 0.2845, 0.6608, , , , , , 1, , , , , 0.32],
]);
// eslint-disable-next-line no-sparse-arrays
aa.add('hitarrow', 10, [[2, , 0.0664, , 0.1176, 0.7984, , -0.5791, , , , , , , , , , , 1, , , 0.0922, , 0.47]]);
// eslint-disable-next-line no-sparse-arrays
aa.add('damage', 10, [[3, , 0.0421, , 0.1467, 0.7815, , -0.4846, , , , , , 0.4464, , , , , 1, , , 0.2247, , 0.47]]);
