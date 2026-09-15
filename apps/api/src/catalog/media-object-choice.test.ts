import { describe, expect, it, vi } from 'vitest';
import { chooseMediaObject } from './media-object-choice.js';

// Stands in for a snapshot holding exactly these objects.
function readerHolding(...objects: string[]) {
  const held = new Set(objects);
  const getMediaObjectName = vi.fn(async (slug: string, filename: string, width?: number) => {
    const key = width === undefined ? `${slug}/${filename}` : `${slug}/w${width}/${filename}`;
    return held.has(key) ? `snapshots/s1/media/${key}` : null;
  });
  return { reader: { getMediaObjectName }, getMediaObjectName };
}

const at = (key: string) => `snapshots/s1/media/${key}`;

describe('which baked copy the redirect points at', () => {
  it('prefers WebP at the asked-for width', async () => {
    const { reader } = readerHolding('g/w320/opening.png', 'g/w320/opening.webp', 'g/opening.png');

    expect(await chooseMediaObject(reader, 'g', 'opening.png', 320)).toBe(at('g/w320/opening.webp'));
  });

  // Snapshots baked before WebP hold only the PNG.
  it('falls back to the PNG at that width', async () => {
    const { reader } = readerHolding('g/w320/opening.png', 'g/opening.png');

    expect(await chooseMediaObject(reader, 'g', 'opening.png', 320)).toBe(at('g/w320/opening.png'));
  });

  // Width dominates format: a 640px WebP beats nothing here.
  it('takes the right width before the better format', async () => {
    const { reader } = readerHolding('g/w96/opening.png', 'g/opening.webp');

    expect(await chooseMediaObject(reader, 'g', 'opening.png', 96)).toBe(at('g/w96/opening.png'));
  });

  it('drops to the original when that width was never baked', async () => {
    const { reader } = readerHolding('g/opening.webp', 'g/opening.png');

    expect(await chooseMediaObject(reader, 'g', 'opening.png', 640)).toBe(at('g/opening.webp'));
  });

  it('asks only about the original when no width was requested', async () => {
    const { reader, getMediaObjectName } = readerHolding('g/opening.png');

    expect(await chooseMediaObject(reader, 'g', 'opening.png')).toBe(at('g/opening.png'));
    expect(getMediaObjectName.mock.calls.every(([, , width]) => width === undefined)).toBe(true);
  });

  // Video has no variants and no second format.
  it('never invents a WebP for an mp4', async () => {
    const { reader, getMediaObjectName } = readerHolding('g/gameplay.mp4');

    expect(await chooseMediaObject(reader, 'g', 'gameplay.mp4')).toBe(at('g/gameplay.mp4'));
    expect(getMediaObjectName.mock.calls.map(([, name]) => name)).toEqual(['gameplay.mp4']);
  });

  // Each probe is a GCS metadata call when cold.
  it('never costs more than two round trips', async () => {
    const { reader, getMediaObjectName } = readerHolding('g/opening.png');
    const order: number[] = [];
    getMediaObjectName.mockImplementation(async (slug: string, name: string, w?: number) => {
      order.push(order.length);
      return w === undefined && name === 'opening.png' ? at('g/opening.png') : null;
    });

    await chooseMediaObject(reader, 'g', 'opening.png', 640);
    const widths = getMediaObjectName.mock.calls.map(([, , w]) => w);

    // Both formats at 640, then both at the original.
    expect(widths).toEqual([640, 640, undefined, undefined]);
  });

  it('stops after the first wave when that width has a copy', async () => {
    const { reader, getMediaObjectName } = readerHolding('g/w320/opening.webp', 'g/opening.png');

    await chooseMediaObject(reader, 'g', 'opening.png', 320);

    expect(getMediaObjectName.mock.calls.map(([, , w]) => w)).toEqual([320, 320]);
  });

  it('is null when the snapshot holds nothing for that file', async () => {
    const { reader } = readerHolding();

    expect(await chooseMediaObject(reader, 'g', 'opening.png', 320)).toBeNull();
  });
});
