import { decodePng, downscaleRgba, encodePng, type RgbaImage } from '../platform/image-rgba.js';
import { MAX_PROPOSAL_FRAME_BYTES } from '../platform/dream-shots.js';
import { imageSize, isPng, type ImageSize } from '../platform/image-size.js';
import type { HudRegion } from './dream-frames.js';

// Both models downsample past this anyway; fixed size, predictable cards.
export const MAX_DREAM_SOURCE_EDGE = 1024;
// Its frames' limit: 640x400 of busy art is already 415 KB.
export const MAX_DREAM_SOURCE_BYTES = MAX_PROPOSAL_FRAME_BYTES;
// Busier still overflows it; each pass keeps three quarters.
const SHRINK_STEP = 0.75;
const SHRINK_PASSES = 3;

// `scale` maps the gate capture's pixels onto `png`'s.
export type DreamSource = { png: Buffer; size: ImageSize; original: ImageSize; scale: number } | { refused: string };

function targetWidth(image: RgbaImage): number {
  const edge = Math.max(image.width, image.height);
  return Math.round(image.width * Math.min(1, MAX_DREAM_SOURCE_EDGE / edge));
}

// The gate capture, sized for both the shot and the models.
export function fitDreamSource(source: Buffer | null): DreamSource {
  if (!source || source.length === 0) return { refused: 'no gate capture stored' };
  if (!isPng(source)) return { refused: 'gate capture is not a PNG' };
  const original = imageSize(source);
  if (!original) return { refused: 'gate capture is unmeasurable' };
  const fits = Math.max(original.width, original.height) <= MAX_DREAM_SOURCE_EDGE;
  if (fits && source.length <= MAX_DREAM_SOURCE_BYTES) return { png: source, size: original, original, scale: 1 };
  const decoded = decodePng(source);
  if (!decoded) return { refused: `${source.length} bytes and undecodable` };
  let image = downscaleRgba(decoded, targetWidth(decoded)) ?? decoded;
  for (let pass = 0; pass <= SHRINK_PASSES; pass += 1) {
    const png = encodePng(image);
    const size = { width: image.width, height: image.height };
    if (png.length <= MAX_DREAM_SOURCE_BYTES) return { png, size, original, scale: image.width / original.width };
    const smaller = downscaleRgba(image, Math.round(image.width * SHRINK_STEP));
    if (!smaller) break;
    image = smaller;
  }
  return { refused: `${source.length} bytes, still over the shot limit after scaling` };
}

// CAPTURE.json declares HUD in the gate capture's own pixels.
export function scaleHudRegions(regions: readonly HudRegion[], scale: number): HudRegion[] {
  if (scale === 1) return [...regions];
  return regions.map((region) => {
    const x = Math.round(region.x * scale);
    const y = Math.round(region.y * scale);
    const scaled: HudRegion = {
      x,
      y,
      w: Math.max(1, Math.round((region.x + region.w) * scale) - x),
      h: Math.max(1, Math.round((region.y + region.h) * scale) - y),
    };
    if (region.label) scaled.label = region.label;
    return scaled;
  });
}
