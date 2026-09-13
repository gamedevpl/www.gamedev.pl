import { inflateSync } from 'node:zlib';
import { PNG } from 'pngjs';

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

// Samples per pixel, by colour type; other values are not one.
const PNG_CHANNELS: Readonly<Record<number, number>> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

// Bit depths the spec allows for each colour type, and no others.
const PNG_DEPTHS: Readonly<Record<number, readonly number[]>> = {
  0: [1, 2, 4, 8, 16],
  2: [8, 16],
  3: [1, 2, 4, 8],
  4: [8, 16],
  6: [8, 16],
};

// Past any real frame; 4K RGBA is 33 MB.
const MAX_PNG_RAW_BYTES = 64 * 1024 * 1024;

// Four bytes a pixel whatever the depth, so packed size misleads.
export function withinDecodeBudget({ width, height }: ImageSize): boolean {
  return width * height * 4 <= MAX_PNG_RAW_BYTES;
}

interface PngHeader {
  width: number;
  height: number;
  depth: number;
  colorType: number;
  interlaced: boolean;
}

// IHDR as the spec allows it, not merely as thirteen bytes.
function pngHeaderOf(bytes: Buffer): PngHeader | null {
  if (bytes.length < 33 || bytes.readUInt32BE(8) !== 13) return null;
  if (bytes.subarray(12, 16).toString('latin1') !== 'IHDR') return null;
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  const depth = bytes.readUInt8(24);
  const colorType = bytes.readUInt8(25);
  if (width === 0 || height === 0) return null;
  if (!PNG_DEPTHS[colorType]?.includes(depth)) return null;
  // Compression and filter have one defined value each.
  if (bytes.readUInt8(26) !== 0 || bytes.readUInt8(27) !== 0) return null;
  const interlace = bytes.readUInt8(28);
  if (interlace > 1) return null;
  return { width, height, depth, colorType, interlaced: interlace === 1 };
}

// Adam7: origin and stride of each interlace pass, in order.
const ADAM7 = [
  [0, 0, 8, 8],
  [4, 0, 8, 8],
  [0, 4, 4, 8],
  [2, 0, 4, 4],
  [0, 2, 2, 4],
  [1, 0, 2, 2],
  [0, 1, 1, 2],
] as const;

// A row owes a filter byte plus its packed samples.
function rowBytes(width: number, bitsPerPixel: number): number {
  return Math.ceil((width * bitsPerPixel) / 8) + 1;
}

// Every scanline the decode must produce, interlace passes included.
function pngRawBytes(header: PngHeader): number {
  const bitsPerPixel = PNG_CHANNELS[header.colorType]! * header.depth;
  if (!header.interlaced) return header.height * rowBytes(header.width, bitsPerPixel);
  let total = 0;
  for (const [x0, y0, dx, dy] of ADAM7) {
    const width = Math.ceil((header.width - x0) / dx);
    const height = Math.ceil((header.height - y0) / dy);
    // A pass narrower than its own origin contributes nothing.
    if (width <= 0 || height <= 0) continue;
    total += height * rowBytes(width, bitsPerPixel);
  }
  return total;
}

// Walks the chunks; pixels live in IDAT, so none means none.
function pngPixelData(bytes: Buffer): Buffer | null {
  let at = 8;
  const parts: Buffer[] = [];
  while (at + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(at);
    const type = bytes.subarray(at + 4, at + 8).toString('latin1');
    const next = at + 12 + length;
    // A length past the end is a short read, not a chunk.
    if (length > bytes.length || next > bytes.length) return null;
    if (type === 'IDAT' && length > 0) parts.push(bytes.subarray(at + 8, at + 8 + length));
    if (type === 'IEND') return parts.length && next === bytes.length ? Buffer.concat(parts) : null;
    at = next;
  }
  return null;
}

// Structure claims a picture; only the decode finds one.
function pngCarriesPixels(bytes: Buffer): boolean {
  const header = pngHeaderOf(bytes);
  if (!header) return false;
  const data = pngPixelData(bytes);
  if (!data) return false;
  const raw = pngRawBytes(header);
  // Dimensions are declared, not measured; a huge claim costs memory to refuse.
  if (raw > MAX_PNG_RAW_BYTES) return false;
  // One bit a pixel expands 32-fold in the decoder.
  if (!withinDecodeBudget(header)) return false;
  try {
    // Tiny dimensions and a big deflate is a bomb.
    const pixels = inflateSync(data, { maxOutputLength: raw });
    if (pixels.length !== raw) return false;
  } catch {
    return false;
  }
  return pngDecodes(bytes);
}

// Filters, palettes and CRCs: what the chunk walk cannot see.
function pngDecodes(bytes: Buffer): boolean {
  try {
    // It tolerates a missing IDAT: after those checks, never instead.
    PNG.sync.read(bytes);
    return true;
  } catch {
    return false;
  }
}

// A scan needs components to draw and the tables that decode them.
function jpegCarriesPixels(bytes: Buffer): boolean {
  let at = 2;
  let components = 0;
  let quantTables = false;
  let huffmanTables = false;
  while (at + 4 <= bytes.length) {
    if (bytes.readUInt8(at) !== 0xff) return false;
    const marker = bytes.readUInt8(at + 1);
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      at += 2;
      continue;
    }
    const length = bytes.readUInt16BE(at + 2);
    if (length < 2 || at + 2 + length > bytes.length) return false;
    if (marker === 0xdb) quantTables = true;
    if (marker === 0xc4) huffmanTables = true;
    const isFrameHeader = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    // Byte nine of SOF counts the components the scan will draw.
    if (isFrameHeader && length >= 8) components = bytes.readUInt8(at + 9);
    if (marker === 0xda) {
      const scanStart = at + 2 + length;
      const endsAtEoi =
        scanStart < bytes.length - 2 &&
        bytes.readUInt8(bytes.length - 2) === 0xff &&
        bytes.readUInt8(bytes.length - 1) === 0xd9;
      // Entropy bytes still go unchecked; that needs a decoder.
      return endsAtEoi && components > 0 && quantTables && huffmanTables;
    }
    at += 2 + length;
  }
  return false;
}

// PNG is decoded here; JPEG is only read structurally.
export function carriesPixels(bytes: Buffer): boolean {
  if (isPng(bytes)) return pngCarriesPixels(bytes);
  if (isJpeg(bytes)) return jpegCarriesPixels(bytes);
  return false;
}

// True when both frames share an aspect ratio within `tolerance`.
export function sameAspectRatio(a: ImageSize, b: ImageSize, tolerance = 0.02): boolean {
  if (a.height === 0 || b.height === 0) return false;
  const ra = a.width / a.height;
  const rb = b.width / b.height;
  return Math.abs(ra - rb) / ra <= tolerance;
}
