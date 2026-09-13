import { describe, expect, it } from 'vitest';
import { imageSize, isJpeg, isPng, sameAspectRatio } from './image-size.js';

export function pngHeader(width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(13, 0);
  const idatLength = Buffer.alloc(4);
  idatLength.writeUInt32BE(4, 0);
  const idat = Buffer.concat([idatLength, Buffer.from('IDAT'), Buffer.from([1, 2, 3, 4]), Buffer.alloc(4)]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    length,
    Buffer.from('IHDR'),
    ihdr,
    Buffer.alloc(4),
    // Pixels live in IDAT; `headerOnly` is how a test leaves them out.
    idat,
    Buffer.concat([Buffer.alloc(4), Buffer.from('IEND'), Buffer.alloc(4)]),
  ]);
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
