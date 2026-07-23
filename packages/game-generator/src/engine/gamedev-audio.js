/**
 * gamedev-audio.js — In-Memory Web Audio API Sound Synthesizer for gamedev.pl
 * Zero external network downloads or audio files. Synthesizes retro sound effects
 * (coin, jump, laser, explosion, hit, powerup) directly in-memory.
 */
(function (global) {
  'use strict';

  class SoundSynthesizer {
    constructor() {
      this.ctx = null;
    }

    _initCtx() {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          this.ctx = new AudioCtx();
        }
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    }

    play(type = 'coin') {
      try {
        this._initCtx();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        switch (type) {
          case 'coin':
            osc.type = 'sine';
            osc.frequency.setValueAtTime(987, now);
            osc.frequency.setValueAtTime(1318, now + 0.08);
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
            osc.start(now);
            osc.stop(now + 0.2);
            break;

          case 'jump':
            osc.type = 'square';
            osc.frequency.setValueAtTime(150, now);
            osc.frequency.exponentialRampToValueAtTime(600, now + 0.15);
            gain.gain.setValueAtTime(0.25, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
            osc.start(now);
            osc.stop(now + 0.15);
            break;

          case 'laser':
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(800, now);
            osc.frequency.exponentialRampToValueAtTime(100, now + 0.12);
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
            osc.start(now);
            osc.stop(now + 0.12);
            break;

          case 'explosion':
            this._playNoise(0.3);
            break;

          case 'hit':
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(250, now);
            osc.frequency.linearRampToValueAtTime(50, now + 0.1);
            gain.gain.setValueAtTime(0.4, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
            osc.start(now);
            osc.stop(now + 0.1);
            break;

          default:
            osc.type = 'sine';
            osc.frequency.setValueAtTime(440, now);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
            osc.start(now);
            osc.stop(now + 0.1);
            break;
        }
      } catch (err) {
        // Audio playback failure (e.g. strict autoplay policy before gesture)
      }
    }

    _playNoise(duration = 0.2) {
      if (!this.ctx) return;
      const bufferSize = this.ctx.sampleRate * duration;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = buffer.getChannelData(0);

      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      const whiteNoise = this.ctx.createBufferSource();
      whiteNoise.buffer = buffer;

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

      whiteNoise.connect(gain);
      gain.connect(this.ctx.destination);
      whiteNoise.start();
    }
  }

  global.GamedevAudio = new SoundSynthesizer();
})(typeof window !== 'undefined' ? window : globalThis);
