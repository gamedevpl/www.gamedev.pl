import { describe, it, expect, beforeEach } from 'vitest';
import { createPreyGrazingBehavior } from '../prey-graze-behavior';
import { createMockPrey, createMockIndexedContext, addEntityToContext } from './behavior-test-utils';
import { NodeStatus } from '../../behavior-tree-types';
import { Blackboard } from '../../behavior-tree-blackboard';
import { PREY_INTERACTION_RANGE } from '../../../../animal-consts';
import { BerryBushEntity } from '../../../../entities/plants/berry-bush/berry-bush-types';
import { EntityId } from '../../../../entities/entities-types';

function createMockBerryBush(overrides: Partial<BerryBushEntity> = {}): BerryBushEntity {
  return {
    id: ('bush-' + Math.random()) as EntityId,
    type: 'berryBush',
    position: { x: 500, y: 500 },
    direction: { x: 0, y: 0 },
    food: [
      { type: 'berries', nutritionValue: 10, sourceId: 'bush-1' as EntityId },
      { type: 'berries', nutritionValue: 10, sourceId: 'bush-1' as EntityId },
    ],
    foodGrowthTime: 0,
    ...overrides,
  } as BerryBushEntity;
}

describe('Prey Grazing Behavior', () => {
  let context: ReturnType<typeof createMockIndexedContext>;

  beforeEach(() => {
    context = createMockIndexedContext();
  });

  describe('Condition: Should Graze', () => {
    it('should FAIL when prey is not an adult', () => {
      const prey = createMockPrey({ isAdult: false, position: { x: 500, y: 500 } });
      addEntityToContext(context, prey);
      
      const behavior = createPreyGrazingBehavior(0);
      const status = behavior.execute(prey, context, prey.aiBlackboard!);
      
      expect(status).toBe(NodeStatus.FAILURE);
    });

    it('should FAIL when prey is not hungry (hunger <= 30)', () => {
      const prey = createMockPrey({ hunger: 25, isAdult: true, position: { x: 500, y: 500 } });
      const bush = createMockBerryBush({ position: { x: 500, y: 500 } });
      addEntityToContext(context, bush);
      addEntityToContext(context, prey);
      
      const behavior = createPreyGrazingBehavior(0);
      const status = behavior.execute(prey, context, prey.aiBlackboard!);
      
      expect(status).toBe(NodeStatus.FAILURE);
    });

    it('should FAIL when on eating cooldown', () => {
      const prey = createMockPrey({ 
        hunger: 50, 
        isAdult: true,
        position: { x: 500, y: 500 },
        eatingCooldownTime: context.gameState.time + 10
      });
      const bush = createMockBerryBush({ position: { x: 500, y: 500 } });
      addEntityToContext(context, bush);
      addEntityToContext(context, prey);
      
      const behavior = createPreyGrazingBehavior(0);
      const status = behavior.execute(prey, context, prey.aiBlackboard!);
      
      expect(status).toBe(NodeStatus.FAILURE);
    });

    it('should FAIL when no berry bushes are available', () => {
      const prey = createMockPrey({ hunger: 50, isAdult: true, position: { x: 500, y: 500 } });
      addEntityToContext(context, prey);
      
      const behavior = createPreyGrazingBehavior(0);
      const status = behavior.execute(prey, context, prey.aiBlackboard!);
      
      expect(status).toBe(NodeStatus.FAILURE);
    });

    it('should FAIL when berry bushes have no food', () => {
      const prey = createMockPrey({ hunger: 50, isAdult: true, position: { x: 500, y: 500 } });
      const bush = createMockBerryBush({ 
        position: { x: 500, y: 500 },
        food: [] // No food
      });
      addEntityToContext(context, bush);
      addEntityToContext(context, prey);
      
      const behavior = createPreyGrazingBehavior(0);
      const status = behavior.execute(prey, context, prey.aiBlackboard!);
      
      expect(status).toBe(NodeStatus.FAILURE);
    });

    it('should find berry bush within interaction range', () => {
      const prey = createMockPrey({ 
        position: { x: 500, y: 500 },
        hunger: 50, 
        isAdult: true 
      });
      const bush = createMockBerryBush({ 
        position: { x: 500 + PREY_INTERACTION_RANGE - 1, y: 500 } // Within range
      });
      addEntityToContext(context, bush);
      addEntityToContext(context, prey);
      
      const behavior = createPreyGrazingBehavior(0);
      const status = behavior.execute(prey, context, prey.aiBlackboard!);
      
      expect(status).toBe(NodeStatus.RUNNING);
      expect(Blackboard.get(prey.aiBlackboard!, 'grazingTarget')).toBe(bush.id);
    });

    it('should find berry bush that needs moving to', () => {
      const prey = createMockPrey({ 
        position: { x: 500, y: 500 },
        hunger: 50, 
        isAdult: true 
      });
      const bush = createMockBerryBush({ 
        position: { x: 500 + PREY_INTERACTION_RANGE + 10, y: 500 } // Beyond range
      });
      addEntityToContext(context, bush);
      addEntityToContext(context, prey);
      
      const behavior = createPreyGrazingBehavior(0);
      const status = behavior.execute(prey, context, prey.aiBlackboard!);
      
      expect(status).toBe(NodeStatus.RUNNING);
      expect(Blackboard.get(prey.aiBlackboard!, 'grazingTarget')).toBe(bush.id);
      expect(Blackboard.get(prey.aiBlackboard!, 'needToMoveToTarget')).toBe(true);
    });
  });

  describe('Action: Graze or Move', () => {
    it('should start grazing when within range', () => {
      const prey = createMockPrey({ 
        position: { x: 500, y: 500 },
        hunger: 50, 
        isAdult: true 
      });
      const bush = createMockBerryBush({ 
        position: { x: 500 + PREY_INTERACTION_RANGE - 1, y: 500 }
      });
      addEntityToContext(context, bush);
      addEntityToContext(context, prey);
      
      const behavior = createPreyGrazingBehavior(0);
      behavior.execute(prey, context, prey.aiBlackboard!);
      
      expect(prey.activeAction).toBe('grazing');
      expect(prey.target).toBe(bush.id);
      expect(prey.direction).toEqual({ x: 0, y: 0 });
    });

    it('should move toward bush when out of range', () => {
      const prey = createMockPrey({ 
        position: { x: 500, y: 500 },
        hunger: 50, 
        isAdult: true 
      });
      const bush = createMockBerryBush({ 
        position: { x: 600, y: 500 } // 100 units away
      });
      addEntityToContext(context, bush);
      addEntityToContext(context, prey);
      
      const behavior = createPreyGrazingBehavior(0);
      behavior.execute(prey, context, prey.aiBlackboard!);
      
      expect(prey.activeAction).toBe('moving');
      expect(prey.target).toBe(bush.id);
      expect(prey.direction.x).toBeGreaterThan(0); // Moving right toward bush
    });

    it('should return RUNNING when grazing', () => {
      const prey = createMockPrey({ 
        position: { x: 500, y: 500 },
        hunger: 50, 
        isAdult: true 
      });
      const bush = createMockBerryBush({ 
        position: { x: 500 + PREY_INTERACTION_RANGE - 1, y: 500 }
      });
      addEntityToContext(context, bush);
      addEntityToContext(context, prey);
      
      const behavior = createPreyGrazingBehavior(0);
      const status = behavior.execute(prey, context, prey.aiBlackboard!);
      
      expect(status).toBe(NodeStatus.RUNNING);
    });

    it('should clear needToMoveToTarget when within range', () => {
      const prey = createMockPrey({ 
        position: { x: 500, y: 500 },
        hunger: 50, 
        isAdult: true 
      });
      const bush = createMockBerryBush({ 
        position: { x: 500 + PREY_INTERACTION_RANGE - 1, y: 500 }
      });
      addEntityToContext(context, bush);
      addEntityToContext(context, prey);
      
      // Set the flag initially
      Blackboard.set(prey.aiBlackboard!, 'needToMoveToTarget', true);
      
      const behavior = createPreyGrazingBehavior(0);
      behavior.execute(prey, context, prey.aiBlackboard!);
      
      // Flag should be cleared when within range
      expect(Blackboard.get(prey.aiBlackboard!, 'needToMoveToTarget')).toBeUndefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle hunger exactly at threshold (30)', () => {
      const prey = createMockPrey({ 
        hunger: 30, 
        isAdult: true,
        position: { x: 500, y: 500 }
      });
      const bush = createMockBerryBush();
      addEntityToContext(context, bush);
      addEntityToContext(context, prey);
      
      const behavior = createPreyGrazingBehavior(0);
      const status = behavior.execute(prey, context, prey.aiBlackboard!);
      
      // hunger <= 30 means it should FAIL
      expect(status).toBe(NodeStatus.FAILURE);
    });

    it('should handle hunger just above threshold (31)', () => {
      const prey = createMockPrey({ 
        position: { x: 500, y: 500 },
        hunger: 31, 
        isAdult: true 
      });
      const bush = createMockBerryBush({ 
        position: { x: 500, y: 500 }
      });
      addEntityToContext(context, bush);
      addEntityToContext(context, prey);
      
      const behavior = createPreyGrazingBehavior(0);
      const status = behavior.execute(prey, context, prey.aiBlackboard!);
      
      // hunger > 30 means it should work
      expect(status).toBe(NodeStatus.RUNNING);
    });

    it('should handle cooldown that has just expired', () => {
      const prey = createMockPrey({ 
        position: { x: 500, y: 500 },
        hunger: 50, 
        isAdult: true,
        eatingCooldownTime: context.gameState.time - 1 // Just expired
      });
      const bush = createMockBerryBush({ 
        position: { x: 500, y: 500 }
      });
      addEntityToContext(context, bush);
      addEntityToContext(context, prey);
      
      const behavior = createPreyGrazingBehavior(0);
      const status = behavior.execute(prey, context, prey.aiBlackboard!);
      
      expect(status).toBe(NodeStatus.RUNNING);
    });

    it('should find closest bush when multiple are available', () => {
      const prey = createMockPrey({ 
        position: { x: 500, y: 500 },
        hunger: 50, 
        isAdult: true 
      });
      const nearBush = createMockBerryBush({ 
        position: { x: 510, y: 500 } // 10 units away
      });
      const farBush = createMockBerryBush({ 
        position: { x: 600, y: 500 } // 100 units away
      });
      addEntityToContext(context, nearBush);
      addEntityToContext(context, farBush);
      addEntityToContext(context, prey);
      
      const behavior = createPreyGrazingBehavior(0);
      behavior.execute(prey, context, prey.aiBlackboard!);
      
      // Should target the closer bush
      expect(Blackboard.get(prey.aiBlackboard!, 'grazingTarget')).toBe(nearBush.id);
    });
  });
});
