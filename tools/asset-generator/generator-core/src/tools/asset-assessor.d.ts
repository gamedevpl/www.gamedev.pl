import { Asset } from '../assets-types.js';
/**
 * Assess an asset by analyzing its rendering result
 * @param assetPath Path to the asset file
 * @param asset The asset to assess
 * @param currentImplementation Current implementation of the asset (if exists)
 * @param dataUrl The data URL of the rendered asset
 * @returns Promise resolving to the assessment text
 */
export declare function assessAsset(assetPath: string, asset: Asset, currentImplementation: string | null, dataUrl: string): Promise<string>;
