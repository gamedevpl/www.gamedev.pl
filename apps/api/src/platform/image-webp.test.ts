import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { decodePng, downscaleRgba } from './image-rgba.js';
import { encodeWebp, webpObjectName } from './image-webp.js';

// Gradients plus noise, like a procedurally drawn screenshot.
function screenshot(width: number, height: number): Buffer {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) << 2;
      png.data[i] = Math.round((x / width) * 255);
      png.data[i + 1] = Math.round((y / height) * 255);
      png.data[i + 2] = (x * y) % 251;
      png.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

describe('webpObjectName', () => {
  it('names the object beside the PNG, at any width', () => {
    expect(webpObjectName('snapshots/s1/media/g/opening.png')).toBe('snapshots/s1/media/g/opening.webp');
    expect(webpObjectName('snapshots/s1/media/g/w96/opening.png')).toBe('snapshots/s1/media/g/w96/opening.webp');
  });

  // The catalog validates .png; the swap happens after, on the object name.
  it('is case insensitive about the extension it replaces', () => {
    expect(webpObjectName('a/opening.PNG')).toBe('a/opening.webp');
  });
});

describe('encodeWebp', () => {
  it('encodes a real RIFF/WEBP container', async () => {
    const out = (await encodeWebp(decodePng(screenshot(64, 48))!))!;

    expect(out.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(out.subarray(8, 12).toString('ascii')).toBe('WEBP');
  });

  // The whole point: bytes, not pixels.
  it('is smaller than the PNG it came from', async () => {
    const png = screenshot(320, 200);
    const out = (await encodeWebp(decodePng(png)!))!;

    expect(out.length).toBeLessThan(png.length);
  });

  it('keeps the dimensions it was handed', async () => {
    const scaled = downscaleRgba(decodePng(screenshot(320, 200))!, 96)!;
    const out = (await encodeWebp(scaled))!;

    expect(scaled.width).toBe(96);
    expect(out.length).toBeGreaterThan(0);
  });

  // A bake without WebP still writes PNGs to fall back on.
  it('returns null rather than throwing when the encode cannot happen', async () => {
    expect(await encodeWebp({ data: new Uint8ClampedArray(0), width: 0, height: 0 })).toBeNull();
  });
});
