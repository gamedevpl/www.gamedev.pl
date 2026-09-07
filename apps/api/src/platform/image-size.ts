export interface ImageSize {
  width: number;
  height: number;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function isPng(bytes: Buffer): boolean {
  return bytes.length >= PNG_SIGNATURE.length && bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE);
}

export function isJpeg(bytes: Buffer): boolean {
  return bytes.length >= 3 && bytes.readUInt8(0) === 0xff && bytes.readUInt8(1) === 0xd8 && bytes.readUInt8(2) === 0xff;
}

// Header-only read; null for anything but PNG or JPEG.
export function imageSize(bytes: Buffer): ImageSize | null {
  if (isPng(bytes)) {
    if (bytes.length < 24) return null;
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (isJpeg(bytes)) {
    let offset = 2;
    while (offset + 9 <= bytes.length) {
      if (bytes.readUInt8(offset) !== 0xff) return null;
      const marker = bytes.readUInt8(offset + 1);
      // Standalone markers carry no length field.
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2;
        continue;
      }
      const length = bytes.readUInt16BE(offset + 2);
      const isFrameHeader = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isFrameHeader) {
        return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
      }
      offset += 2 + length;
    }
  }
  return null;
}

// True when both frames share an aspect ratio within `tolerance`.
export function sameAspectRatio(a: ImageSize, b: ImageSize, tolerance = 0.02): boolean {
  if (a.height === 0 || b.height === 0) return false;
  const ra = a.width / a.height;
  const rb = b.width / b.height;
  return Math.abs(ra - rb) / ra <= tolerance;
}
