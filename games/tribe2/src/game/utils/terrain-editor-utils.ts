import { BiomeType, RoadDirection, RoadPiece, BuildingType, Entities, EntityType } from '../types/world-types';
import { Vector2D } from '../types/math-types';
import { ROAD_LEVEL_INTENSITY, ROAD_WIDTH, WATER_LEVEL, BUILDING_SPECS, BUILDING_MIN_SPACING } from '../constants/world-constants';

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

/**
 * Calculates the primary 8-way direction from a starting to an ending position.
 * @param from The starting grid position.
 * @param to The ending grid position.
 * @returns The calculated RoadDirection.
 */
export function calculateRoadDirection(from: Vector2D, to: Vector2D): RoadDirection {
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  if (dx === 0 && dy === 0) {
    return RoadDirection.NONE;
  }

  // In grid space, +y is down, so we use atan2(dy, dx)
  const angle = Math.atan2(dy, dx); // Angle in radians
  const piOver8 = Math.PI / 8;

  if (angle >= -piOver8 && angle < piOver8) return RoadDirection.E;
  if (angle >= piOver8 && angle < 3 * piOver8) return RoadDirection.SE;
  if (angle >= 3 * piOver8 && angle < 5 * piOver8) return RoadDirection.S;
  if (angle >= 5 * piOver8 && angle < 7 * piOver8) return RoadDirection.SW;
  if (angle >= 7 * piOver8 || angle < -7 * piOver8) return RoadDirection.W;
  if (angle >= -7 * piOver8 && angle < -5 * piOver8) return RoadDirection.NW;
  if (angle >= -5 * piOver8 && angle < -3 * piOver8) return RoadDirection.N;
  if (angle >= -3 * piOver8 && angle < -piOver8) return RoadDirection.NE;

  return RoadDirection.NONE; // Should be unreachable
}

/**
 * Levels the terrain orthogonally to a road's direction.
 */
function levelTerrainForRoad(
  heightMap: number[][],
  roadGridPos: { gx: number; gy: number },
  direction: RoadDirection,
  roadWidth: number,
  intensity: number,
  _mapDimensions: { width: number; height: number },
  cellSize: number,
  modifiedCells: Map<number, number>,
  targetLevel: number,
): void {
  const gridHeight = heightMap.length;
  const gridWidth = heightMap[0]?.length ?? 0;
  if (gridWidth === 0) return;

  const roadWidthInCells = roadWidth / cellSize;
  const radius = roadWidthInCells / 2;

  // Define road direction vector (y is down in grid space)
  let dirVec = { x: 0, y: 0 };
  switch (direction) {
    case RoadDirection.N:
      dirVec = { x: 0, y: -1 };
      break;
    case RoadDirection.NE:
      dirVec = { x: 1, y: -1 };
      break;
    case RoadDirection.E:
      dirVec = { x: 1, y: 0 };
      break;
    case RoadDirection.SE:
      dirVec = { x: 1, y: 1 };
      break;
    case RoadDirection.S:
      dirVec = { x: 0, y: 1 };
      break;
    case RoadDirection.SW:
      dirVec = { x: -1, y: 1 };
      break;
    case RoadDirection.W:
      dirVec = { x: -1, y: 0 };
      break;
    case RoadDirection.NW:
      dirVec = { x: -1, y: -1 };
      break;
    case RoadDirection.NONE:
      return;
  }

  const len = Math.hypot(dirVec.x, dirVec.y);
  if (len > 0) {
    dirVec.x /= len;
    dirVec.y /= len;
  }

  const startGx = Math.floor(roadGridPos.gx - radius);
  const endGx = Math.ceil(roadGridPos.gx + radius);
  const startGy = Math.floor(roadGridPos.gy - radius);
  const endGy = Math.ceil(roadGridPos.gy + radius);

  for (let gy = startGy; gy <= endGy; gy++) {
    for (let gx = startGx; gx <= endGx; gx++) {
      const cellVec = { x: gx - roadGridPos.gx, y: gy - roadGridPos.gy };
      const dot = cellVec.x * dirVec.x + cellVec.y * dirVec.y;
      const parallelVec = { x: dot * dirVec.x, y: dot * dirVec.y };
      const orthoVec = { x: cellVec.x - parallelVec.x, y: cellVec.y - parallelVec.y };
      const orthoDist = Math.hypot(orthoVec.x, orthoVec.y);

      if (orthoDist <= radius) {
        const falloff = Math.pow(1 - orthoDist / radius, 2);
        const wrappedGy = ((gy % gridHeight) + gridHeight) % gridHeight;
        const wrappedGx = ((gx % gridWidth) + gridWidth) % gridWidth;

        const currentHeight = heightMap[wrappedGy][wrappedGx];
        const newHeight = currentHeight + (targetLevel - currentHeight) * intensity * falloff;
        const clampedHeight = Math.max(0, Math.min(1, newHeight));

        heightMap[wrappedGy][wrappedGx] = clampedHeight;

        const index1D = wrappedGy * gridWidth + wrappedGx;
        const valueR8 = Math.round(clampedHeight * 255);
        modifiedCells.set(index1D, valueR8);
      }
    }
  }
}

/**
 * Creates a new road piece, connects it to the previous one, and levels the terrain.
 * @returns A map of modified road cells and a map of modified height cells.
 */
export function applyRoadEdit(
  roadMap: (RoadPiece | null)[][],
  heightMap: number[][],
  worldPos: Vector2D,
  lastRoadPos: Vector2D | null,
  mapDimensions: { width: number; height: number },
  cellSize: number,
): { modifiedRoadCells: Map<number, RoadPiece | null>; modifiedHeightCells: Map<number, number> } {
  const modifiedRoadCells = new Map<number, RoadPiece | null>();
  const modifiedHeightCells = new Map<number, number>();
  const gridWidth = roadMap[0]?.length ?? 0;

  const currentGridPos = worldToGridCoords(worldPos, cellSize, mapDimensions);

  // Prevent road placement on water
  const terrainHeight = heightMap[currentGridPos.gy][currentGridPos.gx];
  if (terrainHeight < WATER_LEVEL) {
    return { modifiedRoadCells, modifiedHeightCells };
  }

  if (!lastRoadPos) return { modifiedRoadCells, modifiedHeightCells };

  const lastGridPos = worldToGridCoords(lastRoadPos, cellSize, mapDimensions);

  if (currentGridPos.gx === lastGridPos.gx && currentGridPos.gy === lastGridPos.gy) {
    return { modifiedRoadCells, modifiedHeightCells };
  }

  const direction = calculateRoadDirection(
    { x: lastGridPos.gx, y: lastGridPos.gy },
    { x: currentGridPos.gx, y: currentGridPos.gy },
  );
  if (direction === RoadDirection.NONE) return { modifiedRoadCells, modifiedHeightCells };

  const targetLevel = heightMap[currentGridPos.gy][currentGridPos.gx];
  const newRoadPiece: RoadPiece = { direction, level: targetLevel };
  roadMap[currentGridPos.gy][currentGridPos.gx] = newRoadPiece;
  const currentIndex = currentGridPos.gy * gridWidth + currentGridPos.gx;
  modifiedRoadCells.set(currentIndex, newRoadPiece);

  levelTerrainForRoad(
    heightMap,
    currentGridPos,
    direction,
    ROAD_WIDTH,
    ROAD_LEVEL_INTENSITY,
    mapDimensions,
    cellSize,
    modifiedHeightCells,
    targetLevel,
  );

  return { modifiedRoadCells, modifiedHeightCells };
}

/**
 * Checks if a building overlaps with any existing buildings, accounting for world wrapping.
 */
function checkBuildingOverlap(
  pos: Vector2D,
  width: number,
  height: number,
  entities: Entities,
  mapDimensions: { width: number; height: number },
): boolean {
  const halfWidth = width / 2;
  const halfHeight = height / 2;

  // Simple bounding box check against all other buildings
  for (const entity of entities.entities.values()) {
    if (entity.type === EntityType.BUILDING && entity.width && entity.height) {
      const otherHalfWidth = entity.width / 2;
      const otherHalfHeight = entity.height / 2;
      const minSpacing = BUILDING_MIN_SPACING;

      // Check distance with wrapping
      let dx = Math.abs(pos.x - entity.position.x);
      let dy = Math.abs(pos.y - entity.position.y);

      // Handle wrapping
      if (dx > mapDimensions.width / 2) dx = mapDimensions.width - dx;
      if (dy > mapDimensions.height / 2) dy = mapDimensions.height - dy;

      // Check if bounding boxes overlap (including spacing)
      if (
        dx < halfWidth + otherHalfWidth + minSpacing &&
        dy < halfHeight + otherHalfHeight + minSpacing
      ) {
        return true; // Overlap detected
      }
    }
  }
  return false;
}

/**
 * Validates if a building can be placed at the specified position.
 * Checks for water and overlaps with existing buildings.
 * 
 * @param worldPos The center position for the building.
 * @param buildingType The type of building to place.
 * @param entities The collection of existing entities.
 * @param heightMap The terrain heightmap.
 * @param mapDimensions The dimensions of the game world.
 * @param cellSize The size of each heightmap cell.
 * @returns True if the building can be placed, false otherwise.
 */
export function canPlaceBuilding(
  worldPos: Vector2D,
  buildingType: BuildingType,
  entities: Entities,
  heightMap: number[][],
  mapDimensions: { width: number; height: number },
  cellSize: number,
): boolean {
  const specs = BUILDING_SPECS[buildingType];
  
  // 1. Check if on water
  // We check the center and corners to ensure the whole building is on land
  const checkPoints = [
    worldPos,
    { x: worldPos.x - specs.width / 2, y: worldPos.y - specs.height / 2 },
    { x: worldPos.x + specs.width / 2, y: worldPos.y - specs.height / 2 },
    { x: worldPos.x - specs.width / 2, y: worldPos.y + specs.height / 2 },
    { x: worldPos.x + specs.width / 2, y: worldPos.y + specs.height / 2 },
  ];

  for (const point of checkPoints) {
    // Handle wrapping for point checks
    const wrappedPoint = {
      x: ((point.x % mapDimensions.width) + mapDimensions.width) % mapDimensions.width,
      y: ((point.y % mapDimensions.height) + mapDimensions.height) % mapDimensions.height,
    };
    
    const gridPos = worldToGridCoords(wrappedPoint, cellSize, mapDimensions);
    const height = heightMap[gridPos.gy][gridPos.gx];
    
    if (height < WATER_LEVEL) {
      return false; // Cannot place on water
    }
  }

  // 2. Check for overlaps with existing buildings
  if (checkBuildingOverlap(worldPos, specs.width, specs.height, entities, mapDimensions)) {
    return false;
  }

  return true;
}
