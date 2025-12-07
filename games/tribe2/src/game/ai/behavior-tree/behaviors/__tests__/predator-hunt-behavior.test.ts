import { describe, it, expect, beforeEach } from 'vitest';
import { createPredatorHuntBehavior } from '../predator-hunt-behavior';
import { createMockPredator, createMockPrey, createMockIndexedContext, addEntityToContext } from './behavior-test-utils';
import { NodeStatus } from '../../behavior-tree-types';
import { Blackboard } from '../../behavior-tree-blackboard';
import { PREDATOR_HUNT_RANGE } from '../../../../animal-consts';
import { EntityId } from '../../../../entities/entities-types';

describe('Predator Hunt Behavior', () => {
  let context: ReturnType<typeof createMockIndexedContext>;

  beforeEach(() => {
    context = createMockIndexedContext();
  });

  describe('Condition: Should Hunt', () => {
    it('should FAIL when predator is not an adult', () => {
      const predator = createMockPredator({ 
        isAdult: false,
        hunger: 60
      });
      addEntityToContext(context, predator);
      
      const behavior = createPredatorHuntBehavior(0);
      const status = behavior.execute(predator, context, predator.aiBlackboard!);
      
      expect(status).toBe(NodeStatus.FAILURE);
    });

    it('should FAIL when not hungry enough (hunger <= 50)', () => {
      const predator = createMockPredator({ 
        isAdult: true,
        hunger: 40,
        position: { x: 500, y: 500 }
      });
      const prey = createMockPrey({ position: { x: 510, y: 500 } });
      
      addEntityToContext(context, predator);
      addEntityToContext(context, prey);
      
      const behavior = createPredatorHuntBehavior(0);
      const status = behavior.execute(predator, context, predator.aiBlackboard!);
      
      expect(status).toBe(NodeStatus.FAILURE);
    });

    it('should FAIL when on hunt cooldown', () => {
      const predator = createMockPredator({ 
        isAdult: true,
        hunger: 60,
        huntCooldown: 5, // Still on cooldown
        position: { x: 500, y: 500 }
      });
      const prey = createMockPrey({ position: { x: 510, y: 500 } });
      
      addEntityToContext(context, predator);
      addEntityToContext(context, prey);
      
      const behavior = createPredatorHuntBehavior(0);
      const status = behavior.execute(predator, context, predator.aiBlackboard!);
      
      expect(status).toBe(NodeStatus.FAILURE);
    });

    it('should FAIL when no prey are nearby', () => {
      const predator = createMockPredator({ 
        isAdult: true,
        hunger: 60,
        position: { x: 500, y: 500 }
      });
      addEntityToContext(context, predator);
      
      const behavior = createPredatorHuntBehavior(0);
      const status = behavior.execute(predator, context, predator.aiBlackboard!);
      
      expect(status).toBe(NodeStatus.FAILURE);
    });

    it('should find prey within hunting range', () => {
      const predator = createMockPredator({ 
        isAdult: true,
        hunger: 60,
        position: { x: 500, y: 500 }
      });
      const prey = createMockPrey({ 
        position: { x: 500 + PREDATOR_HUNT_RANGE - 10, y: 500 },
        hitpoints: 100
      });
      
      addEntityToContext(context, predator);
      addEntityToContext(context, prey);
      
      const behavior = createPredatorHuntBehavior(0);
      const status = behavior.execute(predator, context, predator.aiBlackboard!);
      
      expect(status).toBe(NodeStatus.RUNNING);
      expect(predator.activeAction).toBe('attacking');
    });

    it('should find prey beyond hunting range but approach it', () => {
      const predator = createMockPredator({ 
        isAdult: true,
        hunger: 60,
        position: { x: 500, y: 500 }
      });
      const prey = createMockPrey({ 
        position: { x: 500 + PREDATOR_HUNT_RANGE + 50, y: 500 },
        hitpoints: 100
      });
      
      addEntityToContext(context, predator);
      addEntityToContext(context, prey);
      
      const behavior = createPredatorHuntBehavior(0);
      const status = behavior.execute(predator, context, predator.aiBlackboard!);
      
      expect(status).toBe(NodeStatus.RUNNING);
      expect(predator.activeAction).toBe('moving');
      expect(Blackboard.get(predator.aiBlackboard!, 'needToApproach')).toBe(true);
    });

    it('should skip dead prey', () => {
      const predator = createMockPredator({ 
        isAdult: true,
        hunger: 60,
        position: { x: 500, y: 500 }
      });
      const deadPrey = createMockPrey({ 
        position: { x: 510, y: 500 },
        hitpoints: 0 // Dead
      });
      const alivePrey = createMockPrey({ 
        position: { x: 520, y: 500 },
        hitpoints: 100
      });
      
      addEntityToContext(context, predator);
      addEntityToContext(context, deadPrey);
      addEntityToContext(context, alivePrey);
      
      const behavior = createPredatorHuntBehavior(0);
      behavior.execute(predator, context, predator.aiBlackboard!);
      
      // Should target the alive prey, not the dead one
      const huntTarget = Blackboard.get(predator.aiBlackboard!, 'huntTarget');
      expect(huntTarget).toBe(alivePrey.id);
    });

    it('should target closest prey when multiple available', () => {
      const predator = createMockPredator({ 
        isAdult: true,
        hunger: 60,
        position: { x: 500, y: 500 }
      });
      const nearPrey = createMockPrey({ 
        id: 'near' as EntityId,
        position: { x: 510, y: 500 },
        hitpoints: 100
      });
      const farPrey = createMockPrey({ 
        id: 'far' as EntityId,
        position: { x: 600, y: 500 },
        hitpoints: 100
      });
      
      addEntityToContext(context, predator);
      addEntityToContext(context, nearPrey);
      addEntityToContext(context, farPrey);
      
      const behavior = createPredatorHuntBehavior(0);
      behavior.execute(predator, context, predator.aiBlackboard!);
      
      const huntTarget = Blackboard.get(predator.aiBlackboard!, 'huntTarget');
      expect(huntTarget).toBe(nearPrey.id);
    });
  });

  describe('Action: Hunt', () => {
    it('should start attacking when within range', () => {
      const predator = createMockPredator({ 
        isAdult: true,
        hunger: 60,
        position: { x: 500, y: 500 }
      });
      const prey = createMockPrey({ 
        id: 'prey-1' as EntityId,
        position: { x: 500 + PREDATOR_HUNT_RANGE - 10, y: 500 },
        hitpoints: 100
      });
      
      addEntityToContext(context, predator);
      addEntityToContext(context, prey);
      
      const behavior = createPredatorHuntBehavior(0);
      behavior.execute(predator, context, predator.aiBlackboard!);
      
      expect(predator.activeAction).toBe('attacking');
      expect(predator.attackTargetId).toBe(prey.id);
      expect(predator.target).toBe(prey.id);
      expect(predator.direction).toEqual({ x: 0, y: 0 });
    });

    it('should move toward prey when out of range', () => {
      const predator = createMockPredator({ 
        isAdult: true,
        hunger: 60,
        position: { x: 500, y: 500 }
      });
      const prey = createMockPrey({ 
        id: 'prey-1' as EntityId,
        position: { x: 600, y: 500 },
        hitpoints: 100
      });
      
      addEntityToContext(context, predator);
      addEntityToContext(context, prey);
      
      const behavior = createPredatorHuntBehavior(0);
      behavior.execute(predator, context, predator.aiBlackboard!);
      
      expect(predator.activeAction).toBe('moving');
      expect(predator.target).toBe(prey.id);
      expect(predator.direction.x).toBeGreaterThan(0); // Moving toward prey
    });

    it('should clear needToApproach when within attack range', () => {
      const predator = createMockPredator({ 
        isAdult: true,
        hunger: 60,
        position: { x: 500, y: 500 }
      });
      const prey = createMockPrey({ 
        position: { x: 500 + PREDATOR_HUNT_RANGE - 10, y: 500 },
        hitpoints: 100
      });
      
      // Set the flag initially
      Blackboard.set(predator.aiBlackboard!, 'needToApproach', true);
      
      addEntityToContext(context, predator);
      addEntityToContext(context, prey);
      
      const behavior = createPredatorHuntBehavior(0);
      behavior.execute(predator, context, predator.aiBlackboard!);
      
      expect(Blackboard.get(predator.aiBlackboard!, 'needToApproach')).toBeUndefined();
    });

    it('should FAIL if prey dies before attack', () => {
      const predator = createMockPredator({ 
        isAdult: true,
        hunger: 60,
        position: { x: 500, y: 500 }
      });
      const prey = createMockPrey({ 
        id: 'prey-1' as EntityId,
        position: { x: 510, y: 500 },
        hitpoints: 0 // Dead
      });
      
      Blackboard.set(predator.aiBlackboard!, 'huntTarget', prey.id);
      
      addEntityToContext(context, predator);
      addEntityToContext(context, prey);
      
      const behavior = createPredatorHuntBehavior(0);
      const status = behavior.execute(predator, context, predator.aiBlackboard!);
      
      expect(status).toBe(NodeStatus.FAILURE);
    });

    it('should FAIL if prey disappears', () => {
      const predator = createMockPredator({ 
        isAdult: true,
        hunger: 60,
        position: { x: 500, y: 500 }
      });
      
      Blackboard.set(predator.aiBlackboard!, 'huntTarget', 'nonexistent' as EntityId);
      
      addEntityToContext(context, predator);
      
      const behavior = createPredatorHuntBehavior(0);
      const status = behavior.execute(predator, context, predator.aiBlackboard!);
      
      expect(status).toBe(NodeStatus.FAILURE);
    });
  });

  describe('Edge Cases', () => {
    it('should handle hunger exactly at threshold (50)', () => {
      const predator = createMockPredator({ 
        isAdult: true,
        hunger: 50, // Exactly at threshold
        position: { x: 500, y: 500 }
      });
      const prey = createMockPrey({ position: { x: 510, y: 500 } });
      
      addEntityToContext(context, predator);
      addEntityToContext(context, prey);
      
      const behavior = createPredatorHuntBehavior(0);
      const status = behavior.execute(predator, context, predator.aiBlackboard!);
      
      // hunger <= 50 means exactly 50 should FAIL
      expect(status).toBe(NodeStatus.FAILURE);
    });

    it('should handle hunger just above threshold (51)', () => {
      const predator = createMockPredator({ 
        isAdult: true,
        hunger: 51,
        position: { x: 500, y: 500 }
      });
      const prey = createMockPrey({ 
        position: { x: 510, y: 500 },
        hitpoints: 100
      });
      
      addEntityToContext(context, predator);
      addEntityToContext(context, prey);
      
      const behavior = createPredatorHuntBehavior(0);
      const status = behavior.execute(predator, context, predator.aiBlackboard!);
      
      // Should hunt
      expect(status).toBe(NodeStatus.RUNNING);
    });

    it('should handle prey exactly at hunt range', () => {
      const predator = createMockPredator({ 
        isAdult: true,
        hunger: 60,
        position: { x: 500, y: 500 }
      });
      const prey = createMockPrey({ 
        position: { x: 500 + PREDATOR_HUNT_RANGE, y: 500 },
        hitpoints: 100
      });
      
      addEntityToContext(context, predator);
      addEntityToContext(context, prey);
      
      const behavior = createPredatorHuntBehavior(0);
      const status = behavior.execute(predator, context, predator.aiBlackboard!);
      
      // Should attack at exactly the hunt range
      expect(status).toBe(NodeStatus.RUNNING);
    });

    it('should handle hunt cooldown of 0', () => {
      const predator = createMockPredator({ 
        isAdult: true,
        hunger: 60,
        huntCooldown: 0, // Cooldown expired
        position: { x: 500, y: 500 }
      });
      const prey = createMockPrey({ 
        position: { x: 510, y: 500 },
        hitpoints: 100
      });
      
      addEntityToContext(context, predator);
      addEntityToContext(context, prey);
      
      const behavior = createPredatorHuntBehavior(0);
      const status = behavior.execute(predator, context, predator.aiBlackboard!);
      
      // Should be able to hunt
      expect(status).toBe(NodeStatus.RUNNING);
    });
  });

  describe('Direction Calculation', () => {
    it('should calculate direction toward prey', () => {
      const predator = createMockPredator({ 
        isAdult: true,
        hunger: 60,
        position: { x: 500, y: 500 }
      });
      const prey = createMockPrey({ 
        position: { x: 600, y: 500 },
        hitpoints: 100
      });
      
      addEntityToContext(context, predator);
      addEntityToContext(context, prey);
      
      const behavior = createPredatorHuntBehavior(0);
      behavior.execute(predator, context, predator.aiBlackboard!);
      
      // Should move right toward prey
      expect(predator.direction.x).toBeGreaterThan(0);
    });

    it('should normalize direction vector', () => {
      const predator = createMockPredator({ 
        isAdult: true,
        hunger: 60,
        position: { x: 500, y: 500 }
      });
      const prey = createMockPrey({ 
        position: { x: 600, y: 600 },
        hitpoints: 100
      });
      
      addEntityToContext(context, predator);
      addEntityToContext(context, prey);
      
      const behavior = createPredatorHuntBehavior(0);
      behavior.execute(predator, context, predator.aiBlackboard!);
      
      const magnitude = Math.sqrt(predator.direction.x ** 2 + predator.direction.y ** 2);
      expect(magnitude).toBeCloseTo(1, 5);
    });
  });
});
