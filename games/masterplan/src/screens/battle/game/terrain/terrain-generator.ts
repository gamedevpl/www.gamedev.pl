import { EDGE_RADIUS } from '../../consts';

// Function to generate terrain using a simple heightmap based on a sinusoidal pattern
export function generateTerrainHeightMap(
  width: number,
  height: number,
  tileSize: number
): number[][] {
  const gridWidth = Math.ceil(width / tileSize);
  const gridHeight = Math.ceil(height / tileSize);
  const heightMap: number[][] = Array.from({ length: gridHeight + 1 }, () => Array(gridWidth + 1).fill(0));

  // Create a simple sinusoidal heightmap
  for (let y = 0; y <= gridHeight; y++) {
    for (let x = 0; x <= gridWidth; x++) {
      heightMap[y][x] =
        (Math.sin((x / gridWidth) * 2 * Math.PI * 2) * 0.25 + Math.cos((y / gridHeight) * Math.PI * 2) * 0.25) *
        tileSize;
    }
  }

  return heightMap;
}

// Main function to generate terrain heightmap
export function generateTerrain(tileSize: number): { width: number; height: number; heightMap: number[][] } {
  const width = EDGE_RADIUS * 3;
  const height = EDGE_RADIUS * 2;
  const heightMap = generateTerrainHeightMap(width, height, tileSize);

  return { width, height, heightMap };
}