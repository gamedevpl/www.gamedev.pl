import { describe, it, expect, beforeEach } from 'vitest';
import { createFleeingBehavior } from '../fleeing-behavior';
import { createMockHuman, createMockContext, addEntityToContext } from './behavior-test-utils';
import { NodeStatus } from '../../behavior-tree-types';
import { Blackboard, BlackboardData } from '../../behavior-tree-blackboard';
import { AI_ATTACK_HUNGER_THRESHOLD, AI_FLEE_HEALTH_THRESHOLD } from '../../../../ai-consts';
import { EntityId } from '../../../../entities/entities-types';

describe('Fleeing Behavior', () => {
  let human: ReturnType<typeof createMockHuman>;
  let context: ReturnType<typeof createMockContext>;
  let blackboard: BlackboardData;

  beforeEach(() => {
    human = createMockHuman();
    context = createMockContext();
    blackboard = Blackboard.create();
  });

  describe('Condition: Should Flee', () => {
    it('should FAIL when human is healthy and adult', () => {
      human.isAdult = true;
      human.hitpoints = human.maxHitpoints; // Full health
      
      const behavior = createFleeingBehavior(0);
      const status = behavior.execute(human, context, blackboard);
      
      expect(status).toBe(NodeStatus.FAILURE);
    });

    it('should FAIL when health is above flee threshold and no threat present', () => {
      human.isAdult = true;
      human.hitpoints = human.maxHitpoints * (AI_FLEE_HEALTH_THRESHOLD + 0.1);
      
      const behavior = createFleeingBehavior(0);
      const status = behavior.execute(human, context, blackboard);
      
      expect(status).toBe(NodeStatus.FAILURE);
    });

    it('should check for flee when health is below threshold', () => {
      human.isAdult = true;
      human.hitpoints = human.maxHitpoints * (AI_FLEE_HEALTH_THRESHOLD - 0.1);
      
      // No aggressor present
      const behavior = createFleeingBehavior(0);
      const status = behavior.execute(human, context, blackboard);
      
      // Should still FAIL because no threat
      expect(status).toBe(NodeStatus.FAILURE);
    });

    it('should flee when low health and threat is present', () => {
      human.isAdult = true;
      human.hitpoints = human.maxHitpoints * (AI_FLEE_HEALTH_THRESHOLD - 0.1);
      
      // Create an aggressor
      const aggressor = createMockHuman({ id: 'aggressor' as EntityId });
      aggressor.attackTargetId = human.id;
      addEntityToContext(context, aggressor);
      addEntityToContext(context, human);
      
      const behavior = createFleeingBehavior(0);
      const status = behavior.execute(human, context, blackboard);
      
      expect(status).toBe(NodeStatus.RUNNING);
    });

    it('should NOT flee when critically hungry (unless critically low health)', () => {
      human.isAdult = true;
      human.hitpoints = human.maxHitpoints * (AI_FLEE_HEALTH_THRESHOLD - 0.1);
      human.hunger = AI_ATTACK_HUNGER_THRESHOLD + 10; // Very hungry
      
      // Create an aggressor
      const aggressor = createMockHuman({ id: 'aggressor' as EntityId });
      aggressor.attackTargetId = human.id;
      addEntityToContext(context, aggressor);
      addEntityToContext(context, human);
      
      const behavior = createFleeingBehavior(0);
      const status = behavior.execute(human, context, blackboard);
      
      // Should FAIL - too hungry to flee
      expect(status).toBe(NodeStatus.FAILURE);
    });

    it('should flee even when hungry if health is critical (< 10%)', () => {
      human.isAdult = true;
      human.hitpoints = human.maxHitpoints * 0.05; // 5% health - critical
      human.hunger = AI_ATTACK_HUNGER_THRESHOLD + 10; // Very hungry
      
      // Create an aggressor
      const aggressor = createMockHuman({ id: 'aggressor' as EntityId });
      aggressor.attackTargetId = human.id;
      addEntityToContext(context, aggressor);
      addEntityToContext(context, human);
      
      const behavior = createFleeingBehavior(0);
      const status = behavior.execute(human, context, blackboard);
      
      // Should RUNNING - critical health overrides hunger
      expect(status).toBe(NodeStatus.RUNNING);
    });

    it('should work for non-adult humans', () => {
      human.isAdult = false;
      human.hitpoints = human.maxHitpoints * 0.5; // 50% health
      
      // Create an aggressor
      const aggressor = createMockHuman({ id: 'aggressor' as EntityId });
      aggressor.attackTargetId = human.id;
      addEntityToContext(context, aggressor);
      addEntityToContext(context, human);
      
      const behavior = createFleeingBehavior(0);
      const status = behavior.execute(human, context, blackboard);
      
      expect(status).toBe(NodeStatus.RUNNING);
    });
  });

  describe('Action: Execute Flee', () => {
    let aggressor: ReturnType<typeof createMockHuman>;

    beforeEach(() => {
      human.isAdult = true;
      human.hitpoints = human.maxHitpoints * 0.3; // Low health
      
      aggressor = createMockHuman({ 
        id: 'aggressor' as EntityId,
        position: { x: 600, y: 500 } // 100 units to the right
      });
      aggressor.attackTargetId = human.id;
      
      addEntityToContext(context, aggressor);
      addEntityToContext(context, human);
    });

    it('should set activeAction to moving', () => {
      const behavior = createFleeingBehavior(0);
      behavior.execute(human, context, blackboard);
      
      expect(human.activeAction).toBe('moving');
    });

    it('should set a target position away from threat', () => {
      const behavior = createFleeingBehavior(0);
      behavior.execute(human, context, blackboard);
      
      expect(human.target).toBeDefined();
      expect(typeof (human.target as any).x).toBe('number');
      expect(typeof (human.target as any).y).toBe('number');
    });

    it('should set direction away from threat', () => {
      const behavior = createFleeingBehavior(0);
      behavior.execute(human, context, blackboard);
      
      expect(human.direction).toBeDefined();
      // Direction should be pointing left (away from aggressor on right)
      expect(human.direction.x).toBeLessThan(0);
    });

    it('should store threat in blackboard', () => {
      const behavior = createFleeingBehavior(0);
      behavior.execute(human, context, blackboard);
      
      const fleeThreat = Blackboard.get(blackboard, 'fleeThreat');
      expect(fleeThreat).toBe(aggressor.id);
    });

    it('should return RUNNING status', () => {
      const behavior = createFleeingBehavior(0);
      const status = behavior.execute(human, context, blackboard);
      
      expect(status).toBe(NodeStatus.RUNNING);
    });

    it('should wrap target position around map boundaries', () => {
      // Position human near edge
      human.position = { x: 10, y: 500 };
      aggressor.position = { x: 110, y: 500 }; // Aggressor to the right
      
      const behavior = createFleeingBehavior(0);
      behavior.execute(human, context, blackboard);
      
      const target = human.target as { x: number; y: number };
      expect(target.x).toBeGreaterThanOrEqual(0);
      expect(target.x).toBeLessThan(context.gameState.mapDimensions.width);
      expect(target.y).toBeGreaterThanOrEqual(0);
      expect(target.y).toBeLessThan(context.gameState.mapDimensions.height);
    });

    it('should handle threat at different positions', () => {
      const positions = [
        { x: 400, y: 500 }, // Left
        { x: 600, y: 500 }, // Right
        { x: 500, y: 400 }, // Above
        { x: 500, y: 600 }, // Below
      ];

      positions.forEach(pos => {
        const testHuman = createMockHuman();
        testHuman.isAdult = true;
        testHuman.hitpoints = testHuman.maxHitpoints * 0.3;
        
        const testAggressor = createMockHuman({ 
          id: 'aggressor' as EntityId,
          position: pos
        });
        testAggressor.attackTargetId = testHuman.id;
        
        const testContext = createMockContext();
        addEntityToContext(testContext, testAggressor);
        addEntityToContext(testContext, testHuman);
        
        const testBlackboard = Blackboard.create();
        const behavior = createFleeingBehavior(0);
        const status = behavior.execute(testHuman, testContext, testBlackboard);
        
        expect(status).toBe(NodeStatus.RUNNING);
        expect(testHuman.target).toBeDefined();
      });
    });
  });

  describe('Edge Cases', () => {
    it('should FAIL if threat disappears between condition and action', () => {
      human.isAdult = true;
      human.hitpoints = human.maxHitpoints * 0.3;
      
      // Initially no aggressor
      addEntityToContext(context, human);
      
      const behavior = createFleeingBehavior(0);
      const status = behavior.execute(human, context, blackboard);
      
      expect(status).toBe(NodeStatus.FAILURE);
    });

    it('should handle exactly 10% health (critical threshold)', () => {
      human.isAdult = true;
      human.hitpoints = human.maxHitpoints * 0.1; // Exactly 10%
      human.hunger = AI_ATTACK_HUNGER_THRESHOLD + 10;
      
      const aggressor = createMockHuman({ id: 'aggressor' as EntityId });
      aggressor.attackTargetId = human.id;
      addEntityToContext(context, aggressor);
      addEntityToContext(context, human);
      
      const behavior = createFleeingBehavior(0);
      const status = behavior.execute(human, context, blackboard);
      
      // At exactly 10%, should NOT flee due to hunger (< 10% is critical)
      expect(status).toBe(NodeStatus.FAILURE);
    });

    it('should handle exactly at flee health threshold', () => {
      human.isAdult = true;
      human.hitpoints = human.maxHitpoints * AI_FLEE_HEALTH_THRESHOLD;
      
      const aggressor = createMockHuman({ id: 'aggressor' as EntityId });
      aggressor.attackTargetId = human.id;
      addEntityToContext(context, aggressor);
      addEntityToContext(context, human);
      
      const behavior = createFleeingBehavior(0);
      const status = behavior.execute(human, context, blackboard);
      
      // Should NOT flee (needs to be below threshold)
      expect(status).toBe(NodeStatus.FAILURE);
    });
  });

  describe('Potential Bugs', () => {
    it('BUG CHECK: Verify flee condition uses correct comparison operators', () => {
      // This test verifies the logic:
      // - Health check: human.hitpoints > human.maxHitpoints * threshold (should NOT flee if above)
      // - Critical health: human.hitpoints < human.maxHitpoints * 0.1 (should flee if below)
      
      // Test 1: Just above threshold - should NOT flee (no aggressor needed)
      const human1 = createMockHuman();
      human1.isAdult = true;
      human1.hitpoints = human1.maxHitpoints * (AI_FLEE_HEALTH_THRESHOLD + 0.01);
      
      const context1 = createMockContext();
      const blackboard1 = Blackboard.create();
      const behavior1 = createFleeingBehavior(0);
      
      expect(behavior1.execute(human1, context1, blackboard1)).toBe(NodeStatus.FAILURE);
      
      // Test 2: Just below critical - should flee from hunger despite low health
      const human2 = createMockHuman();
      human2.isAdult = true;
      human2.hitpoints = human2.maxHitpoints * 0.11; // Just above critical
      human2.hunger = AI_ATTACK_HUNGER_THRESHOLD + 10;
      
      const aggressor = createMockHuman({ id: 'aggressor' as EntityId });
      aggressor.attackTargetId = human2.id;
      
      const context2 = createMockContext();
      addEntityToContext(context2, aggressor);
      addEntityToContext(context2, human2);
      
      const blackboard2 = Blackboard.create();
      const behavior2 = createFleeingBehavior(0);
      
      expect(behavior2.execute(human2, context2, blackboard2)).toBe(NodeStatus.FAILURE);
    });
  });
});
