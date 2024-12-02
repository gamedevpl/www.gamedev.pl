import { GAME_WORLD_WIDTH } from '../../../game-world/game-world-consts';
import { GameWorldState } from '../../../game-world/game-world-types';
import { Tree, TREES, TreeState } from './tree-types';

/**
 * Generate trees with uniform distribution and size variation
 */
function generateTrees(): Tree[] {
  const trees: Tree[] = [];
  const baseSpacing = GAME_WORLD_WIDTH / TREES.DENSITY;

  for (let i = 0; i < TREES.DENSITY; i++) {
    // Calculate tree height with random variation
    const height = TREES.MIN_HEIGHT + Math.random() * (TREES.MAX_HEIGHT - TREES.MIN_HEIGHT);
    const width = height * TREES.WIDTH_RATIO;

    // Calculate position with spacing variation
    const baseX = (i * GAME_WORLD_WIDTH) / TREES.DENSITY;
    const spacingVariation = baseSpacing * TREES.SPACING_VARIATION;
    const x = baseX + (Math.random() - 0.5) * spacingVariation;

    trees.push({
      x,
      height,
      width,
    });
  }

  return trees;
}

/**
 * Create initial tree state
 */
export function createTreeState(): TreeState {
  return {
    trees: generateTrees(),
  };
}

/**
 * Update tree state
 * Trees are static, but this function is included for consistency
 * and potential future animations
 */
export function updateTreeState(_world: GameWorldState, state: TreeState): TreeState {
  return state;
}