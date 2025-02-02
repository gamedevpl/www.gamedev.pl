import { renderAsset } from './tools/render-character.js';
import { getAssetFilePath, loadAsset } from './tools/asset-loader.js';
import { assessAsset } from './tools/asset-assessor.js';
import { generateImprovedAsset } from './tools/asset-generator.js';
import { saveAsset } from './tools/asset-saver.js';
import * as fs from 'fs/promises';

export async function assetGenRunner() {
  try {
    // Parse CLI arguments
    const assetName = process.argv[2];
    if (!assetName) {
      throw new Error('Asset name is required. Usage: asset-generator <asset-name>');
    }

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

    // Run inference for assessment
    const assessment = currentAsset
      ? await assessAsset(currentAsset, currentContent, renderingResult)
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
    await renderAsset(currentAsset, assetPath);
  } catch (error) {
    console.error('Error:', (error as Error).message);
    process.exit(1);
  }
}
