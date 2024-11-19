import { GameWorldState } from '../game-world/game-world-types';
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

// Represents a single cell in the fire grid
export type FireCell = {
  temperature: number;
};

// The complete fire render state
export type FireRenderState = {
  grid: FireCell[][];
};

/**
 * Creates a new fire render state with an empty grid
 */
export function createFireRenderState(): FireRenderState {
  const grid: FireCell[][] = Array(GRID_HEIGHT)
    .fill(null)
    .map(() =>
      Array(GRID_WIDTH)
        .fill(null)
        .map(() => ({ temperature: 0 })),
    );

  return { grid };
}

/**
 * Calculate the temperature at a specific grid position based on nearby fireballs
 * Implements nucleus concept where inner half of radius maintains max temperature
 */
function calculateFireballHeat(x: number, y: number, fireballs: GameWorldState['fireballs']): number {
  const worldX = x * GRID_CELL_SIZE + GRID_CELL_SIZE / 2;
  const worldY = y * GRID_CELL_SIZE + GRID_CELL_SIZE / 2;

  let maxTemp = 0;

  for (const fireball of fireballs) {
    const distance = Math.sqrt(Math.pow(worldX - fireball.x, 2) + Math.pow(worldY - fireball.y, 2));
    const nucleusRadius = fireball.radius * 0.3; // Nucleus is half the fireball radius

    if (distance <= nucleusRadius) {
      // Inside nucleus - maximum temperature
      maxTemp = Math.max(maxTemp, MAX_TEMPERATURE);
    } else if (distance < fireball.radius * 0.5) {
      // Outside nucleus but inside fireball - linear falloff
      const normalizedDistance = (distance - nucleusRadius) / (fireball.radius - nucleusRadius);
      const temp = MAX_TEMPERATURE * (1 - normalizedDistance);
      maxTemp = Math.max(maxTemp, temp);
    }
  }

  return maxTemp;
}

/**
 * Calculate heat transfer from neighboring cells with temperature-dependent behavior
 */
function calculateNeighborHeat(grid: FireCell[][], x: number, y: number): number {
  let totalTemp = 0;
  let totalWeight = 0;

  const currentTemp = grid[y][x].temperature;
  const isHotCell = currentTemp >= HOT_CELL_THRESHOLD;

  // Define direction weights based on temperature
  const directions = [
    { dx: 0, dy: -1, weight: VERTICAL_SPREAD_MULTIPLIER }, // Up
    { dx: -1, dy: 0, weight: 1 }, // Left
    { dx: 1, dy: 0, weight: 1 }, // Right
    { dx: 0, dy: 1, weight: 0.5 }, // Down
  ];

  for (const { dx, dy, weight } of directions) {
    const nx = x + dx;
    const ny = y + dy;

    // Skip if outside grid bounds
    if (nx < 0 || nx >= GRID_WIDTH || ny < 0 || ny >= GRID_HEIGHT) continue;

    // Determine if we should transfer heat in this direction
    let shouldTransfer = false;
    if (isHotCell) {
      // Hot cells have high probability of spreading in all directions
      shouldTransfer = Math.random() < HOT_CELL_SPREAD_PROBABILITY;
    } else {
      // Cool cells primarily spread upward, with low probability horizontally
      if (dy === 1 || Math.random() < HOT_CELL_DOWNWARD_PROBABILITY) {
        // Always allow upward spread for cool cells
        shouldTransfer = true;
      } else if (dy === 0) {
        // Horizontal spread with low probability for cool cells
        shouldTransfer = Math.random() < COOL_CELL_HORIZONTAL_PROBABILITY;
      }
    }

    if (shouldTransfer) {
      const neighborTemp = grid[ny][nx].temperature;
      if (neighborTemp > currentTemp) {
        totalTemp += neighborTemp * weight;
        totalWeight += weight;
      }
    }
  }

  return totalWeight > 0 ? totalTemp / totalWeight : 0;
}

/**
 * Precompute heat distribution from fireballs for the entire grid
 */
function computeFireballHeatMap(fireballs: GameWorldState['fireballs'], grid: FireCell[][]) {
  for (let y = 0; y < GRID_HEIGHT; y++) {
    for (let x = 0; x < GRID_WIDTH; x++) {
      grid[y][x].temperature = calculateFireballHeat(x, y, fireballs);
    }
  }
}

/**
 * Update the fire render state for a single frame, handling large delta times
 * by breaking them into smaller steps
 */
export function updateFireRenderState(
  world: GameWorldState,
  state: FireRenderState,
  deltaTime: number,
): FireRenderState {
  // Create a new grid to store updated temperatures
  const newGrid: FireCell[][] = Array(GRID_HEIGHT)
    .fill(null)
    .map(() =>
      Array(GRID_WIDTH)
        .fill(null)
        .map(() => ({ temperature: 0 })),
    );

  computeFireballHeatMap(world.fireballs, newGrid);

  // Update each cell in the grid
  for (let y = 0; y < GRID_HEIGHT; y++) {
    for (let x = 0; x < GRID_WIDTH; x++) {
      const currentTemp = state.grid[y][x].temperature + newGrid[y][x].temperature;

      // Calculate new temperature from various sources
      const neighborHeat = calculateNeighborHeat(state.grid, x, y);

      // Temperature changes:
      // 1. Natural decay over time
      // 2. Heat from fireballs (immediate effect)
      // 3. Heat spreading from neighbors with directional bias
      let newTemp = currentTemp;

      // Apply decay
      newTemp = Math.max(0, newTemp - EXTINGUISH_RATE * deltaTime);

      // Apply neighbor heat spreading
      const spreadRate = BASE_SPREAD_RATE * (1 + (Math.random() * 0.2 - 0.1));
      newTemp += (neighborHeat - newTemp) * spreadRate * deltaTime;

      // Ensure temperature stays within bounds
      newTemp = Math.min(MAX_TEMPERATURE, Math.max(0, newTemp));

      // Only update if above extinction threshold
      newGrid[y][x].temperature = newTemp > EXTINGUISH_THRESHOLD ? newTemp : 0;
    }
  }

  return {
    grid: newGrid,
  };
}
