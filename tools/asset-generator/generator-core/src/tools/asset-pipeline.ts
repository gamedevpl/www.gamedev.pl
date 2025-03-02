import { getAssetFilePath, loadAsset } from './asset-loader.js';
import { renderAsset } from './render-character.js';
import { assessAsset } from './asset-assessor.js';
import { generateImprovedAsset } from './asset-generator.js';
import { saveAsset } from './asset-saver.js';
import * as fs from 'fs/promises';

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
export async function runAssetGenerationPipeline(
  assetName: string,
  options: AssetGenerationOptions = {},
): Promise<AssetGenerationResult> {
  // Get asset file path
  const assetPath = await getAssetFilePath(assetName);
  console.log(`Processing asset: ${assetName}`);
  console.log(`Asset path: ${assetPath}`);

  // Load current asset if exists
  let currentAsset = await loadAsset(assetPath);
  let currentContent: string | null = null;

  if (currentAsset) {
    console.log('Current asset loaded successfully');
    currentContent = await fs.readFile(assetPath, 'utf-8');
  } else {
    console.log('No existing asset found, will create new one');
  }

  // Render current asset if exists
  let renderingResult = '';
  if (currentAsset) {
    renderingResult = await renderAsset(currentAsset, assetPath);
    console.log('Asset rendered successfully');
  }

  if (options.renderOnly) {
    console.log('Rendering only, exiting...');
    return {
      assetPath,
      regenerated: false,
    };
  }

  // Run inference for assessment
  const assessment = currentAsset
    ? await assessAsset(assetPath, currentAsset, currentContent, renderingResult)
    : 'No existing asset to assess';
  console.log('\nAsset Assessment:');
  console.log(assessment);

  // Generate improved asset
  console.log('\nGenerating improved asset...');
  const improvedImplementation = await generateImprovedAsset(assetName, currentContent, assessment);

  // Save new asset
  console.log('\nSaving improved asset...');
  await saveAsset(assetPath, improvedImplementation);
  console.log('Asset saved successfully');

  // Render improved asset
  console.log('\nRendering improved asset...');
  currentAsset = await loadAsset(assetPath);
  if (!currentAsset) {
    throw new Error('Failed to load current asset after saving');
  }

  await renderAsset(currentAsset, assetPath);

  return {
    assetPath,
    assessment,
    regenerated: true,
  };
}
