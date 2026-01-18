import { Vector2D } from './math-types';
import { GameWorldState, NavigationGrid } from '../world-types';
import { EntityId } from '../entities/entities-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import { calculateWrappedDistance } from './math-utils';
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
 * Maximum weight assigned to a padding cell.
 * Used to create a gradual penalty field around obstacles.
 */
export const PADDING_MAX_WEIGHT = 100;

// Node status constants for pathfinding
const UNVISITED = 0;
const OPEN = 1;
const CLOSED = 2;

/**
 * Buffer cache for pathfinding to avoid repeated allocations.
 * Keyed by grid size (gridWidth * gridHeight).
 */
interface PathfindingBuffers {
  gScore: Float32Array;
  fScore: Float32Array;
  cameFrom: Int32Array;
  heap: Int32Array;
  nodeStatus: Uint8Array;
  /** List of node indices that were touched and need cleanup */
  touchedNodes: Int32Array;
  /** Number of touched nodes */
  touchedCount: number;
}

const bufferCache = new Map<number, PathfindingBuffers>();

/**
 * Gets or creates reusable buffers for pathfinding.
 */
function getPathfindingBuffers(gridSize: number): PathfindingBuffers {
  let buffers = bufferCache.get(gridSize);
  if (!buffers) {
    buffers = {
      gScore: new Float32Array(gridSize),
      fScore: new Float32Array(gridSize),
      cameFrom: new Int32Array(gridSize),
      heap: new Int32Array(gridSize),
      nodeStatus: new Uint8Array(gridSize),
      touchedNodes: new Int32Array(Math.min(gridSize, 10000)), // Max expected touched nodes
      touchedCount: 0,
    };
    // Initialize arrays with default values (only once at creation)
    buffers.gScore.fill(Infinity);
    buffers.fScore.fill(Infinity);
    buffers.cameFrom.fill(-1);
    bufferCache.set(gridSize, buffers);
  }
  return buffers;
}

/**
 * Resets only the touched nodes in the buffers for efficient cleanup.
 * Falls back to full reset if buffer overflow occurred.
 */
function resetTouchedNodes(buffers: PathfindingBuffers): void {
  // If buffer overflowed, do a full reset
  if (buffers.touchedCount >= buffers.touchedNodes.length) {
    buffers.gScore.fill(Infinity);
    buffers.fScore.fill(Infinity);
    buffers.cameFrom.fill(-1);
    buffers.nodeStatus.fill(UNVISITED);
    buffers.touchedCount = 0;
    return;
  }

  // Otherwise, reset only touched nodes (fast path)
  for (let i = 0; i < buffers.touchedCount; i++) {
    const idx = buffers.touchedNodes[i];
    buffers.gScore[idx] = Infinity;
    buffers.fScore[idx] = Infinity;
    buffers.cameFrom[idx] = -1;
    buffers.nodeStatus[idx] = UNVISITED;
  }
  buffers.touchedCount = 0;
}

/**
 * Marks a node as touched for later cleanup.
 * If buffer is full, falls back to full reset on next pathfinding call.
 */
function markNodeTouched(buffers: PathfindingBuffers, idx: number): void {
  if (buffers.touchedCount < buffers.touchedNodes.length) {
    buffers.touchedNodes[buffers.touchedCount++] = idx;
  }
  // If buffer is full, touchedCount will equal length, triggering full reset
  // in resetTouchedNodes on the next call
}

/**
 * Binary Min-Heap helper: Bubble up a node to maintain heap property.
 */
function heapBubbleUp(heap: Int32Array, fScore: Float32Array, index: number): void {
  while (index > 0) {
    const parentIndex = (index - 1) >> 1; // Bitwise shift for performance
    if (fScore[heap[index]] >= fScore[heap[parentIndex]]) break;

    // Swap
    const temp = heap[index];
    heap[index] = heap[parentIndex];
    heap[parentIndex] = temp;

    index = parentIndex;
  }
}

/**
 * Binary Min-Heap helper: Bubble down a node to maintain heap property.
 */
function heapBubbleDown(heap: Int32Array, heapSize: number, fScore: Float32Array, index: number): void {
  while (index < heapSize) {
    const leftChild = (index << 1) + 1; // Bitwise shift for performance
    const rightChild = (index << 1) + 2;
    let smallest = index;

    if (leftChild < heapSize && fScore[heap[leftChild]] < fScore[heap[smallest]]) {
      smallest = leftChild;
    }
    if (rightChild < heapSize && fScore[heap[rightChild]] < fScore[heap[smallest]]) {
      smallest = rightChild;
    }

    if (smallest === index) break;

    // Swap
    const temp = heap[index];
    heap[index] = heap[smallest];
    heap[smallest] = temp;

    index = smallest;
  }
}

/**
 * Binary Min-Heap: Push a node onto the heap.
 */
function heapPush(heap: Int32Array, heapSize: number, fScore: Float32Array, nodeIdx: number): number {
  heap[heapSize] = nodeIdx;
  heapBubbleUp(heap, fScore, heapSize);
  return heapSize + 1;
}

/**
 * Binary Min-Heap: Pop the minimum node from the heap.
 */
function heapPop(heap: Int32Array, heapSize: number, fScore: Float32Array): { nodeIdx: number; newSize: number } {
  const nodeIdx = heap[0];
  heap[0] = heap[heapSize - 1];
  heapBubbleDown(heap, heapSize - 1, fScore, 0);
  return { nodeIdx, newSize: heapSize - 1 };
}

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

        // Calculate a distance-based weight for padding cells.
        // If inflationRadius is 0, weight is always 1 (physical only).
        // Otherwise, weight decreases as we move away from the physical radius.
        const weight =
          inflationRadius > 0 && !isPhysical
            ? Math.max(1, Math.floor(PADDING_MAX_WEIGHT * (1 - (dist - radius) / inflationRadius)))
            : 1;

        if (isAdding) {
          if (isPhysical) {
            grid.obstacleCount[index]++;
            if (ownerId !== null) grid.gateRefCount[ownerId][index]++;
          } else {
            grid.paddingCount[index] += weight;
            if (ownerId !== null) grid.gatePaddingRefCount[ownerId][index] += weight;
          }
        } else {
          // Removal with safety checks to avoid underflow
          if (isPhysical) {
            if (grid.obstacleCount[index] > 0) grid.obstacleCount[index]--;
            if (ownerId !== null && grid.gateRefCount[ownerId] && grid.gateRefCount[ownerId][index] > 0) {
              grid.gateRefCount[ownerId][index]--;
            }
          } else {
            if (grid.paddingCount[index] >= weight) {
              grid.paddingCount[index] -= weight;
            } else {
              grid.paddingCount[index] = 0;
            }
            if (
              ownerId !== null &&
              grid.gatePaddingRefCount[ownerId] &&
              grid.gatePaddingRefCount[ownerId][index] >= weight
            ) {
              grid.gatePaddingRefCount[ownerId][index] -= weight;
            } else if (ownerId !== null && grid.gatePaddingRefCount[ownerId]) {
              grid.gatePaddingRefCount[ownerId][index] = 0;
            }
          }
        }
      }
    }
  }
}

// Pre-computed inverse resolution for fast division
const INV_NAV_GRID_RESOLUTION = 1 / NAV_GRID_RESOLUTION;
// Pre-allocated grid dimensions cache
let cachedGridWidth = 0;
let cachedWorldWidth = 0;
let cachedWorldHeight = 0;

/**
 * Fast inline grid index calculation without object creation.
 * Avoids the overhead of function call and object destructuring.
 */
function getGridIndexFast(x: number, y: number, worldWidth: number, worldHeight: number, gridWidth: number): number {
  // Fast modulo for positive numbers that might be slightly negative
  let wrappedX = x % worldWidth;
  let wrappedY = y % worldHeight;
  if (wrappedX < 0) wrappedX += worldWidth;
  if (wrappedY < 0) wrappedY += worldHeight;
  
  const gridX = (wrappedX * INV_NAV_GRID_RESOLUTION) | 0; // Fast floor using bitwise OR
  const gridY = (wrappedY * INV_NAV_GRID_RESOLUTION) | 0;
  return gridY * gridWidth + gridX;
}

/**
 * Fast inline passability check without function call overhead.
 */
function isCellPassableFast(grid: NavigationGrid, index: number, leaderId: number | undefined): boolean {
  const count = grid.obstacleCount[index];
  if (count === 0) return true;
  if (leaderId !== undefined) {
    const gateCount = grid.gateRefCount[leaderId]?.[index] || 0;
    return count === gateCount;
  }
  return false;
}

/**
 * Fast check to see if a direct line between two points is blocked.
 * Uses physical-only passability check to allow tight movement.
 * Optimized to avoid object allocations in the hot path.
 */
export function isPathBlocked(gameState: GameWorldState, start: Vector2D, end: Vector2D, entity: HumanEntity): boolean {
  const { width: worldWidth, height: worldHeight } = gameState.mapDimensions;
  
  // Cache grid width calculation
  if (worldWidth !== cachedWorldWidth || worldHeight !== cachedWorldHeight) {
    cachedWorldWidth = worldWidth;
    cachedWorldHeight = worldHeight;
    cachedGridWidth = Math.ceil(worldWidth * INV_NAV_GRID_RESOLUTION);
  }
  const gridWidth = cachedGridWidth;
  
  // Inline direction calculation to avoid function call and object allocation
  let dx = end.x - start.x;
  let dy = end.y - start.y;
  
  // Wrap around horizontally if shorter
  if (dx > worldWidth * 0.5) dx -= worldWidth;
  else if (dx < -worldWidth * 0.5) dx += worldWidth;
  
  // Wrap around vertically if shorter
  if (dy > worldHeight * 0.5) dy -= worldHeight;
  else if (dy < -worldHeight * 0.5) dy += worldHeight;
  
  const distSq = dx * dx + dy * dy;
  if (distSq < 0.000001) return false;
  
  const distance = Math.sqrt(distSq);
  const steps = Math.ceil(distance / (NAV_GRID_RESOLUTION * 0.5));
  const stepX = dx / steps;
  const stepY = dy / steps;
  
  const invDistance = 1 / distance;
  const normX = dx * invDistance;
  const normY = dy * invDistance;
  const perpX = -normY;
  const perpY = normX;
  const lateralOffset = entity.radius * 0.6;
  const halfLateralOffset = lateralOffset * 0.5;
  
  const grid = gameState.navigationGrid;
  const leaderId = entity.leaderId;
  
  // Check points along the path without creating temporary objects
  for (let i = 0; i <= steps; i++) {
    const testX = start.x + stepX * i;
    const testY = start.y + stepY * i;
    
    // Check center point
    if (!isCellPassableFast(grid, getGridIndexFast(testX, testY, worldWidth, worldHeight, gridWidth), leaderId)) {
      return true;
    }
    
    // Check lateral offset points (full offset)
    const offsetX = perpX * lateralOffset;
    const offsetY = perpY * lateralOffset;
    if (!isCellPassableFast(grid, getGridIndexFast(testX + offsetX, testY + offsetY, worldWidth, worldHeight, gridWidth), leaderId)) {
      return true;
    }
    if (!isCellPassableFast(grid, getGridIndexFast(testX - offsetX, testY - offsetY, worldWidth, worldHeight, gridWidth), leaderId)) {
      return true;
    }
    
    // Check lateral offset points (half offset)
    const halfOffsetX = perpX * halfLateralOffset;
    const halfOffsetY = perpY * halfLateralOffset;
    if (!isCellPassableFast(grid, getGridIndexFast(testX + halfOffsetX, testY + halfOffsetY, worldWidth, worldHeight, gridWidth), leaderId)) {
      return true;
    }
    if (!isCellPassableFast(grid, getGridIndexFast(testX - halfOffsetX, testY - halfOffsetY, worldWidth, worldHeight, gridWidth), leaderId)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Finds the nearest cell that is passable.
 * @param usePadding If true, looks for a cell with no padding penalty. If false, looks for any physically passable cell.
 * Spirals out from the given position.
 */
export function findNearestPassableCell(
  grid: NavigationGrid,
  pos: Vector2D,
  worldWidth: number,
  worldHeight: number,
  leaderId?: number,
  usePadding: boolean = true,
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

        if (isCellPassable(grid, index, leaderId, usePadding)) {
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
 * Toroidal A* pathfinding with optimized data structures.
 * Uses a Binary Min-Heap for the open set and typed arrays for all data.
 *
 * Implements "Best Effort" pathfinding:
 * If the target is unreachable (blocked or too far), returns a path to the
 * closest reachable node instead of null.
 */
export function findPath(
  gameState: GameWorldState,
  start: Vector2D,
  end: Vector2D,
  entity: HumanEntity,
): { path: Vector2D[] | null; iterations: number; isBestEffort: boolean } {
  const { width: worldWidth, height: worldHeight } = gameState.mapDimensions;
  const gridWidth = Math.ceil(worldWidth / NAV_GRID_RESOLUTION);
  const gridHeight = Math.ceil(worldHeight / NAV_GRID_RESOLUTION);
  const gridSize = gridWidth * gridHeight;

  const grid = gameState.navigationGrid;

  // Ensure target is actually reachable (not inside a solid object)
  const endIdx = getNavigationGridIndex(end, worldWidth, worldHeight);
  let finalTarget = end;
  if (!isCellPassable(grid, endIdx, entity.leaderId, false)) {
    // When the target is blocked (e.g. inside a tree), find the nearest PHYSICAL cell.
    // We use usePadding: false because interaction ranges are usually tighter
    // than the pathfinding safety padding.
    finalTarget = findNearestPassableCell(grid, end, worldWidth, worldHeight, entity.leaderId, false);
  }

  const startCoords = getNavigationGridCoords(start, worldWidth, worldHeight);
  const endCoords = getNavigationGridCoords(finalTarget, worldWidth, worldHeight);

  if (startCoords.x === endCoords.x && startCoords.y === endCoords.y) {
    // Already in the same grid cell as the target
    // Return the target position so the entity can fine-tune its position
    return { path: [finalTarget], iterations: 0, isBestEffort: false };
  }

  // Get reusable buffers
  const buffers = getPathfindingBuffers(gridSize);
  const { gScore, fScore, cameFrom, heap, nodeStatus } = buffers;

  // Reset only previously touched nodes (much faster than fill for large grids)
  resetTouchedNodes(buffers);

  const startIdx = startCoords.y * gridWidth + startCoords.x;
  gScore[startIdx] = 0;
  const startH = toroidalHeuristic(startCoords, endCoords, gridWidth, gridHeight);
  fScore[startIdx] = startH;
  markNodeTouched(buffers, startIdx);

  // Initialize heap
  let heapSize = 0;
  heapSize = heapPush(heap, heapSize, fScore, startIdx);
  nodeStatus[startIdx] = OPEN;

  const maxIterations = 5000;
  let iterations = 0;

  // Track closest node for best-effort path
  let closestNodeIdx = startIdx;
  let closestNodeHScore = startH;

  while (heapSize > 0 && iterations < maxIterations) {
    iterations++;

    // Get node with lowest fScore
    const popResult = heapPop(heap, heapSize, fScore);
    const currentIdx = popResult.nodeIdx;
    heapSize = popResult.newSize;

    const curX = currentIdx % gridWidth;
    const curY = Math.floor(currentIdx / gridWidth);

    // Update closest node tracking
    const currentH = toroidalHeuristic({ x: curX, y: curY }, endCoords, gridWidth, gridHeight);
    if (currentH < closestNodeHScore) {
      closestNodeHScore = currentH;
      closestNodeIdx = currentIdx;
    }

    // Mark as closed
    nodeStatus[currentIdx] = CLOSED;

    if (curX === endCoords.x && curY === endCoords.y) {
      return {
        path: reconstructPath(cameFrom, currentIdx, gridWidth, finalTarget),
        iterations,
        isBestEffort: false,
      };
    }

    // Neighbors (8 directions)
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;

        const nx = (curX + dx + gridWidth) % gridWidth;
        const ny = (curY + dy + gridHeight) % gridHeight;
        const neighborIdx = ny * gridWidth + nx;

        // Skip if already closed
        if (nodeStatus[neighborIdx] === CLOSED) continue;

        // Hard check: Physical obstacles are strictly impassable
        if (!isCellPassable(grid, neighborIdx, entity.leaderId, false)) {
          continue;
        }

        // Base cost for movement (cardinal vs diagonal)
        let moveCost = dx !== 0 && dy !== 0 ? 1.414 : 1.0;

        // Navigation Field Penalty Model
        const totalPadding = grid.paddingCount[neighborIdx];
        const friendlyGatePadding =
          entity.leaderId !== undefined ? grid.gatePaddingRefCount[entity.leaderId]?.[neighborIdx] || 0 : 0;
        const effectivePadding = Math.max(0, totalPadding - friendlyGatePadding);

        if (effectivePadding > 0) {
          moveCost += 10.0 + effectivePadding * 1.5;
        }

        const tentativeGScore = gScore[currentIdx] + moveCost;

        if (tentativeGScore < gScore[neighborIdx]) {
          // Mark as touched before modifying
          if (nodeStatus[neighborIdx] === UNVISITED) {
            markNodeTouched(buffers, neighborIdx);
          }
          cameFrom[neighborIdx] = currentIdx;
          gScore[neighborIdx] = tentativeGScore;
          fScore[neighborIdx] = tentativeGScore + toroidalHeuristic({ x: nx, y: ny }, endCoords, gridWidth, gridHeight);

          if (nodeStatus[neighborIdx] !== OPEN) {
            heapSize = heapPush(heap, heapSize, fScore, neighborIdx);
            nodeStatus[neighborIdx] = OPEN;
          }
        }
      }
    }
  }

  // Target not reached: Return best effort path to the closest node found
  const closestNodePos = {
    x: (closestNodeIdx % gridWidth) * NAV_GRID_RESOLUTION + NAV_GRID_RESOLUTION / 2,
    y: Math.floor(closestNodeIdx / gridWidth) * NAV_GRID_RESOLUTION + NAV_GRID_RESOLUTION / 2,
  };

  return {
    path: reconstructPath(cameFrom, closestNodeIdx, gridWidth, closestNodePos),
    iterations,
    isBestEffort: true,
  };
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

function reconstructPath(cameFrom: Int32Array, currentIdx: number, gridWidth: number, finalPos: Vector2D): Vector2D[] {
  const path: Vector2D[] = [finalPos];
  let curr = currentIdx;
  const visited = new Set<number>();

  while (cameFrom[curr] !== -1) {
    if (visited.has(curr)) {
      break;
    }
    visited.add(curr);
    curr = cameFrom[curr];
    path.unshift({
      x: (curr % gridWidth) * NAV_GRID_RESOLUTION + NAV_GRID_RESOLUTION / 2,
      y: Math.floor(curr / gridWidth) * NAV_GRID_RESOLUTION + NAV_GRID_RESOLUTION / 2,
    });
  }

  // Remove the starting point (current position of entity)
  // But only if there's more than one point in the path
  if (path.length > 1) {
    path.shift();
  }

  return path;
}
