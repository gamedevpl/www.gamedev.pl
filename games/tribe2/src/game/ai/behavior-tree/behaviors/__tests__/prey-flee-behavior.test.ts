import { describe, it, expect, beforeEach } from 'vitest';
import { createPreyFleeingBehavior } from '../prey-flee-behavior';
import { createMockPrey, createMockPredator, createMockHuman, createMockIndexedContext, addEntityToContext } from './behavior-test-utils';
import { NodeStatus } from '../../behavior-tree-types';
import { Blackboard } from '../../behavior-tree-blackboard';
import { PREY_INTERACTION_RANGE, PREY_FLEE_DISTANCE } from '../../../../animal-consts';
import { EntityId } from '../../../../entities/entities-types';

describe('Prey Fleeing Behavior', () => {
  let context: ReturnType<typeof createMockIndexedContext>;

  beforeEach(() => {
    context = createMockIndexedContext();
  });

  describe('Condition: Should Flee', () => {
    it('should FAIL when no threats are nearby', () => {
      const prey = createMockPrey({ position: { x: 500, y: 500 } });
      addEntityToContext(context, prey);
      
      const behavior = createPreyFleeingBehavior(0);
      const status = behavior.execute(prey, context, prey.aiBlackboard!);
      
      expect(status).toBe(NodeStatus.FAILURE);
    });

    it('should detect predator as threat', () => {
      const prey = createMockPrey({ position: { x: 500, y: 500 } });
      const predator = createMockPredator({ 
        position: { x: 500 + PREY_INTERACTION_RANGE, y: 500 } // Within threat range
      });
      
      addEntityToContext(context, prey);
      addEntityToContext(context, predator);
      
      const behavior = createPreyFleeingBehavior(0);
      const status = behavior.execute(prey, context, prey.aiBlackboard!);
      
      expect(status).toBe(NodeStatus.RUNNING);
      expect(prey.activeAction).toBe('moving');
    });

    it('should detect human as threat', () => {
      const prey = createMockPrey({ position: { x: 500, y: 500 } });
      const human = createMockHuman({ 
        position: { x: 500 + PREY_INTERACTION_RANGE, y: 500 } // Within threat range
      });
      
      addEntityToContext(context, prey);
      addEntityToContext(context, human);
      
      const behavior = createPreyFleeingBehavior(0);
      const status = behavior.execute(prey, context, prey.aiBlackboard!);
      
      expect(status).toBe(NodeStatus.RUNNING);
      expect(prey.activeAction).toBe('moving');
    });

    it('should choose closest threat when multiple are present', () => {
      const prey = createMockPrey({ position: { x: 500, y: 500 } });
      const nearPredator = createMockPredator({ 
        id: 'near-predator' as EntityId,
        position: { x: 510, y: 500 } // 10 units away
      });
      const farPredator = createMockPredator({ 
        id: 'far-predator' as EntityId,
        position: { x: 550, y: 500 } // 50 units away
      });
      
      addEntityToContext(context, prey);
      addEntityToContext(context, nearPredator);
      addEntityToContext(context, farPredator);
      
      const behavior = createPreyFleeingBehavior(0);
      behavior.execute(prey, context, prey.aiBlackboard!);
      
      const fleeThreat = Blackboard.get(prey.aiBlackboard!, 'fleeThreat');
      expect(fleeThreat).toBe(nearPredator.id);
    });

    it('should compare predator and human distance', () => {
      const prey = createMockPrey({ position: { x: 500, y: 500 } });
      const predator = createMockPredator({ 
        id: 'predator' as EntityId,
        position: { x: 550, y: 500 } // 50 units away
      });
      const human = createMockHuman({ 
        id: 'human' as EntityId,
        position: { x: 510, y: 500 } // 10 units away (closer)
      });
      
      addEntityToContext(context, prey);
      addEntityToContext(context, predator);
      addEntityToContext(context, human);
      
      const behavior = createPreyFleeingBehavior(0);
      behavior.execute(prey, context, prey.aiBlackboard!);
      
      const fleeThreat = Blackboard.get(prey.aiBlackboard!, 'fleeThreat');
      expect(fleeThreat).toBe(human.id); // Should flee from closer human
    });

    it('should FAIL when threat is too far away', () => {
      const prey = createMockPrey({ position: { x: 500, y: 500 } });
      const predator = createMockPredator({ 
        position: { x: 500 + PREY_INTERACTION_RANGE * 2, y: 500 } // Too far
      });
      
      addEntityToContext(context, prey);
      addEntityToContext(context, predator);
      
      const behavior = createPreyFleeingBehavior(0);
      const status = behavior.execute(prey, context, prey.aiBlackboard!);
      
      expect(status).toBe(NodeStatus.FAILURE);
    });

    it('should detect threat at exactly 1.5x interaction range', () => {
      const prey = createMockPrey({ position: { x: 500, y: 500 } });
      const predator = createMockPredator({ 
        position: { x: 500 + PREY_INTERACTION_RANGE * 1.5 - 1, y: 500 } // Just within range
      });
      
      addEntityToContext(context, prey);
      addEntityToContext(context, predator);
      
      const behavior = createPreyFleeingBehavior(0);
      const status = behavior.execute(prey, context, prey.aiBlackboard!);
      
      expect(status).toBe(NodeStatus.RUNNING);
    });
  });

  describe('Action: Execute Flee', () => {
    it('should set activeAction to moving', () => {
      const prey = createMockPrey({ position: { x: 500, y: 500 } });
      const predator = createMockPredator({ 
        position: { x: 550, y: 500 }
      });
      
      addEntityToContext(context, prey);
      addEntityToContext(context, predator);
      
      const behavior = createPreyFleeingBehavior(0);
      behavior.execute(prey, context, prey.aiBlackboard!);
      
      expect(prey.activeAction).toBe('moving');
    });

    it('should set flee direction away from threat', () => {
      const prey = createMockPrey({ position: { x: 500, y: 500 } });
      const predator = createMockPredator({ 
        position: { x: 550, y: 500 } // To the right
      });
      
      addEntityToContext(context, prey);
      addEntityToContext(context, predator);
      
      const behavior = createPreyFleeingBehavior(0);
      behavior.execute(prey, context, prey.aiBlackboard!);
      
      // Should flee left (negative x direction)
      expect(prey.direction.x).toBeLessThan(0);
    });

    it('should set target position PREY_FLEE_DISTANCE away', () => {
      const prey = createMockPrey({ position: { x: 500, y: 500 } });
      const predator = createMockPredator({ 
        position: { x: 550, y: 500 }
      });
      
      addEntityToContext(context, prey);
      addEntityToContext(context, predator);
      
      const behavior = createPreyFleeingBehavior(0);
      behavior.execute(prey, context, prey.aiBlackboard!);
      
      expect(prey.target).toBeDefined();
      expect(typeof (prey.target as any).x).toBe('number');
      expect(typeof (prey.target as any).y).toBe('number');
    });

    it('should wrap target position around map boundaries', () => {
      const prey = createMockPrey({ position: { x: 10, y: 500 } });
      const predator = createMockPredator({ 
        position: { x: 60, y: 500 } // To the right, will flee left off map
      });
      
      addEntityToContext(context, prey);
      addEntityToContext(context, predator);
      
      const behavior = createPreyFleeingBehavior(0);
      behavior.execute(prey, context, prey.aiBlackboard!);
      
      const target = prey.target as { x: number; y: number };
      expect(target.x).toBeGreaterThanOrEqual(0);
      expect(target.x).toBeLessThan(context.gameState.mapDimensions.width);
      expect(target.y).toBeGreaterThanOrEqual(0);
      expect(target.y).toBeLessThan(context.gameState.mapDimensions.height);
    });

    it('should set flee cooldown', () => {
      const prey = createMockPrey({ position: { x: 500, y: 500 } });
      const predator = createMockPredator({ 
        position: { x: 550, y: 500 }
      });
      
      addEntityToContext(context, prey);
      addEntityToContext(context, predator);
      
      const behavior = createPreyFleeingBehavior(0);
      behavior.execute(prey, context, prey.aiBlackboard!);
      
      expect(prey.fleeCooldown).toBeDefined();
      expect(prey.fleeCooldown).toBeGreaterThan(context.gameState.time);
    });

    it('should return RUNNING status', () => {
      const prey = createMockPrey({ position: { x: 500, y: 500 } });
      const predator = createMockPredator({ 
        position: { x: 550, y: 500 }
      });
      
      addEntityToContext(context, prey);
      addEntityToContext(context, predator);
      
      const behavior = createPreyFleeingBehavior(0);
      const status = behavior.execute(prey, context, prey.aiBlackboard!);
      
      expect(status).toBe(NodeStatus.RUNNING);
    });

    it('should FAIL if threat disappears between condition and action', () => {
      const prey = createMockPrey({ position: { x: 500, y: 500 } });
      
      // Manually set a non-existent threat
      Blackboard.set(prey.aiBlackboard!, 'fleeThreat', 'nonexistent' as EntityId);
      
      addEntityToContext(context, prey);
      
      const behavior = createPreyFleeingBehavior(0);
      const status = behavior.execute(prey, context, prey.aiBlackboard!);
      
      expect(status).toBe(NodeStatus.FAILURE);
    });
  });

  describe('Direction Calculation', () => {
    it('should flee left from threat on right', () => {
      const prey = createMockPrey({ position: { x: 500, y: 500 } });
      const predator = createMockPredator({ position: { x: 550, y: 500 } });
      
      addEntityToContext(context, prey);
      addEntityToContext(context, predator);
      
      const behavior = createPreyFleeingBehavior(0);
      behavior.execute(prey, context, prey.aiBlackboard!);
      
      expect(prey.direction.x).toBeLessThan(0);
    });

    it('should flee right from threat on left', () => {
      const prey = createMockPrey({ position: { x: 500, y: 500 } });
      const predator = createMockPredator({ position: { x: 450, y: 500 } });
      
      addEntityToContext(context, prey);
      addEntityToContext(context, predator);
      
      const behavior = createPreyFleeingBehavior(0);
      behavior.execute(prey, context, prey.aiBlackboard!);
      
      expect(prey.direction.x).toBeGreaterThan(0);
    });

    it('should flee down from threat above', () => {
      const prey = createMockPrey({ position: { x: 500, y: 500 } });
      const predator = createMockPredator({ position: { x: 500, y: 450 } });
      
      addEntityToContext(context, prey);
      addEntityToContext(context, predator);
      
      const behavior = createPreyFleeingBehavior(0);
      behavior.execute(prey, context, prey.aiBlackboard!);
      
      expect(prey.direction.y).toBeGreaterThan(0);
    });

    it('should normalize flee direction', () => {
      const prey = createMockPrey({ position: { x: 500, y: 500 } });
      const predator = createMockPredator({ position: { x: 550, y: 550 } });
      
      addEntityToContext(context, prey);
      addEntityToContext(context, predator);
      
      const behavior = createPreyFleeingBehavior(0);
      behavior.execute(prey, context, prey.aiBlackboard!);
      
      const magnitude = Math.sqrt(prey.direction.x ** 2 + prey.direction.y ** 2);
      expect(magnitude).toBeCloseTo(1, 5); // Should be normalized
    });
  });

  describe('Blackboard State', () => {
    it('should store fleeThreat in blackboard', () => {
      const prey = createMockPrey({ position: { x: 500, y: 500 } });
      const predator = createMockPredator({ 
        id: 'predator-1' as EntityId,
        position: { x: 550, y: 500 }
      });
      
      addEntityToContext(context, prey);
      addEntityToContext(context, predator);
      
      const behavior = createPreyFleeingBehavior(0);
      behavior.execute(prey, context, prey.aiBlackboard!);
      
      const fleeThreat = Blackboard.get(prey.aiBlackboard!, 'fleeThreat');
      expect(fleeThreat).toBe(predator.id);
    });

    it('should store fleeDistance in blackboard', () => {
      const prey = createMockPrey({ position: { x: 500, y: 500 } });
      const predator = createMockPredator({ 
        position: { x: 550, y: 500 } // 50 units away
      });
      
      addEntityToContext(context, prey);
      addEntityToContext(context, predator);
      
      const behavior = createPreyFleeingBehavior(0);
      behavior.execute(prey, context, prey.aiBlackboard!);
      
      const fleeDistance = Blackboard.get(prey.aiBlackboard!, 'fleeDistance');
      expect(fleeDistance).toBeCloseTo(50, 1);
    });
  });
});
