import { describe, it, expect, beforeEach } from 'vitest';
import { createEatingBehavior } from '../eating-behavior';
import { createMockHuman, createMockContext, createMockFoodItem, advanceTime } from './behavior-test-utils';
import { NodeStatus } from '../../behavior-tree-types';
import { Blackboard, BlackboardData } from '../../behavior-tree-blackboard';
import { HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING } from '../../../../ai-consts';

describe('Eating Behavior', () => {
  let human: ReturnType<typeof createMockHuman>;
  let context: ReturnType<typeof createMockContext>;
  let blackboard: BlackboardData;

  beforeEach(() => {
    human = createMockHuman();
    context = createMockContext();
    blackboard = Blackboard.create();
  });

  describe('Condition: Can Eat', () => {
    it('should FAIL when human is not hungry', () => {
      human.hunger = HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING - 10; // Below threshold
      human.food = [createMockFoodItem()];
      
      const behavior = createEatingBehavior(0);
      const status = behavior.execute(human, context, blackboard);
      
      expect(status).toBe(NodeStatus.FAILURE);
    });

    it('should FAIL when human has no food', () => {
      human.hunger = HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING + 10; // Above threshold
      human.food = []; // No food
      
      const behavior = createEatingBehavior(0);
      const status = behavior.execute(human, context, blackboard);
      
      expect(status).toBe(NodeStatus.FAILURE);
    });

    it('should FAIL when eating is on cooldown', () => {
      human.hunger = HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING + 10;
      human.food = [createMockFoodItem()];
      human.eatingCooldownTime = context.gameState.time + 10; // Cooldown not expired
      
      const behavior = createEatingBehavior(0);
      const status = behavior.execute(human, context, blackboard);
      
      expect(status).toBe(NodeStatus.FAILURE);
    });

    it('should pass when hungry, has food, and no cooldown', () => {
      human.hunger = HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING + 10;
      human.food = [createMockFoodItem()];
      
      const behavior = createEatingBehavior(0);
      const status = behavior.execute(human, context, blackboard);
      
      expect(status).toBe(NodeStatus.RUNNING); // Sequence returns RUNNING from action
    });

    it('should pass when cooldown has expired', () => {
      human.hunger = HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING + 10;
      human.food = [createMockFoodItem()];
      human.eatingCooldownTime = context.gameState.time - 1; // Cooldown expired
      
      const behavior = createEatingBehavior(0);
      const status = behavior.execute(human, context, blackboard);
      
      expect(status).toBe(NodeStatus.RUNNING);
    });

    it('should pass when eatingCooldownTime is undefined', () => {
      human.hunger = HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING + 10;
      human.food = [createMockFoodItem()];
      human.eatingCooldownTime = undefined;
      
      const behavior = createEatingBehavior(0);
      const status = behavior.execute(human, context, blackboard);
      
      expect(status).toBe(NodeStatus.RUNNING);
    });
  });

  describe('Action: Eat', () => {
    it('should set activeAction to eating', () => {
      human.hunger = HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING + 10;
      human.food = [createMockFoodItem()];
      
      const behavior = createEatingBehavior(0);
      behavior.execute(human, context, blackboard);
      
      expect(human.activeAction).toBe('eating');
    });

    it('should clear direction', () => {
      human.hunger = HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING + 10;
      human.food = [createMockFoodItem()];
      human.direction = { x: 1, y: 1 };
      
      const behavior = createEatingBehavior(0);
      behavior.execute(human, context, blackboard);
      
      expect(human.direction).toEqual({ x: 0, y: 0 });
    });

    it('should clear target', () => {
      human.hunger = HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING + 10;
      human.food = [createMockFoodItem()];
      human.target = { x: 100, y: 100 };
      
      const behavior = createEatingBehavior(0);
      behavior.execute(human, context, blackboard);
      
      expect(human.target).toBeUndefined();
    });

    it('should return RUNNING status', () => {
      human.hunger = HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING + 10;
      human.food = [createMockFoodItem()];
      
      const behavior = createEatingBehavior(0);
      const status = behavior.execute(human, context, blackboard);
      
      expect(status).toBe(NodeStatus.RUNNING);
    });

    it('should continue returning RUNNING on subsequent ticks while conditions are met', () => {
      human.hunger = HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING + 10;
      human.food = [createMockFoodItem()];
      
      const behavior = createEatingBehavior(0);
      
      // Multiple ticks
      for (let i = 0; i < 5; i++) {
        const status = behavior.execute(human, context, blackboard);
        expect(status).toBe(NodeStatus.RUNNING);
        expect(human.activeAction).toBe('eating');
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle hunger exactly at threshold', () => {
      human.hunger = HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING;
      human.food = [createMockFoodItem()];
      
      const behavior = createEatingBehavior(0);
      const status = behavior.execute(human, context, blackboard);
      
      expect(status).toBe(NodeStatus.RUNNING);
    });

    it('should handle multiple food items', () => {
      human.hunger = HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING + 10;
      human.food = [
        createMockFoodItem(),
        createMockFoodItem(),
        createMockFoodItem(),
      ];
      
      const behavior = createEatingBehavior(0);
      const status = behavior.execute(human, context, blackboard);
      
      expect(status).toBe(NodeStatus.RUNNING);
    });

    it('should FAIL when hunger drops below threshold between ticks', () => {
      human.hunger = HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING + 10;
      human.food = [createMockFoodItem()];
      
      const behavior = createEatingBehavior(0);
      
      // First tick - should work
      let status = behavior.execute(human, context, blackboard);
      expect(status).toBe(NodeStatus.RUNNING);
      
      // Reduce hunger below threshold
      human.hunger = HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING - 10;
      
      // Second tick - should fail
      status = behavior.execute(human, context, blackboard);
      expect(status).toBe(NodeStatus.FAILURE);
    });

    it('should FAIL when food is consumed between ticks', () => {
      human.hunger = HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING + 10;
      human.food = [createMockFoodItem()];
      
      const behavior = createEatingBehavior(0);
      
      // First tick - should work
      let status = behavior.execute(human, context, blackboard);
      expect(status).toBe(NodeStatus.RUNNING);
      
      // Remove food
      human.food = [];
      
      // Second tick - should fail
      status = behavior.execute(human, context, blackboard);
      expect(status).toBe(NodeStatus.FAILURE);
    });

    it('should FAIL when cooldown is set between ticks', () => {
      human.hunger = HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING + 10;
      human.food = [createMockFoodItem()];
      
      const behavior = createEatingBehavior(0);
      
      // First tick - should work
      let status = behavior.execute(human, context, blackboard);
      expect(status).toBe(NodeStatus.RUNNING);
      
      // Set cooldown
      human.eatingCooldownTime = context.gameState.time + 10;
      
      // Second tick - should fail
      status = behavior.execute(human, context, blackboard);
      expect(status).toBe(NodeStatus.FAILURE);
    });
  });

  describe('Semantic Correctness', () => {
    it('should use >= for hunger threshold comparison (inclusive)', () => {
      // Test that exactly at threshold is valid
      human.hunger = HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING;
      human.food = [createMockFoodItem()];
      
      const behavior = createEatingBehavior(0);
      const status = behavior.execute(human, context, blackboard);
      
      expect(status).toBe(NodeStatus.RUNNING);
    });

    it('should use >= for cooldown expiry check (inclusive)', () => {
      human.hunger = HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING + 10;
      human.food = [createMockFoodItem()];
      human.eatingCooldownTime = context.gameState.time; // Exactly at current time
      
      const behavior = createEatingBehavior(0);
      const status = behavior.execute(human, context, blackboard);
      
      expect(status).toBe(NodeStatus.RUNNING);
    });
  });
});
