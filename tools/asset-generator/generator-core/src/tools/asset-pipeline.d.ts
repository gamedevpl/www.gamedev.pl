/**
 * Interface for asset generation options
 */
export interface AssetGenerationOptions {
    /** Whether to only render the asset without assessment and improvement */
    renderOnly?: boolean;
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
}
/**
 * Main function to run the asset generation pipeline
 *
 * @param assetName Name of the asset to generate
 * @param options Additional options for generation
 * @returns Result of asset generation
 */
export declare function runAssetGenerationPipeline(assetName: string, options?: AssetGenerationOptions): Promise<AssetGenerationResult>;
