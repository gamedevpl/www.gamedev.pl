/**
 * Gord Boundary Tracing Utilities (Simplified Grid-Based)
 *
 * This module provides algorithms for planning defensive enclosures (gords) using
 * a simplified coarse grid based on territory ownership.
 */

import { Vector2D } from '../../../utils/math-types';
import { BuildingEntity } from '../../../entities/buildings/building-types';
import { getOwnerOfPoint } from '../../../entities/tribe/territory-utils';
import { GameWorldState } from '../../../world-types';
import { EntityId } from '../../../entities/entities-types';
import { TERRITORY_OWNERSHIP_RESOLUTION } from '../../../entities/tribe/territory-consts';
import { GORD_CELL_OWNERSHIP_THRESHOLD } from '../../../ai-consts';

/**
 * Simplified grid resolution for gord planning in pixels.
 */
export const GORD_GRID_RESOLUTION = 100;

/**
 * Minimum geometric distance between gates in pixels.
 */
export const GORD_MIN_GATE_DISTANCE_PX = 300;

/**
 * Minimum distance from existing walls before placing a new wall segment.
 */
export const GORD_WALL_PROXIMITY_THRESHOLD = 18;

/**
 * Checks if a 100px gord grid cell is fully owned by the tribe.
 * A cell is considered owned if a majority of its constituent territory cells are owned.
 */
export function isGordCellOwned(gx: number, gy: number, leaderId: EntityId, gameState: GameWorldState): boolean {
  const { width, height } = gameState.mapDimensions;
  const gridWidth = Math.ceil(width / GORD_GRID_RESOLUTION);
  const gridHeight = Math.ceil(height / GORD_GRID_RESOLUTION);

  // Wrap coordinates
  const wrappedGX = (gx + gridWidth) % gridWidth;
  const wrappedGY = (gy + gridHeight) % gridHeight;

  const territoryPerGord = GORD_GRID_RESOLUTION / TERRITORY_OWNERSHIP_RESOLUTION;
  const totalSubCells = territoryPerGord * territoryPerGord;
  let ownedCells = 0;

  for (let ty = 0; ty < territoryPerGord; ty++) {
    for (let tx = 0; tx < territoryPerGord; tx++) {
      const worldX =
        wrappedGX * GORD_GRID_RESOLUTION + tx * TERRITORY_OWNERSHIP_RESOLUTION + TERRITORY_OWNERSHIP_RESOLUTION / 2;
      const worldY =
        wrappedGY * GORD_GRID_RESOLUTION + ty * TERRITORY_OWNERSHIP_RESOLUTION + TERRITORY_OWNERSHIP_RESOLUTION / 2;

      if (getOwnerOfPoint(worldX, worldY, gameState) === leaderId) {
        ownedCells++;
      }
    }
  }
  return ownedCells >= totalSubCells * GORD_CELL_OWNERSHIP_THRESHOLD;
}

/**
 * Finds clusters of 100px gord cells that are owned by the tribe and connected to hub buildings.
 */
export function findGordClusters(hubs: BuildingEntity[], leaderId: EntityId, gameState: GameWorldState): Set<number>[] {
  const { width, height } = gameState.mapDimensions;
  const gridWidth = Math.ceil(width / GORD_GRID_RESOLUTION);
  const gridHeight = Math.ceil(height / GORD_GRID_RESOLUTION);

  // Identify cells containing hubs that are also owned
  const hubCells = new Set<number>();
  for (const hub of hubs) {
    const gx = Math.floor(hub.position.x / GORD_GRID_RESOLUTION);
    const gy = Math.floor(hub.position.y / GORD_GRID_RESOLUTION);
    const idx = gy * gridWidth + gx;
    if (isGordCellOwned(gx, gy, leaderId, gameState)) {
      hubCells.add(idx);
    }
  }

  const clusters: Set<number>[] = [];
  const visited = new Set<number>();

  for (const startIdx of hubCells) {
    if (visited.has(startIdx)) continue;

    const cluster = new Set<number>();
    const queue = [startIdx];
    visited.add(startIdx);
    cluster.add(startIdx);

    while (queue.length > 0) {
      const currIdx = queue.shift()!;
      const cx = currIdx % gridWidth;
      const cy = Math.floor(currIdx / gridWidth);

      const neighbors = [
        { dx: 0, dy: -1 },
        { dx: 1, dy: 0 },
        { dx: 0, dy: 1 },
        { dx: -1, dy: 0 },
      ];

      for (const { dx, dy } of neighbors) {
        const nx = (cx + dx + gridWidth) % gridWidth;
        const ny = (cy + dy + gridHeight) % gridHeight;
        const nIdx = ny * gridWidth + nx;

        if (!visited.has(nIdx) && isGordCellOwned(nx, ny, leaderId, gameState)) {
          visited.add(nIdx);
          cluster.add(nIdx);
          queue.push(nIdx);
        }
      }
    }
    clusters.push(cluster);
  }

  return clusters;
}

export interface GordEdge {
  from: Vector2D;
  to: Vector2D;
}

/**
 * Traces the perimeter edges of a cluster of gord cells.
 */
export function traceGordPerimeter(cluster: Set<number>, gridWidth: number, gridHeight: number): GordEdge[] {
  const edges: GordEdge[] = [];

  for (const idx of cluster) {
    const gx = idx % gridWidth;
    const gy = Math.floor(idx / gridWidth);

    const neighbors = [
      { dx: 0, dy: -1, name: 'north' },
      { dx: 1, dy: 0, name: 'east' },
      { dx: 0, dy: 1, name: 'south' },
      { dx: -1, dy: 0, name: 'west' },
    ];

    for (const { dx, dy, name } of neighbors) {
      const nx = (gx + dx + gridWidth) % gridWidth;
      const ny = (gy + dy + gridHeight) % gridHeight;
      const nIdx = ny * gridWidth + nx;

      if (!cluster.has(nIdx)) {
        // This is a boundary edge
        let from: Vector2D, to: Vector2D;
        const x1 = gx * GORD_GRID_RESOLUTION;
        const y1 = gy * GORD_GRID_RESOLUTION;
        const x2 = (gx + 1) * GORD_GRID_RESOLUTION;
        const y2 = (gy + 1) * GORD_GRID_RESOLUTION;

        switch (name) {
          case 'north':
            from = { x: x1, y: y1 };
            to = { x: x2, y: y1 };
            break;
          case 'east':
            from = { x: x2, y: y1 };
            to = { x: x2, y: y2 };
            break;
          case 'south':
            from = { x: x2, y: y2 };
            to = { x: x1, y: y2 };
            break;
          case 'west':
            from = { x: x1, y: y2 };
            to = { x: x1, y: y1 };
            break;
          default:
            continue;
        }
        edges.push({ from, to });
      }
    }
  }

  return edges;
}

/**
 * Assigns gates strategically along the perimeter edges.
 */
export function assignGates(edges: GordEdge[]): Array<{ from: Vector2D; to: Vector2D; isGate: boolean }> {
  if (edges.length === 0) return [];

  // Calculate total perimeter length
  const totalLength = edges.length * GORD_GRID_RESOLUTION;

  // Determine number of gates based on perimeter length
  const numGates = Math.max(1, Math.floor(totalLength / GORD_MIN_GATE_DISTANCE_PX));

  // Calculate step size for even distribution
  const step = edges.length / numGates;

  const result: Array<{ from: Vector2D; to: Vector2D; isGate: boolean }> = [];
  for (let i = 0; i < edges.length; i++) {
    let isGate = false;
    for (let g = 0; g < numGates; g++) {
      if (i === Math.round(g * step)) {
        isGate = true;
        break;
      }
    }

    result.push({
      ...edges[i],
      isGate,
    });
  }

  return result;
}

/**
 * Result of territory border coverage analysis.
 */
export interface BorderCoverageResult {
  /** Total number of border edge segments (100px each) */
  totalBorderEdges: number;
  /** Number of border edge segments that have palisades/gates nearby */
  coveredBorderEdges: number;
  /** Percentage of border that is covered (0-1) */
  coverageRatio: number;
  /** Percentage of border that is NOT covered (0-1) */
  unsurroundedRatio: number;
  /** Total number of cells in the territory */
  totalCells: number;
}

/**
 * Threshold for unsurrounded border percentage above which we should prioritize building palisades
 * instead of expanding territory. If more than 50% of the border is unsurrounded, pause expansion.
 */
export const GORD_UNSURROUNDED_THRESHOLD = 0.5;

/**
 * Minimum number of cells in a territory cluster before we consider surrounding it with palisades.
 * Prevents wasting resources on very small territories.
 */
export const GORD_MIN_CELLS_FOR_SURROUNDING = 6;

/**
 * Distance threshold (in pixels) to consider an existing palisade as covering a border segment.
 * If a palisade is within this distance of a border edge midpoint, the edge is considered covered.
 */
export const GORD_BORDER_COVERAGE_DISTANCE = 40;

/**
 * Calculates the midpoint of a gord edge.
 */
export function getEdgeMidpoint(edge: GordEdge): Vector2D {
  return {
    x: (edge.from.x + edge.to.x) / 2,
    y: (edge.from.y + edge.to.y) / 2,
  };
}

/**
 * Checks if an edge is covered by existing walls (palisades or gates).
 * An edge is considered covered if there's a wall within GORD_BORDER_COVERAGE_DISTANCE
 * of its midpoint.
 */
export function isEdgeCoveredByWalls(
  edge: GordEdge,
  existingWalls: BuildingEntity[],
  worldWidth: number,
  worldHeight: number,
): boolean {
  const midpoint = getEdgeMidpoint(edge);
  const thresholdSq = GORD_BORDER_COVERAGE_DISTANCE * GORD_BORDER_COVERAGE_DISTANCE;

  for (const wall of existingWalls) {
    const dx = Math.min(Math.abs(midpoint.x - wall.position.x), worldWidth - Math.abs(midpoint.x - wall.position.x));
    const dy = Math.min(Math.abs(midpoint.y - wall.position.y), worldHeight - Math.abs(midpoint.y - wall.position.y));
    const distSq = dx * dx + dy * dy;

    if (distSq < thresholdSq) {
      return true;
    }
  }
  return false;
}

/**
 * Analyzes the border coverage of a territory cluster.
 * Returns statistics about how much of the border is already surrounded by palisades/gates.
 */
export function analyzeBorderCoverage(
  cluster: Set<number>,
  existingWalls: BuildingEntity[],
  gridWidth: number,
  gridHeight: number,
  worldWidth: number,
  worldHeight: number,
): BorderCoverageResult {
  const edges = traceGordPerimeter(cluster, gridWidth, gridHeight);
  const totalBorderEdges = edges.length;

  if (totalBorderEdges === 0) {
    return {
      totalBorderEdges: 0,
      coveredBorderEdges: 0,
      coverageRatio: 1, // Fully covered (no border = no need to cover)
      unsurroundedRatio: 0,
      totalCells: cluster.size,
    };
  }

  let coveredBorderEdges = 0;
  for (const edge of edges) {
    if (isEdgeCoveredByWalls(edge, existingWalls, worldWidth, worldHeight)) {
      coveredBorderEdges++;
    }
  }

  const coverageRatio = coveredBorderEdges / totalBorderEdges;

  return {
    totalBorderEdges,
    coveredBorderEdges,
    coverageRatio,
    unsurroundedRatio: 1 - coverageRatio,
    totalCells: cluster.size,
  };
}

/**
 * Filters out edges that are already covered by existing walls.
 * This allows reuse of existing palisades when planning a gord.
 */
export function filterUncoveredEdges(
  edges: GordEdge[],
  existingWalls: BuildingEntity[],
  worldWidth: number,
  worldHeight: number,
): GordEdge[] {
  return edges.filter((edge) => !isEdgeCoveredByWalls(edge, existingWalls, worldWidth, worldHeight));
}

/**
 * Checks if territory expansion should be paused in favor of building palisades.
 * Returns true if the unsurrounded border percentage is above the threshold
 * and the territory is large enough to warrant surrounding.
 */
export function shouldPauseExpansionForPalisades(
  cluster: Set<number>,
  existingWalls: BuildingEntity[],
  gridWidth: number,
  gridHeight: number,
  worldWidth: number,
  worldHeight: number,
): boolean {
  // Don't pause for very small territories
  if (cluster.size < GORD_MIN_CELLS_FOR_SURROUNDING) {
    return false;
  }

  const coverage = analyzeBorderCoverage(cluster, existingWalls, gridWidth, gridHeight, worldWidth, worldHeight);

  // Pause expansion if more than threshold of the border is unsurrounded
  return coverage.unsurroundedRatio > GORD_UNSURROUNDED_THRESHOLD;
}
