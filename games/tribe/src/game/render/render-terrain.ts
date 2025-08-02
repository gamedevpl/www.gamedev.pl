import { TerrainMap } from '../terrain/terrain-types';
import { getImageAsset } from '../assets/image-loader';

/**
 * Renders the terrain background using tile-based rendering
 */
export function renderTerrain(
  ctx: CanvasRenderingContext2D,
  terrainMap: TerrainMap,
  viewportX: number,
  viewportY: number,
  viewportWidth: number,
  viewportHeight: number,
): void {
  // Calculate which tiles are visible in the viewport
  const startTileX = Math.max(0, Math.floor(viewportX / terrainMap.tileSize));
  const endTileX = Math.min(terrainMap.width - 1, Math.ceil((viewportX + viewportWidth) / terrainMap.tileSize));
  const startTileY = Math.max(0, Math.floor(viewportY / terrainMap.tileSize));
  const endTileY = Math.min(terrainMap.height - 1, Math.ceil((viewportY + viewportHeight) / terrainMap.tileSize));

  // Render visible tiles
  for (let y = startTileY; y <= endTileY; y++) {
    for (let x = startTileX; x <= endTileX; x++) {
      const tile = terrainMap.tiles[y][x];
      if (!tile) continue;

      const asset = getImageAsset(tile.imageType);
      if (asset) {
        ctx.drawImage(
          asset.image,
          tile.x,
          tile.y,
          terrainMap.tileSize,
          terrainMap.tileSize,
        );
      } else {
        // Fallback to solid color if asset not loaded
        ctx.fillStyle = tile.type === 'grass' ? '#4a7c59' : '#8b4513';
        ctx.fillRect(tile.x, tile.y, terrainMap.tileSize, terrainMap.tileSize);
      }
    }
  }
}