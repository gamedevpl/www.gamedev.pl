import { PNG } from 'pngjs';

/**
 * Size-appropriate copies of catalog screenshots, baked once at publish time.
 *
 * The arcade shows the same PNG at two very different sizes: a moment thumbnail
 * about 48 CSS pixels wide, and a card poster a few hundred. Serving the original
 * for both means the browser decodes a full screenshot for every near-fold poster
 * (and again for each moment thumb after engage) — and a PNG cannot be decoded
 * partially, so there is no client-side trick that avoids it.
 *
 * Baking rather than resizing per request: a published game's media changes only when
 * somebody merges, so this is a constant being recomputed, and the play path is the
 * one that must never be slow.
 *
 * Pure JS on purpose. A native encoder would be faster, but this runs once per bake in
 * CI rather than per request, and a native dependency is a build and deploy liability
 * out of all proportion to that.
 */

/** Widths the catalog asks for: thumbnail strip, then card poster at 2× its CSS box. */
export const VARIANT_WIDTHS = [96, 640] as const;

export type VariantWidth = (typeof VARIANT_WIDTHS)[number];

export function isVariantWidth(value: number): value is VariantWidth {
  return (VARIANT_WIDTHS as readonly number[]).includes(value);
}

/**
 * Downscale a PNG to `targetWidth`, preserving aspect ratio.
 *
 * Returns null when there is nothing to gain — a source already at or below the target
 * would only be re-encoded, and an unreadable one is not worth failing a bake over
 * (the route falls back to the original, which is exactly today's behaviour).
 */
export function downscalePng(source: Buffer, targetWidth: number): Buffer | null {
  let image: PNG;
  try {
    image = PNG.sync.read(source);
  } catch {
    return null;
  }

  if (image.width <= targetWidth) return null;

  const width = targetWidth;
  const height = Math.max(1, Math.round((image.height * targetWidth) / image.width));
  const out = new PNG({ width, height });

  // Box filter: average every source pixel that lands in the destination pixel. Nearest
  // neighbour is cheaper and looks it — a downscaled screenshot of a pixel-art game
  // turns into aliased noise, which is worse than the cost this exists to remove.
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
          r += image.data[i];
          g += image.data[i + 1];
          b += image.data[i + 2];
          a += image.data[i + 3];
          samples += 1;
        }
      }

      const o = (y * width + x) << 2;
      out.data[o] = Math.round(r / samples);
      out.data[o + 1] = Math.round(g / samples);
      out.data[o + 2] = Math.round(b / samples);
      out.data[o + 3] = Math.round(a / samples);
    }
  }

  return PNG.sync.write(out);
}
