import { SECTOR_SIZE } from '../world-state-constants';
import { Sector, SectorType } from '../world-state-types';

export function initializeSectors(worldWidth: number, worldHeight: number): Sector[] {
  const sectors: Sector[] = [];

  for (let y = 0; y < worldHeight; y++) {
    for (let x = 0; x < worldWidth; x++) {
      sectors.push({
        id: `${x * SECTOR_SIZE},${y * SECTOR_SIZE}`,
        position: { x: x * SECTOR_SIZE, y: y * SECTOR_SIZE },
        rect: {
          left: x * SECTOR_SIZE,
          top: y * SECTOR_SIZE,
          right: (x + 1) * SECTOR_SIZE,
          bottom: (y + 1) * SECTOR_SIZE,
        },
        type: SectorType.WATER,
        depth: 0, // Initialize depth to 0
        height: 0, // Initialize height to 0 for water sectors
        population: 0, // Initialize population to 0
      });
    }
  }

  return sectors;
}

export function calculateWaterDepthAndGroundHeight(sectors: Sector[], worldWidth: number, worldHeight: number) {
  const queue: [number, number, number][] = [];
  const visited: boolean[][] = Array(worldHeight)
    .fill(null)
    .map(() => Array(worldWidth).fill(false));

  // Find all water sectors adjacent to ground and add them to the queue
  for (let y = 0; y < worldHeight; y++) {
    for (let x = 0; x < worldWidth; x++) {
      const index = y * worldWidth + x;
      if (sectors[index].type === SectorType.WATER) {
        const adjacentToGround = isAdjacentToGround(x, y, worldWidth, worldHeight, sectors);
        if (adjacentToGround) {
          queue.push([x, y, 0]);
          visited[y][x] = true;
        }
      }
    }
  }

  // BFS to calculate depth and height
  while (queue.length > 0) {
    const [x, y, distance] = queue.shift()!;
    const index = y * worldWidth + x;

    if (sectors[index].type === SectorType.WATER) {
      sectors[index].depth = distance + (Math.random() - Math.random()) / 5;
    } else if (sectors[index].type === SectorType.GROUND) {
      sectors[index].height = Math.sqrt(distance) + (Math.random() - Math.random()) / 10;
    }

    const directions = [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ];
    for (const [dx, dy] of directions) {
      const newX = x + dx;
      const newY = y + dy;
      if (isValidCoordinate(newX, newY, worldWidth, worldHeight) && !visited[newY][newX]) {
        queue.push([newX, newY, distance + 1]);
        visited[newY][newX] = true;
      }
    }
  }
}

function isAdjacentToGround(x: number, y: number, worldWidth: number, worldHeight: number, sectors: Sector[]): boolean {
  const directions = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  return directions.some(([dx, dy]) => {
    const nx = x + dx;
    const ny = y + dy;
    if (isValidCoordinate(nx, ny, worldWidth, worldHeight)) {
      const neighborIndex = ny * worldWidth + nx;
      return sectors[neighborIndex].type === SectorType.GROUND;
    }
    return false;
  });
}

function isValidCoordinate(x: number, y: number, worldWidth: number, worldHeight: number): boolean {
  return x >= 0 && x < worldWidth && y >= 0 && y < worldHeight;
}
