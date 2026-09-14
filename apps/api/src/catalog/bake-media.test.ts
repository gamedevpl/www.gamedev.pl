import { PNG } from 'pngjs';
import { describe, expect, it, vi } from 'vitest';
import { bakeMediaCopies } from './bake-media.js';
import { VARIANT_WIDTHS } from '../platform/image-variants.js';
import type { GameSnapshotWriter } from './game-snapshot.js';

function screenshot(width: number, height: number): Buffer {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) << 2;
      png.data[i] = Math.round((x / width) * 255);
      png.data[i + 1] = Math.round((y / height) * 255);
      png.data[i + 2] = (x * y) % 251;
      png.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

function recordingWriter() {
  const written: { name: string; width?: number; contentType: string; bytes: number }[] = [];
  const putMedia = vi.fn(async (_id: string, _slug: string, filename: string, media, width?: number) => {
    written.push({ name: filename, width, contentType: media.contentType, bytes: media.body.length });
  });
  return { writer: { putMedia } as unknown as GameSnapshotWriter, written };
}

const bake = async (body: Buffer, filename = 'opening.png') => {
  const { writer, written } = recordingWriter();
  const count = await bakeMediaCopies({ writer, snapshotId: 's1', slug: 'g', filename, body });
  return { written, count };
};

describe('what one screenshot leaves in the snapshot', () => {
  it('writes a WebP beside the PNG at every width, and the original', async () => {
    const { written, count } = await bake(screenshot(1280, 800));
    const shape = (w?: number) => written.filter((o) => o.width === w).map((o) => o.name).sort();

    expect(shape(undefined)).toEqual(['opening.png', 'opening.webp']);
    for (const width of VARIANT_WIDTHS) {
      expect(shape(width)).toEqual(['opening.png', 'opening.webp']);
    }
    expect(count).toBe(written.length);
  });

  it('labels the WebP copies so the bucket serves the right type', async () => {
    const { written } = await bake(screenshot(640, 400));
    const webp = written.filter((o) => o.name.endsWith('.webp'));

    expect(webp.length).toBeGreaterThan(0);
    expect(webp.every((o) => o.contentType === 'image/webp')).toBe(true);
    expect(written.filter((o) => o.name.endsWith('.png')).every((o) => o.contentType === 'image/png')).toBe(true);
  });

  // The reason this exists at all.
  it('makes every WebP smaller than the PNG of the same width', async () => {
    const { written } = await bake(screenshot(1280, 800));

    for (const png of written.filter((o) => o.name.endsWith('.png'))) {
      const webp = written.find((o) => o.name.endsWith('.webp') && o.width === png.width)!;
      expect(webp.bytes).toBeLessThan(png.bytes);
    }
  });

  // Skipping a width that would upscale is what older snapshots already do.
  it('skips widths at or above the source', async () => {
    const { written } = await bake(screenshot(100, 60));

    expect(written.map((o) => o.width)).toEqual([undefined, undefined, 96, 96]);
  });

  it('leaves video alone — no variants, no second format', async () => {
    const { written, count } = await bake(Buffer.from('not-an-image'), 'gameplay.mp4');

    expect(written).toEqual([{ name: 'gameplay.mp4', width: undefined, contentType: 'video/mp4', bytes: 12 }]);
    expect(count).toBe(1);
  });

  // An unreadable PNG must cost its variants, never the bake.
  it('still writes the original when the bytes cannot be decoded', async () => {
    const { written, count } = await bake(Buffer.from('not-a-png'));

    expect(written.map((o) => o.name)).toEqual(['opening.png']);
    expect(count).toBe(1);
  });
});
