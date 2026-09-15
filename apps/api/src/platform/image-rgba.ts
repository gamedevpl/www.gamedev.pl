import { PNG } from 'pngjs';

// Straight pixels, the one shape every encoder here agrees on.
export interface RgbaImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

// Null rather than throwing: an unreadable screenshot must not fail a bake.
export function decodePng(source: Buffer): RgbaImage | null {
  try {
    const png = PNG.sync.read(source);
    return { data: new Uint8ClampedArray(png.data), width: png.width, height: png.height };
  } catch {
    return null;
  }
}

export function encodePng(image: RgbaImage): Buffer {
  const png = new PNG({ width: image.width, height: image.height });
  png.data = Buffer.from(image.data.buffer, image.data.byteOffset, image.data.byteLength);
  return PNG.sync.write(png);
}

// Box filter; nearest neighbour turns pixel art into aliased noise.
export function downscaleRgba(image: RgbaImage, targetWidth: number): RgbaImage | null {
  if (image.width <= targetWidth) return null;

  const width = targetWidth;
  const height = Math.max(1, Math.round((image.height * targetWidth) / image.width));
  const out = new Uint8ClampedArray(width * height * 4);

  const xRatio = image.width / width;
  const yRatio = image.height / height;

  for (let y = 0; y < height; y++) {
    const srcYStart = Math.floor(y * yRatio);
    const srcYEnd = Math.max(srcYStart + 1, Math.floor((y + 1) * yRatio));

    for (let x = 0; x < width; x++) {
      const srcXStart = Math.floor(x * xRatio);
      const srcXEnd = Math.max(srcXStart + 1, Math.floor((x + 1) * xRatio));

      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let samples = 0;

      for (let sy = srcYStart; sy < srcYEnd && sy < image.height; sy++) {
        for (let sx = srcXStart; sx < srcXEnd && sx < image.width; sx++) {
          const i = (sy * image.width + sx) << 2;
          r += image.data[i]!;
          g += image.data[i + 1]!;
          b += image.data[i + 2]!;
          a += image.data[i + 3]!;
          samples += 1;
        }
      }

      const o = (y * width + x) << 2;
      out[o] = Math.round(r / samples);
      out[o + 1] = Math.round(g / samples);
      out[o + 2] = Math.round(b / samples);
      out[o + 3] = Math.round(a / samples);
    }
  }

  return { data: out, width, height };
}
