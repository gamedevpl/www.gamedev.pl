import { EDGE_RADIUS } from '../../consts';

export type TerrainData = { width: number; height: number; tileSize: number; heightMap: number[][] };

// Helper function to get the number of active neighbors for a cell
function getActiveNeighbors(grid: number[][], x: number, y: number): number {
  let count = 0;
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      if (i === 0 && j === 0) continue;
      const newX = x + i;
      const newY = y + j;
      if (newX >= 0 && newX < grid[0].length && newY >= 0 && newY < grid.length) {
        count += grid[newY][newX] > 0 ? 1 : 0;
      }
    }
  }
  return count;
}

// Helper function to apply cellular automata rules
function applyCellularAutomata(grid: number[][], iterations: number): number[][] {
  const newGrid = grid.map((row) => [...row]);
  for (let iter = 0; iter < iterations; iter++) {
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[0].length; x++) {
        const neighbors = getActiveNeighbors(grid, x, y);
        if (grid[y][x] > 0) {
          newGrid[y][x] = neighbors < 2 || neighbors > 4 ? 0 : 1;
        } else {
          newGrid[y][x] = neighbors === 3 ? 1 : 0;
        }
      }
    }
  }
  return newGrid;
}

// Helper function to smooth the terrain
function smoothTerrain(grid: number[][], smoothingFactor: number): number[][] {
  const smoothed = grid.map((row) => [...row]);
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[0].length; x++) {
      let sum = 0;
      let count = 0;
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          const newX = x + i;
          const newY = y + j;
          if (newX >= 0 && newX < grid[0].length && newY >= 0 && newY < grid.length) {
            sum += grid[newY][newX];
            count++;
          }
        }
      }
      smoothed[y][x] = grid[y][x] * (1 - smoothingFactor) + (sum / count) * smoothingFactor;
    }
  }
  return smoothed;
}

// Function to generate terrain using a sinusoidal base and cellular automata
function generateTerrainHeightMap(width: number, height: number, tileSize: number): number[][] {
  const gridWidth = Math.ceil(width / tileSize);
  const gridHeight = Math.ceil(height / tileSize);
  const heightMap: number[][] = Array.from({ length: gridHeight + 1 }, () => Array(gridWidth + 1).fill(0));
  const centerX = gridWidth / 2;
  const centerY = gridHeight / 2;
  const radius = Math.min(centerX, centerY);

  // Create a sinusoidal base
  for (let y = 0; y <= gridHeight; y++) {
    for (let x = 0; x <= gridWidth; x++) {
      const dx = Math.abs(x - centerX);
      const dy = Math.abs(y - centerY);
      heightMap[y][x] =
        ((Math.pow(Math.sqrt(dx * dx + dy * dy) / radius, 0.25) + Math.sin((y / gridHeight) * Math.PI) / 2) *
          tileSize) /
        2;
    }
  }

  // Normalize the height map to 0-1 range
  const maxHeight = Math.max(...heightMap.flat());
  const minHeight = Math.min(...heightMap.flat());
  const normalizedMap = heightMap.map((row) => row.map((h) => (h - minHeight) / (maxHeight - minHeight)));

  // Apply cellular automata
  const cellularMap = applyCellularAutomata(normalizedMap, 5);

  // Combine sinusoidal base with cellular automata
  for (let y = 0; y <= gridHeight; y++) {
    for (let x = 0; x <= gridWidth; x++) {
      heightMap[y][x] += cellularMap[y][x] * tileSize * 0.5; // Adjust the multiplier to control the impact of cellular automata
    }
  }

  // Apply smoothing
  const smoothedMap = smoothTerrain(heightMap, 0.5);

  return smoothedMap;
}

// Main function to generate terrain heightmap
export function generateTerrain(tileSize: number): TerrainData {
  const width = EDGE_RADIUS * 3;
  const height = EDGE_RADIUS * 2;
  const heightMap = generateTerrainHeightMap(width, height, tileSize);

  return { width, height, tileSize, heightMap };
}
