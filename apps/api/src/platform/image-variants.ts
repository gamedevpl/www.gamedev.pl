import { decodePng, downscaleRgba, encodePng } from './image-rgba.js';

/**
 * Size-appropriate copies of catalog screenshots, baked once at publish time.
 *
 * The arcade shows the same screenshot at two very different sizes: a moment thumbnail
 * about 48 CSS pixels wide, and a card poster a few hundred. Serving the original for
 * both means the browser decodes a full screenshot for every near-fold poster (and again
 * for each moment thumb after engage) — and a PNG cannot be decoded partially, so there
 * is no client-side trick that avoids it.
 *
 * Baking rather than resizing per request: a published game's media changes only when
 * somebody merges, so this is a constant being recomputed, and the play path is the one
 * that must never be slow.
 *
 * The pixel work lives in image-rgba.ts; the encoders are pure JS and WASM on purpose.
 * A native encoder would be faster, but this runs once per bake in CI rather than per
 * request, and node-gyp is a build and deploy liability out of proportion to that.
 */

// Every width the web asks for; a missing one serves the original.
export const VARIANT_WIDTHS = [96, 160, 320, 640] as const;

export type VariantWidth = (typeof VARIANT_WIDTHS)[number];

export function isVariantWidth(value: number): value is VariantWidth {
  return (VARIANT_WIDTHS as readonly number[]).includes(value);
}

// Null when the source is unreadable, or already no wider than the target.
export function downscalePng(source: Buffer, targetWidth: number): Buffer | null {
  const decoded = decodePng(source);
  if (!decoded) return null;
  const scaled = downscaleRgba(decoded, targetWidth);
  return scaled ? encodePng(scaled) : null;
}
