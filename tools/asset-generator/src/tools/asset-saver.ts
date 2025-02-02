import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Save an asset to a file
 * @param assetPath Path where the asset should be saved
 * @param content Content of the asset file
 * @returns Promise that resolves when the asset is saved
 * @throws Error if directory creation or file writing fails
 */
export async function saveAsset(assetPath: string, content: string): Promise<void> {
  try {
    const dir = path.dirname(assetPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(assetPath, content, 'utf-8');
  } catch (error) {
    throw new Error(`Failed to save asset: ${(error as Error).message}`);
  }
}