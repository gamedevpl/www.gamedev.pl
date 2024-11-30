import { GAME_WORLD_HEIGHT, GAME_WORLD_WIDTH } from '../../../game-world/game-world-consts';

// Tree silhouette colors
export const TREE_COLORS = {
  BACK: '#000044', // Background trees
  FRONT: '#000022', // Foreground trees
} as const;

// Tree configuration
export const TREES = {
  LAYERS: 2, // Number of tree layers for depth
  MAX_HEIGHT: GAME_WORLD_HEIGHT * 0.15, // Maximum tree height
  MIN_HEIGHT: GAME_WORLD_HEIGHT * 0.1, // Minimum tree height
  DENSITY: {
    // Trees per layer
    BACK: Math.floor(GAME_WORLD_WIDTH / 100), // Fewer trees in back
    FRONT: Math.floor(GAME_WORLD_WIDTH / 50), // More trees in front
  },
  WIDTH_RATIO: 0.6, // Tree width as ratio of height
} as const;

// Tree type definition
export type Tree = {
  x: number; // Base x position
  height: number; // Height of the tree
  width: number; // Width of the tree
  layer: number; // Which layer (0 = back, 1 = front)
};

// Tree state type
export type TreeState = {
  trees: Tree[];
};
