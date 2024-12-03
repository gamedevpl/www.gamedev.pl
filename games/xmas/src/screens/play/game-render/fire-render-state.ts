import { GameWorldState } from '../game-world/game-world-types';
import { FireQuadTree } from './fire-render-quad-tree';
import {
  FireCell,
  GRID_WIDTH,
  GRID_HEIGHT,
  EXTINGUISH_RATE,
  BASE_SPREAD_RATE,
  MAX_TEMPERATURE,
  EXTINGUISH_THRESHOLD,
  COOL_CELL_HORIZONTAL_PROBABILITY,
  HOT_CELL_DOWNWARD_PROBABILITY,
  HOT_CELL_SPREAD_PROBABILITY,
  HOT_CELL_THRESHOLD,
  VERTICAL_SPREAD_MULTIPLIER,
} from './fire-render-types';
import { computeHeatMap } from './fire-render-heatmap';

// The complete fire render state
export type FireRenderState = {
  grid: FireCell[][];
  quadTree: FireQuadTree;
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

  return { grid, quadTree: new FireQuadTree() };
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

  computeHeatMap(world, newGrid, state.quadTree);

  // Update each cell in the grid
  for (const [regionX, regionY, regionWidth, regionHeight] of state.quadTree.getHotRegions()) {
    for (let y = regionY; y < regionHeight; y++) {
      for (let x = regionX; x < regionWidth; x++) {
        if (state.quadTree.isCold(x, y)) {
          continue;
        }

        const currentTemp = state.grid[y][x].temperature + newGrid[y][x].temperature;

        // Calculate new temperature from various sources
        const neighborHeat = calculateNeighborHeat(state.grid, x, y);

        // Temperature changes:
        // 1. Natural decay over time
        // 2. Heat from fireballs and charging Santas (immediate effect)
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

        state.quadTree.update(x, y, newGrid[y][x].temperature);
      }
    }
  }

  state.quadTree.swapBuffers();

  return {
    grid: newGrid,
    quadTree: state.quadTree,
  };
}
/**
 * Calculate heat transfer from neighboring cells with temperature-dependent behavior.
 * Implements directional heat transfer with different probabilities based on cell temperature.
 *
 * @param grid - Current fire grid state
 * @param x - X coordinate in grid space
 * @param y - Y coordinate in grid space
 * @returns Calculated heat value from neighbors
 */

export function calculateNeighborHeat(grid: FireCell[][], x: number, y: number): number {
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
