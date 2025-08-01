import { Asset } from '../assets-types.js';
/**
 * Renders an asset to canvas and saves it as PNG file in the asset directory
 */
export declare function renderAsset(assetName: string, asset: Asset, assetPath: string): Promise<{
    stance: string;
    mediaType: string;
    dataUrl: string;
    filePath: string;
}[]>;
/**
 * Verbosity levels for logging
 */
export type VerbosityLevel = 'none' | 'minimal' | 'normal' | 'verbose';
/**
 * Configuration options for video rendering
 */
export interface VideoRenderOptions {
    /** Frames per second for the video (default: 60) */
    fps?: number;
    /** Duration of the video in seconds (default: 2) */
    duration?: number;
    /** Whether to log progress (default: true) */
    logProgress?: boolean;
    /** Verbosity level for logging (default: 'minimal') */
    verbosity?: VerbosityLevel;
}
export declare function renderAssetVideos(assetName: string, asset: Asset, assetPath: string, options?: VideoRenderOptions): Promise<{
    stance: string;
    mediaType: string;
    dataUrl: string;
    filePath: string;
}[]>;
