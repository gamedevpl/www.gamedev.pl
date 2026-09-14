import { webpObjectName } from '../platform/image-webp.js';
import type { GameSnapshotReader } from './game-snapshot.js';

// Asked-for width first, then WebP before PNG inside it.
export async function chooseMediaObject(
  reader: Pick<GameSnapshotReader, 'getMediaObjectName'>,
  slug: string,
  filename: string,
  width?: number,
): Promise<string | null> {
  const probe = reader.getMediaObjectName;
  if (!probe) return null;
  const names = filename.endsWith('.png') ? [webpObjectName(filename), filename] : [filename];

  // Formats together, widths in order: two round trips, never four.
  for (const w of width === undefined ? [undefined] : [width, undefined]) {
    const found = await Promise.all(names.map((name) => probe.call(reader, slug, name, w)));
    const hit = found.find((object) => object !== null);
    if (hit) return hit;
  }

  return null;
}
