import { GameWorldState } from '../../game-world/game-world-types';
import { MountainState } from './mountain/mountain-types';
import { createMountainState, updateMountainState } from './mountain/mountain-state';
import { createTreeState, updateTreeState } from './tree/tree-state';
import { createStarState, updateStarState } from './star/star-state';
import { TreeState } from './tree/tree-types';
import { StarState } from './star/star-types';

// Combined landscape state type
export type LandscapeState = {
  mountains: MountainState;
  trees: TreeState;
  stars: StarState;
};

/**
 * Create initial landscape state
 * Combines all component states into a single landscape state
 */
export function createLandscapeState(): LandscapeState {
  return {
    mountains: createMountainState(),
    trees: createTreeState(),
    stars: createStarState(),
  };
}

/**
 * Update landscape state
 * Updates all component states and combines them into updated landscape state
 */
export function updateLandscapeState(world: GameWorldState, state: LandscapeState, deltaTime: number): LandscapeState {
  return {
    mountains: updateMountainState(world, state.mountains),
    trees: updateTreeState(world, state.trees),
    stars: updateStarState(world, state.stars, deltaTime),
  };
}
