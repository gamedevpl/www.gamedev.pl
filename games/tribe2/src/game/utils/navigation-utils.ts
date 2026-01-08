import { Vector2D } from './math-types';
import { GameWorldState, NavigationGrid } from '../world-types';
import { EntityId } from '../entities/entities-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import { calculateWrappedDistance, getDirectionVectorOnTorus } from './math-utils';
import { CHARACTER_RADIUS } from '../ui/ui-consts';

/**
 * Resolution of the navigation grid in pixels.
 * Set to 10px (finer than territory grid) for better small obstacle detection.
 */
export const NAV_GRID_RESOLUTION = 10;

/**
 * The standard radius used to inflate obstacles on the navigation grid.
 * Matches the HumanEntity radius to ensure they can navigate gaps.
 */
export const NAVIGATION_AGENT_RADIUS = CHARACTER_RADIUS;

/**
 * Calculates the grid index for a given world position.
 */
export function getNavigationGridIndex(position: Vector2D, worldWidth: number, worldHeight: number): number {
  const wrappedX = ((position.x % worldWidth) + worldWidth) % worldWidth;
  const wrappedY = ((position.y % worldHeight) + worldHeight) % worldHeight;
  const gridX = Math.floor(wrappedX / NAV_GRID_RESOLUTION);
  const gridY = Math.floor(wrappedY / NAV_GRID_RESOLUTION);
  const gridWidth = Math.ceil(worldWidth / NAV_GRID_RESOLUTION);
  return gridY * gridWidth + gridX;
}

/**
 * Calculates grid coordinates from a world position.
 */
export function getNavigationGridCoords(
  position: Vector2D,
  worldWidth: number,
  worldHeight: number,
): { x: number; y: number } {
  const wrappedX = ((position.x % worldWidth) + worldWidth) % worldWidth;
  const wrappedY = ((position.y % worldHeight) + worldHeight) % worldHeight;
  return {
    x: Math.floor(wrappedX / NAV_GRID_RESOLUTION),
    y: Math.floor(wrappedY / NAV_GRID_RESOLUTION),
  };
}

/**
 * Initializes an empty navigation grid.
 * The grid uses a dual-layer system:
 * 1. Physical Layer (obstacleCount): Represents the actual footprint of objects.
 * 2. Padding Layer (paddingCount): Represents the safety margin/inflation for pathfinding.
 */
export function initNavigationGrid(worldWidth: number, worldHeight: number): NavigationGrid {
  const gridWidth = Math.ceil(worldWidth / NAV_GRID_RESOLUTION);
  const gridHeight = Math.ceil(worldHeight / NAV_GRID_RESOLUTION);
  const size = gridWidth * gridHeight;

  return {
    obstacleCount: new Uint16Array(size),
    gateRefCount: {},
    paddingCount: new Uint16Array(size),
    gatePaddingRefCount: {},
  };
}

/**
 * Helper to check if a grid cell is passable for a specific tribe.
 * @param grid The navigation grid
 * @param index The grid index to check
 * @param leaderId Optional leader ID to check for friendly gate passage
 * @param usePadding If true, checks both physical obstacles and safety padding. If false, only checks physical obstacles.
 */
export function isCellPassable(
  grid: NavigationGrid,
  index: number,
  leaderId?: number,
  usePadding: boolean = true,
): boolean {
  if (usePadding) {
    // Check combined physical obstacles and padding
    const totalCount = grid.obstacleCount[index] + grid.paddingCount[index];
    if (totalCount === 0) return true;

    if (leaderId !== undefined) {
      // Strict Passability: A cell is only 'perfectly passable' if ALL obstacles/padding
      // in it belong to the leader's gates.
      const totalGateCount =
        (grid.gateRefCount[leaderId]?.[index] || 0) + (grid.gatePaddingRefCount[leaderId]?.[index] || 0);
      return totalCount === totalGateCount;
    }
    return false;
  } else {
    // Check only physical obstacles
    const count = grid.obstacleCount[index];
    if (count === 0) return true;

    if (leaderId !== undefined) {
      const gateCount = grid.gateRefCount[leaderId]?.[index] || 0;
      return count === gateCount;
    }
    return false;
  }
}

/**
 * Updates a sector of the navigation grid (e.g., when a building is constructed or a tree falls).
 * Uses reference counting to handle overlapping obstacles correctly.
 * Separates updates into physical core and padding halo.
 */
export function updateNavigationGridSector(
  gameState: GameWorldState,
  position: Vector2D,
  radius: number,
  isAdding: boolean,
  ownerId: EntityId | null = null,
  inflationRadius: number = 0,
): void {
  const { width: worldWidth, height: worldHeight } = gameState.mapDimensions;
  const gridWidth = Math.ceil(worldWidth / NAV_GRID_RESOLUTION);
  const gridHeight = Math.ceil(worldHeight / NAV_GRID_RESOLUTION);

  const effectiveRadius = radius + inflationRadius;
  const radiusInCells = Math.ceil(effectiveRadius / NAV_GRID_RESOLUTION);
  const centerCoords = getNavigationGridCoords(position, worldWidth, worldHeight);

  const grid = gameState.navigationGrid;
  const size = grid.obstacleCount.length;

  // Ensure tribe ref count arrays exist if ownerId is provided
  if (ownerId !== null) {
    if (!grid.gateRefCount[ownerId]) {
      grid.gateRefCount[ownerId] = new Uint16Array(size);
    }
    if (!grid.gatePaddingRefCount[ownerId]) {
      grid.gatePaddingRefCount[ownerId] = new Uint16Array(size);
    }
  }

  for (let dy = -radiusInCells; dy <= radiusInCells; dy++) {
    for (let dx = -radiusInCells; dx <= radiusInCells; dx++) {
      const gx = (centerCoords.x + dx + gridWidth) % gridWidth;
      const gy = (centerCoords.y + dy + gridHeight) % gridHeight;

      const cellCenterX = gx * NAV_GRID_RESOLUTION + NAV_GRID_RESOLUTION / 2;
      const cellCenterY = gy * NAV_GRID_RESOLUTION + NAV_GRID_RESOLUTION / 2;

      const dist = calculateWrappedDistance(position, { x: cellCenterX, y: cellCenterY }, worldWidth, worldHeight);

      if (dist <= effectiveRadius) {
        const index = gy * gridWidth + gx;
        const isPhysical = dist <= radius;

        if (isAdding) {
          if (isPhysical) {
            grid.obstacleCount[index]++;
            if (ownerId !== null) grid.gateRefCount[ownerId][index]++;
          } else {
            grid.paddingCount[index]++;
            if (ownerId !== null) grid.gatePaddingRefCount[ownerId][index]++;
          }
        } else {
          // Removal with safety checks to avoid underflow
          if (isPhysical) {
            if (grid.obstacleCount[index] > 0) grid.obstacleCount[index]--;
            if (ownerId !== null && grid.gateRefCount[ownerId] && grid.gateRefCount[ownerId][index] > 0) {
              grid.gateRefCount[ownerId][index]--;
            }
          } else {
            if (grid.paddingCount[index] > 0) grid.paddingCount[index]--;
            if (ownerId !== null && grid.gatePaddingRefCount[ownerId] && grid.gatePaddingRefCount[ownerId][index] > 0) {
              grid.gatePaddingRefCount[ownerId][index]--;
            }
          }
        }
      }
    }
  }
}

/**
 * Fast check to see if a direct line between two points is blocked.
 * Uses physical-only passability check to allow tight movement.
 */
export function isPathBlocked(gameState: GameWorldState, start: Vector2D, end: Vector2D, entity: HumanEntity): boolean {
  const { width: worldWidth, height: worldHeight } = gameState.mapDimensions;
  const dir = getDirectionVectorOnTorus(start, end, worldWidth, worldHeight);
  const distance = Math.sqrt(dir.x * dir.x + dir.y * dir.y);

  if (distance < 0.001) return false;

  const steps = Math.ceil(distance / (NAV_GRID_RESOLUTION / 2));
  const stepX = dir.x / steps;
  const stepY = dir.y / steps;

  const normX = dir.x / distance;
  const normY = dir.y / distance;
  const perpX = -normY;
  const perpY = normX;
  const lateralOffset = entity.radius;

  const grid = gameState.navigationGrid;

  for (let i = 0; i <= steps; i++) {
    const testPos = {
      x: start.x + stepX * i,
      y: start.y + stepY * i,
    };

    const testPoints = [
      testPos,
      { x: testPos.x + perpX * lateralOffset, y: testPos.y + perpY * lateralOffset },
      { x: testPos.x - perpX * lateralOffset, y: testPos.y - perpY * lateralOffset },
      { x: testPos.x + perpX * lateralOffset * 0.5, y: testPos.y + perpY * lateralOffset * 0.5 },
      { x: testPos.x - perpX * lateralOffset * 0.5, y: testPos.y - perpY * lateralOffset * 0.5 },
    ];

    for (const p of testPoints) {
      const index = getNavigationGridIndex(p, worldWidth, worldHeight);
      // Use usePadding: false for real-time movement check
      if (!isCellPassable(grid, index, entity.leaderId, false)) {
        return true; // Physically Blocked
      }
    }
  }

  return false;
}

/**
 * Finds the nearest cell that is fully passable (no physical obstacles AND no padding penalty).
 * Spirals out from the given position.
 */
export function findNearestPassableCell(
  grid: NavigationGrid,
  pos: Vector2D,
  worldWidth: number,
  worldHeight: number,
  leaderId?: number,
): Vector2D {
  const startCoords = getNavigationGridCoords(pos, worldWidth, worldHeight);
  const gridWidth = Math.ceil(worldWidth / NAV_GRID_RESOLUTION);
  const gridHeight = Math.ceil(worldHeight / NAV_GRID_RESOLUTION);

  // Spiral search
  for (let r = 0; r < 20; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (r > 0 && Math.abs(dx) !== r && Math.abs(dy) !== r) continue;

        const nx = (startCoords.x + dx + gridWidth) % gridWidth;
        const ny = (startCoords.y + dy + gridHeight) % gridHeight;
        const index = ny * gridWidth + nx;

        if (isCellPassable(grid, index, leaderId, true)) {
          return {
            x: nx * NAV_GRID_RESOLUTION + NAV_GRID_RESOLUTION / 2,
            y: ny * NAV_GRID_RESOLUTION + NAV_GRID_RESOLUTION / 2,
          };
        }
      }
    }
  }

  return pos; // Fallback
}

/**
 * Toroidal A* pathfinding.
 * Uses a dynamic penalty field model for padding.
 */
export function findPath(
  gameState: GameWorldState,
  start: Vector2D,
  end: Vector2D,
  entity: HumanEntity,
): { path: Vector2D[] | null; iterations: number } {
  const { width: worldWidth, height: worldHeight } = gameState.mapDimensions;
  const gridWidth = Math.ceil(worldWidth / NAV_GRID_RESOLUTION);
  const gridHeight = Math.ceil(worldHeight / NAV_GRID_RESOLUTION);

  const grid = gameState.navigationGrid;

  // Ensure target is actually reachable (not inside a solid object or padding)
  const endIdx = getNavigationGridIndex(end, worldWidth, worldHeight);
  let finalTarget = end;
  if (!isCellPassable(grid, endIdx, entity.leaderId, true)) {
    finalTarget = findNearestPassableCell(grid, end, worldWidth, worldHeight, entity.leaderId);
  }

  const startCoords = getNavigationGridCoords(start, worldWidth, worldHeight);
  const endCoords = getNavigationGridCoords(finalTarget, worldWidth, worldHeight);

  if (startCoords.x === endCoords.x && startCoords.y === endCoords.y) {
    return { path: [finalTarget], iterations: 0 };
  }

  // Simple Priority Queue implementation
  const openSet: number[] = [startCoords.y * gridWidth + startCoords.x];
  const cameFrom = new Map<number, number>();
  const gScore = new Map<number, number>();
  const fScore = new Map<number, number>();

  const startIdx = startCoords.y * gridWidth + startCoords.x;
  gScore.set(startIdx, 0);
  fScore.set(startIdx, toroidalHeuristic(startCoords, endCoords, gridWidth, gridHeight));

  const maxIterations = 5000; // Safety cap
  let iterations = 0;

  while (openSet.length > 0 && iterations < maxIterations) {
    iterations++;

    // Get node with lowest fScore
    let currentIdx = openSet[0];
    let lowestF = fScore.get(currentIdx) ?? Infinity;
    let openSetIdx = 0;

    for (let i = 1; i < openSet.length; i++) {
      const score = fScore.get(openSet[i]) ?? Infinity;
      if (score < lowestF) {
        lowestF = score;
        currentIdx = openSet[i];
        openSetIdx = i;
      }
    }

    const curX = currentIdx % gridWidth;
    const curY = Math.floor(currentIdx / gridWidth);

    if (curX === endCoords.x && curY === endCoords.y) {
      return { path: reconstructPath(cameFrom, currentIdx, gridWidth, finalTarget), iterations };
    }

    openSet.splice(openSetIdx, 1);

    // Neighbors (8 directions)
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;

        const nx = (curX + dx + gridWidth) % gridWidth;
        const ny = (curY + dy + gridHeight) % gridHeight;
        const neighborIdx = ny * gridWidth + nx;

        // Hard check: Physical obstacles are strictly impassable
        if (!isCellPassable(grid, neighborIdx, entity.leaderId, false)) {
          continue;
        }

        // Base cost for movement (cardinal vs diagonal)
        let moveCost = dx !== 0 && dy !== 0 ? 1.414 : 1.0;

        // Navigation Field Penalty Model:
        // Calculate effective padding (total padding minus friendly gate padding)
        const totalPadding = grid.paddingCount[neighborIdx];
        const friendlyGatePadding =
          entity.leaderId !== undefined ? grid.gatePaddingRefCount[entity.leaderId]?.[neighborIdx] || 0 : 0;
        const effectivePadding = Math.max(0, totalPadding - friendlyGatePadding);

        if (effectivePadding > 0) {
          // Add penalty per source of padding. 25.0 is a strong deterrent but allows
          // squeezing through holes if the detour is long.
          moveCost += 25.0 * effectivePadding;
        }

        const tentativeGScore = (gScore.get(currentIdx) ?? 0) + moveCost;

        if (tentativeGScore < (gScore.get(neighborIdx) ?? Infinity)) {
          cameFrom.set(neighborIdx, currentIdx);
          gScore.set(neighborIdx, tentativeGScore);
          fScore.set(
            neighborIdx,
            tentativeGScore + toroidalHeuristic({ x: nx, y: ny }, endCoords, gridWidth, gridHeight),
          );
          if (!openSet.includes(neighborIdx)) {
            openSet.push(neighborIdx);
          }
        }
      }
    }
  }

  return { path: null, iterations }; // No path found
}

function toroidalHeuristic(
  a: { x: number; y: number },
  b: { x: number; y: number },
  width: number,
  height: number,
): number {
  let dx = Math.abs(a.x - b.x);
  let dy = Math.abs(a.y - b.y);

  if (dx > width / 2) dx = width - dx;
  if (dy > height / 2) dy = height - dy;

  // Octile distance for 8-way movement
  const D = 1;
  const D2 = 1.414;
  return D * (dx + dy) + (D2 - 2 * D) * Math.min(dx, dy);
}

function reconstructPath(
  cameFrom: Map<number, number>,
  currentIdx: number,
  gridWidth: number,
  finalPos: Vector2D,
): Vector2D[] {
  const path: Vector2D[] = [finalPos];
  let curr = currentIdx;
  const visited = new Set<number>();

  while (cameFrom.has(curr)) {
    if (visited.has(curr)) {
      break;
    }
    visited.add(curr);
    curr = cameFrom.get(curr)!;
    path.unshift({
      x: (curr % gridWidth) * NAV_GRID_RESOLUTION + NAV_GRID_RESOLUTION / 2,
      y: Math.floor(curr / gridWidth) * NAV_GRID_RESOLUTION + NAV_GRID_RESOLUTION / 2,
    });
  }

  // Remove the starting point (current position of entity)
  path.shift();

  return path;
}
