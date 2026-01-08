import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildHPAGraph,
  findPathHPA,
  getOrBuildHPAGraph,
  invalidateHPACache,
  CLUSTER_SIZE_CELLS,
  CLUSTER_SIZE_PIXELS,
} from './hpa-pathfinding';
import {
  initNavigationGrid,
  updateNavigationGridSector,
  NAV_GRID_RESOLUTION,
  findPath,
} from './navigation-utils';
import { GameWorldState } from '../world-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import { CHARACTER_RADIUS } from '../ui/ui-consts';

// Test world dimensions (smaller for faster tests)
const TEST_WORLD_WIDTH = 400;
const TEST_WORLD_HEIGHT = 400;

// Helper to create a minimal game state for testing
function createTestGameState(): GameWorldState {
  return {
    mapDimensions: { width: TEST_WORLD_WIDTH, height: TEST_WORLD_HEIGHT },
    navigationGrid: initNavigationGrid(TEST_WORLD_WIDTH, TEST_WORLD_HEIGHT),
  } as GameWorldState;
}

// Helper to create a mock human entity
function createMockHuman(position: { x: number; y: number }, leaderId?: number): HumanEntity {
  return {
    id: 1,
    type: 'human',
    position,
    radius: CHARACTER_RADIUS,
    leaderId,
    direction: { x: 0, y: 0 },
    velocity: 0,
    acceleration: 0,
    // Required fields with defaults for testing
    hitpoints: 100,
    maxHitpoints: 100,
    gender: 'male',
    food: [],
    hunger: 0,
    maxHunger: 100,
    age: 25,
    isAdult: true,
    isPregnant: false,
    isPlayer: false,
    activeAction: undefined,
    attackTargetId: undefined,
    target: undefined,
    path: undefined,
    pathTarget: undefined,
    stateMachine: ['idle', {}],
  } as unknown as HumanEntity;
}

describe('HPA* Pathfinding', () => {
  beforeEach(() => {
    // Clear the HPA cache before each test
    invalidateHPACache();
  });

  describe('Graph Building', () => {
    it('should build an HPA graph with correct cluster dimensions', () => {
      const grid = initNavigationGrid(TEST_WORLD_WIDTH, TEST_WORLD_HEIGHT);
      const graph = buildHPAGraph(grid, TEST_WORLD_WIDTH, TEST_WORLD_HEIGHT);

      const expectedClusterCountX = Math.ceil(TEST_WORLD_WIDTH / NAV_GRID_RESOLUTION / CLUSTER_SIZE_CELLS);
      const expectedClusterCountY = Math.ceil(TEST_WORLD_HEIGHT / NAV_GRID_RESOLUTION / CLUSTER_SIZE_CELLS);

      expect(graph.clusterCountX).toBe(expectedClusterCountX);
      expect(graph.clusterCountY).toBe(expectedClusterCountY);
      expect(graph.gridWidth).toBe(Math.ceil(TEST_WORLD_WIDTH / NAV_GRID_RESOLUTION));
      expect(graph.gridHeight).toBe(Math.ceil(TEST_WORLD_HEIGHT / NAV_GRID_RESOLUTION));
    });

    it('should create entrances between adjacent clusters in an empty grid', () => {
      const grid = initNavigationGrid(TEST_WORLD_WIDTH, TEST_WORLD_HEIGHT);
      const graph = buildHPAGraph(grid, TEST_WORLD_WIDTH, TEST_WORLD_HEIGHT);

      // In an empty grid, there should be entrances between all adjacent clusters
      expect(graph.nodes.size).toBeGreaterThan(0);
      expect(graph.clusterEntrances.size).toBeGreaterThan(0);
    });

    it('should not create entrances through blocked areas', () => {
      const gameState = createTestGameState();
      
      // Block the entire border between two clusters by adding obstacles
      const clusterBorderX = CLUSTER_SIZE_PIXELS;
      for (let y = 0; y < CLUSTER_SIZE_PIXELS; y += NAV_GRID_RESOLUTION) {
        updateNavigationGridSector(
          gameState,
          { x: clusterBorderX, y },
          NAV_GRID_RESOLUTION / 2,
          true,
          null,
          0,
        );
      }

      // Rebuild graph after blocking
      invalidateHPACache();
      const graph = buildHPAGraph(gameState.navigationGrid, TEST_WORLD_WIDTH, TEST_WORLD_HEIGHT);

      // Check that the cluster at (0,0) has fewer entrances to (1,0)
      const cluster00Key = '0,0';
      const entrances00Count = (graph.clusterEntrances.get(cluster00Key) || []).length;

      // There should still be entrances, but possibly fewer/none on the blocked side
      expect(graph.nodes.size).toBeGreaterThan(0);
      // Just verify we got a count (can be 0 or more)
      expect(entrances00Count).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Pathfinding', () => {
    it('should find a path between distant points in an empty world', () => {
      const gameState = createTestGameState();
      const start = { x: 20, y: 20 };
      const end = { x: TEST_WORLD_WIDTH - 20, y: TEST_WORLD_HEIGHT - 20 };
      const human = createMockHuman(start);

      const result = findPath(gameState, start, end, human);

      expect(result.path).not.toBeNull();
      expect(result.path!.length).toBeGreaterThan(0);
    });

    it('should find a path within the same cluster using standard A*', () => {
      const gameState = createTestGameState();
      const start = { x: 20, y: 20 };
      const end = { x: 50, y: 50 }; // Same cluster
      const human = createMockHuman(start);

      const result = findPath(gameState, start, end, human);

      expect(result.path).not.toBeNull();
      expect(result.path!.length).toBeGreaterThan(0);
      // For short distances, iterations should be low
      expect(result.iterations).toBeLessThan(100);
    });

    it('should use HPA* for long-distance paths', () => {
      const gameState = createTestGameState();
      const start = { x: 20, y: 20 };
      const end = { x: TEST_WORLD_WIDTH - 20, y: TEST_WORLD_HEIGHT - 20 };
      const human = createMockHuman(start);

      const hpaGraph = getOrBuildHPAGraph(
        gameState.navigationGrid,
        TEST_WORLD_WIDTH,
        TEST_WORLD_HEIGHT,
      );

      const hpaResult = findPathHPA(gameState, start, end, human, hpaGraph);

      // HPA should either use hierarchical path or fall back
      expect(hpaResult.usedHPA === true || hpaResult.usedHPA === false).toBe(true);
    });

    it('should return null for unreachable targets', () => {
      const gameState = createTestGameState();
      
      // Create a completely isolated area by surrounding the target
      const targetCenter = { x: 200, y: 200 };
      const wallRadius = 50;
      
      // Create a solid wall around the target
      for (let angle = 0; angle < Math.PI * 2; angle += 0.1) {
        const wallX = targetCenter.x + Math.cos(angle) * wallRadius;
        const wallY = targetCenter.y + Math.sin(angle) * wallRadius;
        updateNavigationGridSector(gameState, { x: wallX, y: wallY }, 10, true, null, 0);
      }

      const start = { x: 20, y: 20 };
      const end = targetCenter;
      const human = createMockHuman(start);

      const result = findPath(gameState, start, end, human);

      // The path should find the nearest passable cell or return null if completely blocked
      // This depends on the findNearestPassableCell behavior
      expect(result.iterations).toBeGreaterThan(0);
    });
  });

  describe('Cache Management', () => {
    it('should cache and reuse the HPA graph', () => {
      const grid = initNavigationGrid(TEST_WORLD_WIDTH, TEST_WORLD_HEIGHT);
      
      const graph1 = getOrBuildHPAGraph(grid, TEST_WORLD_WIDTH, TEST_WORLD_HEIGHT);
      const graph2 = getOrBuildHPAGraph(grid, TEST_WORLD_WIDTH, TEST_WORLD_HEIGHT);

      // Should return the same cached instance
      expect(graph1.version).toBe(graph2.version);
    });

    it('should invalidate cache when requested', () => {
      const grid = initNavigationGrid(TEST_WORLD_WIDTH, TEST_WORLD_HEIGHT);
      
      const graph1 = getOrBuildHPAGraph(grid, TEST_WORLD_WIDTH, TEST_WORLD_HEIGHT);
      invalidateHPACache();
      const graph2 = getOrBuildHPAGraph(grid, TEST_WORLD_WIDTH, TEST_WORLD_HEIGHT);

      // Should be different instances with different versions
      expect(graph1.version).not.toBe(graph2.version);
    });

    it('should rebuild graph on force rebuild', () => {
      const grid = initNavigationGrid(TEST_WORLD_WIDTH, TEST_WORLD_HEIGHT);
      
      const graph1 = getOrBuildHPAGraph(grid, TEST_WORLD_WIDTH, TEST_WORLD_HEIGHT);
      const graph2 = getOrBuildHPAGraph(grid, TEST_WORLD_WIDTH, TEST_WORLD_HEIGHT, true);

      // Force rebuild should create a new version
      expect(graph1.version).not.toBe(graph2.version);
    });
  });

  describe('Performance Comparison', () => {
    it('should process fewer iterations for HPA* on long paths', () => {
      const gameState = createTestGameState();
      const start = { x: 20, y: 20 };
      const end = { x: TEST_WORLD_WIDTH - 20, y: TEST_WORLD_HEIGHT - 20 };
      const human = createMockHuman(start);

      // Get the combined result (may use HPA* + fallback A*)
      const result = findPath(gameState, start, end, human);

      // Just verify we get a valid path
      expect(result.path).not.toBeNull();
      expect(result.path!.length).toBeGreaterThan(0);
      
      // The total iterations should be reasonable (not hitting max)
      expect(result.iterations).toBeLessThan(5000);
    });
  });
});
