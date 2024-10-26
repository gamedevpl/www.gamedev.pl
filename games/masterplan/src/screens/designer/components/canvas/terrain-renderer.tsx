import { GRID_CENTER_X } from '../../../battle/consts';
import { TerrainData } from '../../../battle/game/terrain/terrain-generator';

interface TerrainRenderProps {
  width: number;
  height: number;
  cellWidth: number;
  cellHeight: number;
  terrainData: TerrainData;
  isPlayerArea: boolean;
}

export class TerrainRenderer {
  static render(ctx: CanvasRenderingContext2D, props: TerrainRenderProps): void {
    this.renderTerrainHeightMap(ctx, props);
  }

  private static renderTerrainHeightMap(ctx: CanvasRenderingContext2D, props: TerrainRenderProps): void {
    const { terrainData, cellWidth, cellHeight, isPlayerArea } = props;
    const terrainHeightMap = terrainData.heightMap;
    const centerX = terrainHeightMap[0].length / 2;
    const maxHeight = Math.max(...terrainHeightMap.flat());

    // Calculate the starting row based on whether this is the player area or opposition area
    const startRow = isPlayerArea ? terrainHeightMap.length / 2 : 0;
    const endRow = isPlayerArea ? terrainHeightMap.length : terrainHeightMap.length / 2;

    ctx.save();

    // Render terrain height map
    for (let row = startRow; row < endRow; row++) {
      for (let col = -centerX; col < centerX; col++) {
        const x = col * cellWidth;
        const y = (row - startRow) * cellHeight;
        const heightValue = terrainHeightMap[Math.floor(row)][Math.floor(centerX + col)];

        ctx.fillStyle = `rgb(0, 0, 0, ${0.5 - heightValue / maxHeight / 2})`;

        // Draw the cell
        ctx.fillRect(GRID_CENTER_X * cellWidth + x, y, cellWidth, cellHeight);
      }
    }

    ctx.restore();
  }

  /**
   * Get the terrain height at a specific grid position
   */
  static getTerrainHeightAt(terrainData: TerrainData, col: number, row: number, isPlayerArea: boolean): number {
    const terrainHeightMap = terrainData.heightMap;
    const centerX = terrainHeightMap[0].length / 2;
    const adjustedRow = isPlayerArea ? row + terrainHeightMap.length / 2 : row;

    if (
      adjustedRow >= 0 &&
      adjustedRow < terrainHeightMap.length &&
      col + centerX >= 0 &&
      col + centerX < terrainHeightMap[0].length
    ) {
      return terrainHeightMap[Math.floor(adjustedRow)][Math.floor(col + centerX)];
    }

    return 0;
  }
}
