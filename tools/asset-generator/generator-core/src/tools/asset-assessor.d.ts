import { Asset } from '../assets-types.js';
/**
 * Assess an asset by analyzing its rendering result
 */
export declare function assessAsset(assetPath: string, asset: Asset, currentImplementation: string | null, stanceMedia: {
    stance: string;
    mediaType: string;
    dataUrl: string;
}[]): Promise<string>;
