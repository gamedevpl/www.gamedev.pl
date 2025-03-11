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
    const skipRender = args.includes('--skip-render');
    
    // Parse prompt option
    let additionalPrompt: string | undefined;
    const promptIndex = args.indexOf('--prompt');
    if (promptIndex !== -1 && promptIndex < args.length - 1) {
      // Get the value after --prompt flag
      additionalPrompt = args[promptIndex + 1];
      // If the next argument is another flag, don't use it as prompt
      if (additionalPrompt.startsWith('--')) {
        additionalPrompt = undefined;
      }
    }

    // Run the asset generation pipeline
    await runAssetGenerationPipeline(assetName, { 
      renderOnly,
      skipRender,
      additionalPrompt
    });
  } catch (error) {
    console.error('Error:', (error as Error).message);
    process.exit(1);
  }
}