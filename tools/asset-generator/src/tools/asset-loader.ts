import * as path from 'path';
import { Asset } from '../assets/assets-types';
import * as fs from 'fs/promises';

/**
 * Get the absolute file path for an asset based on its name
 * @param assetName Name of the asset
 * @returns Promise resolving to the absolute file path
 */
export function getAssetFilePath(assetName: string): string {
  const assetsDir = path.join(process.cwd(), 'src', 'assets');
  const assetDir = path.join(assetsDir, assetName.toLowerCase());
  return path.join(assetDir, `${assetName.toLowerCase()}.ts`);
}

/**
 * Validate and resolve the reference image path for an asset
 * @param assetPath Path to the asset file
 * @param referenceImage Reference image filename specified in the asset
 * @returns Promise resolving to true if reference image exists, false otherwise
 * @throws Error if reference image is specified but doesn't exist
 */
async function validateReferenceImage(assetPath: string, referenceImage: string | undefined): Promise<boolean> {
  if (!referenceImage) {
    return false;
  }

  const assetDir = path.dirname(assetPath);
  const imagePath = path.join(assetDir, referenceImage);
  const exists = await fs
    .access(imagePath)
    .then(() => true)
    .catch(() => false);
  if (!exists) throw new Error(`Reference image not found: ${referenceImage}`);
  return true;
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

    // Validate reference image if specified
    if (asset.referenceImage) {
      await validateReferenceImage(assetPath, asset.referenceImage);
    }

    return asset;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND') {
      console.error(error);
      return null;
    }
    throw error;
  }
}
