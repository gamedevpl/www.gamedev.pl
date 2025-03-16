import { VerbosityLevel } from './render-character.js';
/**
 * Interface for asset generation options
 */
export interface AssetGenerationOptions {
    /** Whether to only render the asset without assessment and improvement */
    renderOnly?: boolean;
    /** Whether to skip video generation */
    skipVideos?: boolean;
    /** Whether to skip rendering and use existing renderings for assessment */
    skipRender?: boolean;
    /** Additional prompt with special requirements for asset generation */
    additionalPrompt?: string;
    /** Whether to skip linting */
    skipLinting?: boolean;
    /** Whether to only perform linting without rendering or generation */
    lintOnly?: boolean;
    /** Video rendering options */
    videoOptions?: {
        /** Frames per second for the video (default: 30) */
        fps?: number;
        /** Duration of the video in seconds (default: 2) */
        duration?: number;
        /** Verbosity level for logging (default: 'minimal') */
        verbosity?: VerbosityLevel;
    };
}
/**
 * Interface for linting results in the asset generation process
 */
export interface AssetLintingResult {
    /** Whether linting was performed */
    lintingPerformed: boolean;
    /** Whether any linting errors were found */
    hasLintingErrors: boolean;
    /** Whether any linting warnings were found */
    hasLintingWarnings: boolean;
    /** Whether linting errors were fixed */
    errorsFixed: boolean;
    /** Summary of linting fixes if applied */
    fixSummary?: string;
}
/**
 * Result of asset generation process
 */
export interface AssetGenerationResult {
    /** Path to the asset file */
    assetPath: string;
    /** Assessment of the asset if available */
    assessment?: string;
    /** Whether asset was regenerated or just rendered */
    regenerated: boolean;
    /** Results of asset rendering */
    renderingResult?: {
        stance: string;
        mediaType: string;
        dataUrl: string;
    }[];
    /** Results of linting process */
    linting?: AssetLintingResult;
}
/**
 * Main function to run the asset generation pipeline
 *
 * @param assetName Name of the asset to generate
 * @param options Additional options for generation
 * @returns Result of asset generation
 */
export declare function runAssetGenerationPipeline(assetName: string, options?: AssetGenerationOptions): Promise<AssetGenerationResult>;
