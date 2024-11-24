import { GAME_WORLD_HEIGHT, GAME_WORLD_WIDTH } from '../game-world/game-world-consts';

// Night sky colors for gradient
export const SKY_COLORS = {
  TOP: '#000033', // Deep night blue
  MIDDLE: '#000066', // Lighter night blue
  BOTTOM: '#000099', // Horizon blue
} as const;

// Silhouette colors
export const SILHOUETTE_COLORS = {
  MOUNTAINS: {
    BACK: '#000066', // Distant mountains
    MIDDLE: '#000044', // Mid-distance mountains
    FRONT: '#000022', // Foreground mountains
  },
  TREES: {
    BACK: '#000044', // Background trees
    FRONT: '#000022', // Foreground trees
  },
} as const;

// Mountain configuration
export const MOUNTAINS = {
  LAYERS: 3, // Number of mountain layers for depth
  MAX_HEIGHT: GAME_WORLD_HEIGHT * 0.4, // Maximum mountain height
  MIN_HEIGHT: GAME_WORLD_HEIGHT * 0.2, // Minimum mountain height
  PEAKS: {
    BACK: 3, // Number of peaks in back layer
    MIDDLE: 4, // Number of peaks in middle layer
    FRONT: 5, // Number of peaks in front layer
  },
  JAGGEDNESS: 0.3, // How jagged the mountains appear (0-1)
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

// Star configuration
export const STARS = {
  COUNT: 100, // Number of stars
  MIN_SIZE: 1, // Minimum star size in pixels
  MAX_SIZE: 2, // Maximum star size in pixels
  TWINKLE_SPEED: 0.0001, // How fast stars twinkle
} as const;

// Types for landscape elements
export type Mountain = {
  x: number; // Base x position
  height: number; // Height of the mountain
  width: number; // Width of the mountain
  layer: number; // Which layer (0 = back, 2 = front)
  points: Array<{ x: number; y: number }>; // Points defining the mountain shape
};

export type Tree = {
  x: number; // Base x position
  height: number; // Height of the tree
  width: number; // Width of the tree
  layer: number; // Which layer (0 = back, 1 = front)
};

export type Star = {
  x: number; // x position
  y: number; // y position
  size: number; // Size of the star
  twinkle: number; // Current twinkle phase (0-1)
};
