import { TerrainMap, TerrainType, TerrainTile, TERRAIN_IMAGE_MAP } from './terrain-types';

const TILE_SIZE = 32;

/**
 * Generates a terrain map for the game world
 */
export function generateTerrainMap(worldWidth: number, worldHeight: number): TerrainMap {
  const tilesX = Math.ceil(worldWidth / TILE_SIZE);
  const tilesY = Math.ceil(worldHeight / TILE_SIZE);
  
  const tiles: TerrainTile[][] = [];
  
  for (let y = 0; y < tilesY; y++) {
    tiles[y] = [];
    for (let x = 0; x < tilesX; x++) {
      // Create mostly grass with some dirt patches for variation
      const noise = Math.sin(x * 0.1) * Math.cos(y * 0.1) + Math.random() * 0.3;
      const terrainType = noise > 0.2 ? TerrainType.Grass : TerrainType.Dirt;
      
      tiles[y][x] = {
        type: terrainType,
        imageType: TERRAIN_IMAGE_MAP[terrainType],
        x: x * TILE_SIZE,
        y: y * TILE_SIZE,
      };
    }
  }
  
  return {
    width: tilesX,
    height: tilesY,
    tileSize: TILE_SIZE,
    tiles,
  };
}

/**
 * Gets the terrain tile at a specific world position
 */
export function getTerrainTileAt(terrainMap: TerrainMap, worldX: number, worldY: number): TerrainTile | null {
  const tileX = Math.floor(worldX / terrainMap.tileSize);
  const tileY = Math.floor(worldY / terrainMap.tileSize);
  
  if (tileX < 0 || tileX >= terrainMap.width || tileY < 0 || tileY >= terrainMap.height) {
    return null;
  }
  
  return terrainMap.tiles[tileY][tileX];
}