import { describe, it, expect, beforeEach } from 'vitest';
import { createGatheringBehavior } from '../gathering-behavior';
import { createMockHuman, createMockIndexedContext, addEntityToContext, advanceTime } from './behavior-test-utils';
import { NodeStatus } from '../../behavior-tree-types';
import { Blackboard } from '../../behavior-tree-blackboard';
import { 
  HUMAN_AI_HUNGER_THRESHOLD_FOR_GATHERING,
  BT_GATHERING_SEARCH_COOLDOWN_HOURS 
} from '../../../../ai-consts';
import { HUMAN_INTERACTION_PROXIMITY, CHILD_HUNGER_THRESHOLD_FOR_REQUESTING_FOOD } from '../../../../human-consts';
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

describe('Gathering Behavior', () => {
  let context: ReturnType<typeof createMockIndexedContext>;

  beforeEach(() => {
    context = createMockIndexedContext();
  });

  describe('Condition: Should Gather', () => {
    it('should FAIL when human is not an adult', () => {
      const human = createMockHuman({ 
        isAdult: false,
        hunger: HUMAN_AI_HUNGER_THRESHOLD_FOR_GATHERING + 10,
        food: [],
        maxFood: 10
      });
      addEntityToContext(context, human);
      
      const behavior = createGatheringBehavior(0);
      const status = behavior.execute(human, context, human.aiBlackboard!);
      
      expect(status).toBe(NodeStatus.FAILURE);
    });

    it('should FAIL when human has no capacity (food full)', () => {
      const human = createMockHuman({ 
        isAdult: true,
        hunger: HUMAN_AI_HUNGER_THRESHOLD_FOR_GATHERING + 10,
        food: Array(10).fill({ type: 'berries', nutritionValue: 10, sourceId: 'test' as EntityId }),
        maxFood: 10
      });
      addEntityToContext(context, human);
      
      const behavior = createGatheringBehavior(0);
      const status = behavior.execute(human, context, human.aiBlackboard!);
      
      expect(status).toBe(NodeStatus.FAILURE);
    });

    it('should FAIL when not hungry enough and no hungry children', () => {
      const human = createMockHuman({ 
        isAdult: true,
        hunger: HUMAN_AI_HUNGER_THRESHOLD_FOR_GATHERING - 10, // Below threshold
        food: [],
        maxFood: 10
      });
      addEntityToContext(context, human);
      
      const behavior = createGatheringBehavior(0);
      const status = behavior.execute(human, context, human.aiBlackboard!);
      
      expect(status).toBe(NodeStatus.FAILURE);
    });

    it('should pass when hungry enough and has capacity', () => {
      const human = createMockHuman({ 
        isAdult: true,
        hunger: HUMAN_AI_HUNGER_THRESHOLD_FOR_GATHERING + 10,
        food: [],
        maxFood: 10,
        position: { x: 500, y: 500 }
      });
      const bush = createMockBerryBush({ position: { x: 510, y: 500 } });
      addEntityToContext(context, human);
      addEntityToContext(context, bush);
      
      const behavior = createGatheringBehavior(0);
      const status = behavior.execute(human, context, human.aiBlackboard!);
      
      // Should find food and move toward it
      expect(status).not.toBe(NodeStatus.FAILURE);
    });
  });

  describe('Finding Food Source', () => {
    it('should find closest berry bush with food', () => {
      const human = createMockHuman({ 
        isAdult: true,
        hunger: HUMAN_AI_HUNGER_THRESHOLD_FOR_GATHERING + 10,
        food: [],
        maxFood: 10,
        position: { x: 500, y: 500 }
      });
      const nearBush = createMockBerryBush({ position: { x: 600, y: 500 } }); // Far enough to not gather immediately
      const farBush = createMockBerryBush({ position: { x: 700, y: 500 } });
      
      addEntityToContext(context, human);
      addEntityToContext(context, nearBush);
      addEntityToContext(context, farBush);
      
      const behavior = createGatheringBehavior(0);
      const status = behavior.execute(human, context, human.aiBlackboard!);
      
      // Should be moving toward the nearer bush
      expect(status).toBe(NodeStatus.RUNNING);
      expect(human.target).toBe(nearBush.id);
    });

    it('should skip bushes with no food', () => {
      const human = createMockHuman({ 
        isAdult: true,
        hunger: HUMAN_AI_HUNGER_THRESHOLD_FOR_GATHERING + 10,
        food: [],
        maxFood: 10,
        position: { x: 500, y: 500 }
      });
      const emptyBush = createMockBerryBush({ position: { x: 510, y: 500 }, food: [] });
      const foodBush = createMockBerryBush({ position: { x: 600, y: 500 } });
      
      addEntityToContext(context, human);
      addEntityToContext(context, emptyBush);
      addEntityToContext(context, foodBush);
      
      const behavior = createGatheringBehavior(0);
      const status = behavior.execute(human, context, human.aiBlackboard!);
      
      // Should move toward the bush with food, not the empty one
      expect(status).toBe(NodeStatus.RUNNING);
      expect(human.target).toBe(foodBush.id);
    });

    it('should FAIL when no food sources are available', () => {
      const human = createMockHuman({ 
        isAdult: true,
        hunger: HUMAN_AI_HUNGER_THRESHOLD_FOR_GATHERING + 10,
        food: [],
        maxFood: 10,
        position: { x: 500, y: 500 }
      });
      addEntityToContext(context, human);
      
      const behavior = createGatheringBehavior(0);
      const status = behavior.execute(human, context, human.aiBlackboard!);
      
      expect(status).toBe(NodeStatus.FAILURE);
    });
  });

  describe('Moving and Gathering', () => {
    it('should move toward food source when far away', () => {
      const human = createMockHuman({ 
        isAdult: true,
        hunger: HUMAN_AI_HUNGER_THRESHOLD_FOR_GATHERING + 10,
        food: [],
        maxFood: 10,
        position: { x: 500, y: 500 }
      });
      const bush = createMockBerryBush({ position: { x: 600, y: 500 } }); // 100 units away
      
      addEntityToContext(context, human);
      addEntityToContext(context, bush);
      
      const behavior = createGatheringBehavior(0);
      const status = behavior.execute(human, context, human.aiBlackboard!);
      
      expect(status).toBe(NodeStatus.RUNNING);
      expect(human.activeAction).toBe('moving');
      expect(human.target).toBe(bush.id);
      expect(human.direction.x).toBeGreaterThan(0); // Moving right toward bush
    });

    it('should start gathering when close enough', () => {
      const human = createMockHuman({ 
        isAdult: true,
        hunger: HUMAN_AI_HUNGER_THRESHOLD_FOR_GATHERING + 10,
        food: [],
        maxFood: 10,
        position: { x: 500, y: 500 }
      });
      const bush = createMockBerryBush({ 
        position: { x: 500 + HUMAN_INTERACTION_PROXIMITY - 1, y: 500 } 
      });
      
      addEntityToContext(context, human);
      addEntityToContext(context, bush);
      
      const behavior = createGatheringBehavior(0);
      const status = behavior.execute(human, context, human.aiBlackboard!);
      
      expect(status).toBe(NodeStatus.SUCCESS);
      expect(human.activeAction).toBe('gathering');
      expect(human.target).toBe(bush.id);
      expect(human.direction).toEqual({ x: 0, y: 0 });
    });

    it('should clear foodSource from blackboard when gathering starts', () => {
      const human = createMockHuman({ 
        isAdult: true,
        hunger: HUMAN_AI_HUNGER_THRESHOLD_FOR_GATHERING + 10,
        food: [],
        maxFood: 10,
        position: { x: 500, y: 500 }
      });
      const bush = createMockBerryBush({ 
        position: { x: 500 + HUMAN_INTERACTION_PROXIMITY - 1, y: 500 } 
      });
      
      addEntityToContext(context, human);
      addEntityToContext(context, bush);
      
      const behavior = createGatheringBehavior(0);
      behavior.execute(human, context, human.aiBlackboard!);
      
      // foodSource should be cleared after gathering starts
      expect(Blackboard.get(human.aiBlackboard!, 'foodSource')).toBeUndefined();
    });
  });

  describe('Caching Behavior', () => {
    it('should cache food source search for cooldown period', () => {
      const human = createMockHuman({ 
        isAdult: true,
        hunger: HUMAN_AI_HUNGER_THRESHOLD_FOR_GATHERING + 10,
        food: [],
        maxFood: 10,
        position: { x: 500, y: 500 }
      });
      const bush = createMockBerryBush({ position: { x: 600, y: 500 } });
      
      addEntityToContext(context, human);
      addEntityToContext(context, bush);
      
      const behavior = createGatheringBehavior(0);
      
      // First execution - should find food and start moving
      const status1 = behavior.execute(human, context, human.aiBlackboard!);
      const target1 = human.target;
      
      expect(status1).toBe(NodeStatus.RUNNING);
      expect(target1).toBe(bush.id);
      
      // Move human away from bush to prevent gathering
      human.position = { x: 300, y: 300 };
      
      // Second execution immediately after (within cache period) - should continue with same target
      advanceTime(context, BT_GATHERING_SEARCH_COOLDOWN_HOURS - 1);
      const status2 = behavior.execute(human, context, human.aiBlackboard!);
      const target2 = human.target;
      
      expect(status2).toBe(NodeStatus.RUNNING);
      expect(target2).toBe(bush.id); // Should still target same bush
    });
  });

  describe('Edge Cases', () => {
    it('should handle exactly at hunger threshold', () => {
      const human = createMockHuman({ 
        isAdult: true,
        hunger: HUMAN_AI_HUNGER_THRESHOLD_FOR_GATHERING, // Exactly at threshold
        food: [],
        maxFood: 10,
        position: { x: 500, y: 500 }
      });
      const bush = createMockBerryBush({ position: { x: 510, y: 500 } });
      
      addEntityToContext(context, human);
      addEntityToContext(context, bush);
      
      const behavior = createGatheringBehavior(0);
      const status = behavior.execute(human, context, human.aiBlackboard!);
      
      // hunger > threshold means exactly at threshold should FAIL
      expect(status).toBe(NodeStatus.FAILURE);
    });

    it('should handle exactly one slot available', () => {
      const human = createMockHuman({ 
        isAdult: true,
        hunger: HUMAN_AI_HUNGER_THRESHOLD_FOR_GATHERING + 10,
        food: Array(9).fill({ type: 'berries', nutritionValue: 10, sourceId: 'test' as EntityId }),
        maxFood: 10,
        position: { x: 500, y: 500 }
      });
      const bush = createMockBerryBush({ position: { x: 600, y: 500 } }); // Far enough to move
      
      addEntityToContext(context, human);
      addEntityToContext(context, bush);
      
      const behavior = createGatheringBehavior(0);
      const status = behavior.execute(human, context, human.aiBlackboard!);
      
      // Should still gather with one slot available
      expect(status).toBe(NodeStatus.RUNNING);
      expect(human.target).toBe(bush.id);
    });

    it('should FAIL if food source disappears', () => {
      const human = createMockHuman({ 
        isAdult: true,
        hunger: HUMAN_AI_HUNGER_THRESHOLD_FOR_GATHERING + 10,
        food: [],
        maxFood: 10,
        position: { x: 500, y: 500 }
      });
      
      addEntityToContext(context, human);
      
      // Manually set a non-existent food source
      Blackboard.set(human.aiBlackboard!, 'foodSource', 'nonexistent' as EntityId);
      
      const behavior = createGatheringBehavior(0);
      const status = behavior.execute(human, context, human.aiBlackboard!);
      
      // Should fail and clear the blackboard
      expect(status).toBe(NodeStatus.FAILURE);
      expect(Blackboard.get(human.aiBlackboard!, 'foodSource')).toBeUndefined();
    });
  });
});
