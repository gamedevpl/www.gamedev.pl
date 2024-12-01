import { GAME_WORLD_HEIGHT } from '../../../game-world/game-world-consts';
import { Tree, TREE_COLORS } from './tree-types';
import { ViewportState } from '../../render-state';

/**
 * Apply parallax translation to a point based on viewport position and parallax factor
 * Returns pixel-perfect coordinates for smooth rendering
 */
function applyParallaxTranslation(
  x: number,
  y: number,
  viewport: ViewportState,
  parallaxFactor: number
): { x: number; y: number } {
  return {
    x: Math.round(x + viewport.x * parallaxFactor),
    y: Math.round(y + viewport.y * parallaxFactor)
  };
}

/**
 * Get color for specific tree layer
 */
function getLayerColor(layer: number): string {
  return layer === 0 
    ? TREE_COLORS.DISTANT 
    : layer === 1 
      ? TREE_COLORS.MIDDLE 
      : TREE_COLORS.NEAR;
}

/**
 * Render a single tree using pixel art style with parallax effect
 */
function renderTree(
  ctx: CanvasRenderingContext2D,
  tree: Tree,
  viewport: ViewportState
): void {
  // Calculate base position with parallax
  const basePosition = applyParallaxTranslation(
    tree.x,
    GAME_WORLD_HEIGHT,
    viewport,
    tree.parallaxFactor
  );

  // Calculate tree dimensions
  const width = Math.round(tree.width);
  const height = Math.round(tree.height);
  
  // Calculate tree points with parallax
  const baseLeft = basePosition.x;
  const baseRight = basePosition.x + width;
  const baseY = basePosition.y;
  const topX = basePosition.x + width / 2;
  const topY = basePosition.y - height;

  // Draw triangular tree shape
  ctx.beginPath();
  ctx.moveTo(baseLeft, baseY); // Base left
  ctx.lineTo(topX, topY);      // Top
  ctx.lineTo(baseRight, baseY); // Base right
  ctx.closePath();
  ctx.fill();
}

/**
 * Render trees by layer with parallax effect
 */
export function renderTrees(
  ctx: CanvasRenderingContext2D,
  trees: Tree[],
  viewport: ViewportState
): void {
  // Sort trees by layer (back to front)
  const sortedTrees = [...trees].sort((a, b) => a.layer - b.layer);

  // Group trees by layer for efficient rendering
  const treesByLayer = sortedTrees.reduce((acc, tree) => {
    acc[tree.layer] = acc[tree.layer] || [];
    acc[tree.layer].push(tree);
    return acc;
  }, {} as Record<number, Tree[]>);

  // Save current context state
  ctx.save();

  // Render each layer with its color
  Object.entries(treesByLayer).forEach(([layer, layerTrees]) => {
    // Set layer-specific color
    ctx.fillStyle = getLayerColor(Number(layer));

    // Render all trees in this layer
    layerTrees.forEach((tree) => renderTree(ctx, tree, viewport));
  });

  // Restore context state
  ctx.restore();
}