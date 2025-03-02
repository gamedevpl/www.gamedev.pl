import { Asset } from '../assets-types';
/**
 * Get the absolute file path for an asset based on its name
 * @param assetName Name of the asset
 * @returns Promise resolving to the absolute file path
 */
export declare function getAssetFilePath(assetName: string): string;
/**
 * Load an asset from a file path
 * @param assetPath Path to the asset file
 * @returns Promise resolving to the loaded asset or null if not found
 * @throws Error if asset format is invalid
 */
export declare function loadAsset(assetPath: string): Promise<Asset | null>;
