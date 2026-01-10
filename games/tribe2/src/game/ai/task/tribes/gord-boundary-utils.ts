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
import {
  GORD_CELL_OWNERSHIP_THRESHOLD,
  GORD_MAX_GATES_COUNT,
  GORD_GATE_SPACING_PX,
} from '../../../ai-consts';
import { calculateWrappedDistanceSq } from '../../../utils/math-utils';

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
export const GORD_WALL_PROXIMITY_THRESHOLD = 40;

export interface GordEdge {
  from: Vector2D;
  to: Vector2D;
  isProtected?: boolean;
}

export interface ProtectionStats {
  protectedCount: number;
  totalCount: number;
  protectedPercentage: number;
}

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
 * Returns all 100px grid cell indices owned by the tribe.
 */
export function getAllOwnedGordCells(leaderId: EntityId, gameState: GameWorldState): Set<number> {
  const { width, height } = gameState.mapDimensions;
  const gridWidth = Math.ceil(width / GORD_GRID_RESOLUTION);
  const gridHeight = Math.ceil(height / GORD_GRID_RESOLUTION);
  const ownedCells = new Set<number>();

  for (let gy = 0; gy < gridHeight; gy++) {
    for (let gx = 0; gx < gridWidth; gx++) {
      if (isGordCellOwned(gx, gy, leaderId, gameState)) {
        ownedCells.add(gy * gridWidth + gx);
      }
    }
  }
  return ownedCells;
}

/**
 * Traces the perimeter edges of all owned gord cells.
 */
export function getTribePerimeterEdges(ownedCells: Set<number>, gridWidth: number, gridHeight: number): GordEdge[] {
  const edges: GordEdge[] = [];

  for (const idx of ownedCells) {
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

      if (!ownedCells.has(nIdx)) {
        // This is a boundary edge
        const x1 = gx * GORD_GRID_RESOLUTION;
        const y1 = gy * GORD_GRID_RESOLUTION;
        const x2 = (gx + 1) * GORD_GRID_RESOLUTION;
        const y2 = (gy + 1) * GORD_GRID_RESOLUTION;

        let from: Vector2D, to: Vector2D;
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
 * Checks if a perimeter segment already has a wall within GORD_WALL_PROXIMITY_THRESHOLD.
 */
export function checkSegmentProtection(
  edge: GordEdge,
  existingWalls: BuildingEntity[],
  worldWidth: number,
  worldHeight: number,
): boolean {
  // Check the midpoint of the edge for existing walls
  const midX = (edge.from.x + edge.to.x) / 2;
  const midY = (edge.from.y + edge.to.y) / 2;
  const midpoint = { x: midX, y: midY };

  return existingWalls.some(
    (wall) =>
      calculateWrappedDistanceSq(midpoint, wall.position, worldWidth, worldHeight) <
      GORD_WALL_PROXIMITY_THRESHOLD * GORD_WALL_PROXIMITY_THRESHOLD,
  );
}

/**
 * Calculates protection statistics for the tribe perimeter.
 */
export function calculateProtectionStats(
  edges: GordEdge[],
  existingWalls: BuildingEntity[],
  worldWidth: number,
  worldHeight: number,
): ProtectionStats {
  let protectedCount = 0;
  for (const edge of edges) {
    if (checkSegmentProtection(edge, existingWalls, worldWidth, worldHeight)) {
      edge.isProtected = true;
      protectedCount++;
    } else {
      edge.isProtected = false;
    }
  }

  return {
    protectedCount,
    totalCount: edges.length,
    protectedPercentage: edges.length > 0 ? protectedCount / edges.length : 1,
  };
}

/**
 * Assigns gates strategically along the unprotected perimeter edges.
 * Prefers straight segments and avoids corners.
 */
export function assignGates(
  edges: GordEdge[],
): Array<{ from: Vector2D; to: Vector2D; isGate: boolean; isProtected?: boolean }> {
  if (edges.length === 0) return [];

  // Identify orientations and build vertex map to detect corners
  const vertexMap = new Map<string, { isHorizontal: boolean }[]>();
  const getVKey = (v: Vector2D) => `${Math.round(v.x)},${Math.round(v.y)}`;

  edges.forEach((edge) => {
    const isH = Math.abs(edge.from.y - edge.to.y) < 1;
    const v1 = getVKey(edge.from);
    const v2 = getVKey(edge.to);

    if (!vertexMap.has(v1)) vertexMap.set(v1, []);
    if (!vertexMap.has(v2)) vertexMap.set(v2, []);

    vertexMap.get(v1)!.push({ isHorizontal: isH });
    vertexMap.get(v2)!.push({ isHorizontal: isH });
  });

  // Identify straight edges (both vertices connect to collinear edges)
  const straightEdges = edges.filter((edge) => {
    const isH = Math.abs(edge.from.y - edge.to.y) < 1;
    const v1 = getVKey(edge.from);
    const v2 = getVKey(edge.to);

    const isStraightVertex = (vKey: string) => {
      const connections = vertexMap.get(vKey) || [];
      // A vertex on a simple perimeter usually has 2 edges.
      // It's "straight" if both edges have the same orientation.
      return connections.length === 2 && connections.every((c) => c.isHorizontal === isH);
    };

    return isStraightVertex(v1) && isStraightVertex(v2);
  });

  // Identify unprotected edges
  const unprotectedEdges = edges.filter((e) => !e.isProtected);
  if (unprotectedEdges.length === 0) {
    return edges.map((e) => ({ ...e, isGate: false }));
  }

  // Filter unprotected edges to only straight ones if possible (avoid corners)
  const unprotectedStraightEdges = straightEdges.filter((e) => !e.isProtected);
  const gateCandidates = unprotectedStraightEdges.length > 0 ? unprotectedStraightEdges : unprotectedEdges;

  const totalUnprotectedLength = unprotectedEdges.length * GORD_GRID_RESOLUTION;

  // Determine number of gates based on unprotected length and spacing
  const desiredGates = Math.floor(totalUnprotectedLength / GORD_GATE_SPACING_PX);
  const numGates = Math.min(GORD_MAX_GATES_COUNT, Math.max(1, desiredGates));

  // Calculate step size for distribution among candidates
  const step = gateCandidates.length / numGates;

  return edges.map((edge) => {
    let isGate = false;
    if (!edge.isProtected) {
      const candidateIdx = gateCandidates.indexOf(edge);
      if (candidateIdx !== -1) {
        for (let g = 0; g < numGates; g++) {
          if (candidateIdx === Math.round(g * step)) {
            isGate = true;
            break;
          }
        }
      }
    }
    return {
      ...edge,
      isGate,
    };
  });
}
