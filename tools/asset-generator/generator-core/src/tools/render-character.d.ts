import { Asset } from '../assets-types.js';
/**
 * Renders an asset to canvas and saves it as PNG file in the asset directory
 */
export declare function renderAsset(asset: Asset, assetPath: string): Promise<{
    stance: string;
    mediaType: string;
    dataUrl: string;
}[]>;
/**
 * Configuration options for video rendering
 */
export interface VideoRenderOptions {
    /** Frames per second for the video (default: 30) */
    fps?: number;
    /** Duration of the video in seconds (default: 2) */
    duration?: number;
    /** Whether to log progress (default: true) */
    logProgress?: boolean;
}
/**
 * Renders videos for each stance of an asset
 * @param asset The asset to render
 * @param assetPath Path to the asset's source file
 * @param options Video rendering options
 * @returns Array of video render results
 */
export declare function renderAssetVideos(asset: Asset, assetPath: string, options?: VideoRenderOptions): Promise<{
    stance: string;
    mediaType: string;
    dataUrl: string;
}[]>;
