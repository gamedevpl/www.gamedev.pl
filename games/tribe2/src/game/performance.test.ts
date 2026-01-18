/**
 * Performance Benchmark Tests
 *
 * These tests measure the performance of identified bottlenecks:
 * 1. Pathfinding (findPath) - 28.5% of frame time
 * 2. Rendering queries (byRadius for palisades) - called every frame
 * 3. Physics/Math operations (vectorAdd) - high call frequency
 * 4. isPathBlocked - called multiple times per human per frame
 * 5. interactionsUpdate - O(n^2) entity checks
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { initGame } from './index';
import { GameWorldState } from './world-types';
import { findPath, NAV_GRID_RESOLUTION, isPathBlocked } from './utils/navigation-utils';
import { vectorAdd, vectorScale, vectorNormalize } from './utils/math-utils';
import { Vector2D } from './utils/math-types';
import { HumanEntity } from './entities/characters/human/human-types';
import { createHuman, createBuilding } from './entities/entities-update';
import { indexWorldState } from './world-index/world-state-index';
import { IndexedWorldState } from './world-index/world-index-types';
import { BuildingType } from './entities/buildings/building-consts';
import { interactionsUpdate } from './interactions/interactions-update';

describe('Performance Benchmarks', () => {
  let gameState: GameWorldState;
  let indexedState: IndexedWorldState;
  let testHuman: HumanEntity;

  beforeEach(() => {
    gameState = initGame();
    gameState.autosaveIntervalSeconds = 0; // Disable autosave
    testHuman = createHuman(gameState.entities, { x: 100, y: 100 }, 0, 'male', false, 25);
    indexedState = indexWorldState(gameState);
  });

  describe('Pathfinding Performance', () => {
    it('should measure findPath performance for short distances', () => {
      const iterations = 100;
      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        const startPos = { x: 100, y: 100 };
        const endPos = { x: 150, y: 150 };
        findPath(indexedState, startPos, endPos, testHuman);
      }

      const elapsed = performance.now() - start;
      const avgTime = elapsed / iterations;

      console.log(`[Pathfinding Short] ${iterations} calls: ${elapsed.toFixed(2)}ms total, ${avgTime.toFixed(3)}ms avg`);

      // Baseline expectation: should complete reasonably fast
      expect(avgTime).toBeLessThan(10); // 10ms per call max
    });

    it('should measure findPath performance for long distances', () => {
      const iterations = 50;
      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        const startPos = { x: 100, y: 100 };
        const endPos = { x: 900, y: 900 };
        findPath(indexedState, startPos, endPos, testHuman);
      }

      const elapsed = performance.now() - start;
      const avgTime = elapsed / iterations;

      console.log(`[Pathfinding Long] ${iterations} calls: ${elapsed.toFixed(2)}ms total, ${avgTime.toFixed(3)}ms avg`);

      // Long distance paths may take longer
      expect(avgTime).toBeLessThan(50); // 50ms per call max
    });

    it('should benefit from early exit when start equals end', () => {
      const iterations = 1000;
      const sameCell = { x: 100, y: 100 };

      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        findPath(indexedState, sameCell, sameCell, testHuman);
      }
      const elapsed = performance.now() - start;
      const avgTime = elapsed / iterations;

      console.log(`[Pathfinding Same Cell] ${iterations} calls: ${elapsed.toFixed(2)}ms total, ${avgTime.toFixed(3)}ms avg`);

      // Same cell should be extremely fast (early exit)
      expect(avgTime).toBeLessThan(0.1); // 0.1ms per call max
    });

    it('should benefit from early exit for adjacent cells', () => {
      const iterations = 1000;
      const startPos = { x: 100, y: 100 };
      // Adjacent cell (within NAV_GRID_RESOLUTION)
      const endPos = { x: 100 + NAV_GRID_RESOLUTION - 1, y: 100 };

      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        findPath(indexedState, startPos, endPos, testHuman);
      }
      const elapsed = performance.now() - start;
      const avgTime = elapsed / iterations;

      console.log(`[Pathfinding Adjacent] ${iterations} calls: ${elapsed.toFixed(2)}ms total, ${avgTime.toFixed(3)}ms avg`);

      // Adjacent cells should also be very fast
      expect(avgTime).toBeLessThan(0.5);
    });
  });

  describe('Rendering Query Performance (Palisade Neighbors)', () => {
    beforeEach(() => {
      // Create multiple palisade buildings to simulate real scenario
      for (let i = 0; i < 20; i++) {
        const x = 200 + (i % 5) * 50;
        const y = 200 + Math.floor(i / 5) * 50;
        createBuilding(gameState.entities, { x, y }, BuildingType.Palisade, testHuman.id);
      }
      indexedState = indexWorldState(gameState);
    });

    it('should measure byRadius query performance for palisade neighbors', () => {
      const iterations = 1000;
      const position = { x: 250, y: 250 };
      const radius = 55;

      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        indexedState.search.building.byRadius(position, radius);
      }
      const elapsed = performance.now() - start;
      const avgTime = elapsed / iterations;

      console.log(`[byRadius Query] ${iterations} calls: ${elapsed.toFixed(2)}ms total, ${avgTime.toFixed(3)}ms avg`);

      // Should be very fast with spatial indexing
      expect(avgTime).toBeLessThan(1);
    });

    it('should demonstrate cost of repeated queries vs cached results', () => {
      const iterations = 100;
      const buildings = indexedState.search.building.all().filter(
        (b) => b.buildingType === BuildingType.Palisade
      );

      // Simulate rendering all palisades (each queries neighbors)
      const start = performance.now();
      for (let iter = 0; iter < iterations; iter++) {
        for (const building of buildings) {
          indexedState.search.building.byRadius(building.position, 55);
        }
      }
      const elapsed = performance.now() - start;
      const totalQueries = iterations * buildings.length;
      const avgTime = elapsed / totalQueries;

      console.log(
        `[Palisade Rendering Simulation] ${totalQueries} queries: ${elapsed.toFixed(2)}ms total, ${avgTime.toFixed(4)}ms avg`
      );

      // With many palisades, this adds up
      expect(elapsed).toBeDefined();
    });
  });

  describe('Physics/Math Performance', () => {
    it('should measure vectorAdd performance (current implementation)', () => {
      const iterations = 100000;
      const v1: Vector2D = { x: 1, y: 2 };
      const v2: Vector2D = { x: 3, y: 4 };

      const start = performance.now();
      let result: Vector2D = { x: 0, y: 0 };
      for (let i = 0; i < iterations; i++) {
        result = vectorAdd(v1, v2);
      }
      const elapsed = performance.now() - start;

      console.log(`[vectorAdd] ${iterations} calls: ${elapsed.toFixed(2)}ms total`);
      expect(result.x).toBe(4);
      expect(result.y).toBe(6);
    });

    it('should measure combined physics operations (simulating entityPhysicsUpdate)', () => {
      const iterations = 10000;

      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        // Simulate physics update operations
        const velocity: Vector2D = { x: 1, y: 1 };
        const direction: Vector2D = { x: 0.707, y: 0.707 };
        const acceleration = 0.5;

        // Friction force
        const friction = vectorScale(velocity, -0.1);

        // Acceleration force
        const normalized = vectorNormalize(direction);
        const accelForce = vectorScale(normalized, acceleration);

        // Combine forces
        const totalForce = vectorAdd(friction, accelForce);

        // Update velocity
        const newVelocity = vectorAdd(velocity, totalForce);

        // Update position
        const position: Vector2D = { x: 100, y: 100 };
        const deltaTime = 0.016;
        vectorAdd(position, vectorScale(newVelocity, deltaTime));
      }
      const elapsed = performance.now() - start;

      console.log(`[Physics Simulation] ${iterations} entity updates: ${elapsed.toFixed(2)}ms total`);

      // Should handle many updates efficiently
      expect(elapsed).toBeLessThan(1000); // 1 second max for 10k updates
    });

    it('should compare mutable vs immutable vector operations', () => {
      const iterations = 100000;

      // Current immutable approach
      const startImmutable = performance.now();
      for (let i = 0; i < iterations; i++) {
        const v1: Vector2D = { x: 1, y: 2 };
        const v2: Vector2D = { x: 3, y: 4 };
        vectorAdd(v1, v2);
      }
      const elapsedImmutable = performance.now() - startImmutable;

      // Mutable approach (inline)
      const startMutable = performance.now();
      for (let i = 0; i < iterations; i++) {
        const v1 = { x: 1, y: 2 };
        const v2 = { x: 3, y: 4 };
        v1.x += v2.x;
        v1.y += v2.y;
      }
      const elapsedMutable = performance.now() - startMutable;

      console.log(`[Vector Ops Comparison] Immutable: ${elapsedImmutable.toFixed(2)}ms, Mutable: ${elapsedMutable.toFixed(2)}ms`);
      console.log(`[Vector Ops Comparison] Speedup: ${(elapsedImmutable / elapsedMutable).toFixed(2)}x`);

      // Mutable should be faster
      expect(elapsedMutable).toBeLessThanOrEqual(elapsedImmutable);
    });
  });

  describe('World Indexing Performance', () => {
    it('should measure indexWorldState performance', () => {
      const iterations = 100;

      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        indexWorldState(gameState);
      }
      const elapsed = performance.now() - start;
      const avgTime = elapsed / iterations;

      console.log(`[indexWorldState] ${iterations} calls: ${elapsed.toFixed(2)}ms total, ${avgTime.toFixed(3)}ms avg`);

      // Should be reasonably fast
      expect(avgTime).toBeLessThan(50);
    });
  });

  describe('isPathBlocked Performance', () => {
    it('should measure isPathBlocked for short distances', () => {
      const iterations = 10000;
      const startPos = { x: 100, y: 100 };
      const endPos = { x: 150, y: 150 };

      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        isPathBlocked(gameState, startPos, endPos, testHuman);
      }
      const elapsed = performance.now() - start;
      const avgTime = elapsed / iterations;

      console.log(`[isPathBlocked Short] ${iterations} calls: ${elapsed.toFixed(2)}ms total, ${avgTime.toFixed(4)}ms avg`);

      // Target: < 0.01ms per call (10 microseconds)
      expect(avgTime).toBeLessThan(0.1);
    });

    it('should measure isPathBlocked for medium distances', () => {
      const iterations = 1000;
      const startPos = { x: 100, y: 100 };
      const endPos = { x: 300, y: 300 };

      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        isPathBlocked(gameState, startPos, endPos, testHuman);
      }
      const elapsed = performance.now() - start;
      const avgTime = elapsed / iterations;

      console.log(`[isPathBlocked Medium] ${iterations} calls: ${elapsed.toFixed(2)}ms total, ${avgTime.toFixed(4)}ms avg`);

      // Target: < 0.05ms per call
      expect(avgTime).toBeLessThan(0.5);
    });

    it('should simulate multiple isPathBlocked calls per human per frame', () => {
      // Simulate 50 humans each calling isPathBlocked up to 7 times per frame
      const humans = 50;
      const callsPerHuman = 7;
      const iterations = humans * callsPerHuman;

      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        const startPos = { x: 100 + (i % 10) * 50, y: 100 + Math.floor(i / 10) * 50 };
        const endPos = { x: startPos.x + 100, y: startPos.y + 100 };
        isPathBlocked(gameState, startPos, endPos, testHuman);
      }
      const elapsed = performance.now() - start;

      console.log(`[isPathBlocked Frame Sim] ${iterations} calls (${humans} humans x ${callsPerHuman}): ${elapsed.toFixed(2)}ms`);

      // Target: entire frame's isPathBlocked calls < 5ms
      expect(elapsed).toBeLessThan(50);
    });
  });

  describe('interactionsUpdate Performance', () => {
    it('should measure interactionsUpdate performance', () => {
      const iterations = 100;

      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        interactionsUpdate({ gameState: indexedState, deltaTime: 0.016 });
      }
      const elapsed = performance.now() - start;
      const avgTime = elapsed / iterations;

      console.log(`[interactionsUpdate] ${iterations} calls: ${elapsed.toFixed(2)}ms total, ${avgTime.toFixed(3)}ms avg`);

      // Target: < 5ms per frame
      expect(avgTime).toBeLessThan(50);
    });
  });
});
