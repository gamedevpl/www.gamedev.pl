import { decodeCanonicalBase64, InvalidBase64Error } from './canonical-base64.js';
import { DELIVERY_EXTRA_ASSET_PATTERN, RASTER_ASSET_MAX_FILE_BYTES } from './raster-contract.js';

export function mimeForImagePath(relPath: string): string {
  return relPath.toLowerCase().endsWith('.webp') ? 'image/webp' : 'image/png';
}

export function isRasterSourcePath(path: string): boolean {
  return DELIVERY_EXTRA_ASSET_PATTERN.test(path) && !path.includes('//');
}

// Decode staged raster; content is canonical base64.
export function decodeRasterSourceContent(path: string, content: string): Buffer {
  let bytes: Buffer;
  try {
    bytes = decodeCanonicalBase64(content);
  } catch (error) {
    if (error instanceof InvalidBase64Error) {
      throw new Error(`${path} is not valid base64 — PNG/WebP must be sent as encoding=base64`, { cause: error });
    }
    throw error;
  }
  const name =
    path
      .split('/')
      .pop()
      ?.replace(/\.(?:png|webp)$/i, '') || 'image';
  assertImageFileSize(name, bytes.byteLength);
  assertImageSignature(name, path, bytes);
  return bytes;
}

export function encodeRasterSourceContent(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

function isPng(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  );
}

function isWebp(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

// Reject junk or extension-mismatched image bytes.
export function assertImageSignature(name: string, relPath: string, bytes: Uint8Array): void {
  const prefix = `game image "${name}"`;
  if (relPath.toLowerCase().endsWith('.webp')) {
    if (!isWebp(bytes)) {
      throw new Error(`${prefix} is not a WebP (missing RIFF/WEBP signature)`);
    }
    return;
  }
  if (isJpeg(bytes)) {
    throw new Error(`${prefix} is a JPEG, not a PNG`);
  }
  if (!isPng(bytes)) {
    throw new Error(`${prefix} is not a PNG (missing signature)`);
  }
}

export function assertImageFileSize(name: string, bytes: number): void {
  if (bytes > RASTER_ASSET_MAX_FILE_BYTES) {
    throw new Error(
      `game image "${name}" is ${bytes} bytes; quantized PNG/WebP must stay under ${RASTER_ASSET_MAX_FILE_BYTES}`,
    );
  }
}
