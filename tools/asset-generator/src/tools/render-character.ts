import { createCanvas } from 'canvas';
import { Asset } from '../assets/assets-types.js';
import * as fs from 'fs/promises';
import * as path from 'path';

/// <reference lib="dom" />

/**
 * Renders an asset to canvas and saves it as PNG file in the asset directory
 * @param asset The asset to render
 * @param assetPath Path to the asset's source file
 * @returns Data URL of the rendered asset
 */
export async function renderAsset(asset: Asset, assetPath: string): Promise<string> {
  const canvas = createCanvas(1024, 1024);
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
  asset.render(ctx as any, undefined);
  const dataUrl = canvas.toDataURL();

  try {
    // Convert data URL to buffer
    const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    // Create output file path
    const assetDir = path.dirname(assetPath);
    const outputPath = path.join(assetDir, `${asset.name.toLowerCase()}.png`);

    // Save the buffer as PNG file
    await fs.writeFile(outputPath, buffer);
    console.log(`Rendered asset saved to: ${outputPath}`);
  } catch (error) {
    console.error('Failed to save rendered asset:', error);
  }

  return dataUrl;
}
