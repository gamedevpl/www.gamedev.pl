import { webpObjectName } from '../platform/image-webp.js';
import type { GameSnapshotReader } from './game-snapshot.js';

// Asked-for width first, then WebP before PNG inside it.
export async function chooseMediaObject(
  reader: Pick<GameSnapshotReader, 'getMediaObjectName'>,
  slug: string,
  filename: string,
  width?: number,
): Promise<string | null> {
  if (!reader.getMediaObjectName) return null;
  const webp = filename.endsWith('.png') ? webpObjectName(filename) : null;

  for (const w of width === undefined ? [undefined] : [width, undefined]) {
    for (const name of webp ? [webp, filename] : [filename]) {
      const object = await reader.getMediaObjectName(slug, name, w);
      if (object) return object;
    }
  }

  return null;
}
