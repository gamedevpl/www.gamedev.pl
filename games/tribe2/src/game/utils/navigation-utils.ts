import { Vector2D } from './math-types';
import { GameWorldState, NavigationGrid } from '../world-types';
import { EntityId } from '../entities/entities-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import { calculateWrappedDistance, getDirectionVectorOnTorus } from './math-utils';
import { CHARACTER_RADIUS } from '../ui/ui-consts';
import { HPAGraph } from './hpa-types';
import {
  createHPAGraph,
  buildHPAGraph,
  insertTemporaryNode,
  removeTemporaryNode,
  hpaHighLevelSearch,
  hpaPathToWorldCoords,
  markClustersDirty,
} from './hpa-pathfinding';

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
 */
export function initNavigationGrid(worldWidth: number, worldHeight: number): NavigationGrid {
  const gridWidth = Math.ceil(worldWidth / NAV_GRID_RESOLUTION);
  const gridHeight = Math.ceil(worldHeight / NAV_GRID_RESOLUTION);
  const size = gridWidth * gridHeight;

  return {
    obstacleCount: new Uint16Array(size),
    gateRefCount: {},
  };
}

/**
 * Initializes the HPA* graph for hierarchical pathfinding.
 */
export function initHPAGraph(worldWidth: number, worldHeight: number): HPAGraph {
  const gridWidth = Math.ceil(worldWidth / NAV_GRID_RESOLUTION);
  const gridHeight = Math.ceil(worldHeight / NAV_GRID_RESOLUTION);
  return createHPAGraph(gridWidth, gridHeight);
}

/**
 * Builds or rebuilds the HPA* graph from the current navigation grid.
 * Call this after initial obstacle setup or when a full rebuild is needed.
 */
export function rebuildHPAGraph(gameState: GameWorldState): void {
  buildHPAGraph(gameState.hpaGraph, gameState.navigationGrid);
}

/**
 * Helper to check if a grid cell is passable for a specific tribe.
 */
export function isCellPassable(grid: NavigationGrid, index: number, leaderId?: number): boolean {
  const count = grid.obstacleCount[index];
  if (count === 0) return true;

  // If we have a leaderId, check if all obstacles at this cell are gates belonging to our tribe
  if (leaderId !== undefined) {
    const gateCount = grid.gateRefCount[leaderId]?.[index] || 0;
    return count === gateCount;
  }

  return false;
}

/**
 * Updates a sector of the navigation grid (e.g., when a building is constructed or a tree falls).
 * Uses reference counting to handle overlapping obstacles correctly.
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

  if (ownerId !== null && !grid.gateRefCount[ownerId]) {
    grid.gateRefCount[ownerId] = new Uint16Array(size);
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
        if (isAdding) {
          grid.obstacleCount[index]++;
          if (ownerId !== null) {
            grid.gateRefCount[ownerId][index]++;
          }
        } else {
          // Safety check to avoid underflow
          if (grid.obstacleCount[index] > 0) {
            grid.obstacleCount[index]--;
          }
          if (ownerId !== null && grid.gateRefCount[ownerId] && grid.gateRefCount[ownerId][index] > 0) {
            grid.gateRefCount[ownerId][index]--;
          }
        }
      }
    }
  }

  // Mark affected HPA* clusters as dirty for lazy rebuild
  if (gameState.hpaGraph) {
    markClustersDirty(gameState.hpaGraph, position, effectiveRadius, worldWidth, worldHeight);
  }
}

/**
 * Fast check to see if a direct line between two points is blocked.
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
  const lateralOffset = entity.radius * 0.5;

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
    ];

    for (const p of testPoints) {
      const index = getNavigationGridIndex(p, worldWidth, worldHeight);
      if (!isCellPassable(grid, index, entity.leaderId)) {
        return true; // Blocked
      }
    }
  }

  return false;
}

/**
 * Threshold distance (in grid cells) below which we use simple A* instead of HPA*.
 * For short paths, regular A* is faster due to lower overhead.
 */
const HPA_DISTANCE_THRESHOLD = 50;

/**
 * HPA* (Hierarchical Pathfinding A*) based pathfinding.
 * Uses hierarchical approach for long distances, falls back to simple A* for short paths.
 */
export function findPath(
  gameState: GameWorldState,
  start: Vector2D,
  end: Vector2D,
  entity: HumanEntity,
): Vector2D[] | null {
  const { width: worldWidth, height: worldHeight } = gameState.mapDimensions;
  const gridWidth = Math.ceil(worldWidth / NAV_GRID_RESOLUTION);
  const gridHeight = Math.ceil(worldHeight / NAV_GRID_RESOLUTION);

  const startCoords = getNavigationGridCoords(start, worldWidth, worldHeight);
  const endCoords = getNavigationGridCoords(end, worldWidth, worldHeight);

  if (startCoords.x === endCoords.x && startCoords.y === endCoords.y) {
    return [end];
  }

  // Calculate toroidal distance to decide which algorithm to use
  let dx = Math.abs(startCoords.x - endCoords.x);
  let dy = Math.abs(startCoords.y - endCoords.y);
  if (dx > gridWidth / 2) dx = gridWidth - dx;
  if (dy > gridHeight / 2) dy = gridHeight - dy;
  const gridDistance = Math.sqrt(dx * dx + dy * dy);

  // Use simple A* for short distances or if HPA* graph isn't ready
  if (gridDistance < HPA_DISTANCE_THRESHOLD || !gameState.hpaGraph || gameState.hpaGraph.nodes.size === 0) {
    return findPathSimpleAStar(gameState, start, end, entity);
  }

  // Rebuild HPA* graph if needed
  if (gameState.hpaGraph.needsRebuild) {
    buildHPAGraph(gameState.hpaGraph, gameState.navigationGrid, entity.leaderId);
  }

  // Use HPA* for longer distances
  return findPathHPA(gameState, start, end, entity, startCoords, endCoords);
}

/**
 * HPA* based pathfinding for longer distances.
 */
function findPathHPA(
  gameState: GameWorldState,
  start: Vector2D,
  end: Vector2D,
  entity: HumanEntity,
  startCoords: { x: number; y: number },
  endCoords: { x: number; y: number },
): Vector2D[] | null {
  const hpaGraph = gameState.hpaGraph;

  // Insert temporary start and end nodes
  const startNode = insertTemporaryNode(
    hpaGraph,
    gameState.navigationGrid,
    startCoords.x,
    startCoords.y,
    entity.leaderId,
  );

  const endNode = insertTemporaryNode(
    hpaGraph,
    gameState.navigationGrid,
    endCoords.x,
    endCoords.y,
    entity.leaderId,
  );

  if (!startNode || !endNode) {
    // Clean up and fall back to simple A*
    if (startNode) removeTemporaryNode(hpaGraph, startNode.id);
    if (endNode) removeTemporaryNode(hpaGraph, endNode.id);
    return findPathSimpleAStar(gameState, start, end, entity);
  }

  // Perform high-level search on abstract graph
  const abstractPath = hpaHighLevelSearch(hpaGraph, startNode.id, endNode.id);

  // Clean up temporary nodes
  removeTemporaryNode(hpaGraph, startNode.id);
  removeTemporaryNode(hpaGraph, endNode.id);

  if (!abstractPath || abstractPath.length === 0) {
    return null;
  }

  // Convert abstract path to world coordinates
  const worldPath = hpaPathToWorldCoords(hpaGraph, abstractPath);

  // Replace the last waypoint with the actual destination
  if (worldPath.length > 0) {
    worldPath[worldPath.length - 1] = end;
  } else {
    worldPath.push(end);
  }

  // Remove starting point if it's too close to current position
  if (worldPath.length > 1) {
    const { width: worldWidth, height: worldHeight } = gameState.mapDimensions;
    const firstDist = calculateWrappedDistance(start, worldPath[0], worldWidth, worldHeight);
    if (firstDist < NAV_GRID_RESOLUTION) {
      worldPath.shift();
    }
  }

  return worldPath.length > 0 ? worldPath : null;
}

/**
 * Simple A* pathfinding (original implementation).
 * Used for short distances where HPA* overhead isn't justified.
 */
function findPathSimpleAStar(
  gameState: GameWorldState,
  start: Vector2D,
  end: Vector2D,
  entity: HumanEntity,
): Vector2D[] | null {
  const { width: worldWidth, height: worldHeight } = gameState.mapDimensions;
  const gridWidth = Math.ceil(worldWidth / NAV_GRID_RESOLUTION);
  const gridHeight = Math.ceil(worldHeight / NAV_GRID_RESOLUTION);

  const startCoords = getNavigationGridCoords(start, worldWidth, worldHeight);
  const endCoords = getNavigationGridCoords(end, worldWidth, worldHeight);

  if (startCoords.x === endCoords.x && startCoords.y === endCoords.y) {
    return [end];
  }

  const grid = gameState.navigationGrid;

  // Simple Priority Queue implementation
  const openSet: number[] = [startCoords.y * gridWidth + startCoords.x];
  const cameFrom = new Map<number, number>();
  const gScore = new Map<number, number>();
  const fScore = new Map<number, number>();

  const startIdx = startCoords.y * gridWidth + startCoords.x;
  gScore.set(startIdx, 0);
  fScore.set(startIdx, toroidalHeuristic(startCoords, endCoords, gridWidth, gridHeight));

  const maxIterations = 2000; // Safety cap
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
      return reconstructPath(cameFrom, currentIdx, gridWidth, end);
    }

    openSet.splice(openSetIdx, 1);

    // Neighbors (8 directions)
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;

        const nx = (curX + dx + gridWidth) % gridWidth;
        const ny = (curY + dy + gridHeight) % gridHeight;
        const neighborIdx = ny * gridWidth + nx;

        // Check passability
        if (!isCellPassable(grid, neighborIdx, entity.leaderId)) {
          continue; // Blocked
        }

        const moveCost = dx !== 0 && dy !== 0 ? 1.414 : 1.0;
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

  return null; // No path found
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
