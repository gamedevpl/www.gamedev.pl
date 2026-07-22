/**
 * gamedev-assets.js — Procedural Asset & Sprite Sheet Pre-renderer for gamedev.pl
 * Inspired by master branch's tools/asset-generator. Pre-renders code-defined
 * sprites onto offscreen canvases at game boot for 60fps performance.
 */
(function (global) {
  'use strict';

  const Palettes = {
    PICO8: {
      BLACK: '#000000',
      DARK_BLUE: '#1D2B53',
      PURPLE: '#7E2553',
      DARK_GREEN: '#008751',
      BROWN: '#AB5236',
      DARK_GRAY: '#5F574F',
      LIGHT_GRAY: '#C2C3C7',
      WHITE: '#FFF1E8',
      RED: '#FF004D',
      ORANGE: '#FFA300',
      YELLOW: '#FFEC27',
      GREEN: '#00E756',
      BLUE: '#29ADFF',
      INDIGO: '#83769C',
      PINK: '#FF77A8',
      PEACH: '#FFCCAA',
    },
    GAMEBOY: {
      DARKEST: '#0f380f',
      DARK: '#306230',
      LIGHT: '#8bac0f',
      LIGHTEST: '#9bbc0f',
    },
    CYBERPUNK: {
      BG: '#0d0221',
      NEON_PINK: '#ff007f',
      NEON_BLUE: '#00f0ff',
      NEON_GREEN: '#39ff14',
      NEON_YELLOW: '#ffe600',
    },
  };

  class Sprite {
    constructor(name, framesCanvases, width, height) {
      this.name = name;
      this.framesCanvases = framesCanvases;
      this.width = width;
      this.height = height;
      this.frameCount = framesCanvases.length;
    }

    draw(ctx, x, y, frameIndex = 0) {
      const idx = Math.abs(Math.floor(frameIndex)) % this.frameCount;
      const cvs = this.framesCanvases[idx];
      ctx.drawImage(cvs, x, y);
    }
  }

  function createSprite(name, renderFn, options = {}) {
    const width = options.width || 32;
    const height = options.height || 32;
    const frameCount = options.frames || 1;
    const framesCanvases = [];

    for (let f = 0; f < frameCount; f++) {
      const cvs = document.createElement('canvas');
      cvs.width = width;
      cvs.height = height;
      const ctx = cvs.getContext('2d');
      ctx.imageSmoothingEnabled = false;

      renderFn(ctx, f, width, height);
      framesCanvases.push(cvs);
    }

    return new Sprite(name, framesCanvases, width, height);
  }

  // Pre-packaged retro sprites
  const BuiltinSprites = {
    get ship() {
      return createSprite(
        'ship',
        (ctx) => {
          ctx.fillStyle = Palettes.PICO8.BLUE;
          ctx.beginPath();
          ctx.moveTo(16, 0);
          ctx.lineTo(32, 28);
          ctx.lineTo(16, 22);
          ctx.lineTo(0, 28);
          ctx.closePath();
          ctx.fill();

          ctx.fillStyle = Palettes.PICO8.ORANGE;
          ctx.fillRect(12, 22, 8, 8);
        },
        { width: 32, height: 32 },
      );
    },

    get gem() {
      return createSprite(
        'gem',
        (ctx, frame) => {
          const offset = Math.sin(frame * Math.PI) * 2;
          ctx.fillStyle = Palettes.PICO8.YELLOW;
          ctx.beginPath();
          ctx.moveTo(16, 4 + offset);
          ctx.lineTo(28, 16);
          ctx.lineTo(16, 28 - offset);
          ctx.lineTo(4, 16);
          ctx.closePath();
          ctx.fill();

          ctx.fillStyle = Palettes.PICO8.WHITE;
          ctx.fillRect(14, 10, 4, 4);
        },
        { width: 32, height: 32, frames: 2 },
      );
    },

    get rock() {
      return createSprite(
        'rock',
        (ctx) => {
          ctx.fillStyle = Palettes.PICO8.DARK_GRAY;
          ctx.beginPath();
          ctx.arc(16, 16, 14, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = Palettes.PICO8.LIGHT_GRAY;
          ctx.fillRect(8, 8, 6, 6);
          ctx.fillRect(18, 14, 8, 8);
        },
        { width: 32, height: 32 },
      );
    },
  };

  global.GamedevAssets = {
    Palettes,
    Sprite,
    createSprite,
    BuiltinSprites,
  };
})(typeof window !== 'undefined' ? window : globalThis);
