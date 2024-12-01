import { GAME_WORLD_WIDTH } from '../../../game-world/game-world-consts';
import { GameWorldState } from '../../../game-world/game-world-types';
import { Tree, TREES, TreeState } from './tree-types';

/**
 * Get parallax factor for a specific layer with slight randomization
 */
function getParallaxFactor(layer: number): number {
  // Get base parallax factor for the layer
  const baseParallax = layer === 0 
    ? TREES.PARALLAX.DISTANT 
    : layer === 1 
      ? TREES.PARALLAX.MIDDLE 
      : TREES.PARALLAX.NEAR;

  // Add random variation within the specified range
  const variation = (Math.random() * 2 - 1) * TREES.PARALLAX.VARIATION;
  return Math.max(0, Math.min(1, baseParallax + variation));
}

/**
 * Get number of trees for a specific layer
 */
function getTreeDensityForLayer(layer: number): number {
  return layer === 0 
    ? TREES.DENSITY.DISTANT 
    : layer === 1 
      ? TREES.DENSITY.MIDDLE 
      : TREES.DENSITY.NEAR;
}

/**
 * Get size multiplier for a specific layer
 */
function getSizeMultiplier(layer: number): number {
  return layer === 0 
    ? TREES.SIZE_MULTIPLIER.DISTANT 
    : layer === 1 
      ? TREES.SIZE_MULTIPLIER.MIDDLE 
      : TREES.SIZE_MULTIPLIER.NEAR;
}

/**
 * Generate trees for a specific layer
 */
function generateTrees(layer: number): Tree[] {
  const trees: Tree[] = [];
  const count = getTreeDensityForLayer(layer);
  const sizeMultiplier = getSizeMultiplier(layer);
  const baseSpacing = GAME_WORLD_WIDTH / count;

  for (let i = 0; i < count; i++) {
    // Calculate base dimensions with size multiplier
    const baseHeight = TREES.MIN_HEIGHT + 
      Math.random() * (TREES.MAX_HEIGHT - TREES.MIN_HEIGHT);
    const height = baseHeight * sizeMultiplier;
    const width = height * TREES.WIDTH_RATIO;

    // Calculate position with spacing variation
    const baseX = (i * GAME_WORLD_WIDTH) / count;
    const spacingVariation = baseSpacing * TREES.SPACING_VARIATION;
    const x = baseX + (Math.random() - 0.5) * spacingVariation;

    trees.push({
      x,
      height,
      width,
      layer,
      parallaxFactor: getParallaxFactor(layer),
    });
  }

  return trees;
}

/**
 * Create initial tree state
 */
export function createTreeState(): TreeState {
  const trees: Tree[] = [];

  // Generate trees for each layer
  for (let layer = 0; layer < TREES.LAYERS; layer++) {
    trees.push(...generateTrees(layer));
  }

  return { trees };
}

/**
 * Update tree state
 * Currently trees are static, but this function is included for consistency
 * and potential future animations
 */
export function updateTreeState(_world: GameWorldState, state: TreeState): TreeState {
  return state;
}