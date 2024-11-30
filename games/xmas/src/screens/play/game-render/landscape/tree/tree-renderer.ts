import { GAME_WORLD_HEIGHT } from '../../../game-world/game-world-consts';
import { Tree, TREE_COLORS } from './tree-types';

/**
 * Render a single tree using pixel art style
 */
function renderTree(ctx: CanvasRenderingContext2D, tree: Tree): void {
  const x = Math.round(tree.x);
  const y = Math.round(GAME_WORLD_HEIGHT - tree.height);
  const width = Math.round(tree.width);
  const height = Math.round(tree.height);

  // Draw triangular tree shape
  ctx.beginPath();
  ctx.moveTo(x, y + height); // Base left
  ctx.lineTo(x + width / 2, y); // Top
  ctx.lineTo(x + width, y + height); // Base right
  ctx.closePath();
  ctx.fill();
}

/**
 * Render trees by layer
 */
export function renderTrees(ctx: CanvasRenderingContext2D, trees: Tree[]): void {
  // Sort trees by layer (back to front)
  const sortedTrees = [...trees].sort((a, b) => a.layer - b.layer);

  // Group trees by layer
  const treesByLayer = sortedTrees.reduce((acc, tree) => {
    acc[tree.layer] = acc[tree.layer] || [];
    acc[tree.layer].push(tree);
    return acc;
  }, {} as Record<number, Tree[]>);

  // Render each layer with its color
  Object.entries(treesByLayer).forEach(([layer, layerTrees]) => {
    const color = Object.values(TREE_COLORS)[Number(layer)];
    ctx.fillStyle = color;

    // Render all trees in this layer
    layerTrees.forEach((tree) => renderTree(ctx, tree));
  });
}
