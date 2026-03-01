import * as fs from 'fs/promises';
import { getAssetFilePath, loadAsset } from './asset-loader.js';
import { renderAsset, renderAssetVideos, VerbosityLevel } from './render-character.js';
import { generateImprovedAsset } from './asset-generator.js';
import { saveAsset, saveAudioFile } from './asset-saver.js';
import { lintAssetFile, LintResult, formatLintErrors } from './asset-linter.js';
import { fixLintErrors, LintFixResult } from './asset-linter-fixer.js';
import * as path from 'path';
import { Asset, isSoundAsset, isVisualAsset, SoundAsset, VisualAsset } from '../assets-types.js';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { generateStabilityAudio } from './stability-audio-generator.js';

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
  renderingResult?: { stance: string; mediaType: string; dataUrl: string; filePath: string }[];
  /** Results of linting process */
  linting?: AssetLintingResult;
  /** Path to the generated audio file (if sound asset) */
  audioFile?: string;
}

/**
 * Converts a kebab-case string to PascalCase.
 * e.g., 'my-asset-name' becomes 'MyAssetName'
 * @param str The input string in kebab-case.
 * @returns The string in PascalCase.
 */
function pascalCase(str: string): string {
  return str.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('');
}

/**
 * Generates the initial TypeScript content for a new asset.
 * @param assetName The original name of the asset (e.g., kebab-case).
 * @param assetDescription The user-provided description for the asset.
 * @param assetType The type of asset ('visual' or 'sound').
 * @returns A string containing the initial TypeScript code for the asset.
 */
function generateInitialAssetContent(assetName: string, assetDescription: string, assetType: 'visual' | 'sound'): string {
  const pascalAssetName = pascalCase(assetName);
  const escapedDescription = assetDescription.replace(/'/g, "\\'");

  if (assetType === 'sound') {
    return `import { SoundAsset } from '../../../generator-core/src/assets-types.js';

export const ${pascalAssetName}: SoundAsset = {
  type: 'sound',
  name: '${assetName}',
  description: '${escapedDescription}',
  prompt: '${escapedDescription}',
};
`;
  }

  return `import { VisualAsset } from '../../../generator-core/src/assets-types.js';

export const ${pascalAssetName}: VisualAsset = {
  name: '${assetName}',
  description: '${escapedDescription}',
  stances: ['idle'], // Default stance
  render(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, progress: number, stance: string, direction: 'left' | 'right'): void {
    ctx.fillStyle = 'grey';
    ctx.fillRect(x, y, width, height);
    console.log("'Render method for ${assetName} - stance: " + stance + ", direction: " + direction + ", progress: " + progress.toFixed(2));
  }
};
`;
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

  if (!currentAsset) {
    console.log(`Asset '${assetName}' not found at ${assetPath}.`);
    if (options.lintOnly || options.renderOnly) {
      throw new Error(
        `Cannot perform '${options.lintOnly ? '--lint-only' : '--render-only'}' operation: Asset '${assetName}' does not exist and creation was not confirmed or is not applicable.`
      );
    }

    const rl = createInterface({ input, output });
    try {
      const answer = await rl.question(`Create new asset '${assetName}'? (yes/no): `);
      if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
        let assetTypeAnswer = await rl.question(`Is this a visual or sound asset? (visual/sound): `);
        assetTypeAnswer = assetTypeAnswer.toLowerCase().trim();
        const assetType = assetTypeAnswer === 'sound' ? 'sound' : 'visual';
        
        const description = await rl.question(`Enter a brief description for '${assetName}': `);
        const initialContent = generateInitialAssetContent(assetName, description || `Initial description for new asset '${assetName}'.`, assetType);
        await saveAsset(assetPath, initialContent);
        console.log(`Asset '${assetName}' created successfully at ${assetPath}.`);
        currentAsset = await loadAsset(assetPath);
        if (!currentAsset) {
          throw new Error(`Failed to load newly created asset '${assetName}'. Please check file system permissions and asset structure.`);
        }
        currentContent = await fs.readFile(assetPath, 'utf-8');
        definitiveDescription = currentAsset.description;
        options.fromScratch = true; // Ensure new assets are generated from scratch with the new description
      } else {
        console.log('Asset creation declined by user. Exiting.');
        process.exit(0);
      }
    } finally {
      rl.close();
    }
  } else {
    console.log('Current asset loaded successfully');
    currentContent = await fs.readFile(assetPath, 'utf-8');
    definitiveDescription = currentAsset.description;
    if (options.fromScratch) {
      console.log('Regenerating asset from scratch, keeping description but starting over implementation');
      // The definitiveDescription is already captured from currentAsset.description
      currentContent = null; // Asset code will be regenerated
    }
  }
  
  //This check is important because currentAsset could have been null and then created.
  if (!currentAsset) {
    // This case should ideally not be reached if the creation logic is sound and exit conditions are met.
    throw new Error(`Asset '${assetName}' could not be loaded or created. Critical error.`);
  }

  // --- SOUND ASSET PIPELINE ---
  if (isSoundAsset(currentAsset)) {
    console.log(`Processing sound asset: ${assetName}`);
    
    if (options.lintOnly) {
       console.log('Skipping linting for sound asset.');
       return { assetPath, regenerated: false };
    }
    
    if (options.renderOnly) {
       console.log('Skipping rendering for sound asset.');
       return { assetPath, regenerated: false };
    }

    const generationPrompt = options.additionalPrompt || currentAsset.prompt;
    let audioBuffer: Buffer | undefined;

    if (!options.fromScratch && currentAsset.audioFile) {
      const audioFilePath = path.join(path.dirname(assetPath), currentAsset.audioFile);
      try {
        audioBuffer = await fs.readFile(audioFilePath);
        console.log(`Loaded existing audio file for refinement: ${currentAsset.audioFile}`);
      } catch (error) {
        console.warn(`Could not load existing audio file ${currentAsset.audioFile}. Falling back to text-to-audio.`, error);
      }
    }

    try {
      const generatedBuffer = await generateStabilityAudio({
        prompt: generationPrompt,
        audioBuffer,
      });

      const audioFileName = `${assetName}.mp3`;
      const audioFilePath = path.join(path.dirname(assetPath), audioFileName);
      
      console.log(`Saving generated audio to ${audioFilePath}...`);
      await saveAudioFile(audioFilePath, generatedBuffer);
      
      // Update the .ts file if the prompt changed or if it's the first time generating
      let newContent = currentContent || '';
      if (!currentAsset.audioFile || (options.additionalPrompt && options.additionalPrompt !== currentAsset.prompt)) {
        // Simple string replacement to update prompt and audioFile
        // In a more robust system, we'd use an AST parser, but this works for our simple format
        if (options.additionalPrompt) {
          newContent = newContent.replace(/prompt:\s*['"].*['"]/, `prompt: '${options.additionalPrompt.replace(/'/g, "\\'")}'`);
        }
        if (!newContent.includes('audioFile:')) {
           newContent = newContent.replace(/};\s*$/, `  audioFile: '${audioFileName}',\n};\n`);
        } else {
           newContent = newContent.replace(/audioFile:\s*['"].*['"]/, `audioFile: '${audioFileName}'`);
        }
        await saveAsset(assetPath, newContent);
      }

      console.log('Sound asset processed successfully.');
      return {
        assetPath,
        regenerated: true,
        audioFile: audioFileName,
      };

    } catch (error) {
      console.error('Failed to generate sound asset:', error);
      throw error;
    }
  }

  // --- VISUAL ASSET PIPELINE ---
  
  // We know it's a VisualAsset at this point
  const visualAsset = currentAsset as VisualAsset;

  let descriptionForGenerator: string;
  // definitiveDescription is set either from existing asset or from user prompt for new asset
  descriptionForGenerator = definitiveDescription!;

  let renderingResult: { stance: string; mediaType: string; dataUrl: string; filePath: string }[] = [];
  if (options.fromScratch && !options.renderOnly) { // If fromScratch (could be new or explicit), skip initial render unless renderOnly
    console.log('Skipping rendering of existing/new asset as --from-scratch is enabled (and not --render-only)');
  } else if ((!options.skipRender || options.renderOnly)) {
    renderingResult = await renderAsset(assetName, visualAsset, assetPath);
    console.log('Asset rendered successfully');
    if (!options.skipVideos) {
      try {
        console.log('Generating videos for each stance...');
        renderingResult.push(
          ...(await renderAssetVideos(assetName, visualAsset, assetPath, {
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
  } else if (options.skipRender) {
    console.log('Skipping rendering of existing asset (--skip-render flag is enabled), using existing renderings');
    const assetDir = path.dirname(assetPath);
    const files = await fs.readdir(assetDir);
    console.log('Files in asset directory:', files);
    for (const file of files) {
      if (file.endsWith('.mp4') || file.endsWith('.png')) {
        const mediaType = file.endsWith('mp4') ? 'video/mp4' : 'image/png';
        const stanceName = file.replace(`${assetName.toLowerCase()}-`, '').replace(/\.(mp4|png)$/g, '');
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

    // For a brand new asset (options.fromScratch was set to true), mediaForGenerator should be null.
    // If --from-scratch was explicitly passed for an existing asset, also null.
    const mediaForGenerator = options.fromScratch ? null : renderingResult;

    const improvedImplementation = await generateImprovedAsset(
      assetName,
      assetPath, 
      visualAsset, 
      currentContent, // This will be null if fromScratch is true (new or explicit)
      mediaForGenerator, 
      options.additionalPrompt,
      options.fromScratch, // True for new assets or if explicitly requested
      descriptionForGenerator, // This is the definitive description
    );

    console.log('\nSaving improved asset...');
    await saveAsset(assetPath, improvedImplementation);
    console.log('Asset saved successfully');
    currentContent = improvedImplementation; 
    
    const reloadedAsset = await loadAsset(assetPath);
    if (!reloadedAsset || !isVisualAsset(reloadedAsset)) {
      throw new Error('Failed to reload asset as VisualAsset after saving improved version.');
    }
    currentAsset = reloadedAsset;
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
        const fixResult: LintFixResult = await fixLintErrors(lintResults, currentAsset as VisualAsset, assetPath);

        if (fixResult.success) {
          console.log('\nLinting issues fixed successfully');
          await saveAsset(assetPath, fixResult.code);
          console.log('Fixed asset code saved successfully');
          lintingResult.errorsFixed = true;
          currentContent = fixResult.code; 
          
          const reloadedAfterLint = await loadAsset(assetPath); // Reload after fixing
          if (!reloadedAfterLint || !isVisualAsset(reloadedAfterLint)) {
             throw new Error('Failed to reload asset as VisualAsset after lint fixes.');
          }
          currentAsset = reloadedAfterLint;
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

  // Final Rendering Logic
  // Re-render if:
  // 1. An asset exists (currentAsset is not null).
  // 2. Rendering is not skipped (options.skipRender is false).
  // 3. It's NOT (renderOnly AND we already have rendering results from the initial render pass).
  // 4. It's NOT lintOnly.
  if (currentAsset && isVisualAsset(currentAsset) && 
      !options.skipRender && 
      !((options.renderOnly || options.fromScratch) && renderingResult.length > 0) && // if renderOnly/fromScratch, and we already rendered, don't re-render
      !options.lintOnly) {
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
    renderingResult = finalRenderingResult; // Update with final renderings
  } else if (!currentAsset && !(options.renderOnly || options.lintOnly)) {
    console.warn(
      'Warning: Asset could not be loaded for final rendering. This might indicate an issue in generation or saving.',
    );
  } else {
    console.log(
      '\nSkipping final rendering of asset (e.g. --skip-render, --render-only, or --lint-only used appropriately, or asset was just created and rendered).',
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
