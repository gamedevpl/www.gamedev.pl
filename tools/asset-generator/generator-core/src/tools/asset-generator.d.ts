import { ModelType } from 'genaicode';
import { Asset } from '../assets-types.js';
/**
 * Generate an improved implementation of an asset
 * @param assetName Name of the asset
 * @param assetPath Path to the asset file (for loading reference image)
 * @param asset The Asset object (for accessing referenceImage field)
 * @param currentImplementation Current implementation of the asset (if exists)
 * @param renderedMedia Array of rendered media items (images/videos) for each stance, or null
 * @param additionalPrompt Additional user-provided prompt with special requirements
 * @param fromScratch Whether to regenerate the asset from scratch, ignoring the current implementation
 * @param originalDescription Original description of the asset (used when fromScratch is true or no current impl.)
 * @param modelType The model type to use for generation (default: ModelType.DEFAULT)
 * @returns Promise resolving to the improved implementation code
 */
export declare function generateImprovedAsset(assetName: string, assetPath: string, asset: Asset | null, // Can be null if asset doesn't exist yet
currentImplementation: string | null, renderedMedia: {
    stance: string;
    mediaType: string;
    dataUrl: string;
    filePath: string;
}[] | null, additionalPrompt?: string, fromScratch?: boolean, originalDescription?: string, modelType?: ModelType): Promise<string>;
