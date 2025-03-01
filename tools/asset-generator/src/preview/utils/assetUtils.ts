/**
 * Asset Utility Functions
 *
 * This file contains utility functions for working with assets in the preview application.
 * It provides functionality for loading assets, checking animation support, and regeneration.
 */

import { Asset, AssetAnimationState } from '../../assets/assets-types';

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
  // TODO: call rest endpoint
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
 * @param stance Optional stance name (defaults to first stance)
 * @param customProperties Optional custom properties specific to the asset
 */
export function renderAssetToCanvas<T extends AssetAnimationState, P extends Record<string, any>>(
  asset: Asset<T, P>,
  ctx: CanvasRenderingContext2D,
  animationProgress?: number,
  stance?: string,
  customProperties?: Partial<P>
): void {
  // Clear the canvas
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // Save context state
  ctx.save();

  try {
    // Get the default state from the asset
    const defaultState = { ...asset.defaultState };
    
    // Create the state object by merging defaults with provided values
    const state = {
      ...defaultState,
      progress: animationProgress !== undefined ? animationProgress : defaultState.progress,
      stance: stance || defaultState.stance,
      ...(customProperties || {}),
    } as T & P;

    // Center the asset on the canvas
    const canvasWidth = ctx.canvas.width;
    const canvasHeight = ctx.canvas.height;

    // Move to the center of the canvas
    ctx.translate(canvasWidth / 2, canvasHeight / 2);

    // Scale to fit within the canvas while maintaining aspect ratio
    // We use a standard size of 100x100 units for the asset's coordinate system
    const scale = Math.min(canvasWidth / 200, canvasHeight / 200) * 0.8; // 80% of the max possible size
    ctx.scale(scale, scale);

    // Render the asset with the combined state
    asset.render(ctx, state);
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
}

/**
 * Get default properties for an asset
 * @param asset The asset to get default properties for
 * @returns Default properties for the asset
 */
export function getDefaultProperties<T extends AssetAnimationState, P extends Record<string, any>>(
  asset: Asset<T, P>
): P {
  // Extract custom properties from defaultState (excluding standard animation state properties)
  const { progress, stance, ...customProperties } = asset.defaultState;
  return customProperties as P;
}