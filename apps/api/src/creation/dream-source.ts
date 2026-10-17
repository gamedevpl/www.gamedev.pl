import { MAX_SHOT_BYTES } from '@gamedevpl/contract';
import { encode as encodeJpegData } from 'jpeg-js';
import { decodePng, downscaleRgba, type RgbaImage } from '../platform/image-rgba.js';
import { imageSize, isPng, type ImageSize } from '../platform/image-size.js';
import { DREAM_JPEG_QUALITY, type DreamFrame, type HudRegion } from './dream-frames.js';

// Both models downsample past this anyway; fixed size, predictable cards.
export const MAX_DREAM_SOURCE_EDGE = 1024;
// JPEG rarely needs it: 415 KB of PNG art came out small.
const SHRINK_STEP = 0.75;
const SHRINK_PASSES = 3;

// `scale` maps the gate capture's pixels onto `image`'s.
export type DreamSource =
  { image: DreamFrame; size: ImageSize; original: ImageSize; scale: number } | { refused: string };

function targetWidth(image: RgbaImage): number {
  const edge = Math.max(image.width, image.height);
  return Math.round(image.width * Math.min(1, MAX_DREAM_SOURCE_EDGE / edge));
}

function encodeJpeg(image: RgbaImage): Buffer {
  const data = Buffer.from(image.data.buffer, image.data.byteOffset, image.data.byteLength);
  return encodeJpegData({ data, width: image.width, height: image.height }, DREAM_JPEG_QUALITY).data;
}

// The gate PNG as a JPEG for the shot and models.
export function fitDreamSource(source: Buffer | null): DreamSource {
  if (!source || source.length === 0) return { refused: 'no gate capture stored' };
  if (!isPng(source)) return { refused: 'gate capture is not a PNG' };
  const original = imageSize(source);
  const decoded = original ? decodePng(source) : null;
  if (!original || !decoded) return { refused: `${source.length} bytes and undecodable` };
  let image = downscaleRgba(decoded, targetWidth(decoded)) ?? decoded;
  for (let pass = 0; pass <= SHRINK_PASSES; pass += 1) {
    const jpeg = encodeJpeg(image);
    if (jpeg.length <= MAX_SHOT_BYTES) {
      return {
        image: { data: jpeg.toString('base64'), mediaType: 'image/jpeg' },
        size: { width: image.width, height: image.height },
        original,
        scale: image.width / original.width,
      };
    }
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
