import { GAME_WORLD_HEIGHT, GAME_WORLD_WIDTH } from '../../../game-world/game-world-consts';

// Tree silhouette color
export const TREE_COLOR = '#000022'; // Dark blue color for tree silhouettes

// Tree configuration
export const TREES = {
  // Tree dimensions
  MAX_HEIGHT: GAME_WORLD_HEIGHT * 0.15, // Maximum tree height (15% of world height)
  MIN_HEIGHT: GAME_WORLD_HEIGHT * 0.1,  // Minimum tree height (10% of world height)
  WIDTH_RATIO: 0.6,                     // Tree width as ratio of height

  // Tree distribution
  DENSITY: Math.floor(GAME_WORLD_WIDTH / 75), // Number of trees across the world
  SPACING_VARIATION: 0.3,                     // Random variation in tree spacing (30%)
} as const;

// Tree type definition
export type Tree = {
  x: number;      // Base x position
  height: number; // Height of the tree
  width: number;  // Width of the tree
};

// Tree state type
export type TreeState = {
  trees: Tree[];
};