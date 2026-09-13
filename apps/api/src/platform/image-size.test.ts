import { describe, expect, it } from 'vitest';
import { crc32, deflateSync } from 'node:zlib';
import { carriesPixels, imageSize, isJpeg, isPng, sameAspectRatio, withinDecodeBudget } from './image-size.js';

function chunk(type: string, body: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length, 0);
  const tagged = Buffer.concat([Buffer.from(type, 'latin1'), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(tagged), 0);
  return Buffer.concat([length, tagged, crc]);
}

interface PngShape {
  depth?: number;
  colorType?: number;
  interlace?: number;
  scanlines?: Buffer;
}

// CRCs always right, so a test isolates one property.
export function pngOf(width: number, height: number, shape: PngShape = {}): Buffer {
  const { depth = 8, colorType = 0, interlace = 0 } = shape;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(depth, 8);
  ihdr.writeUInt8(colorType, 9);
  ihdr.writeUInt8(interlace, 12);
  // Each row is a filter byte then one sample per pixel.
  const scanlines = shape.scanlines ?? Buffer.alloc(height * (width + 1));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(scanlines)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// A real 8-bit greyscale PNG: valid IHDR, deflated scanlines, correct CRCs.
export function pngHeader(width: number, height: number): Buffer {
  return pngOf(width, height);
}

// Structure a decoder accepts, wrapped around bytes deflate rejects.
export function corruptPng(width: number, height: number): Buffer {
  const whole = pngHeader(width, height);
  return Buffer.concat([whole.subarray(0, 33), chunk('IDAT', Buffer.from([1, 2, 3, 4])), whole.subarray(-12)]);
}

// Decodes cleanly, to fewer rows than the header promised.
export function shortPng(width: number, height: number): Buffer {
  return pngOf(width, height, { scanlines: Buffer.alloc((height - 1) * (width + 1)) });
}

// Everything but the pixels: measures fine, renders nothing.
export function headerOnlyPng(width: number, height: number): Buffer {
  const whole = pngHeader(width, height);
  return Buffer.concat([whole.subarray(0, 33), whole.subarray(whole.length - 12)]);
}

export function headerOnlyJpeg(width: number, height: number): Buffer {
  const whole = jpegHeader(width, height);
  const sos = whole.indexOf(Buffer.from([0xff, 0xda]));
  return Buffer.concat([whole.subarray(0, sos), Buffer.from([0xff, 0xd9])]);
}

// The same bytes without their terminator, as a short read leaves them.
export function truncated(bytes: Buffer): Buffer {
  return bytes.subarray(0, bytes.length - 8);
}

export function jpegHeader(width: number, height: number): Buffer {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
  // One quantization table and one Huffman table, as a decoder needs.
  const dqt = Buffer.concat([Buffer.from([0xff, 0xdb, 0x00, 0x43, 0x00]), Buffer.alloc(64, 1)]);
  const dht = Buffer.concat([Buffer.from([0xff, 0xc4, 0x00, 0x1f, 0x00]), Buffer.alloc(28, 1)]);
  const sof = Buffer.alloc(19);
  sof.writeUInt8(0xff, 0);
  sof.writeUInt8(0xc0, 1);
  sof.writeUInt16BE(17, 2);
  sof.writeUInt8(8, 4);
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  // Three components; a frame that draws none is not a picture.
  sof.writeUInt8(3, 9);
  // SOS, a little entropy data, then EOI: pixels included.
  const sos = Buffer.from([0xff, 0xda, 0x00, 0x08, 1, 1, 0, 0, 63, 0]);
  const scan = Buffer.from([0x12, 0x34, 0x56]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, dqt, dht, sof, sos, scan, Buffer.from([0xff, 0xd9])]);
}

describe('imageSize', () => {
  it('reads PNG dimensions from IHDR', () => {
    const bytes = pngHeader(900, 600);
    expect(isPng(bytes)).toBe(true);
    expect(isJpeg(bytes)).toBe(false);
    expect(imageSize(bytes)).toEqual({ width: 900, height: 600 });
  });

  it('reads JPEG dimensions from the first frame header', () => {
    const bytes = jpegHeader(1024, 768);
    expect(isJpeg(bytes)).toBe(true);
    expect(imageSize(bytes)).toEqual({ width: 1024, height: 768 });
  });

  it('returns null for anything else', () => {
    expect(imageSize(Buffer.from('GIF89a'))).toBeNull();
    expect(imageSize(Buffer.alloc(0))).toBeNull();
    expect(imageSize(pngHeader(1, 1).subarray(0, 12))).toBeNull();
  });
});

describe('sameAspectRatio', () => {
  it('accepts the same ratio at a different size', () => {
    expect(sameAspectRatio({ width: 900, height: 900 }, { width: 1024, height: 1024 })).toBe(true);
    expect(sameAspectRatio({ width: 1600, height: 900 }, { width: 1280, height: 720 })).toBe(true);
  });

  it('rejects a frame that changed shape', () => {
    expect(sameAspectRatio({ width: 900, height: 900 }, { width: 1024, height: 768 })).toBe(false);
    expect(sameAspectRatio({ width: 900, height: 0 }, { width: 900, height: 900 })).toBe(false);
  });
});

describe('carriesPixels', () => {
  it('accepts a PNG whose scanlines decode to the size its header promised', () => {
    expect(carriesPixels(pngHeader(900, 900))).toBe(true);
    expect(carriesPixels(jpegHeader(900, 900))).toBe(true);
  });

  it('rejects a header with no pixel data behind it', () => {
    expect(carriesPixels(headerOnlyPng(900, 900))).toBe(false);
    expect(carriesPixels(headerOnlyJpeg(900, 900))).toBe(false);
  });

  it('rejects IDAT bytes that are not deflate, however well wrapped', () => {
    const corrupt = corruptPng(900, 900);
    // Measures and walks like a picture; only the decode tells them apart.
    expect(imageSize(corrupt)).toEqual({ width: 900, height: 900 });
    expect(carriesPixels(corrupt)).toBe(false);
  });

  it('rejects a clean decode that is short of the rows IHDR declared', () => {
    expect(carriesPixels(shortPng(900, 900))).toBe(false);
  });

  it('rejects a bit depth its colour type does not allow, data notwithstanding', () => {
    // Truecolour at one bit: 338 bytes and a filter byte a row.
    const sized = pngOf(900, 900, { depth: 1, colorType: 2, scanlines: Buffer.alloc(900 * 339) });
    // Lengths balance and the CRCs are right; no decoder accepts the pair.
    expect(carriesPixels(sized)).toBe(false);
  });

  it('refuses dimensions too large to be a frame, before zlib is asked', () => {
    const huge = Buffer.from(pngHeader(4, 4));
    huge.writeUInt32BE(40_000, 16);
    huge.writeUInt32BE(40_000, 20);
    // 1.6 GB of declared pixels; the cap answers without allocating them.
    expect(carriesPixels(huge)).toBe(false);
  });

  it('refuses a frame that packs small and expands past the service memory', () => {
    // One bit deep: 38 MiB of scanlines, 1.2 GiB decoded.
    const width = 24_000;
    const height = 13_500;
    const scanlines = Buffer.alloc(height * (Math.ceil(width / 8) + 1));
    const bomb = pngOf(width, height, { depth: 1, scanlines });
    // Under the upload cap; only this guard precedes pngjs.
    expect(bomb.length).toBeLessThan(600 * 1024);
    expect(carriesPixels(bomb)).toBe(false);
    // Asserted on the budget itself: refusing before the allocation is the point.
    expect(withinDecodeBudget({ width, height })).toBe(false);
    expect(withinDecodeBudget({ width: 1920, height: 1080 })).toBe(true);
  });

  it('sizes an interlaced frame by its seven passes, not by its rows', () => {
    // Eight by eight owes 79 bytes across Adam7, not 72.
    const interlaced = (raw: number) => pngOf(8, 8, { interlace: 1, scanlines: Buffer.alloc(raw) });
    expect(carriesPixels(interlaced(79))).toBe(true);
    expect(carriesPixels(interlaced(72))).toBe(false);
    // The hole this closes: one byte, declared interlaced, once passed.
    expect(carriesPixels(interlaced(1))).toBe(false);
  });

  it('rejects a scanline filter no decoder implements', () => {
    // Filters run 0 to 4; lengths and CRCs say nothing.
    const filtered = pngOf(8, 8, { scanlines: Buffer.alloc(8 * 9, 5) });
    expect(carriesPixels(filtered)).toBe(false);
  });

  it('rejects indexed colour with no palette to index into', () => {
    const noPalette = pngOf(8, 8, { colorType: 3, scanlines: Buffer.alloc(8 * 9) });
    expect(carriesPixels(noPalette)).toBe(false);
  });

  it('rejects a chunk whose CRC does not match its bytes', () => {
    const bytes = Buffer.from(pngHeader(8, 8));
    bytes.writeUInt32BE(0xdeadbeef, 29);
    expect(carriesPixels(bytes)).toBe(false);
  });

  it('rejects bytes appended after IEND, which a frame of ours never has', () => {
    const padded = Buffer.concat([pngHeader(900, 900), Buffer.from('trailing')]);
    expect(carriesPixels(padded)).toBe(false);
  });

  it('rejects a truncated file of either kind', () => {
    expect(carriesPixels(truncated(pngHeader(900, 900)))).toBe(false);
    expect(carriesPixels(truncated(jpegHeader(900, 900)))).toBe(false);
  });
});
