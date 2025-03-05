import { getAssetFilePath, loadAsset } from './asset-loader.js';
import { renderAsset, renderAssetVideos, VideoRenderResult } from './render-character.js';
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
  /** Whether to skip video generation */
  skipVideos?: boolean;
  /** Video rendering options */
  videoOptions?: {
    /** Frames per second for the video (default: 30) */
    fps?: number;
    /** Duration of the video in seconds (default: 2) */
    duration?: number;
  };
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
  /** Results of video generation for each stance */
  videos?: VideoRenderResult[];
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
    
    // Generate videos for each stance if not skipped
    let videoResults: VideoRenderResult[] = [];
    if (!options.skipVideos) {
      try {
        console.log('\nGenerating videos for each stance...');
        videoResults = await renderAssetVideos(currentAsset, assetPath, {
          fps: options.videoOptions?.fps,
          duration: options.videoOptions?.duration,
          logProgress: true,
        });
        console.log('Video generation completed successfully');
      } catch (error) {
        console.error('Error generating videos:', error);
      }
    }
  }

  if (options.renderOnly) {
    console.log('Rendering only, exiting...');
    
    // If we have videos, include them in the result
    const videos = !options.skipVideos && currentAsset 
      ? await renderAssetVideos(currentAsset, assetPath, {
          fps: options.videoOptions?.fps,
          duration: options.videoOptions?.duration,
          logProgress: true,
        }).catch(error => {
          console.error('Error generating videos in render-only mode:', error);
          return [];
        })
      : undefined;
    
    return {
      assetPath,
      regenerated: false,
      videos,
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
  
  // Generate videos for the improved asset if not skipped
  let videos: VideoRenderResult[] | undefined;
  if (!options.skipVideos) {
    try {
      console.log('\nGenerating videos for improved asset...');
      videos = await renderAssetVideos(currentAsset, assetPath, {
        fps: options.videoOptions?.fps,
        duration: options.videoOptions?.duration,
        logProgress: true,
      });
      console.log('Video generation for improved asset completed successfully');
    } catch (error) {
      console.error('Error generating videos for improved asset:', error);
    }
  }

  return {
    assetPath,
    assessment,
    regenerated: true,
    videos,
  };
}