import { describe, it, expect } from 'vitest';
import {
  isGordCellOwned,
  findGordClusters,
  traceGordPerimeter,
  assignGates,
  analyzeBorderCoverage,
  filterUncoveredEdges,
  shouldPauseExpansionForPalisades,
  getEdgeMidpoint,
  isEdgeCoveredByWalls,
  GordEdge,
  GORD_MIN_CELLS_FOR_SURROUNDING,
  GORD_BORDER_COVERAGE_DISTANCE,
} from './gord-boundary-utils';
import { BuildingType, BUILDING_DEFINITIONS } from '../../../entities/buildings/building-consts';
import { BuildingEntity } from '../../../entities/buildings/building-types';
import { GameWorldState } from '../../../world-types';
import { TERRITORY_OWNERSHIP_RESOLUTION } from '../../../entities/tribe/territory-consts';

/**
 * Creates a minimal mock game state for testing gord boundary utilities.
 */
function createMockState(
  width: number,
  height: number,
  ownedCells: number[], // Array of territory grid indices that are owned by leader 1
): GameWorldState {
  const gridWidth = Math.ceil(width / TERRITORY_OWNERSHIP_RESOLUTION);
  const gridHeight = Math.ceil(height / TERRITORY_OWNERSHIP_RESOLUTION);
  const terrainOwnership: (number | null)[] = new Array(gridWidth * gridHeight).fill(null);

  for (const idx of ownedCells) {
    if (idx >= 0 && idx < terrainOwnership.length) {
      terrainOwnership[idx] = 1; // Owner ID 1
    }
  }

  return {
    mapDimensions: { width, height },
    terrainOwnership,
    entities: { entities: {} },
    time: 0,
  } as unknown as GameWorldState;
}

/**
 * Creates a mock building entity for testing.
 */
function createMockBuilding(
  id: number,
  buildingType: BuildingType,
  x: number,
  y: number,
  ownerId: number = 1,
): BuildingEntity {
  const definition = BUILDING_DEFINITIONS[buildingType];
  return {
    id,
    type: 'building',
    buildingType,
    position: { x, y },
    ownerId,
    width: definition.dimensions.width,
    height: definition.dimensions.height,
    radius: Math.max(definition.dimensions.width, definition.dimensions.height) / 2,
  } as BuildingEntity;
}

/**
 * Generate territory indices for a square region in the territory grid.
 * The territory grid has 20px cells.
 */
function generateTerritoryIndices(
  startX: number,
  startY: number,
  sizeX: number,
  sizeY: number,
  worldWidth: number,
): number[] {
  const gridWidth = Math.ceil(worldWidth / TERRITORY_OWNERSHIP_RESOLUTION);
  const indices: number[] = [];

  for (let dy = 0; dy < sizeY; dy++) {
    for (let dx = 0; dx < sizeX; dx++) {
      const gx = Math.floor(startX / TERRITORY_OWNERSHIP_RESOLUTION) + dx;
      const gy = Math.floor(startY / TERRITORY_OWNERSHIP_RESOLUTION) + dy;
      indices.push(gy * gridWidth + gx);
    }
  }
  return indices;
}

describe('Gord Boundary Utilities', () => {
  describe('isGordCellOwned', () => {
    it('should return true when a gord cell is fully owned', () => {
      const width = 800;
      const height = 600;
      // Fill an entire 100px gord cell (which contains 5x5 = 25 territory cells at 20px each)
      const ownedCells = generateTerritoryIndices(0, 0, 5, 5, width);
      const gameState = createMockState(width, height, ownedCells);

      expect(isGordCellOwned(0, 0, 1, gameState)).toBe(true);
    });

    it('should return false when a gord cell is not owned', () => {
      const width = 800;
      const height = 600;
      const gameState = createMockState(width, height, []);

      expect(isGordCellOwned(0, 0, 1, gameState)).toBe(false);
    });

    it('should return true when a gord cell meets the ownership threshold', () => {
      const width = 800;
      const height = 600;
      // Own 13 out of 25 cells (52%) - should pass with 50% threshold
      const ownedCells = generateTerritoryIndices(0, 0, 5, 2, width).concat(
        generateTerritoryIndices(0, 40, 3, 1, width),
      );
      const gameState = createMockState(width, height, ownedCells);

      expect(isGordCellOwned(0, 0, 1, gameState)).toBe(true);
    });
  });

  describe('findGordClusters', () => {
    it('should find a single cluster containing all connected hub cells', () => {
      const width = 800;
      const height = 600;
      // Create a 3x3 gord cell region (300x300 px) filled with territory
      const ownedCells = generateTerritoryIndices(0, 0, 15, 15, width);
      const gameState = createMockState(width, height, ownedCells);

      const hub = createMockBuilding(1, BuildingType.Bonfire, 50, 50);
      const clusters = findGordClusters([hub], 1, gameState);

      expect(clusters.length).toBe(1);
      expect(clusters[0].size).toBeGreaterThanOrEqual(4);
    });

    it('should return empty clusters when there are no hubs', () => {
      const width = 800;
      const height = 600;
      const ownedCells = generateTerritoryIndices(0, 0, 10, 10, width);
      const gameState = createMockState(width, height, ownedCells);

      const clusters = findGordClusters([], 1, gameState);

      expect(clusters.length).toBe(0);
    });
  });

  describe('traceGordPerimeter', () => {
    it('should trace the perimeter edges of a square cluster', () => {
      // Create a 2x2 cluster (cells at indices 0, 1, gridWidth, gridWidth+1)
      const gridWidth = 8;
      const gridHeight = 6;
      const cluster = new Set([0, 1, gridWidth, gridWidth + 1]);

      const edges = traceGordPerimeter(cluster, gridWidth, gridHeight);

      // A 2x2 cluster should have 8 boundary edges (4 sides * 2 cells each = 8 exposed edges)
      expect(edges.length).toBe(8);
    });

    it('should return no edges for an empty cluster', () => {
      const edges = traceGordPerimeter(new Set(), 10, 10);
      expect(edges.length).toBe(0);
    });
  });

  describe('assignGates', () => {
    it('should assign at least one gate for small perimeters', () => {
      const edges: GordEdge[] = [
        { from: { x: 0, y: 0 }, to: { x: 100, y: 0 } },
        { from: { x: 100, y: 0 }, to: { x: 100, y: 100 } },
      ];

      const result = assignGates(edges);

      expect(result.some((e) => e.isGate)).toBe(true);
    });

    it('should return empty array for no edges', () => {
      const result = assignGates([]);
      expect(result.length).toBe(0);
    });

    it('should distribute gates evenly based on perimeter length', () => {
      // 6 edges at 100px each = 600px perimeter
      // With 300px min gate distance, we should get ~2 gates
      const edges: GordEdge[] = [];
      for (let i = 0; i < 6; i++) {
        edges.push({
          from: { x: i * 100, y: 0 },
          to: { x: (i + 1) * 100, y: 0 },
        });
      }

      const result = assignGates(edges);
      const gateCount = result.filter((e) => e.isGate).length;

      expect(gateCount).toBeGreaterThanOrEqual(1);
      expect(gateCount).toBeLessThanOrEqual(3);
    });
  });

  describe('getEdgeMidpoint', () => {
    it('should calculate the midpoint of a horizontal edge', () => {
      const edge: GordEdge = { from: { x: 0, y: 50 }, to: { x: 100, y: 50 } };
      const midpoint = getEdgeMidpoint(edge);

      expect(midpoint.x).toBe(50);
      expect(midpoint.y).toBe(50);
    });

    it('should calculate the midpoint of a vertical edge', () => {
      const edge: GordEdge = { from: { x: 50, y: 0 }, to: { x: 50, y: 100 } };
      const midpoint = getEdgeMidpoint(edge);

      expect(midpoint.x).toBe(50);
      expect(midpoint.y).toBe(50);
    });
  });

  describe('isEdgeCoveredByWalls', () => {
    it('should return true when a wall is near the edge midpoint', () => {
      const edge: GordEdge = { from: { x: 0, y: 0 }, to: { x: 100, y: 0 } };
      const wall = createMockBuilding(1, BuildingType.Palisade, 50, 10);

      expect(isEdgeCoveredByWalls(edge, [wall], 800, 600)).toBe(true);
    });

    it('should return false when no wall is near the edge', () => {
      const edge: GordEdge = { from: { x: 0, y: 0 }, to: { x: 100, y: 0 } };
      const wall = createMockBuilding(1, BuildingType.Palisade, 500, 500);

      expect(isEdgeCoveredByWalls(edge, [wall], 800, 600)).toBe(false);
    });

    it('should handle walls on both sides of the edge', () => {
      const edge: GordEdge = { from: { x: 50, y: 0 }, to: { x: 50, y: 100 } };
      const wall = createMockBuilding(1, BuildingType.Gate, 50 + GORD_BORDER_COVERAGE_DISTANCE - 5, 50);

      expect(isEdgeCoveredByWalls(edge, [wall], 800, 600)).toBe(true);
    });
  });

  describe('analyzeBorderCoverage', () => {
    it('should calculate correct coverage when no walls exist', () => {
      const gridWidth = 8;
      const gridHeight = 6;
      // 2x2 cluster with 8 border edges
      const cluster = new Set([0, 1, gridWidth, gridWidth + 1]);
      const existingWalls: BuildingEntity[] = [];

      const result = analyzeBorderCoverage(cluster, existingWalls, gridWidth, gridHeight, 800, 600);

      expect(result.totalBorderEdges).toBe(8);
      expect(result.coveredBorderEdges).toBe(0);
      expect(result.coverageRatio).toBe(0);
      expect(result.unsurroundedRatio).toBe(1);
    });

    it('should calculate correct coverage when some walls exist', () => {
      const gridWidth = 8;
      const gridHeight = 6;
      // 2x2 cluster at top-left corner
      const cluster = new Set([0, 1, gridWidth, gridWidth + 1]);

      // Place walls along the top edge (y = 0)
      const existingWalls: BuildingEntity[] = [
        createMockBuilding(1, BuildingType.Palisade, 50, 0), // Covers first edge
        createMockBuilding(2, BuildingType.Palisade, 150, 0), // Covers second edge
      ];

      const result = analyzeBorderCoverage(cluster, existingWalls, gridWidth, gridHeight, 800, 600);

      expect(result.totalBorderEdges).toBe(8);
      expect(result.coveredBorderEdges).toBeGreaterThan(0);
      expect(result.coverageRatio).toBeGreaterThan(0);
    });

    it('should return full coverage for empty cluster', () => {
      const result = analyzeBorderCoverage(new Set(), [], 8, 6, 800, 600);

      expect(result.coverageRatio).toBe(1);
      expect(result.unsurroundedRatio).toBe(0);
    });
  });

  describe('filterUncoveredEdges', () => {
    it('should return all edges when no walls exist', () => {
      const edges: GordEdge[] = [
        { from: { x: 0, y: 0 }, to: { x: 100, y: 0 } },
        { from: { x: 100, y: 0 }, to: { x: 100, y: 100 } },
      ];

      const result = filterUncoveredEdges(edges, [], 800, 600);

      expect(result.length).toBe(2);
    });

    it('should filter out edges that are covered by walls', () => {
      const edges: GordEdge[] = [
        { from: { x: 0, y: 0 }, to: { x: 100, y: 0 } },
        { from: { x: 100, y: 0 }, to: { x: 100, y: 100 } },
      ];
      const wall = createMockBuilding(1, BuildingType.Palisade, 50, 0); // Covers first edge

      const result = filterUncoveredEdges(edges, [wall], 800, 600);

      expect(result.length).toBe(1);
      expect(result[0]).toBe(edges[1]);
    });
  });

  describe('shouldPauseExpansionForPalisades', () => {
    it('should return false for very small territories', () => {
      const gridWidth = 8;
      const gridHeight = 6;
      // Small cluster below minimum threshold
      const cluster = new Set([0, 1]);

      const result = shouldPauseExpansionForPalisades(cluster, [], gridWidth, gridHeight, 800, 600);

      expect(result).toBe(false);
    });

    it('should return true when unsurrounded ratio exceeds threshold', () => {
      const gridWidth = 8;
      const gridHeight = 6;
      // Large enough cluster with no walls
      const cluster = new Set<number>();
      for (let i = 0; i < GORD_MIN_CELLS_FOR_SURROUNDING + 2; i++) {
        cluster.add(i);
      }

      const result = shouldPauseExpansionForPalisades(cluster, [], gridWidth, gridHeight, 800, 600);

      // With no walls, unsurrounded ratio should be 1 (100%), which exceeds threshold
      expect(result).toBe(true);
    });

    it('should return false when territory is well covered', () => {
      const gridWidth = 8;
      const gridHeight = 6;
      // 2x4 cluster at top-left
      const cluster = new Set([0, 1, 2, 3, gridWidth, gridWidth + 1, gridWidth + 2, gridWidth + 3]);

      // Place walls all around
      const walls: BuildingEntity[] = [];
      let wallId = 1;
      // Top edge walls
      for (let x = 50; x < 400; x += 80) {
        walls.push(createMockBuilding(wallId++, BuildingType.Palisade, x, 0));
      }
      // Bottom edge walls
      for (let x = 50; x < 400; x += 80) {
        walls.push(createMockBuilding(wallId++, BuildingType.Palisade, x, 200));
      }
      // Left edge walls
      for (let y = 50; y < 200; y += 80) {
        walls.push(createMockBuilding(wallId++, BuildingType.Palisade, 0, y));
      }
      // Right edge walls
      for (let y = 50; y < 200; y += 80) {
        walls.push(createMockBuilding(wallId++, BuildingType.Palisade, 400, y));
      }

      const result = shouldPauseExpansionForPalisades(cluster, walls, gridWidth, gridHeight, 800, 600);

      // With walls surrounding the cluster, coverage should be high enough to not pause
      expect(result).toBe(false);
    });
  });
});
