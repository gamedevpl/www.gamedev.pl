import { runAssetGenerationPipeline } from './tools/asset-pipeline.js';

/**
 * Display help message for the CLI
 */
function displayHelp() {
  console.log(`
Asset Generator - Create and improve game assets

Usage: asset-generator <asset-name> [options]

Options:
  --render-only     Only render the asset without assessment or improvement
  --skip-render     Skip rendering and use existing renderings for assessment
  --skip-videos     Skip generating videos for each stance
  --lint-only       Only perform linting without rendering or generation
  --prompt <text>   Provide additional requirements for asset generation
  --help            Display this help message
  
Examples:
  asset-generator hunter-2d
  asset-generator prey-2d --render-only
  asset-generator lion-2d --lint-only
  asset-generator hunter-2d --prompt "Make the hunter more aggressive looking"
`);
}

/**
 * Main entry point for the asset generator CLI
 */
export async function assetGenRunner() {
  try {
    // Check for help flag
    if (process.argv.includes('--help')) {
      displayHelp();
      return;
    }

    // Parse CLI arguments
    const assetName = process.argv[2];
    if (!assetName) {
      throw new Error('Asset name is required. Usage: asset-generator <asset-name>');
    }

    const args = process.argv.slice(3);
    const lintOnly = args.includes('--lint-only');
    const renderOnly = args.includes('--render-only');
    const skipRender = args.includes('--skip-render') || lintOnly;
    const skipVideos = args.includes('--skip-videos') || lintOnly;

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

    // Check for conflicting options and provide warnings
    if (lintOnly && renderOnly) {
      console.warn('Warning: Both --lint-only and --render-only flags are set.');
      console.warn('The --lint-only flag will take precedence.');
    }

    // Run the asset generation pipeline
    const result = await runAssetGenerationPipeline(assetName, {
      renderOnly,
      skipRender,
      skipVideos,
      lintOnly,
      additionalPrompt,
    });

    console.log(`\nAsset processing completed successfully for: ${assetName}`);

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
  } catch (error) {
    const errorMessage = (error as Error).message;

    // If JSON output is requested, output the error as JSON
    if (process.argv.includes('--json')) {
      console.log(
        JSON.stringify({
          error: true,
          message: errorMessage,
        }),
      );
    } else {
      console.error('Error:', errorMessage);
    }

    process.exit(1);
  }
}
