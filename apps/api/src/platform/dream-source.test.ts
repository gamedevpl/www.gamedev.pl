import { randomBytes } from 'node:crypto';
import { MAX_SHOT_BYTES } from '@gamedevpl/contract';
import { describe, expect, it } from 'vitest';
import { encodePng } from './image-rgba.js';
import { pngOf } from './image-size.test.js';
import { imageSize, isJpeg } from './image-size.js';
import { fitDreamSource, MAX_DREAM_SOURCE_EDGE, scaleHudRegions } from './dream-source.js';

// Noise defeats compression, like a very detailed game scene.
function noisePng(width: number, height: number): Buffer {
  return encodePng({ data: new Uint8ClampedArray(randomBytes(width * height * 4)), width, height });
}

function flatPng(width: number, height: number): Buffer {
  return encodePng({ data: new Uint8ClampedArray(width * height * 4).fill(200), width, height });
}

function fitted(png: Buffer) {
  const result = fitDreamSource(png);
  if ('refused' in result) throw new Error(result.refused);
  return { ...result, bytes: Buffer.from(result.image.data, 'base64') };
}

describe('fitDreamSource', () => {
  it('re-encodes a small capture as a JPEG at its own size', () => {
    const result = fitted(flatPng(640, 400));
    expect(result.image.mediaType).toBe('image/jpeg');
    expect(isJpeg(result.bytes)).toBe(true);
    expect(imageSize(result.bytes)).toEqual({ width: 640, height: 400 });
    expect(result).toMatchObject({
      size: { width: 640, height: 400 },
      original: { width: 640, height: 400 },
      scale: 1,
    });
  });

  it('scales a large capture to the fixed edge, keeping its shape', () => {
    const result = fitted(flatPng(1920, 1080));
    expect(result.size).toEqual({ width: MAX_DREAM_SOURCE_EDGE, height: 576 });
    expect(imageSize(result.bytes)).toEqual(result.size);
    expect(result.original).toEqual({ width: 1920, height: 1080 });
    expect(result.scale).toBeCloseTo(1024 / 1920, 5);
  });

  it('keeps busy art under the shot limit', () => {
    const png = noisePng(1024, 1024);
    expect(png.length).toBeGreaterThan(MAX_SHOT_BYTES);
    const result = fitted(png);
    expect(result.bytes.length).toBeLessThanOrEqual(MAX_SHOT_BYTES);
    expect(result.size.width).toBe(result.size.height);
    expect(result.scale).toBe(result.size.width / 1024);
  });

  it('refuses a header too large to decode without decoding it', () => {
    // Declares 20000x20000; decoding would allocate 1.6 GB.
    const huge = pngOf(20000, 20000, { scanlines: Buffer.alloc(1) });
    expect(fitDreamSource(huge)).toEqual({ refused: 'gate capture is too large to decode' });
  });

  it('refuses what is missing, not a PNG, or undecodable', () => {
    expect(fitDreamSource(null)).toEqual({ refused: 'no gate capture stored' });
    expect(fitDreamSource(Buffer.from('nope'))).toEqual({ refused: 'gate capture is not a PNG' });
    expect('refused' in fitDreamSource(flatPng(8, 8).subarray(0, 40))).toBe(true);
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
