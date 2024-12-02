import { GAME_WORLD_HEIGHT } from '../../../game-world/game-world-consts';
import { SNOW_GROUND } from '../snow-ground/snow-ground-types';
import { Tree, TREE_COLOR } from './tree-types';

/**
 * Render a single tree using pixel art style
 */
function renderTree(ctx: CanvasRenderingContext2D, tree: Tree): void {
  // Calculate screen position
  const screenX = Math.round(tree.x);
  const screenY = Math.round(GAME_WORLD_HEIGHT) - GAME_WORLD_HEIGHT * SNOW_GROUND.HEIGHT_RATIO;

  // Calculate tree dimensions
  const width = Math.round(tree.width);
  const height = Math.round(tree.height);

  // Calculate tree points
  const baseLeft = screenX;
  const baseRight = screenX + width;
  const baseY = screenY;
  const topX = screenX + width / 2;
  const topY = screenY - height;

  // Draw triangular tree shape
  ctx.beginPath();
  ctx.moveTo(baseLeft, baseY); // Base left
  ctx.lineTo(topX, topY); // Top
  ctx.lineTo(baseRight, baseY); // Base right
  ctx.closePath();
  ctx.fill();
}

/**
 * Render all trees with uniform appearance
 */
export function renderTrees(ctx: CanvasRenderingContext2D, trees: Tree[]): void {
  // Save current context state
  ctx.save();

  // Set tree color
  ctx.fillStyle = TREE_COLOR;

  // Render all trees
  trees.forEach((tree) => renderTree(ctx, tree));

  // Restore context state
  ctx.restore();
}
