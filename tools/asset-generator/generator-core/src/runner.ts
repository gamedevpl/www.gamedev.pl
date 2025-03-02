import { runAssetGenerationPipeline } from './tools/asset-pipeline.js';

/**
 * Main entry point for the asset generator CLI
 */
export async function assetGenRunner() {
  try {
    // Parse CLI arguments
    const assetName = process.argv[2];
    if (!assetName) {
      throw new Error('Asset name is required. Usage: asset-generator <asset-name>');
    }

    const args = process.argv.slice(3);
    const renderOnly = args.includes('--render-only');

    // Run the asset generation pipeline
    await runAssetGenerationPipeline(assetName, { renderOnly });
  } catch (error) {
    console.error('Error:', (error as Error).message);
    process.exit(1);
  }
}
