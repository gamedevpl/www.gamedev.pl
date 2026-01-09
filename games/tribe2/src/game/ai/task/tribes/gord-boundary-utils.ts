/**
 * Gord Boundary Tracing Utilities
 *
 * This module provides algorithms for planning defensive enclosures (gords) around
 * hub buildings using grid-based influence maps and boundary tracing.
 */

import { Vector2D } from '../../../utils/math-types';
import { BuildingEntity, BuildingType } from '../../../entities/buildings/building-types';
import { calculateWrappedDistance, calculateWrappedDistanceSq } from '../../../utils/math-utils';
import { NAV_GRID_RESOLUTION } from '../../../utils/navigation-utils';
import { getOwnerOfPoint } from '../../../entities/tribe/territory-utils';
import { GameWorldState } from '../../../world-types';
import { EntityId } from '../../../entities/entities-types';

/**
 * Radius around hub buildings to mark as "safe zone" / interior of the gord.
 */
export const GORD_SAFE_RADIUS = 80;

/**
 * Radius within which hubs are grouped into a single cluster.
 * Hubs within this distance will share a single gord boundary.
 */
export const GORD_HUB_CLUSTER_RADIUS = 200;

/**
 * Minimum distance from existing walls before placing a new wall segment.
 */
export const GORD_WALL_PROXIMITY_THRESHOLD = 15;

/**
 * Default spacing between gate segments along the perimeter (in segments).
 */
export const GORD_DEFAULT_GATE_SPACING = 100;

/**
 * Minimum geometric distance between gates in pixels.
 */
export const GORD_MIN_GATE_DISTANCE_PX = 300;

/**
 * Groups hubs that are close together into clusters.
 * Hubs within clusterRadius of each other will share a single gord boundary.
 * Uses a union-find approach to efficiently group connected hubs.
 */
export function clusterHubs(
  hubs: BuildingEntity[],
  clusterRadius: number,
  worldWidth: number,
  worldHeight: number,
): BuildingEntity[][] {
  if (hubs.length === 0) return [];
  if (hubs.length === 1) return [hubs];

  const clusterRadiusSq = clusterRadius * clusterRadius;

  // Union-Find data structure
  const parent: number[] = [];
  for (let i = 0; i < hubs.length; i++) {
    parent[i] = i;
  }

  const find = (i: number): number => {
    if (parent[i] !== i) {
      parent[i] = find(parent[i]); // Path compression
    }
    return parent[i];
  };

  const union = (i: number, j: number) => {
    const rootI = find(i);
    const rootJ = find(j);
    if (rootI !== rootJ) {
      parent[rootJ] = rootI;
    }
  };

  // Find all pairs of hubs within clusterRadius and union them
  for (let i = 0; i < hubs.length; i++) {
    for (let j = i + 1; j < hubs.length; j++) {
      const distSq = calculateWrappedDistanceSq(hubs[i].position, hubs[j].position, worldWidth, worldHeight);
      if (distSq <= clusterRadiusSq) {
        union(i, j);
      }
    }
  }

  // Group hubs by their root parent
  const clusterMap = new Map<number, BuildingEntity[]>();
  for (let i = 0; i < hubs.length; i++) {
    const root = find(i);
    if (!clusterMap.has(root)) {
      clusterMap.set(root, []);
    }
    clusterMap.get(root)!.push(hubs[i]);
  }

  return Array.from(clusterMap.values());
}

/**
 * Creates a grid-based influence map marking cells within safe radius of any hub building.
 * Optimized using bounding boxes for hubs.
 */
export function createInfluenceMap(
  hubs: BuildingEntity[],
  worldWidth: number,
  worldHeight: number,
  safeRadius: number,
): boolean[] {
  const gridWidth = Math.ceil(worldWidth / NAV_GRID_RESOLUTION);
  const gridHeight = Math.ceil(worldHeight / NAV_GRID_RESOLUTION);
  const gridSize = gridWidth * gridHeight;

  const influenceMap = new Array(gridSize).fill(false);
  const safeRadiusSq = safeRadius * safeRadius;

  for (const hub of hubs) {
    // Optimization: only check cells within bounding box of the hub influence
    const minGX = Math.floor((hub.position.x - safeRadius) / NAV_GRID_RESOLUTION);
    const maxGX = Math.ceil((hub.position.x + safeRadius) / NAV_GRID_RESOLUTION);
    const minGY = Math.floor((hub.position.y - safeRadius) / NAV_GRID_RESOLUTION);
    const maxGY = Math.ceil((hub.position.y + safeRadius) / NAV_GRID_RESOLUTION);

    for (let gy = minGY; gy <= maxGY; gy++) {
      for (let gx = minGX; gx <= maxGX; gx++) {
        const wrappedGX = (gx + gridWidth) % gridWidth;
        const wrappedGY = (gy + gridHeight) % gridHeight;
        const index = wrappedGY * gridWidth + wrappedGX;

        if (influenceMap[index]) continue;

        const cellCenterX = wrappedGX * NAV_GRID_RESOLUTION + NAV_GRID_RESOLUTION / 2;
        const cellCenterY = wrappedGY * NAV_GRID_RESOLUTION + NAV_GRID_RESOLUTION / 2;

        const distSq = calculateWrappedDistanceSq(
          { x: cellCenterX, y: cellCenterY },
          hub.position,
          worldWidth,
          worldHeight,
        );
        if (distSq <= safeRadiusSq) {
          influenceMap[index] = true;
        }
      }
    }
  }

  return influenceMap;
}

/**
 * Calculates the signed area of a perimeter loop using the Shoelace formula.
 * Handles toroidal world wrapping by unwrapping coordinates relative to the first point.
 * Positive = Clockwise (Outer boundary), Negative = Counter-clockwise (Hole).
 */
export function calculateSignedArea(perimeter: Vector2D[], worldWidth: number, worldHeight: number): number {
  if (perimeter.length < 3) return 0;

  // Unwrap coordinates to a continuous space to handle world wrapping
  const unwrapped: Vector2D[] = [perimeter[0]];
  for (let i = 1; i < perimeter.length; i++) {
    let dx = perimeter[i].x - perimeter[i - 1].x;
    let dy = perimeter[i].y - perimeter[i - 1].y;

    // Detect and handle toroidal jumps
    if (dx > worldWidth / 2) dx -= worldWidth;
    else if (dx < -worldWidth / 2) dx += worldWidth;
    if (dy > worldHeight / 2) dy -= worldHeight;
    else if (dy < -worldHeight / 2) dy += worldHeight;

    unwrapped.push({
      x: unwrapped[i - 1].x + dx,
      y: unwrapped[i - 1].y + dy,
    });
  }

  // Shoelace formula for signed area
  let area = 0;
  for (let i = 0; i < unwrapped.length; i++) {
    const p1 = unwrapped[i];
    const p2 = unwrapped[(i + 1) % unwrapped.length];
    area += p1.x * p2.y - p2.x * p1.y;
  }

  return area / 2;
}

/**
 * Traces all perimeter loops in an influence map to find multiple boundary regions.
 * Filters out internal holes to ensure only outer boundaries are returned.
 */
export function traceAllPerimeters(influenceMap: boolean[], gridWidth: number, gridHeight: number): Vector2D[][] {
  const boundaryCells: Array<{ x: number; y: number }> = [];
  const boundarySet = new Set<string>();

  for (let gy = 0; gy < gridHeight; gy++) {
    for (let gx = 0; gx < gridWidth; gx++) {
      const index = gy * gridWidth + gx;
      if (!influenceMap[index]) continue;

      let isBoundary = false;
      const neighbors = [
        { dx: 0, dy: -1 },
        { dx: 1, dy: 0 },
        { dx: 0, dy: 1 },
        { dx: -1, dy: 0 },
      ];

      for (const { dx, dy } of neighbors) {
        const nx = (gx + dx + gridWidth) % gridWidth;
        const ny = (gy + dy + gridHeight) % gridHeight;
        if (!influenceMap[ny * gridWidth + nx]) {
          isBoundary = true;
          break;
        }
      }

      if (isBoundary) {
        boundaryCells.push({ x: gx, y: gy });
        boundarySet.add(`${gx},${gy}`);
      }
    }
  }

  if (boundaryCells.length === 0) return [];

  const perimeters: Vector2D[][] = [];
  const globalVisited = new Set<string>();
  const worldWidth = gridWidth * NAV_GRID_RESOLUTION;
  const worldHeight = gridHeight * NAV_GRID_RESOLUTION;

  // 8-directional neighbors for boundary tracing (includes diagonals)
  const directions8 = [
    { dx: 0, dy: -1 }, // N
    { dx: 1, dy: -1 }, // NE
    { dx: 1, dy: 0 }, // E
    { dx: 1, dy: 1 }, // SE
    { dx: 0, dy: 1 }, // S
    { dx: -1, dy: 1 }, // SW
    { dx: -1, dy: 0 }, // W
    { dx: -1, dy: -1 }, // NW
  ];

  // Process all boundary cells to find all disconnected loops
  for (const startCell of boundaryCells) {
    if (globalVisited.has(`${startCell.x},${startCell.y}`)) continue;

    const perimeter: Vector2D[] = [];
    let currentX = startCell.x;
    let currentY = startCell.y;
    let direction = 2; // Start facing East

    let iterations = 0;
    const maxIterations = gridWidth * gridHeight;

    // Turn range covers all 8 directions starting from left of current direction
    const TURN_START = -2;
    const TURN_END = 5;

    do {
      perimeter.push({
        x: currentX * NAV_GRID_RESOLUTION + NAV_GRID_RESOLUTION / 2,
        y: currentY * NAV_GRID_RESOLUTION + NAV_GRID_RESOLUTION / 2,
      });
      globalVisited.add(`${currentX},${currentY}`);

      let moved = false;
      // Try directions starting from left of current direction, going clockwise
      // This implements a "keep left wall" tracing algorithm
      for (let turn = TURN_START; turn <= TURN_END; turn++) {
        const newDir = (direction + turn + 8) % 8;
        const nextX = (currentX + directions8[newDir].dx + gridWidth) % gridWidth;
        const nextY = (currentY + directions8[newDir].dy + gridHeight) % gridHeight;
        // Only move to cells that are on the boundary
        if (boundarySet.has(`${nextX},${nextY}`) && !globalVisited.has(`${nextX},${nextY}`)) {
          currentX = nextX;
          currentY = nextY;
          direction = newDir;
          moved = true;
          break;
        }
      }

      // If we couldn't move to an unvisited cell, check if we can return to start to complete the loop
      if (!moved) {
        for (let turn = TURN_START; turn <= TURN_END; turn++) {
          const newDir = (direction + turn + 8) % 8;
          const nextX = (currentX + directions8[newDir].dx + gridWidth) % gridWidth;
          const nextY = (currentY + directions8[newDir].dy + gridHeight) % gridHeight;
          if (nextX === startCell.x && nextY === startCell.y) {
            // Loop is complete - adjacent to start cell
            break;
          }
        }
        break; // Exit the main loop
      }

      iterations++;
    } while ((currentX !== startCell.x || currentY !== startCell.y) && iterations < maxIterations);

    if (perimeter.length > 2) {
      // Filter out holes (negative area loops) to keep only outer boundaries
      if (calculateSignedArea(perimeter, worldWidth, worldHeight) > 0) {
        perimeters.push(perimeter);
      }
    }
  }

  return perimeters;
}

export function tracePerimeter(influenceMap: boolean[], gridWidth: number, gridHeight: number): Vector2D[] {
  const all = traceAllPerimeters(influenceMap, gridWidth, gridHeight);
  return all.length > 0 ? all[0] : [];
}

export function filterPerimeterByTerritory(
  positions: Vector2D[],
  leaderId: EntityId,
  gameState: GameWorldState,
): Vector2D[] {
  return positions.filter((pos) => getOwnerOfPoint(pos.x, pos.y, gameState) === leaderId);
}

export function filterPerimeterByExistingWalls(
  positions: Vector2D[],
  existingBuildings: BuildingEntity[],
  worldWidth: number,
  worldHeight: number,
  proximityThreshold: number,
): Vector2D[] {
  const walls = existingBuildings.filter(
    (b) => b.buildingType === BuildingType.Palisade || b.buildingType === BuildingType.Gate,
  );
  if (walls.length === 0) return positions;

  return positions.filter((pos) => {
    for (const wall of walls) {
      if (calculateWrappedDistance(pos, wall.position, worldWidth, worldHeight) < proximityThreshold) return false;
    }
    return true;
  });
}

/**
 * Assigns gates strategically along the perimeter loop using even distribution.
 * Gates are placed at regular intervals to ensure they are far apart and evenly spaced.
 */
export function assignGates(
  positions: Vector2D[],
  tribeCenter: Vector2D,
  worldWidth: number,
  worldHeight: number,
): Array<{ position: Vector2D; isGate: boolean }> {
  if (positions.length === 0) return [];

  // Calculate total perimeter length
  let perimeterLength = 0;
  for (let i = 0; i < positions.length; i++) {
    const p1 = positions[i];
    const p2 = positions[(i + 1) % positions.length];
    perimeterLength += calculateWrappedDistance(p1, p2, worldWidth, worldHeight);
  }

  // Determine optimal number of gates based on perimeter length
  const numGates = Math.max(1, Math.floor(perimeterLength / GORD_MIN_GATE_DISTANCE_PX));

  // Find the position closest to tribe center (this will be the first gate)
  let closestIndex = 0;
  let minDistSq = Infinity;
  for (let i = 0; i < positions.length; i++) {
    const distSq = calculateWrappedDistanceSq(positions[i], tribeCenter, worldWidth, worldHeight);
    if (distSq < minDistSq) {
      minDistSq = distSq;
      closestIndex = i;
    }
  }

  // Rotate array so closest position is at index 0
  const rotated = [...positions.slice(closestIndex), ...positions.slice(0, closestIndex)];

  // Calculate step size for even distribution
  const step = positions.length / numGates;

  // Mark gate positions
  const result: Array<{ position: Vector2D; isGate: boolean }> = [];
  for (let i = 0; i < rotated.length; i++) {
    // A position is a gate if it's close to any of the evenly distributed indices
    let isGate = false;
    for (let g = 0; g < numGates; g++) {
      const gateIndex = Math.round(g * step);
      if (i === gateIndex) {
        isGate = true;
        break;
      }
    }

    result.push({
      position: rotated[i],
      isGate,
    });
  }

  return result;
}
