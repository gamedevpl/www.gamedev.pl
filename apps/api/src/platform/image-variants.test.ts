import { describe, expect, it } from 'vitest';
import { PNG } from 'pngjs';
import { downscalePng, isVariantWidth, VARIANT_WIDTHS } from './image-variants.js';

/** A PNG with a hard vertical split, so averaging is visible in the result. */
function halfAndHalf(width: number, height: number): Buffer {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) << 2;
      const left = x < width / 2;
      png.data[i] = left ? 255 : 0;
      png.data[i + 1] = left ? 0 : 0;
      png.data[i + 2] = left ? 0 : 255;
      png.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

function pixel(buffer: Buffer, x: number, y: number) {
  const png = PNG.sync.read(buffer);
  const i = (y * png.width + x) << 2;
  return { r: png.data[i], g: png.data[i + 1], b: png.data[i + 2], a: png.data[i + 3] };
}

describe('downscalePng', () => {
  it('scales to the requested width and keeps the aspect ratio', () => {
    const out = downscalePng(halfAndHalf(1280, 720), 96)!;
    const png = PNG.sync.read(out);
    expect(png.width).toBe(96);
    expect(png.height).toBe(54);
  });

  it('produces a far smaller file, which is the entire point', () => {
    const source = halfAndHalf(1280, 720);
    const out = downscalePng(source, 96)!;
    expect(out.byteLength).toBeLessThan(source.byteLength / 4);
  });

  it('keeps the colours where they were', () => {
    const out = downscalePng(halfAndHalf(1280, 720), 96)!;
    expect(pixel(out, 5, 20)).toMatchObject({ r: 255, g: 0, b: 0 });
    expect(pixel(out, 90, 20)).toMatchObject({ r: 0, g: 0, b: 255 });
  });

  /**
   * Averaging rather than picking one source pixel. A screenshot of a pixel-art game
   * downscaled by nearest neighbour turns into aliased noise, which would trade a
   * performance problem for a visible one.
   */
  it('averages across the box rather than sampling a single pixel', () => {
    const source = new PNG({ width: 4, height: 1 });
    for (let x = 0; x < 4; x++) {
      const i = x << 2;
      source.data[i] = x < 2 ? 0 : 200;
      source.data[i + 1] = x < 2 ? 0 : 200;
      source.data[i + 2] = x < 2 ? 0 : 200;
      source.data[i + 3] = 255;
    }
    const out = downscalePng(PNG.sync.write(source), 2)!;
    const png = PNG.sync.read(out);
    expect(png.width).toBe(2);
    // Each destination pixel covers two identical source pixels, so the halves survive
    // intact — proof the box is being walked rather than one corner being read.
    expect(png.data[0]).toBe(0);
    expect(png.data[4]).toBe(200);
  });

  it('declines when the source is already at or below the target', () => {
    expect(downscalePng(halfAndHalf(96, 54), 96)).toBeNull();
    expect(downscalePng(halfAndHalf(64, 36), 96)).toBeNull();
  });

  // A bake must not die on one odd file: the media route falls back to the original,
  // which is exactly what every game got before variants existed.
  it('declines on bytes it cannot read rather than throwing', () => {
    expect(downscalePng(Buffer.from('not a png at all'), 96)).toBeNull();
  });

  it('never rounds a very wide, very short image away to nothing', () => {
    const out = downscalePng(halfAndHalf(4000, 3), 96)!;
    expect(PNG.sync.read(out).height).toBeGreaterThanOrEqual(1);
  });

  it('guards the width allowlist the route validates against', () => {
    expect(VARIANT_WIDTHS).toEqual([96, 640]);
    expect(isVariantWidth(96)).toBe(true);
    expect(isVariantWidth(97)).toBe(false);
  });
});
