import { EDGE_RADIUS } from '../../consts';
import { Vec } from '../../util/vmath';
import { TerrainData } from './terrain-generator';

export class Terrain {
  tileSize = 32;
  offsetX = (EDGE_RADIUS * 1.5) / this.tileSize;
  offsetY = EDGE_RADIUS / this.tileSize;
  heightMap: number[][];
  width: number;
  height: number;

  constructor(terrainData: TerrainData) {
    this.width = terrainData.width;
    this.height = terrainData.height;
    this.heightMap = terrainData.heightMap;
  }

  getHeightAt(pos: Vec): number {
    return interpolateGridValue(pos, this.heightMap, this.tileSize, this.offsetX, this.offsetY);
  }
}

export function interpolateGridValue(
  pos: Vec,
  grid: number[][],
  tileSize: number,
  offsetX: number,
  offsetY: number,
): number {
  // Calculate tile indices and positions within the tile
  const x = pos[0] / tileSize + offsetX;
  const y = pos[1] / tileSize + offsetY;

  const x0 = Math.min(Math.max(Math.floor(x), 0), grid[0].length - 1);
  const x1 = Math.min(x0 + 1, grid[0].length - 1);
  const y0 = Math.min(Math.max(Math.floor(y), 0), grid.length - 1);
  const y1 = Math.max(Math.min(y0 + 1, grid.length - 1), 0);

  const h00 = grid[y0][x0];
  const h10 = grid[y0][x1];
  const h01 = grid[y1][x0];
  const h11 = grid[y1][x1];

  const dx = x - x0;
  const dy = y - y0;

  const h0 = h00 * (1 - dx) + h10 * dx;
  const h1 = h01 * (1 - dx) + h11 * dx;

  return h0 * (1 - dy) + h1 * dy;
}
