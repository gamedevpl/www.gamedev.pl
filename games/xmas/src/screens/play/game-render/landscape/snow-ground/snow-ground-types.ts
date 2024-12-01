import { GAME_WORLD_WIDTH } from '../../../game-world/game-world-consts';

/**
 * Snow ground piece interface
 * Represents a single piece of snow ground with position, width, and layer information
 */
export interface SnowGround {
  x: number; // X position of the snow ground piece
  width: number; // Width of the snow ground piece
  layer: number; // Layer number (0: distant, 1: middle, 2: near)
  parallaxFactor: number; // Factor for parallax movement
}

/**
 * Snow ground state interface
 * Contains all snow ground pieces
 */
export interface SnowGroundState {
  grounds: SnowGround[];
}

/**
 * Snow ground constants
 */
export const SNOW_GROUND = {
  // Number of layers for depth perception
  LAYERS: 3,

  // Width configuration
  MIN_WIDTH: GAME_WORLD_WIDTH / 8,
  MAX_WIDTH: GAME_WORLD_WIDTH / 4,

  // Spacing between snow ground pieces
  SPACING_VARIATION: 0.2, // 20% variation in spacing

  // Density (number of pieces) per layer
  DENSITY: {
    DISTANT: 8, // Fewer pieces in the distance
    MIDDLE: 10, // Medium density in the middle
    NEAR: 12, // More pieces in the foreground
  },

  // Parallax movement factors
  PARALLAX: {
    DISTANT: 0.2, // Slowest movement in the background
    MIDDLE: 0.5, // Medium movement in the middle
    NEAR: 0.8, // Fastest movement in the foreground
    VARIATION: 0.05, // Small random variation in parallax
  },

  // Colors for each layer
  COLORS: {
    DISTANT: '#a3b5c7', // Light grayish blue for distant snow
    MIDDLE: '#cad5e0', // Lighter grayish blue for middle ground
    NEAR: '#ffffff', // Pure white for nearest snow
  },
} as const;
