import * as path from 'path';
import { Asset, isSoundAsset, isVisualAsset } from '../assets-types.js';
import * as fs from 'fs/promises';

/**
 * Get the absolute file path for an asset based on its name
 * @param assetName Name of the asset
 * @returns Promise resolving to the absolute file path
 */
export function getAssetFilePath(assetName: string): string {
  const assetsDir = path.join(process.cwd(), '..', 'generator-assets', 'src');
  const assetDir = path.join(assetsDir, assetName.toLowerCase());
  return path.join(assetDir, `${assetName.toLowerCase()}.ts`);
}

/**
 * Validate that a file exists relative to the asset path
 * @param assetPath Path to the asset file
 * @param filename Filename to check (e.g., reference image or audio file)
 * @returns Promise resolving to true if file exists, false otherwise
 * @throws Error if file is specified but doesn't exist
 */
async function validateFileExists(assetPath: string, filename: string | undefined): Promise<boolean> {
  if (!filename) {
    return false;
  }

  const assetDir = path.dirname(assetPath);
  const filePath = path.join(assetDir, filename);
  const exists = await fs
    .access(filePath)
    .then(() => true)
    .catch(() => false);
  if (!exists) throw new Error(`File not found: ${filename}`);
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

    if (!asset) {
       throw new Error('Invalid asset format: Asset is null or undefined');
    }

    // Check if it's a valid VisualAsset or SoundAsset
    const isValidVisual = typeof (asset as any).render === 'function';
    const isValidSound = asset.type === 'sound';

    if (!isValidVisual && !isValidSound) {
      throw new Error('Invalid asset format: Must be a VisualAsset (with a render function) or a SoundAsset (with type: "sound")');
    }

    // Validate optional files based on asset type
    if (isVisualAsset(asset) && asset.referenceImage) {
      await validateFileExists(assetPath, asset.referenceImage);
    } else if (isSoundAsset(asset) && asset.audioFile) {
      await validateFileExists(assetPath, asset.audioFile);
    }

    return asset;
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND' ||
      ((error as Error).message.includes('Cannot find module') && (error as Error).message.includes(assetPath))
    ) {
      console.error(error);
      return null;
    }
    throw error;
  }
}
