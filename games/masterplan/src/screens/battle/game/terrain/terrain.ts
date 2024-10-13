import { EDGE_RADIUS } from '../../consts';
import { Canvas } from '../../util/canvas';
import { Vec } from '../../util/vmath';
import { generateTerrain } from './terrain-generator';
import { createTerrainTexture } from './terrain-renderer';

export class Terrain {
  tileSize = 32;
  offsetX = (EDGE_RADIUS * 1.5) / this.tileSize;
  offsetY = EDGE_RADIUS / this.tileSize;
  terrainCanvas: HTMLCanvasElement;
  heightMap: number[][];
  width: number;
  height: number;

  constructor() {
    const { width, height, heightMap } = generateTerrain(this.tileSize);
    this.width = width;
    this.height = height;
    this.heightMap = heightMap;
    this.terrainCanvas = createTerrainTexture(width, height, heightMap, this.tileSize);
  }

  render(ctx: Canvas) {
    ctx.drawImage(this.terrainCanvas, 0, 0);
  }

  getHeightAt(pos: Vec): number {
    // Calculate tile indices and positions within the tile
    const x = pos[0] / this.tileSize + this.offsetX;
    const y = pos[1] / this.tileSize + this.offsetY;

    const x0 = Math.floor(x);
    const x1 = Math.min(x0 + 1, this.heightMap[0].length - 1);
    const y0 = Math.floor(y);
    const y1 = Math.min(y0 + 1, this.heightMap.length - 1);

    // Get heights at the four corners
    const h00 = this.heightMap[y0][x0];
    const h10 = this.heightMap[y0][x1];
    const h01 = this.heightMap[y1][x0];
    const h11 = this.heightMap[y1][x1];

    // Calculate the fractional part of x and y within the tile
    const dx = x - x0;
    const dy = y - y0;

    // Bilinear interpolation
    const h0 = h00 * (1 - dx) + h10 * dx;
    const h1 = h01 * (1 - dx) + h11 * dx;
    const height = h0 * (1 - dy) + h1 * dy;

    return height;
  }
}
