import { GAME_WORLD_HEIGHT, GAME_WORLD_WIDTH } from '../../../game-world/game-world-consts';

// Mountain silhouette colors from back to front
export const MOUNTAIN_COLORS = {
  DISTANT: '#000066', // Most distant mountains
  MIDDLE: '#000044',  // Middle layer mountains
  NEAR: '#000022',    // Nearest mountains
} as const;

// Mountain configuration
export const MOUNTAINS = {
  LAYERS: 3, // Number of mountain layers for depth
  MAX_HEIGHT: GAME_WORLD_HEIGHT * 0.4, // Maximum mountain height
  MIN_HEIGHT: GAME_WORLD_HEIGHT * 0.2, // Minimum mountain height
  JAGGEDNESS: 0.3, // How jagged the mountain peaks are
  PEAKS: {
    // Peaks per layer (more peaks in distant layers for depth perception)
    DISTANT: Math.floor(GAME_WORLD_WIDTH / 400), // Fewest peaks, most distant
    MIDDLE: Math.floor(GAME_WORLD_WIDTH / 300),  // Medium number of peaks
    NEAR: Math.floor(GAME_WORLD_WIDTH / 200),    // Most peaks, nearest layer
  },
  PARALLAX: {
    // Parallax factors for each layer (0 = no movement, 1 = full movement)
    DISTANT: 0.2,  // Slowest movement, most distant
    MIDDLE: 0.4,   // Medium movement
    NEAR: 0.6,     // Fastest movement, nearest layer
    VARIATION: 0.05, // Random variation in parallax factor
  },
  // Height multipliers for each layer
  HEIGHT_MULTIPLIER: {
    DISTANT: 1.0,  // Full height for distant mountains
    MIDDLE: 0.85,  // Slightly shorter middle mountains
    NEAR: 0.7,     // Shortest nearest mountains
  },
} as const;

// Mountain type definition
export type Mountain = {
  x: number;           // Base x position
  width: number;       // Width of the mountain
  height: number;      // Height of the mountain
  layer: number;       // Which layer (0 = distant, 1 = middle, 2 = near)
  parallaxFactor: number; // Factor affecting parallax movement
  points: Array<{      // Points defining the mountain shape
    x: number;
    y: number;
  }>;
};

// Mountain state type
export type MountainState = {
  mountains: Mountain[];
};