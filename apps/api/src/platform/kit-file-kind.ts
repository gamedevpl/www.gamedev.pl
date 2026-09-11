// Text or binary, by extension then by bytes.

const BINARY_EXTENSIONS = new Set([
  '.wav',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.bmp',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.eot',
  '.zip',
  '.gz',
  '.tgz',
  '.7z',
  '.bin',
  '.wasm',
  '.mp3',
  '.ogg',
  '.mp4',
  '.webm',
]);

export type KitFileKind = 'text' | 'binary';

export function kitFileKind(path: string, bytes: Buffer): KitFileKind {
  const lower = path.toLowerCase();
  const dot = lower.lastIndexOf('.');
  if (dot !== -1 && BINARY_EXTENSIONS.has(lower.slice(dot))) {
    return 'binary';
  }
  // NUL in the first 8 KiB → binary (UTF-16 / opaque).
  const probe = bytes.subarray(0, Math.min(bytes.length, 8 * 1024));
  if (probe.includes(0)) return 'binary';
  return 'text';
}
