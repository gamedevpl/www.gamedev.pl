import {
  decodeRasterSourceContent,
  encodeRasterSourceContent,
  isRasterSourcePath,
  mimeForImagePath,
} from '../catalog/raster-assets.js';

export function sourceObjectBytes(path: string, content: string): Buffer {
  if (isRasterSourcePath(path)) return decodeRasterSourceContent(path, content);
  return Buffer.from(content, 'utf8');
}

export function sourceObjectContentType(path: string): string {
  return isRasterSourcePath(path) ? mimeForImagePath(path) : 'text/plain; charset=utf-8';
}

export function sourceFileContentFromObject(path: string, body: Buffer): string {
  return isRasterSourcePath(path) ? encodeRasterSourceContent(body) : body.toString('utf8');
}

export function sourceFileFromObject(
  path: string,
  body: Buffer,
): { path: string; content: string; encoding?: 'utf8' | 'base64' } {
  if (isRasterSourcePath(path)) {
    return { path, content: encodeRasterSourceContent(body), encoding: 'base64' };
  }
  return { path, content: body.toString('utf8') };
}

export function measureUploadedSourceBytes(path: string, content: string): number {
  if (isRasterSourcePath(path)) return decodeRasterSourceContent(path, content).byteLength;
  return Buffer.byteLength(content, 'utf8');
}

export function canonicalizeUploadedSource(file: { path: string; content: string }): {
  path: string;
  content: string;
  encoding?: 'utf8' | 'base64';
} {
  const path = file.path.trim();
  if (!isRasterSourcePath(path)) return { path, content: file.content };
  const bytes = decodeRasterSourceContent(path, file.content);
  return { path, content: encodeRasterSourceContent(bytes), encoding: 'base64' };
}
