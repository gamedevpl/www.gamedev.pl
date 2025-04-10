/**
 * Asset Utility Functions
 *
 * This file contains utility functions for working with assets in the preview application.
 * It provides functionality for loading assets, checking animation support, and regeneration.
 */

import { Asset } from '../../../generator-core/src/assets-types';

// Import all assets
import { Lion2d } from '../../../generator-assets/src/lion-2d/lion-2d';
import { Prey2d } from '../../../generator-assets/src/prey-2d/prey-2d';
import { Hunter2d } from '../../../generator-assets/src/hunter-2d/hunter-2d';

/**
 * Interface for asset metadata
 */
export interface AssetInfo {
  name: string;
  asset: Asset;
}

/**
 * Get all available assets
 * @returns Array of asset info objects
 */
export function getAvailableAssets(): AssetInfo[] {
  // List of all available assets
  const assets: Asset[] = [Lion2d, Prey2d, Hunter2d];

  // Map assets to asset info objects
  return assets.map((asset) => ({
    name: asset.name,
    asset,
  }));
}

/**
 * Interface for asset regeneration options
 */
export interface RegenerateAssetOptions {
  /** Additional prompt with special requirements for asset generation */
  additionalPrompt?: string;
  /** Called when regeneration starts */
  onStart?: () => void;
  /** Called when regeneration completes successfully */
  onSuccess?: (result: any) => void;
  /** Called when regeneration fails */
  onError?: (error: Error) => void;
}

/**
 * Regenerate an asset using the asset pipeline
 * @param assetName Name of the asset to regenerate
 * @param options Regeneration options
 */
export async function regenerateAsset(assetName: string, options: RegenerateAssetOptions = {}): Promise<void> {
  try {
    // Call onStart callback if provided
    if (options.onStart) {
      options.onStart();
    }

    // Prepare request payload
    const payload = {
      assetName,
      additionalPrompt: options.additionalPrompt || undefined,
    };

    // Make POST request to the regenerate-asset endpoint
    const response = await fetch('/api/regenerate-asset', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    // Parse the response
    const result = await response.json();

    // Check if the request was successful
    if (!response.ok) {
      throw new Error(result.message || 'Failed to regenerate asset');
    }

    // Call onSuccess callback if provided
    if (options.onSuccess) {
      options.onSuccess(result);
    }

    console.log('Asset regenerated successfully:', result);
  } catch (error) {
    console.error('Error regenerating asset:', error);

    // Call onError callback if provided
    if (options.onError) {
      options.onError(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

/**
 * Get an asset by name
 * @param assetName Name of the asset to get
 * @returns The asset or undefined if not found
 */
export function getAssetByName(assetName: string): Asset | undefined {
  return getAvailableAssets().find((info) => info.name === assetName)?.asset;
}

export function renderAssetToCanvas(
  asset: Asset,
  ctx: CanvasRenderingContext2D,
  animationProgress?: number,
  stance?: string,
  direction?: 'left' | 'right',
): void {
  // Clear the canvas
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // Save context state
  ctx.save();

  try {
    // Center the asset on the canvas
    const canvasWidth = ctx.canvas.width;
    const canvasHeight = ctx.canvas.height;

    ctx.save();

    // Move to the center of the canvas
    ctx.translate(canvasWidth / 2, canvasHeight / 2);

    // Scale to fit within the canvas while maintaining aspect ratio
    // We use a standard size of 100x100 units for the asset's coordinate system
    const scale = Math.min(canvasWidth / 200, canvasHeight / 200) * 0.8; // 80% of the max possible size
    ctx.scale(scale, scale);

    // Calculate the dimensions for the asset
    // Since we've translated to the center and scaled, we need to adjust the x,y coordinates
    // to position the asset correctly within the scaled coordinate system
    const assetWidth = 100; // Standard width in the asset's coordinate system
    const assetHeight = 100; // Standard height in the asset's coordinate system
    
    // Calculate x,y to center the asset in the scaled coordinate system
    // Since we've already translated to the center, x,y should be negative half of the dimensions
    const x = -assetWidth / 2;
    const y = -assetHeight / 2;
    
    // Render the asset with the combined state and all required parameters
    asset.render(
      ctx, 
      x, 
      y, 
      assetWidth, 
      assetHeight, 
      animationProgress || 0, 
      stance || asset.stances[0], 
      direction || 'right'
    );
  } catch (error) {
    console.error('Error rendering asset:', error);

    // Draw error message on canvas
    ctx.restore(); // Restore before drawing error message
    ctx.font = '16px sans-serif';
    ctx.fillStyle = 'red';
    ctx.textAlign = 'center';
    ctx.fillText('Error rendering asset', ctx.canvas.width / 2, ctx.canvas.height / 2);
    return;
  }

  // Restore context state
  ctx.restore();

  // Draw progress text
  ctx.font = '16px sans-serif';
  ctx.fillStyle = 'black';
  ctx.textAlign = 'left';
  ctx.fillText(`Progress: ${animationProgress}`, 0, 16);
}