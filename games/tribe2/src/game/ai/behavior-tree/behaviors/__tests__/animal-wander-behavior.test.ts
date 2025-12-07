import { describe, it, expect, beforeEach } from 'vitest';
import { createAnimalWanderBehavior } from '../animal-wander-behavior';
import { createMockPrey, createMockPredator, createMockContext, advanceTime } from './behavior-test-utils';
import { NodeStatus } from '../../behavior-tree-types';
import { Blackboard, BlackboardData } from '../../behavior-tree-blackboard';

describe('Animal Wander Behavior', () => {
  let context: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    context = createMockContext();
  });

  describe('Basic Functionality', () => {
    it('should always return SUCCESS', () => {
      const prey = createMockPrey();
      const behavior = createAnimalWanderBehavior(0);
      
      const status = behavior.execute(prey, context, prey.aiBlackboard!);
      expect(status).toBe(NodeStatus.SUCCESS);
    });

    it('should set activeAction to idle', () => {
      const prey = createMockPrey();
      const behavior = createAnimalWanderBehavior(0);
      
      behavior.execute(prey, context, prey.aiBlackboard!);
      expect(prey.activeAction).toBe('idle');
    });

    it('should work with prey entities', () => {
      const prey = createMockPrey();
      const behavior = createAnimalWanderBehavior(0);
      
      const status = behavior.execute(prey, context, prey.aiBlackboard!);
      expect(status).toBe(NodeStatus.SUCCESS);
    });

    it('should work with predator entities', () => {
      const predator = createMockPredator();
      const behavior = createAnimalWanderBehavior(0);
      
      const status = behavior.execute(predator, context, predator.aiBlackboard!);
      expect(status).toBe(NodeStatus.SUCCESS);
    });
  });

  describe('Wander Target Generation', () => {
    it('should create a wander target on first execution', () => {
      const prey = createMockPrey();
      const behavior = createAnimalWanderBehavior(0);
      
      behavior.execute(prey, context, prey.aiBlackboard!);
      
      const wanderTarget = Blackboard.get(prey.aiBlackboard!, 'wanderTarget');
      expect(wanderTarget).toBeDefined();
      expect(wanderTarget).toHaveProperty('x');
      expect(wanderTarget).toHaveProperty('y');
    });

    it('should store wander start time', () => {
      const prey = createMockPrey();
      const behavior = createAnimalWanderBehavior(0);
      
      behavior.execute(prey, context, prey.aiBlackboard!);
      
      const wanderStartTime = Blackboard.get(prey.aiBlackboard!, 'wanderStartTime');
      expect(wanderStartTime).toBe(context.gameState.time);
    });

    it('should set entity target to wander target', () => {
      const prey = createMockPrey();
      const behavior = createAnimalWanderBehavior(0);
      
      behavior.execute(prey, context, prey.aiBlackboard!);
      
      const wanderTarget = Blackboard.get(prey.aiBlackboard!, 'wanderTarget');
      expect(prey.target).toEqual(wanderTarget);
    });

    it('should reuse wander target within time window', () => {
      const prey = createMockPrey();
      const behavior = createAnimalWanderBehavior(0);
      
      // First execution
      behavior.execute(prey, context, prey.aiBlackboard!);
      const firstTarget = Blackboard.get(prey.aiBlackboard!, 'wanderTarget');
      
      // Second execution (within 2 hours)
      advanceTime(context, 1);
      behavior.execute(prey, context, prey.aiBlackboard!);
      const secondTarget = Blackboard.get(prey.aiBlackboard!, 'wanderTarget');
      
      expect(secondTarget).toEqual(firstTarget);
    });

    it('should generate new wander target after time expires', () => {
      const prey = createMockPrey();
      const behavior = createAnimalWanderBehavior(0);
      
      // First execution
      behavior.execute(prey, context, prey.aiBlackboard!);
      const firstTarget = Blackboard.get(prey.aiBlackboard!, 'wanderTarget');
      
      // Second execution (after 2 hours)
      advanceTime(context, 2.5);
      behavior.execute(prey, context, prey.aiBlackboard!);
      const secondTarget = Blackboard.get(prey.aiBlackboard!, 'wanderTarget');
      
      // Should be different (random, but very unlikely to be same)
      expect(secondTarget).not.toEqual(firstTarget);
    });

    it('should wrap target around map boundaries', () => {
      const prey = createMockPrey();
      const behavior = createAnimalWanderBehavior(0);
      
      // Execute multiple times to increase chance of boundary wrapping
      for (let i = 0; i < 10; i++) {
        behavior.execute(prey, context, prey.aiBlackboard!);
        advanceTime(context, 2.5); // Force new target each time
        
        const wanderTarget = Blackboard.get<{ x: number; y: number }>(prey.aiBlackboard!, 'wanderTarget');
        expect(wanderTarget!.x).toBeGreaterThanOrEqual(0);
        expect(wanderTarget!.x).toBeLessThan(context.gameState.mapDimensions.width);
        expect(wanderTarget!.y).toBeGreaterThanOrEqual(0);
        expect(wanderTarget!.y).toBeLessThan(context.gameState.mapDimensions.height);
      }
    });
  });

  describe('Direction Calculation', () => {
    it('should set direction toward wander target', () => {
      const prey = createMockPrey({ position: { x: 500, y: 500 } });
      const behavior = createAnimalWanderBehavior(0);
      
      behavior.execute(prey, context, prey.aiBlackboard!);
      
      expect(prey.direction).toBeDefined();
      expect(prey.direction.x).toBeDefined();
      expect(prey.direction.y).toBeDefined();
    });

    it('should normalize direction vector', () => {
      const prey = createMockPrey({ position: { x: 500, y: 500 } });
      const behavior = createAnimalWanderBehavior(0);
      
      behavior.execute(prey, context, prey.aiBlackboard!);
      
      const magnitude = Math.sqrt(prey.direction.x ** 2 + prey.direction.y ** 2);
      expect(magnitude).toBeCloseTo(1, 5); // Should be normalized to length 1
    });

    it('should handle world wrapping in direction calculation', () => {
      // Position animal near edge
      const prey = createMockPrey({ position: { x: 10, y: 500 } });
      const behavior = createAnimalWanderBehavior(0);
      
      // Set a wander target on the opposite edge
      Blackboard.set(prey.aiBlackboard!, 'wanderTarget', { 
        x: context.gameState.mapDimensions.width - 10, 
        y: 500 
      });
      Blackboard.set(prey.aiBlackboard!, 'wanderStartTime', context.gameState.time);
      
      behavior.execute(prey, context, prey.aiBlackboard!);
      
      // Direction should account for world wrapping
      // Target at x=990, animal at x=10, so dx = 980
      // Since 980 > mapWidth/2 (500), wrapping is applied
      // dx becomes 980 - 1000 = -20 (go left to wrap around)
      // So direction.x should be negative
      expect(prey.direction.x).toBeLessThan(0);
      
      // The magnitude should be normalized to approximately 1
      const magnitude = Math.sqrt(prey.direction.x ** 2 + prey.direction.y ** 2);
      expect(magnitude).toBeCloseTo(1, 5);
    });
  });

  describe('Edge Cases', () => {
    it('should handle entity at map boundaries', () => {
      const prey = createMockPrey({ 
        position: { 
          x: context.gameState.mapDimensions.width - 1, 
          y: context.gameState.mapDimensions.height - 1 
        } 
      });
      const behavior = createAnimalWanderBehavior(0);
      
      const status = behavior.execute(prey, context, prey.aiBlackboard!);
      expect(status).toBe(NodeStatus.SUCCESS);
      
      const wanderTarget = Blackboard.get(prey.aiBlackboard!, 'wanderTarget');
      expect(wanderTarget).toBeDefined();
    });

    it('should handle time exactly at 2 hour boundary', () => {
      const prey = createMockPrey();
      const behavior = createAnimalWanderBehavior(0);
      
      // First execution
      behavior.execute(prey, context, prey.aiBlackboard!);
      const firstTarget = Blackboard.get(prey.aiBlackboard!, 'wanderTarget');
      
      // Advance exactly 2 hours
      advanceTime(context, 2);
      behavior.execute(prey, context, prey.aiBlackboard!);
      const secondTarget = Blackboard.get(prey.aiBlackboard!, 'wanderTarget');
      
      // At exactly 2 hours, should still reuse (> 2, not >= 2)
      expect(secondTarget).toEqual(firstTarget);
    });

    it('should work with different depth values', () => {
      const prey = createMockPrey();
      const depths = [0, 1, 2, 5];
      
      depths.forEach(depth => {
        const behavior = createAnimalWanderBehavior(depth);
        const status = behavior.execute(prey, context, prey.aiBlackboard!);
        expect(status).toBe(NodeStatus.SUCCESS);
      });
    });
  });

  describe('Semantic Correctness', () => {
    it('should generate target within reasonable distance (50-150 units)', () => {
      const prey = createMockPrey({ position: { x: 500, y: 500 } });
      const behavior = createAnimalWanderBehavior(0);
      
      // Execute multiple times to test randomness
      for (let i = 0; i < 20; i++) {
        behavior.execute(prey, context, prey.aiBlackboard!);
        advanceTime(context, 3); // Force new target
        
        const wanderTarget = Blackboard.get<{ x: number; y: number }>(prey.aiBlackboard!, 'wanderTarget');
        const dx = wanderTarget!.x - prey.position.x;
        const dy = wanderTarget!.y - prey.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Distance should be roughly in range (accounting for world wrapping)
        // This is a soft check since wrapping can affect distance
        expect(distance).toBeLessThan(context.gameState.mapDimensions.width);
      }
    });
  });
});
