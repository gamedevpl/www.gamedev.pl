import * as path from 'path';
import { Asset } from '../assets/assets-types.js';

/**
 * Get the absolute file path for an asset based on its name
 * @param assetName Name of the asset
 * @returns Promise resolving to the absolute file path
 */
export async function getAssetFilePath(assetName: string): Promise<string> {
  const assetsDir = path.join(process.cwd(), 'src', 'assets');
  const assetDir = path.join(assetsDir, assetName.toLowerCase());
  return path.join(assetDir, `${assetName.toLowerCase()}.ts`);
}

/**
 * Load an asset from a file path
 * @param assetPath Path to the asset file
 * @returns Promise resolving to the loaded asset or null if not found
 * @throws Error if asset format is invalid
 */
export async function loadAsset(assetPath: string): Promise<Asset | null> {
  try {
    const module = await import(`file://${assetPath}?${Date.now()}`);
    const asset = module[Object.keys(module)[0]] as Asset;

    if (!asset || typeof asset.render !== 'function') {
      throw new Error('Invalid asset format');
    }

    return asset;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND') {
      return null;
    }
    throw error;
  }
}
