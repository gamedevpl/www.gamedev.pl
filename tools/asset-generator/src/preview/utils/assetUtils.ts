/**
 * Asset Utility Functions
 *
 * This file contains utility functions for working with assets in the preview application.
 * It provides functionality for loading assets, checking animation support, and regeneration.
 */

import { Asset } from '../../assets/assets-types';

// Import all assets
import { Lion2d } from '../../assets/lion-2d/lion-2d';

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
  const assets: Asset[] = [Lion2d];

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
export async function regenerateAsset(_assetName: string, _options: RegenerateAssetOptions = {}): Promise<void> {
  // TODO: call rest endpint
}

/**
 * Get an asset by name
 * @param assetName Name of the asset to get
 * @returns The asset or undefined if not found
 */
export function getAssetByName(assetName: string): Asset | undefined {
  return getAvailableAssets().find((info) => info.name === assetName)?.asset;
}

/**
 * Render an asset to a canvas
 * @param asset The asset to render
 * @param ctx The canvas rendering context
 * @param animationProgress Optional animation progress (0-1)
 */
export function renderAssetToCanvas(asset: Asset, ctx: CanvasRenderingContext2D, animationProgress?: number): void {
  // Clear the canvas
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // Save context state
  ctx.save();

  // Center and scale the asset
  const scale = Math.min(ctx.canvas.width / 1024, ctx.canvas.height / 1024);

  ctx.translate(ctx.canvas.width / 2, ctx.canvas.height / 2);
  ctx.scale(scale, scale);
  ctx.translate(-512, -512);

  try {
    // For Lion2d, we need to pass an animation state object
    asset.render(ctx, {
      progress: animationProgress || 0,
      stance: asset.stances[0],
    });
  } catch (error) {
    console.error('Error rendering asset:', error);

    // Draw error message on canvas
    ctx.restore();
    ctx.font = '16px sans-serif';
    ctx.fillStyle = 'red';
    ctx.textAlign = 'center';
    ctx.fillText('Error rendering asset', ctx.canvas.width / 2, ctx.canvas.height / 2);
    return;
  }

  // Restore context state
  ctx.restore();
}
