import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Blackboard } from '../behavior-tree-blackboard';
import { NodeStatus } from '../behavior-tree-types';
import { HumanEntity } from '../../../entities/characters/human/human-types';
import { GameWorldState, UpdateContext } from '../../../world-types';
import { createEstablishFamilyTerritoryBehavior } from './establish-family-territory-behavior';
import { ADULT_MALE_FAMILY_DISTANCE_RADIUS } from '../../../ai-consts';

// --- Mocks ---

// Mock the utils module
vi.mock('../../../utils', () => ({
  findChildren: vi.fn(() => []),
  findHeir: vi.fn(() => null),
  findPlayerEntity: vi.fn(() => null),
  getRandomNearbyPosition: vi.fn(() => ({ x: 1000, y: 1000 })),
}));

// Suppress the BT profiler and recording
vi.mock('../bt-profiler', () => ({
  btProfiler: {
    nodeStart: vi.fn(),
    nodeEnd: vi.fn(),
  },
}));

describe('Establish Family Territory Behavior', () => {
  let mockHuman: HumanEntity;
  let mockFather: HumanEntity;
  let mockContext: UpdateContext;

  // Helper to get the blackboard - always use entity's aiBlackboard
  const getBlackboard = () => mockHuman.aiBlackboard!;

  beforeEach(() => {
    // Create the blackboard first
    const blackboard = Blackboard.create();

    // Create mock father
    mockFather = {
      id: 'father-1',
      type: 'human',
      position: { x: 100, y: 100 },
      isAdult: true,
      gender: 'male',
      direction: { x: 0, y: 0 },
      speed: 1,
      hunger: 0,
      maxHunger: 150,
      hitpoints: 100,
      maxHitpoints: 100,
      food: [],
      maxFood: 5,
      radius: 10,
      birthTime: 0,
      ancestorIds: [],
      age: 20,
      maxAge: 80,
      acceleration: 0,
      forces: [],
      velocity: { x: 0, y: 0 },
      debuffs: [],
    } as unknown as HumanEntity;

    // Create mock human (adult male with family, close to father)
    mockHuman = {
      id: 'human-1',
      type: 'human',
      position: { x: 150, y: 150 }, // Close to father (within 600 radius)
      isAdult: true,
      gender: 'male',
      partnerIds: ['partner-1'], // Has a partner, so has a family
      fatherId: 'father-1',
      direction: { x: 0, y: 0 },
      speed: 1,
      hunger: 0,
      maxHunger: 150,
      hitpoints: 100,
      maxHitpoints: 100,
      food: [],
      maxFood: 5,
      radius: 10,
      birthTime: 0,
      ancestorIds: [],
      age: 20,
      maxAge: 80,
      acceleration: 0,
      forces: [],
      velocity: { x: 0, y: 0 },
      debuffs: [],
      aiBlackboard: blackboard, // Use the blackboard we created
    } as unknown as HumanEntity;

    mockContext = {
      deltaTime: 1,
      gameState: {
        time: 0,
        entities: {
          entities: {
            'father-1': mockFather,
            'human-1': mockHuman,
          },
        },
        mapDimensions: {
          width: 4000,
          height: 4000,
        },
      } as unknown as GameWorldState,
    } as UpdateContext;
  });

  describe('isTooCloseToParentsOrMovingToTerritory condition', () => {
    it('should return SUCCESS when human is too close to father and start moving', () => {
      const behavior = createEstablishFamilyTerritoryBehavior(0);

      // First tick: human is close to father, should start moving
      const status = behavior.execute(mockHuman, mockContext, getBlackboard());

      expect(status).toBe(NodeStatus.RUNNING);
      expect(mockHuman.activeAction).toBe('moving');
      expect(Blackboard.get(getBlackboard(), 'territoryMoveTarget')).toBeDefined();
    });

    it('should continue moving even when human is far from father (BUG FIX TEST)', () => {
      const behavior = createEstablishFamilyTerritoryBehavior(0);

      // First tick: human is close to father, starts moving
      let status = behavior.execute(mockHuman, mockContext, getBlackboard());
      expect(status).toBe(NodeStatus.RUNNING);

      // Simulate human moving far away from father (beyond the 600 threshold)
      // This is the scenario that caused the original bug
      mockHuman.position = { x: 800, y: 800 };

      // Calculate distance to verify we're beyond the threshold
      const distanceFromFather = Math.sqrt(
        Math.pow(mockHuman.position.x - mockFather.position.x, 2) +
          Math.pow(mockHuman.position.y - mockFather.position.y, 2),
      );
      expect(distanceFromFather).toBeGreaterThan(ADULT_MALE_FAMILY_DISTANCE_RADIUS);

      // Advance time
      mockContext.gameState.time += 1;

      // Second tick: The BUG was that the sequence would abort because
      // isTooCloseToParents would return false. With the fix, it should
      // continue because territoryMoveTarget is set.
      status = behavior.execute(mockHuman, mockContext, getBlackboard());

      // The behavior should still be RUNNING (continuing to move),
      // NOT failing/aborting
      expect(status).toBe(NodeStatus.RUNNING);
      expect(mockHuman.activeAction).toBe('moving');
    });

    it('should complete successfully when human arrives at territory', () => {
      const behavior = createEstablishFamilyTerritoryBehavior(0);

      // First tick: start moving
      behavior.execute(mockHuman, mockContext, getBlackboard());

      // Get the target position
      const target = Blackboard.get<{ x: number; y: number }>(getBlackboard(), 'territoryMoveTarget');
      expect(target).toBeDefined();

      // Move human to the target position (arrival)
      mockHuman.position = { x: target!.x, y: target!.y };
      mockContext.gameState.time += 1;

      // Second tick: should detect arrival and succeed
      const status = behavior.execute(mockHuman, mockContext, getBlackboard());

      expect(status).toBe(NodeStatus.SUCCESS);
      // Blackboard should be cleaned up
      expect(Blackboard.get(getBlackboard(), 'territoryMoveTarget')).toBeUndefined();
    });

    it('should NOT try to establish territory if already far from father', () => {
      const behavior = createEstablishFamilyTerritoryBehavior(0);

      // Place human far from father from the start
      mockHuman.position = { x: 1000, y: 1000 };

      // First tick: should fail because human is already far from father
      const status = behavior.execute(mockHuman, mockContext, getBlackboard());

      // The behavior should fail (return FAILURE) because the human doesn't need
      // to establish a new territory
      expect(status).toBe(NodeStatus.FAILURE);
      expect(Blackboard.get(getBlackboard(), 'territoryMoveTarget')).toBeUndefined();
    });
  });

  describe('Sequence re-evaluation bug scenario', () => {
    it('should NOT abort mid-move when preceding condition becomes false (the original bug)', () => {
      const behavior = createEstablishFamilyTerritoryBehavior(0);

      // Tick 1: Human close to father, behavior starts
      let status = behavior.execute(mockHuman, mockContext, getBlackboard());
      expect(status).toBe(NodeStatus.RUNNING);
      expect(Blackboard.get(getBlackboard(), 'territoryMoveTarget')).toBeDefined();

      // Simulate multiple ticks where human progressively moves away
      for (let i = 0; i < 5; i++) {
        // Human moves further from father each tick
        mockHuman.position.x += 200;
        mockHuman.position.y += 200;
        mockContext.gameState.time += 1;

        status = behavior.execute(mockHuman, mockContext, getBlackboard());

        // The key assertion: behavior should stay RUNNING, not fail
        // because the sequence re-evaluates isTooCloseToParents which
        // would now return false if the fix wasn't in place
        expect(status).toBe(NodeStatus.RUNNING);
      }

      // Verify the target is still set (not cleared by an abort)
      expect(Blackboard.get(getBlackboard(), 'territoryMoveTarget')).toBeDefined();
      expect(mockHuman.activeAction).toBe('moving');
    });
  });
});
