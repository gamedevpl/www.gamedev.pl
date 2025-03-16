import * as fs from 'fs/promises';
import { getAssetFilePath, loadAsset } from './asset-loader.js';
import { renderAsset, renderAssetVideos, VerbosityLevel } from './render-character.js';
import { assessAsset } from './asset-assessor.js';
import { generateImprovedAsset } from './asset-generator.js';
import { saveAsset } from './asset-saver.js';
import { lintAssetFile, LintResult, formatLintErrors } from './asset-linter.js';
import { fixLintErrors, LintFixResult } from './asset-linter-fixer.js';

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
  renderingResult?: { stance: string; mediaType: string; dataUrl: string }[];
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
export async function runAssetGenerationPipeline(
  assetName: string,
  options: AssetGenerationOptions = {},
): Promise<AssetGenerationResult> {
  // Get asset file path
  const assetPath = await getAssetFilePath(assetName);
  console.log(`Processing asset: ${assetName}`);
  console.log(`Asset path: ${assetPath}`);

  // Handle conflicting options
  if (options.lintOnly && options.renderOnly) {
    console.log('Both lintOnly and renderOnly options are set. lintOnly will take precedence.');
    options.renderOnly = false;
  }

  if (options.lintOnly && options.skipLinting) {
    console.warn('Warning: Both lintOnly and skipLinting options are set. This is contradictory.');
    console.warn('No action will be performed. Please choose one option.');
    return {
      assetPath,
      regenerated: false,
      linting: {
        lintingPerformed: false,
        hasLintingErrors: false,
        hasLintingWarnings: false,
        errorsFixed: false,
      },
    };
  }

  // Load current asset if exists
  let currentAsset = await loadAsset(assetPath);
  let currentContent: string | null = null;

  if (currentAsset) {
    console.log('Current asset loaded successfully');
    currentContent = await fs.readFile(assetPath, 'utf-8');
  } else {
    console.log('No existing asset found, will create new one');

    // Cannot process if asset doesn't exist and lintOnly is set
    if (options.lintOnly) {
      throw new Error('Cannot perform lint-only operation when no existing asset is found.');
    }

    // Cannot skip rendering if no asset exists
    if (options.skipRender && !options.renderOnly) {
      throw new Error('Cannot skip rendering when no existing asset is found. Remove the --skip-render flag.');
    }
  }

  // Check for existing rendered files if skip-render is enabled
  if (options.skipRender && !options.renderOnly && currentAsset) {
    console.log('Skipping rendering, using existing renderings for assessment...');

    // Attempt to find existing rendered files (we don't actually load them here,
    // but we'll check if at least one stance file exists)
    const assetDir = path.dirname(assetPath);
    const stanceFile = path.join(assetDir, `${assetName.toLowerCase()}-${currentAsset.stances[0]}.png`);

    try {
      await fs.access(stanceFile);
      console.log('Found existing rendered files to use for assessment');
    } catch (error) {
      throw new Error(
        'No existing rendered files found. Cannot use --skip-render. Run without this flag first to generate renderings.',
      );
    }
  }

  // Render current asset if exists and not skipping render
  let renderingResult: { stance: string; mediaType: string; dataUrl: string }[] = [];
  if (currentAsset && (!options.skipRender || options.renderOnly)) {
    renderingResult = await renderAsset(currentAsset, assetPath);
    console.log('Asset rendered successfully');

    // Generate videos for each stance if not skipped
    if (!options.skipVideos) {
      try {
        console.log('Generating videos for each stance...');
        renderingResult.push(
          ...(await renderAssetVideos(currentAsset, assetPath, {
            fps: options.videoOptions?.fps,
            duration: options.videoOptions?.duration,
            verbosity: options.videoOptions?.verbosity || 'minimal',
            logProgress: options.videoOptions?.verbosity !== 'none',
          })),
        );
      } catch (error) {
        console.error('Error generating videos:', error);
      }
    }
  } else if (currentAsset && options.skipRender) {
    console.log('Skipping rendering of existing asset (--skip-render flag is enabled), using existing renderings');
    // list files in the directory
    const assetDir = path.dirname(assetPath);
    const files = await fs.readdir(assetDir);
    console.log('Files in asset directory:', files);
    // add to rendering result
    for (const file of files) {
      if (file.endsWith('.mp4') /* || file.endsWith('.png')*/) {
        const mediaType = file.endsWith('mp4') ? 'video/mp4' : 'image/png';
        renderingResult.push({
          stance: file.replace(`${assetName.toLowerCase()}-`, '').replace('.mp4', '').replace('.png', ''),
          mediaType: mediaType,
          dataUrl: `data:${mediaType};base64,${(await fs.readFile(path.join(assetDir, file))).toString('base64')}`,
        });
      }
    }
  }

  let assessment;
  if (!(options.renderOnly || options.lintOnly)) {
    // Run inference for assessment
    assessment = currentAsset
      ? await assessAsset(assetPath, currentAsset, currentContent, renderingResult)
      : 'No existing asset to assess';
    console.log('\nAsset Assessment:');
    console.log(assessment);

    // Generate improved asset
    console.log('\nGenerating improved asset...');
    const improvedImplementation = await generateImprovedAsset(
      assetName,
      currentContent,
      assessment,
      options.additionalPrompt,
    );

    // Save new asset
    console.log('\nSaving improved asset...');
    await saveAsset(assetPath, improvedImplementation);
    console.log('Asset saved successfully');
  } else {
    console.log('Skipping asset improvement (--render-only or --lint-only flag is enabled)');
  }

  // Linting step
  let lintingResult: AssetLintingResult = {
    lintingPerformed: false,
    hasLintingErrors: false,
    hasLintingWarnings: false,
    errorsFixed: false,
  };

  if (!options.skipLinting && !options.renderOnly) {
    for (let tryCount = 0; tryCount < 3; tryCount++) {
      console.log('\nLinting asset code...');
      const lintResults: LintResult = await lintAssetFile(assetName, assetPath);

      lintingResult.lintingPerformed = true;
      lintingResult.hasLintingErrors = lintResults.hasErrors;
      lintingResult.hasLintingWarnings = lintResults.hasWarnings;

      if (lintResults.hasErrors || lintResults.hasWarnings) {
        console.log('\nLinting issues found:');
        console.log(formatLintErrors(lintResults));

        console.log('\nAttempting to fix linting issues...');
        const fixResult: LintFixResult = await fixLintErrors(lintResults); // Allow up to 3 iterations

        if (fixResult.success) {
          console.log('\nLinting issues fixed successfully');

          // Save the fixed code
          await saveAsset(assetPath, fixResult.code);
          console.log('Fixed asset code saved successfully');

          lintingResult.errorsFixed = true;
        } else {
          console.error('\nFailed to fix linting issues:', fixResult.error);
          lintingResult.errorsFixed = false;
        }
      } else {
        console.log('No linting issues found');
        break;
      }
    }
  } else {
    console.log('\nSkipping linting (disabled in options)');
  }

  // Render improved asset if not skipping render
  currentAsset = await loadAsset(assetPath);
  if (!currentAsset) {
    throw new Error('Failed to load current asset after saving');
  }

  if (!options.skipRender && !options.lintOnly && !options.renderOnly) {
    console.log('\nRendering improved asset...');
    await renderAsset(currentAsset, assetPath);

    // Generate videos for the improved asset if not skipped
    if (!options.skipVideos) {
      try {
        console.log('Generating videos for improved asset...');
        await renderAssetVideos(currentAsset, assetPath, {
          fps: options.videoOptions?.fps,
          duration: options.videoOptions?.duration,
          verbosity: options.videoOptions?.verbosity || 'minimal',
          logProgress: options.videoOptions?.verbosity !== 'none',
        });
      } catch (error) {
        console.error('Error generating videos for improved asset:', error);
      }
    }
  } else {
    console.log('\nSkipping rendering of improved asset (--skip-render flag is enabled)');
  }

  return {
    assetPath,
    assessment,
    regenerated: true,
    renderingResult,
    linting: lintingResult,
  };
}

// Import path module for file path operations
import * as path from 'path';
