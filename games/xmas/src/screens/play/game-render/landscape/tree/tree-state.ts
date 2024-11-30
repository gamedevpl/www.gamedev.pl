import { GAME_WORLD_WIDTH } from '../../../game-world/game-world-consts';
import { GameWorldState } from '../../../game-world/game-world-types';
import { Tree, TREES, TreeState } from './tree-types';

/**
 * Generate trees for a specific layer
 */
function generateTrees(layer: number): Tree[] {
  const trees: Tree[] = [];
  const count = Object.values(TREES.DENSITY)[layer];

  for (let i = 0; i < count; i++) {
    const height = TREES.MIN_HEIGHT + Math.random() * (TREES.MAX_HEIGHT - TREES.MIN_HEIGHT);
    const width = height * TREES.WIDTH_RATIO;
    const x = (i * GAME_WORLD_WIDTH) / count + ((Math.random() - 0.5) * GAME_WORLD_WIDTH) / count;

    trees.push({
      x,
      height,
      width,
      layer,
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
