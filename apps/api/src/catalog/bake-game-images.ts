import { IMAGES_CONTRACT } from '../platform/raster-contract.js';
import {
  assertImageFileSize,
  assertImageSignature,
  decodeRasterSourceContent,
  mimeForImagePath,
} from '../platform/raster-source.js';
import { imageLoaderBootJs, imageLoaderHtml, type ImageManifest } from './raster-assets.js';

export async function resolveGameImageBytes(
  relative: string,
  name: string,
  overrides: Record<string, string> | undefined,
  noRefFallback: boolean | undefined,
  readRefBytes: () => Promise<Uint8Array | null>,
): Promise<Uint8Array | null> {
  if (overrides && Object.hasOwn(overrides, relative)) {
    try {
      return decodeRasterSourceContent(relative, overrides[relative]);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'invalid raster';
      throw new Error(`game image "${name}" (${relative}): ${detail}`, { cause: error });
    }
  }
  if (noRefFallback) return null;
  return await readRefBytes();
}

export async function bakeGameImageAssets(
  images: ImageManifest,
  readBytes: (relPath: string, name: string) => Promise<Uint8Array | null>,
): Promise<{ assetChunk: string; bootJs: string; loaderHtml: string } | null> {
  const imageNames = Object.keys(images);
  if (imageNames.length === 0) return null;
  const imageAssets: Record<string, string> = {};
  for (const name of imageNames) {
    const relPath = images[name];
    const bytes = await readBytes(relPath, name);
    if (!bytes) {
      throw new Error(`game image "${name}" not found: ${relPath}`);
    }
    assertImageFileSize(name, bytes.byteLength);
    assertImageSignature(name, relPath, bytes);
    imageAssets[name] = `data:${mimeForImagePath(relPath)};base64,${Buffer.from(bytes).toString('base64')}`;
  }
  return {
    assetChunk: `window.${IMAGES_CONTRACT.windowAssetsName} = Object.freeze(${JSON.stringify(imageAssets)});`,
    bootJs: imageLoaderBootJs(imageNames),
    loaderHtml: imageLoaderHtml(),
  };
}
