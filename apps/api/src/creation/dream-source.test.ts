import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { encodePng } from '../platform/image-rgba.js';
import { imageSize } from '../platform/image-size.js';
import { fitDreamSource, MAX_DREAM_SOURCE_BYTES } from './dream-source.js';

// Noise defeats PNG compression, like a detailed game scene.
function noisePng(width: number, height: number): Buffer {
  return encodePng({ data: new Uint8ClampedArray(randomBytes(width * height * 4)), width, height });
}

describe('fitDreamSource', () => {
  it('passes a capture under the limit through untouched', () => {
    const png = noisePng(64, 64);
    expect(fitDreamSource(png)).toEqual({ png, shrunk: false });
  });

  it('shrinks a capture over the old 300 KB shot limit, keeping its shape', () => {
    const png = noisePng(640, 360);
    expect(png.length).toBeGreaterThan(MAX_DREAM_SOURCE_BYTES);
    const fitted = fitDreamSource(png);
    if ('refused' in fitted) throw new Error(fitted.refused);
    expect(fitted.shrunk).toBe(true);
    expect(fitted.png.length).toBeLessThanOrEqual(MAX_DREAM_SOURCE_BYTES);
    const size = imageSize(fitted.png)!;
    expect(size.width / size.height).toBeCloseTo(640 / 360, 1);
  });

  it('refuses what is missing or not a PNG', () => {
    expect(fitDreamSource(null)).toEqual({ refused: 'no gate capture stored' });
    expect(fitDreamSource(Buffer.from('nope'))).toEqual({ refused: 'gate capture is not a PNG' });
  });
});
