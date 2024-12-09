import { GAME_WORLD_HEIGHT, GAME_WORLD_WIDTH } from '../game-world/game-world-consts';

// Cell size in pixels
export const GRID_CELL_SIZE = 8;

// Grid dimensions
export const GRID_WIDTH = Math.ceil(GAME_WORLD_WIDTH / GRID_CELL_SIZE);
export const GRID_HEIGHT = Math.ceil(GAME_WORLD_HEIGHT / GRID_CELL_SIZE);

// Temperature thresholds and constants
export const MAX_TEMPERATURE = 1;
export const EXTINGUISH_THRESHOLD = 0.009;
export const HOT_CELL_THRESHOLD = 0.6; // Above this temperature, cells behave as "hot"

// Rate constants
export const EXTINGUISH_RATE = 0.0001;
export const BASE_SPREAD_RATE = 0.01;
export const VERTICAL_SPREAD_MULTIPLIER = 1.0;

// Directional transfer probabilities
export const HOT_CELL_SPREAD_PROBABILITY = 0.6; // Probability of hot cells spreading in any direction
export const HOT_CELL_DOWNWARD_PROBABILITY = 0.5; // Probability of hot cells spreading downward
export const COOL_CELL_HORIZONTAL_PROBABILITY = 0.3; // Probability of cool cells spreading horizontally

// Santa energy heat spot constants
export const SANTA_ENERGY_HEAT_SPOTS_MAX = 1; // Maximum number of heat spots per frame
export const SANTA_ENERGY_HEAT_SPOT_PROBABILITY = 0.003; // Base probability of generating a heat spot
export const SANTA_ENERGY_HEAT_SPOT_TEMPERATURE = 1; // Temperature of generated heat spots (0-1)
export const SANTA_ENERGY_HEAT_SPOT_RANGE = 50; // Maximum range around santa in pixels

// Represents a single cell in the fire grid
export type FireCell = {
  temperature: number;
};
