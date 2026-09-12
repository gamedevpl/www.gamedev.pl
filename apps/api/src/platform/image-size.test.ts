import { describe, expect, it } from 'vitest';
import { imageSize, isJpeg, isPng, sameAspectRatio } from './image-size.js';

export function pngHeader(width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(13, 0);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    length,
    Buffer.from('IHDR'),
    ihdr,
    Buffer.alloc(4),
  ]);
}

export function jpegHeader(width: number, height: number): Buffer {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
  const sof = Buffer.alloc(19);
  sof.writeUInt8(0xff, 0);
  sof.writeUInt8(0xc0, 1);
  sof.writeUInt16BE(17, 2);
  sof.writeUInt8(8, 4);
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof]);
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
