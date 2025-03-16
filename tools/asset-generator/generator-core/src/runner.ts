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
    const jsonOutput = args.includes('--json');
    const skipVideos = args.includes('--skip-videos');
    
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
    const result = await runAssetGenerationPipeline(assetName, { 
      renderOnly,
      skipRender,
      skipVideos,
      additionalPrompt
    });

    // Output as JSON if the --json flag is provided
    if (jsonOutput) {
      // Output the result as JSON
      console.log(JSON.stringify(result));
    } else {
      // If not outputting as JSON, the logs from runAssetGenerationPipeline will be shown
      // This is just a final success message
      console.log(`\nAsset generation completed successfully for: ${assetName}`);
      
      if (result.assessment) {
        console.log('\nFinal Assessment:');
        console.log(result.assessment);
      }
      
      if (result.linting && result.linting.lintingPerformed) {
        console.log('\nLinting Summary:');
        console.log(`Linting errors: ${result.linting.hasLintingErrors ? 'Yes' : 'No'}`);
        console.log(`Linting warnings: ${result.linting.hasLintingWarnings ? 'Yes' : 'No'}`);
        console.log(`Errors fixed: ${result.linting.errorsFixed ? 'Yes' : 'No'}`);
        
        if (result.linting.fixSummary) {
          console.log('\nFix Summary:');
          console.log(result.linting.fixSummary);
        }
      }
    }
  } catch (error) {
    const errorMessage = (error as Error).message;
    
    // If JSON output is requested, output the error as JSON
    if (process.argv.includes('--json')) {
      console.log(JSON.stringify({
        error: true,
        message: errorMessage
      }));
    } else {
      console.error('Error:', errorMessage);
    }
    
    process.exit(1);
  }
}