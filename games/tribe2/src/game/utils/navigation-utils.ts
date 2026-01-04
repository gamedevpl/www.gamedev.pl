/**
 * Navigation utilities for pathfinding and movement.
 * Implements a toroidal A* pathfinder that accounts for world wrapping.
 */

import { Vector2D } from './math-types';
import { GameWorldState } from '../world-types';
import { IndexedWorldState } from '../world-index/world-index-types';
import { BuildingEntity } from '../entities/buildings/building-types';
import {
  PALISADE_GATE_GRID_SIZE,
  doesBuildingBlockMovement,
  canTribeMembersPass,
} from '../entities/buildings/building-consts';
import { EntityId } from '../entities/entities-types';

// Navigation grid resolution (matches territory grid and palisade/gate size)
export const NAVIGATION_GRID_RESOLUTION = PALISADE_GATE_GRID_SIZE;

// Maximum pathfinding iterations to prevent infinite loops
const MAX_PATHFIND_ITERATIONS = 1000;

// Path cache time-to-live in game hours
const PATH_CACHE_TTL = 0.1;

// Maximum pathfinding requests per frame
export const MAX_PATHFIND_REQUESTS_PER_FRAME = 10;

/**
 * Represents a node in the navigation grid.
 */
export interface NavNode {
  x: number;
  y: number;
  g: number; // Cost from start
  h: number; // Heuristic cost to goal
  f: number; // Total cost (g + h)
  parent: NavNode | null;
}

/**
 * Represents a cached path with validity tracking.
 */
export interface CachedPath {
  path: Vector2D[];
  targetPosition: Vector2D;
  computedAt: number;
  entityId: EntityId;
}

// Path cache
const pathCache = new Map<EntityId, CachedPath>();

/**
 * Converts a world position to navigation grid coordinates.
 */
export function worldToNavGrid(position: Vector2D, worldWidth: number, worldHeight: number): { gx: number; gy: number } {
  const gridWidth = Math.ceil(worldWidth / NAVIGATION_GRID_RESOLUTION);
  const gridHeight = Math.ceil(worldHeight / NAVIGATION_GRID_RESOLUTION);

  // Handle wrapping and convert to grid coordinates
  const wrappedX = ((position.x % worldWidth) + worldWidth) % worldWidth;
  const wrappedY = ((position.y % worldHeight) + worldHeight) % worldHeight;

  return {
    gx: Math.floor(wrappedX / NAVIGATION_GRID_RESOLUTION) % gridWidth,
    gy: Math.floor(wrappedY / NAVIGATION_GRID_RESOLUTION) % gridHeight,
  };
}

/**
 * Converts navigation grid coordinates to world position (center of the cell).
 */
export function navGridToWorld(gx: number, gy: number): Vector2D {
  return {
    x: gx * NAVIGATION_GRID_RESOLUTION + NAVIGATION_GRID_RESOLUTION / 2,
    y: gy * NAVIGATION_GRID_RESOLUTION + NAVIGATION_GRID_RESOLUTION / 2,
  };
}

/**
 * Calculates the wrapped distance on a toroidal grid.
 */
function toroidalGridDistance(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  gridWidth: number,
  gridHeight: number,
): number {
  const dx = Math.min(Math.abs(x2 - x1), gridWidth - Math.abs(x2 - x1));
  const dy = Math.min(Math.abs(y2 - y1), gridHeight - Math.abs(y2 - y1));
  // Use Chebyshev distance for 8-directional movement (or Manhattan for 4-directional)
  // Chebyshev allows diagonal movement at same cost as cardinal
  return Math.max(dx, dy);
}

/**
 * Gets the 8 neighbors of a grid cell, accounting for toroidal wrapping.
 */
function getNeighbors(gx: number, gy: number, gridWidth: number, gridHeight: number): { gx: number; gy: number }[] {
  const neighbors: { gx: number; gy: number }[] = [];
  const directions = [
    { dx: 0, dy: -1 }, // N
    { dx: 1, dy: -1 }, // NE
    { dx: 1, dy: 0 }, // E
    { dx: 1, dy: 1 }, // SE
    { dx: 0, dy: 1 }, // S
    { dx: -1, dy: 1 }, // SW
    { dx: -1, dy: 0 }, // W
    { dx: -1, dy: -1 }, // NW
  ];

  for (const { dx, dy } of directions) {
    const nx = ((gx + dx) % gridWidth + gridWidth) % gridWidth;
    const ny = ((gy + dy) % gridHeight + gridHeight) % gridHeight;
    neighbors.push({ gx: nx, gy: ny });
  }

  return neighbors;
}

/**
 * Checks if a grid cell is blocked by a palisade or gate.
 * Returns true if movement is blocked for the given entity.
 */
export function isCellBlocked(
  gx: number,
  gy: number,
  gameState: GameWorldState,
  entityLeaderId?: EntityId,
): boolean {
  const indexedState = gameState as IndexedWorldState;
  const cellCenter = navGridToWorld(gx, gy);

  // Search for buildings in this cell
  const nearbyBuildings = indexedState.search.building.byRadius(cellCenter, NAVIGATION_GRID_RESOLUTION);

  for (const building of nearbyBuildings) {
    if (!building.isConstructed) continue;

    const b = building as BuildingEntity;
    const blocksMovement = doesBuildingBlockMovement(b.buildingType);

    if (!blocksMovement) continue;

    // Check if entity is a tribe member who can pass through gates
    if (canTribeMembersPass(b.buildingType)) {
      // Gates allow passage for tribe members
      if (entityLeaderId !== undefined && b.ownerId !== undefined) {
        // Get the owner's leader ID
        const ownerEntity = gameState.entities.entities[b.ownerId];
        const ownerLeaderId =
          ownerEntity && 'leaderId' in ownerEntity ? (ownerEntity as { leaderId?: EntityId }).leaderId : b.ownerId;

        if (entityLeaderId === ownerLeaderId) {
          continue; // Tribe member can pass through their own gate
        }
      }
    }

    // Check if building overlaps with this cell
    const halfWidth = b.width / 2;
    const halfHeight = b.height / 2;
    const cellHalfSize = NAVIGATION_GRID_RESOLUTION / 2;

    // AABB collision check
    if (
      Math.abs(cellCenter.x - b.position.x) < halfWidth + cellHalfSize &&
      Math.abs(cellCenter.y - b.position.y) < halfHeight + cellHalfSize
    ) {
      return true; // Cell is blocked
    }
  }

  // Also check for trees (standing trees block movement)
  const nearbyTrees = indexedState.search.tree.byRadius(cellCenter, NAVIGATION_GRID_RESOLUTION);
  for (const tree of nearbyTrees) {
    if ('isFelled' in tree && !(tree as { isFelled: boolean }).isFelled) {
      // Standing tree blocks movement
      if (Math.abs(cellCenter.x - tree.position.x) < tree.radius + NAVIGATION_GRID_RESOLUTION / 2 &&
          Math.abs(cellCenter.y - tree.position.y) < tree.radius + NAVIGATION_GRID_RESOLUTION / 2) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Creates a unique key for a nav node position.
 */
function nodeKey(gx: number, gy: number): string {
  return `${gx},${gy}`;
}

/**
 * Toroidal A* pathfinding algorithm.
 * Finds the shortest path from start to goal on a toroidal (wrapping) grid.
 *
 * @param start Starting world position
 * @param goal Goal world position
 * @param gameState Current game state
 * @param entityLeaderId Optional tribe leader ID for gate passage checks
 * @returns Array of world positions forming the path, or null if no path found
 */
export function findPath(
  start: Vector2D,
  goal: Vector2D,
  gameState: GameWorldState,
  entityLeaderId?: EntityId,
): Vector2D[] | null {
  const { width: worldWidth, height: worldHeight } = gameState.mapDimensions;
  const gridWidth = Math.ceil(worldWidth / NAVIGATION_GRID_RESOLUTION);
  const gridHeight = Math.ceil(worldHeight / NAVIGATION_GRID_RESOLUTION);

  const startGrid = worldToNavGrid(start, worldWidth, worldHeight);
  const goalGrid = worldToNavGrid(goal, worldWidth, worldHeight);

  // If start and goal are in the same cell, return direct path
  if (startGrid.gx === goalGrid.gx && startGrid.gy === goalGrid.gy) {
    return [goal];
  }

  // Check if goal is blocked
  if (isCellBlocked(goalGrid.gx, goalGrid.gy, gameState, entityLeaderId)) {
    // Find nearest unblocked cell to goal
    const neighbors = getNeighbors(goalGrid.gx, goalGrid.gy, gridWidth, gridHeight);
    let nearestUnblocked: { gx: number; gy: number } | null = null;
    let minDist = Infinity;

    for (const neighbor of neighbors) {
      if (!isCellBlocked(neighbor.gx, neighbor.gy, gameState, entityLeaderId)) {
        const dist = toroidalGridDistance(startGrid.gx, startGrid.gy, neighbor.gx, neighbor.gy, gridWidth, gridHeight);
        if (dist < minDist) {
          minDist = dist;
          nearestUnblocked = neighbor;
        }
      }
    }

    if (nearestUnblocked) {
      goalGrid.gx = nearestUnblocked.gx;
      goalGrid.gy = nearestUnblocked.gy;
    } else {
      return null; // No accessible cell near goal
    }
  }

  // Initialize A* data structures
  const openSet = new Map<string, NavNode>();
  const closedSet = new Set<string>();

  const startNode: NavNode = {
    x: startGrid.gx,
    y: startGrid.gy,
    g: 0,
    h: toroidalGridDistance(startGrid.gx, startGrid.gy, goalGrid.gx, goalGrid.gy, gridWidth, gridHeight),
    f: 0,
    parent: null,
  };
  startNode.f = startNode.g + startNode.h;

  openSet.set(nodeKey(startNode.x, startNode.y), startNode);

  let iterations = 0;

  while (openSet.size > 0 && iterations < MAX_PATHFIND_ITERATIONS) {
    iterations++;

    // Find node with lowest f score
    let current: NavNode | null = null;
    let lowestF = Infinity;

    for (const node of openSet.values()) {
      if (node.f < lowestF) {
        lowestF = node.f;
        current = node;
      }
    }

    if (!current) break;

    // Check if we reached the goal
    if (current.x === goalGrid.gx && current.y === goalGrid.gy) {
      // Reconstruct path
      const path: Vector2D[] = [];
      let node: NavNode | null = current;

      while (node) {
        path.unshift(navGridToWorld(node.x, node.y));
        node = node.parent;
      }

      // Replace last point with exact goal position
      if (path.length > 0) {
        path[path.length - 1] = goal;
      }

      return path;
    }

    // Move current from open to closed
    openSet.delete(nodeKey(current.x, current.y));
    closedSet.add(nodeKey(current.x, current.y));

    // Explore neighbors
    const neighbors = getNeighbors(current.x, current.y, gridWidth, gridHeight);

    for (const neighbor of neighbors) {
      const neighborKey = nodeKey(neighbor.gx, neighbor.gy);

      // Skip if in closed set
      if (closedSet.has(neighborKey)) continue;

      // Skip if blocked
      if (isCellBlocked(neighbor.gx, neighbor.gy, gameState, entityLeaderId)) {
        closedSet.add(neighborKey); // Mark as visited so we don't check again
        continue;
      }

      // Calculate movement cost (1 for cardinal, ~1.41 for diagonal)
      const isDiagonal = neighbor.gx !== current.x && neighbor.gy !== current.y;
      const moveCost = isDiagonal ? 1.414 : 1;
      const tentativeG = current.g + moveCost;

      const existingNode = openSet.get(neighborKey);

      if (!existingNode) {
        // New node
        const h = toroidalGridDistance(neighbor.gx, neighbor.gy, goalGrid.gx, goalGrid.gy, gridWidth, gridHeight);
        const newNode: NavNode = {
          x: neighbor.gx,
          y: neighbor.gy,
          g: tentativeG,
          h,
          f: tentativeG + h,
          parent: current,
        };
        openSet.set(neighborKey, newNode);
      } else if (tentativeG < existingNode.g) {
        // Found better path to existing node
        existingNode.g = tentativeG;
        existingNode.f = tentativeG + existingNode.h;
        existingNode.parent = current;
      }
    }
  }

  return null; // No path found
}

/**
 * Gets a cached path for an entity, or computes a new one if needed.
 */
export function getCachedPath(
  entityId: EntityId,
  start: Vector2D,
  goal: Vector2D,
  gameState: GameWorldState,
  entityLeaderId?: EntityId,
): Vector2D[] | null {
  const cached = pathCache.get(entityId);

  // Check if cache is valid
  if (cached) {
    const { width: worldWidth, height: worldHeight } = gameState.mapDimensions;

    // Check if target hasn't moved significantly
    const dx = Math.abs(cached.targetPosition.x - goal.x);
    const dy = Math.abs(cached.targetPosition.y - goal.y);
    const wrappedDx = Math.min(dx, worldWidth - dx);
    const wrappedDy = Math.min(dy, worldHeight - dy);

    if (wrappedDx < NAVIGATION_GRID_RESOLUTION && wrappedDy < NAVIGATION_GRID_RESOLUTION) {
      // Check if cache is fresh
      if (gameState.time - cached.computedAt < PATH_CACHE_TTL) {
        return cached.path;
      }
    }
  }

  // Compute new path
  const path = findPath(start, goal, gameState, entityLeaderId);

  if (path) {
    pathCache.set(entityId, {
      path,
      targetPosition: { ...goal },
      computedAt: gameState.time,
      entityId,
    });
  } else {
    // Clear invalid cache
    pathCache.delete(entityId);
  }

  return path;
}

/**
 * Clears the path cache for a specific entity.
 */
export function clearPathCache(entityId: EntityId): void {
  pathCache.delete(entityId);
}

/**
 * Clears all path caches. Call when major obstacles change.
 */
export function clearAllPathCaches(): void {
  pathCache.clear();
}

/**
 * Checks if a direct path between two points is blocked by obstacles.
 */
export function isDirectPathBlocked(
  start: Vector2D,
  goal: Vector2D,
  gameState: GameWorldState,
  entityLeaderId?: EntityId,
): boolean {
  const { width: worldWidth, height: worldHeight } = gameState.mapDimensions;
  const startGrid = worldToNavGrid(start, worldWidth, worldHeight);
  const goalGrid = worldToNavGrid(goal, worldWidth, worldHeight);

  // Use Bresenham-like line algorithm to check cells along the path
  const gridWidth = Math.ceil(worldWidth / NAVIGATION_GRID_RESOLUTION);
  const gridHeight = Math.ceil(worldHeight / NAVIGATION_GRID_RESOLUTION);

  // Calculate wrapped direction
  let dx = goalGrid.gx - startGrid.gx;
  let dy = goalGrid.gy - startGrid.gy;

  // Handle toroidal wrapping - pick shorter path
  if (Math.abs(dx) > gridWidth / 2) {
    dx = dx > 0 ? dx - gridWidth : dx + gridWidth;
  }
  if (Math.abs(dy) > gridHeight / 2) {
    dy = dy > 0 ? dy - gridHeight : dy + gridHeight;
  }

  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  if (steps === 0) return false;

  const stepX = dx / steps;
  const stepY = dy / steps;

  for (let i = 1; i <= steps; i++) {
    const gx = ((Math.round(startGrid.gx + stepX * i) % gridWidth) + gridWidth) % gridWidth;
    const gy = ((Math.round(startGrid.gy + stepY * i) % gridHeight) + gridHeight) % gridHeight;

    if (isCellBlocked(gx, gy, gameState, entityLeaderId)) {
      return true;
    }
  }

  return false;
}
