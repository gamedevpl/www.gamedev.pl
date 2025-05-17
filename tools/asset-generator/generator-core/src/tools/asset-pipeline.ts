import * as fs from 'fs/promises';
import { getAssetFilePath, loadAsset } from './asset-loader.js';
import { renderAsset, renderAssetVideos, VerbosityLevel } from './render-character.js';
import { generateImprovedAsset } from './asset-generator.js';
import { saveAsset } from './asset-saver.js';
import { lintAssetFile, LintResult, formatLintErrors } from './asset-linter.js';
import { fixLintErrors, LintFixResult } from './asset-linter-fixer.js';
import * as path from 'path';
import { Asset } from '../assets-types.js'; // Added to handle currentAsset being null

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
  /** Whether to regenerate the asset from scratch, keeping the description but starting over the implementation */
  fromScratch?: boolean;
  /** Video rendering options */
  videoOptions?: {
    /** Frames per second for the video (default: 30) */
    fps?: number;
    /** Duration of the video in seconds (default: 2) */
    duration?: number;
    /** Verbosity level for logging (default:_minimal_) */
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
  /** Assessment of the asset if available, or null if direct visual generation was used */
  assessment?: string | null;
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
  const assetPath = await getAssetFilePath(assetName);
  console.log(`Processing asset: ${assetName}`);
  console.log(`Asset path: ${assetPath}`);

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
      assessment: null,
      linting: {
        lintingPerformed: false,
        hasLintingErrors: false,
        hasLintingWarnings: false,
        errorsFixed: false,
      },
    };
  }

  let currentAsset: Asset | null = await loadAsset(assetPath);
  let currentContent: string | null = null;
  let definitiveDescription: string | undefined;

  if (currentAsset) {
    console.log('Current asset loaded successfully');
    currentContent = await fs.readFile(assetPath, 'utf-8');
    definitiveDescription = currentAsset.description;
    if (options.fromScratch) {
      console.log('Regenerating asset from scratch, keeping description but starting over implementation');
      // The definitiveDescription is already captured from currentAsset.description
      currentContent = null; // Asset code will be regenerated
    }
  } else {
    console.log('No existing asset found, will create new one');
    if (options.lintOnly) {
      throw new Error('Cannot perform lint-only operation when no existing asset is found.');
    }
    if (options.skipRender && !options.renderOnly) {
      throw new Error('Cannot skip rendering when no existing asset is found. Remove the --skip-render flag.');
    }
    // For new assets, definitiveDescription will be undefined here.
  }

  let descriptionForGenerator: string;
  if (currentAsset) {
    descriptionForGenerator = currentAsset.description; // Always use the description from the loaded asset
  } else {
    // For new assets, the description might come from an initial prompt or be a default.
    descriptionForGenerator = options.additionalPrompt || "New asset - description to be filled by user.";
  }
  // If fromScratch is true and currentAsset exists, descriptionForGenerator is already correctly set to currentAsset.description.

  let renderingResult: { stance: string; mediaType: string; dataUrl: string; filePath: string }[] = [];
  if (currentAsset && options.fromScratch) {
    console.log('Skipping rendering of existing asset as --from-scratch is enabled');
  } else if (currentAsset && (!options.skipRender || options.renderOnly)) {
    renderingResult = await renderAsset(assetName, currentAsset, assetPath);
    console.log('Asset rendered successfully');
    if (!options.skipVideos) {
      try {
        console.log('Generating videos for each stance...');
        renderingResult.push(
          ...(await renderAssetVideos(assetName, currentAsset, assetPath, {
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
    const assetDir = path.dirname(assetPath);
    const files = await fs.readdir(assetDir);
    console.log('Files in asset directory:', files);
    for (const file of files) {
      if (file.endsWith('.mp4') || file.endsWith('.png')) {
        const mediaType = file.endsWith('mp4') ? 'video/mp4' : 'image/png';
        const stanceName = file.replace(`${assetName.toLowerCase()}-`, '').replace(/\textension/g, '');
        renderingResult.push({
          stance: stanceName,
          mediaType: mediaType,
          dataUrl: `data:${mediaType};base64,${(await fs.readFile(path.join(assetDir, file))).toString('base64')}`,
          filePath: path.join(assetDir, file),
        });
      }
    }
    console.log(`Loaded ${renderingResult.length} existing media items.`);
  }

  if (!(options.renderOnly || options.lintOnly)) {
    console.log('\nGenerating improved asset using direct visual input...');

    const mediaForGenerator = options.fromScratch ? null : renderingResult;

    const improvedImplementation = await generateImprovedAsset(
      assetName,
      assetPath, 
      currentAsset, 
      currentContent,
      mediaForGenerator, 
      options.additionalPrompt, // This is still passed for any other special requirements
      options.fromScratch,
      descriptionForGenerator, // This is the definitive description to be preserved
    );

    console.log('\nSaving improved asset...');
    await saveAsset(assetPath, improvedImplementation);
    console.log('Asset saved successfully');
    currentContent = improvedImplementation; 
    currentAsset = await loadAsset(assetPath); 
    if (!currentAsset) {
      throw new Error('Failed to reload asset after saving improved version.');
    }
  } else {
    console.log('Skipping asset improvement (--render-only or --lint-only flag is enabled)');
  }

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
        const fixResult: LintFixResult = await fixLintErrors(lintResults, currentAsset, assetPath);

        if (fixResult.success) {
          console.log('\nLinting issues fixed successfully');
          await saveAsset(assetPath, fixResult.code);
          console.log('Fixed asset code saved successfully');
          lintingResult.errorsFixed = true;
          currentContent = fixResult.code; 
          break; 
        } else {
          console.error('\nFailed to fix linting issues after attempt', tryCount + 1, fixResult.error);
          lintingResult.errorsFixed = false;
          if (tryCount === 2) console.error('Failed to fix linting issues after multiple attempts.');
        }
      } else {
        console.log('No linting issues found');
        break;
      }
    }
  }

  if (!(options.renderOnly || options.lintOnly)) {
    currentAsset = await loadAsset(assetPath);
    if (!currentAsset) {
      throw new Error('Failed to load current asset after potential modifications.');
    }
  }

  if (currentAsset && !options.skipRender && !(options.renderOnly && renderingResult.length > 0) && !options.lintOnly) {
    console.log('\nRendering final version of the asset...');
    const finalRenderingResult = await renderAsset(assetName, currentAsset, assetPath);
    if (!options.skipVideos) {
      try {
        console.log('Generating videos for final asset...');
        finalRenderingResult.push(
          ...(await renderAssetVideos(assetName, currentAsset, assetPath, {
            fps: options.videoOptions?.fps,
            duration: options.videoOptions?.duration,
            verbosity: options.videoOptions?.verbosity || 'minimal',
            logProgress: options.videoOptions?.verbosity !== 'none',
          })),
        );
      } catch (error) {
        console.error('Error generating videos for final asset:', error);
      }
    }
    renderingResult = finalRenderingResult;
  } else if (!currentAsset && !(options.renderOnly || options.lintOnly)) {
    console.warn(
      'Warning: Asset could not be loaded for final rendering. This might indicate an issue in generation or saving.',
    );
  } else {
    console.log(
      '\nSkipping final rendering of asset (e.g. --skip-render, --render-only, or --lint-only used appropriately).',
    );
  }

  return {
    assetPath,
    assessment: null, 
    regenerated: !(options.renderOnly || options.lintOnly),
    renderingResult, 
    linting: lintingResult,
  };
}
