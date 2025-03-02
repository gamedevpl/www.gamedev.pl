/**
 * Save an asset to a file
 * @param assetPath Path where the asset should be saved
 * @param content Content of the asset file
 * @returns Promise that resolves when the asset is saved
 * @throws Error if directory creation or file writing fails
 */
export declare function saveAsset(assetPath: string, content: string): Promise<void>;
