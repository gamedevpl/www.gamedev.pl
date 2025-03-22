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
 * Update the cached ground canvas (for animation)
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
 * Draw the ground on the main canvas using the cached ground image
 */
export function drawGround(ctx: CanvasRenderingContext2D, renderState: RenderState) {
  // Initialize the ground cache if not already done
  if (!cachedCanvas || !cachedContext) {
    initGroundCache();
  }

  if (!cachedCanvas || !cachedContext) {
    return;
  }

  const { viewport } = renderState;

  // Calculate the visible area of the ground
  const sourceX = Math.max(0, -viewport.x);
  const sourceY = Math.max(0, -viewport.y);
  const sourceWidth = Math.min(ctx.canvas.width, GAME_WORLD_WIDTH - sourceX);
  const sourceHeight = Math.min(ctx.canvas.height, GAME_WORLD_HEIGHT - sourceY);

  // Destination coordinates (where to draw on the main canvas)
  const destX = Math.max(0, viewport.x);
  const destY = Math.max(0, viewport.y);

  // Copy the visible portion from the cached canvas to the main canvas
  ctx.drawImage(
    cachedCanvas,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight, // Source rectangle
    destX,
    destY,
    sourceWidth,
    sourceHeight, // Destination rectangle
  );
}
