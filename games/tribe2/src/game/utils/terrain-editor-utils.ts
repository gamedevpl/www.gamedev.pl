import { BiomeType } from '../types/world-types';
import { Vector2D } from '../types/math-types';

/**
 * Converts world coordinates to grid coordinates, handling map wrapping.
 * @param worldPos The position in world coordinates.
 * @param cellSize The size of each grid cell in world units.
 * @param mapDimensions The total dimensions of the world in world units.
 * @returns The integer grid coordinates { gx, gy }.
 */
export function worldToGridCoords(
  worldPos: Vector2D,
  cellSize: number,
  mapDimensions: { width: number; height: number },
): { gx: number; gy: number } {
  const wrappedX = ((worldPos.x % mapDimensions.width) + mapDimensions.width) % mapDimensions.width;
  const wrappedY = ((worldPos.y % mapDimensions.height) + mapDimensions.height) % mapDimensions.height;

  const gx = Math.floor(wrappedX / cellSize);
  const gy = Math.floor(wrappedY / cellSize);

  return { gx, gy };
}

/**
 * Calculates all positions where a brush effect should be applied in a toroidal world.
 * If the brush spans world boundaries, multiple wrapped positions are returned.
 * 
 * @param worldPos The center of the brush in world coordinates.
 * @param brushRadius The radius of the brush in world units.
 * @param mapDimensions The dimensions of the game world.
 * @returns Array of positions where the brush effect should be applied (1, 2, or 4 positions).
 */
function getWrappedBrushPositions(
  worldPos: Vector2D,
  brushRadius: number,
  mapDimensions: { width: number; height: number },
): Vector2D[] {
  const positions: Vector2D[] = [worldPos];

  // Check if brush extends beyond left/right boundaries
  const crossesLeft = worldPos.x - brushRadius < 0;
  const crossesRight = worldPos.x + brushRadius > mapDimensions.width;

  // Check if brush extends beyond top/bottom boundaries
  const crossesTop = worldPos.y - brushRadius < 0;
  const crossesBottom = worldPos.y + brushRadius > mapDimensions.height;

  // Add wrapped positions as needed
  if (crossesLeft) {
    // Brush extends past left edge, add wrapped position to the right
    positions.push({ x: worldPos.x + mapDimensions.width, y: worldPos.y });
  } else if (crossesRight) {
    // Brush extends past right edge, add wrapped position to the left
    positions.push({ x: worldPos.x - mapDimensions.width, y: worldPos.y });
  }

  if (crossesTop) {
    // Brush extends past top edge, add wrapped position to the bottom
    positions.push({ x: worldPos.x, y: worldPos.y + mapDimensions.height });
  } else if (crossesBottom) {
    // Brush extends past bottom edge, add wrapped position to the top
    positions.push({ x: worldPos.x, y: worldPos.y - mapDimensions.height });
  }

  // Handle corner cases: if brush crosses both X and Y boundaries, add diagonal wrapped position
  if ((crossesLeft || crossesRight) && (crossesTop || crossesBottom)) {
    const wrappedX = crossesLeft ? worldPos.x + mapDimensions.width : worldPos.x - mapDimensions.width;
    const wrappedY = crossesTop ? worldPos.y + mapDimensions.height : worldPos.y - mapDimensions.height;
    positions.push({ x: wrappedX, y: wrappedY });
  }

  return positions;
}

/**
 * Core logic for applying terrain edit at a single position.
 * This is extracted to avoid code duplication when handling wrapped positions.
 */
function applyTerrainEditAtPosition(
  heightMap: number[][],
  worldPos: Vector2D,
  brushRadius: number,
  intensity: number,
  mapDimensions: { width: number; height: number },
  cellSize: number,
  modifiedCells: Map<number, number>,
): void {
  const gridHeight = heightMap.length;
  const gridWidth = heightMap[0]?.length ?? 0;
  if (gridWidth === 0 || gridHeight === 0) {
    return;
  }

  const center = worldToGridCoords(worldPos, cellSize, mapDimensions);
  const brushRadiusInCells = brushRadius / cellSize;

  // Iterate over a bounding box around the brush
  const startGx = Math.floor(center.gx - brushRadiusInCells);
  const endGx = Math.ceil(center.gx + brushRadiusInCells);
  const startGy = Math.floor(center.gy - brushRadiusInCells);
  const endGy = Math.ceil(center.gy + brushRadiusInCells);

  for (let gy = startGy; gy <= endGy; gy++) {
    for (let gx = startGx; gx <= endGx; gx++) {
      // Calculate distance from the current cell to the brush center
      const dist = Math.hypot(gx - center.gx, gy - center.gy);

      // Apply effect only if within the brush radius
      if (dist <= brushRadiusInCells) {
        // Calculate smooth falloff (quadratic)
        const falloff = Math.pow(1 - dist / brushRadiusInCells, 2);

        // Handle toroidal wrapping for grid coordinates
        const wrappedGy = ((gy % gridHeight) + gridHeight) % gridHeight;
        const wrappedGx = ((gx % gridWidth) + gridWidth) % gridWidth;

        // Apply the height modification
        const currentHeight = heightMap[wrappedGy][wrappedGx];
        const newHeight = currentHeight + intensity * falloff;

        // Clamp the new height to the valid range [0, 1]
        const clampedHeight = Math.max(0, Math.min(1, newHeight));

        // Update the heightmap in place
        heightMap[wrappedGy][wrappedGx] = clampedHeight;

        // Store the modified cell for the GPU texture update
        const index1D = wrappedGy * gridWidth + wrappedGx;
        const valueR8 = Math.round(clampedHeight * 255);
        modifiedCells.set(index1D, valueR8);
      }
    }
  }
}

/**
 * Modifies the heightmap based on a brush stroke.
 * This function mutates the input heightMap array and handles brush strokes that span world boundaries.
 * @param heightMap The 2D heightmap array to modify.
 * @param worldPos The center of the brush in world coordinates.
 * @param brushRadius The radius of the brush in world units.
 * @param intensity The amount of height to add (positive) or remove (negative).
 * @param mapDimensions The dimensions of the game world.
 * @param cellSize The size of each heightmap cell in world units.
 * @returns A map of modified grid cells, with the key being the 1D index and the value being the new height [0-255].
 */
export function applyTerrainEdit(
  heightMap: number[][],
  worldPos: Vector2D,
  brushRadius: number,
  intensity: number,
  mapDimensions: { width: number; height: number },
  cellSize: number,
): Map<number, number> {
  const modifiedCells = new Map<number, number>();

  // Get all positions where the brush effect should be applied (handles boundary wrapping)
  const wrappedPositions = getWrappedBrushPositions(worldPos, brushRadius, mapDimensions);

  // Apply terrain edit at each wrapped position
  wrappedPositions.forEach((pos) => {
    applyTerrainEditAtPosition(heightMap, pos, brushRadius, intensity, mapDimensions, cellSize, modifiedCells);
  });

  return modifiedCells;
}

function biomeToValue(biome: BiomeType): number {
  switch (biome) {
    case BiomeType.GROUND:
      return 0;
    case BiomeType.SAND:
      return 1;
    case BiomeType.GRASS:
      return 2;
    case BiomeType.ROCK:
      return 3;
    case BiomeType.SNOW:
      return 4;
    case BiomeType.TREE:
      return 2; // Treat tree biome as grass for painting
    default:
      return 0;
  }
}

function valueToBiome(value: number): BiomeType {
  switch (value) {
    case 0:
      return BiomeType.GROUND;
    case 1:
      return BiomeType.SAND;
    case 2:
      return BiomeType.GRASS;
    case 3:
      return BiomeType.ROCK;
    case 4:
      return BiomeType.SNOW;
    default:
      return BiomeType.GROUND;
  }
}

/**
 * Core logic for applying biome edit at a single position.
 * This is extracted to avoid code duplication when handling wrapped positions.
 */
function applyBiomeEditAtPosition(
  biomeMap: BiomeType[][],
  worldPos: Vector2D,
  brushRadius: number,
  selectedBiome: BiomeType,
  mapDimensions: { width: number; height: number },
  cellSize: number,
  modifiedCells: Map<number, number>,
): void {
  const gridHeight = biomeMap.length;
  const gridWidth = biomeMap[0]?.length ?? 0;
  if (gridWidth === 0 || gridHeight === 0) {
    return;
  }

  const center = worldToGridCoords(worldPos, cellSize, mapDimensions);
  const brushRadiusInCells = brushRadius / cellSize;

  const startGx = Math.floor(center.gx - brushRadiusInCells);
  const endGx = Math.ceil(center.gx + brushRadiusInCells);
  const startGy = Math.floor(center.gy - brushRadiusInCells);
  const endGy = Math.ceil(center.gy + brushRadiusInCells);

  for (let gy = startGy; gy <= endGy; gy++) {
    for (let gx = startGx; gx <= endGx; gx++) {
      const dist = Math.hypot(gx - center.gx, gy - center.gy);

      if (dist <= brushRadiusInCells) {
        const falloff = Math.pow(1 - dist / brushRadiusInCells, 2);
        const wrappedGy = ((gy % gridHeight) + gridHeight) % gridHeight;
        const wrappedGx = ((gx % gridWidth) + gridWidth) % gridWidth;

        const currentBiomeValue = biomeToValue(biomeMap[wrappedGy][wrappedGx]);
        const selectedBiomeValue = biomeToValue(selectedBiome);

        // Interpolate between current and selected biome values
        const newBiomeFloatValue = currentBiomeValue * (1 - falloff) + selectedBiomeValue * falloff;

        // Update the biomeMap with the closest discrete biome type
        biomeMap[wrappedGy][wrappedGx] = valueToBiome(Math.round(newBiomeFloatValue));

        // Store the interpolated float value for the GPU texture update
        const index1D = wrappedGy * gridWidth + wrappedGx;
        // Normalize from [0, 4] to [0, 255] for r8unorm texture
        const valueR8 = Math.round((newBiomeFloatValue / 4.0) * 255);
        modifiedCells.set(index1D, valueR8);
      }
    }
  }
}

/**
 * Modifies the biome map based on a brush stroke with smooth falloff.
 * This function mutates the input biomeMap array and handles brush strokes that span world boundaries.
 * @param biomeMap The 2D biome map array to modify.
 * @param worldPos The center of the brush in world coordinates.
 * @param brushRadius The radius of the brush in world units.
 * @param selectedBiome The biome to paint.
 * @param mapDimensions The dimensions of the game world.
 * @param cellSize The size of each map cell in world units.
 * @returns A map of modified grid cells, with the key being the 1D index and the value being the new interpolated biome value [0-255].
 */
export function applyBiomeEdit(
  biomeMap: BiomeType[][],
  worldPos: Vector2D,
  brushRadius: number,
  selectedBiome: BiomeType,
  mapDimensions: { width: number; height: number },
  cellSize: number,
): Map<number, number> {
  const modifiedCells = new Map<number, number>();

  // Get all positions where the brush effect should be applied (handles boundary wrapping)
  const wrappedPositions = getWrappedBrushPositions(worldPos, brushRadius, mapDimensions);

  // Apply biome edit at each wrapped position
  wrappedPositions.forEach((pos) => {
    applyBiomeEditAtPosition(biomeMap, pos, brushRadius, selectedBiome, mapDimensions, cellSize, modifiedCells);
  });

  return modifiedCells;
}
