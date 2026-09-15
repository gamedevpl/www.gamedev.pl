import { mediaContentType, type GameSnapshotWriter } from './game-snapshot.js';
import { decodePng, downscaleRgba, encodePng, type RgbaImage } from '../platform/image-rgba.js';
import { encodeWebp, webpObjectName } from '../platform/image-webp.js';
import { VARIANT_WIDTHS } from '../platform/image-variants.js';

// Both widths and both formats. See docs/deployment.md 'Media egress'.
export interface BakeMediaArgs {
  writer: GameSnapshotWriter;
  snapshotId: string;
  slug: string;
  filename: string;
  body: Buffer;
}

export async function bakeMediaCopies(args: BakeMediaArgs): Promise<number> {
  const { writer, snapshotId, slug, filename, body } = args;

  await writer.putMedia(snapshotId, slug, filename, { body, contentType: mediaContentType(filename) });
  let written = 1;

  if (!filename.endsWith('.png')) return written;

  const decoded = decodePng(body);
  if (!decoded) return written;

  written += await putWebp({ writer, snapshotId, slug, filename, image: decoded });

  for (const width of VARIANT_WIDTHS) {
    const scaled = downscaleRgba(decoded, width);
    if (!scaled) continue;
    await writer.putMedia(snapshotId, slug, filename, { body: encodePng(scaled), contentType: 'image/png' }, width);
    written += 1;
    written += await putWebp({ writer, snapshotId, slug, filename, image: scaled, width });
  }

  return written;
}

async function putWebp(args: {
  writer: GameSnapshotWriter;
  snapshotId: string;
  slug: string;
  filename: string;
  image: RgbaImage;
  width?: number;
}): Promise<number> {
  const encoded = await encodeWebp(args.image);
  if (!encoded) return 0;
  const name = webpObjectName(args.filename);
  await args.writer.putMedia(
    args.snapshotId,
    args.slug,
    name,
    { body: encoded, contentType: mediaContentType(name) },
    args.width,
  );
  return 1;
}
