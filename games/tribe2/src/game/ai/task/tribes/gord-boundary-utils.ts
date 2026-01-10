/**
 * Gord Boundary Tracing Utilities (Simplified Grid-Based)
 *
 * This module provides algorithms for planning defensive enclosures (gords) using
 * a simplified coarse grid based on territory ownership.
 */

import { Vector2D } from '../../../utils/math-types';
import { GameWorldState } from '../../../world-types';
import { EntityId } from '../../../entities/entities-types';
import { TERRITORY_OWNERSHIP_RESOLUTION } from '../../../entities/tribe/territory-consts';
import { BuildingType } from '../../../entities/buildings/building-consts';
import { BuildingEntity } from '../../../entities/buildings/building-types';
import { convertTerritoryIndexToPosition } from '../../../entities/tribe/territory-utils';
import { calculateWrappedDistanceSq } from '../../../utils/math-utils';
import { GORD_GATE_SPACING_PX, GORD_WALL_PROXIMITY_THRESHOLD } from '../../../ai-consts';

export interface GordPlacement {
  position: Vector2D;
  type: BuildingType;
}

/**
 * Identifies all grid cells that are on the interior edge of the tribe's territory.
 * An interior edge cell is an owned cell that has at least one neighbor not owned by the tribe.
 */
export function getInteriorEdgeIndices(leaderId: EntityId, gameState: GameWorldState): Set<number> {
  const { width, height } = gameState.mapDimensions;
  const gridWidth = Math.ceil(width / TERRITORY_OWNERSHIP_RESOLUTION);
  const gridHeight = Math.ceil(height / TERRITORY_OWNERSHIP_RESOLUTION);
  const edgeIndices = new Set<number>();

  const ownership = gameState.terrainOwnership;

  for (let i = 0; i < ownership.length; i++) {
    if (ownership[i] !== leaderId) continue;

    const gx = i % gridWidth;
    const gy = Math.floor(i / gridWidth);

    // Check 4 cardinal neighbors
    const neighbors = [
      { dx: 0, dy: -1 }, // Top
      { dx: 1, dy: 0 }, // Right
      { dx: 0, dy: 1 }, // Bottom
      { dx: -1, dy: 0 }, // Left
    ];

    let isEdge = false;
    for (const { dx, dy } of neighbors) {
      const nx = (gx + dx + gridWidth) % gridWidth;
      const ny = (gy + dy + gridHeight) % gridHeight;
      const nIdx = ny * gridWidth + nx;

      if (ownership[nIdx] !== leaderId) {
        isEdge = true;
        break;
      }
    }

    if (isEdge) {
      edgeIndices.add(i);
    }
  }

  return edgeIndices;
}

/**
 * Organizes a set of edge indices into contiguous chains.
 * This allows for sequential processing (e.g., placing gates at regular intervals).
 */
export function traceEdgeChains(edgeIndices: Set<number>, gridWidth: number, gridHeight: number): number[][] {
  const chains: number[][] = [];
  const visited = new Set<number>();

  // Helper to find an unvisited neighbor in the set
  const findNextNeighbor = (currentIdx: number): number | null => {
    const gx = currentIdx % gridWidth;
    const gy = Math.floor(currentIdx / gridWidth);

    // Check 8 neighbors for continuity (diagonals allowed for smoother chains)
    const neighbors = [
      { dx: 1, dy: 0 },
      { dx: 1, dy: 1 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: -1, dy: -1 },
      { dx: 0, dy: -1 },
      { dx: 1, dy: -1 },
    ];

    for (const { dx, dy } of neighbors) {
      const nx = (gx + dx + gridWidth) % gridWidth;
      const ny = (gy + dy + gridHeight) % gridHeight;
      const nIdx = ny * gridWidth + nx;

      if (edgeIndices.has(nIdx) && !visited.has(nIdx)) {
        return nIdx;
      }
    }
    return null;
  };

  for (const startIdx of edgeIndices) {
    if (visited.has(startIdx)) continue;

    const chain: number[] = [startIdx];
    visited.add(startIdx);

    let current = startIdx;
    let next: number | null;
    while ((next = findNextNeighbor(current)) !== null) {
      chain.push(next);
      visited.add(next);
      current = next;
    }
    chains.push(chain);
  }

  return chains;
}

/**
 * Plans the placement of palisades and gates along the tribe's territory border.
 */
export function planGordPlacement(leaderId: EntityId, gameState: GameWorldState): GordPlacement[] {
  const { width, height } = gameState.mapDimensions;
  const gridWidth = Math.ceil(width / TERRITORY_OWNERSHIP_RESOLUTION);
  const gridHeight = Math.ceil(height / TERRITORY_OWNERSHIP_RESOLUTION);

  const edgeIndices = getInteriorEdgeIndices(leaderId, gameState);
  const chains = traceEdgeChains(edgeIndices, gridWidth, gridHeight);
  const placements: GordPlacement[] = [];

  const gateSpacingCells = Math.ceil(GORD_GATE_SPACING_PX / TERRITORY_OWNERSHIP_RESOLUTION);
  // Gate is 60px wide, resolution is 20px -> 3 cells.
  // We skip 2 extra cells after placing a gate to avoid overlap.
  const gateSkipCells = 2;

  for (const chain of chains) {
    let cellsSinceLastGate = gateSpacingCells; // Start ready for a gate (or offset slightly)

    for (let i = 0; i < chain.length; i++) {
      const idx = chain[i];
      const position = convertTerritoryIndexToPosition(idx, width);

      // Determine if we should place a gate
      if (cellsSinceLastGate >= gateSpacingCells) {
        placements.push({ position, type: BuildingType.Gate });
        cellsSinceLastGate = 0;
        // Skip the next few cells in the chain to account for gate width
        i += gateSkipCells;
      } else {
        placements.push({ position, type: BuildingType.Palisade });
        cellsSinceLastGate++;
      }
    }
  }

  return placements;
}

/**
 * Calculates the percentage of the tribe's perimeter that is currently protected by walls.
 */
export function calculateGordCoverage(
  leaderId: EntityId,
  gameState: GameWorldState,
  existingWalls: BuildingEntity[],
): number {
  const edgeIndices = getInteriorEdgeIndices(leaderId, gameState);
  if (edgeIndices.size === 0) return 1; // No border to protect

  const { width, height } = gameState.mapDimensions;
  let coveredCount = 0;
  const checkDistSq = (GORD_WALL_PROXIMITY_THRESHOLD + 10) ** 2; // Slightly lenient check

  for (const idx of edgeIndices) {
    const pos = convertTerritoryIndexToPosition(idx, width);
    const isCovered = existingWalls.some(
      (wall) => calculateWrappedDistanceSq(pos, wall.position, width, height) < checkDistSq,
    );
    if (isCovered) {
      coveredCount++;
    }
  }

  return coveredCount / edgeIndices.size;
}
