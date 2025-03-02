import { Asset } from '../assets-types.js';
/**
 * Renders an asset to canvas and saves it as PNG file in the asset directory
 * @param asset The asset to render
 * @param assetPath Path to the asset's source file
 * @returns Data URL of the rendered asset
 */
export declare function renderAsset(asset: Asset, assetPath: string): Promise<string>;
