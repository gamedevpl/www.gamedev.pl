import { ModelType } from 'genaicode';
/**
 * Generate an improved implementation of an asset
 * @param assetName Name of the asset
 * @param currentImplementation Current implementation of the asset (if exists)
 * @param assessment Assessment of the current implementation
 * @param additionalPrompt Additional user-provided prompt with special requirements
 * @param fromScratch Whether to regenerate the asset from scratch, ignoring the current implementation
 * @param originalDescription Original description of the asset (used when fromScratch is true)
 * @param modelType The model type to use for generation (default: ModelType.DEFAULT)
 * @returns Promise resolving to the improved implementation code
 */
export declare function generateImprovedAsset(assetName: string, currentImplementation: string | null, assessment: string, additionalPrompt?: string, fromScratch?: boolean, originalDescription?: string, modelType?: ModelType): Promise<string>;
