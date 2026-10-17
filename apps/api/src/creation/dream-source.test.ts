import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { encodePng } from '../platform/image-rgba.js';
import { fitDreamSource, MAX_DREAM_SOURCE_BYTES, MAX_DREAM_SOURCE_EDGE, scaleHudRegions } from './dream-source.js';

// Noise defeats PNG compression, like a detailed game scene.
function noisePng(width: number, height: number): Buffer {
  return encodePng({ data: new Uint8ClampedArray(randomBytes(width * height * 4)), width, height });
}

function flatPng(width: number, height: number): Buffer {
  return encodePng({ data: new Uint8ClampedArray(width * height * 4).fill(200), width, height });
}

describe('fitDreamSource', () => {
  it('passes a small capture through untouched', () => {
    const png = flatPng(640, 360);
    expect(fitDreamSource(png)).toEqual({
      png,
      size: { width: 640, height: 360 },
      original: { width: 640, height: 360 },
      scale: 1,
    });
  });

  it('scales a large capture to the fixed edge, keeping its shape', () => {
    const fitted = fitDreamSource(flatPng(1920, 1080));
    if ('refused' in fitted) throw new Error(fitted.refused);
    expect(fitted.size).toEqual({ width: MAX_DREAM_SOURCE_EDGE, height: 576 });
    expect(fitted.original).toEqual({ width: 1920, height: 1080 });
    expect(fitted.scale).toBeCloseTo(1024 / 1920, 5);
  });

  it('shrinks busy art further until the shot fits', () => {
    const png = noisePng(400, 400);
    expect(png.length).toBeGreaterThan(MAX_DREAM_SOURCE_BYTES);
    const fitted = fitDreamSource(png);
    if ('refused' in fitted) throw new Error(fitted.refused);
    expect(fitted.png.length).toBeLessThanOrEqual(MAX_DREAM_SOURCE_BYTES);
    expect(fitted.size.width).toBe(fitted.size.height);
    expect(fitted.scale).toBe(fitted.size.width / 400);
  });

  it('refuses what is missing or not a PNG', () => {
    expect(fitDreamSource(null)).toEqual({ refused: 'no gate capture stored' });
    expect(fitDreamSource(Buffer.from('nope'))).toEqual({ refused: 'gate capture is not a PNG' });
  });
});

describe('scaleHudRegions', () => {
  it('maps declared rectangles onto the scaled capture, keeping labels', () => {
    expect(scaleHudRegions([{ x: 100, y: 40, w: 300, h: 60, label: 'score' }], 0.5)).toEqual([
      { x: 50, y: 20, w: 150, h: 30, label: 'score' },
    ]);
  });

  it('never collapses a sliver to nothing', () => {
    expect(scaleHudRegions([{ x: 10, y: 10, w: 1, h: 1 }], 0.25)).toEqual([{ x: 3, y: 3, w: 1, h: 1 }]);
  });
});
