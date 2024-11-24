import { RenderState } from './render-state';
import { SKY_COLORS, SILHOUETTE_COLORS, Mountain, Tree, Star } from './landscape-render-types';
import { GAME_WORLD_HEIGHT } from '../game-world/game-world-consts';

/**
 * Render gradient night sky
 */
function renderSky(ctx: CanvasRenderingContext2D, height: number): void {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, SKY_COLORS.TOP);
  gradient.addColorStop(0.5, SKY_COLORS.MIDDLE);
  gradient.addColorStop(1, SKY_COLORS.BOTTOM);

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, ctx.canvas.width, height);
}

/**
 * Render twinkling stars
 */
function renderStars(ctx: CanvasRenderingContext2D, stars: Star[]): void {
  ctx.fillStyle = '#FFFFFF';

  for (const star of stars) {
    // Calculate star brightness based on twinkle phase
    const brightness = 0.3 + Math.sin(star.twinkle * Math.PI * 2) * 0.7;
    ctx.globalAlpha = brightness;

    // Round positions to nearest pixel for crisp rendering
    const x = Math.round(star.x);
    const y = Math.round(star.y);
    const size = Math.round(star.size);

    // Draw star as a small rectangle for pixel art style
    ctx.fillRect(x, y, size, size);
  }

  ctx.globalAlpha = 1;
}

/**
 * Render a single mountain using pixel art style
 */
function renderMountain(ctx: CanvasRenderingContext2D, mountain: Mountain): void {
  // Begin mountain path
  ctx.beginPath();
  ctx.moveTo(Math.round(mountain.points[0].x), Math.round(mountain.points[0].y));

  // Draw mountain outline with pixel-perfect coordinates
  for (let i = 1; i < mountain.points.length; i++) {
    ctx.lineTo(Math.round(mountain.points[i].x), Math.round(mountain.points[i].y));
  }

  // Close and fill the path
  ctx.closePath();
  ctx.fill();
}

/**
 * Render mountains by layer
 */
function renderMountains(ctx: CanvasRenderingContext2D, mountains: Mountain[]): void {
  // Sort mountains by layer (back to front)
  const sortedMountains = [...mountains].sort((a, b) => a.layer - b.layer);

  // Group mountains by layer
  const mountainsByLayer = sortedMountains.reduce((acc, mountain) => {
    acc[mountain.layer] = acc[mountain.layer] || [];
    acc[mountain.layer].push(mountain);
    return acc;
  }, {} as Record<number, Mountain[]>);

  // Render each layer with its color
  Object.entries(mountainsByLayer).forEach(([layer, layerMountains]) => {
    const color = Object.values(SILHOUETTE_COLORS.MOUNTAINS)[Number(layer)];
    ctx.fillStyle = color;

    // Render all mountains in this layer
    layerMountains.forEach((mountain) => renderMountain(ctx, mountain));
  });
}

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
function renderTrees(ctx: CanvasRenderingContext2D, trees: Tree[]): void {
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
    const color = Object.values(SILHOUETTE_COLORS.TREES)[Number(layer)];
    ctx.fillStyle = color;

    // Render all trees in this layer
    layerTrees.forEach((tree) => renderTree(ctx, tree));
  });
}

/**
 * Main landscape rendering function
 */
export function renderLandscape(ctx: CanvasRenderingContext2D, render: RenderState): void {
  const { mountains, trees, stars } = render.landscape;

  // Save the current context state
  ctx.save();

  // Enable crisp pixel art rendering
  ctx.imageSmoothingEnabled = false;

  // Render sky gradient
  renderSky(ctx, ctx.canvas.height);

  // Render stars
  renderStars(ctx, stars);

  // Render mountains (back to front)
  renderMountains(ctx, mountains);

  // Render trees (back to front)
  renderTrees(ctx, trees);

  // Restore the context state
  ctx.restore();
}
