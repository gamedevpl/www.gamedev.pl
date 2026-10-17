import { decodePng, downscaleRgba, encodePng } from '../platform/image-rgba.js';
import { isPng } from '../platform/image-size.js';

// The shot document already holds frames this size.
export const MAX_DREAM_SOURCE_BYTES = 600 * 1024;
// Each pass keeps three quarters of the width.
const SHRINK_STEP = 0.75;
const SHRINK_PASSES = 4;

export type DreamSource = { png: Buffer; shrunk: boolean } | { refused: string };

// Rich art compresses badly; shrink it rather than skip the round.
export function fitDreamSource(source: Buffer | null): DreamSource {
  if (!source || source.length === 0) return { refused: 'no gate capture stored' };
  if (!isPng(source)) return { refused: 'gate capture is not a PNG' };
  if (source.length <= MAX_DREAM_SOURCE_BYTES) return { png: source, shrunk: false };
  const decoded = decodePng(source);
  if (!decoded) return { refused: `${source.length} bytes and undecodable` };
  let image = decoded;
  for (let pass = 0; pass < SHRINK_PASSES; pass += 1) {
    const smaller = downscaleRgba(image, Math.round(image.width * SHRINK_STEP));
    if (!smaller) break;
    image = smaller;
    const png = encodePng(image);
    if (png.length <= MAX_DREAM_SOURCE_BYTES) return { png, shrunk: true };
  }
  return { refused: `${source.length} bytes, still over the limit after shrinking` };
}
