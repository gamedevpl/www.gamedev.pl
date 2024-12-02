import { GAME_WORLD_WIDTH } from '../../../game-world/game-world-consts';

/**
 * Snow ground piece interface
 * Represents a single piece of snow ground with position and width
 */
export interface SnowGround {
  x: number;     // X position of the snow ground piece
  width: number; // Width of the snow ground piece
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
  // Width configuration
  MIN_WIDTH: GAME_WORLD_WIDTH / 8,  // Minimum width of a snow ground piece
  MAX_WIDTH: GAME_WORLD_WIDTH / 4,  // Maximum width of a snow ground piece

  // Distribution configuration
  DENSITY: Math.floor(GAME_WORLD_WIDTH / 100), // Number of snow ground pieces
  SPACING_VARIATION: 0.2,                      // 20% variation in spacing

  // Visual configuration
  COLOR: '#ffffff',                // Pure white for snow
  HEIGHT_RATIO: 0.025,            // Height as ratio of world height (2.5%)
} as const;