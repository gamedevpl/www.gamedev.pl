import { RenderState } from './render-state';
import { Ground2D } from '../../../../../../tools/asset-generator/generator-assets/src/ground-2d/ground-2d';
import { GAME_WORLD_WIDTH, GAME_WORLD_HEIGHT } from '../game-world/game-world-consts';

// Module-level cached canvas and context
let cachedCanvas: HTMLCanvasElement | null = null;
let cachedContext: CanvasRenderingContext2D | null = null;
const TILE_SIZE = 32; // Size of each ground tile

/**
 * Initialize the cached ground canvas
 */
function initGroundCache() {
  // Create a canvas with the size of the entire game world
  cachedCanvas = document.createElement('canvas');
  cachedCanvas.width = GAME_WORLD_WIDTH;
  cachedCanvas.height = GAME_WORLD_HEIGHT;

  cachedContext = cachedCanvas.getContext('2d');
  if (!cachedContext) {
    console.error('Failed to get 2D context for cached ground canvas');
    return;
  }

  // Initial render of the entire ground
  updateGroundCache();
}

/**
 * Update the cached ground canvas (for animation or changes)
 */
function updateGroundCache() {
  if (!cachedContext || !cachedCanvas) return;

  // Render all ground tiles to the cached canvas
  for (let x = 0; x < GAME_WORLD_WIDTH; x += TILE_SIZE) {
    for (let y = 0; y < GAME_WORLD_HEIGHT; y += TILE_SIZE) {
      Ground2D.render(cachedContext, x, y, TILE_SIZE, TILE_SIZE, 0, 'default', 'right');
    }
  }
}

/**
 * Draw the ground on the main canvas using the cached ground image, tiling it for wrapping.
 */
export function drawGround(ctx: CanvasRenderingContext2D, renderState: RenderState) {
  // Initialize the ground cache if not already done
  if (!cachedCanvas || !cachedContext) {
    initGroundCache();
  }

  if (!cachedCanvas || !cachedContext) {
    return; // Exit if cache initialization failed
  }

  const { viewport } = renderState;
  const canvasWidth = ctx.canvas.width;
  const canvasHeight = ctx.canvas.height;
  const ww = GAME_WORLD_WIDTH;
  const wh = GAME_WORLD_HEIGHT;

  // --- Tiling Logic for Wrapped World (Modulo Approach) ---

  // Calculate the effective offset of the world origin (0,0) on the canvas,
  // wrapped within the dimensions of the cached world texture.
  const offsetX = ((viewport.x % ww) + ww) % ww;
  const offsetY = ((viewport.y % wh) + wh) % wh;

  // Calculate the canvas coordinates for the top-left corner of the *first* tile instance.
  const startDrawX = offsetX - ww;
  const startDrawY = offsetY - wh;

  // Draw the cached canvas repeatedly to cover the entire visible area.
  // Extend the loop condition to ensure coverage beyond the immediate canvas dimensions.
  for (let tileX = startDrawX; tileX < canvasWidth + ww; tileX += ww) {
    // Extend loop condition
    for (let tileY = startDrawY; tileY < canvasHeight + wh; tileY += wh) {
      // Extend loop condition
      ctx.drawImage(
        cachedCanvas,
        0, // Source X
        0, // Source Y
        ww, // Source Width
        wh, // Source Height
        tileX, // Destination X
        tileY, // Destination Y
        ww, // Destination Width
        wh, // Destination Height
      );
    }
  }
  // --- End Tiling Logic ---
}
