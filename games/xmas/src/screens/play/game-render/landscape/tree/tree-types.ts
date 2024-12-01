import { GAME_WORLD_HEIGHT, GAME_WORLD_WIDTH } from '../../../game-world/game-world-consts';

// Tree silhouette colors from back to front
export const TREE_COLORS = {
  DISTANT: '#000033', // Most distant trees
  MIDDLE: '#000022',  // Middle layer trees
  NEAR: '#000011',    // Nearest trees
} as const;

// Tree configuration
export const TREES = {
  LAYERS: 3, // Number of tree layers for depth
  MAX_HEIGHT: GAME_WORLD_HEIGHT * 0.15, // Maximum tree height
  MIN_HEIGHT: GAME_WORLD_HEIGHT * 0.1,  // Minimum tree height
  WIDTH_RATIO: 0.6, // Tree width as ratio of height
  DENSITY: {
    // Trees per layer (more trees in closer layers)
    DISTANT: Math.floor(GAME_WORLD_WIDTH / 150), // Fewest trees, most distant
    MIDDLE: Math.floor(GAME_WORLD_WIDTH / 100),  // Medium number of trees
    NEAR: Math.floor(GAME_WORLD_WIDTH / 50),     // Most trees, nearest layer
  },
  PARALLAX: {
    // Parallax factors for each layer (0 = no movement, 1 = full movement)
    DISTANT: 0.65, // Continuing from mountain parallax (mountains end at 0.6)
    MIDDLE: 0.8,   // Medium movement
    NEAR: 0.95,    // Fastest movement, nearest layer
    VARIATION: 0.05, // Random variation in parallax factor
  },
  // Size multipliers for each layer to enhance depth perception
  SIZE_MULTIPLIER: {
    DISTANT: 0.7,  // Smallest trees in distance
    MIDDLE: 0.85,  // Medium sized trees
    NEAR: 1.0,     // Full size trees in front
  },
  // Spacing variation to avoid uniform appearance
  SPACING_VARIATION: 0.3, // How much random variation in tree spacing
} as const;

// Tree type definition
export type Tree = {
  x: number;           // Base x position
  height: number;      // Height of the tree
  width: number;       // Width of the tree
  layer: number;       // Which layer (0 = distant, 1 = middle, 2 = near)
  parallaxFactor: number; // Factor affecting parallax movement
};

// Tree state type
export type TreeState = {
  trees: Tree[];
};