import { createHash } from 'node:crypto';
import { decodeRasterSourceContent, isRasterSourcePath } from '../platform/raster-source.js';
import { writeTarGz } from '../platform/tar.js';

// A round's base sources as one download for shell agents.

export interface SourceFile {
  path: string;
  content: string;
}

export interface SourceManifestEntry {
  path: string;
  bytes: number;
  lines?: number;
  sha256: string;
}

// Rasters are base64 in the channel; the archive holds real bytes.
function fileBytes(file: SourceFile): Buffer {
  return isRasterSourcePath(file.path)
    ? decodeRasterSourceContent(file.path, file.content)
    : Buffer.from(file.content, 'utf8');
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function sourceManifest(files: readonly SourceFile[]): SourceManifestEntry[] {
  return files.map((file) => {
    const bytes = fileBytes(file);
    return {
      path: file.path,
      bytes: bytes.length,
      ...(isRasterSourcePath(file.path) ? {} : { lines: file.content.split('\n').length }),
      sha256: sha256Hex(bytes),
    };
  });
}

// An archive URL binds a delivery version, or the seed's digest.
export function sourceRevision(version: string | undefined, files: readonly SourceFile[], root: string): string {
  return version ?? `seed:${sha256Hex(sourceArchive(files, root)).slice(0, 32)}`;
}

// Sorted, fixed mtime: the same sources always hash the same.
export function sourceArchive(files: readonly SourceFile[], root: string): Buffer {
  return writeTarGz(
    [...files]
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((file) => ({ path: `${root}/${file.path}`, content: fileBytes(file) })),
  );
}
