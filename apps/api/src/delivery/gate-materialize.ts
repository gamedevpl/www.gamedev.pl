import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { decodeRasterSourceContent, isRasterSourcePath } from '../catalog/raster-assets.js';
import type { GamesStore, VersionManifest } from './games-store.js';

export async function materializeCandidate(
  store: GamesStore,
  manifest: VersionManifest,
  gameDir: string,
): Promise<void> {
  await rm(gameDir, { recursive: true, force: true });

  for (const relative of manifest.sourceFiles) {
    const content = await store.getSourceFile(manifest.slug, manifest.version, relative);
    if (content === null) throw new Error(`version ${manifest.version} claims ${relative}, which is not stored`);
    const target = path.join(gameDir, relative);
    await mkdir(path.dirname(target), { recursive: true });
    if (isRasterSourcePath(relative)) {
      await writeFile(target, decodeRasterSourceContent(relative, content));
    } else {
      await writeFile(target, content, 'utf8');
    }
  }
}
