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
} from './fire-render-types';
import {
  calculateNeighborHeat,
  computeHeatMap,
} from './fire-render-heatmap';

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